import { NextRequest } from "next/server";
import { runCronJob } from "@/lib/services/cron-utils";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { sendMessage } from "@/lib/services/telegram";
import { decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";

export async function POST(request: NextRequest) {
  return runCronJob(request, {
    filter: { briefingEnabled: true, briefingTime: { not: null } },
    shouldRun: (user, now) => {
      const userTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: user.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      return userTime === user.briefingTime;
    },
    handler: async (user, now) => {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(now);
      const pending = await listItems(user.id, { status: "pending" });
      const overdue = pending.filter((i) => i.dueDate && i.dueDate < todayStr && !i.remindAt);
      const todayItems = pending.filter((i) => i.dueDate === todayStr);

      let calendarSummary = "";
      if (user.googleRefreshToken) {
        try {
          const offsetMs = getTimezoneOffsetMs(user.timezone, now);
          const startOfDay = new Date(new Date(`${todayStr}T00:00:00Z`).getTime() - offsetMs);
          const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);
          const events = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", startOfDay, endOfDay);
          if (events.length > 0) {
            calendarSummary = `\nCalendar: ${events.map((e) => `${e.startTime.slice(11, 16)} ${e.title}`).join(", ")}`;
          }
        } catch {}
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
        const prompt = `Write a short morning briefing (3-5 lines) for ${user.telegramUsername}. Today: ${todayStr}. Tasks today:\n${taskLines}${overdueLines}${calendarSummary}\n\nBe friendly, concise, and motivating. No markdown headers.`;
        const { text } = await chatWithAi(prompt, { telegramUsername: user.telegramUsername, timezone: user.timezone }, aiConfig);
        message = text || fallbackBriefing(todayStr, todayItems.length, overdue.length, calendarSummary);
      } catch {
        message = fallbackBriefing(todayStr, todayItems.length, overdue.length, calendarSummary);
      }

      await sendMessage(Number(user.telegramId), message);
    },
  });
}

function getTimezoneOffsetMs(timezone: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: timezone });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

function fallbackBriefing(date: string, taskCount: number, overdueCount: number, calendarSummary: string): string {
  const lines = [`*${date}*`];
  if (taskCount > 0) lines.push(`${taskCount} task${taskCount !== 1 ? "s" : ""} today`);
  else lines.push("No tasks today");
  if (overdueCount > 0) lines.push(`${overdueCount} overdue`);
  if (calendarSummary) lines.push(calendarSummary.trim());
  return lines.join("\n");
}
