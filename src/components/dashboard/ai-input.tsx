"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, Check, Loader2 } from "lucide-react";
import { aiAddItem } from "@/app/actions";

const modes = [
  { key: "task" as const, label: "Task" },
  { key: "reminder" as const, label: "Reminder" },
  { key: "event" as const, label: "Event" },
];

const placeholders: Record<string, string> = {
  task: "Buy groceries for the week...",
  reminder: "Remind me to call mom at 5pm...",
  event: "Meeting with John tomorrow at 2pm...",
};

type Status = "idle" | "loading" | "success" | "error";

export function AiInput() {
  const router = useRouter();
  const [mode, setMode] = useState<"task" | "reminder" | "event">("task");
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!input.trim() || status === "loading") return;
    setStatus("loading");
    setMessage("");

    try {
      const result = await aiAddItem(input.trim(), mode);
      if (result.success) {
        setStatus("success");
        setMessage(result.message);
        setInput("");
        router.refresh();
        setTimeout(() => {
          setStatus("idle");
          setMessage("");
        }, 2500);
      } else {
        setStatus("error");
        setMessage(result.message);
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Check your AI settings.");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
      className="px-5 mt-5"
    >
      <div className="bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden">
        {/* Header with sparkle */}
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
          <span className="sparkle-icon text-base ai-sparkle select-none">✦</span>
          <span className="text-xs font-medium text-muted-foreground tracking-wide">
            AI Quick Add
          </span>
        </div>

        {/* Mode toggles */}
        <div className="px-4 pb-3">
          <div className="flex gap-1 p-0.5 bg-secondary/50 rounded-lg">
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`relative flex-1 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                  mode === m.key ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {mode === m.key && (
                  <motion.div
                    layoutId="ai-mode-pill"
                    className="absolute inset-0 bg-card rounded-md shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input row */}
        <div className="px-4 pb-3.5">
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 h-11 focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholders[mode]}
              disabled={status === "loading"}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || status === "loading"}
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200 disabled:opacity-30 active:scale-90"
            >
              {status === "loading" ? (
                <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
              ) : status === "success" ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  <Check className="w-3.5 h-3.5 text-sage" />
                </motion.div>
              ) : (
                <div className="ai-sparkle-bg rounded-md w-full h-full flex items-center justify-center">
                  <Send className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Feedback message */}
        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className={`px-4 pb-3 text-xs ${
                status === "error" ? "text-destructive" : "text-sage"
              }`}>
                {message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
