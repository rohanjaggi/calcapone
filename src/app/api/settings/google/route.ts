import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl, createOAuthState } from "@/lib/services/calendar";
import { rememberOAuthState } from "@/lib/services/oauth-state";
import { getRequestUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { state, payload } = createOAuthState(user.id);
  await rememberOAuthState(payload);
  return NextResponse.json({ url: getAuthUrl(state) });
}
