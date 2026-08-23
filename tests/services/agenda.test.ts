import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListItems = vi.hoisted(() => vi.fn());
const mockListCategories = vi.hoisted(() => vi.fn());
const mockEventFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { calendarEvent: { findMany: mockEventFindMany } },
}));
vi.mock("@/lib/services/item", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/item")>()),
  listItems: mockListItems,
}));
vi.mock("@/lib/services/category", () => ({ listCategories: mockListCategories }));

import { getAgenda } from "@/lib/services/agenda";
import { combineDateTimeInTz } from "@/lib/tz";

const SG = "Asia/Singapore";
const ANCHOR = "2026-08-20";
const CATEGORY = { id: "c1", name: "General", color: "#92785C" };

function row(o: Record<string, unknown>) {
  return {
    id: "i1",
    title: "Task",
    description: null,
    status: "pending",
    priority: "medium",
    category: CATEGORY,
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: "none",
    googleEventId: null,
    ...o,
  };
}

function gcal(o: Record<string, unknown>) {
  return {
    id: "e1",
    title: "Standup",
    startsAt: new Date("2026-08-20T02:00:00.000Z"),
    endsAt: new Date("2026-08-20T02:30:00.000Z"),
    allDay: false,
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEventFindMany.mockResolvedValue([]);
  mockListCategories.mockResolvedValue([CATEGORY]);
  mockListItems.mockResolvedValue([]);
});

describe("getAgenda", () => {
  it("returns a strip of seven consecutive days starting at the anchor", async () => {
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.strip).toHaveLength(7);
    expect(agenda.strip[0].date).toBe("2026-08-20");
    expect(agenda.strip[6].date).toBe("2026-08-26");
  });

  it("crosses a month boundary correctly", async () => {
    const agenda = await getAgenda("u1", SG, "2026-08-30");
    expect(agenda.strip.map((d) => d.date)).toEqual([
      "2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02",
      "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });

  it("counts every open item in priorityCounts, including ones outside the window", async () => {
    mockListItems.mockResolvedValue([
      row({ id: "near", priority: "high", dueDate: ANCHOR, dueTime: "09:00" }),
      row({ id: "far", priority: "low", dueDate: "2027-01-01", dueTime: "09:00" }),
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    // StatsRow means "what's left overall", not "what's left this week".
    expect(agenda.priorityCounts).toEqual({ high: 1, medium: 0, low: 1 });
    // ...but only the in-window one lands in a day bucket.
    expect(agenda.byDay[ANCHOR].map((r) => r.id)).toEqual(["near"]);
  });

  it("keeps an undated item out of every day bucket but inside the counts", async () => {
    mockListItems.mockResolvedValue([row({ id: "someday", priority: "medium" })]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.priorityCounts.medium).toBe(1);
    expect(Object.values(agenda.byDay).flat()).toEqual([]);
  });

  it("counts tasks and events separately in the strip", async () => {
    mockListItems.mockResolvedValue([row({ id: "t", dueDate: ANCHOR, dueTime: "09:00" })]);
    mockEventFindMany.mockResolvedValue([gcal({})]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.strip[0]).toMatchObject({ taskCount: 1, eventCount: 1 });
  });

  it("asks the mirror for the window, never the Google API", async () => {
    await getAgenda("u1", SG, ANCHOR);
    expect(mockEventFindMany).toHaveBeenCalledTimes(1);
    const arg = mockEventFindMany.mock.calls[0][0];
    expect(arg.where.userId).toBe("u1");
    expect(arg.where.startsAt.gte).toBeInstanceOf(Date);
    expect(arg.where.startsAt.lt).toBeInstanceOf(Date);
  });

  it("only asks for open items", async () => {
    await getAgenda("u1", SG, ANCHOR);
    expect(mockListItems).toHaveBeenCalledWith("u1", { status: ["pending", "in_progress"] });
  });

  it("returns categories for the quick-add sheet", async () => {
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.categories).toEqual([{ id: "c1", name: "General", color: "#92785C" }]);
  });

  it("falls back to a default colour for an uncoloured category", async () => {
    mockListCategories.mockResolvedValue([{ id: "c2", name: "Inbox", color: null }]);
    const agenda = await getAgenda("u1", SG, ANCHOR);
    expect(agenda.categories[0].color).toBe("#92785C");
  });
});

describe("getAgenda ahead list", () => {
  const NOW = combineDateTimeInTz(ANCHOR, "10:00", SG);

  it("lists the nearest deadlines soonest first, overdue included", async () => {
    mockListItems.mockResolvedValue([
      row({ id: "later", title: "Later", dueDate: "2026-08-25", dueTime: "12:00" }),
      row({ id: "past", title: "Past", dueDate: "2026-08-18", dueTime: "12:00" }),
      row({ id: "soon", title: "Soon", dueDate: ANCHOR, dueTime: "18:00" }),
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    expect(agenda.ahead.map((a) => a.id)).toEqual(["past", "soon", "later"]);
    expect(agenda.ahead[0].urgency.severity).toBe("overdue");
  });

  it("reaches past the seven-day window", async () => {
    mockListItems.mockResolvedValue([
      row({ id: "far", title: "Far", dueDate: "2026-09-20", dueTime: "12:00" }),
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    // Nothing in the strip, but it is still the next thing due.
    expect(Object.values(agenda.byDay).flat()).toEqual([]);
    expect(agenda.ahead.map((a) => a.id)).toEqual(["far"]);
  });

  it("excludes undated items and reminders", async () => {
    mockListItems.mockResolvedValue([
      row({ id: "undated", title: "Someday" }),
      row({ id: "rem", title: "Ping", remindAt: new Date(`${ANCHOR}T02:00:00.000Z`) }),
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    expect(agenda.ahead).toEqual([]);
  });

  it("caps the list", async () => {
    mockListItems.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) =>
        row({ id: `i${i}`, dueDate: `2026-09-0${i + 1}`, dueTime: "12:00" })
      )
    );
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    expect(agenda.ahead).toHaveLength(5);
  });
});

describe("getAgenda strip severity", () => {
  const NOW = combineDateTimeInTz(ANCHOR, "10:00", SG);

  it("takes the worst severity on the day", async () => {
    mockListItems.mockResolvedValue([
      row({ id: "calm", dueDate: ANCHOR, dueTime: "23:00" }),
      row({ id: "tight", dueDate: ANCHOR, dueTime: "11:00" }),
    ]);
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    expect(agenda.strip[0].severity).toBe("urgent");
  });

  it("leaves a day with nothing pressing unmarked", async () => {
    mockListItems.mockResolvedValue([]);
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    expect(agenda.strip.every((d) => d.severity === null)).toBe(true);
  });

  it("does not colour a day from a calendar event alone", async () => {
    mockListItems.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([gcal({})]);
    const agenda = await getAgenda("u1", SG, ANCHOR, 7, NOW);
    expect(agenda.strip[0].eventCount).toBe(1);
    expect(agenda.strip[0].severity).toBeNull();
  });
});
