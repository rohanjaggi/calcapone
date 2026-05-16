type ModelOption = { id: string; label: string };

export const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-sonnet-4-6-20250514",
  gemini: "gemini-3-flash-preview",
  openrouter: "openai/gpt-5.4-mini",
};

export const AI_MODELS: Record<string, ModelOption[]> = {
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-6-20250514", label: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { id: "claude-opus-4-6-20250514", label: "Claude Opus 4.6" },
  ],
  gemini: [
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  ],
  openrouter: [
    { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano" },
    { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  ],
};
