import { chatWithAi } from "@/lib/services/ai";
import { executeToolCall } from "@/lib/services/execute-tool";
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

export async function handleEvent(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
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
