import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai", () => ({
  chatWithAi: vi.fn(),
}));
vi.mock("@/lib/services/execute-tool", () => ({
  executeToolCall: vi.fn(),
}));
vi.mock("@/lib/services/item", () => ({ createItem: vi.fn() }));
vi.mock("@/lib/services/category", () => ({ listCategories: vi.fn(), createCategory: vi.fn() }));
vi.mock("@/lib/services/calendar", () => ({ createEvent: vi.fn() }));

import { handleTodo, handleRemind, handleEvent } from "@/lib/services/commands/handlers";
import type { CommandContext } from "@/lib/services/commands";
import { chatWithAi } from "@/lib/services/ai";
import { executeToolCall } from "@/lib/services/execute-tool";
import { createItem } from "@/lib/services/item";
import { listCategories, createCategory } from "@/lib/services/category";
import { createEvent } from "@/lib/services/calendar";

const mockChatWithAi = vi.mocked(chatWithAi);
const mockExecuteToolCall = vi.mocked(executeToolCall);
const mockCreateItem = vi.mocked(createItem);
const mockListCategories = vi.mocked(listCategories);
const mockCreateCategory = vi.mocked(createCategory);
const mockCreateEvent = vi.mocked(createEvent);

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

describe("handleEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  const eventToolCall = {
    name: "create_calendar_event",
    args: {
      title: "Lunch with Sarah",
      start_time: "2026-05-18T12:00:00+08:00",
      end_time: "2026-05-18T13:00:00+08:00",
      description: "Catch up lunch",
    },
  };

  it("returns usage hint when body is empty", async () => {
    const result = await handleEvent("", ctx);
    expect(result).toContain("Usage");
    expect(mockChatWithAi).not.toHaveBeenCalled();
  });

  it("creates in-app item from AI-parsed event args", async () => {
    mockChatWithAi.mockResolvedValue({ text: "", toolCalls: [eventToolCall] });
    mockListCategories.mockResolvedValue([{ id: "c1", name: "Events", userId: "u1", color: null, createdAt: new Date() }]);
    mockCreateItem.mockResolvedValue({} as never);

    const result = await handleEvent("lunch with Sarah tomorrow at noon", ctx);

    expect(result).toContain("Lunch with Sarah");
    expect(mockCreateItem).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        categoryId: "c1",
        title: "Lunch with Sarah",
        dueDate: "2026-05-18",
        dueTime: "12:00",
      })
    );
  });

  it("syncs to Google Calendar when connected", async () => {
    const ctxWithGcal: CommandContext = {
      ...ctx,
      user: { ...ctx.user, googleRefreshToken: "enc-token", googleCalendarId: "primary" },
    };
    mockChatWithAi.mockResolvedValue({ text: "", toolCalls: [eventToolCall] });
    mockListCategories.mockResolvedValue([{ id: "c1", name: "Events", userId: "u1", color: null, createdAt: new Date() }]);
    mockCreateItem.mockResolvedValue({} as never);
    mockCreateEvent.mockResolvedValue({} as never);

    const result = await handleEvent("lunch with Sarah tomorrow at noon", ctxWithGcal);

    expect(mockCreateEvent).toHaveBeenCalledWith(
      "enc-token",
      "primary",
      expect.objectContaining({ title: "Lunch with Sarah" })
    );
    expect(result).toContain("Google Calendar");
  });

  it("skips Google Calendar sync when not connected", async () => {
    mockChatWithAi.mockResolvedValue({ text: "", toolCalls: [eventToolCall] });
    mockListCategories.mockResolvedValue([{ id: "c1", name: "Events", userId: "u1", color: null, createdAt: new Date() }]);
    mockCreateItem.mockResolvedValue({} as never);

    await handleEvent("lunch with Sarah tomorrow at noon", ctx);

    expect(mockCreateEvent).not.toHaveBeenCalled();
  });

  it("creates Events category if it doesn't exist", async () => {
    mockChatWithAi.mockResolvedValue({ text: "", toolCalls: [eventToolCall] });
    mockListCategories.mockResolvedValue([]);
    mockCreateCategory.mockResolvedValue({ id: "c2", name: "Events", userId: "u1", color: null, createdAt: new Date() });
    mockCreateItem.mockResolvedValue({} as never);

    await handleEvent("lunch with Sarah tomorrow at noon", ctx);

    expect(mockCreateCategory).toHaveBeenCalledWith({ userId: "u1", name: "Events" });
    expect(mockCreateItem).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "c2" }));
  });

  it("handles Google Calendar sync failure gracefully", async () => {
    const ctxWithGcal: CommandContext = {
      ...ctx,
      user: { ...ctx.user, googleRefreshToken: "enc-token", googleCalendarId: "primary" },
    };
    mockChatWithAi.mockResolvedValue({ text: "", toolCalls: [eventToolCall] });
    mockListCategories.mockResolvedValue([{ id: "c1", name: "Events", userId: "u1", color: null, createdAt: new Date() }]);
    mockCreateItem.mockResolvedValue({} as never);
    mockCreateEvent.mockRejectedValue(new Error("API error"));

    const result = await handleEvent("lunch with Sarah tomorrow at noon", ctxWithGcal);

    expect(result).toContain("Failed to sync");
    expect(mockCreateItem).toHaveBeenCalled();
  });

  it("returns fallback when AI produces no create_calendar_event tool call", async () => {
    mockChatWithAi.mockResolvedValue({ text: "Sure!", toolCalls: [] });

    const result = await handleEvent("something vague", ctx);

    expect(result).toContain("Usage");
    expect(mockCreateItem).not.toHaveBeenCalled();
  });
});
