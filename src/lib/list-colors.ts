/**
 * List colours as they are painted. A list's colour is stored data and stays as the user (or
 * the bot) saved it; this only decides how it shows on the dark ground. The old flat-UI
 * presets were saturated enough that a red list read as "overdue", so each one maps to a
 * muted counterpart, and hue stays free for what it means elsewhere (deadlines, the hour).
 */

/** The palette the create sheet offers, in picker order. */
export const LIST_PALETTE = [
  "#8FC1A0", // sage
  "#74C3BD", // teal
  "#7FB0EA", // sky
  "#9EA3F2", // periwinkle
  "#C49DE8", // lilac
  "#E89DC2", // rose
  "#D39A8C", // clay
  "#D8B98A", // sand
  "#D9CC86", // straw
  "#9DA9C2", // slate
] as const;

/** Spoken names for the palette, in the same order. */
export const LIST_PALETTE_NAMES = ["Sage", "Teal", "Sky", "Periwinkle", "Lilac", "Rose", "Clay", "Sand", "Straw", "Slate"] as const;

const [SAGE, TEAL, SKY, PERIWINKLE, LILAC, ROSE, CLAY, SAND, STRAW, SLATE] = LIST_PALETTE;

const LEGACY: Record<string, string> = {
  "#E74C3C": CLAY,
  "#E67E22": SAND,
  "#F1C40F": STRAW,
  "#2ECC71": SAGE,
  "#1ABC9C": TEAL,
  "#3498DB": SKY,
  "#9B59B6": LILAC,
  "#E84393": ROSE,
  "#00B894": TEAL,
  "#6C5CE7": PERIWINKLE,
  "#FDA7DF": ROSE,
  "#FD9644": SAND,
  "#778CA3": SLATE,
  "#A55EEA": LILAC,
  "#26DE81": SAGE,
  "#92785C": SAND, // the old default list colour
  "#A8A29E": SLATE, // "Uncategorized"
  "#4A6FA5": PERIWINKLE, // calendar events
};

/** The colour to paint for a stored list colour. Unknown values pass through unchanged. */
export function listColor(stored: string | null | undefined): string {
  if (!stored) return SLATE;
  return LEGACY[stored.toUpperCase()] ?? stored;
}

/** Google Calendar events, which belong to no list. */
export const EVENT_COLOR = PERIWINKLE;
