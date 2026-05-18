// src/lib/services/execute-tool.ts
import { createItem, listItems, updateItem, deleteItem } from "@/lib/services/item";
import { createCategory, listCategories } from "@/lib/services/category";
import { getEvents, createEvent, updateEvent, deleteEvent } from "@/lib/services/calendar";
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
      const cats = await listCategories(userId);
      let cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (!cat) {
        cat = cats[0];
      }
      if (!cat) return "No categories exist yet. Create one in the app first.";
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

      if (match.googleEventId && user.googleRefreshToken) {
        try {
          await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId);
        } catch {
          // gcal sync failure is non-fatal
        }
      }

      await deleteItem(match.id, userId);
      return `Deleted: **${match.title}**`;
    }

    case "update_item": {
      const query = (args.query as string).toLowerCase();
      const items = await listItems(userId, { status: "pending" as ItemStatus });
      const match = items.find((item) =>
        item.title.toLowerCase().includes(query)
      );
      if (!match) return `Couldn't find an item matching "${args.query}". Try a different title.`;

      const updates: {
        title?: string;
        dueDate?: string | null;
        dueTime?: string | null;
        remindAt?: Date | null;
        priority?: Priority;
        status?: ItemStatus;
      } = {};
      if (args.title !== undefined) updates.title = args.title as string;
      if (args.due_date !== undefined) updates.dueDate = args.due_date as string | null;
      if (args.due_time !== undefined) updates.dueTime = args.due_time as string | null;
      if (args.remind_at !== undefined) updates.remindAt = args.remind_at ? new Date(args.remind_at as string) : null;
      if (args.priority !== undefined) updates.priority = args.priority as Priority;
      if (args.status !== undefined) updates.status = args.status as ItemStatus;

      const updated = await updateItem(match.id, userId, updates);

      if (match.googleEventId && user.googleRefreshToken) {
        try {
          const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
          if (updates.title) gcalFields.title = updates.title;
          if (updates.dueDate && updates.dueTime) {
            gcalFields.startTime = `${updates.dueDate}T${updates.dueTime}:00`;
            const [h, m] = updates.dueTime.split(":").map(Number);
            if (h < 23) {
              gcalFields.endTime = `${updates.dueDate}T${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
            }
          }
          if (Object.keys(gcalFields).length > 0) {
            await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId, gcalFields);
          }
        } catch {
          // gcal sync failure is non-fatal
        }
      }

      return `Updated: **${updated.title}**`;
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

      const title = args.title as string;
      const startTime = args.start_time as string;
      const endTime = args.end_time as string;
      const description = (args.description as string) ?? undefined;

      const existing = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        new Date(startTime),
        new Date(endTime)
      );

      if (existing.length > 0) {
        const conflicts = existing.map((e) => `• ${e.title} (${e.startTime.slice(11, 16)}–${e.endTime.slice(11, 16)})`).join("\n");
        return `Conflict detected — you already have:\n${conflicts}\n\nStill want me to create "${title}" at that time? Reply yes to confirm.`;
      }

      const event = await createEvent(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        { title, startTime, endTime, description }
      );

      const warnings: string[] = [];

      const eventDate = startTime.split("T")[0];
      const items = await listItems(userId, { status: "pending" as ItemStatus });
      const sameDayTasks = items.filter((item) => item.dueDate === eventDate);
      if (sameDayTasks.length > 0) {
        const taskList = sameDayTasks.slice(0, 3).map((t) => `• ${t.title}${t.dueTime ? ` (due ${t.dueTime})` : ""}`).join("\n");
        warnings.push(`Heads up — you have ${sameDayTasks.length} task${sameDayTasks.length > 1 ? "s" : ""} due that day:\n${taskList}`);
      }

      let result = `Created calendar event: **${event.title}** (${new Date(event.startTime).toLocaleString()})`;
      if (warnings.length > 0) {
        result += `\n\n⚠️ ${warnings.join("\n\n")}`;
      }
      return result;
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

    case "update_calendar_event": {
      const query = (args.query as string).toLowerCase();
      const items = await listItems(userId);
      const match = items.find((item) =>
        item.title.toLowerCase().includes(query) && item.googleEventId
      );
      if (!match) {
        const anyMatch = items.find((item) => item.title.toLowerCase().includes(query));
        if (anyMatch) return `Found "${anyMatch.title}" but it's not linked to Google Calendar. Use update_item instead.`;
        return `Couldn't find a calendar event matching "${args.query}"`;
      }

      const updates: { title?: string; dueDate?: string | null; dueTime?: string | null; description?: string | null } = {};
      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};

      if (args.title !== undefined) {
        updates.title = args.title as string;
        gcalFields.title = args.title as string;
      }
      if (args.description !== undefined) {
        updates.description = args.description as string;
        gcalFields.description = args.description as string;
      }
      if (args.start_time !== undefined) {
        const startDate = new Date(args.start_time as string);
        updates.dueDate = startDate.toISOString().split("T")[0];
        updates.dueTime = startDate.toTimeString().slice(0, 5);
        gcalFields.startTime = args.start_time as string;
      }
      if (args.end_time !== undefined) {
        gcalFields.endTime = args.end_time as string;
      }

      await updateItem(match.id, userId, updates);

      if (user.googleRefreshToken && match.googleEventId) {
        try {
          await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId, gcalFields);
        } catch {
          return `Updated in-app event: **${args.title ?? match.title}** (Google Calendar sync failed)`;
        }
      }

      return `Updated calendar event: **${args.title ?? match.title}**`;
    }

    case "delete_calendar_event": {
      const query = (args.query as string).toLowerCase();
      const items = await listItems(userId);
      const match = items.find((item) =>
        item.title.toLowerCase().includes(query) && item.googleEventId
      );
      if (!match) {
        const anyMatch = items.find((item) => item.title.toLowerCase().includes(query));
        if (anyMatch) return `Found "${anyMatch.title}" but it's not linked to Google Calendar. Use delete_item instead.`;
        return `Couldn't find a calendar event matching "${args.query}"`;
      }

      if (user.googleRefreshToken && match.googleEventId) {
        try {
          await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", match.googleEventId);
        } catch {
          // gcal sync failure is non-fatal
        }
      }

      await deleteItem(match.id, userId);
      return `Deleted calendar event: **${match.title}**`;
    }

    case "suggest_schedule": {
      const pending = await listItems(userId, { status: "pending" as ItemStatus });
      if (pending.length === 0) return "No pending tasks to schedule.";

      const today = new Date();
      const sevenDaysOut = new Date(today);
      sevenDaysOut.setDate(today.getDate() + 7);

      const taskLines = pending
        .slice(0, 10)
        .map((item) => `- ${item.title} (priority: ${item.priority}${item.dueDate ? `, due: ${item.dueDate}` : ""})`)
        .join("\n");

      if (!user.googleRefreshToken) {
        return `Here are your pending tasks — Connect Google Calendar in Settings for time-slot suggestions:\n\n${taskLines}`;
      }

      const events = await getEvents(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        today,
        sevenDaysOut
      );

      const workStart = 9;
      const workEnd = 18;
      const freeBlocks: string[] = [];

      for (let d = 0; d < 7; d++) {
        const day = new Date(today);
        day.setDate(today.getDate() + d);
        const dateStr = day.toISOString().split("T")[0];
        const dayEvents = events
          .filter((e) => e.startTime.startsWith(dateStr))
          .sort((a, b) => a.startTime.localeCompare(b.startTime));

        let cursor = workStart;
        for (const ev of dayEvents) {
          const evStart = parseInt(ev.startTime.slice(11, 13), 10);
          const evEnd = parseInt(ev.endTime.slice(11, 13), 10);
          if (cursor < evStart) {
            freeBlocks.push(`${dateStr} ${cursor}:00–${evStart}:00`);
          }
          cursor = Math.max(cursor, evEnd);
        }
        if (cursor < workEnd) {
          freeBlocks.push(`${dateStr} ${cursor}:00–${workEnd}:00`);
        }
      }

      const freeLines = freeBlocks.slice(0, 6).join(", ") || "No free blocks found in working hours (9am–6pm)";

      return `*Pending tasks:*\n${taskLines}\n\n*Free blocks this week:*\n${freeLines}\n\n*Suggested:* Work on your highest-priority tasks during morning free blocks. Consider blocking calendar time for deep work items.`;
    }

    default:
      return null;
  }
}
