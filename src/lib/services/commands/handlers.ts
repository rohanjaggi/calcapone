import { chatWithAi } from "@/lib/services/ai";
import { executeToolCall } from "@/lib/services/execute-tool";
import { createItem } from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { createEvent } from "@/lib/services/calendar";
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
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}

export async function handleToday(_ctx: CommandContext): Promise<string> {
  return "Not implemented";
}

export async function handleList(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}
