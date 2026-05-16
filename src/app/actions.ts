"use server";

import { createItem, updateItem, deleteItem } from "@/lib/services/item";
import { getOrCreateDevUser } from "@/lib/dev-user";
import { createCategory, listCategories } from "@/lib/services/category";
import { createEvent } from "@/lib/services/calendar";
import { chatWithAi } from "@/lib/services/ai";
import { decryptUserApiKey } from "@/lib/services/user";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";

export async function toggleItemStatus(itemId: string, newStatus: ItemStatus) {
  const user = await getOrCreateDevUser();
  await updateItem(itemId, user.id, { status: newStatus });
}

export async function addItem(data: {
  title: string;
  categoryId: string;
  priority: Priority;
  description?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: string | null;
  recurring?: RecurringType;
}) {
  const user = await getOrCreateDevUser();
  await createItem({
    userId: user.id,
    categoryId: data.categoryId,
    title: data.title,
    priority: data.priority,
    description: data.description ?? null,
    dueDate: data.dueDate ?? null,
    dueTime: data.dueTime ?? null,
    remindAt: data.remindAt ? new Date(data.remindAt) : null,
    recurring: data.recurring ?? "none",
  });
}

export async function removeItem(itemId: string) {
  const user = await getOrCreateDevUser();
  await deleteItem(itemId, user.id);
}

export async function addCategory(name: string, color: string) {
  const user = await getOrCreateDevUser();
  return createCategory({ userId: user.id, name, color });
}

export async function getCategories() {
  const user = await getOrCreateDevUser();
  const cats = await listCategories(user.id);
  return cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}

export async function getAiRecommendation(items: Array<{ title: string; priority: string; status: string; dueDate: string | null; dueTime: string | null; remindAt: string | null; category: { name: string } }>) {
  const user = await getOrCreateDevUser();
  const aiApiKey = decryptUserApiKey(user.aiApiKey);

  const pending = items.filter((i) => i.status !== "done");
  if (pending.length === 0) {
    return { recommendation: "You're all caught up! No pending tasks. Enjoy your day." };
  }

  const summary = pending.map((i) => {
    let detail = `- "${i.title}" [${i.priority}] (${i.category.name})`;
    if (i.dueDate) detail += ` due ${i.dueDate}${i.dueTime ? ` at ${i.dueTime}` : ""}`;
    if (i.remindAt) detail += ` reminder at ${i.remindAt}`;
    return detail;
  }).join("\n");

  const prompt = `Here are my pending tasks:\n${summary}\n\nGive me a brief, actionable recommendation (2-3 sentences max) on what I should focus on right now and why. Be specific — reference actual task names. Keep it warm and encouraging, like a smart assistant. No bullet points, just flowing plain text. Do NOT use any markdown formatting — no asterisks, no bold, no italics, no headers. Pure plain text only.`;

  try {
    const { text } = await chatWithAi(
      prompt,
      { telegramUsername: user.telegramUsername, timezone: user.timezone },
      { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel }
    );
    return { recommendation: text || "Focus on your highest priority items first." };
  } catch {
    return { recommendation: null };
  }
}

export async function aiAddItem(input: string, mode: "task" | "reminder" | "event") {
  const user = await getOrCreateDevUser();
  const aiApiKey = decryptUserApiKey(user.aiApiKey);

  const modeHint = mode === "task"
    ? "The user wants to create a task/todo. Use the create_item tool WITHOUT remind_at."
    : mode === "reminder"
    ? "The user wants to create a reminder. Use the create_item tool WITH remind_at set to the appropriate time."
    : "The user wants to create a calendar event. Use the create_calendar_event tool.";

  const prompt = `${modeHint}\n\nUser says: "${input}"`;

  const { text, toolCalls } = await chatWithAi(
    prompt,
    { telegramUsername: user.telegramUsername, timezone: user.timezone },
    { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel }
  );

  const results: string[] = [];

  for (const call of toolCalls) {
    if (call.name === "create_item") {
      const categoryName = (call.args.category as string) ?? "General";
      const cats = await listCategories(user.id);
      let cat = cats.find((c) => c.name.toLowerCase() === categoryName.toLowerCase());
      if (!cat) {
        cat = await createCategory({ userId: user.id, name: categoryName });
      }
      const item = await createItem({
        userId: user.id,
        categoryId: cat.id,
        title: call.args.title as string,
        description: (call.args.description as string) ?? null,
        priority: (call.args.priority as Priority) ?? "medium",
        dueDate: (call.args.due_date as string) ?? null,
        dueTime: (call.args.due_time as string) ?? null,
        remindAt: call.args.remind_at ? new Date(call.args.remind_at as string) : null,
        recurring: (call.args.recurring as RecurringType) ?? "none",
      });
      results.push(item.remindAt ? `Reminder set: ${item.title}` : `Task created: ${item.title}`);
    } else if (call.name === "create_calendar_event") {
      if (!user.googleRefreshToken) {
        return { success: false, message: "Connect Google Calendar in Settings first" };
      }
      const event = await createEvent(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        {
          title: call.args.title as string,
          startTime: call.args.start_time as string,
          endTime: call.args.end_time as string,
          description: call.args.description as string | undefined,
        }
      );
      results.push(`Event created: ${event.title}`);
    } else if (call.name === "create_category") {
      await createCategory({
        userId: user.id,
        name: call.args.name as string,
        color: (call.args.color as string) ?? null,
      });
    }
  }

  if (results.length === 0 && text) {
    return { success: true, message: text };
  }

  return { success: true, message: results.join(". ") || "Done!" };
}
