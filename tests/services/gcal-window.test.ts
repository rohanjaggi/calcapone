import { describe, it, expect } from "vitest";
import { dueWindowToGcal } from "@/lib/services/gcal-window";

describe("dueWindowToGcal", () => {
  it("makes a one-hour block", () => {
    expect(dueWindowToGcal("2026-06-15", "09:00")).toEqual({
      startTime: "2026-06-15T09:00:00",
      endTime: "2026-06-15T10:00:00",
    });
  });

  it("keeps the minutes", () => {
    expect(dueWindowToGcal("2026-06-15", "14:45")).toEqual({
      startTime: "2026-06-15T14:45:00",
      endTime: "2026-06-15T15:45:00",
    });
  });

  it("rolls past midnight onto the next day", () => {
    expect(dueWindowToGcal("2026-06-15", "23:30")).toEqual({
      startTime: "2026-06-15T23:30:00",
      endTime: "2026-06-16T00:30:00",
    });
  });

  it("handles exactly 23:00 without wrapping", () => {
    expect(dueWindowToGcal("2026-06-15", "23:00")).toEqual({
      startTime: "2026-06-15T23:00:00",
      endTime: "2026-06-16T00:00:00",
    });
  });

  it("rolls over a month boundary", () => {
    expect(dueWindowToGcal("2026-06-30", "23:15").endTime).toBe("2026-07-01T00:15:00");
  });

  it("rolls over a year boundary", () => {
    expect(dueWindowToGcal("2026-12-31", "23:15").endTime).toBe("2027-01-01T00:15:00");
  });

  it("handles a leap day", () => {
    expect(dueWindowToGcal("2028-02-28", "23:15").endTime).toBe("2028-02-29T00:15:00");
  });

  it("always returns an end after the start", () => {
    for (let h = 0; h < 24; h++) {
      const { startTime, endTime } = dueWindowToGcal("2026-06-15", `${String(h).padStart(2, "0")}:30`);
      expect(endTime > startTime).toBe(true);
    }
  });
});
