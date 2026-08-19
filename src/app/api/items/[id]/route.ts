import { NextRequest, NextResponse } from "next/server";
import { updateItem, deleteItem } from "@/lib/services/item";
import { updateEvent, deleteEvent } from "@/lib/services/calendar";
import { getRequestUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseInTz } from "@/lib/tz";

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
        gcalFields.startTime = `${body.dueDate}T${body.dueTime}:00`;
        const [h, m] = body.dueTime.split(":").map(Number);
        if (h < 23) {
          gcalFields.endTime = `${body.dueDate}T${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
        } else {
          const nextDay = new Date(new Date(`${body.dueDate}T00:00:00`).getTime() + 86400000).toISOString().split("T")[0];
          gcalFields.endTime = `${nextDay}T00:${String(m).padStart(2, "0")}:00`;
        }
      }
      if (Object.keys(gcalFields).length > 0) {
        await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId, gcalFields, user.timezone);
      }
    } catch {
      // gcal sync failure is non-fatal
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
    } catch {
      // gcal sync failure is non-fatal
    }
  }

  await deleteItem(id, user.id);
  return NextResponse.json({ ok: true });
}
