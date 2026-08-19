import { NextRequest, NextResponse } from "next/server";
import { updateItem, deleteItem } from "@/lib/services/item";
import { updateEvent, deleteEvent } from "@/lib/services/calendar";
import { getRequestUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseInTz } from "@/lib/tz";
import { dueWindowToGcal } from "@/lib/services/gcal-window";
import { CalendarAuthError } from "@/lib/services/calendar";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const raw = await request.json();
  // Allow-list: never forward userId/parentId/notificationStage/etc. from the client.
  const body: Parameters<typeof updateItem>[2] & { dueDate?: string | null; dueTime?: string | null } = {};
  if (typeof raw.title === "string") body.title = raw.title;
  if (raw.description !== undefined) body.description = raw.description ?? null;
  if (raw.status !== undefined) body.status = raw.status;
  if (raw.priority !== undefined) body.priority = raw.priority;
  if (typeof raw.categoryId === "string") body.categoryId = raw.categoryId;
  if (raw.dueDate !== undefined) body.dueDate = raw.dueDate ?? null;
  if (raw.dueTime !== undefined) body.dueTime = raw.dueTime ?? null;
  if (raw.remindAt !== undefined) body.remindAt = raw.remindAt ? parseInTz(String(raw.remindAt), user.timezone) : null;
  if (raw.recurring !== undefined) body.recurring = raw.recurring;
  const item = await updateItem(id, user.id, body);

  if (item.googleEventId && user.googleRefreshToken) {
    try {
      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
      if (body.title) gcalFields.title = body.title;
      if (body.description !== undefined) gcalFields.description = body.description ?? "";
      if (body.dueDate && body.dueTime) {
        Object.assign(gcalFields, dueWindowToGcal(body.dueDate, body.dueTime));
      }
      if (Object.keys(gcalFields).length > 0) {
        await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId, gcalFields, user.timezone);
      }
    } catch (error) {
      // Best-effort sync: the item update already succeeded. A revoked grant clears the link.
      if (error instanceof CalendarAuthError) await markCalendarDisconnected(user.id);
      else console.error("[api:items] calendar sync failed:", error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch the item first to check for googleEventId
  const item = await prisma.item.findUnique({ where: { id, userId: user.id } });

  if (item?.googleEventId && user.googleRefreshToken) {
    try {
      await deleteEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId);
    } catch (error) {
      if (error instanceof CalendarAuthError) await markCalendarDisconnected(user.id);
      else console.error("[api:items] calendar delete failed:", error instanceof Error ? error.message : error);
    }
  }

  await deleteItem(id, user.id);
  return NextResponse.json({ ok: true });
}
