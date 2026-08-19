import { describe, it, expect } from "vitest";
import { parseInTz, formatDateInTz, formatHHmmInTz, offsetInTz, todayInTz, combineDateTimeInTz, endOfDayInTz, weekdayInTz } from "@/lib/tz";

const SG = "Asia/Singapore";
const LON = "Europe/London";

describe("tz helpers", () => {
  it("parses naive datetimes as wall-clock time in the user's zone", () => {
    const d = parseInTz("2026-08-20T15:00:00", SG)!;
    expect(d.toISOString()).toBe("2026-08-20T07:00:00.000Z");
    expect(parseInTz("2026-08-20T15:00", SG)!.toISOString()).toBe("2026-08-20T07:00:00.000Z");
    expect(parseInTz("2026-08-20 15:00", SG)!.toISOString()).toBe("2026-08-20T07:00:00.000Z");
  });

  it("keeps explicit offsets / Z untouched", () => {
    expect(parseInTz("2026-08-20T15:00:00+08:00", SG)!.toISOString()).toBe("2026-08-20T07:00:00.000Z");
    expect(parseInTz("2026-08-20T07:00:00Z", SG)!.toISOString()).toBe("2026-08-20T07:00:00.000Z");
    expect(parseInTz("2026-08-20T07:00:00.000Z", LON)!.toISOString()).toBe("2026-08-20T07:00:00.000Z");
  });

  it("treats date-only strings as local midnight in the zone", () => {
    expect(parseInTz("2026-08-20", SG)!.toISOString()).toBe("2026-08-19T16:00:00.000Z");
  });

  it("handles DST zones", () => {
    expect(parseInTz("2026-07-01T09:00:00", LON)!.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(parseInTz("2026-01-01T09:00:00", LON)!.toISOString()).toBe("2026-01-01T09:00:00.000Z");
    expect(offsetInTz(new Date("2026-07-01T12:00:00Z"), LON)).toBe("+01:00");
    expect(offsetInTz(new Date("2026-07-01T12:00:00Z"), SG)).toBe("+08:00");
  });

  it("returns null for garbage", () => {
    expect(parseInTz("", SG)).toBeNull();
    expect(parseInTz("not a date", SG)).toBeNull();
    expect(parseInTz(null, SG)).toBeNull();
  });

  it("formats date / time / weekday in zone", () => {
    const d = new Date("2026-08-19T17:30:00Z"); // 01:30 next day in SG
    expect(formatDateInTz(d, SG)).toBe("2026-08-20");
    expect(formatHHmmInTz(d, SG)).toBe("01:30");
    expect(formatHHmmInTz(new Date("2026-08-19T16:05:00Z"), SG)).toBe("00:05");
    expect(todayInTz(SG, d)).toBe("2026-08-20");
    expect(weekdayInTz(d, SG)).toBe("Thursday");
  });

  it("combines date+time and computes exclusive day end", () => {
    expect(combineDateTimeInTz("2026-08-20", "09:00", SG).toISOString()).toBe("2026-08-20T01:00:00.000Z");
    expect(endOfDayInTz("2026-08-31", SG).toISOString()).toBe("2026-08-31T16:00:00.000Z");
  });
});
