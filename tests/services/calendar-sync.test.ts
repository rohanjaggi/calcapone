import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  calendarEvent: {
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
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

import { syncUserCalendar, mirrorEvent, unmirrorEvent, MIRROR_PAST_MS, MIRROR_FUTURE_MS } from "@/lib/services/calendar-sync";
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
  });

  it("makes no API call and returns a zero result when there is no refresh token", async () => {
    const result = await syncUserCalendar({ ...baseUser, googleRefreshToken: null }, NOW);

    expect(result).toEqual({ applied: 0, removed: 0, fullResync: false });
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

  it("removes the mirror row on a cancelled event", async () => {
    const cancelledEvent = event({ cancelled: true, startsAt: null, endsAt: null, googleUpdatedAt: null });
    mockCalendar.listEventChanges.mockResolvedValue({ events: [cancelledEvent], nextSyncToken: "tok-2", fullResync: false });

    const result = await syncUserCalendar(baseUser, NOW);

    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", googleEventId: "evt-1" },
    });
    expect(mockPrisma.calendarEvent.upsert).not.toHaveBeenCalled();
    expect(result.removed).toBe(1);
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

/**
 * Write-through: the app records its own Google writes in the mirror instead of waiting for
 * the next sync pass to discover them. Without it the dashboard — which reads the mirror and
 * never Google — cannot see an event the bot just created until the cron catches up.
 */
describe("mirrorEvent", () => {
  const created = {
    id: "evt-new",
    title: "Dinner",
    startTime: "2026-08-20T20:00:00+08:00",
    endTime: "2026-08-20T22:00:00+08:00",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.calendarEvent.findUnique.mockResolvedValue(null);
  });

  it("upserts the event so the dashboard sees it without waiting for a sync", async () => {
    await mirrorEvent("user-1", "primary", created, NOW);

    expect(mockPrisma.calendarEvent.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.calendarEvent.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_googleEventId: { userId: "user-1", googleEventId: "evt-new" } });
    expect(call.create).toMatchObject({
      userId: "user-1",
      googleEventId: "evt-new",
      calendarId: "primary",
      title: "Dinner",
      startsAt: new Date("2026-08-20T12:00:00.000Z"),
      endsAt: new Date("2026-08-20T14:00:00.000Z"),
      allDay: false,
    });
  });

  it("does not mirror an event beyond the mirror's forward window", async () => {
    await mirrorEvent(
      "user-1",
      "primary",
      {
        ...created,
        startTime: new Date(NOW.getTime() + MIRROR_FUTURE_MS + 86400000).toISOString(),
        endTime: new Date(NOW.getTime() + MIRROR_FUTURE_MS + 90000000).toISOString(),
      },
      NOW
    );

    expect(mockPrisma.calendarEvent.upsert).not.toHaveBeenCalled();
  });

  it("clears a sent reminder when the event moved, so the ping fires again for the new time", async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({ startsAt: new Date("2026-08-20T09:00:00.000Z") });

    await mirrorEvent("user-1", "primary", created, NOW);

    expect(mockPrisma.calendarEvent.upsert.mock.calls[0][0].update).toMatchObject({ reminderSentAt: null });
  });

  it("skips an all-day response (date, not dateTime) rather than writing an Invalid Date", async () => {
    await mirrorEvent("user-1", "primary", { ...created, startTime: "", endTime: "" }, NOW);
    expect(mockPrisma.calendarEvent.upsert).not.toHaveBeenCalled();
  });

  it("swallows a mirror failure: Google already has the event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.calendarEvent.upsert.mockRejectedValueOnce(new Error("db down"));
    await expect(mirrorEvent("user-1", "primary", created, NOW)).resolves.toBeUndefined();
  });
});

describe("unmirrorEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes the row so a deleted event leaves the dashboard immediately", async () => {
    await unmirrorEvent("user-1", "evt-gone");

    expect(mockPrisma.calendarEvent.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", googleEventId: "evt-gone" },
    });
  });
});
