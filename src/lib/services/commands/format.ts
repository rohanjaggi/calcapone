import { esc, b } from "@/lib/services/telegram";
import {
  todayInTz,
  formatDateInTz,
  formatHHmmInTz,
  startOfDayInTz,
  shortWeekdayInTz,
} from "@/lib/tz";

/**
 * One place where a list of items becomes text.
 *
 * `/list`, `/search`, `/due` and the model's `list_items` tool all print the same rows, and
 * each used to carry its own copy of the format — which is how they drifted apart, and how
 * every one of them inherited `listItems`' `priority desc, createdAt desc` order and showed
 * the user a pile with no relation to when anything was actually due.
 *
 * Structural types rather than the Prisma row: these are pure functions over the handful of
 * fields that decide order and text, so tests (and any future caller) can pass a plain object.
 */
export type SortableItem = {
  dueDate?: string | null;
  dueTime?: string | null;
  remindAt?: Date | null;
  priority?: string | null;
  createdAt?: Date | null;
};

export type RenderableItem = SortableItem & {
  id: string;
  title: string;
  status?: string | null;
  /**
   * Search results are projections, not rows: they carry `type: "reminder"` instead of a live
   * `remindAt`. Honouring both is what lets `/search` share this renderer at all.
   */
  type?: string | null;
};

/** High first — the tie-break inside a due date, mirroring Prisma's `priority: "desc"`. */
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/**
 * The moment an item is asking for attention, as a lexicographically sortable
 * "YYYY-MM-DDTHH:mm" — or null when it isn't asking for one.
 *
 * A reminder is keyed on `remindAt` converted to the user's own day, not UTC's: a 20:00Z ping
 * belongs to tomorrow in Singapore, and sorting it under today would put it above tasks that
 * genuinely come first. Where both are set `remindAt` wins, matching how `/today` and `/week`
 * already treat a reminder as the thing that fires rather than a dated task.
 *
 * An untimed item takes 00:00, so "sometime on the 21st" sorts above "09:00 on the 21st" —
 * the all-day-first convention every calendar uses.
 */
export function dueKeyOf(item: SortableItem, tz: string): string | null {
  if (item.remindAt) {
    return `${formatDateInTz(item.remindAt, tz)}T${formatHHmmInTz(item.remindAt, tz)}`;
  }
  if (item.dueDate) return `${item.dueDate}T${item.dueTime ?? "00:00"}`;
  return null;
}

/** The calendar day an item belongs to in `tz`, or null when it has no date at all. */
function dueDayOf(item: SortableItem, tz: string): string | null {
  return dueKeyOf(item, tz)?.slice(0, 10) ?? null;
}

/**
 * Soonest first, undated last, priority then newest-first inside a tie.
 *
 * Returns a new array — callers pass the result straight out of `listItems`, and reordering
 * a shared row set in place is the kind of thing that surfaces three screens away.
 */
export function sortByDue<T extends SortableItem>(items: T[], tz: string): T[] {
  const keyed = items.map((item) => ({ item, key: dueKeyOf(item, tz) }));
  return keyed
    .sort((a, bb) => {
      if (a.key !== bb.key) {
        if (a.key === null) return 1;
        if (bb.key === null) return -1;
        return a.key < bb.key ? -1 : 1;
      }
      const rank = (PRIORITY_RANK[bb.item.priority ?? ""] ?? 0) - (PRIORITY_RANK[a.item.priority ?? ""] ?? 0);
      if (rank !== 0) return rank;
      return (bb.item.createdAt?.getTime() ?? 0) - (a.item.createdAt?.getTime() ?? 0);
    })
    .map((entry) => entry.item);
}

export type BucketKind = "overdue" | "today" | "tomorrow" | "week" | "later" | "none" | "done";

export type Bucket<T> = { kind: BucketKind; label: string; items: T[] };

const BUCKET_ORDER: BucketKind[] = ["overdue", "today", "tomorrow", "week", "later", "none", "done"];

const BUCKET_LABELS: Record<BucketKind, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  none: "No date",
  done: "Done",
};

/** Calendar-day gap between two YYYY-MM-DD strings, via UTC arithmetic so DST can't shift it. */
function daysBetween(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function bucketFor(item: SortableItem, status: string | null | undefined, tz: string, todayStr: string): BucketKind {
  // A finished item's due date is history, so bucketing it by that date would file a
  // completed task under "Overdue" — `/list all` would open on a wall of red.
  if (status === "done") return "done";
  const day = dueDayOf(item, tz);
  if (day === null) return "none";
  const offset = daysBetween(todayStr, day);
  if (offset < 0) return "overdue";
  if (offset === 0) return "today";
  if (offset === 1) return "tomorrow";
  if (offset <= 7) return "week";
  return "later";
}

/** Group items into due-date buckets, each internally sorted. Empty buckets are dropped. */
export function bucketByDue<T extends RenderableItem>(
  items: T[],
  tz: string,
  now: Date = new Date()
): Array<Bucket<T>> {
  const todayStr = todayInTz(tz, now);
  const grouped = new Map<BucketKind, T[]>();

  for (const item of sortByDue(items, tz)) {
    const kind = bucketFor(item, item.status, tz, todayStr);
    const bucket = grouped.get(kind) ?? [];
    bucket.push(item);
    grouped.set(kind, bucket);
  }

  return BUCKET_ORDER.filter((kind) => grouped.get(kind)?.length).map((kind) => ({
    kind,
    label: BUCKET_LABELS[kind],
    items: grouped.get(kind)!,
  }));
}

function iconFor(item: RenderableItem): string {
  return item.remindAt || item.type === "reminder" ? "🔔" : "📋";
}

/** "14:00 " when the item has a clock time, "" when it's an all-day thing. */
function timePrefix(item: RenderableItem, tz: string): string {
  if (item.remindAt) return `${formatHHmmInTz(item.remindAt, tz)} `;
  return item.dueTime ? `${item.dueTime} ` : "";
}

/**
 * What to append after the title, decided by which bucket the row is in.
 *
 * Under "Today" the header already says the date, so repeating it is noise; under "This week"
 * a bare ISO date makes you count days, so the weekday goes in front of it.
 */
function dateSuffix(item: RenderableItem, kind: BucketKind, tz: string): string {
  const day = dueDayOf(item, tz);
  if (!day) return "";
  switch (kind) {
    case "overdue":
      return ` — due ${day}`;
    case "today":
    case "tomorrow":
      return "";
    case "week":
      return ` — ${shortWeekdayInTz(startOfDayInTz(day, tz), tz)} ${day}`;
    default:
      return ` — ${day}`;
  }
}

export type RenderedList = { text: string; itemIds: string[] };

/**
 * The grouped view: due-date buckets under bold headers, numbered straight through.
 *
 * Numbering does not restart per group and `itemIds` is filled in the same pass as the text,
 * because `/done 3` resolves a printed position against that array — text and ids built by two
 * separate maps is exactly how a header would silently shift what "3" points at.
 */
export function renderGroupedList<T extends RenderableItem>(
  items: T[],
  tz: string,
  now: Date = new Date()
): RenderedList {
  const buckets = bucketByDue(items, tz, now);
  const lines: string[] = [];
  const itemIds: string[] = [];
  let n = 0;

  buckets.forEach((bucket, index) => {
    lines.push(`${index === 0 ? "" : "\n"}${b(`${bucket.label} (${bucket.items.length})`)}`);
    for (const item of bucket.items) {
      itemIds.push(item.id);
      const prefix = timePrefix(item, tz);
      lines.push(`${++n}. ${iconFor(item)} ${prefix}${esc(item.title)}${dateSuffix(item, bucket.kind, tz)}`);
    }
  });

  return { text: lines.join("\n"), itemIds };
}

export type FlatListOptions = {
  /** Off for relevance-ordered results (search), where due date is the wrong axis. */
  sort?: boolean;
  /** Include `[pending]` etc. — for the model, which reads status; never for the user. */
  showStatus?: boolean;
};

/** The ungrouped view: one numbered run, with the date in parentheses. */
export function renderFlatList<T extends RenderableItem>(
  items: T[],
  tz: string,
  { sort = true, showStatus = false }: FlatListOptions = {}
): RenderedList {
  const ordered = sort ? sortByDue(items, tz) : items;
  const text = ordered
    .map((item, i) => {
      const status = showStatus ? `[${item.status}] ` : "";
      const day = dueDayOf(item, tz);
      const time = timePrefix(item, tz).trim();
      const when = day ? ` (${day}${time ? ` ${time}` : ""})` : "";
      return `${i + 1}. ${iconFor(item)} ${status}${esc(item.title)}${when}`;
    })
    .join("\n");

  return { text, itemIds: ordered.map((item) => item.id) };
}
