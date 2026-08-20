import { prisma } from "@/lib/prisma";
import { b } from "@/lib/services/telegram";

export type DueEventReminder = {
  eventId: string;
  userId: string;
  telegramId: bigint;
  title: string;
  startsAt: Date;
  timezone: string;
  /** Negative for an event that already started (a ping held back by quiet hours) — reads as "now". */
  minutesUntil: number;
};

/**
 * Upper bound for the DB query itself. The real cutoff is `eventReminderMinutes`, which
 * varies per user and so can't be expressed in a single `where` — this just keeps the
 * query from scanning every future event on the calendar while the per-user window is
 * applied afterward.
 */
const MAX_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * How long past its start an event still counts as due. A ping deferred by quiet hours is
 * left unclaimed for the next tick to pick up, so it has to survive the start time it was
 * counting down to — without this grace the event simply drops out of the query at `startsAt`
 * and the ping is lost rather than delayed. Beyond it the ping is stale enough to be noise.
 */
const START_GRACE_MS = 30 * 60 * 1000;

/** Events whose lead time has arrived and which have not pinged for this start time yet. */
export async function findDueEventReminders(now: Date = new Date()): Promise<DueEventReminder[]> {
  const candidates = await prisma.calendarEvent.findMany({
    where: {
      reminderSentAt: null,
      allDay: false,
      startsAt: { gt: new Date(now.getTime() - START_GRACE_MS), lte: new Date(now.getTime() + MAX_LOOKAHEAD_MS) },
      user: { eventReminderMinutes: { not: null } },
    },
    include: {
      user: { select: { id: true, telegramId: true, eventReminderMinutes: true, timezone: true } },
    },
  });

  const due: DueEventReminder[] = [];
  for (const event of candidates) {
    // Re-checked here (not just trusted from the `where`) because the per-user lead time
    // can only be compared in code, and an event that fails any of these checks must not
    // slip through alongside the ones that do.
    if (event.allDay || event.reminderSentAt) continue;
    const leadMinutes = event.user.eventReminderMinutes;
    if (leadMinutes == null) continue;

    const msUntilStart = event.startsAt.getTime() - now.getTime();
    if (msUntilStart < -START_GRACE_MS || msUntilStart > leadMinutes * 60_000) continue;

    due.push({
      eventId: event.id,
      userId: event.userId,
      telegramId: event.user.telegramId,
      title: event.title,
      startsAt: event.startsAt,
      timezone: event.user.timezone,
      minutesUntil: Math.round(msUntilStart / 60_000),
    });
  }
  return due;
}

/**
 * Claim one event's ping before sending it, so two overlapping cron ticks can't both fire it.
 * Returns false if another run got there first.
 */
export async function claimEventReminder(eventId: string, now: Date = new Date()): Promise<boolean> {
  const result = await prisma.calendarEvent.updateMany({
    where: { id: eventId, reminderSentAt: null },
    data: { reminderSentAt: now },
  });
  return result.count === 1;
}

/** Put the claim back when delivery failed, so the next tick retries. */
export async function releaseEventReminder(eventId: string): Promise<void> {
  await prisma.calendarEvent.updateMany({
    where: { id: eventId },
    data: { reminderSentAt: null },
  });
}

/**
 * "starts in 15 min" / "starts in 1 hour" / "starts now" — minutes-only under an hour,
 * hours (plus a leftover minutes component) once the lead time crosses 60.
 */
function describeLeadTime(minutesUntil: number): string {
  if (minutesUntil <= 0) return "now";
  if (minutesUntil < 60) return `in ${minutesUntil} min`;

  const hours = Math.floor(minutesUntil / 60);
  const mins = minutesUntil % 60;
  if (mins === 0) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${hours}h ${mins}m`;
}

export function formatEventReminder(title: string, minutesUntil: number): string {
  return `📅 ${b(title)} starts ${describeLeadTime(minutesUntil)}`;
}
