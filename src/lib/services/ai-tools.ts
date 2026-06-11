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
        recurring: { type: "string", enum: ["none", "daily", "weekly", "monthly"], description: "Legacy simple recurrence. Prefer 'recurrence' object for complex patterns." },
        recurrence: {
          type: "object",
          description: "Rich recurrence pattern. Use for any repeating schedule.",
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "Base frequency" },
            interval: { type: "number", description: "Repeat every N units (default 1). interval=2 + frequency=weekly means every 2 weeks." },
            byDay: { type: "array", items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] }, description: "Days of week" },
            byMonthDay: { type: "array", items: { type: "number" }, description: "Days of month (1-31)" },
            bySetPos: { type: "number", description: "Position in set. 1=first, 2=second, -1=last. E.g. byDay=['MO'], bySetPos=1 means first Monday." },
            until: { type: "string", description: "End date ISO 8601. Recurrence stops after this." },
            count: { type: "number", description: "Max number of occurrences" },
          },
          required: ["frequency"],
        },
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
        recurrence: {
          type: "object",
          description: "New recurrence pattern to set on this item",
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "Base frequency" },
            interval: { type: "number", description: "Repeat every N units (default 1)" },
            byDay: { type: "array", items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] }, description: "Days of week" },
            byMonthDay: { type: "array", items: { type: "number" }, description: "Days of month (1-31)" },
            bySetPos: { type: "number", description: "Position in set. 1=first, -1=last." },
            until: { type: "string", description: "End date ISO 8601" },
            count: { type: "number", description: "Max occurrences" },
          },
          required: ["frequency"],
        },
        clear_recurrence: { type: "boolean", description: "Set true to remove all recurrence from this item" },
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
        recurrence: {
          type: "object",
          description: "Recurrence pattern for the calendar event",
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "Base frequency" },
            interval: { type: "number", description: "Repeat every N units (default 1)" },
            byDay: { type: "array", items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] }, description: "Days of week" },
            byMonthDay: { type: "array", items: { type: "number" }, description: "Days of month (1-31)" },
            bySetPos: { type: "number", description: "Position in set. 1=first, -1=last." },
            until: { type: "string", description: "End date ISO 8601" },
            count: { type: "number", description: "Max occurrences" },
          },
          required: ["frequency"],
        },
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
        recurrence: {
          type: "object",
          description: "New recurrence pattern for the event",
          properties: {
            frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "Base frequency" },
            interval: { type: "number", description: "Repeat every N units (default 1)" },
            byDay: { type: "array", items: { type: "string", enum: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] }, description: "Days of week" },
            byMonthDay: { type: "array", items: { type: "number" }, description: "Days of month (1-31)" },
            bySetPos: { type: "number", description: "Position in set. 1=first, -1=last." },
            until: { type: "string", description: "End date ISO 8601" },
            count: { type: "number", description: "Max occurrences" },
          },
          required: ["frequency"],
        },
        clear_recurrence: { type: "boolean", description: "Set true to remove recurrence from this event" },
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
  {
    name: "search_items",
    description: "Search through all tasks and reminders by keyword. Use when the user asks about a specific task they can't remember the exact name of.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (keywords to match against titles and descriptions)" },
      },
      required: ["query"],
    },
  },
  {
    name: "decompose_task",
    description: "Break a task into smaller subtasks. Creates subtasks as children of the specified parent task.",
    parameters: {
      type: "object" as const,
      properties: {
        parent_title: { type: "string", description: "Title of the parent task to decompose (fuzzy match)" },
        subtasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Subtask title" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title"],
          },
          description: "Array of subtasks to create",
        },
      },
      required: ["parent_title", "subtasks"],
    },
  },
] as const;

export function buildSystemPrompt(user: { telegramUsername: string; timezone: string; categories?: string[] }): string {
  const categoryList = user.categories?.length
    ? `Available categories: ${user.categories.join(", ")}`
    : "No categories exist yet.";

  const now = new Date().toLocaleString("en-US", { timeZone: user.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return `You are Calcapone, a smart personal assistant that helps manage calendar, todos, and reminders.

User: ${user.telegramUsername}
Timezone: ${user.timezone}
Current time in user's timezone: ${now}

${categoryList}

Rules:
- When the user mentions a time without a date, assume today.
- When the user says "tomorrow", use the next calendar day in their timezone.
- Always confirm what you did after performing an action.
- Keep responses concise — this is a Telegram chat.
- If the user references "that", "it", or "the reminder/task" without a name, check conversation history for context.
- When creating tasks, ONLY use one of the existing categories listed above. Never invent new category names.
- Calendar events are automatically tracked in-app — do NOT also create a separate task for the same event.
- When the user asks to move, reschedule, or change a calendar event, use update_calendar_event.
- When the user asks to cancel or delete a calendar event, use delete_calendar_event.

Examples:
User: "remind me to call mom tomorrow at 3pm"
→ Use create_item with title "Call mom", remind_at set to tomorrow 15:00 in user's timezone, category "Reminders"

User: "buy groceries by friday"
→ Use create_item with title "Buy groceries", due_date set to next Friday, category "General"

User: "lunch with Sarah tomorrow noon to 1pm"
→ Use create_calendar_event with title "Lunch with Sarah", start_time tomorrow 12:00, end_time tomorrow 13:00

User: "actually make that 2pm" (referring to a previously created item)
→ Use update_item with query matching the recently mentioned task

User: "remind me every other Tuesday at 10am to check reports"
→ Use create_item with remind_at and recurrence: { frequency: "weekly", interval: 2, byDay: ["TU"] }

User: "set a reminder for weekdays at 9am"
→ Use create_item with recurrence: { frequency: "weekly", byDay: ["MO", "TU", "WE", "TH", "FR"] }

User: "remind me on the first Monday of every month"
→ Use create_item with recurrence: { frequency: "monthly", byDay: ["MO"], bySetPos: 1 }

User: "create a meeting every first Monday at 9am"
→ Use create_calendar_event with recurrence: { frequency: "monthly", byDay: ["MO"], bySetPos: 1 }

User: "change my weekly standup to every 2 weeks"
→ Use update_item with recurrence: { frequency: "weekly", interval: 2 }

User: "stop that recurring reminder"
→ Use update_item with clear_recurrence: true`;
}
