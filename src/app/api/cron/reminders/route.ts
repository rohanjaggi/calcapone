import { NextRequest, NextResponse } from "next/server";
import { getDueReminders, markSent, createNextOccurrence, createReminder } from "@/lib/services/reminder";
import { sendMessage } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueReminders = await getDueReminders(now);
  let sent = 0;
  let errors = 0;

  for (const reminder of dueReminders) {
    try {
      await sendMessage(
        reminder.user.telegramId,
        `🔔 *Reminder:* ${reminder.message}`
      );
      await markSent(reminder.id);
      sent++;

      if (reminder.recurring !== "none") {
        const nextDate = createNextOccurrence(reminder.remindAt, reminder.recurring);
        await createReminder({
          userId: reminder.userId,
          message: reminder.message,
          remindAt: nextDate,
          recurring: reminder.recurring,
          categoryId: reminder.categoryId,
          todoId: reminder.todoId,
        });
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ processed: dueReminders.length, sent, errors });
}
