import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai", () => ({
  chatWithAi: vi.fn(),
}));
vi.mock("@/lib/services/execute-tool", () => ({
  executeToolCall: vi.fn(),
}));

import { handleTodo, handleRemind } from "@/lib/services/commands/handlers";
import type { CommandContext } from "@/lib/services/commands";
import { chatWithAi } from "@/lib/services/ai";
import { executeToolCall } from "@/lib/services/execute-tool";

const mockChatWithAi = vi.mocked(chatWithAi);
const mockExecuteToolCall = vi.mocked(executeToolCall);

const ctx: CommandContext = {
  userId: "u1",
  user: {
    telegramUsername: "testuser",
    timezone: "Asia/Singapore",
    googleRefreshToken: null,
    googleCalendarId: null,
  },
  aiConfig: { provider: "openai", apiKey: "sk-test", model: "gpt-4o" },
};

describe("handleTodo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns usage hint when body is empty", async () => {
    const result = await handleTodo("", ctx);
    expect(result).toContain("Usage");
    expect(mockChatWithAi).not.toHaveBeenCalled();
  });

  it("sends focused prompt to AI and processes tool calls", async () => {
    mockChatWithAi.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "create_item", args: { title: "Buy milk", category: "General" } }],
    });
    mockExecuteToolCall.mockResolvedValue("Created Task: **Buy milk** in General");
    const result = await handleTodo("buy milk", ctx);
    expect(result).toContain("Buy milk");
    const prompt = mockChatWithAi.mock.calls[0][0];
    expect(prompt).toContain("/todo");
    expect(prompt).toContain("buy milk");
    expect(prompt).toContain("create_item");
    expect(prompt).toContain("Do NOT set remind_at");
  });

  it("returns fallback when AI produces no tool calls", async () => {
    mockChatWithAi.mockResolvedValue({ text: "Sure!", toolCalls: [] });
    const result = await handleTodo("something vague", ctx);
    expect(result).toContain("Usage");
  });

  it("passes user context to chatWithAi", async () => {
    mockChatWithAi.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "create_item", args: { title: "Call dentist", category: "General" } }],
    });
    mockExecuteToolCall.mockResolvedValue("Created Task: **Call dentist** in General");
    await handleTodo("call dentist", ctx);
    const [, userArg, configArg] = mockChatWithAi.mock.calls[0];
    expect(userArg.telegramUsername).toBe("testuser");
    expect(userArg.timezone).toBe("Asia/Singapore");
    expect(configArg).toEqual(ctx.aiConfig);
  });

  it("joins multiple tool call results", async () => {
    mockChatWithAi.mockResolvedValue({
      text: "",
      toolCalls: [
        { name: "create_item", args: { title: "Task A", category: "General" } },
        { name: "create_item", args: { title: "Task B", category: "General" } },
      ],
    });
    mockExecuteToolCall
      .mockResolvedValueOnce("Created Task: **Task A** in General")
      .mockResolvedValueOnce("Created Task: **Task B** in General");
    const result = await handleTodo("two tasks", ctx);
    expect(result).toContain("Task A");
    expect(result).toContain("Task B");
  });
});

describe("handleRemind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns usage hint when body is empty", async () => {
    const result = await handleRemind("", ctx);
    expect(result).toContain("Usage");
    expect(mockChatWithAi).not.toHaveBeenCalled();
  });

  it("sends focused prompt requiring remind_at", async () => {
    mockChatWithAi.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "create_item", args: { title: "Take meds", category: "Reminders", remind_at: "2026-05-17T09:00:00+08:00" } }],
    });
    mockExecuteToolCall.mockResolvedValue("Created Reminder: **Take meds** in Reminders");
    const result = await handleRemind("take meds daily at 9am", ctx);
    expect(result).toContain("Take meds");
    const prompt = mockChatWithAi.mock.calls[0][0];
    expect(prompt).toContain("/remind");
    expect(prompt).toContain("MUST set remind_at");
  });

  it("returns fallback when AI produces no tool calls", async () => {
    mockChatWithAi.mockResolvedValue({ text: "OK!", toolCalls: [] });
    const result = await handleRemind("something vague", ctx);
    expect(result).toContain("Usage");
  });

  it("passes user context to chatWithAi", async () => {
    mockChatWithAi.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "create_item", args: { title: "Morning standup", category: "Reminders", remind_at: "2026-05-17T09:00:00+08:00" } }],
    });
    mockExecuteToolCall.mockResolvedValue("Created Reminder: **Morning standup** in Reminders");
    await handleRemind("morning standup at 9am", ctx);
    const [, userArg, configArg] = mockChatWithAi.mock.calls[0];
    expect(userArg.telegramUsername).toBe("testuser");
    expect(userArg.timezone).toBe("Asia/Singapore");
    expect(configArg).toEqual(ctx.aiConfig);
  });

  it("prompt includes Reminders category default instruction", async () => {
    mockChatWithAi.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "create_item", args: { title: "Call mom", category: "Reminders", remind_at: "2026-05-17T09:00:00+08:00" } }],
    });
    mockExecuteToolCall.mockResolvedValue("Created Reminder: **Call mom** in Reminders");
    await handleRemind("call mom tomorrow", ctx);
    const prompt = mockChatWithAi.mock.calls[0][0];
    expect(prompt).toContain("Reminders");
    expect(prompt).toContain("call mom tomorrow");
  });
});
