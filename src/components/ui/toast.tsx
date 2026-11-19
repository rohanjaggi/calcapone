"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Tone = "error" | "info";
type Action = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: Tone; action?: Action };

type Options = { tone?: Tone; action?: Action; durationMs?: number };

type ToastApi = {
  /** Show a transient message. Optimistic updates use this to explain a rollback or offer Undo. */
  notify: (message: string, options?: Tone | Options) => void;
};

const ToastContext = createContext<ToastApi>({ notify: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

const DURATION_MS = 4000;
let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (message: string, options?: Tone | Options) => {
      const opts: Options = typeof options === "string" ? { tone: options } : options ?? {};
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, tone: opts.tone ?? "error", action: opts.action }]);
      setTimeout(() => dismiss(id), opts.durationMs ?? DURATION_MS);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Above the nav bar, inside the safe area — the Mini App sits under Telegram's chrome. */}
      <div
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] z-[100] flex flex-col items-center gap-2 px-4 pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto w-full max-w-sm min-h-12 rounded-2xl pl-4 pr-1.5 py-1.5 flex items-center gap-3 text-[15px] border shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] ${
                toast.tone === "error"
                  ? "bg-raised border-alarm/40 text-foreground"
                  : "bg-raised border-border text-foreground"
              }`}
            >
              {toast.tone === "error" && <span className="w-1.5 h-1.5 rounded-full bg-alarm shrink-0" aria-hidden="true" />}
              <span className="flex-1 py-1.5">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick();
                    dismiss(toast.id);
                  }}
                  className="shrink-0 h-10 px-4 rounded-xl text-[15px] font-semibold text-hour active:bg-foreground/10 transition-colors"
                >
                  {toast.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
