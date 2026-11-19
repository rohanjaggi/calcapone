"use server";

import { updateUserSettings, changeTimezone } from "@/lib/services/user";
import { requireUser } from "@/lib/auth";
import { getAuthUrl, createOAuthState, revokeRefreshToken } from "@/lib/services/calendar";
import { rememberOAuthState } from "@/lib/services/oauth-state";
import { markCalendarDisconnected } from "@/lib/services/calendar-link";
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
  if (timezone !== user.timezone) await changeTimezone(user.id, user.timezone, timezone);
}

export async function saveNotifications(data: {
  briefingEnabled: boolean;
  briefingTime: string | null;
  weeklyDigestEnabled: boolean;
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
  // Named fields only: spreading `data` let a crafted call write any user column (e.g. reset aiCallsCount).
  await updateUserSettings(user.id, {
    briefingEnabled: data.briefingEnabled === true,
    briefingTime: data.briefingTime,
    weeklyDigestEnabled: data.weeklyDigestEnabled === true,
    quietStart: data.quietStart,
    quietEnd: data.quietEnd,
    notifyMinPriority: data.notifyMinPriority,
    digestDay: data.digestDay,
    digestTime: data.digestTime,
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
  await markCalendarDisconnected(user.id);
  await updateUserSettings(user.id, { googleCalendarId: null });
}
