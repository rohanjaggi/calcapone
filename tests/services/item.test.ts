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
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/embeddings", () => ({
  buildEmbeddingText: vi.fn(() => "text"),
  scheduleItemEmbedding: vi.fn(async () => {}),
}));

import {
  createItem,
  listItems,
  updateItem,
  deleteItem,
  getDueItems,
  createNextOccurrence,
  OPEN_STATUSES,
  nextDueDate,
  listSeries,
  updateSeries,
  deleteSeries,
} from "@/lib/services/item";

/**
 * A full item row as `prisma.item.findUnique`/`findMany` would return it, including the
 * newer columns (`seriesId`, `calendarSyncedAt`). Used wherever a test
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
  recurring: "none",
  recurrenceRule: null,
  recurrenceEnd: null,
  googleEventId: null,
  parentId: null,
  calendarSyncedAt: null,
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

  it("creates next occurrence for daily recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "daily");
    expect(next!.toISOString()).toBe("2026-05-17T17:00:00.000Z");
  });

  it("creates next occurrence for weekly recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "weekly");
    expect(next!.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("creates next occurrence for monthly recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "monthly");
    expect(next!.toISOString()).toBe("2026-06-16T17:00:00.000Z");
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
        recurring: "none",
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
          recurring: "none",
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
        recurring: "none",
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
          recurring: "none",
          recurrenceRule: "FREQ=WEEKLY",
          recurrenceEnd: null,
        },
        include: { category: true },
      });
    });

    it("does not roll forward when the item has a remindAt (the cron owns that path)", async () => {
      const before = baseItem({
        recurrenceRule: "FREQ=DAILY",
        dueDate: "2026-06-01",
        remindAt: new Date("2026-06-01T09:00:00.000Z"),
        status: "pending",
      });
      mockPrisma.item.findUnique.mockResolvedValue(before);
      mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });

      await updateItem("i1", "u1", { status: "done" });

      expect(mockPrisma.item.create).not.toHaveBeenCalled();
    });

    it("does not roll forward a non-recurring item", async () => {
      const before = baseItem({
        recurring: "none",
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

    it("still rolls forward a legacy recurring item with no recurrenceRule", async () => {
      const before = baseItem({
        id: "i1",
        userId: "u1",
        categoryId: "cat-1",
        seriesId: null,
        title: "Take out the trash",
        description: null,
        priority: "medium",
        dueDate: "2026-06-01",
        dueTime: null,
        remindAt: null,
        recurring: "weekly",
        recurrenceRule: null,
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
          title: "Take out the trash",
          description: null,
          priority: "medium",
          dueDate: "2026-06-08",
          dueTime: null,
          recurring: "weekly",
          recurrenceRule: null,
          recurrenceEnd: null,
        },
        include: { category: true },
      });
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
