"use client";

import { useId, useState, type ComponentType } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown } from "lucide-react";

/**
 * One settings section: a row that names the setting and shows its current value, opening
 * into the controls. The value on the closed row means nobody has to expand a section just
 * to see how it is set.
 */
export function SettingsCard({
  icon: Icon,
  title,
  value,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** The current setting, in words, shown while the section is closed. */
  value: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="w-full min-h-16 px-5 py-3 flex items-center gap-3.5 text-left active:bg-foreground/[0.04] transition-colors"
      >
        <Icon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-base font-medium text-foreground">{title}</span>
          <span className="block text-[13px] text-muted-foreground truncate mt-0.5">{value}</span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-faint shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A setting's save button: appears only once something changed, says when it landed. */
export function SaveButton({
  onClick,
  saving,
  saved,
  disabled,
  label = "Save",
}: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-[15px] font-semibold transition-[transform,opacity] active:scale-[0.98] disabled:bg-input disabled:text-faint"
    >
      {saved ? "Saved" : saving ? "Saving…" : label}
    </button>
  );
}
