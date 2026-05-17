import { chatWithAi } from "@/lib/services/ai";
import { executeToolCall } from "@/lib/services/execute-tool";
import { createItem, listItems, updateItem } from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { createEvent, getEvents } from "@/lib/services/calendar";
import type { ItemStatus } from "@/generated/prisma/enums";
import type { CommandContext } from "./index";

const COMMAND_PROMPTS: Record<string, string> = {
  todo: `[QUICK COMMAND: /todo]
Create a todo item using the create_item tool.
Do NOT set remind_at — this is a todo, not a reminder.
If no category is mentioned, use "General".
If no priority is mentioned, use "medium".`,
  remind: `[QUICK COMMAND: /remind]
Create a reminder using the create_item tool.
You MUST set remind_at — this is a reminder, not a plain todo.
If no specific time is given, default to 9:00 AM in the user's timezone.
If the user mentions "daily", "weekly", or "monthly", set the recurring field.
If no category is mentioned, use "Reminders".`,
  event: `[QUICK COMMAND: /event]
Create a calendar event using the create_calendar_event tool.
start_time and end_time must be ISO 8601 datetimes in the user's timezone.
If no end time is mentioned, default to 1 hour after start.`,
};

function buildCommandPrompt(type: string, body: string): string {
  return `${COMMAND_PROMPTS[type]}\n\nUser's request: ${body}`;
}

async function runAiCommand(
  type: string,
  body: string,
  ctx: CommandContext
): Promise<string | null> {
  const prompt = buildCommandPrompt(type, body);
  const { toolCalls } = await chatWithAi(
    prompt,
    { telegramUsername: ctx.user.telegramUsername, timezone: ctx.user.timezone },
    ctx.aiConfig
  );
  const results: string[] = [];
  for (const call of toolCalls) {
    const result = await executeToolCall(call.name, call.args, ctx.userId, ctx.user);
    if (result) results.push(result);
  }
  return results.length > 0 ? results.join("\n") : null;
}

export async function handleTodo(body: string, ctx: CommandContext): Promise<string> {
  if (!body) return "Usage: /todo buy groceries by Friday";
  return (
    (await runAiCommand("todo", body, ctx)) ??
    "Couldn't create that todo. Usage: /todo buy groceries by Friday"
  );
}

export async function handleRemind(body: string, ctx: CommandContext): Promise<string> {
  if (!body) return "Usage: /remind take medication daily at 9am";
  return (
    (await runAiCommand("remind", body, ctx)) ??
    "Couldn't create that reminder. Usage: /remind take medication daily at 9am"
  );
}

export async function handleEvent(body: string, ctx: CommandContext): Promise<string> {
  if (!body) return "Usage: /event lunch with Sarah tomorrow at noon";

  const prompt = buildCommandPrompt("event", body);
  const { toolCalls } = await chatWithAi(
    prompt,
    { telegramUsername: ctx.user.telegramUsername, timezone: ctx.user.timezone },
    ctx.aiConfig
  );

  const call = toolCalls.find((tc) => tc.name === "create_calendar_event");
  if (!call) return "Couldn't parse that event. Usage: /event lunch with Sarah tomorrow at noon";

  const args = call.args;
  const title = args.title as string;
  const startTime = args.start_time as string;
  const endTime = args.end_time as string;
  const description = (args.description as string) ?? undefined;

  // Derive dueDate/dueTime from start_time
  const startDate = new Date(startTime);
  const dueDate = startDate.toISOString().split("T")[0];
  const dueTime = startDate.toTimeString().slice(0, 5);

  // Find or create "Events" category
  let cats = await listCategories(ctx.userId);
  let cat = cats.find((c) => c.name.toLowerCase() === "events");
  if (!cat) {
    cat = await createCategory({ userId: ctx.userId, name: "Events" });
  }

  // Create in-app item
  await createItem({
    userId: ctx.userId,
    categoryId: cat.id,
    title,
    description: description ?? null,
    dueDate,
    dueTime,
  });

  const parts: string[] = [`Created event: **${title}** (${dueDate} ${dueTime})`];

  // Sync to Google Calendar if connected
  if (ctx.user.googleRefreshToken) {
    try {
      await createEvent(
        ctx.user.googleRefreshToken,
        ctx.user.googleCalendarId ?? "primary",
        { title, startTime, endTime, description }
      );
      parts.push("Synced to Google Calendar");
    } catch {
      parts.push("Failed to sync to Google Calendar");
    }
  }

  return parts.join("\n");
}

export async function handleDone(
  body: string,
  ctx: CommandContext
): Promise<string> {
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
    parts.push(`⚠️ *Overdue (${overdue.length})*`);
    overdue.forEach((item) => {
      parts.push(`• ${item.title} — due ${item.dueDate}`);
    });
  }

  if (todayItems.length > 0 || todayReminders.length > 0) {
    parts.push(`\n📋 *Today (${todayItems.length + todayReminders.length})*`);
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
        parts.push(`\n📅 *Next up*`);
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

export async function handleList(
  body: string,
  ctx: CommandContext
): Promise<string> {
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
