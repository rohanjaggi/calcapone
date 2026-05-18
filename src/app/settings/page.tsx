import { getOrCreateDevUser } from "@/lib/dev-user";
import { SettingsClient } from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOrCreateDevUser();

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
      }}
    />
  );
}
