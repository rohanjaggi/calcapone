import { requireUser } from "@/lib/auth";
import { SettingsClient } from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <SettingsClient
      userId={user.id}
      settings={{
        timezone: user.timezone,
        briefingEnabled: user.briefingEnabled,
        briefingTime: user.briefingTime,
        weeklyDigestEnabled: user.weeklyDigestEnabled,
        aiSuggestionEnabled: user.aiSuggestionEnabled,
        aiProvider: user.aiProvider,
        aiModel: user.aiModel,
        hasAiApiKey: !!user.aiApiKey,
        hasGoogleCalendar: !!user.googleRefreshToken,
        googleCalendarId: user.googleCalendarId,
        quietStart: user.quietStart,
        quietEnd: user.quietEnd,
        notifyMinPriority: user.notifyMinPriority,
        digestDay: user.digestDay,
        digestTime: user.digestTime,
      }}
    />
  );
}
