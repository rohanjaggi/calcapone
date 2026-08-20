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
vi.mock("@/lib/services/message-ref", () => ({ latestListRef: vi.fn(), resolvePosition: vi.fn() }));
vi.mock("@/lib/services/action-log", () => ({ undoLast: vi.fn() }));
vi.mock("@/lib/services/search", () => ({ searchItems: vi.fn() }));
vi.mock("@/lib/services/course", () => ({ createCourse: vi.fn(), listCourses: vi.fn(), findCourse: vi.fn() }));

import {
  handleDone,
  handleToday,
  handleWeek,
  handleList,
  handleNote,
  handleSearch,
  handleUndo,
  handleTimezone,
  handleCourses,
  handleExams,
  handleDue,
} from "@/lib/services/commands/handlers";
import type { CommandContext } from "@/lib/services/commands";
import { listItems, updateItem, createItem } from "@/lib/services/item";
import { listCategories } from "@/lib/services/category";
import { getEvents } from "@/lib/services/calendar";
import { latestListRef, resolvePosition } from "@/lib/services/message-ref";
import { undoLast } from "@/lib/services/action-log";
import { searchItems } from "@/lib/services/search";
import { createCourse, listCourses, findCourse } from "@/lib/services/course";

const mockListItems = vi.mocked(listItems);
const mockUpdateItem = vi.mocked(updateItem);
const mockCreateItem = vi.mocked(createItem);
const mockListCategories = vi.mocked(listCategories);
const mockGetEvents = vi.mocked(getEvents);
const mockLatestListRef = vi.mocked(latestListRef);
const mockResolvePosition = vi.mocked(resolvePosition);
const mockUndoLast = vi.mocked(undoLast);
const mockSearchItems = vi.mocked(searchItems);
const mockCreateCourse = vi.mocked(createCourse);
const mockListCourses = vi.mocked(listCourses);
const mockFindCourse = vi.mocked(findCourse);

const ctx: CommandContext = {
  userId: "u1",
  chatId: 42,
  user: {
    telegramUsername: "testuser",
    timezone: "Asia/Singapore",
    googleRefreshToken: null,
    googleCalendarId: null,
    eventReminderMinutes: null,
  },
};

const category = { id: "c1", name: "General", userId: "u1", color: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };

const makeItem = (
  id: string,
  title: string,
  overrides: Partial<{
    dueDate: string | null;
    dueTime: string | null;
    remindAt: Date | null;
    kind: "task" | "assignment" | "exam" | "class";
    courseId: string | null;
    seriesId: string | null;
  }> = {}
) => ({
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
  // Added alongside course support — /exams and /due filter and group on these.
  kind: "task" as const,
  courseId: null,
  seriesId: null,
  calendarSyncedAt: null,
  notificationStage: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  category,
  ...overrides,
});

const makeCourse = (id: string, code: string, name: string) => ({
  id,
  userId: "u1",
  code,
  name,
  color: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** Calendar-day offset from a YYYY-MM-DD string, mirroring the handler's own date arithmetic. */
function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe("handleDone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns usage hint when body is empty", async () => {
    const result = await handleDone("", ctx);
    expect(result.text).toContain("Usage");
    expect(mockListItems).not.toHaveBeenCalled();
  });

  it("completes a matching item by fuzzy title", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy groceries"), makeItem("i2", "Call dentist")]);
    mockUpdateItem.mockResolvedValue(makeItem("i1", "Buy groceries") as never);

    const result = await handleDone("groceries", ctx);

    expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { status: "done" });
    expect(result.text).toContain("Buy groceries");
    expect(result.text).toContain("Completed");
  });

  it("returns not-found message when no match", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy groceries")]);

    const result = await handleDone("dentist", ctx);

    expect(result.text).toContain("dentist");
    expect(result.text).toContain("No open task");
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("/done buy milk still matches by title", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Call dentist")]);
    mockUpdateItem.mockResolvedValue(makeItem("i1", "Buy milk") as never);

    const result = await handleDone("buy milk", ctx);

    expect(mockLatestListRef).not.toHaveBeenCalled();
    expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { status: "done" });
    expect(result.text).toContain("Completed");
    expect(result.text).toContain("Buy milk");
  });

  it("/done 3 resolves against the last numbered list", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Buy milk"),
      makeItem("i2", "Call dentist"),
      makeItem("i3", "Write report"),
    ]);
    mockLatestListRef.mockResolvedValue({ itemIds: ["i1", "i2", "i3"] });
    mockResolvePosition.mockReturnValue("i2");
    mockUpdateItem.mockResolvedValue(makeItem("i2", "Call dentist") as never);

    const result = await handleDone("2", ctx);

    expect(mockLatestListRef).toHaveBeenCalledWith("u1", 42);
    expect(mockResolvePosition).toHaveBeenCalledWith(["i1", "i2", "i3"], "2");
    expect(mockUpdateItem).toHaveBeenCalledWith("i2", "u1", { status: "done" });
    expect(result.text).toContain("Completed");
    expect(result.text).toContain("Call dentist");
  });

  it("/done 3 with no recent list says so plainly and completes nothing", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk")]);
    mockLatestListRef.mockResolvedValue(null);

    const result = await handleDone("3", ctx);

    expect(result.text).toContain("I don't have a recent numbered list");
    expect(mockResolvePosition).not.toHaveBeenCalled();
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("falls through to title matching when the number doesn't resolve to an open item", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk")]);
    mockLatestListRef.mockResolvedValue({ itemIds: ["i1"] });
    mockResolvePosition.mockReturnValue(null);

    const result = await handleDone("9", ctx);

    expect(result.text).toContain("No open task");
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });

  it("HTML-escapes a title containing <, & and _", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Fix <script> & _underscore_ bug")]);
    mockUpdateItem.mockResolvedValue(makeItem("i1", "Fix <script> & _underscore_ bug") as never);

    const result = await handleDone("Fix", ctx);

    expect(result.text).toContain("Fix &lt;script&gt; &amp; _underscore_ bug");
    expect(result.text).not.toContain("<script>");
  });
});

describe("handleToday", () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

  it("shows tasks due today", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Morning standup", { dueDate: todayStr })]);

    const result = await handleToday(ctx);

    expect(result.text).toContain("Morning standup");
    expect(result.text).toContain("Today");
  });

  it("shows empty message when nothing scheduled", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleToday(ctx);

    expect(result.text).toBe("Nothing scheduled for today!");
    expect(result.itemIds).toBeUndefined();
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
    expect(result.text).toContain("10:00 — Team sync &lt;Q3&gt;");
    expect(result.text).toContain("2026-06-12 (all day) — Public holiday");
    expect(result.text).toContain("<b>Next up</b>");
  });

  it("shows overdue section for items with dueDate before today", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Submit invoice", { dueDate: "2026-05-01" })]);

    const result = await handleToday(ctx);

    expect(result.text).toContain("Overdue");
    expect(result.text).toContain("Submit invoice");
  });

  it("shows today section for items due today", async () => {
    mockListItems.mockResolvedValue([makeItem("i2", "Team standup", { dueDate: todayStr, dueTime: "10:00" })]);

    const result = await handleToday(ctx);

    expect(result.text).toContain("Today");
    expect(result.text).toContain("Team standup");
    expect(result.text).not.toContain("Overdue");
  });

  it("separates overdue from today items", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Submit invoice", { dueDate: "2026-05-01" }),
      makeItem("i2", "Team standup", { dueDate: todayStr }),
    ]);

    const result = await handleToday(ctx);

    const overduePos = result.text.indexOf("Overdue");
    const todayPos = result.text.indexOf("Today");
    expect(overduePos).toBeLessThan(todayPos);
    expect(result.text).toContain("Submit invoice");
    expect(result.text).toContain("Team standup");
  });

  it("returns a flat itemIds array spanning overdue, today items, then today reminders, numbered to match", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Overdue task", { dueDate: "2020-01-01" }),
      makeItem("i2", "Today task", { dueDate: todayStr }),
      makeItem("i3", "Today reminder", { remindAt: new Date() }),
    ]);

    const result = await handleToday(ctx);

    expect(result.itemIds).toEqual(["i1", "i2", "i3"]);
    expect(result.text).toContain("1. Overdue task");
    expect(result.text).toContain("2. Today task");
    expect(result.text).toContain("3. 🔔");
  });
});

describe("handleWeek", () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

  function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  }

  it("groups items by day heading and returns itemIds in printed order", async () => {
    const day3 = addDays(todayStr, 3);
    mockListItems.mockResolvedValue([
      makeItem("i1", "Today task", { dueDate: todayStr }),
      makeItem("i2", "Later task", { dueDate: day3 }),
    ]);

    const result = await handleWeek(ctx);

    expect(result.text).toContain("Today task");
    expect(result.text).toContain("Later task");
    expect(result.text).toContain(day3);
    expect(result.itemIds).toEqual(["i1", "i2"]);
    expect(result.text.indexOf("Today task")).toBeLessThan(result.text.indexOf("Later task"));
  });

  it("excludes items due more than 7 days out", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Far future task", { dueDate: addDays(todayStr, 10) })]);

    const result = await handleWeek(ctx);

    expect(result.text).toBe("Nothing scheduled for the next 7 days.");
  });

  it("returns the empty message when nothing is scheduled", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleWeek(ctx);

    expect(result.text).toBe("Nothing scheduled for the next 7 days.");
    expect(result.itemIds).toBeUndefined();
  });

  it("survives a calendar fetch that rejects", async () => {
    const ctxWithGcal: CommandContext = {
      ...ctx,
      user: { ...ctx.user, googleRefreshToken: "enc-token", googleCalendarId: "primary" },
    };
    mockListItems.mockResolvedValue([makeItem("i1", "Today task", { dueDate: todayStr })]);
    mockGetEvents.mockRejectedValue(new Error("calendar down"));

    const result = await handleWeek(ctxWithGcal);

    expect(result.text).toContain("Today task");
    expect(result.itemIds).toEqual(["i1"]);
  });
});

describe("handleList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists pending items by default", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Write tests")]);

    const result = await handleList("", ctx);

    expect(mockListItems).toHaveBeenCalledWith("u1", { status: ["pending", "in_progress"] });
    expect(result.text).toContain("Buy milk");
    expect(result.text).toContain("Write tests");
  });

  it("lists all items when body is 'all'", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Done task")]);

    await handleList("all", ctx);

    expect(mockListItems).toHaveBeenCalledWith("u1", {});
  });

  it("returns empty message when no items", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleList("", ctx);

    expect(result.text).toBe("No items found.");
    expect(result.itemIds).toBeUndefined();
  });

  it("returns itemIds in exactly printed order", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i2", "Second"),
      makeItem("i1", "First"),
      makeItem("i3", "Third"),
    ]);

    const result = await handleList("", ctx);

    expect(result.itemIds).toEqual(["i2", "i1", "i3"]);
    expect(result.text).toContain("1. 📋 Second");
    expect(result.text).toContain("2. 📋 First");
    expect(result.text).toContain("3. 📋 Third");
  });

  it("HTML-escapes titles containing <, & and _", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Fix <script> & _underscore_ bug")]);

    const result = await handleList("", ctx);

    expect(result.text).toContain("Fix &lt;script&gt; &amp; _underscore_ bug");
    expect(result.text).not.toContain("<script>");
  });
});

describe("handleNote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an empty body", async () => {
    const result = await handleNote("", ctx);

    expect(result.text).toBe("Usage: /note something to remember");
    expect(mockListCategories).not.toHaveBeenCalled();
    expect(mockCreateItem).not.toHaveBeenCalled();
  });

  it("creates the item in the user's first category by sort order, with no AI call", async () => {
    mockListCategories.mockResolvedValue([
      { ...category, id: "cat-first", sortOrder: 0 },
      { ...category, id: "cat-second", sortOrder: 1 },
    ] as never);
    mockCreateItem.mockResolvedValue(makeItem("i1", "Call the plumber") as never);

    const result = await handleNote("Call the plumber", ctx);

    expect(mockCreateItem).toHaveBeenCalledWith({
      userId: "u1",
      categoryId: "cat-first",
      title: "Call the plumber",
    });
    expect(result.text).toContain("Noted");
    expect(result.text).toContain("Call the plumber");
  });
});

describe("handleSearch", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeResult = (id: string, title: string, type: "task" | "reminder" = "task") => ({
    id,
    title,
    description: null,
    status: "pending",
    priority: "medium",
    category: { id: "c1", name: "General", color: "#A8A29E" },
    dueDate: null,
    type,
  });

  it("returns a usage line for an empty query", async () => {
    const result = await handleSearch("", ctx);

    expect(result.text).toContain("Usage");
    expect(mockSearchItems).not.toHaveBeenCalled();
  });

  it("reports zero results", async () => {
    mockSearchItems.mockResolvedValue([]);

    const result = await handleSearch("nonexistent", ctx);

    expect(result.text).toContain("No items matching");
    expect(result.text).toContain("nonexistent");
    expect(result.itemIds).toBeUndefined();
  });

  it("returns itemIds in printed order, capped at 10", async () => {
    const results = Array.from({ length: 12 }, (_, i) => makeResult(`i${i}`, `Item ${i}`));
    mockSearchItems.mockResolvedValue(results as never);

    const result = await handleSearch("item", ctx);

    expect(result.itemIds).toHaveLength(10);
    expect(result.itemIds).toEqual(results.slice(0, 10).map((r) => r.id));
    expect(result.text.indexOf("Item 0")).toBeLessThan(result.text.indexOf("Item 1"));
  });
});

describe("handleUndo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a successful undo without double-escaping the summary", async () => {
    mockUndoLast.mockResolvedValue({ ok: true, summary: "Deleted <b>Buy milk &amp; eggs</b>" });

    const result = await handleUndo(ctx);

    expect(result.text).toBe("↩️ Undid: Deleted <b>Buy milk &amp; eggs</b>");
  });

  it("renders 'nothing to undo'", async () => {
    mockUndoLast.mockResolvedValue({ ok: false, reason: "none" });

    const result = await handleUndo(ctx);

    expect(result.text).toBe("Nothing to undo.");
  });

  it("renders a failed undo", async () => {
    mockUndoLast.mockResolvedValue({ ok: false, reason: "failed" });

    const result = await handleUndo(ctx);

    expect(result.text).toContain("couldn't undo");
  });
});

describe("handleTimezone", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports the current timezone when given no argument", async () => {
    const result = await handleTimezone("", ctx);
    expect(result.text).toContain("Asia/Singapore");
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it("rejects something that isn't an IANA zone", async () => {
    const result = await handleTimezone("Mars/Olympus", ctx);
    expect(result.text).toContain("don't recognise");
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it("rejects a friendly abbreviation with a hint", async () => {
    const result = await handleTimezone("PST", ctx);
    expect(result.text).toContain("IANA");
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
  });

  it("saves a valid zone", async () => {
    const result = await handleTimezone("Europe/London", ctx);
    expect(mockUpdateUserSettings).toHaveBeenCalledWith("u1", { timezone: "Europe/London" });
    expect(result.text).toContain("Europe/London");
  });

  it("skips the write when the zone is unchanged", async () => {
    const result = await handleTimezone("Asia/Singapore", ctx);
    expect(mockUpdateUserSettings).not.toHaveBeenCalled();
    expect(result.text).toContain("Already set");
  });
});

describe("handleCourses", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists courses as CODE — Name", async () => {
    mockListCourses.mockResolvedValue([
      makeCourse("c1", "CS2040", "Data Structures"),
      makeCourse("c2", "MA1521", "Calculus"),
    ] as never);

    const result = await handleCourses("", ctx);

    expect(result.text).toContain("CS2040 — Data Structures");
    expect(result.text).toContain("MA1521 — Calculus");
    expect(mockCreateCourse).not.toHaveBeenCalled();
  });

  it("explains how to add a course when there are none", async () => {
    mockListCourses.mockResolvedValue([]);

    const result = await handleCourses("", ctx);

    expect(result.text).toContain("add course CS2040 Data Structures");
  });

  it("rejects 'add' with no code or name at all", async () => {
    const result = await handleCourses("add", ctx);

    expect(result.text).toContain("Usage");
    expect(mockCreateCourse).not.toHaveBeenCalled();
  });

  it("rejects a code with no name", async () => {
    const result = await handleCourses("add CS2040", ctx);

    expect(result.text).toContain("Usage");
    expect(mockCreateCourse).not.toHaveBeenCalled();
  });

  it("parses a multi-word name", async () => {
    mockCreateCourse.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures and Algorithms") as never);

    const result = await handleCourses("add CS2040 Data Structures and Algorithms", ctx);

    expect(mockCreateCourse).toHaveBeenCalledWith({
      userId: "u1",
      code: "CS2040",
      name: "Data Structures and Algorithms",
    });
    expect(result.text).toContain("Data Structures and Algorithms");
  });

  it("uppercases a lowercase code", async () => {
    mockCreateCourse.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures") as never);

    await handleCourses("add cs2040 Data Structures", ctx);

    expect(mockCreateCourse).toHaveBeenCalledWith({ userId: "u1", code: "CS2040", name: "Data Structures" });
  });

  it("reports a duplicate code as a friendly message instead of throwing", async () => {
    mockCreateCourse.mockRejectedValue({ code: "P2002" });

    const result = await handleCourses("add CS2040 Data Structures", ctx);

    expect(result.text).toContain("CS2040");
    expect(result.text).toContain("already exists");
  });

  it("rethrows errors that aren't a duplicate-code collision", async () => {
    mockCreateCourse.mockRejectedValue(new Error("db down"));

    await expect(handleCourses("add CS2040 Data Structures", ctx)).rejects.toThrow("db down");
  });

  it("HTML-escapes a course name containing < and &", async () => {
    mockListCourses.mockResolvedValue([makeCourse("c1", "CS2040", "Data <Structures> & Algorithms")] as never);

    const result = await handleCourses("", ctx);

    expect(result.text).toContain("Data &lt;Structures&gt; &amp; Algorithms");
    expect(result.text).not.toContain("<Structures>");
  });
});

describe("handleExams", () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

  it("returns the empty message when there are no exams", async () => {
    mockListItems.mockResolvedValue([]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toBe("No exams scheduled. 🎉");
    expect(result.itemIds).toBeUndefined();
  });

  it("orders soonest first and returns itemIds matching printed order", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Later exam", { kind: "exam", dueDate: addDaysToDate(todayStr, 5) }),
      makeItem("i2", "Sooner exam", { kind: "exam", dueDate: addDaysToDate(todayStr, 2) }),
    ]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.itemIds).toEqual(["i2", "i1"]);
    expect(result.text.indexOf("Sooner exam")).toBeLessThan(result.text.indexOf("Later exam"));
  });

  it("labels an exam due today as 'today'", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Midterm", { kind: "exam", dueDate: todayStr })]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toContain("(today)");
  });

  it("labels an exam due tomorrow as 'tomorrow'", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Midterm", { kind: "exam", dueDate: addDaysToDate(todayStr, 1) }),
    ]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toContain("(tomorrow)");
  });

  it("labels an exam further out as 'in N days'", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Final", { kind: "exam", dueDate: addDaysToDate(todayStr, 12) }),
    ]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toContain("(in 12 days)");
  });

  it("shows the course code when the exam is tied to a course", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Midterm", { kind: "exam", dueDate: todayStr, courseId: "c1" }),
    ]);
    mockListCourses.mockResolvedValue([makeCourse("c1", "CS2040", "Data Structures")] as never);

    const result = await handleExams(ctx);

    expect(result.text).toContain("CS2040 — Midterm");
  });

  it("omits a course prefix when the exam has no course", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Midterm", { kind: "exam", dueDate: todayStr })]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toContain("1. Midterm (today)");
  });

  it("excludes exams without a due date", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Undated exam", { kind: "exam", dueDate: null })]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toBe("No exams scheduled. 🎉");
  });

  it("excludes exams already in the past", async () => {
    mockListItems.mockResolvedValue([
      makeItem("i1", "Past exam", { kind: "exam", dueDate: addDaysToDate(todayStr, -1) }),
    ]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toBe("No exams scheduled. 🎉");
  });

  it("excludes non-exam items even with a due date", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Homework", { kind: "assignment", dueDate: todayStr })]);
    mockListCourses.mockResolvedValue([]);

    const result = await handleExams(ctx);

    expect(result.text).toBe("No exams scheduled. 🎉");
  });
});

describe("handleDue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a usage line when given no argument", async () => {
    const result = await handleDue("", ctx);

    expect(result.text).toContain("Usage");
    expect(mockFindCourse).not.toHaveBeenCalled();
  });

  it("reports an unknown course", async () => {
    mockFindCourse.mockResolvedValue(null);

    const result = await handleDue("PHYS999", ctx);

    expect(result.text).toContain("PHYS999");
    expect(result.text).toContain("/courses");
    expect(mockListItems).not.toHaveBeenCalled();
  });

  it("groups assignments and exams ahead of everything else, each showing its due date", async () => {
    mockFindCourse.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures") as never);
    mockListItems.mockResolvedValue([
      makeItem("i1", "Read chapter 3", { kind: "class", courseId: "c1", dueDate: "2026-09-01" }),
      makeItem("i2", "Assignment 2", { kind: "assignment", courseId: "c1", dueDate: "2026-08-25" }),
      makeItem("i3", "Other course item", { kind: "assignment", courseId: "other", dueDate: "2026-08-20" }),
      makeItem("i4", "Final exam", { kind: "exam", courseId: "c1", dueDate: "2026-12-01" }),
    ]);

    const result = await handleDue("cs2040", ctx);

    expect(mockFindCourse).toHaveBeenCalledWith("u1", "cs2040");
    expect(result.itemIds).toEqual(["i2", "i4", "i1"]);
    expect(result.text).toContain("Assignment 2 — due 2026-08-25");
    expect(result.text).toContain("Final exam — due 2026-12-01");
    expect(result.text).toContain("Read chapter 3 — due 2026-09-01");
    expect(result.text).not.toContain("Other course item");
    expect(result.text.indexOf("Assignment 2")).toBeLessThan(result.text.indexOf("Read chapter 3"));
  });

  it("reports no open items for the course", async () => {
    mockFindCourse.mockResolvedValue(makeCourse("c1", "CS2040", "Data Structures") as never);
    mockListItems.mockResolvedValue([]);

    const result = await handleDue("CS2040", ctx);

    expect(result.text).toContain("CS2040");
    expect(result.itemIds).toBeUndefined();
  });
});
