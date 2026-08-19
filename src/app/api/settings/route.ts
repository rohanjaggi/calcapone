import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserSettings } from "@/lib/services/user";
import { getRequestUser } from "@/lib/auth";
import { parseSettingsPatch } from "@/lib/settings-input";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRecord = await getUserById(user.id);
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
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseSettingsPatch(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const updated = await updateUserSettings(user.id, parsed.data);
  return NextResponse.json({
    timezone: updated.timezone,
    briefingEnabled: updated.briefingEnabled,
    briefingTime: updated.briefingTime,
    aiProvider: updated.aiProvider,
    aiModel: updated.aiModel,
    hasAiApiKey: !!updated.aiApiKey,
  });
}
