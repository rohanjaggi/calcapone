import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  messageRef: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  rememberMessageRef,
  getMessageRef,
  latestListRef,
  resolvePosition,
  pruneMessageRefs,
  MESSAGE_REF_TTL_MS,
} from "@/lib/services/message-ref";

describe("resolvePosition", () => {
  const ids = ["a", "b", "c"];

  it("rejects the empty string", () => {
    expect(resolvePosition(ids, "")).toBeNull();
  });

  it("rejects zero", () => {
    expect(resolvePosition(ids, "0")).toBeNull();
  });

  it("rejects negative numbers", () => {
    expect(resolvePosition(ids, "-1")).toBeNull();
  });

  it("rejects decimals", () => {
    expect(resolvePosition(ids, "2.5")).toBeNull();
  });

  it("rejects non-numeric words", () => {
    expect(resolvePosition(ids, "abc")).toBeNull();
  });

  it("rejects trailing garbage", () => {
    expect(resolvePosition(ids, "3x")).toBeNull();
  });

  it("rejects an index past the end of the list", () => {
    expect(resolvePosition(ids, "4")).toBeNull();
  });

  it("resolves a valid 1-based position", () => {
    expect(resolvePosition(ids, "1")).toBe("a");
    expect(resolvePosition(ids, "3")).toBe("c");
  });

  it("accepts surrounding whitespace", () => {
    expect(resolvePosition(ids, " 2 ")).toBe("b");
  });
});

describe("rememberMessageRef", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts on the [chatId, messageId] composite key", async () => {
    mockPrisma.messageRef.upsert.mockResolvedValue({});
    await rememberMessageRef({
      userId: "u1",
      chatId: 42,
      messageId: 7,
      kind: "list",
      itemIds: ["i1", "i2"],
    });
    expect(mockPrisma.messageRef.upsert).toHaveBeenCalledWith({
      where: { chatId_messageId: { chatId: BigInt(42), messageId: BigInt(7) } },
      create: {
        userId: "u1",
        chatId: BigInt(42),
        messageId: BigInt(7),
        kind: "list",
        itemIds: ["i1", "i2"],
      },
      update: { kind: "list", itemIds: ["i1", "i2"] },
    });
  });

  it("accepts a bigint chatId at the boundary", async () => {
    mockPrisma.messageRef.upsert.mockResolvedValue({});
    await rememberMessageRef({
      userId: "u1",
      chatId: BigInt(42),
      messageId: 7,
      kind: "item",
      itemIds: ["i1"],
    });
    expect(mockPrisma.messageRef.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatId_messageId: { chatId: BigInt(42), messageId: BigInt(7) } },
      })
    );
  });

  it("swallows a rejected write without throwing", async () => {
    mockPrisma.messageRef.upsert.mockRejectedValue(new Error("db down"));
    await expect(
      rememberMessageRef({ userId: "u1", chatId: 1, messageId: 1, kind: "item", itemIds: [] })
    ).resolves.toBeUndefined();
  });
});

describe("getMessageRef", () => {
  beforeEach(() => vi.clearAllMocks());

  it("looks up by the composite key", async () => {
    mockPrisma.messageRef.findUnique.mockResolvedValue({ kind: "item", itemIds: ["i1"] });
    const result = await getMessageRef(42, 7);
    expect(result).toEqual({ kind: "item", itemIds: ["i1"] });
    expect(mockPrisma.messageRef.findUnique).toHaveBeenCalledWith({
      where: { chatId_messageId: { chatId: BigInt(42), messageId: BigInt(7) } },
      select: { kind: true, itemIds: true },
    });
  });

  it("returns null when nothing is stored for that message", async () => {
    mockPrisma.messageRef.findUnique.mockResolvedValue(null);
    expect(await getMessageRef(42, 7)).toBeNull();
  });
});

describe("latestListRef", () => {
  beforeEach(() => vi.clearAllMocks());

  const now = new Date("2026-08-20T00:00:00Z");

  it("filters by kind, user, chat and age, ordered newest first", async () => {
    mockPrisma.messageRef.findFirst.mockResolvedValue({ itemIds: ["i1", "i2"] });
    const result = await latestListRef("u1", 42, now);
    expect(result).toEqual({ itemIds: ["i1", "i2"] });
    expect(mockPrisma.messageRef.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        chatId: BigInt(42),
        kind: "list",
        createdAt: { gte: new Date(now.getTime() - MESSAGE_REF_TTL_MS) },
      },
      orderBy: { createdAt: "desc" },
      select: { itemIds: true },
    });
  });

  it("returns null when nothing is in range", async () => {
    mockPrisma.messageRef.findFirst.mockResolvedValue(null);
    expect(await latestListRef("u1", 42, now)).toBeNull();
  });
});

describe("pruneMessageRefs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes rows older than the TTL and returns the count", async () => {
    mockPrisma.messageRef.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date("2026-08-20T00:00:00Z");
    const result = await pruneMessageRefs(now);
    expect(result).toBe(3);
    expect(mockPrisma.messageRef.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(now.getTime() - MESSAGE_REF_TTL_MS) } },
    });
  });
});
