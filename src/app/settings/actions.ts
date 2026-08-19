"use server";

import { updateUserSettings } from "@/lib/services/user";
import { requireUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { getAuthUrl, createOAuthState, revokeRefreshToken, OAUTH_STATE_COOKIE } from "@/lib/services/calendar";
import type { AiProvider, Priority } from "@/generated/prisma/enums";

export async function saveAiConfig(data: {
  aiProvider: string;
  aiApiKey?: string;
  aiModel: string;
}) {
  const user = await requireUser();
  await updateUserSettings(user.id, {
    aiProvider: data.aiProvider as AiProvider,
    ...(data.aiApiKey && { aiApiKey: data.aiApiKey }),
    aiModel: data.aiModel,
  });
}

export async function saveTimezone(timezone: string) {
  const user = await requireUser();
  await updateUserSettings(user.id, { timezone });
}

export async function saveNotifications(data: {
  briefingEnabled: boolean;
  briefingTime: string | null;
  weeklyDigestEnabled: boolean;
  aiSuggestionEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  notifyMinPriority: string;
  digestDay: number;
  digestTime: string;
}) {
  const user = await requireUser();
  await updateUserSettings(user.id, {
    ...data,
    notifyMinPriority: data.notifyMinPriority as Priority,
  });
}

export async function getGoogleAuthUrl() {
  await requireUser();
  const { state, nonce } = createOAuthState();
  const jar = await cookies();
  jar.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return getAuthUrl(state);
}

export async function disconnectGoogle() {
  const user = await requireUser();
  if (user.googleRefreshToken) {
    await revokeRefreshToken(user.googleRefreshToken);
  }
  await updateUserSettings(user.id, {
    googleRefreshToken: null,
    googleCalendarId: null,
  });
}
