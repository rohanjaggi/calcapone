"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Bell } from "lucide-react";
import { searchAction } from "@/app/actions";

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
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  /** Monotonic id so a slow earlier request can't overwrite a newer result set. */
  const requestRef = useRef(0);

  /** Close and reset. Doing this here rather than in an effect keeps it one render. */
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
    setLoading(false);
    requestRef.current++; // abandon anything still in flight
  }, []);

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
    const id = setTimeout(() => inputRef.current?.focus(), 50);
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
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        aria-label="Search"
      >
        <Search className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[70]"
              onClick={close}
            />
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-[10%] left-4 right-4 max-w-lg mx-auto z-[75] bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 h-14 border-b border-border/40">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Search tasks and reminders..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setResults([]); }} className="text-muted-foreground/50 hover:text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {loading ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">Searching...</div>
                ) : results.length > 0 ? (
                  <div className="py-2">
                    {results.map((item, i) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openResult(item)}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full min-h-11 px-4 py-2.5 text-left transition-colors active:scale-[0.99] ${
                          i === active ? "bg-muted/40" : "hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {item.type === "reminder" && <Bell className="w-3 h-3 text-muted-foreground/60 shrink-0" />}
                          <span className={`text-sm truncate ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 ml-5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.category.color }}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {item.category.name}{item.dueDate ? ` · ${item.dueDate}` : ""}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : query.length >= 2 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">No results found</div>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground/50">
                    Type to search · ⌘K to toggle
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
