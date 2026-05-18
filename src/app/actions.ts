"use server";

import { createItem, updateItem, deleteItem } from "@/lib/services/item";
import { getOrCreateDevUser } from "@/lib/dev-user";
import { createCategory, listCategories, updateCategory, deleteCategory, reorderCategories, maxSortOrder } from "@/lib/services/category";
import { createEvent, updateEvent, deleteEvent } from "@/lib/services/calendar";
import { prisma } from "@/lib/prisma";
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

  const item = await prisma.item.findUnique({ where: { id: itemId, userId: user.id } });
  if (item?.googleEventId && user.googleRefreshToken) {
    try {
      await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId);
    } catch {
      // gcal sync failure is non-fatal
    }
  }

  await deleteItem(itemId, user.id);
}

export async function editItem(
  itemId: string,
  data: {
    title?: string;
    description?: string | null;
    priority?: Priority;
    categoryId?: string;
    dueDate?: string | null;
    dueTime?: string | null;
  }
) {
  const user = await getOrCreateDevUser();
  const item = await updateItem(itemId, user.id, data);

  if (item.googleEventId && user.googleRefreshToken) {
    try {
      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
      if (data.title) gcalFields.title = data.title;
      if (data.description !== undefined) gcalFields.description = data.description ?? "";
      if (data.dueDate && data.dueTime) {
        gcalFields.startTime = `${data.dueDate}T${data.dueTime}:00`;
        const startHour = parseInt(data.dueTime.split(":")[0]);
        gcalFields.endTime = `${data.dueDate}T${String(startHour + 1).padStart(2, "0")}:${data.dueTime.split(":")[1]}:00`;
      }
      if (Object.keys(gcalFields).length > 0) {
        await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId, gcalFields);
      }
    } catch {
      // gcal sync failure is non-fatal
    }
  }

  return item;
}

export async function removeItemWithGcalSync(itemId: string) {
  const user = await getOrCreateDevUser();

  const item = await prisma.item.findUnique({ where: { id: itemId, userId: user.id } });

  if (item?.googleEventId && user.googleRefreshToken) {
    try {
      await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId);
    } catch {
      // gcal sync failure is non-fatal
    }
  }

  await deleteItem(itemId, user.id);
}

export async function addCategory(name: string, color: string) {
  const user = await getOrCreateDevUser();
  const max = await maxSortOrder(user.id);
  return createCategory({ userId: user.id, name, color, sortOrder: max + 1 });
}

export async function getCategories() {
  const user = await getOrCreateDevUser();
  const cats = await listCategories(user.id);
  return cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}

export async function editCategory(categoryId: string, data: { name?: string; color?: string | null }) {
  const user = await getOrCreateDevUser();
  return updateCategory(categoryId, user.id, data);
}

export async function removeCategory(categoryId: string) {
  const user = await getOrCreateDevUser();
  await deleteCategory(categoryId, user.id);
}

export async function reorderCategoriesAction(categoryIds: string[]) {
  const user = await getOrCreateDevUser();
  await reorderCategories(user.id, categoryIds);
}

export async function moveItemToCategory(itemId: string, newCategoryId: string) {
  const user = await getOrCreateDevUser();
  await updateItem(itemId, user.id, { categoryId: newCategoryId });
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
      const title = call.args.title as string;
      const startTime = call.args.start_time as string;
      const endTime = call.args.end_time as string;
      const description = (call.args.description as string) ?? undefined;

      const event = await createEvent(
        user.googleRefreshToken,
        user.googleCalendarId ?? "primary",
        { title, startTime, endTime, description }
      );

      // Create in-app item linked to gcal event
      const startDate = new Date(startTime);
      const dueDate = startDate.toISOString().split("T")[0];
      const dueTime = startDate.toTimeString().slice(0, 5);

      const cats = await listCategories(user.id);
      let cat = cats.find((c: { name: string }) => c.name.toLowerCase() === "events");
      if (!cat) {
        cat = await createCategory({ userId: user.id, name: "Events" });
      }

      await createItem({
        userId: user.id,
        categoryId: cat.id,
        title,
        description: description ?? null,
        dueDate,
        dueTime,
        googleEventId: event.id,
      });

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
