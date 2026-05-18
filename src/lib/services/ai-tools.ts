// src/lib/services/ai-tools.ts
export const AI_TOOLS = [
  {
    name: "create_item",
    description: "Create a new task or reminder for the user. If remind_at is provided, it becomes a reminder that triggers a Telegram notification.",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The item title" },
        description: { type: "string", description: "Optional longer description" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority level" },
        category: { type: "string", description: "Category name (e.g. Work, Personal). Required." },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        due_time: { type: "string", description: "Due time in HH:mm format (24h)" },
        remind_at: { type: "string", description: "ISO 8601 datetime to send a Telegram reminder notification" },
        recurring: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "Recurrence pattern for reminders" },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "list_items",
    description: "List the user's tasks and reminders, optionally filtered by status or category",
    parameters: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "done"], description: "Filter by status" },
        category: { type: "string", description: "Filter by category name" },
      },
    },
  },
  {
    name: "complete_item",
    description: "Mark a task or reminder as done",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The title of the item to complete (fuzzy match)" },
      },
      required: ["title"],
    },
  },
  {
    name: "delete_item",
    description: "Delete a task or reminder",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The title of the item to delete (fuzzy match)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_item",
    description: "Update an existing task or reminder. Use for rescheduling, snoozing, changing priority, or renaming. Fuzzy-matches on title.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The title or partial title to find the item" },
        title: { type: "string", description: "New title" },
        due_date: { type: ["string", "null"] as unknown as "string", description: "New due date YYYY-MM-DD, or null to clear" },
        due_time: { type: ["string", "null"] as unknown as "string", description: "New due time HH:mm, or null to clear" },
        remind_at: { type: ["string", "null"] as unknown as "string", description: "New reminder ISO 8601 datetime, or null to clear" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "New priority" },
        status: { type: "string", enum: ["pending", "in_progress", "done"], description: "New status" },
      },
      required: ["query"],
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
    name: "create_calendar_event",
    description: "Create a new event on the user's Google Calendar",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Event title/summary" },
        start_time: { type: "string", description: "ISO 8601 datetime for event start" },
        end_time: { type: "string", description: "ISO 8601 datetime for event end" },
        description: { type: "string", description: "Optional event description" },
      },
      required: ["title", "start_time", "end_time"],
    },
  },
  {
    name: "update_calendar_event",
    description: "Update an existing calendar event. Fuzzy-matches by title. Updates both the in-app item and the linked Google Calendar event.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The title or partial title to find the event" },
        title: { type: "string", description: "New event title" },
        start_time: { type: "string", description: "New ISO 8601 start datetime" },
        end_time: { type: "string", description: "New ISO 8601 end datetime" },
        description: { type: "string", description: "New event description" },
      },
      required: ["query"],
    },
  },
  {
    name: "delete_calendar_event",
    description: "Delete a calendar event. Fuzzy-matches by title. Deletes both the in-app item and the linked Google Calendar event.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The title or partial title of the event to delete" },
      },
      required: ["query"],
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

export function buildSystemPrompt(user: { telegramUsername: string; timezone: string; categories?: string[] }): string {
  const categoryList = user.categories?.length
    ? `Available categories: ${user.categories.join(", ")}`
    : "No categories exist yet.";

  return `You are Calcapone, a smart personal assistant that helps manage calendar, todos, and reminders.

User: ${user.telegramUsername}
Timezone: ${user.timezone}
Current time: ${new Date().toISOString()}

${categoryList}

You can create, update, and delete items (tasks and reminders), create/update/delete calendar events, and suggest schedule optimizations.
When the user mentions a time without a date, assume today.
When the user says "tomorrow", use the next calendar day in their timezone.
Always confirm what you did after performing an action.
Keep responses concise — this is a Telegram chat, not an essay.
If the user says something like "Done!" after a reminder, mark the linked todo as complete.
When the user asks to move, reschedule, or change a calendar event, use update_calendar_event.
When the user asks to cancel or delete a calendar event, use delete_calendar_event.
When creating tasks, ONLY use one of the existing categories listed above. Never invent new category names. Pick the most relevant existing category.
Calendar events are separate from tasks — do NOT create an in-app task when creating a calendar event.`;
}
