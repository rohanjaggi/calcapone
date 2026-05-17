"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Bell, Plus, ChevronRight, Inbox, Trash2 } from "lucide-react";
import Link from "next/link";
import { toggleItemStatus, removeItem } from "@/app/actions";
import { statusIcon, formatTime } from "@/lib/task-constants";
import { CreateItemSheet } from "@/components/todos/create-item-sheet";
import type { Item, Category } from "@/lib/mock-data";

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

type Props = {
  items: Item[];
  categories: Category[];
};

export function TodosClient({ items: initialItems, categories }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [showCreate, setShowCreate] = useState(false);

  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((item) => item.category.id === cat.id),
  }));

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
    </main>
  );
}
