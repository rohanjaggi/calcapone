import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  calendarEvent: {
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  item: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockCalendar = vi.hoisted(() => ({
  listEventChanges: vi.fn(),
  // Must be the same class the implementation throws/checks with `instanceof`, so it's
  // defined here (inside vi.hoisted) rather than imported from the real module.
  CalendarAuthError: class CalendarAuthError extends Error {},
}));

vi.mock("@/lib/services/calendar", () => ({
  listEventChanges: mockCalendar.listEventChanges,
  CalendarAuthError: mockCalendar.CalendarAuthError,
}));

import { syncUserCalendar, MIRROR_PAST_MS, MIRROR_FUTURE_MS } from "@/lib/services/calendar-sync";
import { CalendarAuthError } from "@/lib/services/calendar";
import type { SyncedEvent } from "@/lib/services/calendar";

const NOW = new Date("2026-08-20T10:00:00.000Z");

const baseUser = {
  id: "user-1",
  googleRefreshToken: "enc-refresh-token",
  googleCalendarId: "primary",
  timezone: "Asia/Singapore",
  googleSyncToken: "stored-token",
};

function event(overrides: Partial<SyncedEvent> = {}): SyncedEvent {
  return {
    googleEventId: "evt-1",
    title: "Standup",
    description: null,
    startsAt: new Date("2026-08-20T12:00:00.000Z"),
    endsAt: new Date("2026-08-20T12:30:00.000Z"),
    allDay: false,
    transparent: false,
    googleUpdatedAt: new Date("2026-08-20T09:00:00.000Z"),
    cancelled: false,
    ...overrides,
  };
}

describe("syncUserCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.calendarEvent.findUnique.mockResolvedValue(null);
    mockPrisma.item.findFirst.mockResolvedValue(null);
  });

  it("makes no API call and returns a zero result when there is no refresh token", async () => {
    const result = await syncUserCalendar({ ...baseUser, googleRefreshToken: null }, NOW);

    expect(result).toEqual({ applied: 0, removed: 0, conflicts: [], fullResync: false });
    expect(mockCalendar.listEventChanges).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("wipes the mirror first on a full resync but not on an incremental one", async () => {
    mockCalendar.listEventChanges.mockResolvedValue({ events: [], nextSyncToken: "tok-2", fullResync: true });

    await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });

    mockPrisma.calendarEvent.deleteMany.mockClear();
    mockCalendar.listEventChanges.mockResolvedValue({ events: [], nextSyncToken: "tok-3", fullResync: false });

    await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.calendarEvent.deleteMany).not.toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("removes the mirror row and nulls the linked item's googleEventId on a cancelled event, without deleting the item", async () => {
    const cancelledEvent = event({ cancelled: true, startsAt: null, endsAt: null, googleUpdatedAt: null });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [cancelledEvent], nextSyncToken: "tok-2", fullResync: false });
    mockPrisma.item.findFirst.mockResolvedValue({
      id: "item-1",
      title: "Daily standup",
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      calendarSyncedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", googleEventId: "evt-1" },
    });
    expect(mockPrisma.calendarEvent.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: "item-1", userId: "user-1" },
      data: { googleEventId: null },
    });
    expect(result.removed).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("removes (rather than stores) an event moved outside the mirror window", async () => {
    const farFuture = new Date(NOW.getTime() + MIRROR_FUTURE_MS + 24 * 60 * 60 * 1000);
    const movedEvent = event({ startsAt: farFuture, endsAt: farFuture });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [movedEvent], nextSyncToken: "tok-2", fullResync: false });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", googleEventId: "evt-1" },
    });
    expect(mockPrisma.calendarEvent.upsert).not.toHaveBeenCalled();
    expect(result.removed).toBe(1);
    expect(result.applied).toBe(0);
  });

  it("also drops an event just past the mirror's past boundary", async () => {
    const farPast = new Date(NOW.getTime() - MIRROR_PAST_MS - 24 * 60 * 60 * 1000);
    const oldEvent = event({ startsAt: farPast, endsAt: farPast });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [oldEvent], nextSyncToken: "tok-2", fullResync: false });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(result.removed).toBe(1);
    expect(mockPrisma.calendarEvent.upsert).not.toHaveBeenCalled();
  });

  it("clears reminderSentAt when the start time changed", async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({ startsAt: new Date("2026-08-20T11:00:00.000Z") });
    const movedEvent = event({ startsAt: new Date("2026-08-20T12:00:00.000Z") });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [movedEvent], nextSyncToken: "tok-2", fullResync: false });

    await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.calendarEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ reminderSentAt: null }) })
    );
  });

  it("leaves reminderSentAt alone when the start time is unchanged", async () => {
    const unchanged = event({ startsAt: new Date("2026-08-20T12:00:00.000Z") });
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({ startsAt: unchanged.startsAt });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [unchanged], nextSyncToken: "tok-2", fullResync: false });

    await syncUserCalendar(baseUser, NOW);

    const call = mockPrisma.calendarEvent.upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("reminderSentAt");
  });

  it("reports a conflict and leaves the item untouched when both sides changed since the last agreement", async () => {
    const changed = event({ googleUpdatedAt: new Date("2026-08-20T09:00:00.000Z") });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [changed], nextSyncToken: "tok-2", fullResync: false });
    mockPrisma.item.findFirst.mockResolvedValue({
      id: "item-1",
      title: "Standup (local edit)",
      updatedAt: new Date("2026-08-20T08:00:00.000Z"),
      calendarSyncedAt: new Date("2026-08-19T00:00:00.000Z"),
    });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(result.conflicts).toEqual([
      {
        itemId: "item-1",
        itemTitle: "Standup (local edit)",
        googleEventId: "evt-1",
        googleTitle: "Standup",
        googleStartsAt: changed.startsAt,
      },
    ]);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("lets Google win and updates the item when only Google changed", async () => {
    const changed = event({ googleUpdatedAt: new Date("2026-08-20T09:00:00.000Z") });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [changed], nextSyncToken: "tok-2", fullResync: false });
    mockPrisma.item.findFirst.mockResolvedValue({
      id: "item-1",
      title: "Standup",
      updatedAt: new Date("2026-08-18T00:00:00.000Z"), // not touched locally since the last sync
      calendarSyncedAt: new Date("2026-08-19T00:00:00.000Z"),
    });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(result.conflicts).toEqual([]);
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: "item-1", userId: "user-1" },
      data: {
        title: "Standup",
        dueDate: "2026-08-20",
        dueTime: "20:00", // Asia/Singapore is UTC+8
        calendarSyncedAt: NOW,
      },
    });
  });

  it("treats a never-synced item (calendarSyncedAt null) as having nothing to conflict with", async () => {
    const changed = event();
    mockCalendar.listEventChanges.mockResolvedValue({ events: [changed], nextSyncToken: "tok-2", fullResync: false });
    mockPrisma.item.findFirst.mockResolvedValue({
      id: "item-1",
      title: "Standup",
      updatedAt: new Date("2026-08-20T09:30:00.000Z"),
      calendarSyncedAt: null,
    });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(result.conflicts).toEqual([]);
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-1", userId: "user-1" } })
    );
  });

  it("persists the returned sync token and lastCalendarSyncAt", async () => {
    mockCalendar.listEventChanges.mockResolvedValue({ events: [], nextSyncToken: "tok-fresh", fullResync: false });

    await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { googleSyncToken: "tok-fresh", lastCalendarSyncAt: NOW },
    });
  });

  it("lets a CalendarAuthError propagate instead of swallowing it", async () => {
    mockCalendar.listEventChanges.mockRejectedValue(new CalendarAuthError());

    await expect(syncUserCalendar(baseUser, NOW)).rejects.toBeInstanceOf(CalendarAuthError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
