// src/lib/services/calendar-sync.ts
import { prisma } from "@/lib/prisma";
import { formatDateInTz, formatHHmmInTz } from "@/lib/tz";
import { listEventChanges, type SyncedEvent } from "@/lib/services/calendar";

/** How far into the past the local mirror is kept. Beyond this, events are dropped. */
export const MIRROR_PAST_MS = 7 * 24 * 60 * 60 * 1000;
/** How far into the future the local mirror is kept. Beyond this, events are dropped. */
export const MIRROR_FUTURE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Both the task and its calendar event moved since they last agreed, so picking a winner
 * automatically would silently discard whichever side the user cares about — surfaced to a
 * human instead.
 */
export type CalendarConflict = {
  itemId: string;
  itemTitle: string;
  googleEventId: string;
  googleTitle: string;
  googleStartsAt: Date;
};

export type SyncResult = {
  applied: number;
  removed: number;
  conflicts: CalendarConflict[];
  fullResync: boolean;
};

const ZERO_RESULT: SyncResult = { applied: 0, removed: 0, conflicts: [], fullResync: false };

type SyncUser = {
  id: string;
  googleRefreshToken: string | null;
  googleCalendarId: string | null;
  timezone: string;
  googleSyncToken: string | null;
};

function withinMirrorWindow(startsAt: Date, now: Date): boolean {
  const deltaMs = startsAt.getTime() - now.getTime();
  return deltaMs >= -MIRROR_PAST_MS && deltaMs <= MIRROR_FUTURE_MS;
}

/**
 * Applies one changed event to the local `CalendarEvent` mirror. `deleteMany` rather than
 * `delete` because "Google says it's gone" and "it never made it into the mirror" (e.g. it
 * always lived outside the window) look identical from here — both are a no-op, not a thrown
 * "record not found".
 */
async function applyMirrorChange(
  userId: string,
  calendarId: string,
  change: SyncedEvent,
  now: Date
): Promise<"applied" | "removed"> {
  if (change.cancelled || change.startsAt === null || !withinMirrorWindow(change.startsAt, now)) {
    await prisma.calendarEvent.deleteMany({ where: { userId, googleEventId: change.googleEventId } });
    return "removed";
  }

  const startsAt = change.startsAt;
  // Google always sends start and end together; endsAt is only nullable in the type to mirror
  // the cancellation case, which already returned above. Fall back rather than write null into
  // a non-null column.
  const endsAt = change.endsAt ?? startsAt;

  const existing = await prisma.calendarEvent.findUnique({
    where: { userId_googleEventId: { userId, googleEventId: change.googleEventId } },
    select: { startsAt: true },
  });
  // A moved event has to be able to ping again; an event that hasn't moved keeps whatever
  // reminder state it already has, so the field is simply omitted from `update` in that case.
  const startMoved = !existing || existing.startsAt.getTime() !== startsAt.getTime();

  await prisma.calendarEvent.upsert({
    where: { userId_googleEventId: { userId, googleEventId: change.googleEventId } },
    create: {
      userId,
      googleEventId: change.googleEventId,
      calendarId,
      title: change.title,
      description: change.description,
      startsAt,
      endsAt,
      allDay: change.allDay,
      transparent: change.transparent,
      googleUpdatedAt: change.googleUpdatedAt,
    },
    update: {
      calendarId,
      title: change.title,
      description: change.description,
      startsAt,
      endsAt,
      allDay: change.allDay,
      transparent: change.transparent,
      googleUpdatedAt: change.googleUpdatedAt,
      ...(startMoved ? { reminderSentAt: null } : {}),
    },
  });
  return "applied";
}

/**
 * Reconciles the `Item` linked to one changed event, if there is one. Google wins by default
 * — this mirror exists precisely because the calendar is allowed to change out from under the
 * bot — unless both sides moved since they last agreed, which is the one case a human has to
 * decide rather than the sync silently picking a winner.
 */
async function reconcileItem(user: SyncUser, change: SyncedEvent, now: Date): Promise<CalendarConflict | null> {
  const item = await prisma.item.findFirst({
    where: { userId: user.id, googleEventId: change.googleEventId },
    select: { id: true, title: true, updatedAt: true, calendarSyncedAt: true },
  });
  if (!item) return null;

  // `change.startsAt !== null` is part of the conflict test itself: a cancelled event has no
  // start time to show a user as "Google's version", so a cancellation can never itself be
  // the trigger for a conflict — it always falls through to the plain "Google wins" path below.
  if (
    change.startsAt !== null &&
    item.calendarSyncedAt !== null &&
    item.updatedAt > item.calendarSyncedAt &&
    change.googleUpdatedAt !== null &&
    change.googleUpdatedAt > item.calendarSyncedAt
  ) {
    return {
      itemId: item.id,
      itemTitle: item.title,
      googleEventId: change.googleEventId,
      googleTitle: change.title,
      googleStartsAt: change.startsAt,
    };
  }

  if (change.cancelled) {
    // The task and its calendar entry are not the same thing — losing the event doesn't mean
    // losing the task, just the link between them.
    await prisma.item.updateMany({ where: { id: item.id, userId: user.id }, data: { googleEventId: null } });
    return null;
  }

  if (change.startsAt === null) return null; // only cancelled events lack a start; handled above

  await prisma.item.updateMany({
    where: { id: item.id, userId: user.id },
    data: {
      title: change.title,
      // An all-day event's date belongs to the calendar's own timezone; re-deriving it from the
      // instant in the *user's* zone lands a day off whenever the two straddle midnight.
      dueDate: change.allDayDate ?? formatDateInTz(change.startsAt, user.timezone),
      dueTime: change.allDay ? null : formatHHmmInTz(change.startsAt, user.timezone),
      calendarSyncedAt: now,
      // `updatedAt` is stamped explicitly rather than left to @updatedAt: the automatic value
      // lands a few ms after `now`, which would make `updatedAt > calendarSyncedAt` — the local
      // half of the conflict test — true forever, so the pair could never read as "in agreement".
      updatedAt: now,
    },
  });
  return null;
}

/**
 * One sync pass for a user: pulls what changed on Google Calendar since the last pass,
 * mirrors it locally, and reconciles it against any linked tasks. Safe to call on a timer —
 * an unconnected user is a cheap no-op, and a lost sync token self-heals via a full resync.
 */
export async function syncUserCalendar(user: SyncUser, now: Date = new Date()): Promise<SyncResult> {
  if (!user.googleRefreshToken) return ZERO_RESULT;

  const calendarId = user.googleCalendarId || "primary";
  const { events, nextSyncToken, fullResync } = await listEventChanges(
    user.googleRefreshToken,
    calendarId,
    user.googleSyncToken
  );

  if (fullResync) {
    // The gap a lost token leaves behind can hide deletions and moves, so the mirror can't be
    // trusted piecemeal anymore — rebuild it from this response rather than patch it.
    await prisma.calendarEvent.deleteMany({ where: { userId: user.id } });
  }

  let applied = 0;
  let removed = 0;
  const conflicts: CalendarConflict[] = [];

  for (const change of events) {
    const outcome = await applyMirrorChange(user.id, calendarId, change, now);
    if (outcome === "applied") applied += 1;
    else removed += 1;

    const conflict = await reconcileItem(user, change, now);
    if (conflict) conflicts.push(conflict);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { googleSyncToken: nextSyncToken, lastCalendarSyncAt: now },
  });

  return { applied, removed, conflicts, fullResync };
}

/** What the app knows about an event it just wrote to Google, in mirror terms. */
export type MirroredEvent = {
  googleEventId: string;
  title: string;
  description?: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  transparent?: boolean;
  googleUpdatedAt?: Date | null;
};

/**
 * Record an event the app itself just created or changed on Google, without waiting for the
 * next sync pass to discover it.
 *
 * The dashboard reads the mirror and never Google (see agenda.ts), so until this ran, an
 * event the bot had just confirmed to the user was invisible on their own dashboard for a
 * full cron cycle — while the calendar page, which reads Google live, showed it instantly.
 *
 * Routed through `applyMirrorChange` rather than its own upsert so write-through and sync
 * cannot drift: the mirror window, the reminder reset on a moved start, and the row shape
 * are all decided in exactly one place. The next sync pass re-applies the same event
 * idempotently and fills in anything Google normalised on its end.
 */
export async function mirrorEvent(
  userId: string,
  calendarId: string,
  event: MirroredEvent,
  now: Date = new Date()
): Promise<void> {
  await applyMirrorChange(
    userId,
    calendarId,
    {
      googleEventId: event.googleEventId,
      title: event.title,
      description: event.description ?? null,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay ?? false,
      allDayDate: null,
      transparent: event.transparent ?? false,
      googleUpdatedAt: event.googleUpdatedAt ?? null,
      cancelled: false,
    },
    now
  );
}

/** The delete half of write-through: drop an event the app just removed from Google. */
export async function unmirrorEvent(userId: string, googleEventId: string): Promise<void> {
  await prisma.calendarEvent.deleteMany({ where: { userId, googleEventId } });
}
