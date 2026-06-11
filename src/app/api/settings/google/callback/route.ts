import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, verifyOAuthState } from "@/lib/services/calendar";
import { updateUserSettings } from "@/lib/services/user";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=missing_params", request.url));
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    return NextResponse.redirect(new URL("/settings?error=invalid_state", request.url));
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
