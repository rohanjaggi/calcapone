import { NextRequest, NextResponse } from "next/server";
import { getDueItems, markItemSent, createNextOccurrence, createItem } from "@/lib/services/item";
import { sendMessage } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dueItems = await getDueItems(now);
  let sent = 0;
  let errors = 0;

  for (const item of dueItems) {
    try {
      await sendMessage(
        Number(item.user.telegramId),
        `🔔 *Reminder:* ${item.title}`
      );
      await markItemSent(item.id);
      sent++;

      if (item.recurring !== "none") {
        const nextDate = createNextOccurrence(item.remindAt!, item.recurring);
        await createItem({
          userId: item.userId,
          categoryId: item.categoryId,
          title: item.title,
          description: item.description,
          priority: item.priority,
          dueDate: item.dueDate,
          dueTime: item.dueTime,
          remindAt: nextDate,
          recurring: item.recurring,
        });
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ processed: dueItems.length, sent, errors });
}
