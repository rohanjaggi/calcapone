"use client";

import { useState } from "react";
import { BottomSheet, Field, SheetFooter, fieldClass, submitClass } from "@/components/ui/bottom-sheet";
import type { Category } from "@/lib/types";

/**
 * Rename or delete a list. A sheet rather than a floating menu: the old menu was pinned to
 * the viewport, drifted away from its button on scroll and never closed on an outside tap.
 * Deleting still asks (the caller's confirm), because it takes every task in the list with it.
 */
export function ListActionsSheet({
  category,
  onClose,
  onRename,
  onDelete,
}: {
  category: Category | null;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  return (
    <BottomSheet open={!!category} title={category?.name ?? "List"} onClose={onClose}>
      {category && <Form key={category.id} category={category} onClose={onClose} onRename={onRename} onDelete={onDelete} />}
    </BottomSheet>
  );
}

function Form({
  category,
  onClose,
  onRename,
  onDelete,
}: {
  category: Category;
  onClose: () => void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(category.name);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== "" && name.trim() !== category.name;

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    await onRename(category.id, name.trim());
    setSaving(false);
    onClose();
  };

  return (
    <>
      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className={fieldClass}
        />
      </Field>
      <SheetFooter>
        <button onClick={save} disabled={!changed || saving} className={submitClass}>
          {saving ? "Saving…" : "Rename list"}
        </button>
        <button
          type="button"
          onClick={async () => {
            onClose();
            await onDelete(category.id);
          }}
          className="w-full min-h-11 rounded-2xl text-[15px] font-medium text-alarm active:bg-alarm/10 transition-colors"
        >
          Delete list…
        </button>
      </SheetFooter>
    </>
  );
}
