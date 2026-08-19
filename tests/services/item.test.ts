import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  item: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/embeddings", () => ({
  buildEmbeddingText: vi.fn(() => "text"),
  scheduleItemEmbedding: vi.fn(async () => {}),
}));

import { createItem, listItems, updateItem, deleteItem, getDueItems, createNextOccurrence, OPEN_STATUSES } from "@/lib/services/item";

describe("ItemService", () => {
  beforeEach(() => vi.clearAllMocks());

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
    mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "done" });
    await updateItem("i1", "u1", { status: "done" });
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1" },
      data: { status: "done" },
      include: { category: true },
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
});
