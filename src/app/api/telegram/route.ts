// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { findOrCreateUser, decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";
import { sendMessage } from "@/lib/services/telegram";
import { createTodo, listTodos, updateTodo, deleteTodo } from "@/lib/services/todo";
import { createReminder, listReminders, cancelReminder } from "@/lib/services/reminder";
import { createCategory, listCategories } from "@/lib/services/category";
import { getEvents } from "@/lib/services/calendar";
import type { TelegramUpdate } from "@/lib/services/telegram";
import type { TodoStatus, Priority, RecurringType, ReminderStatus } from "@/generated/prisma/enums";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update: TelegramUpdate = await request.json();
  const message = update.message;
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true });
  }

  const telegramId = BigInt(message.from.id);
  const username = message.from.username ?? message.from.first_name;
  const chatId = message.chat.id;

  const user = await findOrCreateUser(telegramId, username);
  const aiApiKey = decryptUserApiKey(user.aiApiKey);

  try {
    const { text, toolCalls } = await chatWithAi(
      message.text,
      { telegramUsername: user.telegramUsername, timezone: user.timezone },
      { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel }
    );

    const results: string[] = [];

    for (const call of toolCalls) {
      const result = await executeToolCall(call.name, call.args, user.id, user);
      if (result) results.push(result);
    }

    const response = [text, ...results].filter(Boolean).join("\n\n");
    if (response) {
      await sendMessage(chatId, response);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Something went wrong";
    await sendMessage(chatId, `Sorry, I ran into an error: ${errMsg}`);
  }

  return NextResponse.json({ ok: true });
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  user: { googleRefreshToken: string | null; googleCalendarId: string | null; timezone: string }
): Promise<string | null> {
  switch (name) {
    case "create_todo": {
      const todo = await createTodo({
        userId,
        title: args.title as string,
        description: (args.description as string) ?? null,
        priority: (args.priority as Priority) ?? undefined,
        dueDate: args.due_date ? new Date(args.due_date as string) : null,
      });
      return `Created todo: **${todo.title}**`;
    }

    case "list_todos": {
      const todos = await listTodos(userId, {
        status: args.status as TodoStatus | undefined,
      });
      if (todos.length === 0) return "No todos found.";
      return todos.map((t, i) => `${i + 1}. [${t.status}] ${t.title}`).join("\n");
    }

    case "complete_todo": {
      const todos = await listTodos(userId, { status: "pending" as TodoStatus });
      const match = todos.find((t) =>
        t.title.toLowerCase().includes((args.title as string).toLowerCase())
      );
      if (!match) return `Couldn't find a todo matching "${args.title}"`;
      await updateTodo(match.id, userId, { status: "done" as TodoStatus });
      return `Completed: **${match.title}**`;
    }

    case "delete_todo": {
      const todos = await listTodos(userId);
      const match = todos.find((t) =>
        t.title.toLowerCase().includes((args.title as string).toLowerCase())
      );
      if (!match) return `Couldn't find a todo matching "${args.title}"`;
      await deleteTodo(match.id, userId);
      return `Deleted: **${match.title}**`;
    }

    case "create_reminder": {
      const reminder = await createReminder({
        userId,
        message: args.message as string,
        remindAt: new Date(args.remind_at as string),
        recurring: (args.recurring as RecurringType) ?? undefined,
      });
      return `Reminder set: **${reminder.message}**`;
    }

    case "list_reminders": {
      const reminders = await listReminders(userId, {
        status: (args.status as ReminderStatus) ?? ("pending" as ReminderStatus),
      });
      if (reminders.length === 0) return "No reminders found.";
      return reminders
        .map((r) => `- ${r.message} (${new Date(r.remindAt).toLocaleString()})`)
        .join("\n");
    }

    case "cancel_reminder": {
      const reminders = await listReminders(userId, { status: "pending" as ReminderStatus });
      const match = reminders.find((r) =>
        r.message.toLowerCase().includes((args.message as string).toLowerCase())
      );
      if (!match) return `Couldn't find a reminder matching "${args.message}"`;
      await cancelReminder(match.id, userId);
      return `Cancelled reminder: **${match.message}**`;
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
