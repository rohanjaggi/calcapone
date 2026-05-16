import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  item: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { createItem, listItems, updateItem, deleteItem, getDueItems, createNextOccurrence } from "@/lib/services/item";

describe("ItemService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an item", async () => {
    const input = { userId: "u1", categoryId: "c1", title: "Buy milk" };
    mockPrisma.item.create.mockResolvedValue({ id: "i1", status: "pending", priority: "medium", ...input });
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
      where: { userId: "u1", status: "pending", categoryId: "c1" },
      include: { category: true },
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
    expect(next.toISOString()).toBe("2026-05-17T17:00:00.000Z");
  });

  it("creates next occurrence for weekly recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "weekly");
    expect(next.toISOString()).toBe("2026-05-23T17:00:00.000Z");
  });

  it("creates next occurrence for monthly recurring", () => {
    const base = new Date("2026-05-16T17:00:00Z");
    const next = createNextOccurrence(base, "monthly");
    expect(next.toISOString()).toBe("2026-06-16T17:00:00.000Z");
  });
});
