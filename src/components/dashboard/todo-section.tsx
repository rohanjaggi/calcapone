"use client";

import { motion } from "motion/react";
import { ArrowRight, Circle, Loader2, CheckCircle2, Bell } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toggleItemStatus } from "@/app/actions";
import type { Item } from "@/lib/mock-data";

const priorityColors: Record<string, string> = {
  high: "#B85C5C",
  medium: "#92785C",
  low: "#A8A29E",
};

const statusIcon = {
  pending: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
};

function ItemRow({ item, index, onToggle }: { item: Item; index: number; onToggle: (id: string) => void }) {
  const Icon = statusIcon[item.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.05 + 0.5 }}
      className={`flex items-start gap-3 px-4 py-3 ${index > 0 ? "border-t border-border/40" : ""} ${item.status === "done" ? "opacity-40" : ""}`}
    >
      <button onClick={() => onToggle(item.id)} className="mt-0.5 shrink-0 active:scale-90 transition-transform duration-150">
        <Icon className={`w-[18px] h-[18px] ${item.status === "done" ? "text-sage" : item.status === "in_progress" ? "text-primary animate-spin [animation-duration:3s]" : "text-muted-foreground/50"}`} />
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.category.color }} />
            <span className="text-[11px] text-muted-foreground">{item.category.name}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: priorityColors[item.priority] }} />
            <span className="text-[11px] text-muted-foreground capitalize">{item.priority}</span>
          </span>
          {item.remindAt && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Bell className="w-2.5 h-2.5" />
              {new Date(item.remindAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
            </span>
          )}
          {item.dueDate && !item.remindAt && (
            <span className="text-[11px] text-muted-foreground">
              Due {item.dueDate}{item.dueTime ? ` ${item.dueTime}` : ""}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function ItemsSection({ items }: { items: Item[] }) {
  const [localItems, setLocalItems] = useState(items);
  const router = useRouter();

  const handleToggle = async (id: string) => {
    const item = localItems.find((i) => i.id === id);
    if (!item) return;
    const newStatus = item.status === "done" ? "pending" : "done";
    setLocalItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus as Item["status"] } : i)));
    await toggleItemStatus(id, newStatus as "pending" | "done");
    router.refresh();
  };

  const activeItems = localItems.filter((i) => i.status !== "done");
  const doneItems = localItems.filter((i) => i.status === "done");
  const sorted = [...activeItems, ...doneItems].slice(0, 5);

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.45 }} className="mt-7 px-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-xl font-normal text-foreground">Tasks</h2>
        <Link href="/todos" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {sorted.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-xl p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          <p className="text-sm text-muted-foreground">No tasks yet</p>
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          {sorted.map((item, i) => <ItemRow key={item.id} item={item} index={i} onToggle={handleToggle} />)}
        </div>
      )}
    </motion.section>
  );
}
