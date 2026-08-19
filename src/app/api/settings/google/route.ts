import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/services/calendar";
import { getRequestUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { state, nonce } = createOAuthState();
  const response = NextResponse.json({ url: getAuthUrl(state) });
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
