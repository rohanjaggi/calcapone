"use server";

import { updateUserSettings } from "@/lib/services/user";
import { getOrCreateDevUser } from "@/lib/dev-user";
import { getAuthUrl } from "@/lib/services/calendar";
import type { AiProvider } from "@/generated/prisma/enums";

export async function saveAiConfig(data: {
  aiProvider: string;
  aiApiKey?: string;
  aiModel: string;
}) {
  const user = await getOrCreateDevUser();
  await updateUserSettings(user.id, {
    aiProvider: data.aiProvider as AiProvider,
    ...(data.aiApiKey && { aiApiKey: data.aiApiKey }),
    aiModel: data.aiModel,
  });
}

export async function saveTimezone(timezone: string) {
  const user = await getOrCreateDevUser();
  await updateUserSettings(user.id, { timezone });
}

export async function saveNotifications(data: {
  briefingEnabled: boolean;
  briefingTime: string | null;
  weeklyDigestEnabled: boolean;
  aiSuggestionEnabled: boolean;
}) {
  const user = await getOrCreateDevUser();
  await updateUserSettings(user.id, data);
}

export async function getGoogleAuthUrl() {
  const user = await getOrCreateDevUser();
  return getAuthUrl(user.id);
}

export async function disconnectGoogle() {
  const user = await getOrCreateDevUser();
  await updateUserSettings(user.id, {
    googleRefreshToken: null,
    googleCalendarId: null,
  });
}
