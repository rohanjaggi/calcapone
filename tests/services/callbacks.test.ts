import { describe, it, expect } from "vitest";
import { parseCallbackData, reminderKeyboard, doneOnlyKeyboard } from "@/lib/services/callbacks";
import { MAX_CALLBACK_DATA_BYTES } from "@/lib/services/telegram";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("parseCallbackData", () => {
  it("parses the three reminder actions", () => {
    expect(parseCallbackData(`d:${UUID}`)).toEqual({ action: "done", itemId: UUID });
    expect(parseCallbackData(`t:${UUID}`)).toEqual({ action: "tomorrow", itemId: UUID });
    expect(parseCallbackData(`s:${UUID}:60`)).toEqual({ action: "snooze", itemId: UUID, minutes: 60 });
  });

  it("rejects malformed payloads instead of acting on a guess", () => {
    for (const bad of ["", "d", "d:", ":", "x:" + UUID, `s:${UUID}`, `s:${UUID}:abc`, `s:${UUID}:-5`, `s:${UUID}:0`]) {
      expect(parseCallbackData(bad)).toBeNull();
    }
  });
});

describe("reminder keyboards", () => {
  it("keeps every button inside Telegram's 64-byte callback_data cap", () => {
    const payloads = [...reminderKeyboard(UUID), ...doneOnlyKeyboard(UUID)]
      .flat()
      .map((btn) => btn.callback_data);

    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(Buffer.byteLength(payload, "utf8")).toBeLessThanOrEqual(MAX_CALLBACK_DATA_BYTES);
    }
  });

  it("round-trips every button it renders", () => {
    for (const btn of reminderKeyboard(UUID).flat()) {
      expect(parseCallbackData(btn.callback_data)).not.toBeNull();
    }
  });
});
