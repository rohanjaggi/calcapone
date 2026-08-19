import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, parseOAuthState } from "@/lib/services/calendar";
import { consumeOAuthState } from "@/lib/services/oauth-state";
import { getUserById, updateUserSettings } from "@/lib/services/user";
import { appUrl } from "@/lib/app-url";

/**
 * Google redirects here in whatever browser finished consent — for a Telegram Mini App that
 * is the system browser, which carries neither the session cookie nor a state cookie. The
 * signed, single-use `state` is therefore the only credential: it names the user, expires in
 * 10 minutes, and its nonce is burned here so a captured callback URL can't be replayed.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const done = (status: string) => NextResponse.redirect(appUrl(`/google/done?status=${status}`, request));

  if (oauthError) return done("denied");
  if (!code || !state) return done("missing_params");

  const payload = parseOAuthState(state);
  if (!payload) return done("invalid_state");

  if (!(await consumeOAuthState(payload.nonce, payload.userId))) {
    return done("invalid_state"); // already redeemed, expired, or not this user's nonce
  }

  const user = await getUserById(payload.userId);
  if (!user) return done("invalid_state");

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Google only returns a refresh token on first consent; leave any existing link intact.
      return done("no_refresh_token");
    }
    await updateUserSettings(user.id, {
      googleRefreshToken: tokens.refresh_token,
      googleCalendarId: user.googleCalendarId ?? "primary",
    });
    return done("connected");
  } catch (error) {
    console.error("[google-oauth] token exchange failed:", error instanceof Error ? error.message : error);
    return done("failed");
  }
}
