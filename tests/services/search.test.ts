import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockIsConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/prisma", () => ({
  prisma: { item: { findMany: mockFindMany }, $queryRaw: mockQueryRaw },
}));

vi.mock("@/lib/services/embeddings", () => ({
  generateEmbedding: mockGenerateEmbedding,
  isEmbeddingConfigured: mockIsConfigured,
}));

import { searchItems } from "@/lib/services/search";

const groceries = {
  id: "1",
  title: "Buy groceries",
  description: "Milk, eggs, bread",
  status: "pending",
  priority: "medium",
  dueDate: "2026-06-15",
  remindAt: null,
  updatedAt: new Date("2026-06-14T00:00:00Z"),
  category: { name: "Personal", color: "#4A6FA5" },
};

const clientPrep = {
  id: "2",
  title: "Client meeting prep",
  description: null,
  status: "pending",
  priority: "high",
  dueDate: "2026-06-12",
  remindAt: new Date("2026-06-12T09:00:00Z"),
  updatedAt: new Date("2026-06-13T00:00:00Z"),
  category: { name: "Work", color: "#E57373" },
};

/** Three keyword hits short-circuit the semantic path; one leaves it to run. */
const threeKeywordHits = [groceries, clientPrep, { ...groceries, id: "3", title: "Groceries list" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockIsConfigured.mockReturnValue(true);
  mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.1));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("searchItems", () => {
  it("returns formatted results", async () => {
    mockFindMany.mockResolvedValue(threeKeywordHits);
    const results = await searchItems("user-1", "groceries");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe("Buy groceries");
    expect(results[0].type).toBe("task");
  });

  it("returns reminder type for items with remindAt", async () => {
    mockFindMany.mockResolvedValue(threeKeywordHits);
    const results = await searchItems("user-1", "client");
    expect(results.find((r) => r.title === "Client meeting prep")?.type).toBe("reminder");
  });

  it("returns empty for an empty query", async () => {
    const results = await searchItems("user-1", "");
    expect(results).toEqual([]);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("skips the semantic pass when keyword search already has enough hits", async () => {
    mockFindMany.mockResolvedValue(threeKeywordHits);
    await searchItems("user-1", "groceries");
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("merges semantic hits in when keyword search is thin", async () => {
    mockFindMany
      .mockResolvedValueOnce([groceries]) // keyword pass
      .mockResolvedValueOnce([clientPrep]); // hydrating the vector matches
    mockQueryRaw.mockResolvedValue([{ id: "2", similarity: 0.82 }]);

    const results = await searchItems("user-1", "shopping");

    expect(mockGenerateEmbedding).toHaveBeenCalledWith("shopping");
    expect(results.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("does not duplicate an item found by both passes", async () => {
    mockFindMany.mockResolvedValueOnce([groceries]).mockResolvedValueOnce([groceries]);
    mockQueryRaw.mockResolvedValue([{ id: "1", similarity: 0.9 }]);

    const results = await searchItems("user-1", "groceries");
    expect(results.map((r) => r.id)).toEqual(["1"]);
  });

  it("orders semantic hits by the hybrid score, not raw similarity", async () => {
    const stale = { ...clientPrep, id: "9", title: "Stale", updatedAt: new Date("2020-01-01T00:00:00Z"), status: "done" };
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([stale, clientPrep]);
    // The stale, done item is the closer vector match but should still rank second.
    mockQueryRaw.mockResolvedValue([
      { id: "9", similarity: 0.9 },
      { id: "2", similarity: 0.85 },
    ]);

    const results = await searchItems("user-1", "meeting");
    expect(results.map((r) => r.id)).toEqual(["2", "9"]);
  });

  it("still returns keyword results when the semantic pass fails", async () => {
    mockFindMany.mockResolvedValueOnce([groceries]);
    mockGenerateEmbedding.mockRejectedValue(new Error("provider down"));

    const results = await searchItems("user-1", "groceries");
    expect(results.map((r) => r.id)).toEqual(["1"]);
    expect(console.error).toHaveBeenCalled(); // logged, not swallowed
  });

  it("skips the semantic pass entirely when no embedding provider is configured", async () => {
    mockIsConfigured.mockReturnValue(false);
    mockFindMany.mockResolvedValueOnce([groceries]);

    const results = await searchItems("user-1", "groceries");
    expect(results.map((r) => r.id)).toEqual(["1"]);
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });
});
