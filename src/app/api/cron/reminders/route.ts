import { NextRequest, NextResponse } from "next/server";
import { getDueItems, markItemSent, createNextOccurrence, createItem } from "@/lib/services/item";
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

      if (item.recurring !== "none") {
        await createItem({
          userId: item.userId,
          categoryId: item.categoryId,
          title: item.title,
          description: item.description,
          priority: item.priority,
          dueDate: item.dueDate,
          dueTime: item.dueTime,
          remindAt: createNextOccurrence(item.remindAt!, item.recurring),
          recurring: item.recurring,
        });
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ processed: dueItems.length, sent, skipped, errors });
}
