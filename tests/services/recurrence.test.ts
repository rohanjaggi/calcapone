import { describe, it, expect } from "vitest";
import { paramsToRRule, getNextOccurrence, dueDateAnchor } from "@/lib/services/recurrence";
import { createNextOccurrence, nextDueDate } from "@/lib/services/item";

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

  it("legacy monthly handles the 31st without overflowing into March", () => {
    const jan31 = new Date("2026-01-31T01:00:00Z");
    const next = createNextOccurrence(jan31, "monthly", null)!;
    // rrule skips months without a 31st instead of rolling into March 3rd
    expect(next.toISOString()).toBe("2026-03-31T01:00:00.000Z");
  });

  it("legacy daily/weekly and 'none'", () => {
    const d = new Date("2026-08-19T01:00:00Z");
    expect(createNextOccurrence(d, "daily", null)!.toISOString()).toBe("2026-08-20T01:00:00.000Z");
    expect(createNextOccurrence(d, "weekly", null)!.toISOString()).toBe("2026-08-26T01:00:00.000Z");
    expect(createNextOccurrence(d, "none", null)).toBeNull();
  });
});
