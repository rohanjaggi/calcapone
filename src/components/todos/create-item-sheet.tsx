"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { addItem, addCategory } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import { Switch } from "@/components/ui/switch";
import {
  BottomSheet,
  SheetFooter,
  CategoryChips,
  Field,
  PriorityPicker,
  fieldClass,
  optionClass,
  submitClass,
  textAreaClass,
  titleInputClass,
} from "@/components/ui/bottom-sheet";
import { LIST_PALETTE, LIST_PALETTE_NAMES } from "@/lib/list-colors";
import { haptic } from "@/lib/telegram-webapp";
import type { Category } from "@/lib/types";
import type { Priority } from "@/generated/prisma/enums";

const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
} as const;

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  defaultCategoryId?: string;
  /** Pre-fills the due date, e.g. with the day picked on Home, so the task lands on that day. */
  defaultDueDate?: string;
};

export function CreateItemSheet({ open, onClose, categories, defaultCategoryId, defaultDueDate }: Props) {
  const router = useRouter();
  const { notify } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId ?? categories[0]?.id ?? "");
  const [dueDate, setDueDate] = useState(defaultDueDate ?? "");
  const [dueTime, setDueTime] = useState("");
  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [recurring, setRecurring] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState<string>(LIST_PALETTE[0]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localCategories, setLocalCategories] = useState(categories);

  // Adjust state during render rather than in an effect — see React's "adjusting state when
  // a prop changes". Also re-points the selection when the chosen category disappears.
  const [syncedCategories, setSyncedCategories] = useState(categories);
  if (categories !== syncedCategories) {
    setSyncedCategories(categories);
    setLocalCategories(categories);
    if (categoryId && !categories.find((c) => c.id === categoryId)) {
      setCategoryId(categories[0]?.id ?? "");
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const cat = await addCategory(newCategoryName.trim(), newCategoryColor);
      const newCat = { id: cat.id, name: cat.name, color: cat.color ?? newCategoryColor };
      setLocalCategories((prev) => [...prev, newCat]);
      setCategoryId(newCat.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch {
      notify("Couldn't create that list — please try again.");
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !categoryId) return;
    setSaving(true);
    try {
      const result = await addItem({
        title: title.trim(),
        categoryId,
        priority,
        description: description.trim() || null,
        dueDate: dueDate || null,
        dueTime: dueTime || null,
        remindAt: remindEnabled && remindAt ? remindAt : null,
        // The picker only shows under "Remind me", so a hidden choice must not stick.
        repeat: remindEnabled ? recurring : "none",
      });
      if (result.error) {
        notify(result.error);
        return;
      }
    } catch {
      notify("Couldn't save that task — please try again.");
      return;
    } finally {
      setSaving(false);
    }
    haptic("success");
    setTitle("");
    setDescription("");
    setPriority("medium");
    setCategoryId(defaultCategoryId ?? localCategories[0]?.id ?? "");
    setDueDate(defaultDueDate ?? "");
    setDueTime("");
    setRemindEnabled(false);
    setRemindAt("");
    setRecurring("none");
    onClose();
    router.refresh();
  };

  return (
    <BottomSheet open={open} title="New task" onClose={onClose}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="What needs doing?"
        aria-label="Task title"
        autoFocus
        enterKeyHint="done"
        className={titleInputClass}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Notes (optional)"
        aria-label="Notes"
        rows={2}
        className={textAreaClass}
      />
      <PriorityPicker value={priority} onChange={setPriority} />
      <div>
        <CategoryChips categories={localCategories} value={categoryId} onChange={setCategoryId}>
          <button
            type="button"
            aria-expanded={showNewCategory}
            onClick={() => setShowNewCategory((v) => !v)}
            className={`${optionClass(false)} px-3.5 border-dashed`}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New list
          </button>
        </CategoryChips>

        <AnimatePresence initial={false}>
          {showNewCategory && (
            <motion.div {...reveal} className="overflow-hidden">
              <div className="pt-3 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                    placeholder="List name"
                    aria-label="New list name"
                    className={`${fieldClass} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={!newCategoryName.trim()}
                    className="h-12 px-5 rounded-xl bg-secondary text-foreground text-[15px] font-medium disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="List colour">
                  {LIST_PALETTE.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={newCategoryColor === c}
                      aria-label={LIST_PALETTE_NAMES[i]}
                      onClick={() => setNewCategoryColor(c)}
                      className="h-11 flex items-center justify-center"
                    >
                      <span
                        className="w-7 h-7 rounded-full transition-[box-shadow] duration-200"
                        style={{
                          backgroundColor: c,
                          boxShadow: newCategoryColor === c ? `0 0 0 3px var(--raised), 0 0 0 5px ${c}` : "none",
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Field label="Due date">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            if (!e.target.value) setDueTime("");
          }}
          className={fieldClass}
        />
      </Field>

      <AnimatePresence initial={false}>
        {dueDate && (
          <motion.div {...reveal} className="overflow-hidden">
            <Field label="Due time">
              <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={fieldClass} />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <div className="flex items-center justify-between min-h-11">
          <span id="remind-me-label" className="text-[15px] text-foreground">
            Remind me
          </span>
          <Switch checked={remindEnabled} onChange={setRemindEnabled} labelledBy="remind-me-label" />
        </div>

        <AnimatePresence initial={false}>
          {remindEnabled && (
            <motion.div {...reveal} className="overflow-hidden">
              <div className="pt-3 space-y-4">
                <input
                  type="datetime-local"
                  value={remindAt}
                  onChange={(e) => setRemindAt(e.target.value)}
                  aria-label="Remind me at"
                  className={fieldClass}
                />
                <div role="group" aria-label="Repeat">
                  <span className="text-[13px] font-medium text-muted-foreground block mb-2">Repeat</span>
                  <div className="grid grid-cols-4 gap-2">
                    {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={recurring === r}
                        onClick={() => setRecurring(r)}
                        className={`${optionClass(recurring === r)} capitalize`}
                      >
                        {r === "none" ? "Once" : r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SheetFooter>
        {/* "Remind me" on with no time would save a task that never reminds. */}
        <button onClick={handleSubmit} disabled={!title.trim() || !categoryId || saving || (remindEnabled && !remindAt)} className={submitClass}>
          {saving ? "Adding…" : "Add task"}
        </button>
      </SheetFooter>
    </BottomSheet>
  );
}
