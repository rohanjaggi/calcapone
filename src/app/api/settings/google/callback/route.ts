import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, verifyOAuthState, OAUTH_STATE_COOKIE } from "@/lib/services/calendar";
import { updateUserSettings } from "@/lib/services/user";
import { getRequestUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  };

  if (!code || !state) return redirectTo("/settings?error=missing_params");

  // The user comes from the session; `state` only proves this browser started the flow.
  const user = await getRequestUser(request);
  if (!user) return redirectTo("/login?error=session_expired");

  const cookieNonce = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!verifyOAuthState(state, cookieNonce)) return redirectTo("/settings?error=invalid_state");

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Google didn't hand back a refresh token — leave the existing connection untouched.
      return redirectTo("/settings?error=no_refresh_token");
    }
    await updateUserSettings(user.id, {
      googleRefreshToken: tokens.refresh_token,
      googleCalendarId: user.googleCalendarId ?? "primary",
    });
    return redirectTo("/settings?success=google_connected");
  } catch (error) {
    console.error("[google-oauth] token exchange failed:", error instanceof Error ? error.message : error);
    return redirectTo("/settings?error=google_auth_failed");
  }
}
