import { describe, it, expect, vi, beforeEach } from "vitest";

const mockItem = vi.hoisted(() => ({
  getItem: vi.fn(),
  updateItem: vi.fn(),
  snoozeReminder: vi.fn(),
}));

const mockActionLog = vi.hoisted(() => ({
  undoById: vi.fn(),
}));

vi.mock("@/lib/services/item", () => mockItem);
vi.mock("@/lib/services/action-log", () => mockActionLog);

import {
  parseCallbackData,
  reminderKeyboard,
  doneOnlyKeyboard,
  undoKeyboard,
  chooseKeyboard,
  handleCallback,
  type ParsedCallback,
  type CallbackUser,
} from "@/lib/services/callbacks";
import { MAX_CALLBACK_DATA_BYTES } from "@/lib/services/telegram";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const UUID2 = "223e4567-e89b-12d3-a456-426614174000";

describe("parseCallbackData", () => {
  it("round-trips every verb", () => {
    expect(parseCallbackData(`d:${UUID}`)).toEqual({ action: "done", itemId: UUID });
    expect(parseCallbackData(`t:${UUID}`)).toEqual({ action: "tomorrow", itemId: UUID });
    expect(parseCallbackData(`s:${UUID}:60`)).toEqual({ action: "snooze", itemId: UUID, minutes: 60 });
    expect(parseCallbackData(`u:${UUID}`)).toEqual({ action: "undo", actionId: UUID });
    expect(parseCallbackData(`p:${UUID}:0`)).toEqual({ action: "pick", pendingId: UUID, index: 0 });
    expect(parseCallbackData(`p:${UUID}:4`)).toEqual({ action: "pick", pendingId: UUID, index: 4 });
  });

  it("rejects malformed payloads instead of acting on a guess", () => {
    for (const bad of [
      "",
      "d",
      "d:",
      ":",
      "x:" + UUID,
      `s:${UUID}`,
      `s:${UUID}:abc`,
      `s:${UUID}:-5`,
      `s:${UUID}:0`,
      "u:",
      `p:${UUID}`,
      `p:${UUID}:`,
      `p:${UUID}:-1`,
      `p:${UUID}:x`,
      `p:${UUID}:1.5`,
      "p:",
    ]) {
      expect(parseCallbackData(bad)).toBeNull();
    }
  });
});

describe("keyboard builders", () => {
  const candidates = [
    { id: "c0", title: "Buy milk" },
    { id: "c1", title: "Buy eggs" },
    { id: "c2", title: "Buy bread" },
    { id: "c3", title: "Buy butter" },
    { id: "c4", title: "Buy cheese" },
    { id: "c5", title: "Buy yogurt" },
    { id: "c6", title: "Buy juice" },
  ];

  const allButtons = () =>
    [...reminderKeyboard(UUID), ...doneOnlyKeyboard(UUID), ...undoKeyboard(UUID), ...chooseKeyboard(UUID, candidates)].flat();

  it("keeps every button inside Telegram's 64-byte callback_data cap", () => {
    const payloads = allButtons().map((btn) => btn.callback_data);
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(Buffer.byteLength(payload, "utf8")).toBeLessThanOrEqual(MAX_CALLBACK_DATA_BYTES);
    }
  });

  it("round-trips every button it renders", () => {
    for (const btn of allButtons()) {
      expect(parseCallbackData(btn.callback_data)).not.toBeNull();
    }
  });

  describe("reminderKeyboard", () => {
    it("offers done, a 10-minute snooze, an hour snooze, and tomorrow on its own row", () => {
      const [row1, row2] = reminderKeyboard(UUID);
      expect(row1.map((b) => b.text)).toEqual(["✅ Done", "⏰ 10m", "⏰ 1h"]);
      expect(row2.map((b) => b.text)).toEqual(["🌙 Tomorrow"]);
      expect(row1[1].callback_data).toBe(`s:${UUID}:10`);
      expect(row1[2].callback_data).toBe(`s:${UUID}:60`);
    });
  });

  describe("undoKeyboard", () => {
    it("renders a single undo button", () => {
      const kb = undoKeyboard(UUID);
      expect(kb).toEqual([[{ text: "↩️ Undo", callback_data: `u:${UUID}` }]]);
    });
  });

  describe("chooseKeyboard", () => {
    it("caps at 5 candidates, one per row", () => {
      const kb = chooseKeyboard(UUID, candidates);
      expect(kb).toHaveLength(5);
      for (const row of kb) expect(row).toHaveLength(1);
    });

    it("indexes each button by the candidate's position in the input array", () => {
      const kb = chooseKeyboard(UUID, candidates);
      kb.forEach((row, i) => expect(row[0].callback_data).toBe(`p:${UUID}:${i}`));
    });

    it("leaves short titles untouched", () => {
      const [[btn]] = chooseKeyboard(UUID, [{ id: "c0", title: "Buy milk" }]);
      expect(btn.text).toBe("Buy milk");
    });

    it("truncates a long title to 40 chars with a trailing ellipsis", () => {
      const [[btn]] = chooseKeyboard(UUID, [{ id: "c0", title: "x".repeat(60) }]);
      expect(btn.text).toHaveLength(40);
      expect(btn.text.endsWith("…")).toBe(true);
    });

    it("strips newlines out of the label without escaping HTML", () => {
      const [[btn]] = chooseKeyboard(UUID, [{ id: "c0", title: "Buy milk\nand <eggs>" }]);
      expect(btn.text).not.toMatch(/[\r\n]/);
      expect(btn.text).toBe("Buy milkand <eggs>");
    });
  });
});

describe("handleCallback", () => {
  const user: CallbackUser = {
    id: "u1",
    timezone: "Asia/Singapore",
    googleRefreshToken: null,
    googleCalendarId: null,
  };
  const now = new Date("2026-08-20T10:00:00Z");

  beforeEach(() => vi.clearAllMocks());

  it("returns null for a pick — re-running a parked tool call is the webhook's job", async () => {
    const parsed: ParsedCallback = { action: "pick", pendingId: UUID, index: 0 };
    const result = await handleCallback(parsed, user, now);
    expect(result).toBeNull();
    expect(mockItem.getItem).not.toHaveBeenCalled();
  });

  it("marks an item done", async () => {
    mockItem.getItem.mockResolvedValue({ id: UUID, title: "Buy milk" });
    const parsed: ParsedCallback = { action: "done", itemId: UUID };
    const result = await handleCallback(parsed, user, now);
    expect(mockItem.getItem).toHaveBeenCalledWith(UUID, "u1");
    expect(mockItem.updateItem).toHaveBeenCalledWith(UUID, "u1", { status: "done" });
    expect(result).toEqual({ text: "✅ <b>Buy milk</b> — done", toast: "Marked done" });
  });

  it("reports a missing item without acting on it", async () => {
    mockItem.getItem.mockResolvedValue(null);
    const parsed: ParsedCallback = { action: "done", itemId: UUID2 };
    const result = await handleCallback(parsed, user, now);
    expect(result).toEqual({ text: "That item no longer exists.", toast: "Item not found" });
    expect(mockItem.updateItem).not.toHaveBeenCalled();
  });

  it("snoozes for the requested minutes", async () => {
    mockItem.getItem.mockResolvedValue({ id: UUID, title: "Buy milk" });
    const parsed: ParsedCallback = { action: "snooze", itemId: UUID, minutes: 10 };
    const result = await handleCallback(parsed, user, now);
    expect(mockItem.snoozeReminder).toHaveBeenCalledWith(UUID, "u1", new Date(now.getTime() + 10 * 60_000));
    expect(result?.toast).toContain("Snoozed until");
  });

  it("snoozes to 9am the next morning in the user's timezone for the tomorrow button", async () => {
    mockItem.getItem.mockResolvedValue({ id: UUID, title: "Buy milk" });
    const parsed: ParsedCallback = { action: "tomorrow", itemId: UUID };
    await handleCallback(parsed, user, now);
    // now is 2026-08-20T10:00Z (18:00 SGT); tomorrow 9am SGT is 2026-08-21T01:00Z. SGT has no DST.
    expect(mockItem.snoozeReminder).toHaveBeenCalledWith(UUID, "u1", new Date("2026-08-21T01:00:00.000Z"));
  });

  describe("undo", () => {
    it("renders a successful undo without double-escaping an already-escaped summary", async () => {
      mockActionLog.undoById.mockResolvedValue({ ok: true, summary: "<b>Buy milk</b> &amp; eggs — done" });
      const parsed: ParsedCallback = { action: "undo", actionId: UUID };
      const result = await handleCallback(parsed, user, now);
      expect(result).toEqual({ text: "↩️ Undid: <b>Buy milk</b> &amp; eggs — done", toast: "Undone" });
    });

    it("passes the actionId, the whole user, and now through to undoById", async () => {
      mockActionLog.undoById.mockResolvedValue({ ok: true, summary: "done" });
      const parsed: ParsedCallback = { action: "undo", actionId: UUID };
      await handleCallback(parsed, user, now);
      expect(mockActionLog.undoById).toHaveBeenCalledWith(UUID, user, now);
    });

    it("reports nothing left to undo", async () => {
      mockActionLog.undoById.mockResolvedValue({ ok: false, reason: "none" });
      const parsed: ParsedCallback = { action: "undo", actionId: UUID };
      const result = await handleCallback(parsed, user, now);
      expect(result).toEqual({ text: "Nothing to undo here.", toast: "Already undone" });
    });

    it("reports a failed undo", async () => {
      mockActionLog.undoById.mockResolvedValue({ ok: false, reason: "failed" });
      const parsed: ParsedCallback = { action: "undo", actionId: UUID };
      const result = await handleCallback(parsed, user, now);
      expect(result).toEqual({
        text: "I couldn't undo that — it may have changed since.",
        toast: "Undo failed",
      });
    });

    it("never looks up an item — undo is self-contained", async () => {
      mockActionLog.undoById.mockResolvedValue({ ok: false, reason: "none" });
      const parsed: ParsedCallback = { action: "undo", actionId: UUID };
      await handleCallback(parsed, user, now);
      expect(mockItem.getItem).not.toHaveBeenCalled();
    });
  });
});
