"use server";

import { createItem, updateItem, deleteItem, getItem } from "@/lib/services/item";
import { requireUser } from "@/lib/auth";
import { createCategory, listCategories, updateCategory, deleteCategory, reorderCategories, maxSortOrder } from "@/lib/services/category";
import { updateEvent, deleteEvent, getEvents, CalendarAuthError } from "@/lib/services/calendar";
import { searchItems } from "@/lib/services/search";
import { prisma } from "@/lib/prisma";
import { parseInTz } from "@/lib/tz";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";
import { mirrorEvent, unmirrorEvent } from "@/lib/services/calendar-sync";
import { paramsToRRule, dueDateAnchor, reanchorRule } from "@/lib/services/recurrence";
import type { ItemStatus, Priority } from "@/generated/prisma/enums";

// Server actions receive whatever the client sends (TypeScript types aren't checked at runtime),
// so every action below copies named fields only and checks ownership of any id it is handed.

async function requireOwnCategory(userId: string, categoryId: string): Promise<void> {
  const owned = await prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!owned) throw new Error("Category not found");
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
  repeat?: "none" | "daily" | "weekly" | "monthly";
}) {
  const user = await requireUser();
  const cats = await listCategories(user.id);
  const cat = cats.find((c) => c.id === data.categoryId) ?? cats[0];
  if (!cat) throw new Error("No categories exist");
  const dueDate = data.dueDate ?? null;
  const { remindAt, error } = parseReminder(data.remindAt, user.timezone);
  if (error) return { error };
  const frequency = data.repeat === "daily" || data.repeat === "weekly" || data.repeat === "monthly" ? data.repeat : null;
  await createItem({
    userId: user.id,
    categoryId: cat.id,
    title: data.title,
    priority: data.priority,
    description: data.description ?? null,
    dueDate,
    dueTime: data.dueTime ?? null,
    remindAt,
    // Anchored the same way the bot's create_item anchors its rules.
    recurrenceRule: frequency ? paramsToRRule({ frequency }, remindAt ?? (dueDate ? dueDateAnchor(dueDate) : undefined)) : null,
  });
  return { ok: true as const };
}

export async function removeItem(itemId: string) {
  const user = await requireUser();
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
    /** Wall-clock "YYYY-MM-DDTHH:mm" in the user's zone, null to clear; omit to leave alone. */
    remindAt?: string | null;
  }
) {
  const user = await requireUser();
  const { title, description, priority, categoryId, dueDate, dueTime } = data;
  if (categoryId) await requireOwnCategory(user.id, categoryId);
  const changes: Parameters<typeof updateItem>[2] = { title, description, priority, categoryId, dueDate, dueTime };

  if (data.remindAt !== undefined) {
    const { remindAt, error } = parseReminder(data.remindAt, user.timezone);
    if (error) return { error };
    changes.remindAt = remindAt;
    const current = await getItem(itemId, user.id);
    // Same as the bot's update_item: a moved repeating reminder restarts its rule at the new
    // time, and re-arming one that already rang reopens it.
    if (remindAt && current?.recurrenceRule) changes.recurrenceRule = reanchorRule(current.recurrenceRule, remindAt) ?? current.recurrenceRule;
    if (remindAt && current?.status === "done") changes.status = "pending";
  }

  await updateItem(itemId, user.id, changes);
  return { ok: true as const };
}

/**
 * A reminder time from a form, as wall-clock in the user's zone. Problems are returned, not
 * thrown, so the sheet can say what's wrong; and the value is checked, not trusted, since the
 * client can post anything (a non-string crashed the parser).
 */
function parseReminder(raw: unknown, tz: string): { remindAt: Date | null; error?: string } {
  if (raw === undefined || raw === null || raw === "") return { remindAt: null };
  const remindAt = typeof raw === "string" ? parseInTz(raw, tz) : null;
  if (!remindAt) return { remindAt: null, error: "That reminder time couldn't be read." };
  if (remindAt.getTime() < Date.now() - 60_000) return { remindAt: null, error: "That reminder time has already passed." };
  return { remindAt };
}

export async function deleteGoogleCalendarEvent(googleEventId: string) {
  const user = await requireUser();
  if (!user.googleRefreshToken) throw new Error("Google Calendar not connected");
  await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", googleEventId);
  await unmirrorEvent(user.id, googleEventId);
}

export async function editGoogleCalendarEvent(
  googleEventId: string,
  data: { title?: string; startTime?: string; endTime?: string }
) {
  const user = await requireUser();
  if (!user.googleRefreshToken) throw new Error("Google Calendar not connected");
  const calendarId = user.googleCalendarId ?? "primary";
  const { title, startTime, endTime } = data;
  const updated = await updateEvent(user.googleRefreshToken, calendarId, googleEventId, { title, startTime, endTime }, user.timezone);
  await mirrorEvent(user.id, calendarId, updated);
}

export async function addCategory(name: string, color: string) {
  const user = await requireUser();
  const max = await maxSortOrder(user.id);
  return createCategory({ userId: user.id, name, color, sortOrder: max + 1 });
}

export async function editCategory(categoryId: string, data: { name?: string; color?: string | null }) {
  const user = await requireUser();
  return updateCategory(categoryId, user.id, { name: data.name, color: data.color });
}

export async function removeCategory(categoryId: string) {
  const user = await requireUser();
  await deleteCategory(categoryId, user.id);
}

export async function reorderCategoriesAction(categoryIds: string[]) {
  const user = await requireUser();
  await reorderCategories(user.id, categoryIds);
}

/** Google events for the calendar month on screen; the calendar page fetches each month it shows. */
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
      events: events.map((e) => ({ id: e.id, title: e.title, startTime: e.startTime, endTime: e.endTime, allDay: e.allDay })),
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

/** How long the task lists keep completed work on screen (listItemsForBoard). */
const BOARD_DONE_DAYS = 14;

export async function searchAction(query: string) {
  const user = await requireUser();
  // A result opens its list, which hides work completed more than BOARD_DONE_DAYS ago — so
  // don't offer what the list can't show. The bot's /search still reaches all history.
  const cutoff = Date.now() - BOARD_DONE_DAYS * 86_400_000;
  const results = await searchItems(user.id, query);
  return results.filter((r) => r.status !== "done" || new Date(r.updatedAt).getTime() >= cutoff);
}
