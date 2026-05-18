import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReorderCategories = vi.fn();
const mockMaxSortOrder = vi.fn();
const mockUpdateItem = vi.fn();

vi.mock("@/lib/dev-user", () => ({
  getOrCreateDevUser: vi.fn(() => Promise.resolve({ id: "user-1" })),
}));

vi.mock("@/lib/services/category", () => ({
  reorderCategories: (...args: unknown[]) => mockReorderCategories(...args),
  maxSortOrder: (...args: unknown[]) => mockMaxSortOrder(...args),
  createCategory: vi.fn(),
  listCategories: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("@/lib/services/item", () => ({
  updateItem: (...args: unknown[]) => mockUpdateItem(...args),
  createItem: vi.fn(),
  listItems: vi.fn(),
  deleteItem: vi.fn(),
}));

vi.mock("@/lib/services/calendar", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { item: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/services/ai", () => ({
  chatWithAi: vi.fn(),
}));

vi.mock("@/lib/services/user", () => ({
  decryptUserApiKey: vi.fn(),
}));

import { reorderCategoriesAction, moveItemToCategory } from "@/app/actions";

describe("reorderCategoriesAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls reorderCategories service with user id and category ids", async () => {
    await reorderCategoriesAction(["cat-a", "cat-b", "cat-c"]);
    expect(mockReorderCategories).toHaveBeenCalledWith("user-1", ["cat-a", "cat-b", "cat-c"]);
  });
});

describe("moveItemToCategory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates item categoryId", async () => {
    mockUpdateItem.mockResolvedValue({});
    await moveItemToCategory("item-1", "cat-2");
    expect(mockUpdateItem).toHaveBeenCalledWith("item-1", "user-1", { categoryId: "cat-2" });
  });
});
