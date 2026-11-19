import { describe, it, expect } from "vitest";
import { paramsToRRule, getNextOccurrence, dueDateAnchor, reanchorRule } from "@/lib/services/recurrence";
import { nextDueDate } from "@/lib/services/item";

describe("recurrence", () => {
  it("daily rule without DTSTART advances from the item's own remindAt, not from now", () => {
    const remindAt = new Date("2026-08-19T01:00:00Z");
    const rule = paramsToRRule({ frequency: "daily" });
    expect(rule).not.toMatch(/DTSTART/);
    const next = getNextOccurrence(rule, remindAt)!;
    expect(next.toISOString()).toBe("2026-08-20T01:00:00.000Z");
  });

  it("persists DTSTART when given and keeps the wall-clock time on weekly BYDAY", () => {
    const remindAt = new Date("2026-08-19T01:00:00Z"); // Wednesday
    const rule = paramsToRRule({ frequency: "weekly", byDay: ["MO", "WE"] }, remindAt);
    expect(rule).toMatch(/DTSTART/);
    const next = getNextOccurrence(rule, remindAt)!;
    expect(next.toISOString()).toBe("2026-08-24T01:00:00.000Z"); // next Monday, same time
  });

  it("skips missed occurrences when notBefore is given", () => {
    const remindAt = new Date("2026-08-01T01:00:00Z");
    const now = new Date("2026-08-19T12:00:00Z");
    const next = getNextOccurrence("FREQ=DAILY", remindAt, now)!;
    expect(next.toISOString()).toBe("2026-08-20T01:00:00.000Z");
  });

  it("respects UNTIL and COUNT", () => {
    const start = new Date("2026-08-19T01:00:00Z");
    const until = paramsToRRule({ frequency: "daily", until: "2026-08-20T00:00:00Z" }, start);
    expect(getNextOccurrence(until, start)).toBeNull();
    const count = paramsToRRule({ frequency: "daily", count: 1 }, start);
    expect(getNextOccurrence(count, start)).toBeNull();
  });

  it("a COUNT-bounded due-date rule runs out instead of repeating forever", () => {
    // "Weekly report due Fridays, stop after 3" — no remind_at, so the due date is the anchor
    const rule = paramsToRRule({ frequency: "weekly", count: 3 }, dueDateAnchor("2026-08-21"));
    expect(rule).toContain("DTSTART:20260821T000000Z");
    expect(nextDueDate("2026-08-21", rule)).toBe("2026-08-28");
    expect(nextDueDate("2026-08-28", rule)).toBe("2026-09-04");
    expect(nextDueDate("2026-09-04", rule)).toBeNull();
  });

  // "FREQ=MONTHLY" etc. with no DTSTART is exactly what migration 20261119000000 writes for
  // rows that only had the old daily/weekly/monthly enum, so these pin that it behaves the same.
  it("a migrated monthly rule handles the 31st without overflowing into March", () => {
    const jan31 = new Date("2026-01-31T01:00:00Z");
    const next = getNextOccurrence("FREQ=MONTHLY", jan31)!;
    // rrule skips months without a 31st instead of rolling into March 3rd
    expect(next.toISOString()).toBe("2026-03-31T01:00:00.000Z");
  });

  it("migrated daily/weekly rules advance from the occurrence itself", () => {
    const d = new Date("2026-08-19T01:00:00Z");
    expect(getNextOccurrence("FREQ=DAILY", d)!.toISOString()).toBe("2026-08-20T01:00:00.000Z");
    expect(getNextOccurrence("FREQ=WEEKLY", d)!.toISOString()).toBe("2026-08-26T01:00:00.000Z");
  });
});

// rrule does its weekday arithmetic in UTC; these are read in the user's zone instead.
describe("getNextOccurrence in the user's timezone", () => {
  it("keeps 'every Tuesday 7am' on Tuesdays in Singapore (it drifted to Wednesdays)", () => {
    const firstAlarm = new Date("2026-11-23T23:00:00Z"); // Tue 24 Nov, 07:00 SGT
    const rule = paramsToRRule({ frequency: "weekly", byDay: ["TU"] }, firstAlarm);
    const next = getNextOccurrence(rule, firstAlarm, undefined, "Asia/Singapore")!;
    expect(next.toISOString()).toBe("2026-11-30T23:00:00.000Z"); // Tue 1 Dec, 07:00 SGT
  });

  it("keeps a London daily 9am at 9am across the clocks changing", () => {
    const winter = new Date("2026-03-28T09:00:00Z"); // Sat 09:00 GMT
    const rule = paramsToRRule({ frequency: "daily" }, winter);
    const next = getNextOccurrence(rule, winter, undefined, "Europe/London")!;
    expect(next.toISOString()).toBe("2026-03-29T08:00:00.000Z"); // Sun 09:00 BST
  });

  it("leaves UTC (the default) unchanged", () => {
    const d = new Date("2026-08-19T01:00:00Z");
    expect(getNextOccurrence("FREQ=DAILY", d)!.toISOString()).toBe("2026-08-20T01:00:00.000Z");
  });
});

describe("reanchorRule", () => {
  // "Move my 9am meds to 8am" changed only the alarm, so the old 9am start kept firing too.
  it("restarts the rule at the new time", () => {
    const rule = paramsToRRule({ frequency: "daily" }, new Date("2026-11-18T01:00:00Z"));
    const moved = reanchorRule(rule, new Date("2026-11-20T00:00:00Z"))!;
    expect(moved).toContain("DTSTART:20261120T000000Z");
    expect(getNextOccurrence(moved, new Date("2026-11-20T00:00:00Z"), undefined, "Asia/Singapore")!.toISOString()).toBe(
      "2026-11-21T00:00:00.000Z"
    );
  });
});
