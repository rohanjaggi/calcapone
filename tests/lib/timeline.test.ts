import { describe, it, expect } from "vitest";
import { buildTimeline } from "@/lib/timeline";
import type { Item, AgendaEvent } from "@/lib/mock-data";
import { combineDateTimeInTz } from "@/lib/tz";

const SG = "Asia/Singapore";
const TODAY = "2026-08-20";

const CATEGORY = { id: "c1", name: "CS2109S", color: "#92785C" };

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
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
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("excludes an item due on a later date", () => {
    // The reported bug: an exam on 1 Oct rendered under "Today" purely because it had a time.
    const items = [item({ id: "exam", title: "CS2109 Midterm Exam", dueDate: "2026-10-01", dueTime: "08:00" })];
    expect(buildTimeline(items, [], SG, TODAY)).toEqual([]);
  });

  it("excludes an item due on an earlier date", () => {
    const items = [item({ id: "old", dueDate: "2026-08-19", dueTime: "08:00" })];
    expect(buildTimeline(items, [], SG, TODAY)).toEqual([]);
  });

  it("includes an item due today", () => {
    const items = [item({ id: "now", dueDate: TODAY, dueTime: "08:00" })];
    const timeline = buildTimeline(items, [], SG, TODAY);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].time).toBe("2026-08-20T08:00:00");
    expect(timeline[0].isReminder).toBe(false);
  });

  it("includes an item due today with no due time, at the head of the day", () => {
    // It used to be dropped: "essay due Friday" showed in /list and escalated in Telegram
    // but appeared on no day of the dashboard at all.
    const items = [
      item({ id: "untimed", dueDate: TODAY, dueTime: null }),
      item({ id: "timed", dueDate: TODAY, dueTime: "08:00" }),
    ];
    const timeline = buildTimeline(items, [], SG, TODAY);
    expect(timeline.map((t) => t.id)).toEqual(["untimed", "timed"]);
    expect(timeline[0].allDay).toBe(true);
  });

  it("still excludes an untimed item due on another day", () => {
    const items = [item({ id: "untimed", dueDate: "2026-10-01", dueTime: null })];
    expect(buildTimeline(items, [], SG, TODAY)).toEqual([]);
  });

  it("excludes done items even when they fall on today", () => {
    const items = [item({ id: "done", status: "done", dueDate: TODAY, dueTime: "09:00" })];
    expect(buildTimeline(items, [], SG, TODAY)).toEqual([]);
  });

  it("keeps in_progress items", () => {
    const items = [item({ id: "wip", status: "in_progress", dueDate: TODAY, dueTime: "09:00" })];
    expect(buildTimeline(items, [], SG, TODAY)).toHaveLength(1);
  });

  it("buckets a remindAt instant by the user's zone, not UTC", () => {
    // 20:00 UTC on 19 Aug is 04:00 on 20 Aug in Singapore (UTC+8): today in SG, not in UTC.
    const items = [item({ id: "r", remindAt: "2026-08-19T20:00:00.000Z" })];
    expect(buildTimeline(items, [], SG, TODAY)).toHaveLength(1);
    expect(buildTimeline(items, [], "UTC", TODAY)).toEqual([]);
  });

  it("drops a remindAt instant that lands on tomorrow in the user's zone", () => {
    // 17:00 UTC on 20 Aug is 01:00 on 21 Aug in Singapore.
    const items = [item({ id: "r", remindAt: "2026-08-20T17:00:00.000Z" })];
    expect(buildTimeline(items, [], SG, TODAY)).toEqual([]);
  });

  it("prefers remindAt over dueDate and marks the row as a reminder", () => {
    const items = [
      item({ id: "r", remindAt: "2026-08-20T02:00:00.000Z", dueDate: "2026-10-01", dueTime: "08:00" }),
    ];
    const timeline = buildTimeline(items, [], SG, TODAY);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].isReminder).toBe(true);
    expect(timeline[0].time).toBe("2026-08-20T02:00:00.000Z");
  });

  it("ignores an unparseable remindAt rather than throwing", () => {
    const items = [item({ id: "bad", remindAt: "not-a-date" })];
    expect(buildTimeline(items, [], SG, TODAY)).toEqual([]);
  });

  it("sorts the day chronologically", () => {
    const items = [
      item({ id: "late", dueDate: TODAY, dueTime: "17:00" }),
      item({ id: "early", dueDate: TODAY, dueTime: "08:00" }),
      item({ id: "mid", dueDate: TODAY, dueTime: "12:30" }),
    ];
    expect(buildTimeline(items, [], SG, TODAY).map((t) => t.id)).toEqual(["early", "mid", "late"]);
  });

  it("carries category and priority through to the subtitle", () => {
    const items = [item({ id: "x", priority: "high", dueDate: TODAY, dueTime: "08:00" })];
    expect(buildTimeline(items, [], SG, TODAY)[0].subtitle).toBe("CS2109S · high");
  });
});

const event = (o: Partial<AgendaEvent> & { id: string }): AgendaEvent => ({
  title: "Standup",
  startsAt: `${TODAY}T02:00:00.000Z`, // 10:00 in Asia/Singapore
  endsAt: `${TODAY}T02:30:00.000Z`,
  allDay: false,
  ...o,
});

describe("buildTimeline with events", () => {
  it("emits an event row with type 'event'", () => {
    const timeline = buildTimeline([], [event({ id: "e1" })], SG, TODAY);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ id: "e1", type: "event", title: "Standup" });
  });

  it("buckets an event by the user's zone, not UTC", () => {
    // 17:00Z on the 19th is 01:00 on the 20th in Singapore -- it belongs to TODAY.
    const e = [event({ id: "e2", startsAt: "2026-08-19T17:00:00.000Z" })];
    expect(buildTimeline([], e, SG, TODAY)).toHaveLength(1);
    expect(buildTimeline([], e, SG, "2026-08-19")).toEqual([]);
  });

  it("ignores an unparseable startsAt rather than throwing", () => {
    expect(buildTimeline([], [event({ id: "bad", startsAt: "not-a-date" })], SG, TODAY)).toEqual([]);
  });

  it("interleaves events and items in time order", () => {
    const items = [item({ id: "task", dueDate: TODAY, dueTime: "14:00" })];
    const events = [event({ id: "early", startsAt: `${TODAY}T02:00:00.000Z` })];
    expect(buildTimeline(items, events, SG, TODAY).map((t) => t.id)).toEqual(["early", "task"]);
  });

  it("sorts an all-day event before every timed row", () => {
    const items = [item({ id: "task", dueDate: TODAY, dueTime: "00:30" })];
    const events = [event({ id: "allday", allDay: true, startsAt: `${TODAY}T00:00:00.000Z` })];
    expect(buildTimeline(items, events, SG, TODAY).map((t) => t.id)).toEqual(["allday", "task"]);
  });

  it("labels an all-day event in the subtitle", () => {
    const timeline = buildTimeline([], [event({ id: "e", allDay: true })], SG, TODAY);
    expect(timeline[0].subtitle).toBe("All day");
  });
});

describe("buildTimeline urgency", () => {
  const NOW = combineDateTimeInTz(TODAY, "10:00", SG);

  it("badges a task with a countdown and a severity", () => {
    const items = [item({ id: "t", dueDate: TODAY, dueTime: "12:00" })];
    const [row] = buildTimeline(items, [], SG, TODAY, NOW);
    expect(row.urgency).toEqual({ label: "in 2h", severity: "urgent" });
  });

  it("marks a task on a past day as overdue", () => {
    const items = [item({ id: "t", dueDate: "2026-08-19", dueTime: "09:00" })];
    const [row] = buildTimeline(items, [], SG, "2026-08-19", NOW);
    expect(row.urgency).toMatchObject({ severity: "overdue" });
  });

  it("badges a day several days out with a day count", () => {
    const items = [item({ id: "t", dueDate: "2026-08-27", dueTime: "12:00" })];
    const [row] = buildTimeline(items, [], SG, "2026-08-27", NOW);
    expect(row.urgency).toEqual({ label: "in 7 days", severity: "upcoming" });
  });

  it("does not badge a reminder — a reminder fires, it is not a deadline", () => {
    const items = [item({ id: "r", remindAt: `${TODAY}T02:00:00.000Z` })];
    const [row] = buildTimeline(items, [], SG, TODAY, NOW);
    expect(row.urgency).toBeUndefined();
  });

  it("does not badge a calendar event", () => {
    const events = [event({ id: "e" })];
    const [row] = buildTimeline([], events, SG, TODAY, NOW);
    expect(row.urgency).toBeUndefined();
  });
});
