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

export function resolveAiClient(config: AiConfig): ResolvedConfig {
  const provider = config.provider || process.env.DEFAULT_AI_PROVIDER || "openai";
  const apiKey = config.apiKey || process.env.DEFAULT_AI_API_KEY;
  const model = config.model || process.env.DEFAULT_AI_MODEL || PROVIDER_DEFAULTS[provider];

  if (!apiKey) {
    throw new Error(`No API key configured for provider "${provider}". Set one in Settings or configure DEFAULT_AI_API_KEY.`);
  }

  return { provider, apiKey, model };
}

function openaiToolsFormat() {
  return AI_TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export async function chatWithAi(
  userMessage: string,
  user: { telegramUsername: string; timezone: string; categories?: string[] },
  config: AiConfig
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
  const { provider, apiKey, model } = resolveAiClient(config);
  const systemPrompt = buildSystemPrompt(user);

  switch (provider) {
    case "openai":
    case "openrouter": {
      const client = new OpenAI({
        apiKey,
        ...(provider === "openrouter" && { baseURL: "https://openrouter.ai/api/v1" }),
      });
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: openaiToolsFormat(),
      });
      const choice = response.choices[0];
      const toolCalls = (choice.message.tool_calls ?? [])
        .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
        .map((tc) => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
        }));
      return { text: choice.message.content ?? "", toolCalls };
    }

    case "anthropic": {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        tools: AI_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
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
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: systemPrompt,
          tools: [{
            functionDeclarations: AI_TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.parameters,
            })),
          }],
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
