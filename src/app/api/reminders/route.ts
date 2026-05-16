import { NextRequest, NextResponse } from "next/server";
import { createReminder, listReminders } from "@/lib/services/reminder";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "pending" | "sent" | "cancelled" | null;

  const reminders = await listReminders(userId, {
    ...(status && { status }),
  });
  return NextResponse.json(reminders);
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const body = await request.json();
  const reminder = await createReminder({
    userId,
    ...body,
    remindAt: new Date(body.remindAt),
  });
  return NextResponse.json(reminder, { status: 201 });
}
