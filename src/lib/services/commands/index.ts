import { handleDone, handleToday, handleList, handleTimezone } from "./handlers";

export type ParsedCommand = {
  command: string;
  body: string;
};

export type CommandContext = {
  userId: string;
  user: {
    telegramUsername: string;
    timezone: string;
    googleRefreshToken: string | null;
    googleCalendarId: string | null;
  };
};

const AI_HINT_COMMANDS = new Set(["todo", "remind", "event"]);
const DB_COMMANDS = new Set(["done", "today", "list", "timezone", "start", "help"]);

const COMMAND_REGEX = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]+))?$/;

export function parseSlashCommand(text: string): ParsedCommand | null {
  const match = text.match(COMMAND_REGEX);
  if (!match) return null;

  const command = match[1].toLowerCase();
  if (!AI_HINT_COMMANDS.has(command) && !DB_COMMANDS.has(command)) return null;

  return { command, body: match[2]?.trim() ?? "" };
}

export function isAiHintCommand(command: string): boolean {
  return AI_HINT_COMMANDS.has(command);
}

const AI_HINTS: Record<string, string> = {
  todo: "Create a todo item (not a reminder, no remind_at):",
  remind: "Set a reminder (MUST include remind_at). If user says daily/weekly/monthly, set recurring:",
  event: "Create a calendar event:",
};

export function getAiHint(command: string): string {
  return AI_HINTS[command] ?? "";
}

export const HELP_TEXT = `<b>Calcapone</b> — your task &amp; calendar assistant

<b>Quick commands</b>
/todo buy groceries by Friday
/remind take meds daily at 9am
/event lunch with Sarah tomorrow noon
/done buy groceries
/today — agenda at a glance
/list — all pending tasks
/timezone — show or change your timezone

Or just type naturally — I'll figure out the rest.`;

export async function handleCommand(
  parsed: ParsedCommand,
  ctx: CommandContext
): Promise<string> {
  switch (parsed.command) {
    case "done":
      return handleDone(parsed.body, ctx);
    case "today":
      return handleToday(ctx);
    case "list":
      return handleList(parsed.body, ctx);
    case "timezone":
      return handleTimezone(parsed.body, ctx);
    case "start":
    case "help":
      return HELP_TEXT;
    default:
      return `Unknown command: /${parsed.command}`;
  }
}
