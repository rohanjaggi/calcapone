import { describe, it, expect } from "vitest";
import { normalizeDueDate, normalizeDueTime } from "@/lib/due-format";

const SG = "Asia/Singapore";

describe("normalizeDueDate", () => {
  it("passes through an already-correct YYYY-MM-DD", () => {
    expect(normalizeDueDate("2026-08-25", SG)).toBe("2026-08-25");
  });

  it("accepts a real calendar date but rejects a fake one", () => {
    expect(normalizeDueDate("2026-02-28", SG)).toBe("2026-02-28");
    expect(normalizeDueDate("2026-02-31", SG)).toBeNull();
    expect(normalizeDueDate("2026-13-01", SG)).toBeNull();
  });

  it("converts a full ISO datetime to the calendar date as seen in tz", () => {
    // 23:00 UTC is 07:00 the next day in Singapore (UTC+8).
    expect(normalizeDueDate("2026-08-25T23:00:00Z", SG)).toBe("2026-08-26");
    expect(normalizeDueDate("2026-08-25T23:00:00Z", "America/New_York")).toBe("2026-08-25");
  });

  it("converts an offset ISO datetime the same way", () => {
    expect(normalizeDueDate("2026-08-25T23:00:00+08:00", SG)).toBe("2026-08-25");
  });

  it("treats a naive ISO datetime as wall-clock time in tz", () => {
    expect(normalizeDueDate("2026-08-25T15:30:00", SG)).toBe("2026-08-25");
  });

  it("returns null for junk", () => {
    expect(normalizeDueDate("Friday", SG)).toBeNull();
    expect(normalizeDueDate("next week", SG)).toBeNull();
    expect(normalizeDueDate("9am", SG)).toBeNull();
    expect(normalizeDueDate("", SG)).toBeNull();
    expect(normalizeDueDate(null, SG)).toBeNull();
    expect(normalizeDueDate(undefined, SG)).toBeNull();
    expect(normalizeDueDate(12345, SG)).toBeNull();
    expect(normalizeDueDate(new Date(), SG)).toBeNull();
  });
});

describe("normalizeDueTime", () => {
  it("passes through an already-correct HH:mm", () => {
    expect(normalizeDueTime("09:05")).toBe("09:05");
    expect(normalizeDueTime("23:59")).toBe("23:59");
    expect(normalizeDueTime("00:00")).toBe("00:00");
  });

  it("zero-pads a single-digit hour", () => {
    expect(normalizeDueTime("9:05")).toBe("09:05");
  });

  it("drops seconds from HH:mm:ss", () => {
    expect(normalizeDueTime("09:05:30")).toBe("09:05");
  });

  it("rejects out-of-range hours and minutes", () => {
    expect(normalizeDueTime("25:00")).toBeNull();
    expect(normalizeDueTime("12:60")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(normalizeDueTime("9am")).toBeNull();
    expect(normalizeDueTime("noon")).toBeNull();
    expect(normalizeDueTime("")).toBeNull();
    expect(normalizeDueTime(null)).toBeNull();
    expect(normalizeDueTime(undefined)).toBeNull();
    expect(normalizeDueTime(930)).toBeNull();
  });
});
