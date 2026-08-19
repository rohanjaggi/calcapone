import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockExecuteRaw = vi.hoisted(() => vi.fn());
const mockEmbedContent = vi.hoisted(() => vi.fn());
const mockOpenAiEmbeddings = vi.hoisted(() => vi.fn());
const mockAfter = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { $executeRaw: mockExecuteRaw } }));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => mockAfter(fn),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: function () {
    return { models: { embedContent: mockEmbedContent } };
  },
}));

vi.mock("openai", () => ({
  default: function () {
    return { embeddings: { create: mockOpenAiEmbeddings } };
  },
}));

import {
  buildEmbeddingText,
  generateEmbedding,
  upsertItemEmbedding,
  scheduleItemEmbedding,
  isEmbeddingConfigured,
  resetEmbedder,
  EMBEDDING_DIMENSIONS,
} from "@/lib/services/embeddings";

const vector = new Array(EMBEDDING_DIMENSIONS).fill(0.5);

beforeEach(() => {
  vi.clearAllMocks();
  resetEmbedder();
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  mockEmbedContent.mockResolvedValue({ embeddings: [{ values: vector }] });
  mockOpenAiEmbeddings.mockResolvedValue({ data: [{ embedding: vector }] });
  mockExecuteRaw.mockResolvedValue(1);
  mockAfter.mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetEmbedder();
});

describe("provider selection", () => {
  it("uses Gemini when its key is set", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    await generateEmbedding("hello");
    expect(mockEmbedContent).toHaveBeenCalled();
    expect(mockOpenAiEmbeddings).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI at matching dimensions when only that key is set", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    await generateEmbedding("hello");
    // Dimensions must match the vector(768) column or the write fails.
    expect(mockOpenAiEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ dimensions: EMBEDDING_DIMENSIONS })
    );
    expect(mockEmbedContent).not.toHaveBeenCalled();
  });

  it("prefers Gemini when both keys are present, so vectors stay in one space", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    process.env.OPENAI_API_KEY = "openai-key";
    await generateEmbedding("hello");
    expect(mockEmbedContent).toHaveBeenCalled();
    expect(mockOpenAiEmbeddings).not.toHaveBeenCalled();
  });

  it("reports itself unconfigured when no key is set", () => {
    expect(isEmbeddingConfigured()).toBe(false);
  });

  it("throws from generateEmbedding when unconfigured", async () => {
    await expect(generateEmbedding("hello")).rejects.toThrow(/No embedding provider/);
  });
});

describe("upsertItemEmbedding", () => {
  it("writes the vector and reports success", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    expect(await upsertItemEmbedding("item-1", "text")).toBe(true);
    expect(mockExecuteRaw).toHaveBeenCalled();
  });

  it("is a no-op when no provider is configured", async () => {
    expect(await upsertItemEmbedding("item-1", "text")).toBe(false);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("never throws when the provider fails — a missing embedding costs recall, not correctness", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    mockEmbedContent.mockRejectedValue(new Error("provider down"));
    expect(await upsertItemEmbedding("item-1", "text")).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("rejects an empty embedding rather than writing a bad vector", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    mockEmbedContent.mockResolvedValue({ embeddings: [{ values: [] }] });
    expect(await upsertItemEmbedding("item-1", "text")).toBe(false);
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});

describe("scheduleItemEmbedding", () => {
  it("hands the write to after() so it survives the response", async () => {
    process.env.GEMINI_API_KEY = "gemini-key";
    await scheduleItemEmbedding("item-1", "text");
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).not.toHaveBeenCalled(); // deferred, not run inline
  });

  it("awaits the write when there is no request scope for after()", async () => {
    // Cron scripts and tests run outside a request; after() throws there.
    process.env.GEMINI_API_KEY = "gemini-key";
    mockAfter.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    await scheduleItemEmbedding("item-1", "text");
    expect(mockExecuteRaw).toHaveBeenCalled();
  });
});

describe("buildEmbeddingText", () => {
  it("includes title, description and category", () => {
    expect(buildEmbeddingText({ title: "Buy milk", description: "2%", category: "Errands" })).toBe(
      "Buy milk — 2% — category: Errands"
    );
  });

  it("omits what isn't there", () => {
    expect(buildEmbeddingText({ title: "Buy milk" })).toBe("Buy milk");
    expect(buildEmbeddingText({ title: "Buy milk", description: null, category: null })).toBe("Buy milk");
  });
});
