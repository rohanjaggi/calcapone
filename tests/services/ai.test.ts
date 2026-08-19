// tests/services/ai.test.ts
import { describe, it, expect } from "vitest";
import { resolveAiClient, PROVIDER_DEFAULTS } from "@/lib/services/ai";

describe("AI Service", () => {
  it("has correct default models for each provider", () => {
    expect(PROVIDER_DEFAULTS.openai).toBe("gpt-5.6-terra");
    expect(PROVIDER_DEFAULTS.anthropic).toBe("claude-sonnet-5");
    expect(PROVIDER_DEFAULTS.gemini).toBe("gemini-3.7-flash");
    expect(PROVIDER_DEFAULTS.openrouter).toBe("openai/gpt-5.6-luna");
  });

  it("throws if no API key provided and no default", () => {
    delete process.env.DEFAULT_AI_API_KEY;
    expect(() =>
      resolveAiClient({ provider: "openai", apiKey: null, model: null })
    ).toThrow("No API key");
  });

  it("falls back to env defaults when user has no BYOK config", () => {
    process.env.DEFAULT_AI_PROVIDER = "openai";
    process.env.DEFAULT_AI_API_KEY = "sk-test";
    process.env.DEFAULT_AI_MODEL = "gpt-4o-mini";
    const config = resolveAiClient({ provider: null, apiKey: null, model: null });
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini");
    delete process.env.DEFAULT_AI_PROVIDER;
    delete process.env.DEFAULT_AI_API_KEY;
    delete process.env.DEFAULT_AI_MODEL;
  });

  it("does not apply the shared env key/model to a different provider", () => {
    process.env.DEFAULT_AI_PROVIDER = "gemini";
    process.env.DEFAULT_AI_API_KEY = "gemini-key";
    process.env.DEFAULT_AI_MODEL = "gemini-3.7-flash";
    expect(() =>
      resolveAiClient({ provider: "anthropic", apiKey: null, model: null })
    ).toThrow(/No API key saved for anthropic/);
    const own = resolveAiClient({ provider: "anthropic", apiKey: "sk-ant", model: null });
    expect(own.model).toBe(PROVIDER_DEFAULTS.anthropic);
    delete process.env.DEFAULT_AI_PROVIDER;
    delete process.env.DEFAULT_AI_API_KEY;
    delete process.env.DEFAULT_AI_MODEL;
  });

  it("rejects unknown providers", () => {
    expect(() => resolveAiClient({ provider: "llama-farm", apiKey: "x", model: null })).toThrow(/Unsupported AI provider/);
  });
});
