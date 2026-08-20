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

  const users = await prisma.user.findMany({
    where: { googleRefreshToken: { not: null } },
  });

  for (const user of users) {
    if (user.lastCalendarSyncAt && now.getTime() - user.lastCalendarSyncAt.getTime() < RESYNC_THRESHOLD_MS) {
      continue;
    }

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
        if (isQuietHours(quietUser, now)) continue; // left unclaimed — retried once quiet hours end

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

  return NextResponse.json({ synced, conflicts, reminded, errors, blocked });
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
