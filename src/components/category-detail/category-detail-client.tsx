"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Bell,
  Circle,
  CheckCircle2,
  Loader2,
  Trash2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import Link from "next/link";
import { toggleItemStatus, removeItem, addItem, addCategory } from "@/app/actions";
import { NavBar } from "@/components/nav-bar";
import type { Item } from "@/lib/mock-data";
import type { Priority } from "@/generated/prisma/enums";

const priorityColors: Record<string, string> = {
  high: "#B85C5C",
  medium: "#92785C",
  low: "#A8A29E",
};

const priorityLabels: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

type Category = { id: string; name: string; color: string };

const statusIcon = {
  pending: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function ItemCard({
  item,
  index,
  onToggle,
  onDelete,
}: {
  item: Item;
  index: number;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = statusIcon[item.status];
  const isDone = item.status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.05 }}
      className={`${index > 0 ? "border-t border-border/30" : ""} ${isDone ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(item.id, item.status)}
          className="mt-0.5 shrink-0 active:scale-90 transition-transform duration-150"
        >
          <Icon
            className={`w-[18px] h-[18px] ${
              isDone
                ? "text-sage"
                : item.status === "in_progress"
                ? "text-primary animate-spin [animation-duration:3s]"
                : "text-muted-foreground/40"
            }`}
          />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full text-left"
          >
            <p
              className={`text-sm leading-snug ${
                isDone ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {item.title}
            </p>

            {/* Preview description when collapsed */}
            {item.description && !expanded && (
              <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
                {item.description}
              </p>
            )}
          </button>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {/* Priority */}
            <span className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: priorityColors[item.priority] }}
              />
              <span className="text-[11px] text-muted-foreground capitalize">{item.priority}</span>
            </span>

            {/* Due date */}
            {item.dueDate && (
              <span className="text-[11px] text-muted-foreground">
                {formatDate(item.dueDate)}
              </span>
            )}

            {/* Due time */}
            {item.dueTime && (
              <span className="text-[11px] text-muted-foreground">
                {formatTime(item.dueTime)}
              </span>
            )}

            {/* Recurring */}
            {item.recurring !== "none" && (
              <span className="text-[11px] text-muted-foreground capitalize">
                {item.recurring}
              </span>
            )}

            {/* Reminder badge */}
            {item.remindAt && !isDone && (
              <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Bell className="w-3 h-3" />
                Reminder
              </span>
            )}
          </div>

          {/* Expanded full description */}
          <AnimatePresence>
            {expanded && item.description && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Expand toggle when description exists */}
          {item.description && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-0.5 mt-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  More
                </>
              )}
            </button>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => onDelete(item.id)}
          className="mt-0.5 shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors active:scale-90"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function CreateItemSheet({
  open,
  onClose,
  category,
  allCategories,
}: {
  open: boolean;
  onClose: () => void;
  category: Category;
  allCategories: Category[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [categoryId, setCategoryId] = useState<string>(category.id);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#92785C");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localCategories, setLocalCategories] = useState(allCategories);

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
    setCategoryId(category.id);
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
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] max-h-[90dvh] flex flex-col"
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
                        <div className="flex gap-2 mt-1">
                          <input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Category name"
                            className="flex-1 h-9 px-3 rounded-lg border border-border/60 bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                          />
                          <input
                            type="color"
                            value={newCategoryColor}
                            onChange={(e) => setNewCategoryColor(e.target.value)}
                            className="w-9 h-9 rounded-lg border border-border/60 bg-background cursor-pointer p-1"
                          />
                          <button
                            onClick={handleAddCategory}
                            className="h-9 px-3 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                          >
                            Add
                          </button>
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

type Props = {
  category: Category;
  items: Item[];
};

export function CategoryDetailClient({ category, items: initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);

  const activeItems = items.filter((i) => i.status !== "done");
  const doneItems = items.filter((i) => i.status === "done");
  const sorted = [...activeItems, ...doneItems];

  const handleToggle = async (id: string, current: Item["status"]) => {
    const newStatus = current === "done" ? "pending" : "done";
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus as Item["status"] } : item))
    );
    await toggleItemStatus(id, newStatus as "pending" | "done");
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await removeItem(id);
    router.refresh();
  };

  return (
    <main className="safe-bottom pb-8">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <Link
          href="/todos"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>

        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: category.color }}
          />
          <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground tracking-tight">
            {category.name}
          </h1>
        </div>
      </motion.header>

      {/* Item list */}
      <div className="px-5 mt-4">
        {sorted.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 opacity-20"
              style={{ backgroundColor: category.color }}
            >
              <span className="text-2xl font-serif text-white">
                {category.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="font-serif text-lg text-foreground">No tasks yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap + to add a task to {category.name}
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
          >
            <AnimatePresence mode="popLayout">
              {sorted.map((item, i) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  index={i}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* FAB */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] right-5 w-13 h-13 rounded-full bg-primary text-primary-foreground shadow-[0_4px_16px_rgba(146,120,92,0.35)] flex items-center justify-center active:scale-90 transition-transform z-40"
      >
        <Plus className="w-5 h-5" />
      </motion.button>

      <CreateItemSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        category={category}
        allCategories={[category]}
      />
      <NavBar />
    </main>
  );
}
