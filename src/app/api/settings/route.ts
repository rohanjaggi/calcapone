import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserSettings } from "@/lib/services/user";
import { authenticateRequest } from "@/lib/telegram-auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const userRecord = await getUserById(userId);
  if (!userRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    timezone: userRecord.timezone,
    briefingEnabled: userRecord.briefingEnabled,
    briefingTime: userRecord.briefingTime,
    aiProvider: userRecord.aiProvider,
    aiModel: userRecord.aiModel,
    hasAiApiKey: !!userRecord.aiApiKey,
    hasGoogleCalendar: !!userRecord.googleRefreshToken,
    googleCalendarId: userRecord.googleCalendarId,
  });
}

export async function PATCH(request: NextRequest) {
  const user = await authenticateRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;

  const body = await request.json();
  const allowedFields = [
    "timezone", "briefingEnabled", "briefingTime",
    "aiProvider", "aiApiKey", "aiModel",
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) data[key] = body[key];
  }

  const updated = await updateUserSettings(userId, data as Parameters<typeof updateUserSettings>[1]);
  return NextResponse.json({
    timezone: updated.timezone,
    briefingEnabled: updated.briefingEnabled,
    briefingTime: updated.briefingTime,
    aiProvider: updated.aiProvider,
    aiModel: updated.aiModel,
    hasAiApiKey: !!updated.aiApiKey,
  });
}
