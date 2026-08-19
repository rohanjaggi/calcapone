import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/services/cron-utils";
import { sendMessage, esc, b } from "@/lib/services/telegram";
import { formatHHmmInTz, todayInTz, weekdayInTz, hhmmToMinutes, isValidTz, startOfDayInTz, formatDateInTz } from "@/lib/tz";

export const maxDuration = 60;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WINDOW_MINUTES = 180;

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  return runCronJob(request, {
    filter: { weeklyDigestEnabled: true },
    shouldRun: (user, now) => {
      if (!isValidTz(user.timezone)) return false;
      const today = todayInTz(user.timezone, now);
      if (user.lastDigestSentOn === today) return false;
      if (weekdayInTz(now, user.timezone) !== DAY_NAMES[user.digestDay]) return false;
      const nowMin = hhmmToMinutes(formatHHmmInTz(now, user.timezone));
      const targetMin = hhmmToMinutes(user.digestTime);
      return nowMin >= targetMin && nowMin <= targetMin + WINDOW_MINUTES;
    },
    handler: async (user, now) => {
      const todayStr = todayInTz(user.timezone, now);

      const claimed = await prisma.user.updateMany({
        where: { id: user.id, NOT: { lastDigestSentOn: todayStr } },
        data: { lastDigestSentOn: todayStr },
      });
      if (claimed.count === 0) return;

      const weekStartStr = shiftDate(todayStr, -6);
      const weekStart = startOfDayInTz(weekStartStr, user.timezone);
      const nextWeekStartStr = shiftDate(todayStr, 1);
      const nextWeekEndStr = shiftDate(todayStr, 7);

      const [completed, overdue, upcoming] = await Promise.all([
        prisma.item.findMany({
          where: { userId: user.id, parentId: null, status: "done", updatedAt: { gte: weekStart, lte: now } },
        }),
        prisma.item.findMany({
          where: { userId: user.id, parentId: null, status: { not: "done" }, dueDate: { lt: todayStr } },
        }),
        prisma.item.findMany({
          where: { userId: user.id, parentId: null, status: { not: "done" }, dueDate: { gte: nextWeekStartStr, lte: nextWeekEndStr } },
          orderBy: { dueDate: "asc" },
          take: 10,
        }),
      ]);

      const lines: string[] = [`${b(`Week of ${formatDateInTz(weekStart, user.timezone)}`)}\n`];

      lines.push(b(`Done (${completed.length})`));
      if (completed.length > 0) {
        completed.slice(0, 10).forEach((i) => lines.push(`• ${esc(i.title)}`));
      } else {
        lines.push("• —");
      }

      if (overdue.length > 0) {
        lines.push(`\n${b(`Overdue (${overdue.length})`)}`);
        overdue.slice(0, 5).forEach((i) => lines.push(`• ${esc(i.title)} — ${i.dueDate}`));
      }

      if (upcoming.length > 0) {
        lines.push(`\n${b("Next week")}`);
        upcoming.forEach((i) => lines.push(`• ${esc(i.title)}${i.dueDate ? ` — ${i.dueDate}` : ""}`));
      }

      await sendMessage(Number(user.telegramId), lines.join("\n"));
    },
  });
}
