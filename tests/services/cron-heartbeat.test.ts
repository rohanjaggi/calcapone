import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  cronHeartbeat: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { touchHeartbeat, STALE_TICK_MS } from "@/lib/services/cron-utils";

const NOW = new Date("2026-08-20T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.cronHeartbeat.upsert.mockResolvedValue({});
});

describe("touchHeartbeat", () => {
  it("does not report stale on the first ever tick", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue(null);
    expect(await touchHeartbeat("reminders", NOW)).toBe(false);
  });

  it("reports stale when the previous tick was 20 minutes ago", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: ago(20 * 60 * 1000),
    });
    expect(await touchHeartbeat("reminders", NOW)).toBe(true);
  });

  it("stays quiet when the previous tick was 2 minutes ago", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: ago(2 * 60 * 1000),
    });
    expect(await touchHeartbeat("reminders", NOW)).toBe(false);
  });

  it("stays quiet at exactly the threshold, so a merely-late tick doesn't cry wolf", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: ago(STALE_TICK_MS),
    });
    expect(await touchHeartbeat("reminders", NOW)).toBe(false);
  });

  it("records the tick even when it reports stale", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "reminders",
      lastTickAt: ago(60 * 60 * 1000),
    });
    await touchHeartbeat("reminders", NOW);
    expect(mockPrisma.cronHeartbeat.upsert).toHaveBeenCalledWith({
      where: { job: "reminders" },
      create: { job: "reminders", lastTickAt: NOW },
      update: { lastTickAt: NOW },
    });
  });

  it("keeps jobs independent", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue(null);
    await touchHeartbeat("sync", NOW);
    expect(mockPrisma.cronHeartbeat.findUnique).toHaveBeenCalledWith({ where: { job: "sync" } });
  });
});
