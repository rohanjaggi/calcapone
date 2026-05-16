import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCategory, listCategories, deleteCategory } from "@/lib/services/category";

const mockPrisma = vi.hoisted(() => ({
  category: {
    create: vi.fn(),
    findMany: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("CategoryService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a category", async () => {
    const input = { userId: "u1", name: "Work", color: "#4A6FA5" };
    mockPrisma.category.create.mockResolvedValue({ id: "c1", ...input, createdAt: new Date() });
    const result = await createCategory(input);
    expect(result.name).toBe("Work");
    expect(mockPrisma.category.create).toHaveBeenCalledWith({ data: input });
  });

  it("lists categories for a user", async () => {
    mockPrisma.category.findMany.mockResolvedValue([{ id: "c1", name: "Work" }]);
    const result = await listCategories("u1");
    expect(result).toHaveLength(1);
    expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      orderBy: { name: "asc" },
    });
  });

  it("deletes a category", async () => {
    mockPrisma.category.delete.mockResolvedValue({ id: "c1" });
    await deleteCategory("c1", "u1");
    expect(mockPrisma.category.delete).toHaveBeenCalledWith({
      where: { id: "c1", userId: "u1" },
    });
  });
});
