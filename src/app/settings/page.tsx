import { requireUser } from "@/lib/auth";
import { SettingsClient } from "@/components/settings/settings-client";
import { SkyStyle } from "@/components/sky/sky-style";
import { getTrialDailyLimit, trialCallsLeft } from "@/lib/services/trial";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <>
      <SkyStyle timezone={user.timezone} />
      <SettingsClient
        settings={{
          timezone: user.timezone,
          briefingEnabled: user.briefingEnabled,
          briefingTime: user.briefingTime,
          weeklyDigestEnabled: user.weeklyDigestEnabled,
          aiProvider: user.aiProvider,
          aiModel: user.aiModel,
          hasAiApiKey: !!user.aiApiKey,
          trialLeft: trialCallsLeft(user),
          trialLimit: getTrialDailyLimit(),
          hasGoogleCalendar: !!user.googleRefreshToken,
          googleCalendarId: user.googleCalendarId,
          eventReminderMinutes: user.eventReminderMinutes,
          quietStart: user.quietStart,
          quietEnd: user.quietEnd,
          notifyMinPriority: user.notifyMinPriority,
          digestDay: user.digestDay,
          digestTime: user.digestTime,
        }}
      />
    </>
  );
}
