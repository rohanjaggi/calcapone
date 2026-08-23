import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSyncUserCalendar = vi.hoisted(() => vi.fn());
const mockFindDueEventReminders = vi.hoisted(() => vi.fn());
const mockNotifyOwner = vi.hoisted(() => vi.fn());
const mockPrisma = vi.hoisted(() => ({
  user: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  cronHeartbeat: { findUnique: vi.fn(), upsert: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/calendar-sync", () => ({ syncUserCalendar: mockSyncUserCalendar }));
vi.mock("@/lib/services/calendar", () => ({ CalendarAuthError: class CalendarAuthError extends Error {} }));
vi.mock("@/lib/services/calendar-link", () => ({ markCalendarDisconnected: vi.fn() }));
vi.mock("@/lib/services/conflict", () => ({ conflictKeyboard: vi.fn() }));
vi.mock("@/lib/services/event-reminders", () => ({
  findDueEventReminders: mockFindDueEventReminders,
  claimEventReminder: vi.fn(),
  releaseEventReminder: vi.fn(),
  formatEventReminder: vi.fn(),
}));
vi.mock("@/lib/services/telegram", () => ({
  sendMessage: vi.fn(),
  esc: (t: unknown) => String(t ?? ""),
  b: (t: unknown) => `<b>${t}</b>`,
  TelegramBlockedError: class TelegramBlockedError extends Error {},
}));
vi.mock("@/lib/services/alert", () => ({ notifyOwner: mockNotifyOwner }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/sync/route";
import { STALE_TICK_MS } from "@/lib/services/cron-utils";

const SECRET = "test-cron-secret";
const request = () =>
  new NextRequest("http://localhost/api/cron/sync", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  });

/**
 * A sync that stops being called fails silently: nothing errors, the mirror simply stops
 * moving, and the first symptom is an event missing from the dashboard days later. The tick
 * noticing its own gap is what turns that into a ping.
 */
describe("cron/sync heartbeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.cronHeartbeat.upsert.mockResolvedValue({});
    mockFindDueEventReminders.mockResolvedValue([]);
  });

  it("alerts the owner when the previous sync tick was too long ago", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "sync",
      lastTickAt: new Date(Date.now() - (STALE_TICK_MS + 60_000)),
    });

    await POST(request());

    expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    expect(String(mockNotifyOwner.mock.calls[0][1])).toMatch(/scheduler/i);
  });

  it("stays quiet when the previous tick was recent", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue({
      job: "sync",
      lastTickAt: new Date(Date.now() - 60_000),
    });

    await POST(request());

    expect(mockNotifyOwner).not.toHaveBeenCalled();
  });

  it("does not alert on the very first tick, so a fresh deploy stays quiet", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue(null);

    await POST(request());

    expect(mockNotifyOwner).not.toHaveBeenCalled();
  });

  it("records the tick under its own job key, separate from reminders", async () => {
    mockPrisma.cronHeartbeat.findUnique.mockResolvedValue(null);

    await POST(request());

    expect(mockPrisma.cronHeartbeat.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.cronHeartbeat.upsert.mock.calls[0][0].where).toEqual({ job: "sync" });
  });
});
