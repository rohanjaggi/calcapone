"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, Bell } from "lucide-react";
import { searchAction } from "@/app/actions";

type SearchResult = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  category: { name: string; color: string };
  dueDate: string | null;
  type: "task" | "reminder";
};

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) { setQuery(""); setResults([]); }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const r = await searchAction(q.trim());
      setResults(r);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
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
              onClick={() => setOpen(false)}
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
                    {results.map((item) => (
                      <div key={item.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
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
                      </div>
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
