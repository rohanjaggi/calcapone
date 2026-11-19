import { prisma } from "@/lib/prisma";
import { listEventChanges, type SyncedEvent } from "@/lib/services/calendar";

/** How far into the past the local mirror is kept. Beyond this, events are dropped. */
export const MIRROR_PAST_MS = 7 * 24 * 60 * 60 * 1000;
/** How far into the future the local mirror is kept. Beyond this, events are dropped. */
export const MIRROR_FUTURE_MS = 90 * 24 * 60 * 60 * 1000;

export type SyncResult = { applied: number; removed: number; fullResync: boolean };

const ZERO_RESULT: SyncResult = { applied: 0, removed: 0, fullResync: false };

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
 * One sync pass for a user: pulls what changed on Google Calendar since the last pass and
 * mirrors it locally. Safe to call on a timer — an unconnected user is a cheap no-op, and a
 * lost sync token self-heals via a full resync.
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

  for (const change of events) {
    const outcome = await applyMirrorChange(user.id, calendarId, change, now);
    if (outcome === "applied") applied += 1;
    else removed += 1;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { googleSyncToken: nextSyncToken, lastCalendarSyncAt: now },
  });

  return { applied, removed, fullResync };
}

/**
 * Record a Google write the app itself just made (bot or dashboard), without waiting for the
 * next sync pass — the dashboard reads only the mirror (agenda.ts), so otherwise a confirmed
 * event stays invisible there for a full cron cycle.
 *
 * Takes Google's own response, so the mirror holds what the calendar stored, and goes through
 * `applyMirrorChange` so write-through and sync can't drift. Best-effort on purpose: Google
 * already accepted the write, so a mirror failure must not turn it into a reported failure.
 * An all-day response carries `date`, not `dateTime`, and is skipped; the next sync mirrors it.
 */
export async function mirrorEvent(
  userId: string,
  calendarId: string,
  event: { id: string; title: string; startTime: string; endTime: string },
  now: Date = new Date()
): Promise<void> {
  const startsAt = new Date(event.startTime);
  const endsAt = new Date(event.endTime);
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return;
  try {
    await applyMirrorChange(
      userId,
      calendarId,
      {
        googleEventId: event.id,
        title: event.title,
        description: null,
        startsAt,
        endsAt,
        allDay: false,
        transparent: false,
        googleUpdatedAt: null,
        cancelled: false,
      },
      now
    );
  } catch (error) {
    console.error("[calendar-sync] mirror write failed:", error instanceof Error ? error.message : error);
  }
}

/** The delete half of write-through, on the same best-effort terms. */
export async function unmirrorEvent(userId: string, googleEventId: string): Promise<void> {
  try {
    await prisma.calendarEvent.deleteMany({ where: { userId, googleEventId } });
  } catch (error) {
    console.error("[calendar-sync] mirror delete failed:", error instanceof Error ? error.message : error);
  }
}
