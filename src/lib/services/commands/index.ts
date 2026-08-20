import {
  handleDone,
  handleToday,
  handleList,
  handleTimezone,
  handleAlerts,
  handleUndo,
  handleWeek,
  handleNote,
  handleSearch,
  handleCourses,
  handleExams,
  handleDue,
} from "./handlers";

export type ParsedCommand = {
  command: string;
  body: string;
};

export type CommandContext = {
  userId: string;
  chatId: number;
  user: {
    telegramUsername: string;
    timezone: string;
    googleRefreshToken: string | null;
    googleCalendarId: string | null;
    eventReminderMinutes: number | null;
  };
};

export type CommandReply = {
  text: string;
  /** Items this reply enumerated, in printed order — the caller records these so `/done 3` and reply-targeting work. */
  itemIds?: string[];
};

const AI_HINT_COMMANDS = new Set(["todo", "remind", "event"]);
const DB_COMMANDS = new Set([
  "alerts",
  "done",
  "today",
  "list",
  "timezone",
  "start",
  "help",
  "undo",
  "week",
  "note",
  "search",
  "courses",
  "exams",
  "due",
]);

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

<b>Quick add</b>
/todo buy groceries by Friday
/remind take meds daily at 9am
/event lunch with Sarah tomorrow noon
/note something to remember — instant, no AI involved

<b>Agenda</b>
/today — agenda at a glance
/week — the next 7 days
/list — all pending tasks
/search milk — find items by keyword

<b>Manage</b>
/done 3 — complete the 3rd item in your last list
/done buy groceries — or match by name
/undo — reverse your last action
/alerts 15 — ping me 15 min before an event starts
/timezone — show or change your timezone

<b>School</b>
/courses — list your courses
/courses add CS2040 Data Structures — add one
/exams — upcoming exams, soonest first
/due CS2040 — what's outstanding for a course

Or just type naturally — I'll figure out the rest.`;

export async function handleCommand(
  parsed: ParsedCommand,
  ctx: CommandContext
): Promise<CommandReply> {
  switch (parsed.command) {
    case "done":
      return handleDone(parsed.body, ctx);
    case "today":
      return handleToday(ctx);
    case "list":
      return handleList(parsed.body, ctx);
    case "timezone":
      return handleTimezone(parsed.body, ctx);
    case "alerts":
      return handleAlerts(parsed.body, ctx);
    case "undo":
      return handleUndo(ctx);
    case "week":
      return handleWeek(ctx);
    case "note":
      return handleNote(parsed.body, ctx);
    case "search":
      return handleSearch(parsed.body, ctx);
    case "courses":
      return handleCourses(parsed.body, ctx);
    case "exams":
      return handleExams(ctx);
    case "due":
      return handleDue(parsed.body, ctx);
    case "start":
    case "help":
      return { text: HELP_TEXT };
    default:
      return { text: `Unknown command: /${parsed.command}` };
  }
}
