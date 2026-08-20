import { NextRequest, NextResponse } from "next/server";
import {
  getDueItems,
  claimDueReminder,
  restoreDueReminder,
  createNextOccurrence,
  createItem,
  getEscalationCandidates,
  updateNotificationStage,
  claimNotificationStage,
} from "@/lib/services/item";
import { sendMessage, b, TelegramBlockedError } from "@/lib/services/telegram";
import { reminderKeyboard, doneOnlyKeyboard } from "@/lib/services/callbacks";
import { shouldNotify, isQuietHours, isAuthorizedCronRequest } from "@/lib/services/cron-utils";
import { ladderFor, nextEscalation, type Rung } from "@/lib/services/escalation";
import { pruneOldMessages } from "@/lib/services/conversation";
import { pruneActionLog } from "@/lib/services/action-log";
import { pruneMessageRefs, rememberMessageRef } from "@/lib/services/message-ref";
import { prunePendingActions } from "@/lib/services/pending-action";
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
        const chatId = Number(item.user.telegramId);
        const messageId = await sendMessage(chatId, `🔔 ${b("Reminder:")} ${b(item.title)}`, {
          keyboard: reminderKeyboard(item.id),
        });
        // Lets the user reply "done" or "push it to Friday" straight to the reminder instead
        // of having to name the task again.
        if (messageId) {
          await rememberMessageRef({ userId: item.userId, chatId, messageId, kind: "item", itemIds: [item.id] });
        }
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
          // Only hand back a status if the claim actually set one — otherwise a Done press
          // that landed during the retry would be overwritten by this stale value.
          await restoreDueReminder(item.id, originalRemindAt, markDone ? item.status : null);
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

      // The ladder is per-kind (an exam wants a week's notice, a task doesn't) — see
      // src/lib/services/escalation.ts. This just turns the picked rung into a message.
      const next = nextEscalation(item.kind, hoursUntilDue, item.notificationStage);

      if (next) {
        // Ticks are ~60s apart while maxDuration is 60s, so two runs can overlap. Claiming
        // the stage first means only one of them can alert; sending first and writing after
        // let both pass the check and send the same "Due soon" twice.
        if (!(await claimNotificationStage(item.id, item.notificationStage, next.stage))) {
          skipped++;
          continue;
        }
        const rung = ladderFor(item.kind)[next.stage - 1];
        const message = formatEscalationMessage(next.label, item.title, rung, minutesUntilDue, item.dueDate);
        try {
          const chatId = Number(item.user.telegramId);
          const messageId = await sendMessage(chatId, message, { keyboard: doneOnlyKeyboard(item.id) });
          if (messageId) {
            await rememberMessageRef({ userId: item.userId, chatId, messageId, kind: "item", itemIds: [item.id] });
          }
        } catch (error) {
          // A blocked chat keeps the claim: no retry can ever deliver it, and rolling back
          // would re-alert on every future tick. Anything else rolls back to retry.
          if (error instanceof TelegramBlockedError) {
            blocked++;
            continue;
          }
          await updateNotificationStage(item.id, item.notificationStage);
          throw error;
        }
        escalated++;
      }
    } catch (error) {
      console.error(`[cron:escalation] item ${item.id}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  // Housekeeping must never be able to fail the tick: a reminder that doesn't go out is a
  // missed deadline, a row that lives an hour longer than it should is nothing at all.
  let pruned = 0;
  if (shouldPrune(now)) {
    try {
      const counts = await Promise.all([
        pruneOldMessages(),
        pruneActionLog(now),
        pruneMessageRefs(now),
        prunePendingActions(now),
      ]);
      pruned = counts.reduce((total, n) => total + n, 0);
    } catch (error) {
      console.error("[cron:reminders] prune failed:", error instanceof Error ? error.message : error);
    }
  }

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

/**
 * Every rung above the 2h tier ("Due", "Due in 3 days", "Exam tomorrow", ...) reads fine on
 * its own, except the plain task/class "Due" label, which used to distinguish today from
 * tomorrow and no longer can once it's shared across every kind's outer rungs. Repeating the
 * due date on all of them keeps that context instead of special-casing just the one label.
 */
function formatEscalationMessage(
  label: string,
  title: string,
  rung: Rung,
  minutesUntilDue: number,
  dueDate: string
): string {
  const headline = `${b(`${label}:`)} ${b(title)}`;
  if (rung.hoursBefore === 0) return `🚨 ${headline}`;
  if (rung.hoursBefore <= 2) return `⚠️ ${headline} (in ${Math.round(minutesUntilDue)} min)`;
  return `📋 ${headline} — ${dueDate}`;
}

function toMinutes(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  // Days since epoch * 1440 + hours * 60 + minutes (UTC arithmetic: both dates are already in user-local terms)
  const daysSinceEpoch = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
  return daysSinceEpoch * 1440 + h * 60 + m;
}
