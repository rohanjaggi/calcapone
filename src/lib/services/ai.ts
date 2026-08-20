import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AI_TOOLS, buildSystemPrompt } from "./ai-tools";
import { PROVIDER_DEFAULTS } from "@/lib/models";
import type { ToolOutcome } from "./tool-outcome";

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

/* ------------------------------------------------------------------------- *
 * Provider-neutral conversation thread
 *
 * Every provider expresses "the assistant asked for these tools, here is what
 * they returned" differently, and getting it wrong is a 400 rather than a bad
 * answer. Modelling the thread once and translating at the edge keeps that
 * translation in three small pure functions that can be tested without a
 * network call, instead of three copies tangled into the request builder.
 * ------------------------------------------------------------------------- */

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

/** An image attached to a user turn — a screenshot of a timetable, a photo of a poster. */
export type ImageInput = { mimeType: string; base64: string };

/** `name` rides alongside `id` because Gemini matches responses by name, not by id. */
export type ToolResult = { id: string; name: string; content: string };

export type Turn =
  | { role: "user"; content: string; images?: ImageInput[] }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

/** Plain history as stored in the database, before tool structure is layered on. */
export type PlainHistory = Array<{ role: "user" | "assistant"; content: string }>;

type ProviderReply = { text: string; toolCalls: ToolCall[] };

type AdapterInput = {
  apiKey: string;
  model: string;
  system: string;
  turns: Turn[];
  tools: boolean;
  baseURL?: string;
};

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function callOpenAi({ apiKey, model, system, turns, tools, baseURL }: AdapterInput): Promise<ProviderReply> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });

  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push(
        turn.images?.length
          ? {
              role: "user",
              content: [
                { type: "text" as const, text: turn.content },
                ...turn.images.map((image) => ({
                  type: "image_url" as const,
                  image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
                })),
              ],
            }
          : { role: "user", content: turn.content }
      );
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        ...(turn.toolCalls.length > 0 && {
          tool_calls: turn.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        }),
      });
    } else {
      for (const result of turn.results) {
        messages.push({ role: "tool", tool_call_id: result.id, content: result.content });
      }
    }
  }

  const response = await client.chat.completions.create({
    model,
    messages,
    ...(tools
      ? {
          tools: AI_TOOLS.map((t) => ({
            type: "function" as const,
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }
      : {}),
  });

  const choice = response.choices[0];
  const toolCalls = (choice.message.tool_calls ?? [])
    .filter((tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
    .map((tc) => ({ id: tc.id, name: tc.function.name, args: parseToolArgs(tc.function.arguments) }));

  return { text: choice.message.content ?? "", toolCalls };
}

async function callAnthropic({ apiKey, model, system, turns, tools }: AdapterInput): Promise<ProviderReply> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push(
        turn.images?.length
          ? {
              role: "user",
              content: [
                { type: "text" as const, text: turn.content },
                ...turn.images.map((image) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: image.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                    data: image.base64,
                  },
                })),
              ],
            }
          : { role: "user", content: turn.content }
      );
    } else if (turn.role === "assistant") {
      // An empty text block is rejected outright, so it is included only when there is text.
      const content: Anthropic.ContentBlockParam[] = [
        ...(turn.text ? [{ type: "text" as const, text: turn.text }] : []),
        ...turn.toolCalls.map((tc) => ({
          type: "tool_use" as const,
          id: tc.id,
          name: tc.name,
          input: tc.args,
        })),
      ];
      if (content.length > 0) messages.push({ role: "assistant", content });
    } else {
      // Tool results are a *user* turn in Anthropic's shape — there is no "tool" role.
      messages.push({
        role: "user",
        content: turn.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.id,
          content: r.content,
        })),
      });
    }
  }

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system,
    messages,
    ...(tools
      ? {
          tools: AI_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as Anthropic.Tool.InputSchema,
          })),
        }
      : {}),
  });

  const textBlocks = response.content.filter((block): block is Anthropic.TextBlock => block.type === "text");
  const toolBlocks = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");

  return {
    text: textBlocks.map((block) => block.text).join("\n"),
    toolCalls: toolBlocks.map((block) => ({
      id: block.id,
      name: block.name,
      args: block.input as Record<string, unknown>,
    })),
  };
}

async function callGemini({ apiKey, model, system, turns, tools }: AdapterInput): Promise<ProviderReply> {
  const ai = new GoogleGenAI({ apiKey });

  type GeminiPart = Record<string, unknown>;
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      contents.push({
        role: "user",
        parts: [
          { text: turn.content },
          ...(turn.images ?? []).map((image) => ({
            inlineData: { mimeType: image.mimeType, data: image.base64 },
          })),
        ],
      });
    } else if (turn.role === "assistant") {
      const parts: GeminiPart[] = [
        ...(turn.text ? [{ text: turn.text }] : []),
        ...turn.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.args } })),
      ];
      if (parts.length > 0) contents.push({ role: "model", parts });
    } else {
      contents.push({
        role: "user",
        parts: turn.results.map((r) => ({
          functionResponse: { name: r.name, response: { result: r.content } },
        })),
      });
    }
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: system,
      ...(tools
        ? {
            tools: [
              {
                functionDeclarations: AI_TOOLS.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.parameters,
                })),
              },
            ],
          }
        : {}),
    },
  });

  const functionCalls = response.functionCalls ?? [];
  return {
    text: response.text ?? "",
    toolCalls: functionCalls.map((fc, index) => ({
      // Gemini does not always mint a call id, but the thread needs a stable one to pair
      // the result back against — the position in the turn is unique and reproducible.
      id: fc.id ?? `${fc.name}-${index}`,
      name: fc.name!,
      args: (fc.args ?? {}) as Record<string, unknown>,
    })),
  };
}

function adapterFor(provider: string): (input: AdapterInput) => Promise<ProviderReply> {
  switch (provider) {
    case "openai":
      return callOpenAi;
    case "openrouter":
      return (input) => callOpenAi({ ...input, baseURL: "https://openrouter.ai/api/v1" });
    case "anthropic":
      return callAnthropic;
    case "gemini":
      return callGemini;
    default:
      throw new AiConfigError(`Unsupported AI provider: ${provider}`);
  }
}

function toTurns(history: PlainHistory | undefined, userMessage: string, images?: ImageInput[]): Turn[] {
  return [
    ...(history ?? []).map((m) =>
      m.role === "assistant"
        ? ({ role: "assistant", text: m.content, toolCalls: [] } as Turn)
        : ({ role: "user", content: m.content } as Turn)
    ),
    { role: "user", content: userMessage, ...(images?.length ? { images } : {}) },
  ];
}

type ChatOptions = { tools?: boolean };

type PromptUser = { telegramUsername: string; timezone: string; categories?: string[] };

/**
 * One model call, no tool loop. For callers that want a single response and will handle any
 * tool calls themselves (the dashboard's quick-add) or want none at all (briefings).
 */
export async function chatWithAi(
  userMessage: string,
  user: PromptUser,
  config: AiConfig,
  history?: PlainHistory,
  options: ChatOptions = {}
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const { provider, apiKey, model } = resolveAiClient(config);
  return adapterFor(provider)({
    apiKey,
    model,
    system: buildSystemPrompt(user),
    turns: toTurns(history, userMessage),
    tools: options.tools !== false,
  });
}

/* ------------------------------------------------------------------------- *
 * The agent loop
 * ------------------------------------------------------------------------- */

/** Three rounds answers "find X and reschedule it" without letting a confused model spin. */
export const DEFAULT_MAX_STEPS = 3;

export type AgentCall = { call: ToolCall; outcome: ToolOutcome };

export type AgentRun = {
  /** The model's last prose. Empty when it stopped mid-tool-use. */
  text: string;
  calls: AgentCall[];
  /**
   * Why the loop ended. `answered` is the normal case — the model had nothing left to call.
   * `choose` means a tool needs the user to pick between candidates, so continuing would be
   * guessing. `steps` means the budget ran out with tools still in flight.
   */
  stop: "answered" | "choose" | "steps";
};

type RunAgentOptions = {
  maxSteps?: number;
  /** Called before each additional model round, for the typing indicator. */
  onStep?: () => void;
  /** Images attached to this turn. Only the model's first round sees them. */
  images?: ImageInput[];
};

/**
 * Run the model until it stops asking for tools.
 *
 * The single-shot version could act but never *report*: tool output went straight to the
 * user, so "what's on this week?" answered with a raw dump and "find the dentist task and
 * push it to Friday" could not be expressed at all, because the second step depended on the
 * first step's result which the model never saw.
 *
 * A tool that throws is reported back into the thread rather than aborting the turn — a
 * model that just learned its argument was wrong will usually fix it on the next round,
 * which is the whole reason the results go back in the first place.
 */
export async function runAgent(
  userMessage: string,
  user: PromptUser,
  config: AiConfig,
  history: PlainHistory | undefined,
  execute: (call: ToolCall) => Promise<ToolOutcome>,
  options: RunAgentOptions = {}
): Promise<AgentRun> {
  const { provider, apiKey, model } = resolveAiClient(config);
  const adapter = adapterFor(provider);
  const system = buildSystemPrompt(user);
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS);

  const turns = toTurns(history, userMessage, options.images);
  const calls: AgentCall[] = [];

  for (let step = 0; step < maxSteps; step++) {
    if (step > 0) options.onStep?.();

    const reply = await adapter({ apiKey, model, system, turns, tools: true });
    if (reply.toolCalls.length === 0) {
      return { text: reply.text, calls, stop: "answered" };
    }

    turns.push({ role: "assistant", text: reply.text, toolCalls: reply.toolCalls });

    const results: ToolResult[] = [];
    let needsChoice = false;

    for (const call of reply.toolCalls) {
      let outcome: ToolOutcome;
      try {
        outcome = await execute(call);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        outcome = { text: `Error: ${message}`, echo: false, failed: true };
      }
      calls.push({ call, outcome });
      if (outcome.choose) needsChoice = true;
      results.push({ id: call.id, name: call.name, content: outcome.text ?? "Done." });
    }

    turns.push({ role: "tool", results });

    if (needsChoice) return { text: reply.text, calls, stop: "choose" };
    if (step === maxSteps - 1) return { text: reply.text, calls, stop: "steps" };
  }

  return { text: "", calls, stop: "steps" };
}
