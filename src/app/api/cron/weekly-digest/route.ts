import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/services/cron-utils";
import { sendMessage, esc, b } from "@/lib/services/telegram";
import { formatHHmmInTz, todayInTz, weekdayInTz, hhmmToMinutes, isValidTz, startOfDayInTz, formatDateInTz, addDays } from "@/lib/tz";

export const maxDuration = 60;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WINDOW_MINUTES = 180;

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

      const weekStartStr = addDays(todayStr, -6);
      const weekStart = startOfDayInTz(weekStartStr, user.timezone);
      const nextWeekStartStr = addDays(todayStr, 1);
      const nextWeekEndStr = addDays(todayStr, 7);

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

      // A daily reminder is a done row per day (firing completes it), so repeats are rolled up
      // into "Take meds ×7" rather than listed seven times as if they were seven achievements.
      const doneByTitle = new Map<string, number>();
      for (const i of completed) doneByTitle.set(i.title, (doneByTitle.get(i.title) ?? 0) + 1);
      lines.push(b(`Done (${completed.length})`));
      if (doneByTitle.size > 0) {
        [...doneByTitle].slice(0, 10).forEach(([title, n]) => lines.push(`• ${esc(title)}${n > 1 ? ` ×${n}` : ""}`));
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
