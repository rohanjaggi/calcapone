import { NextRequest, NextResponse } from "next/server";
import { getDueItems, markItemSent, createNextOccurrence, createItem, getEscalationCandidates, updateNotificationStage } from "@/lib/services/item";
import { sendMessage } from "@/lib/services/telegram";
import { shouldNotify } from "@/lib/services/cron-utils";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
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

      await sendMessage(Number(item.user.telegramId), `🔔 *Reminder:* ${item.title}`);
      await markItemSent(item.id);
      sent++;

      if (item.recurrenceRule || item.recurring !== "none") {
        const nextRemindAt = createNextOccurrence(item.remindAt!, item.recurring, item.recurrenceRule);

        if (nextRemindAt && (!item.recurrenceEnd || nextRemindAt <= item.recurrenceEnd)) {
          await createItem({
            userId: item.userId,
            categoryId: item.categoryId,
            title: item.title,
            description: item.description,
            priority: item.priority,
            dueDate: item.dueDate,
            dueTime: item.dueTime,
            remindAt: nextRemindAt,
            recurring: item.recurring,
            recurrenceRule: item.recurrenceRule,
            recurrenceEnd: item.recurrenceEnd,
          });
        }
      }
    } catch {
      errors++;
    }
  }

  // Deadline escalation
  let escalated = 0;
  const candidates = await getEscalationCandidates();

  for (const item of candidates) {
    if (!item.user.telegramId || !item.dueDate) continue;
    if (!shouldNotify(item.user, item.priority, now)) continue;

    const userNowStr = new Intl.DateTimeFormat("en-CA", { timeZone: item.user.timezone }).format(now);
    const userTimeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: item.user.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    const dueTime = item.dueTime ?? "23:59";

    const dueMinutes = toMinutes(item.dueDate, dueTime);
    const nowMinutes = toMinutes(userNowStr, userTimeStr);
    const minutesUntilDue = dueMinutes - nowMinutes;
    const hoursUntilDue = minutesUntilDue / 60;

    let newStage = item.notificationStage;
    let message = "";

    if (hoursUntilDue < 0 && item.notificationStage < 3) {
      newStage = 3;
      message = `🚨 *Overdue:* ${item.title}`;
    } else if (hoursUntilDue <= 2 && hoursUntilDue > 0 && item.notificationStage < 2) {
      newStage = 2;
      message = `⚠️ *Due soon:* ${item.title} (in ${Math.round(minutesUntilDue)} min)`;
    } else if (hoursUntilDue <= 24 && hoursUntilDue > 2 && item.notificationStage < 1) {
      newStage = 1;
      message = `📋 *Due tomorrow:* ${item.title}`;
    }

    if (newStage > item.notificationStage) {
      try {
        await sendMessage(Number(item.user.telegramId), message);
        await updateNotificationStage(item.id, newStage);
        escalated++;
      } catch {
        errors++;
      }
    }
  }

  return NextResponse.json({ processed: dueItems.length, sent, skipped, errors, escalated });
}

function toMinutes(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  // Days since epoch * 1440 + hours * 60 + minutes
  const daysSinceEpoch = Math.floor(new Date(y, mo - 1, d).getTime() / 86400000);
  return daysSinceEpoch * 1440 + h * 60 + m;
}
