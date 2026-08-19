import { describe, it, expect } from "vitest";
import { meetsPriorityFloor, isQuietHours, shouldNotify } from "@/lib/services/cron-utils";

const user = (over: Partial<{ quietStart: string | null; quietEnd: string | null; notifyMinPriority: "low" | "medium" | "high"; timezone: string }> = {}) => ({
  quietStart: null as string | null,
  quietEnd: null as string | null,
  notifyMinPriority: "low" as const,
  timezone: "Asia/Singapore",
  ...over,
});

/** An instant that reads as `hh:mm` in Asia/Singapore (UTC+8, no DST). */
const sgt = (hh: number, mm = 0) => new Date(Date.UTC(2026, 5, 15, hh - 8, mm));

describe("meetsPriorityFloor", () => {
  it("passes at or above the floor", () => {
    expect(meetsPriorityFloor(user({ notifyMinPriority: "medium" }), "medium")).toBe(true);
    expect(meetsPriorityFloor(user({ notifyMinPriority: "medium" }), "high")).toBe(true);
  });

  it("blocks below the floor", () => {
    expect(meetsPriorityFloor(user({ notifyMinPriority: "medium" }), "low")).toBe(false);
    expect(meetsPriorityFloor(user({ notifyMinPriority: "high" }), "medium")).toBe(false);
  });

  it("lets everything through at the lowest floor", () => {
    expect(meetsPriorityFloor(user({ notifyMinPriority: "low" }), "low")).toBe(true);
  });
});

describe("isQuietHours", () => {
  it("is false when quiet hours are unset", () => {
    expect(isQuietHours(user(), sgt(3))).toBe(false);
    expect(isQuietHours(user({ quietStart: "22:00" }), sgt(3))).toBe(false);
    expect(isQuietHours(user({ quietEnd: "08:00" }), sgt(3))).toBe(false);
  });

  it("handles a window that wraps past midnight", () => {
    const u = user({ quietStart: "22:00", quietEnd: "08:00" });
    expect(isQuietHours(u, sgt(23))).toBe(true);
    expect(isQuietHours(u, sgt(0))).toBe(true); // midnight itself
    expect(isQuietHours(u, sgt(3))).toBe(true);
    expect(isQuietHours(u, sgt(7, 59))).toBe(true);
    expect(isQuietHours(u, sgt(8))).toBe(false); // end is exclusive
    expect(isQuietHours(u, sgt(12))).toBe(false);
    expect(isQuietHours(u, sgt(21, 59))).toBe(false);
    expect(isQuietHours(u, sgt(22))).toBe(true); // start is inclusive
  });

  it("handles a same-day window", () => {
    const u = user({ quietStart: "13:00", quietEnd: "14:00" });
    expect(isQuietHours(u, sgt(12, 59))).toBe(false);
    expect(isQuietHours(u, sgt(13))).toBe(true);
    expect(isQuietHours(u, sgt(13, 30))).toBe(true);
    expect(isQuietHours(u, sgt(14))).toBe(false);
  });

  it("evaluates in the user's timezone, not the server's", () => {
    const u = user({ quietStart: "22:00", quietEnd: "08:00", timezone: "America/New_York" });
    // 02:00 UTC = 22:00 previous day in New York (EDT) — quiet there, midday in Singapore.
    const instant = new Date("2026-06-15T02:00:00Z");
    expect(isQuietHours(u, instant)).toBe(true);
    expect(isQuietHours({ ...u, timezone: "Asia/Singapore" }, instant)).toBe(false);
  });
});

describe("shouldNotify", () => {
  it("requires both the priority floor and being outside quiet hours", () => {
    const u = user({ quietStart: "22:00", quietEnd: "08:00", notifyMinPriority: "medium" });
    expect(shouldNotify(u, "high", sgt(12))).toBe(true);
    expect(shouldNotify(u, "low", sgt(12))).toBe(false);
    expect(shouldNotify(u, "high", sgt(23))).toBe(false);
  });
});
