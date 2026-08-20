import { describe, it, expect, vi, beforeEach } from "vitest";

// HIGH 07: the cron used to build the next occurrence of a reminder-driven recurring item
// itself, and dropped kind/courseId/seriesId while doing it — all three of which
// rollForwardDatedSeries (the due-date rollover path) carries over correctly. This file is
// narrowly about that one regression; tests/routes/cron-reminders.test.ts covers the rest of
// the route.

const mockGetDueItems = vi.hoisted(() => vi.fn());
const mockClaimDueReminder = vi.hoisted(() => vi.fn());
const mockCreateItem = vi.hoisted(() => vi.fn());
const mockGetEscalationCandidates = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockPrune = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/item", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/item")>();
  return {
    ...actual,
    getDueItems: mockGetDueItems,
    claimDueReminder: mockClaimDueReminder,
    createItem: mockCreateItem,
    getEscalationCandidates: mockGetEscalationCandidates,
  };
});

vi.mock("@/lib/services/telegram", () => ({
  sendMessage: mockSendMessage,
  sendMessageSafe: vi.fn(),
  esc: (t: unknown) => String(t ?? ""),
  b: (t: unknown) => `<b>${t}</b>`,
  TelegramBlockedError: class TelegramBlockedError extends Error {},
}));

vi.mock("@/lib/services/alert", () => ({ notifyOwner: vi.fn() }));
vi.mock("@/lib/services/conversation", () => ({ pruneOldMessages: mockPrune }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    actionLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    messageRef: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    pendingAction: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/reminders/route";

const SECRET = "test-cron-secret";

const request = () =>
  new NextRequest("http://localhost/api/cron/reminders", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}` },
  });

const user = (over = {}) => ({
  telegramId: BigInt(12345),
  timezone: "Asia/Singapore",
  quietStart: null,
  quietEnd: null,
  notifyMinPriority: "low",
  ...over,
});

const dueItem = (over = {}) => ({
  id: "i1",
  userId: "u1",
  categoryId: "c1",
  courseId: "course-1",
  seriesId: "series-1",
  title: "CS2040 lecture",
  description: null,
  priority: "medium",
  dueDate: null,
  dueTime: null,
  remindAt: new Date("2026-06-15T04:00:00Z"),
  recurring: "weekly",
  recurrenceRule: "FREQ=WEEKLY",
  recurrenceEnd: null,
  notificationStage: 0,
  kind: "class",
  user: user(),
  ...over,
});

const NOON_SGT = new Date("2026-06-15T04:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOON_SGT);
  process.env.CRON_SECRET = SECRET;
  mockGetDueItems.mockResolvedValue([]);
  mockGetEscalationCandidates.mockResolvedValue([]);
  mockClaimDueReminder.mockResolvedValue(true);
  mockPrune.mockResolvedValue(0);
  mockSendMessage.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/cron/reminders: recurring reminder fields", () => {
  it("carries kind, courseId and seriesId into the next occurrence", async () => {
    mockGetDueItems.mockResolvedValue([dueItem()]);
    await POST(request());

    expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "class",
        courseId: "course-1",
        seriesId: "series-1",
      })
    );
  });

  it("falls back to the item's own id as the series id when it had none yet", async () => {
    mockGetDueItems.mockResolvedValue([dueItem({ seriesId: null })]);
    await POST(request());

    expect(mockCreateItem).toHaveBeenCalledWith(expect.objectContaining({ seriesId: "i1" }));
  });

  it("carries a null courseId through for a plain recurring task", async () => {
    mockGetDueItems.mockResolvedValue([
      dueItem({ kind: "task", courseId: null, seriesId: null, title: "Take meds" }),
    ]);
    await POST(request());

    expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "task", courseId: null, seriesId: "i1" })
    );
  });
});
