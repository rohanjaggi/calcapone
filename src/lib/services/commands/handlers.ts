import { listItems, updateItem } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import { esc, b } from "@/lib/services/telegram";
import { todayInTz, formatDateInTz, formatHHmmInTz, startOfDayInTz } from "@/lib/tz";
import type { ItemStatus } from "@/generated/prisma/enums";
import type { CommandContext } from "./index";

export async function handleDone(body: string, ctx: CommandContext): Promise<string> {
  if (!body) return "Usage: /done task name";

  const open = (await listItems(ctx.userId)).filter((item) => item.status !== "done");
  const needle = body.toLowerCase();
  // Prefer an exact title match; otherwise fall back to the first substring match.
  const match =
    open.find((item) => item.title.toLowerCase() === needle) ??
    open.find((item) => item.title.toLowerCase().includes(needle));

  if (!match) return `No open task matching "${esc(body)}"`;

  await updateItem(match.id, ctx.userId, { status: "done" as ItemStatus });
  return `Completed: ${b(match.title)}`;
}

export async function handleToday(ctx: CommandContext): Promise<string> {
  const now = new Date();
  const tz = ctx.user.timezone;
  const todayStr = todayInTz(tz, now);

  const allPending = await listItems(ctx.userId, { status: "pending" as ItemStatus });

  const overdue = allPending.filter(
    (item) => item.dueDate && item.dueDate < todayStr && !item.remindAt
  );
  const todayItems = allPending.filter(
    (item) => item.dueDate === todayStr && !item.remindAt
  );
  const todayReminders = allPending.filter((item) => {
    if (!item.remindAt) return false;
    return formatDateInTz(item.remindAt, tz) === todayStr;
  });

  const parts: string[] = [];

  if (overdue.length > 0) {
    parts.push(b(`Overdue (${overdue.length})`));
    overdue.forEach((item) => parts.push(`• ${esc(item.title)} — due ${item.dueDate}`));
  }

  if (todayItems.length > 0 || todayReminders.length > 0) {
    parts.push(`\n${b(`Today (${todayItems.length + todayReminders.length})`)}`);
    todayItems.forEach((item) => {
      const time = item.dueTime ? ` ${item.dueTime}` : "";
      parts.push(`•${time} ${esc(item.title)}`);
    });
    todayReminders.forEach((item) => {
      const time = item.remindAt ? ` ${formatHHmmInTz(item.remindAt, tz)}` : "";
      parts.push(`• 🔔${time} ${esc(item.title)}`);
    });
  }

  if (ctx.user.googleRefreshToken) {
    try {
      const startOfDay = startOfDayInTz(todayStr, tz);
      const threeDaysOut = new Date(startOfDay.getTime() + 3 * 86400000);
      const events = await getEvents(
        ctx.user.googleRefreshToken,
        ctx.user.googleCalendarId ?? "primary",
        now,
        threeDaysOut,
        tz
      );
      const upcoming = events.slice(0, 3);
      if (upcoming.length > 0) {
        parts.push(`\n${b("Next up")}`);
        upcoming.forEach((e) => {
          if (e.allDay) {
            const dateLabel = e.startTime === todayStr ? "Today" : e.startTime;
            parts.push(`• ${dateLabel} (all day) — ${esc(e.title)}`);
            return;
          }
          const start = new Date(e.startTime);
          const dateStr = formatDateInTz(start, tz);
          const dateLabel = dateStr === todayStr ? "Today" : dateStr;
          parts.push(`• ${dateLabel} ${formatHHmmInTz(start, tz)} — ${esc(e.title)}`);
        });
      }
    } catch (error) {
      console.error("[commands:/today] calendar fetch failed:", error instanceof Error ? error.message : error);
    }
  }

  if (parts.length === 0) return "Nothing scheduled for today!";
  return parts.join("\n");
}

export async function handleList(body: string, ctx: CommandContext): Promise<string> {
  const filters = body === "all" ? {} : { status: "pending" as ItemStatus };
  const items = await listItems(ctx.userId, filters);

  if (items.length === 0) return "No items found.";

  return items
    .map((item, i) => {
      const icon = item.remindAt ? "🔔" : "📋";
      const due = item.dueDate ? ` (${item.dueDate})` : "";
      return `${i + 1}. ${icon} ${esc(item.title)}${due}`;
    })
    .join("\n");
}
