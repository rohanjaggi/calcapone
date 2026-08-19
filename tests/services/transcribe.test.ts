import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());
const mockConstructor = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: function (options: { apiKey: string }) {
    mockConstructor(options);
    return { audio: { transcriptions: { create: mockCreate } } };
  },
}));

import { transcribeVoice, isTranscriptionAvailable, TranscriptionUnavailableError } from "@/lib/services/transcribe";

const buffer = Buffer.from("fake-audio-data");
const config = (over = {}) => ({ provider: null as string | null, apiKey: null as string | null, model: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue("buy groceries tomorrow");
  delete process.env.OPENAI_API_KEY;
  delete process.env.TRANSCRIBE_API_KEY;
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.TRANSCRIBE_API_KEY;
});

describe("transcribeVoice", () => {
  it("returns transcribed text from an audio buffer", async () => {
    process.env.OPENAI_API_KEY = "env-key";
    expect(await transcribeVoice(buffer, config())).toBe("buy groceries tomorrow");
  });

  it("prefers TRANSCRIBE_API_KEY over OPENAI_API_KEY", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.TRANSCRIBE_API_KEY = "dedicated-key";
    await transcribeVoice(buffer, config());
    expect(mockConstructor).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "dedicated-key" }));
  });

  it("falls back to the user's own key when they are already on OpenAI", async () => {
    await transcribeVoice(buffer, config({ provider: "openai", apiKey: "user-key" }));
    expect(mockConstructor).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "user-key" }));
  });

  it("never sends a non-OpenAI provider key to OpenAI", async () => {
    for (const provider of ["anthropic", "gemini", "openrouter"]) {
      await expect(transcribeVoice(buffer, config({ provider, apiKey: "not-an-openai-key" }))).rejects.toBeInstanceOf(
        TranscriptionUnavailableError
      );
    }
    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it("reports availability without making a call", () => {
    expect(isTranscriptionAvailable(config({ provider: "gemini", apiKey: "k" }))).toBe(false);
    expect(isTranscriptionAvailable(config({ provider: "openai", apiKey: "k" }))).toBe(true);
    process.env.OPENAI_API_KEY = "env-key";
    expect(isTranscriptionAvailable(config({ provider: "gemini", apiKey: "k" }))).toBe(true);
  });
});
