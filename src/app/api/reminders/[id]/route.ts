import { NextRequest, NextResponse } from "next/server";
import { cancelReminder } from "@/lib/services/reminder";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const { id } = await params;
  await cancelReminder(id, userId);
  return NextResponse.json({ ok: true });
}
