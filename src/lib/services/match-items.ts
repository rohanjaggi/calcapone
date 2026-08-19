type Titled = { title: string };

export type TitleMatch<T> =
  | { kind: "one"; item: T }
  | { kind: "many"; items: T[] }
  | { kind: "none" };

/**
 * Find the item a user meant by a free-text title.
 *
 * An exact (case-insensitive) title always wins, so "call mom" picks "Call mom" even when
 * "Call mom's doctor" also exists. Otherwise every substring hit is returned: picking the
 * first of several silently completed or deleted the wrong task, so callers ask instead.
 */
export function matchByTitle<T extends Titled>(items: T[], query: string): TitleMatch<T> {
  const needle = query.trim().toLowerCase();
  if (!needle) return { kind: "none" };

  const exact = items.filter((item) => item.title.trim().toLowerCase() === needle);
  if (exact.length === 1) return { kind: "one", item: exact[0] };
  if (exact.length > 1) return { kind: "many", items: exact };

  const partial = items.filter((item) => item.title.toLowerCase().includes(needle));
  if (partial.length === 0) return { kind: "none" };
  if (partial.length === 1) return { kind: "one", item: partial[0] };
  return { kind: "many", items: partial };
}
