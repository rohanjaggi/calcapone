import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  item: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  calendarEvent: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockCalendar = vi.hoisted(() => ({
  updateEvent: vi.fn(),
  // Must be the same class the implementation throws/checks with `instanceof`, so it's
  // defined here (inside vi.hoisted) rather than imported from the real module.
  CalendarAuthError: class CalendarAuthError extends Error {
    constructor(message = "Google Calendar access was revoked") {
      super(message);
      this.name = "CalendarAuthError";
    }
  },
}));

vi.mock("@/lib/services/calendar", () => ({
  updateEvent: mockCalendar.updateEvent,
  CalendarAuthError: mockCalendar.CalendarAuthError,
}));

// Taking Google's version goes through `updateItem`, not a raw write, because only that path
// resets the escalation stage when the deadline moves.
const mockItem = vi.hoisted(() => ({ updateItem: vi.fn() }));
vi.mock("@/lib/services/item", () => ({ updateItem: mockItem.updateItem }));

import { conflictKeyboard, parseConflictData, resolveConflict, type ConflictUser } from "@/lib/services/conflict";
import { CalendarAuthError } from "@/lib/services/calendar";
import { MAX_CALLBACK_DATA_BYTES } from "@/lib/services/telegram";

// A real 36-char UUID, per the spec's requirement to assert byte length against one.
const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("parseConflictData", () => {
  it("round-trips the 'keep mine' button conflictKeyboard emits", () => {
    const [[mineButton]] = conflictKeyboard(UUID);
    expect(parseConflictData(mineButton.callback_data)).toEqual({ itemId: UUID, side: "mine" });
  });

  it("round-trips the 'take Google's' button conflictKeyboard emits", () => {
    const [[, googleButton]] = conflictKeyboard(UUID);
    expect(parseConflictData(googleButton.callback_data)).toEqual({ itemId: UUID, side: "google" });
  });

  it("rejects a wrong verb", () => {
    expect(parseConflictData(`x:${UUID}:m`)).toBeNull();
  });

  it("rejects a missing item id", () => {
    expect(parseConflictData("c::m")).toBeNull();
  });

  it("rejects an unknown side", () => {
    expect(parseConflictData(`c:${UUID}:x`)).toBeNull();
  });

  it("rejects an empty side", () => {
    expect(parseConflictData(`c:${UUID}:`)).toBeNull();
  });

  it("rejects a missing side", () => {
    expect(parseConflictData(`c:${UUID}`)).toBeNull();
  });

  it("rejects the empty string", () => {
    expect(parseConflictData("")).toBeNull();
  });
});

describe("conflictKeyboard", () => {
  it("emits exactly the mine/google payloads", () => {
    expect(conflictKeyboard(UUID)).toEqual([
      [
        { text: "📱 Keep mine", callback_data: `c:${UUID}:m` },
        { text: "📅 Take Google's", callback_data: `c:${UUID}:g` },
      ],
    ]);
  });

  it("keeps every payload within Telegram's callback_data byte cap and parseable", () => {
    const keyboard = conflictKeyboard(UUID);
    for (const row of keyboard) {
      for (const button of row) {
        expect(Buffer.byteLength(button.callback_data, "utf8")).toBeLessThanOrEqual(MAX_CALLBACK_DATA_BYTES);
        expect(parseConflictData(button.callback_data)).not.toBeNull();
      }
    }
  });
});

describe("resolveConflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const now = new Date("2026-08-20T10:00:00.000Z");

  const user = (over: Partial<ConflictUser> = {}): ConflictUser => ({
    id: "u1",
    timezone: "Asia/Singapore",
    googleRefreshToken: "enc-refresh-token",
    googleCalendarId: "primary",
    ...over,
  });

  const item = (over: Record<string, unknown> = {}) => ({
    id: "i1",
    userId: "u1",
    title: "Buy milk",
    dueDate: "2026-08-25",
    dueTime: "14:30",
    googleEventId: "gevt1",
    ...over,
  });

  describe("side: mine", () => {
    it("pushes the item's title and due window to Google, then stamps calendarSyncedAt", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());
      mockCalendar.updateEvent.mockResolvedValue({});
      mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

      const result = await resolveConflict("i1", "mine", user(), now);

      expect(mockCalendar.updateEvent).toHaveBeenCalledWith(
        "enc-refresh-token",
        "primary",
        "gevt1",
        { title: "Buy milk", startTime: "2026-08-25T14:30:00", endTime: "2026-08-25T15:30:00" },
        "Asia/Singapore"
      );
      expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
        where: { id: "i1", userId: "u1" },
        data: { calendarSyncedAt: now },
      });
      expect(result).toEqual({
        ok: true,
        text: "📱 Kept your version of <b>Buy milk</b> — Google updated to match.",
        toast: "Kept yours",
      });
    });

    it("falls back to 'primary' when the user has no googleCalendarId", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());
      mockCalendar.updateEvent.mockResolvedValue({});
      mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

      await resolveConflict("i1", "mine", user({ googleCalendarId: null }), now);

      expect(mockCalendar.updateEvent).toHaveBeenCalledWith(
        "enc-refresh-token",
        "primary",
        "gevt1",
        expect.anything(),
        "Asia/Singapore"
      );
    });

    it("sends only the title, no window, when the item has no dueTime", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item({ dueTime: null }));
      mockCalendar.updateEvent.mockResolvedValue({});
      mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

      await resolveConflict("i1", "mine", user(), now);

      expect(mockCalendar.updateEvent).toHaveBeenCalledWith(
        "enc-refresh-token",
        "primary",
        "gevt1",
        { title: "Buy milk" },
        "Asia/Singapore"
      );
    });
  });

  describe("side: google", () => {
    // 20:30 UTC on the 19th is 04:30 SGT on the 20th — a different calendar day in UTC than
    // in the user's timezone. This is the exact case the tz-aware formatting exists to get
    // right; formatting off the raw UTC date/time would land on 2026-08-19 instead.
    const mirroredEvent = (over: Record<string, unknown> = {}) => ({
      id: "ce1",
      userId: "u1",
      googleEventId: "gevt1",
      title: "Team standup",
      startsAt: new Date("2026-08-19T20:30:00.000Z"),
      allDay: false,
      ...over,
    });

    it("copies the mirrored event's title and start into the item, in the user's timezone", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(mirroredEvent());
      mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

      const result = await resolveConflict("i1", "google", user(), now);

      expect(mockPrisma.calendarEvent.findFirst).toHaveBeenCalledWith({
        where: { userId: "u1", googleEventId: "gevt1" },
      });
      expect(mockItem.updateItem).toHaveBeenCalledWith("i1", "u1", {
        title: "Team standup",
        dueDate: "2026-08-20",
        dueTime: "04:30",
        calendarSyncedAt: now,
      });
      expect(result).toEqual({
        ok: true,
        text: "📅 Took Google's version: <b>Team standup</b> — 2026-08-20 04:30",
        toast: "Took Google's",
      });
    });

    it("sets dueTime to null for an all-day mirrored event", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(mirroredEvent({ allDay: true }));
      mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

      const result = await resolveConflict("i1", "google", user(), now);

      expect(mockItem.updateItem).toHaveBeenCalledWith("i1", "u1", {
        title: "Team standup",
        dueDate: "2026-08-20",
        dueTime: null,
        calendarSyncedAt: now,
      });
      expect(result).toEqual({
        ok: true,
        text: "📅 Took Google's version: <b>Team standup</b> — 2026-08-20",
        toast: "Took Google's",
      });
    });
  });

  describe("failure paths", () => {
    it("returns ok:false for an unknown item, without writing anything", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(null);

      const result = await resolveConflict("missing", "mine", user(), now);

      expect(result).toEqual({ ok: false, reason: "That item is no longer linked to a calendar event." });
      expect(mockCalendar.updateEvent).not.toHaveBeenCalled();
      expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
      expect(mockItem.updateItem).not.toHaveBeenCalled();
    });

    it("scopes the item lookup to the requesting user, so another user's item is unreachable", async () => {
      // The requesting user's id is folded into the findFirst where-clause; a row owned by
      // someone else simply doesn't match, exactly like an unknown id.
      mockPrisma.item.findFirst.mockResolvedValue(null);

      const result = await resolveConflict("i1", "mine", user({ id: "attacker" }), now);

      expect(mockPrisma.item.findFirst).toHaveBeenCalledWith({ where: { id: "i1", userId: "attacker" } });
      expect(result).toEqual({ ok: false, reason: "That item is no longer linked to a calendar event." });
      expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
      expect(mockItem.updateItem).not.toHaveBeenCalled();
    });

    it("returns ok:false when the item has no googleEventId", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item({ googleEventId: null }));

      const result = await resolveConflict("i1", "mine", user(), now);

      expect(result).toEqual({ ok: false, reason: "That item is no longer linked to a calendar event." });
      expect(mockCalendar.updateEvent).not.toHaveBeenCalled();
    });

    it("returns ok:false for side 'mine' with no googleRefreshToken", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());

      const result = await resolveConflict("i1", "mine", user({ googleRefreshToken: null }), now);

      expect(result).toEqual({ ok: false, reason: "Google Calendar isn't connected." });
      expect(mockCalendar.updateEvent).not.toHaveBeenCalled();
      expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
      expect(mockItem.updateItem).not.toHaveBeenCalled();
    });

    it("returns ok:false for side 'google' with no mirrored CalendarEvent row", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(null);

      const result = await resolveConflict("i1", "google", user(), now);

      expect(result).toEqual({ ok: false, reason: "I no longer have Google's version of that event." });
      expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
      expect(mockItem.updateItem).not.toHaveBeenCalled();
    });

    it("returns ok:false when updateEvent rejects with an ordinary error, without writing", async () => {
      mockPrisma.item.findFirst.mockResolvedValue(item());
      mockCalendar.updateEvent.mockRejectedValue(new Error("network blip"));

      const result = await resolveConflict("i1", "mine", user(), now);

      expect(result).toEqual({ ok: false, reason: "I couldn't write that to Google Calendar." });
      expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
      expect(mockItem.updateItem).not.toHaveBeenCalled();
    });
  });

  it("propagates a CalendarAuthError instead of converting it to ok:false", async () => {
    mockPrisma.item.findFirst.mockResolvedValue(item());
    mockCalendar.updateEvent.mockRejectedValue(new CalendarAuthError());

    await expect(resolveConflict("i1", "mine", user(), now)).rejects.toBeInstanceOf(CalendarAuthError);
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
      expect(mockItem.updateItem).not.toHaveBeenCalled();
  });
});
