import { NextRequest, NextResponse } from "next/server";
import {
  getDueItems,
  claimDueReminder,
  restoreDueReminder,
  createNextOccurrence,
  createItem,
  getEscalationCandidates,
  updateNotificationStage,
} from "@/lib/services/item";
import { sendMessage, b, TelegramBlockedError } from "@/lib/services/telegram";
import { reminderKeyboard, doneOnlyKeyboard } from "@/lib/services/callbacks";
import { shouldNotify, isQuietHours, isAuthorizedCronRequest } from "@/lib/services/cron-utils";
import { pruneOldMessages } from "@/lib/services/conversation";
import { notifyOwner } from "@/lib/services/alert";
import { formatDateInTz, formatHHmmInTz, isValidTz } from "@/lib/tz";

export const maxDuration = 60;

/**
 * Housekeeping is hourly work, but this endpoint now ticks roughly once a minute — pruning
 * on every tick would run ~60x the delete queries it needs to. Ticks land at arbitrary
 * minutes, so a narrow window is the cheapest way to thin it out without extra state.
 */
function shouldPrune(now: Date): boolean {
  return now.getUTCMinutes() < 5;
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueItems = await getDueItems(now);
  let sent = 0;
  let skipped = 0;
  let deferred = 0;
  let errors = 0;
  let restored = 0;
  let blocked = 0;

  for (const item of dueItems) {
    try {
      // Quiet hours only *defer*: leave remindAt set so the reminder goes out afterwards.
      // The priority floor is deliberately not applied here — the user explicitly asked to
      // be reminded at this time, and skipping without clearing remindAt would leave the
      // item due forever (and stall its recurring series).
      if (isQuietHours(item.user, now)) {
        deferred++;
        continue;
      }

      const isRecurring = Boolean(item.recurrenceRule) || item.recurring !== "none";
      // Pure reminders and recurring occurrences complete on fire; dated tasks stay open
      // so deadline escalation can follow up.
      const markDone = !item.dueDate || isRecurring;

      // Claim first so an overlapping run can't double-send or fork the series.
      if (!(await claimDueReminder(item.id, markDone))) {
        skipped++;
        continue;
      }

      const originalRemindAt = item.remindAt;

      try {
        await sendMessage(Number(item.user.telegramId), `🔔 ${b("Reminder:")} ${b(item.title)}`, {
          keyboard: reminderKeyboard(item.id),
        });
      } catch (error) {
        // The claim already cleared remindAt. Without putting it back, a rate limit or a
        // transient 5xx would lose this reminder permanently — the one failure mode a
        // reminder app cannot afford. A blocked chat is the exception: it can never succeed.
        if (error instanceof TelegramBlockedError) {
          blocked++;
          console.error(`[cron:reminders] chat blocked for item ${item.id}, dropping`);
          continue;
        }
        if (originalRemindAt) {
          await restoreDueReminder(item.id, originalRemindAt, item.status);
          restored++;
        }
        throw error;
      }

      sent++;

      if (isRecurring && item.remindAt) {
        const nextRemindAt = createNextOccurrence(item.remindAt, item.recurring, item.recurrenceRule, now);

        if (nextRemindAt && (!item.recurrenceEnd || nextRemindAt <= item.recurrenceEnd)) {
          await createItem({
            userId: item.userId,
            categoryId: item.categoryId,
            title: item.title,
            description: item.description,
            priority: item.priority,
            dueDate: item.dueDate ? formatDateInTz(nextRemindAt, item.user.timezone) : null,
            dueTime: item.dueTime,
            remindAt: nextRemindAt,
            recurring: item.recurring,
            recurrenceRule: item.recurrenceRule,
            recurrenceEnd: item.recurrenceEnd,
          });
        }
      }
    } catch (error) {
      console.error(`[cron:reminders] item ${item.id}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  // Deadline escalation
  let escalated = 0;
  const candidates = await getEscalationCandidates();

  for (const item of candidates) {
    try {
      if (!item.user.telegramId || !item.dueDate) continue;
      if (!isValidTz(item.user.timezone)) continue;
      if (!shouldNotify(item.user, item.priority, now)) continue;

      const userNowStr = formatDateInTz(now, item.user.timezone);
      const userTimeStr = formatHHmmInTz(now, item.user.timezone);

      const dueTime = item.dueTime ?? "23:59";

      const dueMinutes = toMinutes(item.dueDate, dueTime);
      const nowMinutes = toMinutes(userNowStr, userTimeStr);
      // A malformed dueDate/dueTime yields NaN, and every comparison below would silently
      // be false — the item would never escalate. Surface it instead of losing it.
      if (!Number.isFinite(dueMinutes) || !Number.isFinite(nowMinutes)) {
        console.error(`[cron:escalation] item ${item.id} has unparseable due date/time:`, item.dueDate, item.dueTime);
        errors++;
        continue;
      }
      const minutesUntilDue = dueMinutes - nowMinutes;
      const hoursUntilDue = minutesUntilDue / 60;

      let newStage = item.notificationStage;
      let message = "";

      if (hoursUntilDue < 0 && item.notificationStage < 3) {
        newStage = 3;
        message = `🚨 ${b("Overdue:")} ${b(item.title)}`;
      } else if (hoursUntilDue <= 2 && hoursUntilDue > 0 && item.notificationStage < 2) {
        newStage = 2;
        message = `⚠️ ${b("Due soon:")} ${b(item.title)} (in ${Math.round(minutesUntilDue)} min)`;
      } else if (hoursUntilDue <= 24 && hoursUntilDue > 2 && item.notificationStage < 1) {
        newStage = 1;
        const label = item.dueDate === userNowStr ? "Due today:" : "Due tomorrow:";
        message = `📋 ${b(label)} ${b(item.title)}`;
      }

      if (newStage > item.notificationStage) {
        try {
          await sendMessage(Number(item.user.telegramId), message, { keyboard: doneOnlyKeyboard(item.id) });
        } catch (error) {
          // The stage is only advanced after a successful send, so a failure here retries
          // on the next tick by itself — except for a blocked chat, which never will.
          if (error instanceof TelegramBlockedError) {
            blocked++;
            continue;
          }
          throw error;
        }
        await updateNotificationStage(item.id, newStage);
        escalated++;
      }
    } catch (error) {
      console.error(`[cron:escalation] item ${item.id}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  const pruned = shouldPrune(now) ? await pruneOldMessages() : 0;

  if (errors > 0) {
    await notifyOwner("cron:reminders", `${errors} item(s) failed this tick — see Vercel logs`);
  }

  return NextResponse.json({
    processed: dueItems.length,
    sent,
    skipped,
    deferred,
    errors,
    restored,
    blocked,
    escalated,
    pruned,
  });
}

function toMinutes(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  // Days since epoch * 1440 + hours * 60 + minutes (UTC arithmetic: both dates are already in user-local terms)
  const daysSinceEpoch = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
  return daysSinceEpoch * 1440 + h * 60 + m;
}
