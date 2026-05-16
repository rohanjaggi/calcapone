// src/lib/services/execute-tool.ts
import { createItem, listItems, updateItem, deleteItem } from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { getEvents, createEvent } from "@/lib/services/calendar";
import type { Priority, RecurringType, ItemStatus } from "@/generated/prisma/enums";

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  user: { googleRefreshToken: string | null; googleCalendarId: string | null; timezone: string }
): Promise<string | null> {
  switch (name) {
    case "create_item": {
      const categoryName = args.category as string;
      let cats = await listCategories(userId);
      let cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (!cat) {
        cat = await createCategory({ userId, name: categoryName });
      }
      const item = await createItem({
        userId,
        categoryId: cat.id,
        title: args.title as string,
        description: (args.description as string) ?? null,
        priority: (args.priority as Priority) ?? "medium",
        dueDate: (args.due_date as string) ?? null,
        dueTime: (args.due_time as string) ?? null,
        remindAt: args.remind_at ? new Date(args.remind_at as string) : null,
        recurring: (args.recurring as RecurringType) ?? "none",
      });
      const label = item.remindAt ? "Reminder" : "Task";
      return `Created ${label}: **${item.title}** in ${cat.name}`;
    }

    case "list_items": {
      const items = await listItems(userId, {
        status: args.status as ItemStatus | undefined,
      });
      if (items.length === 0) return "No items found.";
      return items.map((item, i) => {
        const icon = item.remindAt ? "🔔" : "📋";
        return `${i + 1}. ${icon} [${item.status}] ${item.title}`;
      }).join("\n");
    }

    case "complete_item": {
      const items = await listItems(userId, { status: "pending" as ItemStatus });
      const match = items.find((item) =>
        item.title.toLowerCase().includes((args.title as string).toLowerCase())
      );
      if (!match) return `Couldn't find an item matching "${args.title}"`;
      await updateItem(match.id, userId, { status: "done" as ItemStatus });
      return `Completed: **${match.title}**`;
    }

    case "delete_item": {
      const items = await listItems(userId);
      const match = items.find((item) =>
        item.title.toLowerCase().includes((args.title as string).toLowerCase())
      );
      if (!match) return `Couldn't find an item matching "${args.title}"`;
      await deleteItem(match.id, userId);
      return `Deleted: **${match.title}**`;
    }

    case "get_calendar": {
      if (!user.googleRefreshToken) return "Google Calendar not connected. Connect it in Settings.";
      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        new Date(args.start_date as string),
        new Date(args.end_date as string)
      );
      if (events.length === 0) return "No events in that time range.";
      return events.map((e) => `- ${e.title} (${e.startTime})`).join("\n");
    }

    case "create_calendar_event": {
      if (!user.googleRefreshToken) return "Google Calendar not connected. Connect it in Settings.";
      const event = await createEvent(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        {
          title: args.title as string,
          startTime: args.start_time as string,
          endTime: args.end_time as string,
          description: args.description as string | undefined,
        }
      );
      return `Created calendar event: **${event.title}** (${new Date(event.startTime).toLocaleString()})`;
    }

    case "create_category": {
      const cat = await createCategory({
        userId,
        name: args.name as string,
        color: (args.color as string) ?? null,
      });
      return `Created category: **${cat.name}**`;
    }

    case "list_categories": {
      const cats = await listCategories(userId);
      if (cats.length === 0) return "No categories yet.";
      return cats.map((c) => `- ${c.name}`).join("\n");
    }

    case "suggest_schedule":
      return "Schedule suggestions are coming soon!";

    default:
      return null;
  }
}
