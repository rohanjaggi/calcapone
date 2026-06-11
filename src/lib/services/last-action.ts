const TTL_MS = 60 * 60 * 1000; // 1 hour

type ActionEntry = {
  summary: string;
  timestamp: number;
};

const store = new Map<number, ActionEntry>();

export function setLastAction(chatId: number, summary: string): void {
  store.set(chatId, { summary, timestamp: Date.now() });
}

export function getLastAction(chatId: number): string | null {
  const entry = store.get(chatId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) {
    store.delete(chatId);
    return null;
  }
  return entry.summary;
}
