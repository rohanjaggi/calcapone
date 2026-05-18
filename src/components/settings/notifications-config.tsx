"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Check, ChevronDown } from "lucide-react";

type Props = {
  briefingEnabled: boolean;
  briefingTime: string | null;
  weeklyDigestEnabled: boolean;
  aiSuggestionEnabled: boolean;
  onSave: (data: {
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
    aiSuggestionEnabled: boolean;
  }) => Promise<void>;
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${on ? "bg-primary" : "bg-muted"}`}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

export function NotificationsConfig({
  briefingEnabled,
  briefingTime,
  weeklyDigestEnabled,
  aiSuggestionEnabled,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(briefingEnabled);
  const [localTime, setLocalTime] = useState(briefingTime ?? "08:00");
  const [digestEnabled, setDigestEnabled] = useState(weeklyDigestEnabled);
  const [aiEnabled, setAiEnabled] = useState(aiSuggestionEnabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const changed =
    isEnabled !== briefingEnabled ||
    localTime !== (briefingTime ?? "08:00") ||
    digestEnabled !== weeklyDigestEnabled ||
    aiEnabled !== aiSuggestionEnabled;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      briefingEnabled: isEnabled,
      briefingTime: isEnabled ? localTime : null,
      weeklyDigestEnabled: digestEnabled,
      aiSuggestionEnabled: aiEnabled,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
    >
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-muted/30 ${open ? "border-b border-border/40" : ""}`}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-terracotta-light flex items-center justify-center">
            <Bell className="w-3.5 h-3.5 text-terracotta" />
          </div>
          <h3 className="text-sm font-medium text-foreground">Notifications & Automation</h3>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
      <div className="p-4 space-y-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-foreground">Morning briefing</span>
              <p className="text-xs text-muted-foreground mt-0.5">Daily summary via Telegram</p>
            </div>
            <Toggle on={isEnabled} onToggle={() => setIsEnabled(!isEnabled)} />
          </div>

          {isEnabled && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Briefing time
              </label>
              <input
                type="time"
                value={localTime}
                onChange={(e) => setLocalTime(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
              />
            </div>
          )}
        </div>

        <div className="border-t border-border/20" />

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-foreground">Weekly digest</span>
            <p className="text-xs text-muted-foreground mt-0.5">Sunday 7pm recap via Telegram</p>
          </div>
          <Toggle on={digestEnabled} onToggle={() => setDigestEnabled(!digestEnabled)} />
        </div>

        <div className="border-t border-border/20" />

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-foreground">Dashboard AI suggestion</span>
            <p className="text-xs text-muted-foreground mt-0.5">AI recommendation card on dashboard</p>
          </div>
          <Toggle on={aiEnabled} onToggle={() => setAiEnabled(!aiEnabled)} />
        </div>

        {changed && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {saved ? (
              <><Check className="w-4 h-4" /> Saved</>
            ) : saving ? (
              "Saving..."
            ) : (
              "Save"
            )}
          </button>
        )}
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
