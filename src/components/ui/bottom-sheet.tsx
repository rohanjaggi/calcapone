"use client";

import { useEffect } from "react";
import { motion, AnimatePresence, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { priorityColors, priorityLabels } from "@/lib/task-constants";
import { listColor } from "@/lib/list-colors";
import type { Category } from "@/lib/types";
import type { Priority } from "@/generated/prisma/enums";

// 16px text on every input: anything smaller makes iOS zoom the page when the field is focused.
export const titleInputClass =
  "w-full h-14 px-4 rounded-2xl border border-input bg-background/70 text-[17px] text-foreground placeholder:text-faint focus:outline-none focus:border-hour/70 transition-colors";
export const textAreaClass =
  "w-full px-4 py-3.5 rounded-2xl border border-input bg-background/70 text-base text-foreground placeholder:text-faint focus:outline-none focus:border-hour/70 transition-colors resize-none";
export const fieldClass =
  "w-full h-12 px-4 rounded-xl border border-input bg-background/70 text-base text-foreground focus:outline-none focus:border-hour/70 transition-colors";
export const submitClass =
  "w-full h-[3.25rem] rounded-2xl bg-primary text-primary-foreground text-base font-semibold transition-[transform,opacity] duration-200 active:scale-[0.98] disabled:bg-input disabled:text-faint disabled:cursor-not-allowed";

const headingClass = "text-[13px] font-medium text-muted-foreground block mb-2";

/** A choice in a row of options: 44px tall, selected reads as a lit edge rather than a fill. */
export const optionClass = (selected: boolean) =>
  `min-h-11 rounded-xl text-[15px] border transition-colors duration-150 flex items-center justify-center gap-2 ${
    selected ? "border-foreground/70 bg-foreground/[0.07] text-foreground font-medium" : "border-border text-muted-foreground"
  }`;

/**
 * The slide-up sheet every form in the app opens in. Drag the handle (or the title row) down
 * to dismiss, tap the shade, or press Escape.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[55]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 650) onClose();
            }}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-raised rounded-t-[1.75rem] border-t border-border shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.8)] max-h-[90dvh] flex flex-col"
          >
            <div
              onPointerDown={(e) => drag.start(e)}
              className="shrink-0 pt-3 pb-1 cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
            >
              <div className="w-10 h-1 rounded-full bg-faint/50 mx-auto" aria-hidden="true" />
              <div className="flex items-center justify-between pl-6 pr-3 pt-3">
                <h3 className="font-serif text-[1.625rem] leading-tight font-semibold text-foreground">{title}</h3>
                <button
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Close"
                  className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground active:bg-foreground/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] has-[.sheet-footer]:pb-0">
              <div className="space-y-5">{children}</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * The sheet's actions, pinned to the bottom of the scroll area so the primary button is always
 * in reach — Telegram's viewport is shorter than the phone's, and the longer forms ran past it.
 */
export function SheetFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="sheet-footer sticky bottom-0 -mx-6 px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] bg-raised shadow-[0_-14px_18px_-6px_var(--raised)] space-y-2">
      {children}
    </div>
  );
}

/** A labelled input. Wrapping in <label> ties the text to the control for screen readers. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={headingClass}>{label}</span>
      {children}
    </label>
  );
}

export function PriorityPicker({ value, onChange }: { value: Priority; onChange: (p: Priority) => void }) {
  return (
    <div role="group" aria-label="Priority">
      <span className={headingClass}>Priority</span>
      <div className="grid grid-cols-3 gap-2">
        {(["low", "medium", "high"] as const).map((p) => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)} className={optionClass(value === p)}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: priorityColors[p] }} aria-hidden="true" />
            {priorityLabels[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One chip per category; `children` lands after the chips (the create sheet's "+ New"). */
export function CategoryChips({
  categories,
  value,
  onChange,
  children,
}: {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div role="group" aria-label="Category">
      <span className={headingClass}>List</span>
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
            className={`${optionClass(value === c.id)} px-3.5`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: listColor(c.color) }} aria-hidden="true" />
            {c.name}
          </button>
        ))}
        {children}
      </div>
    </div>
  );
}
