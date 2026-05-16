import {
  handleTodo,
  handleRemind,
  handleEvent,
  handleDone,
  handleToday,
  handleList,
  handleStart,
  handleHelp,
} from "./handlers";

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
  aiConfig: {
    provider: string | null;
    apiKey: string | null;
    model: string | null;
  };
};

export const COMMANDS = new Set([
  "todo",
  "remind",
  "event",
  "done",
  "today",
  "list",
  "start",
  "help",
]);

const COMMAND_REGEX = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]+))?$/;

export function parseSlashCommand(text: string): ParsedCommand | null {
  const match = text.match(COMMAND_REGEX);
  if (!match) return null;

  const command = match[1].toLowerCase();
  if (!COMMANDS.has(command)) return null;

  return {
    command,
    body: match[2] ?? "",
  };
}

export const HELP_TEXT = `
Available commands:
/todo <task> — Add a new task or reminder (AI-parsed)
/remind <reminder> — Set a reminder (AI-parsed)
/event <details> — Create a calendar event (AI-parsed)
/done <task> — Mark a task as done
/today — Show today's agenda (tasks + calendar)
/list — List all pending tasks
/start — Get started with Calcapone
/help — Show this help message
`.trim();

export async function handleCommand(
  parsed: ParsedCommand,
  ctx: CommandContext
): Promise<string> {
  switch (parsed.command) {
    case "todo":
      return handleTodo(parsed, ctx);
    case "remind":
      return handleRemind(parsed, ctx);
    case "event":
      return handleEvent(parsed, ctx);
    case "done":
      return handleDone(parsed, ctx);
    case "today":
      return handleToday(parsed, ctx);
    case "list":
      return handleList(parsed, ctx);
    case "start":
      return handleStart(parsed, ctx);
    case "help":
      return handleHelp(parsed, ctx);
    default:
      return `Unknown command: /${parsed.command}`;
  }
}
