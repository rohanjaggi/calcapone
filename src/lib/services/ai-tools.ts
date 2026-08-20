import { offsetInTz, formatInTz } from "@/lib/tz";
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
        kind: { type: "string", enum: ["task", "assignment", "exam", "class"], description: "What this is. Use 'assignment' for homework/essays/labs with a hand-in date, 'exam' for tests/midterms/finals, 'class' for a lecture or tutorial. Exams and assignments get earlier reminders than plain tasks." },
        course: { type: "string", description: "Course code or name for school work, e.g. 'CS2040'. Must already exist — call list_courses if unsure, create_course to add one." },
        due_date: { type: "string", description: "Due date in YYYY-MM-DD format" },
        due_time: { type: "string", description: "Due time in HH:mm format (24h)" },
        remind_at: { type: "string", description: "When to send the Telegram reminder: ISO 8601 datetime WITH the user's UTC offset, e.g. 2026-08-20T15:00:00+08:00" },
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
        kind: { type: "string", enum: ["task", "assignment", "exam", "class"], description: "Filter by kind — use 'exam' for \"when are my exams\", 'assignment' for \"what homework do I have\"" },
        course: { type: "string", description: "Filter by course code or name, e.g. 'CS2040'" },
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
        scope: { type: "string", enum: ["this", "series"], description: "For a repeating item: 'this' deletes only this occurrence (default), 'series' deletes the whole run. Use 'series' for \"stop the daily meds reminder\"." },
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
        kind: { type: "string", enum: ["task", "assignment", "exam", "class"], description: "What this is. Use 'assignment' for homework/essays/labs with a hand-in date, 'exam' for tests/midterms/finals, 'class' for a lecture or tutorial. Exams and assignments get earlier reminders than plain tasks." },
        course: { type: "string", description: "Course code or name for school work, e.g. 'CS2040'. Must already exist — call list_courses if unsure, create_course to add one." },
        scope: { type: "string", enum: ["this", "series"], description: "For a repeating item: 'this' changes only this occurrence (default), 'series' changes every occurrence." },
        skip_next: { type: "boolean", description: "Skip this occurrence of a repeating item and move it to the next one, without completing it. Use for \"skip this week\"." },
        due_date: { type: ["string", "null"] as unknown as "string", description: "New due date YYYY-MM-DD, or null to clear" },
        due_time: { type: ["string", "null"] as unknown as "string", description: "New due time HH:mm, or null to clear" },
        remind_at: { type: ["string", "null"] as unknown as "string", description: "New reminder time: ISO 8601 datetime with the user's UTC offset (e.g. 2026-08-20T15:00:00+08:00), or null to clear" },
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
        start_date: { type: "string", description: "Range start: YYYY-MM-DD (interpreted in the user's timezone) or ISO 8601 datetime with offset" },
        end_date: { type: "string", description: "Range end (exclusive): YYYY-MM-DD or ISO 8601 datetime with offset" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a new event on the user's Google Calendar. If it overlaps an existing event the tool reports the conflict instead of creating; re-call with confirm_conflict: true once the user confirms.",
    parameters: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Event title/summary" },
        start_time: { type: "string", description: "Event start: ISO 8601 datetime WITH the user's UTC offset, e.g. 2026-08-20T12:00:00+08:00" },
        end_time: { type: "string", description: "Event end: ISO 8601 datetime WITH the user's UTC offset" },
        description: { type: "string", description: "Optional event description" },
        confirm_conflict: { type: "boolean", description: "Set true ONLY after the user has confirmed they want the event even though it overlaps an existing one (the previous attempt reported a conflict)." },
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
        start_time: { type: "string", description: "New start: ISO 8601 datetime with the user's UTC offset" },
        end_time: { type: "string", description: "New end: ISO 8601 datetime with the user's UTC offset" },
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
    name: "create_course",
    description: "Register a school course/module so assignments and exams can be filed under it. Do this before using the `course` argument on anything else.",
    parameters: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Short code, e.g. CS2040" },
        name: { type: "string", description: "Full course name, e.g. Data Structures and Algorithms" },
        color: { type: "string", description: "Hex color code (e.g. #B8860B)" },
      },
      required: ["code", "name"],
    },
  },
  {
    name: "list_courses",
    description: "List the user's registered school courses. Call this when the user names a course you have not seen.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "list_categories",
    description: "List the user's categories",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "search_items",
    description: "Search through all tasks and reminders. Supports both keyword matching and semantic/natural language search. Use when the user asks about a specific task, even if they describe it vaguely or use different words than the original title.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query — can be keywords OR a natural language description of what the user is looking for" },
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

  const nowDate = new Date();
  const offset = offsetInTz(nowDate, user.timezone);
  // Minute precision, not second: every distinct prefix is a fresh prompt-cache entry, and a
  // ticking seconds field guarantees a miss on every single call.
  const now = formatInTz(nowDate, user.timezone);

  return `You are Calcapone, a smart personal assistant that helps manage calendar, todos, and reminders.

User: ${user.telegramUsername}
Timezone: ${user.timezone} (UTC offset ${offset})

${categoryList}

Rules:
- All datetimes you pass to tools (remind_at, start_time, end_time, start_date, end_date) MUST be ISO 8601 with the user's UTC offset ${offset}, e.g. 2026-08-20T15:00:00${offset}. Never send a naive or UTC-shifted time.
- When the user mentions a time without a date, assume today.
- When the user says "tomorrow", use the next calendar day in their timezone.
- You will see the result of every tool you call, so chain them: look something up first, then act on what you found. Do not guess an answer you could look up.
- After a read-only tool (list_items, search_items, get_calendar, list_categories, suggest_schedule) the user sees only YOUR summary, not the raw output — so answer the question in your own words.
- After a tool that changes something the user already sees a receipt, so acknowledge briefly or say nothing at all rather than repeating it.
- If a tool reports it matched several items, stop and let the user choose. Do not re-call it with a guess.
- If create_calendar_event reports a conflict and the user then confirms ("yes", "go ahead", "book it anyway"), call create_calendar_event again with the same details plus confirm_conflict: true.
- Keep responses concise — this is a Telegram chat.
- If the user references "that", "it", or "the reminder/task" without a name, check conversation history for context.
- When creating tasks, ONLY use one of the existing categories listed above. Never invent new category names.
- Calendar events are separate from tasks — do NOT create an in-app task when creating a calendar event.
- When the user asks to move, reschedule, or change a calendar event, use update_calendar_event.
- When the user asks to cancel or delete a calendar event, use delete_calendar_event.
- School work: file homework, essays and labs as kind "assignment", and tests, midterms and finals as kind "exam". Both get earlier reminders than a plain task, so getting the kind right matters more than the wording.
- A course code like "CS2040" or "MA1521" means the course argument, not the category. If the course does not exist yet, call list_courses to check, then create_course before creating the item.
- For a repeating item, scope "series" changes or deletes the whole run and skip_next true skips just this one. Default to "this" unless the user clearly means all of them.

Examples:
User: "remind me to call mom tomorrow at 3pm"
→ Use create_item with title "Call mom", remind_at "<tomorrow>T15:00:00${offset}", category "Reminders"

User: "buy groceries by friday"
→ Use create_item with title "Buy groceries", due_date set to next Friday, category "General"

User: "lunch with Sarah tomorrow noon to 1pm"
→ Use create_calendar_event with title "Lunch with Sarah", start_time "<tomorrow>T12:00:00${offset}", end_time "<tomorrow>T13:00:00${offset}"

User: "actually make that 2pm" (referring to a previously created item)
→ Use update_item with query matching the recently mentioned task

User: "find the dentist thing and push it to Friday"
→ Use search_items to find it, read the result, then update_item with the title you found

User: "what's on this week?"
→ Use get_calendar and list_items, then summarise both in a few lines — do not paste the raw output

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
→ Use update_item with clear_recurrence: true

User: "CS2040 assignment 2 due next Friday 2359"
→ Use create_item with title "Assignment 2", kind "assignment", course "CS2040", due_date next Friday, due_time "23:59"

User: "my CS2040 midterm is week 8 wednesday"
→ Use create_item with kind "exam", course "CS2040", and the resolved date

User: "what's due for CS2040?"
→ Use list_items with course "CS2040", then summarise

User: "stop the daily meds reminder"
→ Use delete_item with scope "series"

User: "skip this week's standup"
→ Use update_item with query "standup" and skip_next: true

Current time in the user's timezone: ${now}`;
}
