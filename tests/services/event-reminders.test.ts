import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  calendarEvent: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { findDueEventReminders, claimEventReminder, releaseEventReminder, formatEventReminder } from "@/lib/services/event-reminders";

const NOW = new Date("2026-06-15T12:00:00Z");

const user = (over: Partial<{ id: string; telegramId: bigint; eventReminderMinutes: number | null; timezone: string }> = {}) => ({
  id: "u1",
  telegramId: BigInt(111),
  eventReminderMinutes: 15,
  timezone: "Asia/Singapore",
  ...over,
});

const event = (over: Partial<{
  id: string;
  userId: string;
  title: string;
  startsAt: Date;
  allDay: boolean;
  reminderSentAt: Date | null;
  user: ReturnType<typeof user>;
}> = {}) => ({
  id: "e1",
  userId: "u1",
  title: "Standup",
  startsAt: new Date(NOW.getTime() + 10 * 60_000),
  allDay: false,
  reminderSentAt: null,
  user: user(),
  ...over,
});

describe("findDueEventReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excludes events for users with eventReminderMinutes null (feature off)", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      event({ user: user({ eventReminderMinutes: null }) }),
    ]);
    const due = await findDueEventReminders(NOW);
    expect(due).toEqual([]);
  });

  it("excludes an event outside its user's lead window", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      // starts in 30 min, but this user only wants 15 min of warning
      event({ startsAt: new Date(NOW.getTime() + 30 * 60_000), user: user({ eventReminderMinutes: 15 }) }),
    ]);
    const due = await findDueEventReminders(NOW);
    expect(due).toEqual([]);
  });

  it("includes an event inside its user's lead window", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      event({ startsAt: new Date(NOW.getTime() + 10 * 60_000), user: user({ eventReminderMinutes: 15 }) }),
    ]);
    const due = await findDueEventReminders(NOW);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ eventId: "e1", userId: "u1", telegramId: BigInt(111), title: "Standup", minutesUntil: 10 });
  });

  it("never fires for all-day events", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([event({ allDay: true })]);
    const due = await findDueEventReminders(NOW);
    expect(due).toEqual([]);
  });

  it("excludes events that have already been pinged", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      event({ reminderSentAt: new Date(NOW.getTime() - 60_000) }),
    ]);
    const due = await findDueEventReminders(NOW);
    expect(due).toEqual([]);
  });

  it("keeps an event due just past its start, so a ping held back by quiet hours still lands", async () => {
    // The ping is deferred (left unclaimed) for every tick inside quiet hours. If "due" ended
    // at the start time, an event that begins during quiet hours would drop out of the query
    // before the first tick that is allowed to send it — the reminder lost, not delayed.
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      event({ startsAt: new Date(NOW.getTime() - 5 * 60_000) }),
    ]);
    const due = await findDueEventReminders(NOW);
    expect(due).toHaveLength(1);
    expect(formatEventReminder(due[0].title, due[0].minutesUntil)).toBe("📅 <b>Standup</b> starts now");

    // The query itself has to reach past `now` too, or the row never comes back to be filtered.
    const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
    expect(where.startsAt.gt.getTime()).toBeLessThan(NOW.getTime());
  });

  it("excludes an event that started long enough ago for the ping to be stale", async () => {
    mockPrisma.calendarEvent.findMany.mockResolvedValue([
      event({ startsAt: new Date(NOW.getTime() - 3 * 60 * 60_000) }),
    ]);
    const due = await findDueEventReminders(NOW);
    expect(due).toEqual([]);
  });
});

describe("claimEventReminder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when it claims the row", async () => {
    mockPrisma.calendarEvent.updateMany.mockResolvedValue({ count: 1 });
    expect(await claimEventReminder("e1", NOW)).toBe(true);
    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", reminderSentAt: null },
      data: { reminderSentAt: NOW },
    });
  });

  it("returns false when another run already claimed it", async () => {
    mockPrisma.calendarEvent.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimEventReminder("e1", NOW)).toBe(false);
  });
});

describe("releaseEventReminder", () => {
  it("clears the claim so the next tick retries", async () => {
    mockPrisma.calendarEvent.updateMany.mockResolvedValue({ count: 1 });
    await releaseEventReminder("e1");
    expect(mockPrisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { reminderSentAt: null },
    });
  });
});

describe("formatEventReminder", () => {
  it("says 'now' at 0 minutes", () => {
    expect(formatEventReminder("Standup", 0)).toBe("📅 <b>Standup</b> starts now");
  });

  it("says '1 min' at 1 minute", () => {
    expect(formatEventReminder("Standup", 1)).toBe("📅 <b>Standup</b> starts in 1 min");
  });

  it("says '15 min' at 15 minutes", () => {
    expect(formatEventReminder("Standup", 15)).toBe("📅 <b>Standup</b> starts in 15 min");
  });

  it("says '1 hour' at 60 minutes", () => {
    expect(formatEventReminder("Standup", 60)).toBe("📅 <b>Standup</b> starts in 1 hour");
  });

  it("says '1h 30m' at 90 minutes", () => {
    expect(formatEventReminder("Standup", 90)).toBe("📅 <b>Standup</b> starts in 1h 30m");
  });

  it("escapes HTML in the title", () => {
    expect(formatEventReminder("<script>", 15)).toBe("📅 <b>&lt;script&gt;</b> starts in 15 min");
  });
});
