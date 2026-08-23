import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runCronJob } from "@/lib/services/cron-utils";
import { listItems, OPEN_STATUSES } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { sendMessage, esc, b } from "@/lib/services/telegram";
import { decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";
import { formatHHmmInTz, todayInTz, startOfDayInTz, endOfDayInTz, hhmmToMinutes, isValidTz } from "@/lib/tz";

export const maxDuration = 60;

// Cron ticks are not exact (GitHub Actions can be minutes late), so fire any time within
// this window after the configured time — once per day, tracked by lastBriefingSentOn.
const WINDOW_MINUTES = 120;

export async function POST(request: NextRequest) {
  return runCronJob(request, {
    filter: { briefingEnabled: true, briefingTime: { not: null } },
    shouldRun: (user, now) => {
      if (!user.briefingTime || !isValidTz(user.timezone)) return false;
      const today = todayInTz(user.timezone, now);
      if (user.lastBriefingSentOn === today) return false;
      const nowMin = hhmmToMinutes(formatHHmmInTz(now, user.timezone));
      const targetMin = hhmmToMinutes(user.briefingTime);
      return nowMin >= targetMin && nowMin <= targetMin + WINDOW_MINUTES;
    },
    handler: async (user, now) => {
      const todayStr = todayInTz(user.timezone, now);

      // Claim today's briefing so overlapping runs don't send twice.
      const claimed = await prisma.user.updateMany({
        where: { id: user.id, NOT: { lastBriefingSentOn: todayStr } },
        data: { lastBriefingSentOn: todayStr },
      });
      if (claimed.count === 0) return;

      // in_progress counts too — a task you started is still on today's plate.
      const pending = await listItems(user.id, { status: OPEN_STATUSES });
      const overdue = pending.filter((i) => i.dueDate && i.dueDate < todayStr && !i.remindAt);
      const todayItems = pending.filter((i) => i.dueDate === todayStr);

      let calendarSummary = "";
      if (user.googleRefreshToken) {
        try {
          const startOfDay = startOfDayInTz(todayStr, user.timezone);
          const endOfDay = new Date(endOfDayInTz(todayStr, user.timezone).getTime() - 1);
          const events = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", startOfDay, endOfDay, user.timezone);
          if (events.length > 0) {
            calendarSummary = `\nCalendar: ${events
              .map((e) => `${e.allDay ? "all day" : e.startTime.slice(11, 16)} ${e.title}`)
              .join(", ")}`;
          }
        } catch (error) {
          console.error("[cron:briefing] calendar fetch failed:", error instanceof Error ? error.message : error);
        }
      }

      const taskLines = todayItems.map((i) => `- ${i.title}`).join("\n") || "none";
      const overdueLines = overdue.length > 0 ? `\nOverdue: ${overdue.map((i) => i.title).join(", ")}` : "";

      const aiConfig = {
        provider: user.aiProvider as string | null,
        apiKey: decryptUserApiKey(user.aiApiKey),
        model: user.aiModel,
      };

      let message: string;
      try {
        const prompt = `Write a short morning briefing (3-5 lines) for ${user.telegramUsername}. Today: ${todayStr}. Tasks today:\n${taskLines}${overdueLines}${calendarSummary}\n\nBe friendly, concise, and motivating. Plain text only — no markdown, no headers, no asterisks.`;
        const { text } = await chatWithAi(
          prompt,
          { telegramUsername: user.telegramUsername, timezone: user.timezone },
          aiConfig,
        );
        message = text ? esc(text) : fallbackBriefing(todayStr, todayItems.length, overdue.length, calendarSummary);
      } catch (error) {
        console.error("[cron:briefing] AI failed:", error instanceof Error ? error.message : error);
        message = fallbackBriefing(todayStr, todayItems.length, overdue.length, calendarSummary);
      }

      await sendMessage(Number(user.telegramId), message);
    },
  });
}

function fallbackBriefing(date: string, taskCount: number, overdueCount: number, calendarSummary: string): string {
  const lines = [b(date)];
  if (taskCount > 0) lines.push(`${taskCount} task${taskCount !== 1 ? "s" : ""} today`);
  else lines.push("No tasks today");
  if (overdueCount > 0) lines.push(`${overdueCount} overdue`);
  if (calendarSummary) lines.push(esc(calendarSummary.trim()));
  return lines.join("\n");
}
