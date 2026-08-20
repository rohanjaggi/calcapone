"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, Check, ChevronDown } from "lucide-react";

type Props = {
  briefingEnabled: boolean;
  briefingTime: string | null;
  weeklyDigestEnabled: boolean;
  aiSuggestionEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  notifyMinPriority: string;
  digestDay: number;
  digestTime: string;
  onSave: (data: {
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
    aiSuggestionEnabled: boolean;
    quietStart: string | null;
    quietEnd: string | null;
    notifyMinPriority: string;
    digestDay: number;
    digestTime: string;
  }) => Promise<void>;
};

const DAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "All (low+)" },
  { value: "medium", label: "Medium+" },
  { value: "high", label: "High only" },
];

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
  quietStart,
  quietEnd,
  notifyMinPriority,
  digestDay,
  digestTime,
  onSave,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(briefingEnabled);
  const [localTime, setLocalTime] = useState(briefingTime ?? "08:00");
  const [digestEnabled, setDigestEnabled] = useState(weeklyDigestEnabled);
  const [aiEnabled, setAiEnabled] = useState(aiSuggestionEnabled);
  const [localQuietStart, setLocalQuietStart] = useState(quietStart ?? "");
  const [localQuietEnd, setLocalQuietEnd] = useState(quietEnd ?? "");
  const [quietEnabled, setQuietEnabled] = useState(!!quietStart && !!quietEnd);
  const [localPriority, setLocalPriority] = useState(notifyMinPriority);
  const [localDigestDay, setLocalDigestDay] = useState(digestDay);
  const [localDigestTime, setLocalDigestTime] = useState(digestTime);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const changed =
    isEnabled !== briefingEnabled ||
    localTime !== (briefingTime ?? "08:00") ||
    digestEnabled !== weeklyDigestEnabled ||
    aiEnabled !== aiSuggestionEnabled ||
    (quietEnabled ? localQuietStart : null) !== quietStart ||
    (quietEnabled ? localQuietEnd : null) !== quietEnd ||
    localPriority !== notifyMinPriority ||
    localDigestDay !== digestDay ||
    localDigestTime !== digestTime;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      briefingEnabled: isEnabled,
      briefingTime: isEnabled ? localTime : null,
      weeklyDigestEnabled: digestEnabled,
      aiSuggestionEnabled: aiEnabled,
      quietStart: quietEnabled ? (localQuietStart || "23:00") : null,
      quietEnd: quietEnabled ? (localQuietEnd || "07:00") : null,
      notifyMinPriority: localPriority,
      digestDay: localDigestDay,
      digestTime: localDigestTime,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
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
              {/* Morning briefing */}
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
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Briefing time</label>
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

              {/* Weekly digest */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-foreground">Weekly digest</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Recap via Telegram</p>
                  </div>
                  <Toggle on={digestEnabled} onToggle={() => setDigestEnabled(!digestEnabled)} />
                </div>
                {digestEnabled && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Day</label>
                      <select
                        value={localDigestDay}
                        onChange={(e) => setLocalDigestDay(Number(e.target.value))}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      >
                        {DAY_OPTIONS.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Time</label>
                      <input
                        type="time"
                        value={localDigestTime}
                        onChange={(e) => setLocalDigestTime(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border/20" />

              {/* Quiet hours */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-foreground">Quiet hours</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Suppress notifications during this window</p>
                  </div>
                  <Toggle on={quietEnabled} onToggle={() => setQuietEnabled(!quietEnabled)} />
                </div>
                {quietEnabled && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">From</label>
                      <input
                        type="time"
                        value={localQuietStart || "23:00"}
                        onChange={(e) => setLocalQuietStart(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground mt-5">to</span>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">Until</label>
                      <input
                        type="time"
                        value={localQuietEnd || "07:00"}
                        onChange={(e) => setLocalQuietEnd(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-border/20" />

              {/* Priority filter */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-foreground">Notification priority</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Minimum priority to notify</p>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setLocalPriority(opt.value)}
                      className={`flex-1 h-8 rounded-lg text-xs font-medium transition-all ${
                        localPriority === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/20" />

              {/* AI suggestion */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-foreground">Dashboard AI suggestion</span>
                  <p className="text-xs text-muted-foreground mt-0.5">AI recommendation card on dashboard</p>
                </div>
                <Toggle on={aiEnabled} onToggle={() => setAiEnabled(!aiEnabled)} />
              </div>

              {/* Save button */}
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
    </div>
  );
}
