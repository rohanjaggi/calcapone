import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateUserSettings = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/item", () => ({
  createItem: vi.fn(),
  listItems: vi.fn(),
  updateItem: vi.fn(),
  OPEN_STATUSES: ["pending", "in_progress"],
}));
vi.mock("@/lib/services/category", () => ({ listCategories: vi.fn(), createCategory: vi.fn() }));
vi.mock("@/lib/services/calendar", () => ({ createEvent: vi.fn(), getEvents: vi.fn() }));
vi.mock("@/lib/services/user", () => ({ updateUserSettings: mockUpdateUserSettings }));

import { handleDone, handleToday, handleList, handleTimezone } from "@/lib/services/commands/handlers";
import type { CommandContext } from "@/lib/services/commands";
import { listItems, updateItem } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";

const mockListItems = vi.mocked(listItems);
const mockUpdateItem = vi.mocked(updateItem);
const mockGetEvents = vi.mocked(getEvents);

const ctx: CommandContext = {
  userId: "u1",
  user: {
    telegramUsername: "testuser",
    timezone: "Asia/Singapore",
    googleRefreshToken: null,
    googleCalendarId: null,
  },
};

describe("handleDone", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeItem = (id: string, title: string) => ({
    id,
    title,
    userId: "u1",
    categoryId: "c1",
    description: null,
    status: "pending" as const,
    priority: "medium" as const,
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: "none" as const,
    recurrenceRule: null,
    recurrenceEnd: null,
    googleEventId: null,
    parentId: null,
    subtasks: [],
    notificationStage: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: "c1", name: "General", userId: "u1", color: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  });

  it("returns usage hint when body is empty", async () => {
    const result = await handleDone("", ctx);
    expect(result).toContain("Usage");
    expect(mockListItems).not.toHaveBeenCalled();
  });

  it("completes a matching item by fuzzy title", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy groceries"), makeItem("i2", "Call dentist")]);
    mockUpdateItem.mockResolvedValue(makeItem("i1", "Buy groceries") as never);

    const result = await handleDone("groceries", ctx);

    expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { status: "done" });
    expect(result).toContain("Buy groceries");
    expect(result).toContain("Completed");
  });

  it("returns not-found message when no match", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy groceries")]);

    const result = await handleDone("dentist", ctx);

    expect(result).toContain("dentist");
    expect(result).toContain("No open task");
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });
});

describe("handleToday", () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

  const makeItem = (overrides: Partial<{
    id: string;
    title: string;
    dueDate: string | null;
    remindAt: Date | null;
    dueTime: string | null;
  }>) => ({
    id: "i1",
    title: "Test task",
    userId: "u1",
    categoryId: "c1",
    description: null,
    status: "pending" as const,
    priority: "medium" as const,
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: "none" as const,
    recurrenceRule: null,
    recurrenceEnd: null,
    googleEventId: null,
    parentId: null,
    subtasks: [],
    notificationStage: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: "c1", name: "General", userId: "u1", color: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    ...overrides,
  });

  it("shows tasks due today", async () => {
    mockListItems.mockResolvedValue([
      makeItem({ id: "i1", title: "Morning standup", dueDate: todayStr, remindAt: null }),
    ]);

    const result = await handleToday(ctx);

    expect(result).toContain("Morning standup");
    expect(result).toContain("Today");
  });

  it("shows empty message when nothing scheduled", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleToday(ctx);

    expect(result).toBe("Nothing scheduled for today!");
  });

  it("includes Google Calendar events when connected", async () => {
    const ctxWithGcal: CommandContext = {
      ...ctx,
      user: { ...ctx.user, googleRefreshToken: "enc-token", googleCalendarId: "primary" },
    };
    mockListItems.mockResolvedValue([]);
    mockGetEvents.mockResolvedValue([
      { id: "e1", title: "Team sync <Q3>", startTime: "2026-06-11T10:00:00+08:00", endTime: "2026-06-11T10:30:00+08:00", description: null, allDay: false, transparency: "opaque" },
      { id: "e2", title: "Public holiday", startTime: "2026-06-12", endTime: "2026-06-13", description: null, allDay: true, transparency: "transparent" },
    ]);

    const result = await handleToday(ctxWithGcal);

    expect(mockGetEvents).toHaveBeenCalledWith(
      "enc-token",
      "primary",
      expect.any(Date),
      expect.any(Date),
      "Asia/Singapore"
    );
    expect(result).toContain("10:00 — Team sync &lt;Q3&gt;");
    expect(result).toContain("2026-06-12 (all day) — Public holiday");
    expect(result).toContain("<b>Next up</b>");
  });

  it("shows overdue section for items with dueDate before today", async () => {
    mockListItems.mockResolvedValue([
      makeItem({ id: "i1", title: "Submit invoice", dueDate: "2026-05-01", remindAt: null }),
    ]);

    const result = await handleToday(ctx);

    expect(result).toContain("Overdue");
    expect(result).toContain("Submit invoice");
  });

  it("shows today section for items due today", async () => {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
    mockListItems.mockResolvedValue([
      makeItem({ id: "i2", title: "Team standup", dueDate: todayStr, dueTime: "10:00", remindAt: null }),
    ]);

    const result = await handleToday(ctx);

    expect(result).toContain("Today");
    expect(result).toContain("Team standup");
    expect(result).not.toContain("Overdue");
  });

  it("separates overdue from today items", async () => {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
    mockListItems.mockResolvedValue([
      makeItem({ id: "i1", title: "Submit invoice", dueDate: "2026-05-01", remindAt: null }),
      makeItem({ id: "i2", title: "Team standup", dueDate: todayStr, remindAt: null }),
    ]);

    const result = await handleToday(ctx);

    const overduePos = result.indexOf("Overdue");
    const todayPos = result.indexOf("Today");
    expect(overduePos).toBeLessThan(todayPos);
    expect(result).toContain("Submit invoice");
    expect(result).toContain("Team standup");
  });
});

describe("handleList", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeItem = (id: string, title: string, remindAt: Date | null = null, dueDate: string | null = null) => ({
    id,
    title,
    userId: "u1",
    categoryId: "c1",
    description: null,
    status: "pending" as const,
    priority: "medium" as const,
    dueDate,
    dueTime: null,
    remindAt,
    recurring: "none" as const,
    recurrenceRule: null,
    recurrenceEnd: null,
    googleEventId: null,
    parentId: null,
    subtasks: [],
    notificationStage: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: "c1", name: "General", userId: "u1", color: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  });

  it("lists pending items by default", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Write tests")]);

    const result = await handleList("", ctx);

    expect(mockListItems).toHaveBeenCalledWith("u1", { status: ["pending", "in_progress"] });
    expect(result).toContain("Buy milk");
    expect(result).toContain("Write tests");
  });

  it("lists all items when body is 'all'", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Done task")]);

    await handleList("all", ctx);

    expect(mockListItems).toHaveBeenCalledWith("u1", {});
  });

  it("returns empty message when no items", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleList("", ctx);

    expect(result).toBe("No items found.");
  });
});

describe("handleTimezone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports the current timezone when given no argument", async () => {
    const result = await handleTimezone("", ctx);
    expect(result).toContain("Asia/Singapore");
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it("rejects something that isn't an IANA zone", async () => {
    const result = await handleTimezone("Mars/Olympus", ctx);
    expect(result).toContain("don't recognise");
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it("rejects a friendly abbreviation with a hint", async () => {
    const result = await handleTimezone("PST", ctx);
    expect(result).toContain("IANA");
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it("saves a valid zone", async () => {
    const result = await handleTimezone("Europe/London", ctx);
    expect(mockUpdateUserSettings).toHaveBeenCalledWith("u1", { timezone: "Europe/London" });
    expect(result).toContain("Europe/London");
  });

  it("skips the write when the zone is unchanged", async () => {
    const result = await handleTimezone("Asia/Singapore", ctx);
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
    expect(result).toContain("Already set");
  });
});
