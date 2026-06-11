import { describe, it, expect, vi } from "vitest";

const mockItems = [
  {
    id: "1",
    title: "Buy groceries",
    description: "Milk, eggs, bread",
    status: "pending",
    priority: "medium",
    dueDate: "2026-06-15",
    remindAt: null,
    category: { name: "Personal", color: "#4A6FA5" },
  },
  {
    id: "2",
    title: "Client meeting prep",
    description: null,
    status: "pending",
    priority: "high",
    dueDate: "2026-06-12",
    remindAt: new Date("2026-06-12T09:00:00Z"),
    category: { name: "Work", color: "#E57373" },
  },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    item: {
      findMany: vi.fn().mockResolvedValue(mockItems),
    },
  },
}));

describe("searchItems", () => {
  it("returns formatted results", async () => {
    const { searchItems } = await import("@/lib/services/search");
    const results = await searchItems("user-1", "groceries");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("Buy groceries");
    expect(results[0].type).toBe("task");
  });

  it("returns reminder type for items with remindAt", async () => {
    const { searchItems } = await import("@/lib/services/search");
    const results = await searchItems("user-1", "client");
    const clientItem = results.find((r) => r.title === "Client meeting prep");
    expect(clientItem?.type).toBe("reminder");
  });

  it("returns empty for empty query", async () => {
    const { searchItems } = await import("@/lib/services/search");
    const results = await searchItems("user-1", "");
    expect(results).toEqual([]);
  });
});
