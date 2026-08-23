import { describe, it, expect, vi, beforeEach } from "vitest";

// MEDIUM 12 (suspected): completing an item used to read-then-write with no atomic guard, so
// a double-tapped Done button (two concurrent updateItem calls) could both see the item as
// pending, both complete it, and both roll a recurring series forward. This file is narrowly
// about that guard; tests/services/item.test.ts covers the rest of updateItem.

const mockPrisma = vi.hoisted(() => ({
  item: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/services/embeddings", () => ({
  buildEmbeddingText: vi.fn(() => "text"),
  scheduleItemEmbedding: vi.fn(async () => {}),
}));

import { updateItem } from "@/lib/services/item";

const baseItem = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  userId: "u1",
  categoryId: "c1",
  seriesId: null,
  title: "Take vitamins",
  description: null,
  status: "pending",
  priority: "medium",
  kind: "task",
  dueDate: "2026-06-01",
  dueTime: null,
  remindAt: null,
  recurring: "none",
  recurrenceRule: "FREQ=DAILY",
  recurrenceEnd: null,
  googleEventId: null,
  parentId: null,
  calendarSyncedAt: null,
  notificationStage: 0,
  ...over,
});

describe("updateItem: atomic completion guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("completes through a status-guarded updateMany, not a plain update", async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });
    mockPrisma.item.create.mockResolvedValue({ id: "i2", category: { name: "General" } });

    await updateItem("i1", "u1", { status: "done" });

    expect(mockPrisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1", status: { not: "done" } },
      data: { status: "done" },
    });
    expect(mockPrisma.item.update).not.toHaveBeenCalled();
  });

  it("rolls the series forward when the guard matches (this call actually completed it)", async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });
    mockPrisma.item.create.mockResolvedValue({ id: "i2", category: { name: "General" } });

    await updateItem("i1", "u1", { status: "done" });

    expect(mockPrisma.item.create).toHaveBeenCalledTimes(1);
  });

  it("does not roll the series forward twice when a second, racing call loses the guard", async () => {
    // Both concurrent calls read the same pending snapshot; only one of them can win the
    // guarded write. Simulates the loser: updateMany matches nothing because the winner
    // already flipped status to "done".
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });

    await updateItem("i1", "u1", { status: "done" });

    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  it("still returns the current item (with category) when the guard is lost", async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem());
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.item.findUniqueOrThrow.mockResolvedValue({ id: "i1", status: "done", category: { name: "General" } });

    const result = await updateItem("i1", "u1", { status: "done" });

    expect(result).toEqual({ id: "i1", status: "done", category: { name: "General" } });
  });

  it("leaves non-completion updates on the plain, unguarded update path", async () => {
    mockPrisma.item.update.mockResolvedValue({ id: "i1", priority: "high", category: { name: "General" } });

    await updateItem("i1", "u1", { priority: "high" });

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1" },
      data: { priority: "high" },
      include: { category: true },
    });
    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
  });

  it("reopening (done -> pending) also stays on the plain update path, not the completion guard", async () => {
    mockPrisma.item.findUnique.mockResolvedValue(baseItem({ status: "done", notificationStage: 2 }));
    mockPrisma.item.update.mockResolvedValue({ id: "i1", status: "pending", category: { name: "General" } });

    await updateItem("i1", "u1", { status: "pending" });

    expect(mockPrisma.item.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "pending", notificationStage: 0 } })
    );
  });
});
