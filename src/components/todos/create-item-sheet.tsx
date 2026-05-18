"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { addItem, addCategory } from "@/app/actions";
import { priorityColors, priorityLabels } from "@/lib/task-constants";
import type { Category } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

const COLOR_PRESETS = [
  "#E74C3C", "#E67E22", "#F1C40F", "#2ECC71", "#1ABC9C",
  "#3498DB", "#9B59B6", "#E84393", "#00B894", "#6C5CE7",
  "#FDA7DF", "#FD9644", "#778CA3", "#A55EEA", "#26DE81",
];

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  defaultCategoryId?: string;
};

export function CreateItemSheet({ open, onClose, categories, defaultCategoryId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [categoryId, setCategoryId] = useState<string>(
    defaultCategoryId ?? categories[0]?.id ?? ""
  );
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#92785C");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localCategories, setLocalCategories] = useState(categories);

  useEffect(() => {
    setLocalCategories(categories);
    if (categoryId && !categories.find((c) => c.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? "");
    }
  }, [categories]);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    const cat = await addCategory(newCategoryName.trim(), newCategoryColor);
    const newCat = { id: cat.id, name: cat.name, color: cat.color ?? newCategoryColor };
    setLocalCategories((prev) => [...prev, newCat]);
    setCategoryId(newCat.id);
    setNewCategoryName("");
    setShowNewCategory(false);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !categoryId) return;
    setSaving(true);
    await addItem({
      title: title.trim(),
      categoryId,
      priority,
      description: description.trim() || null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      remindAt: remindEnabled && remindAt ? remindAt : null,
      recurring,
    });
    setSaving(false);
    setTitle("");
    setDescription("");
    setPriority("medium");
    setCategoryId(defaultCategoryId ?? localCategories[0]?.id ?? "");
    setDueDate("");
    setDueTime("");
    setRemindEnabled(false);
    setRemindAt("");
    setRecurring("none");
    onClose();
    router.refresh();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[55]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-2xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] max-h-[90dvh] flex flex-col"
          >
            <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3 shrink-0" />
            <div className="overflow-y-auto px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-serif text-xl font-normal text-foreground">New Task</h3>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
                />

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Priority</label>
                  <div className="flex gap-2">
                    {(["low", "medium", "high"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`flex-1 h-9 rounded-lg text-xs font-medium border transition-all duration-150 flex items-center justify-center gap-1.5 ${
                          priority === p
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border/50 text-muted-foreground"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: priorityColors[p] }} />
                        {priorityLabels[p]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Category</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {localCategories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategoryId(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 flex items-center gap-1.5 ${
                          categoryId === c.id
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border/50 text-muted-foreground"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.name}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowNewCategory((v) => !v)}
                      className="px-3 py-1.5 rounded-lg text-xs border border-dashed border-border/60 text-muted-foreground transition-all duration-150 hover:border-primary/50 hover:text-foreground"
                    >
                      + New
                    </button>
                  </div>

                  <AnimatePresence>
                    {showNewCategory && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 mt-1">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              placeholder="Category name"
                              className="flex-1 h-9 px-3 rounded-lg border border-border/60 bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                            />
                            <button
                              onClick={handleAddCategory}
                              className="h-9 px-3 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            {COLOR_PRESETS.map((c) => (
                              <button
                                key={c}
                                onClick={() => setNewCategoryColor(c)}
                                className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity duration-150"
                                style={{ opacity: newCategoryColor === c ? 1 : 0.5 }}
                              >
                                <span
                                  className="w-5 h-5 rounded-full"
                                  style={{ backgroundColor: c, boxShadow: newCategoryColor === c ? `0 0 0 2.5px var(--background), 0 0 0 4.5px ${c}` : "none" }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      if (!e.target.value) setDueTime("");
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>

                <AnimatePresence>
                  {dueDate && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label className="text-xs font-medium text-muted-foreground block mb-2">Due time</label>
                      <input
                        type="time"
                        value={dueTime}
                        onChange={(e) => setDueTime(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">Remind me</label>
                    <button
                      onClick={() => setRemindEnabled((v) => !v)}
                      className={`w-10 h-5.5 rounded-full transition-colors duration-200 relative ${
                        remindEnabled ? "bg-primary" : "bg-secondary"
                      }`}
                    >
                      <motion.span
                        layout
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm ${
                          remindEnabled ? "left-[calc(100%-1.1rem)]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  <AnimatePresence>
                    {remindEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden space-y-3"
                      >
                        <input
                          type="datetime-local"
                          value={remindAt}
                          onChange={(e) => setRemindAt(e.target.value)}
                          className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                        />
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-2">Recurrence</label>
                          <div className="flex gap-1.5">
                            {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                              <button
                                key={r}
                                onClick={() => setRecurring(r)}
                                className={`flex-1 h-8 rounded-lg text-[11px] font-medium border transition-all duration-150 capitalize ${
                                  recurring === r
                                    ? "border-primary bg-primary/5 text-foreground"
                                    : "border-border/50 text-muted-foreground"
                                }`}
                              >
                                {r === "none" ? "Once" : r}
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!title.trim() || !categoryId || saving}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? "Creating..." : "Create Task"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
