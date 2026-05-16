"use client";

import { motion } from "motion/react";
import { ArrowRight, Circle, Loader2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { Todo } from "@/lib/mock-data";

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

function TodoItem({
  todo,
  index,
  onToggle,
}: {
  todo: Todo;
  index: number;
  onToggle: (id: string) => void;
}) {
  const Icon = statusIcon[todo.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1],
        delay: index * 0.05 + 0.5,
      }}
      className={`flex items-start gap-3 px-4 py-3 ${
        index > 0 ? "border-t border-border/40" : ""
      } ${todo.status === "done" ? "opacity-40" : ""}`}
    >
      <button
        onClick={() => onToggle(todo.id)}
        className="mt-0.5 shrink-0 active:scale-90 transition-transform duration-150"
      >
        <Icon
          className={`w-[18px] h-[18px] ${
            todo.status === "done"
              ? "text-sage"
              : todo.status === "in_progress"
              ? "text-primary animate-spin [animation-duration:3s]"
              : "text-muted-foreground/50"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            todo.status === "done"
              ? "line-through text-muted-foreground"
              : "text-foreground"
          }`}
        >
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {todo.category && (
            <span className="flex items-center gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: todo.category.color }}
              />
              <span className="text-[11px] text-muted-foreground">
                {todo.category.name}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: priorityColors[todo.priority] }}
            />
            <span className="text-[11px] text-muted-foreground capitalize">
              {todo.priority}
            </span>
          </span>
          {todo.dueDate && (
            <span className="text-[11px] text-muted-foreground">
              Due{" "}
              {new Date(todo.dueDate).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function TodoSection({ todos }: { todos: Todo[] }) {
  const [items, setItems] = useState(todos);

  const handleToggle = (id: string) => {
    setItems((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "done" ? "pending" : "done" as const }
          : t
      )
    );
  };

  const activeTodos = items.filter((t) => t.status !== "done");
  const doneTodos = items.filter((t) => t.status === "done");
  const sorted = [...activeTodos, ...doneTodos];

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="mt-7 px-5"
    >
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-xl font-normal text-foreground">
          Tasks
        </h2>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          See all
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        {sorted.map((todo, i) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            index={i}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </motion.section>
  );
}
