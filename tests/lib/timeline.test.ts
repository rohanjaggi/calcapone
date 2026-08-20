import { describe, it, expect } from "vitest";
import { buildTimeline } from "@/lib/timeline";
import type { Item } from "@/lib/mock-data";

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
    expect(buildTimeline(items, SG, TODAY)).toEqual([]);
  });

  it("excludes an item due on an earlier date", () => {
    const items = [item({ id: "old", dueDate: "2026-08-19", dueTime: "08:00" })];
    expect(buildTimeline(items, SG, TODAY)).toEqual([]);
  });

  it("includes an item due today", () => {
    const items = [item({ id: "now", dueDate: TODAY, dueTime: "08:00" })];
    const timeline = buildTimeline(items, SG, TODAY);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].time).toBe("2026-08-20T08:00:00");
    expect(timeline[0].isReminder).toBe(false);
  });

  it("skips an item with a due date but no due time", () => {
    const items = [item({ id: "dateless", dueDate: TODAY, dueTime: null })];
    expect(buildTimeline(items, SG, TODAY)).toEqual([]);
  });

  it("excludes done items even when they fall on today", () => {
    const items = [item({ id: "done", status: "done", dueDate: TODAY, dueTime: "09:00" })];
    expect(buildTimeline(items, SG, TODAY)).toEqual([]);
  });

  it("keeps in_progress items", () => {
    const items = [item({ id: "wip", status: "in_progress", dueDate: TODAY, dueTime: "09:00" })];
    expect(buildTimeline(items, SG, TODAY)).toHaveLength(1);
  });

  it("buckets a remindAt instant by the user's zone, not UTC", () => {
    // 20:00 UTC on 19 Aug is 04:00 on 20 Aug in Singapore (UTC+8): today in SG, not in UTC.
    const items = [item({ id: "r", remindAt: "2026-08-19T20:00:00.000Z" })];
    expect(buildTimeline(items, SG, TODAY)).toHaveLength(1);
    expect(buildTimeline(items, "UTC", TODAY)).toEqual([]);
  });

  it("drops a remindAt instant that lands on tomorrow in the user's zone", () => {
    // 17:00 UTC on 20 Aug is 01:00 on 21 Aug in Singapore.
    const items = [item({ id: "r", remindAt: "2026-08-20T17:00:00.000Z" })];
    expect(buildTimeline(items, SG, TODAY)).toEqual([]);
  });

  it("prefers remindAt over dueDate and marks the row as a reminder", () => {
    const items = [
      item({ id: "r", remindAt: "2026-08-20T02:00:00.000Z", dueDate: "2026-10-01", dueTime: "08:00" }),
    ];
    const timeline = buildTimeline(items, SG, TODAY);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].isReminder).toBe(true);
    expect(timeline[0].time).toBe("2026-08-20T02:00:00.000Z");
  });

  it("ignores an unparseable remindAt rather than throwing", () => {
    const items = [item({ id: "bad", remindAt: "not-a-date" })];
    expect(buildTimeline(items, SG, TODAY)).toEqual([]);
  });

  it("sorts the day chronologically", () => {
    const items = [
      item({ id: "late", dueDate: TODAY, dueTime: "17:00" }),
      item({ id: "early", dueDate: TODAY, dueTime: "08:00" }),
      item({ id: "mid", dueDate: TODAY, dueTime: "12:30" }),
    ];
    expect(buildTimeline(items, SG, TODAY).map((t) => t.id)).toEqual(["early", "mid", "late"]);
  });

  it("carries category and priority through to the subtitle", () => {
    const items = [item({ id: "x", priority: "high", dueDate: TODAY, dueTime: "08:00" })];
    expect(buildTimeline(items, SG, TODAY)[0].subtitle).toBe("CS2109S · high");
  });
});
