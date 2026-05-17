"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Bell, Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { toggleItemStatus, removeItem } from "@/app/actions";
import { statusIcon, formatTime, priorityColors } from "@/lib/task-constants";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import type { Item, Category } from "@/lib/mock-data";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
        categories={[category]}
        defaultCategoryId={category.id}
      />
    </main>
  );
}
