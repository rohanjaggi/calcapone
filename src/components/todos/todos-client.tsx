"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Circle,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  Trash2,
  ListFilter,
  Inbox,
} from "lucide-react";
import { toggleTodoStatus, addTodo, removeTodo } from "@/app/actions";
import { NavBar } from "@/components/nav-bar";
import type { Todo } from "@/lib/mock-data";
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

const statusIcon = {
  pending: Circle,
  in_progress: Loader2,
  done: CheckCircle2,
};

const filters = ["all", "pending", "in_progress", "done"] as const;
const filterLabels: Record<string, string> = {
  all: "All",
  pending: "Pending",
  in_progress: "Active",
  done: "Done",
};

type Category = { id: string; name: string; color: string };

function CreateTodoSheet({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await addTodo({
      title: title.trim(),
      priority,
      categoryId,
      dueDate: dueDate || null,
    });
    setSaving(false);
    setTitle("");
    setPriority("medium");
    setCategoryId(null);
    setDueDate("");
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
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border-t border-border/50 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
          >
            <div className="w-10 h-1 rounded-full bg-border mx-auto mt-3" />
            <div className="px-5 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
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

                {categories.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">Category</label>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setCategoryId(null)}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-all duration-150 ${
                          categoryId === null
                            ? "border-primary bg-primary/5 text-foreground font-medium"
                            : "border-border/50 text-muted-foreground"
                        }`}
                      >
                        None
                      </button>
                      {categories.map((c) => (
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
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-2">Due date</label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!title.trim() || saving}
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

function TodoRow({
  todo,
  index,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  index: number;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const Icon = statusIcon[todo.status];
  const [swiped, setSwiped] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 + 0.15 }}
      className={`flex items-start gap-3 px-4 py-3.5 ${
        index > 0 ? "border-t border-border/30" : ""
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
              : "text-muted-foreground/40"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${todo.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {todo.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {todo.category && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: todo.category.color }} />
              <span className="text-[11px] text-muted-foreground">{todo.category.name}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: priorityColors[todo.priority] }} />
            <span className="text-[11px] text-muted-foreground capitalize">{todo.priority}</span>
          </span>
          {todo.dueDate && (
            <span className="text-[11px] text-muted-foreground">
              {new Date(todo.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(todo.id)}
        className="mt-1 shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

type Props = {
  todos: Todo[];
  categories: Category[];
};

export function TodosClient({ todos, categories }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(todos);
  const [filter, setFilter] = useState<(typeof filters)[number]>("all");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = filter === "all" ? items : items.filter((t) => t.status === filter);
  const activeTodos = filtered.filter((t) => t.status !== "done");
  const doneTodos = filtered.filter((t) => t.status === "done");
  const sorted = [...activeTodos, ...doneTodos];

  const counts = {
    all: items.length,
    pending: items.filter((t) => t.status === "pending").length,
    in_progress: items.filter((t) => t.status === "in_progress").length,
    done: items.filter((t) => t.status === "done").length,
  };

  const handleToggle = async (id: string) => {
    const todo = items.find((t) => t.id === id);
    if (!todo) return;
    const newStatus = todo.status === "done" ? "pending" : "done";
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus as Todo["status"] } : t)));
    await toggleTodoStatus(id, newStatus as "pending" | "done");
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    await removeTodo(id);
    router.refresh();
  };

  return (
    <main className="safe-bottom pb-8">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="px-5 pt-6 pb-2"
      >
        <div className="flex items-center gap-2 mb-0.5">
          <ListFilter className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-muted-foreground text-xs font-medium tracking-[0.15em] uppercase">
            Manage
          </p>
        </div>
        <h1 className="font-serif text-[2rem] leading-tight font-light text-foreground tracking-tight">
          Tasks
        </h1>
      </motion.header>

      {/* Filter tabs */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
        className="px-5 mt-4"
      >
        <div className="flex gap-1.5 p-1 bg-secondary/60 rounded-xl">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`relative flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                filter === f ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {filter === f && (
                <motion.div
                  layoutId="filter-pill"
                  className="absolute inset-0 bg-card rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">
                {filterLabels[f]}
                {counts[f] > 0 && (
                  <span className="ml-1 text-muted-foreground/60">{counts[f]}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Todo list */}
      <div className="px-5 mt-4">
        {sorted.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            className="flex flex-col items-center py-16 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary/80 flex items-center justify-center mb-4">
              <Inbox className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-serif text-lg text-foreground">
              {filter === "all" ? "No tasks yet" : `No ${filterLabels[filter].toLowerCase()} tasks`}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter === "all" ? "Tap + to create your first task" : "Try a different filter"}
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
              {sorted.map((todo, i) => (
                <TodoRow key={todo.id} todo={todo} index={i} onToggle={handleToggle} onDelete={handleDelete} />
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

      <CreateTodoSheet open={showCreate} onClose={() => setShowCreate(false)} categories={categories} />
      <NavBar />
    </main>
  );
}
