// tests/services/ai.test.ts
import { describe, it, expect } from "vitest";
import { resolveAiClient, PROVIDER_DEFAULTS } from "@/lib/services/ai";

describe("AI Service", () => {
  it("has correct default models for each provider", () => {
    expect(PROVIDER_DEFAULTS.openai).toBe("gpt-5.4");
    expect(PROVIDER_DEFAULTS.anthropic).toBe("claude-sonnet-4-6-20250514");
    expect(PROVIDER_DEFAULTS.gemini).toBe("gemini-3-flash-preview");
    expect(PROVIDER_DEFAULTS.openrouter).toBe("openai/gpt-5.4-mini");
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
});
