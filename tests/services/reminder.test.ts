import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReminder, listReminders, getDueReminders, markSent, createNextOccurrence } from "@/lib/services/reminder";

const mockPrisma = vi.hoisted(() => ({
  reminder: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

describe("ReminderService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a reminder", async () => {
    const input = { userId: "u1", message: "Call mom", remindAt: new Date("2026-05-16T17:00:00Z") };
    mockPrisma.reminder.create.mockResolvedValue({ id: "r1", ...input, status: "pending", recurring: "none" });
    const result = await createReminder(input);
    expect(result.message).toBe("Call mom");
  });

  it("queries due reminders", async () => {
    mockPrisma.reminder.findMany.mockResolvedValue([]);
    const now = new Date();
    await getDueReminders(now);
    expect(mockPrisma.reminder.findMany).toHaveBeenCalledWith({
      where: { remindAt: { lte: now }, status: "pending" },
      include: { user: true, todo: true },
    });
  });

  it("marks a reminder as sent", async () => {
    mockPrisma.reminder.update.mockResolvedValue({ id: "r1", status: "sent" });
    await markSent("r1");
    expect(mockPrisma.reminder.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { status: "sent" },
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
