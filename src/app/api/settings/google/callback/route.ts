import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/services/calendar";
import { updateUserSettings } from "@/lib/services/user";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");

  if (!code || !userId) {
    return NextResponse.redirect(new URL("/settings?error=missing_params", request.url));
  }

  try {
    const tokens = await exchangeCode(code);
    await updateUserSettings(userId, {
      googleRefreshToken: tokens.refresh_token ?? null,
      googleCalendarId: "primary",
    });
    return NextResponse.redirect(new URL("/settings?success=google_connected", request.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?error=google_auth_failed", request.url));
  }
}
