import { NextRequest, NextResponse } from "next/server";
import { updateItem, deleteItem } from "@/lib/services/item";
import { updateEvent, deleteEvent } from "@/lib/services/calendar";
import { authenticateRequest } from "@/lib/telegram-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const item = await updateItem(id, user.id, body);

  if (item.googleEventId && user.googleRefreshToken) {
    try {
      const gcalFields: { title?: string; startTime?: string; endTime?: string; description?: string } = {};
      if (body.title) gcalFields.title = body.title;
      if (body.description !== undefined) gcalFields.description = body.description ?? "";
      if (body.dueDate && body.dueTime) {
        gcalFields.startTime = `${body.dueDate}T${body.dueTime}:00`;
        const startHour = parseInt(body.dueTime.split(":")[0]);
        gcalFields.endTime = `${body.dueDate}T${String(startHour + 1).padStart(2, "0")}:${body.dueTime.split(":")[1]}:00`;
      }
      if (Object.keys(gcalFields).length > 0) {
        await updateEvent(user.googleRefreshToken, user.googleCalendarId ?? "primary", item.googleEventId, gcalFields);
      }
    } catch {
      // gcal sync failure is non-fatal
    }
  }

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
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
