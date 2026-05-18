import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listItems } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { sendMessage } from "@/lib/services/telegram";
import { decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const users = await prisma.user.findMany({
    where: { briefingEnabled: true, briefingTime: { not: null } },
  });

  let sent = 0;
  let errors = 0;

  for (const user of users) {
    // Check if current minute matches briefingTime in user's timezone
    const userNow = new Intl.DateTimeFormat("en-GB", {
      timeZone: user.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);

    if (userNow !== user.briefingTime) continue;
    if (!user.telegramId) continue;

    try {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(now);
      const pending = await listItems(user.id, { status: "pending" });
      const overdue = pending.filter((i) => i.dueDate && i.dueDate < todayStr && !i.remindAt);
      const todayItems = pending.filter((i) => i.dueDate === todayStr);

      let calendarSummary = "";
      if (user.googleRefreshToken) {
        try {
          const startOfDay = new Date(`${todayStr}T00:00:00Z`);
          const endOfDay = new Date(`${todayStr}T23:59:59Z`);
          const events = await getEvents(user.googleRefreshToken, user.googleCalendarId ?? "primary", startOfDay, endOfDay);
          if (events.length > 0) {
            calendarSummary = `\nCalendar: ${events.map((e) => `${e.startTime.slice(11, 16)} ${e.title}`).join(", ")}`;
          }
        } catch {
          // non-fatal
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
        const prompt = `Write a short morning briefing (3–5 lines) for ${user.telegramUsername}. Today: ${todayStr}. Tasks today:\n${taskLines}${overdueLines}${calendarSummary}\n\nBe friendly, concise, and motivating. No markdown headers.`;
        const { text } = await chatWithAi(prompt, { telegramUsername: user.telegramUsername, timezone: user.timezone }, aiConfig);
        message = text || buildFallbackBriefing(todayStr, todayItems.length, overdue.length, calendarSummary);
      } catch {
        message = buildFallbackBriefing(todayStr, todayItems.length, overdue.length, calendarSummary);
      }

      await sendMessage(Number(user.telegramId), message);
      sent++;
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ sent, errors });
}

function buildFallbackBriefing(date: string, taskCount: number, overdueCount: number, calendarSummary: string): string {
  const lines = [`Good morning! Here's your day (${date}):`, `📋 ${taskCount} task${taskCount !== 1 ? "s" : ""} scheduled today`];
  if (overdueCount > 0) lines.push(`⚠️ ${overdueCount} overdue item${overdueCount !== 1 ? "s" : ""} to clear`);
  if (calendarSummary) lines.push(calendarSummary.trim());
  return lines.join("\n");
}
