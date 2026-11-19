"use client";

import { useRouter } from "next/navigation";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { NotificationsConfig } from "@/components/settings/notifications-config";
import { GoogleCalendarCard } from "@/components/settings/google-calendar-card";
import {
  saveAiConfig,
  saveTimezone,
  saveNotifications,
  getGoogleAuthUrl,
  disconnectGoogle,
} from "@/app/settings/actions";
import { openExternal } from "@/lib/telegram-webapp";

type Props = {
  settings: {
    timezone: string;
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
    aiProvider: string | null;
    aiModel: string | null;
    hasAiApiKey: boolean;
    hasGoogleCalendar: boolean;
    googleCalendarId: string | null;
    eventReminderMinutes: number | null;
    quietStart: string | null;
    quietEnd: string | null;
    notifyMinPriority: string;
    digestDay: number;
    digestTime: string;
  };
};

export function SettingsClient({ settings }: Props) {
  const router = useRouter();

  const handleSaveAi = async (data: { aiProvider: string; aiApiKey?: string; aiModel: string }) => {
    await saveAiConfig(data);
    router.refresh();
  };

  const handleSaveTimezone = async (timezone: string) => {
    await saveTimezone(timezone);
    router.refresh();
  };

  const handleSaveNotifications = async (data: {
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
    quietStart: string | null;
    quietEnd: string | null;
    notifyMinPriority: string;
    digestDay: number;
    digestTime: string;
  }) => {
    await saveNotifications(data);
    router.refresh();
  };

  const handleConnectGoogle = async () => {
    const url = await getGoogleAuthUrl();
    // System browser, not the Mini App webview: Google rejects OAuth in embedded webviews.
    openExternal(url);
  };

  const handleDisconnectGoogle = async () => {
    await disconnectGoogle();
    router.refresh();
  };

  return (
    <main className="safe-bottom sky-wash">
      <header className="rise px-6 pt-7">
        <h1 className="font-serif text-[2.5rem] leading-none font-semibold text-foreground">Settings</h1>
        <p className="mt-2.5 font-serif italic text-[17px] text-muted-foreground">How Calcapone keeps time for you</p>
      </header>

      <div className="rise-late px-4 mt-6">
        {/* One page, ruled into sections, rather than a stack of separate boxes. */}
        <div className="bg-card rounded-[1.5rem] overflow-hidden divide-y divide-border">
          <TimezoneSelect currentTimezone={settings.timezone} onSave={handleSaveTimezone} />
          <NotificationsConfig
            briefingEnabled={settings.briefingEnabled}
            briefingTime={settings.briefingTime}
            weeklyDigestEnabled={settings.weeklyDigestEnabled}
            quietStart={settings.quietStart}
            quietEnd={settings.quietEnd}
            notifyMinPriority={settings.notifyMinPriority}
            digestDay={settings.digestDay}
            digestTime={settings.digestTime}
            onSave={handleSaveNotifications}
          />
          <GoogleCalendarCard
            isConnected={settings.hasGoogleCalendar}
            calendarId={settings.googleCalendarId}
            eventAlertMinutes={settings.eventReminderMinutes}
            onConnect={handleConnectGoogle}
            onDisconnect={handleDisconnectGoogle}
          />
          <AiProviderForm
            currentProvider={settings.aiProvider}
            currentModel={settings.aiModel}
            hasApiKey={settings.hasAiApiKey}
            onSave={handleSaveAi}
          />
        </div>

      </div>
    </main>
  );
}
