"use client";
import { motion } from "motion/react";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { TimezoneSelect } from "@/components/settings/timezone-select";
import { BriefingConfig } from "@/components/settings/briefing-config";
import { GoogleCalendarCard } from "@/components/settings/google-calendar-card";
import { NavBar } from "@/components/nav-bar";

const mockSettings = {
  timezone: "Asia/Singapore",
  briefingEnabled: false,
  briefingTime: null as string | null,
  aiProvider: null as string | null,
  aiModel: null as string | null,
  hasAiApiKey: false,
  hasGoogleCalendar: false,
  googleCalendarId: null as string | null,
};

export default function SettingsPage() {
  const handleSaveAi = async (data: { aiProvider: string; aiApiKey?: string; aiModel: string }) => { console.log("Save AI config:", data); };
  const handleSaveTimezone = async (timezone: string) => { console.log("Save timezone:", timezone); };
  const handleSaveBriefing = async (data: { briefingEnabled: boolean; briefingTime: string | null }) => { console.log("Save briefing:", data); };
  const handleConnectGoogle = async () => { console.log("Connect Google Calendar"); };
  const handleDisconnectGoogle = async () => { console.log("Disconnect Google Calendar"); };

  return (
    <main className="flex-1 safe-bottom pb-8">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="px-5 pt-6 pb-2">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">Configuration</p>
        <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground mt-0.5 tracking-tight">Settings</h1>
      </motion.header>
      <div className="px-5 mt-5 space-y-4">
        <AiProviderForm currentProvider={mockSettings.aiProvider} currentModel={mockSettings.aiModel} hasApiKey={mockSettings.hasAiApiKey} onSave={handleSaveAi} />
        <TimezoneSelect currentTimezone={mockSettings.timezone} onSave={handleSaveTimezone} />
        <BriefingConfig enabled={mockSettings.briefingEnabled} time={mockSettings.briefingTime} onSave={handleSaveBriefing} />
        <GoogleCalendarCard isConnected={mockSettings.hasGoogleCalendar} calendarId={mockSettings.googleCalendarId} onConnect={handleConnectGoogle} onDisconnect={handleDisconnectGoogle} />
      </div>
      <NavBar />
    </main>
  );
}
