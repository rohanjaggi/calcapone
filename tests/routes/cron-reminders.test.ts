import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDueItems = vi.hoisted(() => vi.fn());
const mockClaimDueReminder = vi.hoisted(() => vi.fn());
const mockCreateItem = vi.hoisted(() => vi.fn());
const mockGetEscalationCandidates = vi.hoisted(() => vi.fn());
const mockUpdateNotificationStage = vi.hoisted(() => vi.fn());
const mockClaimNotificationStage = vi.hoisted(() => vi.fn());
const mockSendMessage = vi.hoisted(() => vi.fn());
const mockPrune = vi.hoisted(() => vi.fn());
const MockTelegramBlockedError = vi.hoisted(
  () =>
    class TelegramBlockedError extends Error {
      constructor() {
        super("blocked");
        this.name = "TelegramBlockedError";
      }
    }
);

vi.mock("@/lib/services/item", async (importOriginal) => {
  // createNextOccurrence stays real: the recurrence maths is part of what's under test.
  const actual = await importOriginal<typeof import("@/lib/services/item")>();
  return {
    ...actual,
    getDueItems: mockGetDueItems,
    claimDueReminder: mockClaimDueReminder,
    createItem: mockCreateItem,
    getEscalationCandidates: mockGetEscalationCandidates,
    updateNotificationStage: mockUpdateNotificationStage,
    claimNotificationStage: mockClaimNotificationStage,
  };
});

vi.mock("@/lib/services/telegram", () => ({
  sendMessage: mockSendMessage,
  sendMessageSafe: vi.fn(),
  esc: (t: unknown) => String(t ?? ""),
  b: (t: unknown) => `<b>${t}</b>`,
  TelegramBlockedError: MockTelegramBlockedError,
}));

vi.mock("@/lib/services/alert", () => ({ notifyOwner: vi.fn() }));
vi.mock("@/lib/services/conversation", () => ({ pruneOldMessages: mockPrune }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/reminders/route";

const SECRET = "test-cron-secret";

const request = (token: string | null = SECRET) =>
  new NextRequest("http://localhost/api/cron/reminders", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
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
  title: "Take meds",
  description: null,
  priority: "low",
  dueDate: null,
  dueTime: null,
  remindAt: new Date("2026-06-15T04:00:00Z"),
  recurring: "none",
  recurrenceRule: null,
  recurrenceEnd: null,
  notificationStage: 0,
  user: user(),
  ...over,
});

/** 12:00 in Asia/Singapore (UTC+8). */
const NOON_SGT = new Date("2026-06-15T04:00:00Z");

/** Assert on chat id and text only — callers may also pass reply-markup options. */
function expectSent(chatId: number, contains: string) {
  const call = mockSendMessage.mock.calls[0];
  expect(call?.[0]).toBe(chatId);
  expect(String(call?.[1])).toContain(contains);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOON_SGT);
  process.env.CRON_SECRET = SECRET;
  mockGetDueItems.mockResolvedValue([]);
  mockGetEscalationCandidates.mockResolvedValue([]);
  mockClaimDueReminder.mockResolvedValue(true);
  mockClaimNotificationStage.mockResolvedValue(true);
  mockPrune.mockResolvedValue(0);
  mockSendMessage.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/cron/reminders", () => {
  it("rejects a request without the shared secret", async () => {
    expect((await POST(request(null))).status).toBe(401);
    expect((await POST(request("wrong-secret"))).status).toBe(401);
    expect(mockGetDueItems).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(request("anything"))).status).toBe(401);
  });

  it("claims, then sends, a due reminder", async () => {
    mockGetDueItems.mockResolvedValue([dueItem()]);
    const body = await (await POST(request())).json();

    expect(mockClaimDueReminder).toHaveBeenCalledWith("i1", true);
    expectSent(12345, "Take meds");
    expect(body.sent).toBe(1);
  });

  it("does not send when another run already claimed the reminder", async () => {
    mockGetDueItems.mockResolvedValue([dueItem()]);
    mockClaimDueReminder.mockResolvedValue(false);
    const body = await (await POST(request())).json();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("still fires an explicit reminder that sits below the priority floor", async () => {
    // Regression: the floor used to skip it *without* clearing remindAt, so it stayed due on
    // every tick forever and its recurring series never advanced.
    mockGetDueItems.mockResolvedValue([
      dueItem({ priority: "low", user: user({ notifyMinPriority: "high" }) }),
    ]);
    const body = await (await POST(request())).json();

    expect(mockSendMessage).toHaveBeenCalled();
    expect(body.sent).toBe(1);
  });

  it("defers during quiet hours without clearing the reminder", async () => {
    vi.setSystemTime(new Date("2026-06-14T18:00:00Z")); // 02:00 SGT
    mockGetDueItems.mockResolvedValue([
      dueItem({ user: user({ quietStart: "22:00", quietEnd: "08:00" }) }),
    ]);
    const body = await (await POST(request())).json();

    expect(mockClaimDueReminder).not.toHaveBeenCalled(); // remindAt survives for the next tick
    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(body.deferred).toBe(1);
  });

  it("keeps a dated task open so deadline escalation can still follow up", async () => {
    mockGetDueItems.mockResolvedValue([dueItem({ dueDate: "2026-06-20" })]);
    await POST(request());
    expect(mockClaimDueReminder).toHaveBeenCalledWith("i1", false);
  });

  it("schedules the next occurrence of a recurring reminder", async () => {
    mockGetDueItems.mockResolvedValue([
      dueItem({ recurring: "daily", recurrenceRule: "FREQ=DAILY" }),
    ]);
    await POST(request());

    expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Take meds",
        remindAt: new Date("2026-06-16T04:00:00Z"),
        recurrenceRule: "FREQ=DAILY",
      })
    );
  });

  it("stops recurring once the series has ended", async () => {
    mockGetDueItems.mockResolvedValue([
      dueItem({
        recurring: "daily",
        recurrenceRule: "FREQ=DAILY",
        recurrenceEnd: new Date("2026-06-15T12:00:00Z"),
      }),
    ]);
    await POST(request());
    expect(mockCreateItem).not.toHaveBeenCalled();
  });

  it("keeps going when one item fails", async () => {
    mockGetDueItems.mockResolvedValue([dueItem({ id: "i1" }), dueItem({ id: "i2" })]);
    mockSendMessage.mockRejectedValueOnce(new Error("telegram down"));
    const body = await (await POST(request())).json();

    expect(body.errors).toBe(1);
    expect(body.sent).toBe(1);
  });

  it("escalates an overdue task once and records the stage", async () => {
    mockGetEscalationCandidates.mockResolvedValue([
      { ...dueItem({ remindAt: null, dueDate: "2026-06-14", dueTime: "09:00" }), notificationStage: 0 },
    ]);
    const body = await (await POST(request())).json();

    expectSent(12345, "Overdue");
    // The stage is claimed *before* the send so overlapping ticks can't both alert;
    // updateNotificationStage is now only the rollback path, so it must stay untouched here.
    expect(mockClaimNotificationStage).toHaveBeenCalledWith("i1", 0, 3);
    expect(mockUpdateNotificationStage).not.toHaveBeenCalled();
    expect(body.escalated).toBe(1);
  });

  it("does not alert when another tick already claimed the stage", async () => {
    mockGetEscalationCandidates.mockResolvedValue([
      { ...dueItem({ remindAt: null, dueDate: "2026-06-14", dueTime: "09:00" }), notificationStage: 0 },
    ]);
    mockClaimNotificationStage.mockResolvedValue(false);
    const body = await (await POST(request())).json();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(body.escalated).toBe(0);
  });

  it("rolls the stage back when the escalation send fails, so the next tick retries", async () => {
    mockGetEscalationCandidates.mockResolvedValue([
      { ...dueItem({ remindAt: null, dueDate: "2026-06-14", dueTime: "09:00" }), notificationStage: 0 },
    ]);
    mockSendMessage.mockRejectedValueOnce(new Error("telegram down"));
    const body = await (await POST(request())).json();

    expect(mockUpdateNotificationStage).toHaveBeenCalledWith("i1", 0);
    expect(body.escalated).toBe(0);
    expect(body.errors).toBe(1);
  });

  it("applies the priority floor to escalation nags", async () => {
    mockGetEscalationCandidates.mockResolvedValue([
      {
        ...dueItem({ remindAt: null, dueDate: "2026-06-14", priority: "low" }),
        notificationStage: 0,
        user: user({ notifyMinPriority: "high" }),
      },
    ]);
    const body = await (await POST(request())).json();

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(body.escalated).toBe(0);
  });

  it("skips an escalation candidate whose timezone is unusable", async () => {
    mockGetEscalationCandidates.mockResolvedValue([
      {
        ...dueItem({ remindAt: null, dueDate: "2026-06-14" }),
        notificationStage: 0,
        user: user({ timezone: "Mars/Olympus" }),
      },
    ]);
    const response = await POST(request());
    expect(response.status).toBe(200); // an invalid zone must not 500 the whole route
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
