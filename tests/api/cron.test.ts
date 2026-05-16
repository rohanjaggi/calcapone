import { describe, it, expect } from "vitest";
import { createNextOccurrence } from "@/lib/services/reminder";

describe("Cron reminder processing", () => {
  it("creates correct next occurrence for daily", () => {
    const base = new Date("2026-05-16T08:00:00Z");
    const next = createNextOccurrence(base, "daily");
    expect(next.toISOString()).toBe("2026-05-17T08:00:00.000Z");
  });

  it("creates correct next occurrence for weekly", () => {
    const base = new Date("2026-05-16T08:00:00Z");
    const next = createNextOccurrence(base, "weekly");
    expect(next.toISOString()).toBe("2026-05-23T08:00:00.000Z");
  });
});
