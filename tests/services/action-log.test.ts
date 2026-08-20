import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  actionLog: {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  item: {
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  category: {
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockCalendar = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  // Must be the same class the implementation throws/checks with `instanceof`, so it's
  // defined here (inside vi.hoisted) rather than imported from the real module.
  CalendarAuthError: class CalendarAuthError extends Error {},
}));

vi.mock("@/lib/services/calendar", () => ({
  createEvent: mockCalendar.createEvent,
  updateEvent: mockCalendar.updateEvent,
  deleteEvent: mockCalendar.deleteEvent,
  CalendarAuthError: mockCalendar.CalendarAuthError,
}));

import { recordAction, undoLast, undoById, pruneActionLog, UNDO_RETENTION_MS, type UndoUser } from "@/lib/services/action-log";
import { CalendarAuthError } from "@/lib/services/calendar";

const user: UndoUser = {
  id: "u1",
  timezone: "Asia/Singapore",
  googleRefreshToken: "enc-refresh-token",
  googleCalendarId: "primary",
};

const now = new Date("2026-08-20T10:00:00.000Z");
const cutoff = new Date(now.getTime() - UNDO_RETENTION_MS);

describe("action-log", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("recordAction", () => {
    it("returns the new row id", async () => {
      mockPrisma.actionLog.create.mockResolvedValue({ id: "log1" });
      const id = await recordAction("u1", 123, {
        kind: "delete_item",
        summary: "Deleted <b>Buy milk</b>",
        inverse: { op: "noop" },
      });
      expect(id).toBe("log1");
      expect(mockPrisma.actionLog.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          chatId: BigInt(123),
          kind: "delete_item",
          summary: "Deleted <b>Buy milk</b>",
          inverse: { op: "noop" },
        },
        select: { id: true },
      });
    });

    it("passes a null chatId through as null", async () => {
      mockPrisma.actionLog.create.mockResolvedValue({ id: "log1" });
      await recordAction("u1", null, { kind: "noop", summary: "x", inverse: { op: "noop" } });
      expect(mockPrisma.actionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ chatId: null }) })
      );
    });

    it("returns null without throwing when the insert rejects", async () => {
      mockPrisma.actionLog.create.mockRejectedValue(new Error("db down"));
      const id = await recordAction("u1", 1, { kind: "noop", summary: "x", inverse: { op: "noop" } });
      expect(id).toBeNull();
    });
  });

  describe("undoLast", () => {
    it("claims before applying, then applies the inverse on success", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "Deleted <b>Buy milk</b>",
        inverse: { op: "delete_item", itemId: "i1" },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.item.deleteMany.mockResolvedValue({ count: 1 });

      const result = await undoLast(user, now);

      expect(mockPrisma.actionLog.updateMany).toHaveBeenCalledWith({
        where: { id: "log1", undoneAt: null },
        data: { undoneAt: now },
      });
      expect(mockPrisma.item.deleteMany).toHaveBeenCalledWith({ where: { id: "i1", userId: "u1" } });
      expect(result).toEqual({ ok: true, summary: "Deleted <b>Buy milk</b>" });
    });

    it("does not apply the inverse when the claim loses the race", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "Deleted <b>Buy milk</b>",
        inverse: { op: "delete_item", itemId: "i1" },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 0 });

      const result = await undoLast(user, now);

      expect(result).toEqual({ ok: false, reason: "none" });
      expect(mockPrisma.item.deleteMany).not.toHaveBeenCalled();
    });

    it("returns none when there is no candidate", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue(null);
      const result = await undoLast(user, now);
      expect(result).toEqual({ ok: false, reason: "none" });
      expect(mockPrisma.actionLog.updateMany).not.toHaveBeenCalled();
    });

    it("only selects rows created within the retention window, most recent first", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue(null);
      await undoLast(user, now);
      expect(mockPrisma.actionLog.findFirst).toHaveBeenCalledWith({
        where: { userId: "u1", undoneAt: null, createdAt: { gte: cutoff } },
        orderBy: { createdAt: "desc" },
        select: { id: true, summary: true, inverse: true },
      });
    });

    it("clears undoneAt back to null and returns reason 'failed' when applying throws", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "Deleted <b>Buy milk</b>",
        inverse: { op: "delete_item", itemId: "i1" },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.item.deleteMany.mockRejectedValue(new Error("db exploded"));

      const result = await undoLast(user, now);

      expect(result).toEqual({ ok: false, reason: "failed" });
      expect(mockPrisma.actionLog.updateMany).toHaveBeenCalledWith({
        where: { id: "log1" },
        data: { undoneAt: null },
      });
    });

    it("clears undoneAt and rethrows a CalendarAuthError so the caller can prompt reconnect", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "x",
        inverse: { op: "delete_event", calendarId: "primary", eventId: "e1" },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockCalendar.deleteEvent.mockRejectedValue(new CalendarAuthError());

      await expect(undoLast(user, now)).rejects.toBeInstanceOf(CalendarAuthError);
      expect(mockPrisma.actionLog.updateMany).toHaveBeenCalledWith({
        where: { id: "log1" },
        data: { undoneAt: null },
      });
    });

    it("revives ISO date strings into Date objects for restore_item, dropping undefined keys", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "Restored <b>Buy milk</b>",
        inverse: {
          op: "restore_item",
          itemId: "i1",
          fields: {
            title: "Buy milk",
            description: undefined,
            remindAt: "2026-08-21T09:00:00.000Z",
            recurrenceEnd: null,
          },
        },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

      await undoLast(user, now);

      expect(mockPrisma.item.updateMany).toHaveBeenCalledTimes(1);
      const call = mockPrisma.item.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: "i1", userId: "u1" });
      expect(call.data.title).toBe("Buy milk");
      expect(call.data.remindAt).toBeInstanceOf(Date);
      expect(call.data.remindAt.getTime()).toBe(new Date("2026-08-21T09:00:00.000Z").getTime());
      expect(call.data.recurrenceEnd).toBeNull();
      expect("description" in call.data).toBe(false);
    });

    it("recreate_item reuses the original id", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "Un-deleted <b>Buy milk</b>",
        inverse: {
          op: "recreate_item",
          itemId: "i1",
          data: { title: "Buy milk", categoryId: "c1", status: "pending" },
        },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.item.create.mockResolvedValue({ id: "i1" });

      await undoLast(user, now);

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: { id: "i1", userId: "u1", title: "Buy milk", categoryId: "c1", status: "pending" },
      });
    });

    it("recreate_item swallows an 'already exists' conflict", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "x",
        inverse: { op: "recreate_item", itemId: "i1", data: { title: "Buy milk", categoryId: "c1" } },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.item.create.mockRejectedValue({ code: "P2002" });

      const result = await undoLast(user, now);
      expect(result).toEqual({ ok: true, summary: "x" });
    });

    it("recreate_event creates the Google event first, then the item pointing at the new event id", async () => {
      mockCalendar.createEvent.mockResolvedValue({
        id: "new-event-id",
        title: "Standup",
        startTime: "2026-08-21T09:00:00Z",
        endTime: "2026-08-21T09:30:00Z",
      });
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "Restored event",
        inverse: {
          op: "recreate_event",
          calendarId: "primary",
          event: { title: "Standup", startTime: "2026-08-21T09:00:00Z", endTime: "2026-08-21T09:30:00Z" },
          item: { id: "i1", title: "Standup", categoryId: "c1" },
        },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.item.create.mockResolvedValue({ id: "i1" });

      await undoLast(user, now);

      expect(mockCalendar.createEvent).toHaveBeenCalledWith(
        "enc-refresh-token",
        "primary",
        { title: "Standup", startTime: "2026-08-21T09:00:00Z", endTime: "2026-08-21T09:30:00Z" },
        "Asia/Singapore"
      );
      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: { id: "i1", userId: "u1", title: "Standup", categoryId: "c1", googleEventId: "new-event-id" },
      });

      const eventCallOrder = mockCalendar.createEvent.mock.invocationCallOrder[0];
      const itemCallOrder = mockPrisma.item.create.mock.invocationCallOrder[0];
      expect(eventCallOrder).toBeLessThan(itemCallOrder);
    });

    it("skips calendar ops silently when the user has no refresh token", async () => {
      const disconnected: UndoUser = { ...user, googleRefreshToken: null };
      mockPrisma.actionLog.findFirst.mockResolvedValue({
        id: "log1",
        summary: "x",
        inverse: { op: "delete_event", calendarId: "primary", eventId: "e1" },
      });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });

      const result = await undoLast(disconnected, now);

      expect(result).toEqual({ ok: true, summary: "x" });
      expect(mockCalendar.deleteEvent).not.toHaveBeenCalled();
    });

    describe("sequence", () => {
      it("applies every member in order, and one failing member does not stop the others", async () => {
        mockPrisma.actionLog.findFirst.mockResolvedValue({
          id: "log1",
          summary: "Un-decomposed <b>Plan trip</b>",
          inverse: {
            op: "sequence",
            ops: [
              { op: "delete_item", itemId: "sub1" },
              { op: "delete_item", itemId: "sub2" },
              { op: "delete_item", itemId: "sub3" },
            ],
          },
        });
        mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.item.deleteMany
          .mockResolvedValueOnce({ count: 1 })
          .mockRejectedValueOnce(new Error("sub2 failed"))
          .mockResolvedValueOnce({ count: 1 });

        const result = await undoLast(user, now);

        // A partial recovery is still a success (the claim stands), but the receipt has to
        // say so honestly rather than implying all three members came back.
        expect(result).toEqual({ ok: true, summary: "Un-decomposed <b>Plan trip</b> (restored 2 of 3)" });
        expect(mockPrisma.item.deleteMany).toHaveBeenNthCalledWith(1, { where: { id: "sub1", userId: "u1" } });
        expect(mockPrisma.item.deleteMany).toHaveBeenNthCalledWith(2, { where: { id: "sub2", userId: "u1" } });
        expect(mockPrisma.item.deleteMany).toHaveBeenNthCalledWith(3, { where: { id: "sub3", userId: "u1" } });
      });

      it("does not mention a restore count when every member succeeds", async () => {
        mockPrisma.actionLog.findFirst.mockResolvedValue({
          id: "log1",
          summary: "Un-decomposed <b>Plan trip</b>",
          inverse: {
            op: "sequence",
            ops: [
              { op: "delete_item", itemId: "sub1" },
              { op: "delete_item", itemId: "sub2" },
            ],
          },
        });
        mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.item.deleteMany.mockResolvedValue({ count: 1 });

        const result = await undoLast(user, now);

        expect(result).toEqual({ ok: true, summary: "Un-decomposed <b>Plan trip</b>" });
      });

      // CRITICAL 05: deleting a 5-item series then its category, then undoing, used to
      // recreate 2 of 5 items, fail the other 3 on the now-missing category FK, and still
      // report "Undid: deleted every Take meds" — three items gone with nothing said about it.
      it("reports an honest partial recovery when a series undo loses members to a foreign-key failure", async () => {
        mockPrisma.actionLog.findFirst.mockResolvedValue({
          id: "log1",
          summary: "deleted every <b>Take meds</b>",
          inverse: {
            op: "sequence",
            ops: [
              { op: "recreate_item", itemId: "i1", data: { title: "Take meds", categoryId: "c1" } },
              { op: "recreate_item", itemId: "i2", data: { title: "Take meds", categoryId: "c1" } },
              { op: "recreate_item", itemId: "i3", data: { title: "Take meds", categoryId: "c1" } },
              { op: "recreate_item", itemId: "i4", data: { title: "Take meds", categoryId: "c1" } },
              { op: "recreate_item", itemId: "i5", data: { title: "Take meds", categoryId: "c1" } },
            ],
          },
        });
        mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
        const fkViolation = { code: "P2003" };
        mockPrisma.item.create
          .mockResolvedValueOnce({ id: "i1" })
          .mockRejectedValueOnce(fkViolation)
          .mockRejectedValueOnce(fkViolation)
          .mockRejectedValueOnce(fkViolation)
          .mockResolvedValueOnce({ id: "i5" });

        const result = await undoLast(user, now);

        expect(result).toEqual({
          ok: true,
          summary: "deleted every <b>Take meds</b> (restored 2 of 5)",
        });
        expect(mockPrisma.item.create).toHaveBeenCalledTimes(5);
      });

      it("rethrows (and rolls back the claim) only when every member fails", async () => {
        mockPrisma.actionLog.findFirst.mockResolvedValue({
          id: "log1",
          summary: "x",
          inverse: {
            op: "sequence",
            ops: [
              { op: "delete_item", itemId: "sub1" },
              { op: "delete_item", itemId: "sub2" },
            ],
          },
        });
        mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.item.deleteMany.mockRejectedValue(new Error("db down"));

        const result = await undoLast(user, now);

        expect(result).toEqual({ ok: false, reason: "failed" });
        expect(mockPrisma.item.deleteMany).toHaveBeenCalledTimes(2);
        expect(mockPrisma.actionLog.updateMany).toHaveBeenCalledWith({
          where: { id: "log1" },
          data: { undoneAt: null },
        });
      });
    });
  });

  describe("undoById", () => {
    it("undoes the specified entry", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue({ id: "log1", summary: "Deleted x", inverse: { op: "noop" } });
      mockPrisma.actionLog.updateMany.mockResolvedValue({ count: 1 });

      const result = await undoById("log1", user, now);

      expect(result).toEqual({ ok: true, summary: "Deleted x" });
      expect(mockPrisma.actionLog.findFirst).toHaveBeenCalledWith({
        where: { id: "log1", userId: "u1", undoneAt: null, createdAt: { gte: cutoff } },
        select: { id: true, summary: true, inverse: true },
      });
    });

    it("returns none for an unknown or already-undone id", async () => {
      mockPrisma.actionLog.findFirst.mockResolvedValue(null);
      const result = await undoById("missing", user, now);
      expect(result).toEqual({ ok: false, reason: "none" });
      expect(mockPrisma.actionLog.updateMany).not.toHaveBeenCalled();
    });

    it("does not select a row outside the retention window", async () => {
      // The service filters in the DB query itself; assert the query encodes the cutoff
      // rather than relying on a fake DB to enforce it.
      mockPrisma.actionLog.findFirst.mockResolvedValue(null);
      await undoById("log1", user, now);
      expect(mockPrisma.actionLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: cutoff } }) })
      );
    });
  });

  describe("pruneActionLog", () => {
    it("deletes rows past the retention window and returns the count", async () => {
      mockPrisma.actionLog.deleteMany.mockResolvedValue({ count: 3 });
      const result = await pruneActionLog(now);
      expect(result).toBe(3);
      expect(mockPrisma.actionLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: cutoff } },
      });
    });
  });
});
