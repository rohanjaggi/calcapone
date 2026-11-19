"use client";

import { useId, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell } from "lucide-react";
import { SettingsCard, SaveButton } from "@/components/settings/settings-card";
import { Switch } from "@/components/ui/switch";
import { fieldClass, optionClass } from "@/components/ui/bottom-sheet";
import { formatTime } from "@/lib/task-constants";
import { useToast } from "@/components/ui/toast";

type Props = {
  briefingEnabled: boolean;
  briefingTime: string | null;
  weeklyDigestEnabled: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  notifyMinPriority: string;
  digestDay: number;
  digestTime: string;
  onSave: (data: {
    briefingEnabled: boolean;
    briefingTime: string | null;
    weeklyDigestEnabled: boolean;
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
  { value: "low", label: "Everything" },
  { value: "medium", label: "Medium and up" },
  { value: "high", label: "High only" },
];

const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
} as const;

function ToggleRow({
  title,
  detail,
  on,
  onChange,
  children,
}: {
  title: string;
  detail: string;
  on: boolean;
  onChange: (next: boolean) => void;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div id={id}>
          <span className="block text-base text-foreground">{title}</span>
          <span className="block text-[13px] text-muted-foreground mt-0.5">{detail}</span>
        </div>
        <Switch checked={on} onChange={onChange} labelledBy={id} />
      </div>
      <AnimatePresence initial={false}>
        {on && children && (
          <motion.div {...reveal} className="overflow-hidden">
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const small = "text-[13px] font-medium text-muted-foreground block mb-1.5";

export function NotificationsConfig({
  briefingEnabled,
  briefingTime,
  weeklyDigestEnabled,
  quietStart,
  quietEnd,
  notifyMinPriority,
  digestDay,
  digestTime,
  onSave,
}: Props) {
  const [isEnabled, setIsEnabled] = useState(briefingEnabled);
  const [localTime, setLocalTime] = useState(briefingTime ?? "08:00");
  const [digestEnabled, setDigestEnabled] = useState(weeklyDigestEnabled);
  const [localQuietStart, setLocalQuietStart] = useState(quietStart ?? "");
  const [localQuietEnd, setLocalQuietEnd] = useState(quietEnd ?? "");
  const [quietEnabled, setQuietEnabled] = useState(!!quietStart && !!quietEnd);
  const [localPriority, setLocalPriority] = useState(notifyMinPriority);
  const [localDigestDay, setLocalDigestDay] = useState(digestDay);
  const [localDigestTime, setLocalDigestTime] = useState(digestTime);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();
  const [saved, setSaved] = useState(false);

  const changed =
    isEnabled !== briefingEnabled ||
    localTime !== (briefingTime ?? "08:00") ||
    digestEnabled !== weeklyDigestEnabled ||
    (quietEnabled ? localQuietStart : null) !== quietStart ||
    (quietEnabled ? localQuietEnd : null) !== quietEnd ||
    localPriority !== notifyMinPriority ||
    localDigestDay !== digestDay ||
    localDigestTime !== digestTime;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        briefingEnabled: isEnabled,
        // A cleared time picker gives "", which the server rejects; fall back to the default.
        briefingTime: isEnabled ? localTime || "08:00" : null,
        weeklyDigestEnabled: digestEnabled,
        quietStart: quietEnabled ? (localQuietStart || "23:00") : null,
        quietEnd: quietEnabled ? (localQuietEnd || "07:00") : null,
        notifyMinPriority: localPriority,
        digestDay: localDigestDay,
        digestTime: localDigestTime || "19:00",
      });
    } catch {
      notify("Couldn't save your notification settings — please try again.");
      return;
    } finally {
      setSaving(false);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const summary =
    [
      briefingEnabled && briefingTime ? `Briefing ${formatTime(briefingTime)}` : null,
      weeklyDigestEnabled ? `Digest ${DAY_OPTIONS[digestDay]?.label ?? ""}` : null,
      quietStart && quietEnd ? "Quiet hours on" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Reminders only";

  return (
    <SettingsCard icon={Bell} title="Notifications" value={summary}>
      <ToggleRow title="Morning briefing" detail="A summary of your day, sent in Telegram" on={isEnabled} onChange={setIsEnabled}>
        <label className="block">
          <span className={small}>Send at</span>
          <input type="time" value={localTime} onChange={(e) => setLocalTime(e.target.value)} className={fieldClass} />
        </label>
      </ToggleRow>

      <ToggleRow title="Weekly digest" detail="What you finished, missed and have coming" on={digestEnabled} onChange={setDigestEnabled}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={small}>Day</span>
            <select value={localDigestDay} onChange={(e) => setLocalDigestDay(Number(e.target.value))} className={fieldClass}>
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={small}>Time</span>
            <input type="time" value={localDigestTime} onChange={(e) => setLocalDigestTime(e.target.value)} className={fieldClass} />
          </label>
        </div>
      </ToggleRow>

      <ToggleRow title="Quiet hours" detail="Hold notifications during this window" on={quietEnabled} onChange={setQuietEnabled}>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={small}>From</span>
            <input type="time" value={localQuietStart || "23:00"} onChange={(e) => setLocalQuietStart(e.target.value)} className={fieldClass} />
          </label>
          <label className="block">
            <span className={small}>Until</span>
            <input type="time" value={localQuietEnd || "07:00"} onChange={(e) => setLocalQuietEnd(e.target.value)} className={fieldClass} />
          </label>
        </div>
      </ToggleRow>

      <div role="group" aria-label="Which tasks notify you">
        <span className="block text-base text-foreground">Which tasks notify you</span>
        <span className="block text-[13px] text-muted-foreground mt-0.5">For deadline alerts (a day before, 2 hours before, overdue). Reminders you set always ring.</span>
        <div className="grid grid-cols-3 gap-2 mt-3">
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={localPriority === opt.value}
              onClick={() => setLocalPriority(opt.value)}
              className={`${optionClass(localPriority === opt.value)} px-2 text-[13px] leading-tight text-center`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {(changed || saved) && <SaveButton onClick={handleSave} saving={saving} saved={saved} />}
    </SettingsCard>
  );
}
