import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const users = await prisma.user.findMany({
    where: { weeklyDigestEnabled: true },
  });

  let sent = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const userHour = new Intl.DateTimeFormat("en-GB", {
        timeZone: user.timezone,
        hour: "2-digit",
        hour12: false,
      }).format(now);

      const userWeekday = new Intl.DateTimeFormat("en-US", {
        timeZone: user.timezone,
        weekday: "long",
      }).format(now);

      // Send at 19:xx on Sunday in user's timezone
      if (!userHour.startsWith("19") || userWeekday !== "Sunday") continue;
      if (!user.telegramId) continue;

      // Monday of this week
      const monday = new Date(now);
      monday.setDate(now.getDate() - 6);
      monday.setUTCHours(0, 0, 0, 0);

      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(now);
      const mondayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(monday);

      // Next Monday
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);
      const nextMondayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(nextMonday);

      // Next Sunday
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextMonday.getDate() + 6);
      const nextSundayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(nextSunday);

      const [completed, overdue, upcoming] = await Promise.all([
        prisma.item.findMany({
          where: {
            userId: user.id,
            status: "done",
            updatedAt: { gte: monday, lte: now },
          },
        }),
        prisma.item.findMany({
          where: {
            userId: user.id,
            status: { not: "done" },
            dueDate: { lt: todayStr },
          },
        }),
        prisma.item.findMany({
          where: {
            userId: user.id,
            status: { not: "done" },
            dueDate: { gte: nextMondayStr, lte: nextSundayStr },
          },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
      ]);

      const lines: string[] = [`📊 *Weekly Digest — week of ${mondayStr}*\n`];

      lines.push(`✅ *Completed (${completed.length})*`);
      if (completed.length > 0) {
        completed.slice(0, 10).forEach((i) => lines.push(`• ${i.title}`));
      } else {
        lines.push("• Nothing completed this week");
      }

      if (overdue.length > 0) {
        lines.push(`\n⚠️ *Still overdue (${overdue.length})*`);
        overdue.slice(0, 5).forEach((i) => lines.push(`• ${i.title} (due ${i.dueDate})`));
      }

      if (upcoming.length > 0) {
        lines.push(`\n📅 *Next week (${upcoming.length} items)*`);
        upcoming.forEach((i) => lines.push(`• ${i.title}${i.dueDate ? ` — ${i.dueDate}` : ""}`));
      }

      await sendMessage(Number(user.telegramId), lines.join("\n"));
      sent++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ sent, errors });
}
