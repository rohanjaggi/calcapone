"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Bell,
  Plus,
  X,
  ChevronRight,
  Inbox,
  Circle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toggleItemStatus, addItem, addCategory, removeItem } from "@/app/actions";
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

const COLOR_PRESETS = [
  "#E74C3C", "#E67E22", "#F1C40F", "#2ECC71", "#1ABC9C",
  "#3498DB", "#9B59B6", "#E84393", "#00B894", "#6C5CE7",
  "#FDA7DF", "#FD9644", "#778CA3", "#A55EEA", "#26DE81",
];

const statusIcon = {
  pending: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
};

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

function ItemRow({
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
  const Icon = statusIcon[item.status];
  const isDone = item.status === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
      className={`flex items-center gap-3 px-4 py-3 ${
        index > 0 ? "border-t border-border/30" : ""
      } ${isDone ? "opacity-40" : ""}`}
    >
      <button
        onClick={() => onToggle(item.id, item.status)}
        className="shrink-0 active:scale-90 transition-transform duration-150"
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

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug truncate ${
            isDone ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {item.remindAt && !isDone && (
            <span className="inline-flex items-center gap-0.5 mr-1.5 text-muted-foreground/70">
              <Bell className="w-3 h-3" />
              {item.dueTime && (
                <span className="text-[11px]">{formatTime(item.dueTime)}</span>
              )}
            </span>
          )}
          {item.title}
        </p>
      </div>

      {isDone && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          onClick={() => onDelete(item.id)}
          className="shrink-0 text-muted-foreground/40 hover:text-destructive active:scale-90 transition-all duration-150"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </motion.button>
      )}
    </motion.div>
  );
}

function CategoryCard({
  category,
  items,
  cardIndex,
  onToggle,
  onDelete,
}: {
  category: Category;
  items: Item[];
  cardIndex: number;
  onToggle: (id: string, current: Item["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const activeItems = items.filter((i) => i.status !== "done");
  const doneItems = items.filter((i) => i.status === "done");
  const sorted = [...activeItems, ...doneItems];
  const count = items.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: cardIndex * 0.08 + 0.1 }}
      className="bg-card border border-border/50 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden"
    >
      {/* Card header with count + link */}
      <Link
        href={`/todos/${category.id}`}
        className="flex items-center gap-2 px-4 py-3 border-b border-border/30 group"
      >
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
        />
        <span className="text-sm font-medium text-foreground flex-1">{category.name}</span>
        <span className="text-[11px] text-muted-foreground">
          {count === 1 ? "1 task" : `${count} tasks`}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform duration-150" />
      </Link>

      {sorted.length === 0 ? (
        <div className="px-4 py-4 text-[13px] text-muted-foreground/50 italic">
          No tasks
        </div>
      ) : (
        <div>
          {sorted.map((item, i) => (
            <ItemRow key={item.id} item={item} index={i} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CreateItemSheet({
  open,
  onClose,
  categories,
  defaultCategoryId,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  defaultCategoryId?: string;
}) {
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
    // reset
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
                {/* Title */}
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                  autoFocus
                  className="w-full h-12 px-4 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />

                {/* Description */}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-border/60 bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all resize-none"
                />

                {/* Priority */}
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

                {/* Category */}
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

                {/* Due date */}
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

                {/* Due time — only shown if due date set */}
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

                {/* Remind me */}
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
  items: Item[];
  categories: Category[];
};

export function TodosClient({ items: initialItems, categories }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);

  // Group items by category
  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((item) => item.category.id === cat.id),
  }));

  // Include items that may have categories not listed (edge case)
  const listedCatIds = new Set(categories.map((c) => c.id));
  const orphaned = items.filter((item) => !listedCatIds.has(item.category.id));

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
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase mb-0.5">
          Manage
        </p>
        <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground tracking-tight">
          Tasks
        </h1>
      </motion.header>

      {/* Category cards */}
      <div className="px-5 mt-4 space-y-4">
        {categories.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary/80 flex items-center justify-center mb-4">
              <Inbox className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-serif text-lg text-foreground">No categories yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tap + to create your first task and category
            </p>
          </motion.div>
        ) : (
          grouped.map(({ category, items: catItems }, i) => (
            <CategoryCard
              key={category.id}
              category={category}
              items={catItems}
              cardIndex={i}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* Orphaned items (no matching category) */}
        {orphaned.length > 0 && (
          <CategoryCard
            category={{ id: "__none__", name: "Uncategorized", color: "#A8A29E" }}
            items={orphaned}
            cardIndex={grouped.length}
            onToggle={handleToggle}
            onDelete={handleDelete}
          />
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
        categories={categories}
      />
      <NavBar />
    </main>
  );
}
