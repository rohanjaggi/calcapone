import { describe, it, expect, vi } from "vitest";

vi.mock("openai", () => {
  const MockOpenAI = function () {
    return {
      audio: {
        transcriptions: {
          create: vi.fn().mockResolvedValue("buy groceries tomorrow"),
        },
      },
    };
  };
  return { default: MockOpenAI };
});

vi.mock("@/lib/services/ai", () => ({
  resolveAiClient: vi.fn().mockReturnValue({
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-4o-mini",
  }),
  PROVIDER_DEFAULTS: {},
}));

describe("transcribeVoice", () => {
  it("returns transcribed text from audio buffer", async () => {
    const { transcribeVoice } = await import("@/lib/services/transcribe");
    const buffer = Buffer.from("fake-audio-data");
    const result = await transcribeVoice(buffer, {
      provider: "openai",
      apiKey: "test-key",
      model: null,
    });
    expect(result).toBe("buy groceries tomorrow");
  });
});
