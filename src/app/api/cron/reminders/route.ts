import { NextRequest, NextResponse } from "next/server";
import {
  getDueItems,
  claimDueReminder,
  createNextOccurrence,
  createItem,
  getEscalationCandidates,
  updateNotificationStage,
} from "@/lib/services/item";
import { sendMessage, b } from "@/lib/services/telegram";
import { shouldNotify, isAuthorizedCronRequest } from "@/lib/services/cron-utils";
import { pruneOldMessages } from "@/lib/services/conversation";
import { formatDateInTz, formatHHmmInTz, isValidTz } from "@/lib/tz";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueItems = await getDueItems(now);
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const item of dueItems) {
    try {
      if (!shouldNotify(item.user, item.priority, now)) {
        skipped++;
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

      await sendMessage(Number(item.user.telegramId), `🔔 ${b("Reminder:")} ${b(item.title)}`);
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
        await sendMessage(Number(item.user.telegramId), message);
        await updateNotificationStage(item.id, newStage);
        escalated++;
      }
    } catch (error) {
      console.error(`[cron:escalation] item ${item.id}:`, error instanceof Error ? error.message : error);
      errors++;
    }
  }

  const pruned = await pruneOldMessages();

  return NextResponse.json({ processed: dueItems.length, sent, skipped, errors, escalated, pruned });
}

function toMinutes(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  // Days since epoch * 1440 + hours * 60 + minutes (UTC arithmetic: both dates are already in user-local terms)
  const daysSinceEpoch = Math.floor(Date.UTC(y, mo - 1, d) / 86400000);
  return daysSinceEpoch * 1440 + h * 60 + m;
}
