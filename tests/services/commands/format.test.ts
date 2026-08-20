import { describe, it, expect } from "vitest";
import { sortByDue, bucketByDue, renderGroupedList, renderFlatList } from "@/lib/services/commands/format";

const TZ = "Asia/Singapore";
/** 2026-08-20 12:00 in Singapore (UTC+8) — "today" for every test below. */
const NOW = new Date("2026-08-20T04:00:00Z");

const makeItem = (
  id: string,
  overrides: Partial<{
    title: string;
    status: "pending" | "in_progress" | "done";
    priority: "low" | "medium" | "high";
    dueDate: string | null;
    dueTime: string | null;
    remindAt: Date | null;
    createdAt: Date;
  }> = {}
) => ({
  id,
  title: id,
  status: "pending" as const,
  priority: "medium" as const,
  dueDate: null,
  dueTime: null,
  remindAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

describe("sortByDue", () => {
  it("orders by due date, soonest first", () => {
    const items = [
      makeItem("later", { dueDate: "2026-09-01" }),
      makeItem("sooner", { dueDate: "2026-08-21" }),
      makeItem("middle", { dueDate: "2026-08-25" }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["sooner", "middle", "later"]);
  });

  it("puts undated items last, after everything with a date", () => {
    const items = [
      makeItem("undated"),
      makeItem("far-off", { dueDate: "2027-01-01" }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["far-off", "undated"]);
  });

  it("puts an untimed item before a timed one on the same day", () => {
    const items = [
      makeItem("at-nine", { dueDate: "2026-08-21", dueTime: "09:00" }),
      makeItem("anytime", { dueDate: "2026-08-21" }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["anytime", "at-nine"]);
  });

  it("orders timed items on the same day by time of day", () => {
    const items = [
      makeItem("evening", { dueDate: "2026-08-21", dueTime: "18:00" }),
      makeItem("morning", { dueDate: "2026-08-21", dueTime: "08:00" }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["morning", "evening"]);
  });

  it("sorts a reminder by its local date in the user's timezone, not UTC", () => {
    // 2026-08-21T20:00Z is still the 21st in UTC but already 04:00 on the 22nd in Singapore,
    // so the task due on the 22nd at 09:00 must come second.
    const items = [
      makeItem("task-22nd", { dueDate: "2026-08-22", dueTime: "09:00" }),
      makeItem("reminder-22nd-early", { remindAt: new Date("2026-08-21T20:00:00Z") }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["reminder-22nd-early", "task-22nd"]);
  });

  it("breaks ties on the same due date by priority, highest first", () => {
    const items = [
      makeItem("low", { dueDate: "2026-08-21", priority: "low" }),
      makeItem("high", { dueDate: "2026-08-21", priority: "high" }),
      makeItem("medium", { dueDate: "2026-08-21", priority: "medium" }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["high", "medium", "low"]);
  });

  it("breaks a priority tie by newest first, matching the old list order", () => {
    const items = [
      makeItem("older", { dueDate: "2026-08-21", createdAt: new Date("2026-01-01T00:00:00Z") }),
      makeItem("newer", { dueDate: "2026-08-21", createdAt: new Date("2026-02-01T00:00:00Z") }),
    ];

    expect(ids(sortByDue(items, TZ))).toEqual(["newer", "older"]);
  });

  it("does not mutate the array it was given", () => {
    const items = [makeItem("b", { dueDate: "2026-09-01" }), makeItem("a", { dueDate: "2026-08-21" })];

    sortByDue(items, TZ);

    expect(ids(items)).toEqual(["b", "a"]);
  });
});

describe("bucketByDue", () => {
  it("splits items into overdue, today, tomorrow, this week, later and no date", () => {
    const items = [
      makeItem("none"),
      makeItem("later", { dueDate: "2026-10-01" }),
      makeItem("week", { dueDate: "2026-08-24" }),
      makeItem("tomorrow", { dueDate: "2026-08-21" }),
      makeItem("today", { dueDate: "2026-08-20" }),
      makeItem("overdue", { dueDate: "2026-08-17" }),
    ];

    const buckets = bucketByDue(items, TZ, NOW);

    expect(buckets.map((bucket) => bucket.kind)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "week",
      "later",
      "none",
    ]);
    expect(buckets.map((bucket) => ids(bucket.items))).toEqual([
      ["overdue"],
      ["today"],
      ["tomorrow"],
      ["week"],
      ["later"],
      ["none"],
    ]);
  });

  it("treats the seventh day out as this week and the eighth as later", () => {
    const items = [
      makeItem("day-7", { dueDate: "2026-08-27" }),
      makeItem("day-8", { dueDate: "2026-08-28" }),
    ];

    const buckets = bucketByDue(items, TZ, NOW);

    expect(buckets.find((bucket) => bucket.kind === "week")?.items.map((i) => i.id)).toEqual(["day-7"]);
    expect(buckets.find((bucket) => bucket.kind === "later")?.items.map((i) => i.id)).toEqual(["day-8"]);
  });

  it("puts completed items in a done bucket last, however overdue they are", () => {
    const items = [
      makeItem("finished", { status: "done", dueDate: "2026-08-01" }),
      makeItem("still-open", { dueDate: "2026-08-01" }),
    ];

    const buckets = bucketByDue(items, TZ, NOW);

    expect(buckets.map((bucket) => bucket.kind)).toEqual(["overdue", "done"]);
    expect(ids(buckets[0].items)).toEqual(["still-open"]);
    expect(ids(buckets[1].items)).toEqual(["finished"]);
  });

  it("omits buckets that have no items", () => {
    const buckets = bucketByDue([makeItem("only", { dueDate: "2026-08-20" })], TZ, NOW);

    expect(buckets.map((bucket) => bucket.kind)).toEqual(["today"]);
  });

  it("sorts within a bucket by due date", () => {
    const items = [
      makeItem("second", { dueDate: "2026-08-19" }),
      makeItem("first", { dueDate: "2026-08-15" }),
    ];

    const buckets = bucketByDue(items, TZ, NOW);

    expect(ids(buckets[0].items)).toEqual(["first", "second"]);
  });
});

describe("renderGroupedList", () => {
  it("numbers items continuously across group headers", () => {
    const items = [
      makeItem("o1", { title: "Essay draft", dueDate: "2026-08-17" }),
      makeItem("t1", { title: "Standup", dueDate: "2026-08-20", dueTime: "14:00" }),
      makeItem("n1", { title: "Buy milk" }),
    ];

    const { text } = renderGroupedList(items, TZ, NOW);

    expect(text).toContain("1. 📋 Essay draft");
    expect(text).toContain("2. 📋 14:00 Standup");
    expect(text).toContain("3. 📋 Buy milk");
  });

  it("returns itemIds in exactly printed order so /done <n> resolves", () => {
    const items = [
      makeItem("undated"),
      makeItem("today-item", { dueDate: "2026-08-20" }),
      makeItem("overdue-item", { dueDate: "2026-08-10" }),
    ];

    const { itemIds } = renderGroupedList(items, TZ, NOW);

    expect(itemIds).toEqual(["overdue-item", "today-item", "undated"]);
  });

  it("labels each group with its count", () => {
    const items = [
      makeItem("a", { dueDate: "2026-08-17" }),
      makeItem("b", { dueDate: "2026-08-18" }),
    ];

    const { text } = renderGroupedList(items, TZ, NOW);

    expect(text).toContain("Overdue (2)");
  });

  it("shows the due date on overdue items and hides it under Today", () => {
    const items = [
      makeItem("late", { title: "Late thing", dueDate: "2026-08-17" }),
      makeItem("now", { title: "Today thing", dueDate: "2026-08-20" }),
    ];

    const { text } = renderGroupedList(items, TZ, NOW);

    expect(text).toContain("Late thing — due 2026-08-17");
    expect(text).toContain("Today thing");
    expect(text).not.toContain("Today thing — due");
  });

  it("shows a short weekday alongside this week's dates", () => {
    const items = [makeItem("w", { title: "Reading", dueDate: "2026-08-22" })];

    const { text } = renderGroupedList(items, TZ, NOW);

    expect(text).toContain("Reading — Sat 2026-08-22");
  });

  it("marks reminders with a bell and their time", () => {
    const items = [makeItem("r", { title: "Take meds", remindAt: new Date("2026-08-20T01:00:00Z") })];

    const { text } = renderGroupedList(items, TZ, NOW);

    expect(text).toContain("🔔 09:00 Take meds");
  });

  it("HTML-escapes titles", () => {
    const items = [makeItem("x", { title: "Fix <script> & stuff" })];

    const { text } = renderGroupedList(items, TZ, NOW);

    expect(text).toContain("Fix &lt;script&gt; &amp; stuff");
    expect(text).not.toContain("<script>");
  });

  it("returns no text and no ids for an empty list", () => {
    expect(renderGroupedList([], TZ, NOW)).toEqual({ text: "", itemIds: [] });
  });
});

describe("renderFlatList", () => {
  it("numbers items in due-date order without group headers", () => {
    const items = [
      makeItem("b", { title: "Later thing", dueDate: "2026-09-01" }),
      makeItem("a", { title: "Sooner thing", dueDate: "2026-08-21" }),
    ];

    const { text, itemIds } = renderFlatList(items, TZ);

    expect(text).toBe("1. 📋 Sooner thing (2026-08-21)\n2. 📋 Later thing (2026-09-01)");
    expect(itemIds).toEqual(["a", "b"]);
  });

  it("keeps the given order when told not to sort", () => {
    const items = [
      makeItem("b", { title: "Later thing", dueDate: "2026-09-01" }),
      makeItem("a", { title: "Sooner thing", dueDate: "2026-08-21" }),
    ];

    expect(renderFlatList(items, TZ, { sort: false }).itemIds).toEqual(["b", "a"]);
  });

  it("includes the status when asked, for the model to read", () => {
    const items = [makeItem("a", { title: "Thing", status: "in_progress" })];

    expect(renderFlatList(items, TZ, { showStatus: true }).text).toBe("1. 📋 [in_progress] Thing");
  });

  it("shows the time alongside the date", () => {
    const items = [makeItem("a", { title: "Thing", dueDate: "2026-08-21", dueTime: "09:30" })];

    expect(renderFlatList(items, TZ).text).toBe("1. 📋 Thing (2026-08-21 09:30)");
  });
});
