import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncUserCalendar } from "@/lib/services/calendar-sync";
import { CalendarAuthError } from "@/lib/services/calendar";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";
import {
  findDueEventReminders,
  claimEventReminder,
  releaseEventReminder,
  formatEventReminder,
} from "@/lib/services/event-reminders";
import { sendMessage, TelegramBlockedError } from "@/lib/services/telegram";
import { isQuietHours, isAuthorizedCronRequest } from "@/lib/services/cron-utils";

export const maxDuration = 60;

/**
 * This endpoint ticks every minute (cron-job.org), but a Google sync isn't cheap, so each
 * user is synced at most once per 4 minutes — enough headroom that an overlapping tick
 * doesn't re-sync a user who was just synced.
 */
const RESYNC_THRESHOLD_MS = 4 * 60 * 1000;

/**
 * How much of this invocation the sync loop may spend before the rest of the users wait for
 * the next tick. One user with a huge calendar would otherwise eat the whole 60s and take
 * every other user's sync — and the event reminders below, which are time-critical — down
 * with it. Deferred users are left unclaimed, so the next tick picks them up first.
 */
const SYNC_BUDGET_MS = 40 * 1000;

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let synced = 0;
  let reminded = 0;
  let errors = 0;
  let blocked = 0;
  let deferred = 0;

  const users = await prisma.user.findMany({
    where: { googleRefreshToken: { not: null } },
  });

  for (const user of users) {
    if (user.lastCalendarSyncAt && now.getTime() - user.lastCalendarSyncAt.getTime() < RESYNC_THRESHOLD_MS) {
      continue;
    }

    if (Date.now() - now.getTime() > SYNC_BUDGET_MS) {
      deferred++;
      continue;
    }

    // Claim the user before syncing, not after: syncUserCalendar writes lastCalendarSyncAt at
    // the very end, so the gate above alone lets two overlapping invocations sync the same user.
    const claimed = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { lastCalendarSyncAt: null },
          { lastCalendarSyncAt: { lt: new Date(now.getTime() - RESYNC_THRESHOLD_MS) } },
        ],
      },
      data: { lastCalendarSyncAt: now },
    });
    // A failed sync isn't lost work — the sync token only advances on success, so the claim
    // just holds this user until the next tick rather than needing to be released.
    if (claimed.count === 0) continue;

    try {
      await syncUserCalendar(user, now);
      synced++;
    } catch (error) {
      if (error instanceof CalendarAuthError) {
        await markCalendarDisconnected(user.id);
      } else {
        console.error(`[cron:sync] sync failed for user ${user.id}:`, error instanceof Error ? error.message : error);
        errors++;
      }
    }
  }

  const dueReminders = await findDueEventReminders(now);

  if (dueReminders.length > 0) {
    // findDueEventReminders only carries what fires the ping (title, start, lead time) —
    // quiet hours needs the user's own prefs, so fetch just those for the users involved.
    const reminderUserIds = [...new Set(dueReminders.map((r) => r.userId))];
    const quietHoursUsers = await prisma.user.findMany({
      where: { id: { in: reminderUserIds } },
      select: { id: true, quietStart: true, quietEnd: true, timezone: true },
    });
    const quietHoursByUser = new Map(quietHoursUsers.map((u) => [u.id, u]));

    for (const reminder of dueReminders) {
      try {
        const quietUser = quietHoursByUser.get(reminder.userId) ?? {
          quietStart: null,
          quietEnd: null,
          timezone: reminder.timezone,
        };
        // Left unclaimed, so a later tick retries it — findDueEventReminders keeps an event due
        // for a grace period past its start precisely so this deferral can't swallow the ping.
        if (isQuietHours(quietUser, now)) continue;

        if (!(await claimEventReminder(reminder.eventId, now))) continue; // another tick got there first

        try {
          await sendMessage(Number(reminder.telegramId), formatEventReminder(reminder.title, reminder.minutesUntil));
          reminded++;
        } catch (error) {
          if (error instanceof TelegramBlockedError) {
            blocked++;
            console.error(`[cron:sync] chat blocked for event ${reminder.eventId}, dropping`);
          } else {
            await releaseEventReminder(reminder.eventId);
            throw error;
          }
        }
      } catch (error) {
        console.error(`[cron:sync] event ${reminder.eventId}:`, error instanceof Error ? error.message : error);
        errors++;
      }
    }
  }

  return NextResponse.json({ synced, reminded, errors, blocked, deferred });
}
