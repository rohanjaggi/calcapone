import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  item: { findMany: vi.fn(), update: vi.fn((args: unknown) => args) },
  user: { update: vi.fn((args: unknown) => args), updateMany: vi.fn((args: unknown) => args) },
  calendarEvent: { deleteMany: vi.fn((args: unknown) => args) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/encryption", () => ({ encrypt: vi.fn(), decrypt: vi.fn() }));

import { changeTimezone } from "@/lib/services/user";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";

beforeEach(() => vi.clearAllMocks());

// A London user who started on the Singapore default: their "9am" reminder was 01:00 UTC, and
// switching the zone used to leave it there — ringing at 1am or 2am London time.
describe("changeTimezone", () => {
  it("keeps each pending reminder at the same clock time in the new zone", async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: "i1", remindAt: new Date("2026-11-20T01:00:00Z"), recurrenceRule: null }, // 09:00 SGT
    ]);

    const moved = await changeTimezone("u1", "Asia/Singapore", "Europe/London");

    expect(moved).toBe(1);
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { remindAt: new Date("2026-11-20T09:00:00Z"), recurrenceRule: null }, // 09:00 GMT
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { timezone: "Europe/London" } });
  });

  it("moves a repeating rule's start the same way, since its times are read in the user's zone", async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: "i1", remindAt: new Date("2026-11-20T01:00:00Z"), recurrenceRule: "DTSTART:20261118T010000Z\nRRULE:FREQ=DAILY" },
    ]);

    await changeTimezone("u1", "Asia/Singapore", "Europe/London");

    const rule = (mockPrisma.item.update.mock.calls[0][0] as { data: { recurrenceRule: string } }).data.recurrenceRule;
    expect(rule).toContain("DTSTART:20261118T090000Z");
  });
});

describe("markCalendarDisconnected", () => {
  // Left behind, Home kept showing the old events and the cron kept pinging about them.
  it("also clears the local calendar copy and its sync state", async () => {
    await markCalendarDisconnected("u1");

    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { googleRefreshToken: null, googleSyncToken: null, lastCalendarSyncAt: null },
    });
  });
});
