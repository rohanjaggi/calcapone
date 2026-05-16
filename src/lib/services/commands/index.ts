import {
  handleTodo,
  handleRemind,
  handleEvent,
  handleDone,
  handleToday,
  handleList,
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
    body: match[2]?.trim() ?? "",
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
      return handleTodo(parsed.body, ctx);
    case "remind":
      return handleRemind(parsed.body, ctx);
    case "event":
      return handleEvent(parsed.body, ctx);
    case "done":
      return handleDone(parsed.body, ctx);
    case "today":
      return handleToday(ctx);
    case "list":
      return handleList(parsed.body, ctx);
    case "start":
      return HELP_TEXT;
    case "help":
      return HELP_TEXT;
    default:
      return `Unknown command: /${parsed.command}`;
  }
}
