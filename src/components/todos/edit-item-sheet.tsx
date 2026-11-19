"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { editItem } from "@/app/actions";
import { useToast } from "@/components/ui/toast";
import {
  BottomSheet,
  SheetFooter,
  CategoryChips,
  Field,
  PriorityPicker,
  fieldClass,
  submitClass,
  textAreaClass,
  titleInputClass,
} from "@/components/ui/bottom-sheet";
import type { Category, Item } from "@/lib/types";
import type { Priority } from "@/generated/prisma/enums";

/** The one edit form for a task, used by the board, a category page and the calendar. */
export function EditItemSheet({
  item,
  categories,
  onClose,
  onDelete,
}: {
  item: Item | null;
  /** The category picker shows only when there is more than one to pick from. */
  categories: Category[];
  onClose: () => void;
  /** When given, the sheet offers "Delete task" — the path for anyone who never finds the swipe. */
  onDelete?: (id: string) => void;
}) {
  return (
    <BottomSheet open={!!item} title="Edit task" onClose={onClose}>
      {item && (
        <EditForm
          key={item.id}
          item={item}
          categories={categories}
          onDone={onClose}
          onDelete={
            onDelete &&
            (() => {
              onClose();
              onDelete(item.id);
            })
          }
        />
      )}
    </BottomSheet>
  );
}

function EditForm({
  item,
  categories,
  onDone,
  onDelete,
}: {
  item: Item;
  categories: Category[];
  onDone: () => void;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [categoryId, setCategoryId] = useState(item.category.id);
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [dueTime, setDueTime] = useState(item.dueTime ?? "");
  const [remindAt, setRemindAt] = useState(item.remindLocal ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const result = await editItem(item.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        categoryId: categoryId !== item.category.id ? categoryId : undefined,
        dueDate: dueDate || null,
        // A time means nothing without a date, so clearing the date clears it too.
        dueTime: dueDate && dueTime ? dueTime : null,
        // Sent only when changed, so saving a title edit never re-checks an old reminder time.
        ...(remindAt !== (item.remindLocal ?? "") ? { remindAt: remindAt || null } : {}),
      });
      if (result.error) {
        notify(result.error);
        return;
      }
      onDone();
      router.refresh();
    } catch {
      notify("Couldn't save those changes — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        aria-label="Task title"
        autoFocus
        className={titleInputClass}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        aria-label="Description"
        rows={2}
        className={textAreaClass}
      />
      <PriorityPicker value={priority} onChange={setPriority} />
      {categories.length > 1 && <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} />}
      <Field label="Due date">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={fieldClass} />
      </Field>
      {dueDate && (
        <Field label="Due time">
          <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={fieldClass} />
        </Field>
      )}
      <Field label="Remind me at">
        <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={fieldClass} />
      </Field>
      <SheetFooter>
        <button onClick={save} disabled={!title.trim() || saving} className={submitClass}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="w-full min-h-11 rounded-2xl text-[15px] font-medium text-alarm active:bg-alarm/10 transition-colors"
          >
            Delete task
          </button>
        )}
      </SheetFooter>
    </>
  );
}
