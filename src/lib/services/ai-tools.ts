// src/lib/services/ai-tools.ts
export const AI_TOOLS = [
  {
    name: "create_todo",
    description: "Create a new todo/task for the user",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The todo title" },
        description: { type: "string", description: "Optional longer description" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level" },
        category: { type: "string", description: "Category name (e.g. Work, Personal)" },
        due_date: { type: "string", description: "ISO 8601 datetime for when this is due" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_reminder",
    description: "Set a reminder for the user at a specific time",
    parameters: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "What to remind the user about" },
        remind_at: { type: "string", description: "ISO 8601 datetime for when to send the reminder" },
        recurring: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "Recurrence pattern" },
        category: { type: "string", description: "Category name" },
      },
      required: ["message", "remind_at"],
    },
  },
  {
    name: "list_todos",
    description: "List the user's todos, optionally filtered",
    parameters: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "done"], description: "Filter by status" },
        category: { type: "string", description: "Filter by category name" },
      },
    },
  },
  {
    name: "complete_todo",
    description: "Mark a todo as done",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The title of the todo to complete (fuzzy match)" },
      },
      required: ["title"],
    },
  },
  {
    name: "delete_todo",
    description: "Delete a todo",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The title of the todo to delete (fuzzy match)" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_reminders",
    description: "List the user's pending reminders",
    parameters: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["pending", "sent", "cancelled"] },
      },
    },
  },
  {
    name: "cancel_reminder",
    description: "Cancel a pending reminder",
    parameters: {
      type: "object" as const,
      properties: {
        message: { type: "string", description: "The reminder message to cancel (fuzzy match)" },
      },
      required: ["message"],
    },
  },
  {
    name: "get_calendar",
    description: "Get the user's calendar events for a date range",
    parameters: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "ISO 8601 start date" },
        end_date: { type: "string", description: "ISO 8601 end date" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "suggest_schedule",
    description: "Suggest optimal times to work on pending todos based on free calendar slots",
    parameters: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "ISO 8601 date to analyze (defaults to today)" },
      },
    },
  },
  {
    name: "create_category",
    description: "Create a new category for organizing todos and reminders",
    parameters: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Category name" },
        color: { type: "string", description: "Hex color code (e.g. #4A6FA5)" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_categories",
    description: "List the user's categories",
    parameters: { type: "object" as const, properties: {} },
  },
] as const;

export function buildSystemPrompt(user: { telegramUsername: string; timezone: string }): string {
  return `You are Calcapone, a smart personal assistant that helps manage calendar, todos, and reminders.

User: ${user.telegramUsername}
Timezone: ${user.timezone}
Current time: ${new Date().toISOString()}

You can create todos, set reminders, check the calendar, and suggest schedule optimizations.
When the user mentions a time without a date, assume today.
When the user says "tomorrow", use the next calendar day in their timezone.
Always confirm what you did after performing an action.
Keep responses concise — this is a Telegram chat, not an essay.
If the user says something like "Done!" after a reminder, mark the linked todo as complete.
Suggest categories when the user creates items without one.`;
}
