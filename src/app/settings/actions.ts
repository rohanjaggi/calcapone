"use server";

import { updateUserSettings } from "@/lib/services/user";
import { requireUser } from "@/lib/auth";
import { getAuthUrl, createOAuthState, revokeRefreshToken } from "@/lib/services/calendar";
import { rememberOAuthState } from "@/lib/services/oauth-state";
import { isHHmm, isPriority, isProvider } from "@/lib/settings-input";
import { isSelectableTz } from "@/lib/tz";

export async function saveAiConfig(data: {
  aiProvider: string;
  aiApiKey?: string;
  aiModel: string;
}) {
  const user = await requireUser();
  if (!isProvider(data.aiProvider)) throw new Error("Unsupported AI provider");
  await updateUserSettings(user.id, {
    aiProvider: data.aiProvider,
    ...(data.aiApiKey && { aiApiKey: data.aiApiKey }),
    aiModel: data.aiModel,
  });
}

export async function saveTimezone(timezone: string) {
  const user = await requireUser();
  if (!isSelectableTz(timezone)) throw new Error("Invalid time zone");
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
  if (data.briefingTime !== null && !isHHmm(data.briefingTime)) throw new Error("Briefing time must be HH:mm");
  if (data.quietStart !== null && !isHHmm(data.quietStart)) throw new Error("Quiet start must be HH:mm");
  if (data.quietEnd !== null && !isHHmm(data.quietEnd)) throw new Error("Quiet end must be HH:mm");
  if (!isHHmm(data.digestTime)) throw new Error("Digest time must be HH:mm");
  if (!Number.isInteger(data.digestDay) || data.digestDay < 0 || data.digestDay > 6) {
    throw new Error("Digest day must be 0-6");
  }
  if (!isPriority(data.notifyMinPriority)) throw new Error("Invalid minimum priority");
  await updateUserSettings(user.id, {
    ...data,
    notifyMinPriority: data.notifyMinPriority,
  });
}

export async function getGoogleAuthUrl() {
  const user = await requireUser();
  const { state, payload } = createOAuthState(user.id);
  await rememberOAuthState(payload);
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
