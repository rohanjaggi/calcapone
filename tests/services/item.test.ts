import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  item: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn(),
  },
  user: { findUnique: vi.fn(async () => ({ timezone: "Asia/Singapore" })) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/embeddings", () => ({
  buildEmbeddingText: vi.fn(() => "text"),
  scheduleItemEmbedding: vi.fn(async () => {}),
}));

import {
  createItem,
  listItems,
  listItemsForBoard,
  updateItem,
  deleteItem,
  getDueItems,
  OPEN_STATUSES,
  nextDueDate,
  listSeries,
  updateSeries,
  deleteSeries,
} from "@/lib/services/item";

/**
 * A full item row as `prisma.item.findUnique`/`findMany` would return it, including the
 * `seriesId` column. Used wherever a test
 * needs a realistic "before" row rather than a hand-picked handful of fields.
 */
const baseItem = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  userId: "u1",
  categoryId: "c1",
  seriesId: null,
  title: "Take vitamins",
  description: null,
  status: "pending",
  priority: "medium",
  dueDate: "2026-06-01",
  dueTime: null,
  remindAt: null,
  recurrenceRule: null,
  recurrenceEnd: null,
  parentId: null,
  notificationStage: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  category: { name: "General" },
  ...over,
});

describe("ItemService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Completing an item is a guarded updateMany + re-read rather than a plain update, so a
    // double-tapped Done can't roll the series forward twice. Default to the claim winning;
    // the tests that care about losing it say so explicitly.
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });
    mockPrisma.item.count.mockResolvedValue(0); // no later occurrence in the run unless a test says so
  });

  it("creates an item", async () => {
    const input = { userId: "u1", categoryId: "c1", title: "Buy milk" };
    mockPrisma.item.create.mockResolvedValue({ id: "i1", status: "pending", priority: "medium", category: { name: "General" }, ...input });
    const result = await createItem(input);
    expect(result.title).toBe("Buy milk");
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: input,
      include: { category: true },
    });
  });

  it("lists items with filters", async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await listItems("u1", { status: "pending", categoryId: "c1" });
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { userId: "u1", parentId: null, status: "pending", categoryId: "c1" },
      include: { category: true, subtasks: { include: { category: true }, orderBy: { createdAt: "asc" } } },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  });

  it("updates an item", async () => {
    await updateItem("i1", "u1", { status: "done" });
    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1", status: { not: "done" } },
      data: { status: "done" },
    });
  });

  it("filters on several statuses at once", async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    await listItems("u1", { status: OPEN_STATUSES });
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", parentId: null, status: { in: ["pending", "in_progress"] } },
      })
    );
  });

  describe("listItemsForBoard", () => {
    it("asks for open items in full and done items only inside the window", async () => {
      mockPrisma.item.findMany.mockResolvedValue([]);
      await listItemsForBoard("u1", { days: 14, take: 50 });

      expect(mockPrisma.item.findMany).toHaveBeenCalledTimes(2);
      const [openCall, doneCall] = mockPrisma.item.findMany.mock.calls.map((c) => c[0]);

      // Everything still open, however old -- an overdue task from last year still matters.
      expect(openCall.where.status).toEqual({ in: ["pending", "in_progress"] });
      expect(openCall.take).toBeUndefined();

      // Completed work is history: recent only, and capped.
      expect(doneCall.where.status).toBe("done");
      expect(doneCall.take).toBe(50);
      expect(doneCall.orderBy).toEqual({ updatedAt: "desc" });
      expect(doneCall.where.updatedAt.gte).toBeInstanceOf(Date);
    });

    it("concatenates both result sets", async () => {
      mockPrisma.item.findMany
        .mockResolvedValueOnce([{ id: "open" }])
        .mockResolvedValueOnce([{ id: "done" }]);
      const rows = await listItemsForBoard("u1", { days: 14, take: 50 });
      expect(rows.map((r: { id: string }) => r.id)).toEqual(["open", "done"]);
    });

    it("computes the cutoff from the days argument", async () => {
      mockPrisma.item.findMany.mockResolvedValue([]);
      const now = new Date("2026-08-20T00:00:00.000Z");
      await listItemsForBoard("u1", { days: 14, take: 50 }, now);
      const doneCall = mockPrisma.item.findMany.mock.calls[1][0];
      expect(doneCall.where.updatedAt.gte).toEqual(new Date("2026-08-06T00:00:00.000Z"));
    });
  });

  describe("notificationStage reset", () => {
    const current = (over = {}) => ({
      status: "pending",
      dueDate: "2026-06-01",
      dueTime: "09:00",
      notificationStage: 3,
      ...over,
    });

    it("resets the stage when the due date moves", async () => {
      mockPrisma.item.findUnique.mockResolvedValue(current());
      mockPrisma.item.update.mockResolvedValue({ id: "i1", category: { name: "General" } });
      await updateItem("i1", "u1", { dueDate: "2026-06-08" });
      expect(mockPrisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { dueDate: "2026-06-08", notificationStage: 0 } })
      );
    });

    it("resets the stage when the due time moves", async () => {
      mockPrisma.item.findUnique.mockResolvedValue(current());
      mockPrisma.item.update.mockResolvedValue({ id: "i1", category: { name: "General" } });
      await updateItem("i1", "u1", { dueTime: "17:00" });
      expect(mockPrisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { dueTime: "17:00", notificationStage: 0 } })
      );
    });

    it("resets the stage when a completed item is reopened", async () => {
      mockPrisma.item.findUnique.mockResolvedValue(current({ status: "done" }));
      mockPrisma.item.update.mockResolvedValue({ id: "i1", category: { name: "General" } });
      await updateItem("i1", "u1", { status: "pending" });
      expect(mockPrisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "pending", notificationStage: 0 } })
      );
    });

    it("leaves the stage alone when the deadline is re-sent unchanged", async () => {
      mockPrisma.item.findUnique.mockResolvedValue(current());
      mockPrisma.item.update.mockResolvedValue({ id: "i1", category: { name: "General" } });
      await updateItem("i1", "u1", { dueDate: "2026-06-01", dueTime: "09:00" });
      expect(mockPrisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { dueDate: "2026-06-01", dueTime: "09:00" } })
      );
    });

    it("does not re-alert on a pending -> in_progress toggle", async () => {
      mockPrisma.item.findUnique.mockResolvedValue(current());
      mockPrisma.item.update.mockResolvedValue({ id: "i1", category: { name: "General" } });
      await updateItem("i1", "u1", { status: "in_progress" });
      expect(mockPrisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: "in_progress" } })
      );
    });

    it("skips the extra read when no deadline or status field is touched", async () => {
      mockPrisma.item.update.mockResolvedValue({ id: "i1", category: { name: "General" } });
      await updateItem("i1", "u1", { priority: "high" });
      expect(mockPrisma.item.findUnique).not.toHaveBeenCalled();
    });
  });

  it("deletes an item", async () => {
    mockPrisma.item.delete.mockResolvedValue({ id: "i1" });
    await deleteItem("i1", "u1");
    expect(mockPrisma.item.delete).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1" },
    });
  });

  it("queries due items (reminders)", async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    const now = new Date();
    await getDueItems(now);
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { remindAt: { lte: now }, status: { not: "done" } },
      include: { user: true, category: true },
    });
  });

  describe("nextDueDate", () => {
    it("FREQ=DAILY advances exactly one calendar day", () => {
      expect(nextDueDate("2026-06-01", "FREQ=DAILY")).toBe("2026-06-02");
    });

    it("FREQ=WEEKLY keeps the same weekday one week later", () => {
      // 2026-06-01 is a Monday; the next occurrence must land on the following Monday.
      expect(nextDueDate("2026-06-01", "FREQ=WEEKLY")).toBe("2026-06-08");
    });

    it("FREQ=MONTHLY from a month-end date skips months that don't have that day-of-month", () => {
      // 2026-01-31 has no equivalent in February (28 days in 2026). rrule does not clamp
      // to 2026-02-28 -- it skips February entirely and lands on the next month that
      // actually has a 31st, which is March. This is the literal, explicit expectation:
      // nextDueDate("2026-01-31", "FREQ=MONTHLY") resolves to 2026-03-31, not a February
      // date and not April.
      expect(nextDueDate("2026-01-31", "FREQ=MONTHLY")).toBe("2026-03-31");
    });

    it("returns null for a malformed rule", () => {
      expect(nextDueDate("2026-06-01", "not a valid rule")).toBeNull();
    });

    it("always returns a YYYY-MM-DD date", () => {
      expect(nextDueDate("2026-06-01", "FREQ=DAILY")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("createItem series naming", () => {
    it("names the series after creating the first occurrence", async () => {
      const input = {
        userId: "u1",
        categoryId: "c1",
        title: "Water the plants",
        recurrenceRule: "FREQ=WEEKLY",
      };
      mockPrisma.item.create.mockResolvedValue({ id: "new-1", category: { name: "General" }, ...input });
      mockPrisma.item.update.mockResolvedValue({ id: "new-1", seriesId: "new-1" });

      const result = await createItem(input);

      expect(mockPrisma.item.create).toHaveBeenCalledWith({ data: input, include: { category: true } });
      expect(mockPrisma.item.update).toHaveBeenCalledWith({
        where: { id: "new-1" },
        data: { seriesId: "new-1" },
      });
      expect(result.seriesId).toBe("new-1");
    });

    it("does not name a series for a non-recurring create", async () => {
      const input = { userId: "u1", categoryId: "c1", title: "Buy milk" };
      mockPrisma.item.create.mockResolvedValue({ id: "i2", category: { name: "General" }, ...input });

      await createItem(input);

      expect(mockPrisma.item.update).not.toHaveBeenCalled();
    });

    it("does not rename the series for a later occurrence that already carries a seriesId", async () => {
      const input = {
        userId: "u1",
        categoryId: "c1",
        title: "Water the plants",
        recurrenceRule: "FREQ=WEEKLY",
        seriesId: "series-1",
      };
      mockPrisma.item.create.mockResolvedValue({ id: "new-2", category: { name: "General" }, ...input });

      await createItem(input);

      expect(mockPrisma.item.update).not.toHaveBeenCalled();
    });
  });

  describe("roll-forward on completion", () => {
    it("creates the next occurrence, carrying over the recurring fields and the series id", async () => {
      const before = baseItem({
        id: "i1",
        userId: "u1",
        categoryId: "cat-1",
        seriesId: "series-1",
        title: "Water the plants",
        description: null,
        priority: "high",
        dueDate: "2026-06-01",
        dueTime: "08:00",
        remindAt: null,
        recurrenceRule: "FREQ=WEEKLY",
        recurrenceEnd: null,
        status: "pending",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });
      mockPrisma.item.create.mockResolvedValue({ id: "i2", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          categoryId: "cat-1",
          seriesId: "series-1",
          title: "Water the plants",
          description: null,
          priority: "high",
          dueDate: "2026-06-08",
          dueTime: "08:00",
            recurrenceRule: "FREQ=WEEKLY",
          recurrenceEnd: null,
        },
        include: { category: true },
      });
    });

    it("falls back to the item's own id as the series id when it had none", async () => {
      const before = baseItem({
        id: "i1",
        userId: "u1",
        categoryId: "cat-1",
        seriesId: null,
        title: "Water the plants",
        description: null,
        priority: "medium",
        dueDate: "2026-06-01",
        dueTime: null,
        remindAt: null,
        recurrenceRule: "FREQ=WEEKLY",
        recurrenceEnd: null,
        status: "pending",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });
      mockPrisma.item.create.mockResolvedValue({ id: "i2", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: {
          userId: "u1",
          categoryId: "cat-1",
          seriesId: "i1",
          title: "Water the plants",
          description: null,
          priority: "medium",
          dueDate: "2026-06-08",
          dueTime: null,
            recurrenceRule: "FREQ=WEEKLY",
          recurrenceEnd: null,
        },
        include: { category: true },
      });
    });

    // The cron never fires a done item, so a daily reminder ticked off before it rang used to
    // end the series there.
    it("makes the next reminder when a repeating one is ticked off before it rings", async () => {
      const ringsAt = new Date(Date.now() + 10 * 60_000);
      const before = baseItem({ recurrenceRule: "FREQ=DAILY", dueDate: null, remindAt: ringsAt, status: "pending" });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.create.mockResolvedValue({ id: "i2", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).toHaveBeenCalledTimes(1);
      const next = mockPrisma.item.create.mock.calls[0][0].data.remindAt as Date;
      expect(next.getTime() - ringsAt.getTime()).toBe(24 * 60 * 60_000);
    });

    // Ticking a repeating task made next week's copy; un-ticking left both open.
    it("takes back the copy completing it made when a repeating task is reopened", async () => {
      const completedAt = new Date("2026-06-01T10:00:00.000Z");
      const before = baseItem({ seriesId: "s1", recurrenceRule: "FREQ=WEEKLY", status: "done", updatedAt: completedAt });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "pending", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "pending" });

      expect(mockPrisma.item.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          seriesId: "s1",
          id: { not: "i1" },
          status: { not: "done" },
          remindAt: null,
          createdAt: { gte: completedAt, lte: new Date(completedAt.getTime() + 60_000) },
        },
      });
    });

    it("does not roll forward a non-recurring item", async () => {
      const before = baseItem({
        recurrenceRule: null,
        dueDate: "2026-06-01",
        status: "pending",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    it("does not roll forward a recurring item with no due date", async () => {
      const before = baseItem({
        recurrenceRule: "FREQ=DAILY",
        dueDate: null,
        status: "pending",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    it("does not create a duplicate when the item was already done", async () => {
      const before = baseItem({
        recurrenceRule: "FREQ=DAILY",
        dueDate: "2026-06-01",
        status: "done",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      // The row is already done, so the `status: { not: "done" }` guard matches nothing —
      // which is what stops a second Done tap creating a second occurrence.
      mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    it("stops the run when the next occurrence would fall past recurrenceEnd", async () => {
      const before = baseItem({
        recurrenceRule: "FREQ=DAILY",
        dueDate: "2026-06-01",
        recurrenceEnd: new Date("2026-06-01T23:59:59.000Z"),
        status: "pending",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    // Undo a completion and complete it again: the first completion already made next week's
    // copy, so making another would put two of every occurrence in the run from then on.
    it("does not roll forward when the run already holds a later open occurrence", async () => {
      const before = baseItem({ seriesId: "series-1", recurrenceRule: "FREQ=WEEKLY", dueDate: "2026-06-01", status: "pending" });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.count.mockResolvedValue(1);

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.count).toHaveBeenCalledWith({
        where: {
          userId: "u1",
          seriesId: "series-1",
          id: { not: "i1" },
          status: { not: "done" },
          createdAt: { gt: new Date("2026-01-01T00:00:00.000Z") },
        },
      });
      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });
  });

  describe("series operations", () => {
    it("listSeries matches the series head by id and every other occurrence by seriesId", async () => {
      mockPrisma.item.findMany.mockResolvedValue([]);

      await listSeries("series-1", "u1");

      expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", OR: [{ seriesId: "series-1" }, { id: "series-1" }] },
      });
    });

    it("updateSeries applies the change to every member and returns the pre-change snapshot", async () => {
      const members = [
        baseItem({ id: "series-1", seriesId: null }),
        baseItem({ id: "occ-2", seriesId: "series-1" }),
      ];
      mockPrisma.item.findMany.mockResolvedValue(members);
      mockPrisma.item.update.mockResolvedValue({ id: "x", category: { name: "General" } });

      const result = await updateSeries("series-1", "u1", { priority: "high" });

      expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
        where: { userId: "u1", OR: [{ seriesId: "series-1" }, { id: "series-1" }] },
      });
      expect(mockPrisma.item.update).toHaveBeenNthCalledWith(1, {
        where: { id: "series-1", userId: "u1" },
        data: { priority: "high" },
        include: { category: true },
      });
      expect(mockPrisma.item.update).toHaveBeenNthCalledWith(2, {
        where: { id: "occ-2", userId: "u1" },
        data: { priority: "high" },
        include: { category: true },
      });
      // Undo needs the state as it was BEFORE the change -- the exact array listSeries
      // fetched, not a re-read of the now-updated rows.
      expect(result).toBe(members);
    });

    it("deleteSeries removes every member and reports how many rows went", async () => {
      mockPrisma.item.deleteMany.mockResolvedValue({ count: 3 });

      const result = await deleteSeries("series-1", "u1");

      expect(mockPrisma.item.deleteMany).toHaveBeenCalledWith({
        where: { userId: "u1", OR: [{ seriesId: "series-1" }, { id: "series-1" }] },
      });
      expect(result).toBe(3);
    });
  });
});
