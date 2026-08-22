import type { Priority, ItemStatus, RecurringType } from "@/generated/prisma/enums";

/**
 * The shared vocabulary between a tool call and everything that happens after it.
 *
 * A tool used to return a bare string, which was enough when the string was simply printed.
 * It no longer is: the agent loop needs to know whether the text is a receipt for the user
 * or context for the model, `/undo` needs a way to reverse the change, `/done 3` needs the
 * ids behind a numbered list, and an ambiguous match needs to become buttons rather than a
 * shrug. All four are properties of the *call*, so they travel with its result.
 */

/**
 * Item fields an undo can put back.
 *
 * Dates are ISO strings rather than `Date`s because this is stored in a JSON column —
 * `JSON.parse` would otherwise hand back a string where a `Date` is expected and the
 * restore would write garbage.
 */
export type ItemSnapshot = {
  title?: string;
  description?: string | null;
  status?: ItemStatus;
  priority?: Priority;
  categoryId?: string;
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: string | null;
  recurring?: RecurringType;
  recurrenceRule?: string | null;
  recurrenceEnd?: string | null;
  googleEventId?: string | null;
  parentId?: string | null;
  notificationStage?: number;
  /** Which repeating run the item belongs to — dropping it orphans a restored occurrence. */
  seriesId?: string | null;
};

export type EventSnapshot = {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
};

/**
 * The compensating action for one mutation — what to do to put the world back.
 *
 * `recreate_item` and `recreate_event` carry the whole prior row rather than a reference,
 * because by the time an undo runs the original is gone. `recreate_item` reuses the original
 * id so anything pointing at it (a numbered list, a reminder's buttons) still resolves.
 */
export type UndoOp =
  | { op: "delete_item"; itemId: string }
  | { op: "restore_item"; itemId: string; fields: ItemSnapshot }
  | { op: "recreate_item"; itemId: string; data: ItemSnapshot & { title: string; categoryId: string } }
  | { op: "delete_event"; calendarId: string; eventId: string }
  | { op: "patch_event"; calendarId: string; eventId: string; fields: Partial<EventSnapshot> }
  /** Recreates the Google event, then (if `item` is set) the in-app row pointing at the new event id. */
  | { op: "recreate_event"; calendarId: string; event: EventSnapshot; item?: ItemSnapshot & { id: string; title: string; categoryId: string } }
  | { op: "delete_category"; categoryId: string }
  /** Applied in order, best-effort: one user-visible action can be several writes (decomposing a task). */
  | { op: "sequence"; ops: UndoOp[] }
  | { op: "noop" };

export type UndoRecord = {
  /** Machine name of the action, e.g. "create_item". Used for grouping, never shown raw. */
  kind: string;
  /** One line, already HTML-escaped, e.g. "Created <b>Buy milk</b>". Shown as "Undid: …". */
  summary: string;
  inverse: UndoOp;
};

export type ToolOutcome = {
  /** What the call produced. Null when there is nothing to say. */
  text: string | null;
  /**
   * Does `text` go to the user, or only to the model?
   *
   * Mutations echo: the receipt *is* the confirmation, and the user should see it even if
   * the model then adds a sentence. Reads don't: their output is raw material the model is
   * about to summarise, and printing both gives you the dump and the summary.
   */
  echo: boolean;
  /** The call did not do what was asked. Kept out of the receipt stream, fed to the model so it can retry. */
  failed?: boolean;
  /** Set when this call changed something reversible. */
  undo?: UndoRecord;
  /** Items `text` enumerated, in the order they were printed — the numbering `/done 3` uses. */
  itemIds?: string[];
  /** The call matched several items; the caller should offer these as buttons. */
  choose?: {
    tool: string;
    args: Record<string, unknown>;
    candidates: Array<{ id: string; title: string }>;
  };
};

/** A read-only result: shown to the model, not echoed to the user. */
export function readOutcome(text: string | null, itemIds?: string[]): ToolOutcome {
  return { text, echo: false, ...(itemIds ? { itemIds } : {}) };
}

/** A result the user should see verbatim (receipts, errors, "couldn't find that"). */
export function echoOutcome(text: string | null, undo?: UndoRecord): ToolOutcome {
  return { text, echo: true, ...(undo ? { undo } : {}) };
}
