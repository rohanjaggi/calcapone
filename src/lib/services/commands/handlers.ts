import { listItems, updateItem } from "@/lib/services/item";
import { getEvents } from "@/lib/services/calendar";
import type { ItemStatus } from "@/generated/prisma/enums";
import type { CommandContext } from "./index";

export async function handleDone(body: string, ctx: CommandContext): Promise<string> {
  if (!body) return "Usage: /done task name";

  const items = await listItems(ctx.userId, { status: "pending" as ItemStatus });
  const match = items.find((item) =>
    item.title.toLowerCase().includes(body.toLowerCase())
  );

  if (!match) return `No pending task matching "${body}"`;

  await updateItem(match.id, ctx.userId, { status: "done" as ItemStatus });
  return `Completed: **${match.title}**`;
}

export async function handleToday(ctx: CommandContext): Promise<string> {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.user.timezone }).format(now);

  const allPending = await listItems(ctx.userId, { status: "pending" as ItemStatus });

  const overdue = allPending.filter(
    (item) => item.dueDate && item.dueDate < todayStr && !item.remindAt
  );
  const todayItems = allPending.filter(
    (item) => item.dueDate === todayStr && !item.remindAt
  );
  const todayReminders = allPending.filter((item) => {
    if (!item.remindAt) return false;
    const remindDate = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.user.timezone }).format(item.remindAt);
    return remindDate === todayStr;
  });

  const parts: string[] = [];

  if (overdue.length > 0) {
    parts.push(`*Overdue (${overdue.length})*`);
    overdue.forEach((item) => parts.push(`• ${item.title} — due ${item.dueDate}`));
  }

  if (todayItems.length > 0 || todayReminders.length > 0) {
    parts.push(`\n*Today (${todayItems.length + todayReminders.length})*`);
    todayItems.forEach((item) => {
      const time = item.dueTime ? ` ${item.dueTime}` : "";
      parts.push(`•${time} ${item.title}`);
    });
    todayReminders.forEach((item) => {
      const time = item.remindAt
        ? ` ${new Intl.DateTimeFormat("en-US", { timeZone: ctx.user.timezone, hour: "2-digit", minute: "2-digit" }).format(item.remindAt)}`
        : "";
      parts.push(`• 🔔${time} ${item.title}`);
    });
  }

  if (ctx.user.googleRefreshToken) {
    try {
      const startOfDay = new Date(`${todayStr}T00:00:00Z`);
      const threeDaysOut = new Date(startOfDay);
      threeDaysOut.setDate(startOfDay.getDate() + 3);
      const events = await getEvents(
        ctx.user.googleRefreshToken,
        ctx.user.googleCalendarId ?? "primary",
        startOfDay,
        threeDaysOut
      );
      const upcoming = events.slice(0, 3);
      if (upcoming.length > 0) {
        parts.push(`\n*Next up*`);
        upcoming.forEach((e) => {
          const dateLabel = e.startTime.startsWith(todayStr) ? "Today" : e.startTime.slice(0, 10);
          parts.push(`• ${dateLabel} ${e.startTime.slice(11, 16)} — ${e.title}`);
        });
      }
    } catch {
      // calendar fetch failure is non-fatal
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
      return `${i + 1}. ${icon} ${item.title}${due}`;
    })
    .join("\n");
}
