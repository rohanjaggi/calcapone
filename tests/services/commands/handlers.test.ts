import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/ai", () => ({
  chatWithAi: vi.fn(),
}));
vi.mock("@/lib/services/execute-tool", () => ({
  executeToolCall: vi.fn(),
}));
vi.mock("@/lib/services/item", () => ({ createItem: vi.fn(), listItems: vi.fn(), updateItem: vi.fn() }));
vi.mock("@/lib/services/category", () => ({ listCategories: vi.fn(), createCategory: vi.fn() }));
vi.mock("@/lib/services/calendar", () => ({ createEvent: vi.fn(), getEvents: vi.fn() }));

import { handleTodo, handleRemind, handleEvent, handleDone, handleToday, handleList } from "@/lib/services/commands/handlers";
import type { CommandContext } from "@/lib/services/commands";
import { chatWithAi } from "@/lib/services/ai";
import { executeToolCall } from "@/lib/services/execute-tool";
import { createItem, listItems, updateItem } from "@/lib/services/item";
import { listCategories, createCategory } from "@/lib/services/category";
import { createEvent, getEvents } from "@/lib/services/calendar";

const mockChatWithAi = vi.mocked(chatWithAi);
const mockExecuteToolCall = vi.mocked(executeToolCall);
const mockCreateItem = vi.mocked(createItem);
const mockListItems = vi.mocked(listItems);
const mockUpdateItem = vi.mocked(updateItem);
const mockListCategories = vi.mocked(listCategories);
const mockCreateCategory = vi.mocked(createCategory);
const mockCreateEvent = vi.mocked(createEvent);
const mockGetEvents = vi.mocked(getEvents);

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

describe("handleDone", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeItem = (id: string, title: string) => ({
    id,
    title,
    userId: "u1",
    categoryId: "c1",
    description: null,
    status: "pending" as const,
    priority: "medium" as const,
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: "c1", name: "General", userId: "u1", color: null, createdAt: new Date() },
  });

  it("returns usage hint when body is empty", async () => {
    const result = await handleDone("", ctx);
    expect(result).toContain("Usage");
    expect(mockListItems).not.toHaveBeenCalled();
  });

  it("completes a matching item by fuzzy title", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy groceries"), makeItem("i2", "Call dentist")]);
    mockUpdateItem.mockResolvedValue(makeItem("i1", "Buy groceries") as never);

    const result = await handleDone("groceries", ctx);

    expect(mockUpdateItem).toHaveBeenCalledWith("i1", "u1", { status: "done" });
    expect(result).toContain("Buy groceries");
    expect(result).toContain("Completed");
  });

  it("returns not-found message when no match", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy groceries")]);

    const result = await handleDone("dentist", ctx);

    expect(result).toContain("dentist");
    expect(result).toContain("No pending task");
    expect(mockUpdateItem).not.toHaveBeenCalled();
  });
});

describe("handleToday", () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

  const makeItem = (overrides: Partial<{
    id: string;
    title: string;
    dueDate: string | null;
    remindAt: Date | null;
    dueTime: string | null;
  }>) => ({
    id: "i1",
    title: "Test task",
    userId: "u1",
    categoryId: "c1",
    description: null,
    status: "pending" as const,
    priority: "medium" as const,
    dueDate: null,
    dueTime: null,
    remindAt: null,
    recurring: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: "c1", name: "General", userId: "u1", color: null, createdAt: new Date() },
    ...overrides,
  });

  it("shows tasks due today", async () => {
    mockListItems.mockResolvedValue([
      makeItem({ id: "i1", title: "Morning standup", dueDate: todayStr, remindAt: null }),
    ]);

    const result = await handleToday(ctx);

    expect(result).toContain("Morning standup");
    expect(result).toContain("Tasks due today");
  });

  it("shows empty message when nothing scheduled", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleToday(ctx);

    expect(result).toBe("Nothing scheduled for today!");
  });

  it("includes Google Calendar events when connected", async () => {
    const ctxWithGcal: CommandContext = {
      ...ctx,
      user: { ...ctx.user, googleRefreshToken: "enc-token", googleCalendarId: "primary" },
    };
    mockListItems.mockResolvedValue([]);
    mockGetEvents.mockResolvedValue([
      { id: "e1", title: "Team sync", startTime: "10:00 AM", endTime: "10:30 AM", description: null },
    ]);

    const result = await handleToday(ctxWithGcal);

    expect(mockGetEvents).toHaveBeenCalledWith(
      "enc-token",
      "primary",
      expect.any(Date),
      expect.any(Date)
    );
    expect(result).toContain("Team sync");
    expect(result).toContain("Calendar");
  });
});

describe("handleList", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeItem = (id: string, title: string, remindAt: Date | null = null, dueDate: string | null = null) => ({
    id,
    title,
    userId: "u1",
    categoryId: "c1",
    description: null,
    status: "pending" as const,
    priority: "medium" as const,
    dueDate,
    dueTime: null,
    remindAt,
    recurring: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: { id: "c1", name: "General", userId: "u1", color: null, createdAt: new Date() },
  });

  it("lists pending items by default", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Write tests")]);

    const result = await handleList("", ctx);

    expect(mockListItems).toHaveBeenCalledWith("u1", { status: "pending" });
    expect(result).toContain("Buy milk");
    expect(result).toContain("Write tests");
  });

  it("lists all items when body is 'all'", async () => {
    mockListItems.mockResolvedValue([makeItem("i1", "Buy milk"), makeItem("i2", "Done task")]);

    await handleList("all", ctx);

    expect(mockListItems).toHaveBeenCalledWith("u1", {});
  });

  it("returns empty message when no items", async () => {
    mockListItems.mockResolvedValue([]);

    const result = await handleList("", ctx);

    expect(result).toBe("No items found.");
  });
});
