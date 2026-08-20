import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  pendingAction: {
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  createPendingAction,
  consumePendingAction,
  prunePendingActions,
  PENDING_ACTION_TTL_MS,
} from "@/lib/services/pending-action";

describe("createPendingAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores the call with an expiry PENDING_ACTION_TTL_MS out", async () => {
    mockPrisma.pendingAction.create.mockResolvedValue({ id: "pa1" });
    const now = new Date("2026-08-20T00:00:00Z");
    const id = await createPendingAction({
      userId: "u1",
      chatId: 42,
      tool: "complete_item",
      args: { title: "milk" },
      candidates: ["i1", "i2"],
      now,
    });
    expect(id).toBe("pa1");
    expect(mockPrisma.pendingAction.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        chatId: BigInt(42),
        tool: "complete_item",
        args: { title: "milk" },
        candidates: ["i1", "i2"],
        expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS),
      },
      select: { id: true },
    });
  });
});

describe("consumePendingAction", () => {
  beforeEach(() => vi.clearAllMocks());

  const now = new Date("2026-08-20T00:00:00Z");
  const row = {
    id: "pa1",
    userId: "u1",
    chatId: BigInt(42),
    tool: "complete_item",
    args: { title: "milk" },
    candidates: ["i1", "i2"],
    expiresAt: new Date(now.getTime() + 1000),
    createdAt: now,
  };

  it("returns the parked call and deletes it in the same breath", async () => {
    mockPrisma.pendingAction.findUnique.mockResolvedValue(row);
    mockPrisma.pendingAction.deleteMany.mockResolvedValue({ count: 1 });

    const result = await consumePendingAction("pa1", "u1", now);

    expect(result).toEqual({
      tool: "complete_item",
      args: { title: "milk" },
      candidates: ["i1", "i2"],
    });
    expect(mockPrisma.pendingAction.deleteMany).toHaveBeenCalledWith({
      where: { id: "pa1", userId: "u1", expiresAt: { gt: now } },
    });
  });

  it("returns null when the delete claims 0 rows (someone else got there first)", async () => {
    mockPrisma.pendingAction.findUnique.mockResolvedValue(row);
    mockPrisma.pendingAction.deleteMany.mockResolvedValue({ count: 0 });

    const result = await consumePendingAction("pa1", "u1", now);

    expect(result).toBeNull();
  });

  it("returns null for an id that does not exist", async () => {
    mockPrisma.pendingAction.findUnique.mockResolvedValue(null);

    const result = await consumePendingAction("missing", "u1", now);

    expect(result).toBeNull();
    expect(mockPrisma.pendingAction.deleteMany).not.toHaveBeenCalled();
  });

  it("returns null for another user's pending action", async () => {
    mockPrisma.pendingAction.findUnique.mockResolvedValue(row);
    // The where clause on deleteMany includes userId, so a mismatched caller matches 0 rows.
    mockPrisma.pendingAction.deleteMany.mockResolvedValue({ count: 0 });

    const result = await consumePendingAction("pa1", "someone-else", now);

    expect(result).toBeNull();
  });

  it("returns null for an expired pending action", async () => {
    const expired = { ...row, expiresAt: new Date(now.getTime() - 1000) };
    mockPrisma.pendingAction.findUnique.mockResolvedValue(expired);
    // The where clause on deleteMany requires expiresAt > now, so an expired row matches 0 rows.
    mockPrisma.pendingAction.deleteMany.mockResolvedValue({ count: 0 });

    const result = await consumePendingAction("pa1", "u1", now);

    expect(result).toBeNull();
  });

  it("guards a non-object args column and returns {} instead of throwing", async () => {
    mockPrisma.pendingAction.findUnique.mockResolvedValue({ ...row, args: "not-an-object" });
    mockPrisma.pendingAction.deleteMany.mockResolvedValue({ count: 1 });

    const result = await consumePendingAction("pa1", "u1", now);

    expect(result).toEqual({ tool: "complete_item", args: {}, candidates: ["i1", "i2"] });
  });
});

describe("prunePendingActions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes expired rows and returns the count", async () => {
    mockPrisma.pendingAction.deleteMany.mockResolvedValue({ count: 2 });
    const now = new Date("2026-08-20T00:00:00Z");
    const result = await prunePendingActions(now);
    expect(result).toBe(2);
    expect(mockPrisma.pendingAction.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });
});
