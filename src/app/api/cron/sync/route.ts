import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncUserCalendar, type CalendarConflict } from "@/lib/services/calendar-sync";
import { CalendarAuthError } from "@/lib/services/calendar";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";
import { conflictKeyboard } from "@/lib/services/conflict";
import {
  findDueEventReminders,
  claimEventReminder,
  releaseEventReminder,
  formatEventReminder,
} from "@/lib/services/event-reminders";
import { sendMessage, b, esc, TelegramBlockedError } from "@/lib/services/telegram";
import { isQuietHours, isAuthorizedCronRequest } from "@/lib/services/cron-utils";
import { formatInTz } from "@/lib/tz";

export const maxDuration = 60;

/**
 * The GitHub Actions workflow fires this endpoint every ~60s (see cron-reminders.yml's
 * inner loop), but a Google Calendar sync isn't cheap and doesn't need to run that often.
 * 4 minutes gives a full tick's worth of headroom so a retried/overlapping invocation
 * doesn't re-sync a user who was just synced, while still keeping every user within one
 * 5-minute outer cron period of a fresh sync.
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
  let conflicts = 0;
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

    // Claim the user before syncing, not after. syncUserCalendar writes lastCalendarSyncAt at
    // the very end, so the gate above lets two overlapping invocations both start on the same
    // user, both read the same stale sync token and both send the same conflict prompt with
    // its own set of buttons. Same claim-before-send shape as the reminder paths.
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
      const result = await syncUserCalendar(
        {
          id: user.id,
          googleRefreshToken: user.googleRefreshToken,
          googleCalendarId: user.googleCalendarId,
          timezone: user.timezone,
          googleSyncToken: user.googleSyncToken,
        },
        now
      );
      synced++;

      for (const conflict of result.conflicts) {
        conflicts++;
        try {
          await sendMessage(Number(user.telegramId), formatConflictMessage(conflict, user.timezone), {
            keyboard: conflictKeyboard(conflict.itemId),
          });
        } catch (error) {
          if (error instanceof TelegramBlockedError) {
            blocked++;
          } else {
            console.error(`[cron:sync] failed to notify user ${user.id} of conflict:`, error instanceof Error ? error.message : error);
            errors++;
          }
        }
      }
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

  return NextResponse.json({ synced, conflicts, reminded, errors, blocked, deferred });
}

/**
 * Names both versions and lets the attached buttons (see conflictKeyboard) settle it —
 * neither side is touched until the user picks one.
 */
function formatConflictMessage(conflict: CalendarConflict, tz: string): string {
  const googleWhen = esc(formatInTz(conflict.googleStartsAt, tz));
  return [
    `⚠️ ${b("Calendar conflict:")} this task and its Google Calendar event both changed since they last agreed.`,
    `Yours: ${b(conflict.itemTitle)}`,
    `Google's: ${b(conflict.googleTitle)} (${googleWhen})`,
    "Which one should I keep?",
  ].join("\n");
}
