// Model catalogue — verified against official provider docs on 2026-08-19.
// OpenAI:    https://developers.openai.com/api/docs/models (GPT-5.6 tiers are Sol / Terra / Luna)
// Anthropic: https://platform.claude.com/docs/en/about-claude/models (IDs are dateless)
// Gemini:    https://ai.google.dev/gemini-api/docs/models
// OpenRouter: https://openrouter.ai/models (provider-prefixed slugs)
type ModelOption = { id: string; label: string };

export const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "gpt-5.6-terra",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-3.7-flash",
  openrouter: "openai/gpt-5.6-luna",
};

export const AI_MODELS: Record<string, ModelOption[]> = {
  openai: [
    { id: "gpt-5.6-terra", label: "GPT-5.6 Terra (balanced)" },
    { id: "gpt-5.6-luna", label: "GPT-5.6 Luna (fast, cheapest)" },
    { id: "gpt-5.6-sol", label: "GPT-5.6 Sol (flagship)" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-opus-5", label: "Claude Opus 5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  ],
  gemini: [
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (cheapest)" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  ],
  openrouter: [
    { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna" },
    { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra" },
    { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5" },
  ],
};

export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_DEFAULTS);
