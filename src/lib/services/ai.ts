// src/lib/services/ai.ts
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AI_TOOLS, buildSystemPrompt } from "./ai-tools";
import { PROVIDER_DEFAULTS } from "@/lib/models";

export { PROVIDER_DEFAULTS };

type AiConfig = {
  provider: string | null;
  apiKey: string | null;
  model: string | null;
};

type ResolvedConfig = {
  provider: string;
  apiKey: string;
  model: string;
};

/**
 * The user's AI setup is wrong or missing — as opposed to the provider failing at runtime.
 *
 * These messages are written by us and name no secrets, so callers can safely show them to
 * the user. That matters: a misconfigured key previously surfaced as a generic "something
 * went wrong", leaving the one person who could fix it with nothing to act on.
 */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export function resolveAiClient(config: AiConfig): ResolvedConfig {
  const defaultProvider = process.env.DEFAULT_AI_PROVIDER || "openai";
  const provider = config.provider || defaultProvider;
  if (!PROVIDER_DEFAULTS[provider]) {
    throw new AiConfigError(`Unsupported AI provider: ${provider}`);
  }

  // The shared default key/model only make sense for the provider they were issued for.
  const envApplies = provider === defaultProvider;
  const apiKey = config.apiKey || (envApplies ? process.env.DEFAULT_AI_API_KEY : undefined);
  const model =
    config.model ||
    (envApplies && process.env.DEFAULT_AI_MODEL) ||
    PROVIDER_DEFAULTS[provider];

  if (!apiKey) {
    throw new AiConfigError(
      config.provider && !envApplies
        ? `No API key saved for ${provider}. Add one in Settings (the shared trial key only works with ${defaultProvider}).`
        : `No API key configured for provider "${provider}". Set one in Settings or configure DEFAULT_AI_API_KEY.`
    );
  }

  return { provider, apiKey, model };
}

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function openaiToolsFormat() {
  return AI_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

type ChatOptions = { tools?: boolean };

export async function chatWithAi(
  userMessage: string,
  user: { telegramUsername: string; timezone: string; categories?: string[] },
  config: AiConfig,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  options: ChatOptions = {}
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
  const { provider, apiKey, model } = resolveAiClient(config);
  const systemPrompt = buildSystemPrompt(user);
  const useTools = options.tools !== false;

  switch (provider) {
    case "openai":
    case "openrouter": {
      const client = new OpenAI({
        apiKey,
        ...(provider === "openrouter" && { baseURL: "https://openrouter.ai/api/v1" }),
      });
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: userMessage },
      ];
      const response = await client.chat.completions.create({
        model,
        messages,
        ...(useTools ? { tools: openaiToolsFormat() } : {}),
      });
      const choice = response.choices[0];
      const toolCalls = (choice.message.tool_calls ?? [])
        .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
        .map((tc) => ({
          name: tc.function.name,
          args: parseToolArgs(tc.function.arguments),
        }));
      return { text: choice.message.content ?? "", toolCalls };
    }

    case "anthropic": {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...(history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: userMessage },
        ],
        ...(useTools
          ? {
              tools: AI_TOOLS.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
      });
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      return {
        text: textBlocks.map((b) => b.text).join("\n"),
        toolCalls: toolBlocks.map((b) => ({
          name: b.name,
          args: b.input as Record<string, unknown>,
        })),
      };
    }

    case "gemini": {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model,
        contents: [
          ...(history ?? []).map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          { role: "user", parts: [{ text: userMessage }] },
        ],
        config: {
          systemInstruction: systemPrompt,
          ...(useTools
            ? {
                tools: [{
                  functionDeclarations: AI_TOOLS.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parametersJsonSchema: t.parameters,
                  })),
                }],
              }
            : {}),
        },
      });
      const functionCalls = response.functionCalls ?? [];
      return {
        text: response.text ?? "",
        toolCalls: functionCalls.map((fc) => ({
          name: fc.name!,
          args: (fc.args ?? {}) as Record<string, unknown>,
        })),
      };
    }

    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
