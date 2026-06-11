import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/services/cron-utils";
import { sendMessage } from "@/lib/services/telegram";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function POST(request: NextRequest) {
  return runCronJob(request, {
    filter: { weeklyDigestEnabled: true },
    shouldRun: (user, now) => {
      const userTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: user.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);

      const userWeekday = new Intl.DateTimeFormat("en-US", {
        timeZone: user.timezone,
        weekday: "long",
      }).format(now);

      const targetDay = DAY_NAMES[user.digestDay];
      return userTime === user.digestTime && userWeekday === targetDay;
    },
    handler: async (user, now) => {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(now);

      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      weekStart.setUTCHours(0, 0, 0, 0);
      const weekStartStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(weekStart);

      const nextWeekStart = new Date(now);
      nextWeekStart.setDate(now.getDate() + 1);
      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
      const nextWeekStartStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(nextWeekStart);
      const nextWeekEndStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(nextWeekEnd);

      const [completed, overdue, upcoming] = await Promise.all([
        prisma.item.findMany({
          where: { userId: user.id, status: "done", updatedAt: { gte: weekStart, lte: now } },
        }),
        prisma.item.findMany({
          where: { userId: user.id, status: { not: "done" }, dueDate: { lt: todayStr } },
        }),
        prisma.item.findMany({
          where: { userId: user.id, status: { not: "done" }, dueDate: { gte: nextWeekStartStr, lte: nextWeekEndStr } },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
      ]);

      const lines: string[] = [`*Week of ${weekStartStr}*\n`];

      lines.push(`*Done (${completed.length})*`);
      if (completed.length > 0) {
        completed.slice(0, 10).forEach((i) => lines.push(`• ${i.title}`));
      } else {
        lines.push("• —");
      }

      if (overdue.length > 0) {
        lines.push(`\n*Overdue (${overdue.length})*`);
        overdue.slice(0, 5).forEach((i) => lines.push(`• ${i.title} — ${i.dueDate}`));
      }

      if (upcoming.length > 0) {
        lines.push(`\n*Next week*`);
        upcoming.forEach((i) => lines.push(`• ${i.title}${i.dueDate ? ` — ${i.dueDate}` : ""}`));
      }

      await sendMessage(Number(user.telegramId), lines.join("\n"));
    },
  });
}
