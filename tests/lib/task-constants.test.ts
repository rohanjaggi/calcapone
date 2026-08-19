import { describe, it, expect } from "vitest";
import { formatDueDate, formatTime } from "@/lib/task-constants";

describe("formatDueDate", () => {
  it("renders the date that was stored, not the UTC-shifted one", () => {
    // new Date("2026-06-15") is UTC midnight — the 14th in every Americas timezone.
    expect(formatDueDate("2026-06-15")).toBe("Jun 15");
    expect(formatDueDate("2026-01-01")).toBe("Jan 1");
    expect(formatDueDate("2026-12-31")).toBe("Dec 31");
  });

  it("accepts custom formatting options", () => {
    expect(formatDueDate("2026-06-15", { weekday: "long" })).toBe("Monday");
  });

  it("passes through anything that isn't a date", () => {
    expect(formatDueDate("")).toBe("");
    expect(formatDueDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatTime", () => {
  it("renders 12-hour times", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("09:05")).toBe("9:05 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("23:59")).toBe("11:59 PM");
  });
});
