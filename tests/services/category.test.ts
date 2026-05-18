import { describe, it, expect, vi } from "vitest";

const mockFindMany = vi.fn();
const mockAggregate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
    $transaction: vi.fn((fns: (() => unknown)[]) => Promise.all(fns.map((fn) => fn()))),
  },
}));

import { listCategories, maxSortOrder } from "@/lib/services/category";

describe("listCategories", () => {
  it("orders by sortOrder ascending", async () => {
    mockFindMany.mockResolvedValue([]);
    await listCategories("user-1");
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { sortOrder: "asc" },
    });
  });
});

describe("maxSortOrder", () => {
  it("returns the max sortOrder for a user", async () => {
    mockAggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
    const result = await maxSortOrder("user-1");
    expect(result).toBe(3);
  });

  it("returns -1 when no categories exist", async () => {
    mockAggregate.mockResolvedValue({ _max: { sortOrder: null } });
    const result = await maxSortOrder("user-1");
    expect(result).toBe(-1);
  });
});
