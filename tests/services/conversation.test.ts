import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessages = [
  { role: "assistant", content: "Created reminder: Call mom at 17:00" },
  { role: "user", content: "remind me to call mom at 5pm" },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findMany: vi.fn().mockResolvedValue(mockMessages),
      create: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
    },
    telegramUpdate: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

describe("conversation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getRecentMessages returns formatted history", async () => {
    const { getRecentMessages } = await import("@/lib/services/conversation");
    const result = await getRecentMessages("user-1", 12345);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });

  it("saveMessage creates a record", async () => {
    const { saveMessage } = await import("@/lib/services/conversation");
    const { prisma } = await import("@/lib/prisma");
    await saveMessage("user-1", 12345, "user", "hello");
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { userId: "user-1", chatId: BigInt(12345), role: "user", content: "hello" },
    });
  });

  it("pruneOldMessages deletes old records", async () => {
    const { pruneOldMessages } = await import("@/lib/services/conversation");
    const count = await pruneOldMessages();
    expect(count).toBe(5);
  });
});
