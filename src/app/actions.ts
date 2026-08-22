"use server";

import { createItem, updateItem, deleteItem } from "@/lib/services/item";
import { requireUser } from "@/lib/auth";
import { createCategory, listCategories, updateCategory, deleteCategory, reorderCategories, maxSortOrder } from "@/lib/services/category";
import { updateEvent, deleteEvent, getEvents } from "@/lib/services/calendar";
import { searchItems } from "@/lib/services/search";
import { prisma } from "@/lib/prisma";
import { parseInTz } from "@/lib/tz";
import { dueWindowToGcal } from "@/lib/services/gcal-window";
import { CalendarAuthError } from "@/lib/services/calendar";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";
import type { ItemStatus, Priority, RecurringType } from "@/generated/prisma/enums";

/**
 * Calendar sync is best-effort from the dashboard — the item change already succeeded, so a
 * failure must not surface as a broken action. A revoked grant is different: clear the link
 * so Settings stops claiming "Connected" and the user is prompted to reconnect.
 */
async function reportCalendarFailure(userId: string, where: string, error: unknown): Promise<void> {
  if (error instanceof CalendarAuthError) {
    await markCalendarDisconnected(userId);
    return;
  }
  console.error(`[actions:${where}] calendar sync failed:`, error instanceof Error ? error.message : error);
}

export async function toggleItemStatus(itemId: string, newStatus: ItemStatus) {
  const user = await requireUser();
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
  const user = await requireUser();
  const cats = await listCategories(user.id);
  const cat = cats.find((c) => c.id === data.categoryId) ?? cats[0];
  if (!cat) throw new Error("No categories exist");
  await createItem({
    userId: user.id,
    categoryId: cat.id,
    title: data.title,
    priority: data.priority,
    description: data.description ?? null,
    dueDate: data.dueDate ?? null,
    dueTime: data.dueTime ?? null,
    remindAt: data.remindAt ? parseInTz(data.remindAt, user.timezone) : null,
    recurring: data.recurring ?? "none",
  });
}

export async function removeItem(itemId: string) {
  const user = await requireUser();

  const item = await prisma.item.findUnique({ where: { id: itemId, userId: user.id } });
  if (item?.googleEventId && user.googleRefreshToken) {
    try {
      await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId);
    } catch (error) {
      await reportCalendarFailure(user.id, "deleteEvent", error);
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
  const user = await requireUser();
  const item = await updateItem(itemId, user.id, data);

  if (item.googleEventId && user.googleRefreshToken) {
    try {
      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
      if (data.title) gcalFields.title = data.title;
      if (data.description !== undefined) gcalFields.description = data.description ?? "";
      if (data.dueDate && data.dueTime) {
        Object.assign(gcalFields, dueWindowToGcal(data.dueDate, data.dueTime));
      }
      if (Object.keys(gcalFields).length > 0) {
        await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId, gcalFields, user.timezone);
      }
    } catch (error) {
      await reportCalendarFailure(user.id, "editItem", error);
    }
  }

  return item;
}

export async function removeItemWithGcalSync(itemId: string) {
  const user = await requireUser();

  const item = await prisma.item.findUnique({ where: { id: itemId, userId: user.id } });

  if (item?.googleEventId && user.googleRefreshToken) {
    try {
      await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId);
    } catch (error) {
      await reportCalendarFailure(user.id, "deleteEvent", error);
    }
  }

  await deleteItem(itemId, user.id);
}

export async function deleteGoogleCalendarEvent(googleEventId: string) {
  const user = await requireUser();
  if (!user.googleRefreshToken) throw new Error("Google Calendar not connected");
  await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", googleEventId);
}

export async function editGoogleCalendarEvent(
  googleEventId: string,
  data: { title?: string; description?: string; startTime?: string; endTime?: string }
) {
  const user = await requireUser();
  if (!user.googleRefreshToken) throw new Error("Google Calendar not connected");
  await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", googleEventId, data, user.timezone);
}

export async function addCategory(name: string, color: string) {
  const user = await requireUser();
  const max = await maxSortOrder(user.id);
  return createCategory({ userId: user.id, name, color, sortOrder: max + 1 });
}

export async function getCategories() {
  const user = await requireUser();
  const cats = await listCategories(user.id);
  return cats.map((c) => ({ id: c.id, name: c.name, color: c.color }));
}

export async function editCategory(categoryId: string, data: { name?: string; color?: string | null }) {
  const user = await requireUser();
  return updateCategory(categoryId, user.id, data);
}

export async function removeCategory(categoryId: string) {
  const user = await requireUser();
  await deleteCategory(categoryId, user.id);
}

export async function reorderCategoriesAction(categoryIds: string[]) {
  const user = await requireUser();
  await reorderCategories(user.id, categoryIds);
}

export async function moveItemToCategory(itemId: string, newCategoryId: string) {
  const user = await requireUser();
  await updateItem(itemId, user.id, { categoryId: newCategoryId });
}

/**
 * Google events for one calendar month.
 *
 * The page prefetches only the current and next month, so navigating the grid past that
 * showed an empty calendar — every month the user scrolls to is fetched on demand.
 */
export async function getCalendarMonth(year: number, month: number) {
  const user = await requireUser();
  if (!Number.isInteger(year) || year < 1970 || year > 2100) throw new Error("Invalid year");
  if (!Number.isInteger(month) || month < 0 || month > 11) throw new Error("Invalid month");
  if (!user.googleRefreshToken) return { events: [], connected: false };

  // A day of slack on each side: the grid lays months out in the user's zone, so an event
  // just past a UTC month boundary still belongs to a cell this month renders.
  const start = new Date(Date.UTC(year, month, 1) - 86400000);
  const end = new Date(Date.UTC(year, month + 1, 1) + 86400000);

  try {
    const events = await getEvents(
      user.googleRefreshToken,
      user.googleCalendarId ?? "primary",
      start,
      end,
      user.timezone
    );
    return {
      events: events.map((e) => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime })),
      connected: true,
    };
  } catch (error) {
    if (error instanceof CalendarAuthError) {
      await markCalendarDisconnected(user.id);
      return { events: [], connected: false };
    }
    console.error("[actions:getCalendarMonth] fetch failed:", error instanceof Error ? error.message : error);
    return { events: [], connected: true };
  }
}

export async function searchAction(query: string) {
  const user = await requireUser();
  return searchItems(user.id, query);
}
