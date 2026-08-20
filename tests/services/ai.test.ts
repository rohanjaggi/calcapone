// tests/services/ai.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOpenAiResponsesCreate = vi.hoisted(() => vi.fn());
const mockOpenAiChatCreate = vi.hoisted(() => vi.fn());
const mockOpenAiConstructor = vi.hoisted(() => vi.fn());
const mockAnthropicCreate = vi.hoisted(() => vi.fn());
const mockAnthropicConstructor = vi.hoisted(() => vi.fn());
const mockGeminiGenerate = vi.hoisted(() => vi.fn());
const mockGeminiConstructor = vi.hoisted(() => vi.fn());

// Native OpenAI goes through `responses.create`; OpenRouter reuses the chat/completions
// adapter. Two mocks, so a test asserting on one endpoint can't accidentally pass on the other.
vi.mock("openai", () => ({
  default: function (options: unknown) {
    mockOpenAiConstructor(options);
    return {
      responses: { create: mockOpenAiResponsesCreate },
      chat: { completions: { create: mockOpenAiChatCreate } },
    };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: function (options: unknown) {
    mockAnthropicConstructor(options);
    return { messages: { create: mockAnthropicCreate } };
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: function (options: unknown) {
    mockGeminiConstructor(options);
    return { models: { generateContent: mockGeminiGenerate } };
  },
}));

import { resolveAiClient, PROVIDER_DEFAULTS, runAgent } from "@/lib/services/ai";
import { readOutcome } from "@/lib/services/tool-outcome";
import type { ToolOutcome } from "@/lib/services/tool-outcome";

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

/* ------------------------------------------------------------------------- *
 * runAgent + adapter translation
 * ------------------------------------------------------------------------- */

type PromptUser = { telegramUsername: string; timezone: string; categories?: string[] };

const testUser = (over: Partial<PromptUser> = {}): PromptUser => ({
  telegramUsername: "alice",
  timezone: "UTC",
  categories: ["Work"],
  ...over,
});

const aiConfig = (over: { provider?: string; apiKey?: string | null; model?: string | null } = {}) => ({
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-4o",
  ...over,
});

/** A read-only outcome, the common case for a tool call in these tests. */
const okOutcome = (text: string): ToolOutcome => readOutcome(text);

/** Responses API shape: a flat `output` list, tool calls as their own items. */
function openAiToolCallResponse(name: string, args: Record<string, unknown>, id: string, text = "") {
  return {
    output: [
      ...(text ? [{ type: "message", content: [{ type: "output_text", text }] }] : []),
      // `call_id` is the handle a function_call_output echoes; `id` names the item itself.
      { type: "function_call", id: `fc_${id}`, call_id: id, name, arguments: JSON.stringify(args) },
    ],
  };
}

function openAiTextResponse(text: string) {
  return { output: [{ type: "message", content: [{ type: "output_text", text }] }] };
}

/** Chat Completions shape, still used by the OpenRouter path. */
function chatToolCallResponse(name: string, args: Record<string, unknown>, id: string, text = "") {
  return {
    choices: [
      {
        message: {
          content: text || null,
          tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
        },
      },
    ],
  };
}

function chatTextResponse(text: string) {
  return { choices: [{ message: { content: text, tool_calls: undefined } }] };
}

function anthropicToolUseResponse(name: string, args: Record<string, unknown>, id: string, text = "") {
  return {
    content: [
      ...(text ? [{ type: "text", text }] : []),
      { type: "tool_use", id, name, input: args },
    ],
  };
}

function anthropicTextResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

function geminiToolCallResponse(name: string, args: Record<string, unknown>, id: string | undefined, text = "") {
  return { text, functionCalls: [{ id, name, args }] };
}

function geminiTextResponse(text: string) {
  return { text, functionCalls: [] };
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.DEFAULT_AI_PROVIDER;
  delete process.env.DEFAULT_AI_API_KEY;
  delete process.env.DEFAULT_AI_MODEL;
});

describe("runAgent", () => {
  it("terminates when the model stops calling tools", async () => {
    mockOpenAiResponsesCreate.mockResolvedValueOnce(openAiTextResponse("All done."));
    const execute = vi.fn();

    const result = await runAgent("hello", testUser(), aiConfig(), undefined, execute);

    expect(result).toEqual({ text: "All done.", calls: [], stop: "answered", modelCalls: 1 });
    expect(mockOpenAiResponsesCreate).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a non-empty fallback line when the model replies with neither text nor a tool call", async () => {
    // A documented outcome when a provider's safety filter blocks the completion outright.
    mockOpenAiResponsesCreate.mockResolvedValueOnce(openAiTextResponse(""));
    const execute = vi.fn();

    const result = await runAgent("hello", testUser(), aiConfig(), undefined, execute);

    expect(result.stop).toBe("answered");
    expect(result.text.trim()).not.toBe("");
    expect(execute).not.toHaveBeenCalled();
  });

  it("chains a tool call into a second round, calling the provider twice and executing once", async () => {
    mockOpenAiResponsesCreate
      .mockResolvedValueOnce(openAiToolCallResponse("list_items", { status: "pending" }, "call_1"))
      .mockResolvedValueOnce(openAiTextResponse("Here's your list."));
    const execute = vi.fn().mockResolvedValue(okOutcome("item1, item2"));

    const result = await runAgent("what's pending", testUser(), aiConfig(), undefined, execute);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(mockOpenAiResponsesCreate).toHaveBeenCalledTimes(2);
    expect(result.stop).toBe("answered");
    expect(result.text).toBe("Here's your list.");
  });

  it("feeds the tool call and its result back to the model on the second call", async () => {
    mockOpenAiResponsesCreate
      .mockResolvedValueOnce(openAiToolCallResponse("list_items", { status: "pending" }, "call_1", "Let me check."))
      .mockResolvedValueOnce(openAiTextResponse("Here's your list."));
    const execute = vi.fn().mockResolvedValue(okOutcome("item1, item2"));

    await runAgent("what's pending", testUser(), aiConfig(), undefined, execute);

    const secondRequest = mockOpenAiResponsesCreate.mock.calls[1][0];
    // The assistant's commentary and its tool call are separate items, in that order.
    expect(secondRequest.input).toEqual([
      { role: "user", content: "what's pending" },
      { role: "assistant", content: "Let me check." },
      { type: "function_call", call_id: "call_1", name: "list_items", arguments: JSON.stringify({ status: "pending" }) },
      { type: "function_call_output", call_id: "call_1", output: "item1, item2" },
    ]);
    expect(secondRequest.instructions).toEqual(expect.any(String));
    expect(secondRequest.store).toBe(false);
  });

  it("stops after maxSteps rounds when the model keeps calling tools, still running the final round's tools", async () => {
    mockOpenAiResponsesCreate.mockResolvedValue(openAiToolCallResponse("list_items", {}, "call_x"));
    const execute = vi.fn().mockResolvedValue(okOutcome("stuff"));

    const result = await runAgent("loop forever", testUser(), aiConfig(), undefined, execute, { maxSteps: 3 });

    expect(mockOpenAiResponsesCreate).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(result.stop).toBe("steps");
    expect(result.calls).toHaveLength(3);
  });

  it("halts immediately with stop: choose when a tool result needs the user to pick, without another provider call", async () => {
    mockOpenAiResponsesCreate.mockResolvedValueOnce(openAiToolCallResponse("delete_item", { title: "foo" }, "call_1"));
    const candidates = [{ id: "1", title: "Foo A" }, { id: "2", title: "Foo B" }];
    const execute = vi.fn().mockResolvedValue({
      text: "Which one did you mean?",
      echo: true,
      choose: { tool: "delete_item", args: { title: "foo" }, candidates },
    } satisfies ToolOutcome);

    const result = await runAgent("delete foo", testUser(), aiConfig(), undefined, execute);

    expect(result.stop).toBe("choose");
    expect(mockOpenAiResponsesCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a tool throws: the error is fed back and the call is recorded as failed", async () => {
    mockOpenAiResponsesCreate
      .mockResolvedValueOnce(openAiToolCallResponse("create_item", { title: "x" }, "call_1"))
      .mockResolvedValueOnce(openAiTextResponse("Fixed it."));
    const execute = vi.fn().mockRejectedValueOnce(new Error("category not found"));

    const result = await runAgent("add x", testUser(), aiConfig(), undefined, execute);

    expect(result.stop).toBe("answered");
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].outcome.failed).toBe(true);
    expect(result.calls[0].outcome.text).toBe("Error: category not found");

    const secondRequest = mockOpenAiResponsesCreate.mock.calls[1][0];
    const toolMsg = secondRequest.input.find((i: { type?: string }) => i.type === "function_call_output");
    expect(toolMsg.output).toBe("Error: category not found");
  });

  it("calls onStep before each additional round but not before the first", async () => {
    mockOpenAiResponsesCreate
      .mockResolvedValueOnce(openAiToolCallResponse("list_items", {}, "call_1"))
      .mockResolvedValueOnce(openAiToolCallResponse("list_items", {}, "call_2"))
      .mockResolvedValueOnce(openAiTextResponse("done"));
    const execute = vi.fn().mockResolvedValue(okOutcome("ok"));
    const onStep = vi.fn();

    await runAgent("go", testUser(), aiConfig(), undefined, execute, { onStep, maxSteps: 5 });

    expect(onStep).toHaveBeenCalledTimes(2);
    expect(mockOpenAiResponsesCreate).toHaveBeenCalledTimes(3);
  });

  it("floors maxSteps at 1 even when 0 is passed", async () => {
    mockOpenAiResponsesCreate.mockResolvedValueOnce(openAiToolCallResponse("list_items", {}, "call_1"));
    const execute = vi.fn().mockResolvedValue(okOutcome("ok"));

    const result = await runAgent("go", testUser(), aiConfig(), undefined, execute, { maxSteps: 0 });

    expect(mockOpenAiResponsesCreate).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.stop).toBe("steps");
  });
});

describe("adapter translation", () => {
  describe("openai", () => {
    it("degrades malformed tool-call arguments JSON to {} instead of throwing", async () => {
      mockOpenAiResponsesCreate
        .mockResolvedValueOnce({
          output: [{ type: "function_call", id: "fc_bad", call_id: "call_bad", name: "list_items", arguments: "{not json" }],
        })
        .mockResolvedValueOnce(openAiTextResponse("Done."));
      const execute = vi.fn().mockResolvedValue(okOutcome("ok"));

      await runAgent("go", testUser(), aiConfig(), undefined, execute);

      expect(execute).toHaveBeenCalledWith({ id: "call_bad", name: "list_items", args: {} });
    });
  });

  describe("openrouter", () => {
    it("uses the chat/completions request shape and constructs the client with the openrouter baseURL", async () => {
      mockOpenAiChatCreate.mockResolvedValueOnce(chatTextResponse("hi"));

      await runAgent("hello", testUser(), aiConfig({ provider: "openrouter", model: "openai/gpt-5.6-luna" }), undefined, vi.fn());

      expect(mockOpenAiConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "test-key", baseURL: "https://openrouter.ai/api/v1" })
      );
      // OpenRouter does not implement /v1/responses, so this path must stay on chat/completions.
      expect(mockOpenAiResponsesCreate).not.toHaveBeenCalled();
      const request = mockOpenAiChatCreate.mock.calls[0][0];
      expect(request.model).toBe("openai/gpt-5.6-luna");
      expect(request.messages[0].role).toBe("system");
    });

    it("still threads a tool call and its result back as assistant tool_calls plus a tool message", async () => {
      mockOpenAiChatCreate
        .mockResolvedValueOnce(chatToolCallResponse("list_items", { status: "pending" }, "call_1", "Let me check."))
        .mockResolvedValueOnce(chatTextResponse("Here's your list."));
      const execute = vi.fn().mockResolvedValue(okOutcome("item1, item2"));

      await runAgent("what's pending", testUser(), aiConfig({ provider: "openrouter" }), undefined, execute);

      const secondRequest = mockOpenAiChatCreate.mock.calls[1][0];
      const assistantMsg = secondRequest.messages.find((m: { role: string }) => m.role === "assistant");
      expect(assistantMsg).toEqual({
        role: "assistant",
        content: "Let me check.",
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "list_items", arguments: JSON.stringify({ status: "pending" }) } },
        ],
      });
      const toolMsg = secondRequest.messages.find((m: { role: string }) => m.role === "tool");
      expect(toolMsg).toEqual({ role: "tool", tool_call_id: "call_1", content: "item1, item2" });
    });
  });

  describe("anthropic", () => {
    it("emits an assistant tool_use block, then a user tool_result block matched by tool_use_id", async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce(anthropicToolUseResponse("list_items", { status: "pending" }, "toolu_1", "Let me check."))
        .mockResolvedValueOnce(anthropicTextResponse("You have 2 items."));
      const execute = vi.fn().mockResolvedValue(okOutcome("item1, item2"));

      await runAgent("what's pending", testUser(), aiConfig({ provider: "anthropic" }), undefined, execute);

      const secondRequest = mockAnthropicCreate.mock.calls[1][0];
      const messages = secondRequest.messages;
      const assistantMsg = messages.find((m: { role: string }) => m.role === "assistant");
      expect(assistantMsg.content).toEqual([
        { type: "text", text: "Let me check." },
        { type: "tool_use", id: "toolu_1", name: "list_items", input: { status: "pending" } },
      ]);

      const toolResultMsg = messages[messages.length - 1];
      expect(toolResultMsg).toEqual({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "item1, item2" }],
      });
    });

    it("omits the text block entirely when the assistant round produced no prose", async () => {
      mockAnthropicCreate
        .mockResolvedValueOnce(anthropicToolUseResponse("list_items", {}, "toolu_2", ""))
        .mockResolvedValueOnce(anthropicTextResponse("Done."));
      const execute = vi.fn().mockResolvedValue(okOutcome("ok"));

      await runAgent("list", testUser(), aiConfig({ provider: "anthropic" }), undefined, execute);

      const secondRequest = mockAnthropicCreate.mock.calls[1][0];
      const assistantMsg = secondRequest.messages.find((m: { role: string }) => m.role === "assistant");
      expect(assistantMsg.content).toEqual([{ type: "tool_use", id: "toolu_2", name: "list_items", input: {} }]);
      expect(assistantMsg.content.some((b: { type: string }) => b.type === "text")).toBe(false);
    });

    it("requests a 4096 output token cap", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(anthropicTextResponse("hi"));

      await runAgent("hello", testUser(), aiConfig({ provider: "anthropic" }), undefined, vi.fn());

      expect(mockAnthropicCreate.mock.calls[0][0].max_tokens).toBe(4096);
    });

    it("refuses to execute a tool call truncated by the token cap instead of running it as-is", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        stop_reason: "max_tokens",
        content: [{ type: "tool_use", id: "toolu_trunc", name: "create_item", input: { title: "Dentist" } }],
      });
      const execute = vi.fn();

      await expect(
        runAgent("add three reminders", testUser(), aiConfig({ provider: "anthropic" }), undefined, execute)
      ).rejects.toThrow(/cut off/);

      expect(execute).not.toHaveBeenCalled();
    });

    it("does not refuse a max_tokens stop when the last block is text rather than a tool call", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "Here's a long answer that ran out of room" }],
      });

      const result = await runAgent(
        "tell me everything",
        testUser(),
        aiConfig({ provider: "anthropic" }),
        undefined,
        vi.fn()
      );

      expect(result.stop).toBe("answered");
      expect(result.text).toBe("Here's a long answer that ran out of room");
    });
  });

  describe("gemini", () => {
    it("echoes the provider's id back on both the functionCall replay and the functionResponse when one was given", async () => {
      mockGeminiGenerate
        .mockResolvedValueOnce(geminiToolCallResponse("list_items", { status: "pending" }, "gcall_1"))
        .mockResolvedValueOnce(geminiTextResponse("done"));
      const execute = vi.fn().mockResolvedValue(okOutcome("item1"));

      await runAgent("list", testUser(), aiConfig({ provider: "gemini" }), undefined, execute);

      const secondRequest = mockGeminiGenerate.mock.calls[1][0];
      const contents = secondRequest.contents;
      const modelTurn = contents.find((c: { role: string }) => c.role === "model");
      expect(modelTurn.parts).toEqual([
        { functionCall: { name: "list_items", args: { status: "pending" }, id: "gcall_1" } },
      ]);

      const toolTurn = contents[contents.length - 1];
      expect(toolTurn).toEqual({
        role: "user",
        parts: [{ functionResponse: { name: "list_items", id: "gcall_1", response: { result: "item1" } } }],
      });
    });

    it("synthesizes a stable id for a call the provider returned with no id, but never echoes the stand-in back", async () => {
      mockGeminiGenerate
        .mockResolvedValueOnce(geminiToolCallResponse("list_items", {}, undefined))
        .mockResolvedValueOnce(geminiTextResponse("done"));
      const execute = vi.fn().mockResolvedValue(okOutcome("ok"));

      await runAgent("list", testUser(), aiConfig({ provider: "gemini" }), undefined, execute);

      expect(execute).toHaveBeenCalledWith({
        id: "list_items-0",
        name: "list_items",
        args: {},
        idIsSynthetic: true,
      });

      const secondRequest = mockGeminiGenerate.mock.calls[1][0];
      const contents = secondRequest.contents;
      const modelTurn = contents.find((c: { role: string }) => c.role === "model");
      expect(modelTurn.parts).toEqual([{ functionCall: { name: "list_items", args: {} } }]);

      const toolTurn = contents[contents.length - 1];
      expect(toolTurn.parts).toEqual([{ functionResponse: { name: "list_items", response: { result: "ok" } } }]);
    });
  });
});
