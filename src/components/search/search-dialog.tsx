"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Bell } from "lucide-react";
import { searchAction } from "@/app/actions";
import { listColor } from "@/lib/list-colors";
import { formatDueDate } from "@/lib/task-constants";

type SearchResult = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: { id: string; name: string; color: string };
  dueDate: string | null;
  type: "task" | "reminder";
};

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic id so a slow earlier request can't overwrite a newer result set. */
  const requestRef = useRef(0);

  /** Empty the box and abandon anything queued or in flight. */
  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current++;
    setQuery("");
    setResults([]);
    setActive(0);
    setLoading(false);
  }, []);

  /** Close and reset. Doing this here rather than in an effect keeps it one render. */
  const close = useCallback(() => {
    setOpen(false);
    clear();
  }, [clear]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    const id = ++requestRef.current;
    if (q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await searchAction(q.trim());
      if (id !== requestRef.current) return; // a newer query has since been issued
      setResults(r);
      setActive(0);
    } catch {
      if (id === requestRef.current) setResults([]);
    }
    if (id === requestRef.current) setLoading(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  /** Open the list the result lives in — the dashboard has no per-item route. */
  const openResult = (result: SearchResult) => {
    close();
    router.push(result.category.id ? `/todos/${result.category.id}` : "/todos");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      openResult(results[active]);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-11 h-11 rounded-full flex items-center justify-center text-foreground/90 active:bg-foreground/10 transition-colors"
        aria-label="Search tasks"
      >
        <Search className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[70]"
              onClick={close}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.15 } }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-[calc(env(safe-area-inset-top,0px)+0.75rem)] left-3 right-3 max-w-lg mx-auto z-[75] bg-raised border border-border rounded-[1.5rem] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.85)] overflow-hidden"
            >
              <div className="flex items-center gap-3 pl-4 pr-1.5 h-14 border-b border-border">
                <Search className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => handleInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Search tasks and reminders"
                  aria-label="Search tasks and reminders"
                  className="flex-1 bg-transparent text-[17px] text-foreground placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
                />
                {query ? (
                  <button onClick={clear} aria-label="Clear search" className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground active:bg-foreground/10">
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={close} className="h-11 px-3 rounded-full text-[15px] text-muted-foreground active:bg-foreground/10">
                    Cancel
                  </button>
                )}
              </div>

              <div className="max-h-[60dvh] overflow-y-auto">
                {loading ? (
                  <p className="px-5 py-8 text-center text-[15px] text-muted-foreground">Searching…</p>
                ) : results.length > 0 ? (
                  <ul className="py-1.5">
                    {results.map((item, i) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => openResult(item)}
                          onMouseEnter={() => setActive(i)}
                          className={`w-full min-h-14 px-5 py-2.5 text-left transition-colors ${i === active ? "bg-foreground/[0.06]" : ""}`}
                        >
                          <span className="flex items-center gap-2">
                            {item.type === "reminder" && <Bell className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-label="Reminder" />}
                            <span className={`text-base truncate ${item.status === "done" ? "line-through text-faint" : "text-foreground"}`}>
                              {item.title}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 mt-1">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: listColor(item.category.color) }} aria-hidden="true" />
                            <span className="text-[13px] text-muted-foreground">
                              {item.category.name}
                              {item.dueDate ? ` · ${formatDueDate(item.dueDate, { day: "numeric", month: "short" })}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim().length >= 2 ? (
                  <p className="px-5 py-8 text-center text-[15px] text-muted-foreground">Nothing matches “{query.trim()}”.</p>
                ) : (
                  <p className="px-5 py-8 text-center text-[15px] text-muted-foreground">Search by title or meaning — “dentist”, “exam next week”.</p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
