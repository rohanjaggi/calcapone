import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/services/commands/handlers", () => ({
  handleDone: vi.fn(async () => ({ text: "done-reply" })),
  handleToday: vi.fn(async () => ({ text: "today-reply" })),
  handleList: vi.fn(async () => ({ text: "list-reply" })),
  handleTimezone: vi.fn(async () => ({ text: "tz-reply" })),
  handleUndo: vi.fn(async () => ({ text: "undo-reply" })),
  handleWeek: vi.fn(async () => ({ text: "week-reply" })),
  handleNote: vi.fn(async () => ({ text: "note-reply" })),
  handleSearch: vi.fn(async () => ({ text: "search-reply" })),
  handleCourses: vi.fn(async () => ({ text: "courses-reply" })),
  handleExams: vi.fn(async () => ({ text: "exams-reply" })),
  handleDue: vi.fn(async () => ({ text: "due-reply" })),
}));

import { parseSlashCommand, isAiHintCommand, handleCommand, HELP_TEXT, type CommandContext } from "@/lib/services/commands";
import { handleUndo, handleWeek, handleNote, handleSearch, handleCourses, handleExams, handleDue } from "@/lib/services/commands/handlers";

describe("parseSlashCommand", () => {
  it("parses /todo with body", () => {
    const result = parseSlashCommand("/todo buy milk");
    expect(result).toEqual({ command: "todo", body: "buy milk" });
  });

  it("parses /event with body", () => {
    const result = parseSlashCommand("/event team lunch tomorrow at noon");
    expect(result).toEqual({ command: "event", body: "team lunch tomorrow at noon" });
  });

  it("parses /remind with body", () => {
    const result = parseSlashCommand("/remind call dentist in 2 hours");
    expect(result).toEqual({ command: "remind", body: "call dentist in 2 hours" });
  });

  it("parses /done with body", () => {
    const result = parseSlashCommand("/done buy milk");
    expect(result).toEqual({ command: "done", body: "buy milk" });
  });

  it("parses /today with no body", () => {
    const result = parseSlashCommand("/today");
    expect(result).toEqual({ command: "today", body: "" });
  });

  it("parses /list with no body", () => {
    const result = parseSlashCommand("/list");
    expect(result).toEqual({ command: "list", body: "" });
  });

  it("parses /help", () => {
    const result = parseSlashCommand("/help");
    expect(result).toEqual({ command: "help", body: "" });
  });

  it("handles @botname suffix (e.g. /todo@calcapone_bot buy milk)", () => {
    const result = parseSlashCommand("/todo@calcapone_bot buy milk");
    expect(result).toEqual({ command: "todo", body: "buy milk" });
  });

  it("handles @botname suffix with no body", () => {
    const result = parseSlashCommand("/list@calcapone_bot");
    expect(result).toEqual({ command: "list", body: "" });
  });

  it("returns null for non-command messages", () => {
    const result = parseSlashCommand("just a regular message");
    expect(result).toBeNull();
  });

  it("returns null for unknown commands", () => {
    const result = parseSlashCommand("/unknown something");
    expect(result).toBeNull();
  });

  it("normalizes command to lowercase", () => {
    const result = parseSlashCommand("/TODO buy milk");
    expect(result).toEqual({ command: "todo", body: "buy milk" });
  });

  it("handles multiline body", () => {
    const result = parseSlashCommand("/todo line one\nline two\nline three");
    expect(result).toEqual({ command: "todo", body: "line one\nline two\nline three" });
  });

  it("returns null for empty string", () => {
    const result = parseSlashCommand("");
    expect(result).toBeNull();
  });

  it("returns null for message starting with / but not a valid command", () => {
    const result = parseSlashCommand("/123notacommand");
    expect(result).toBeNull();
  });

  it("trims whitespace from body", () => {
    const result = parseSlashCommand("/todo   buy milk   ");
    expect(result).toEqual({ command: "todo", body: "buy milk" });
  });

  it("parses /undo with no body", () => {
    expect(parseSlashCommand("/undo")).toEqual({ command: "undo", body: "" });
  });

  it("parses /week with no body", () => {
    expect(parseSlashCommand("/week")).toEqual({ command: "week", body: "" });
  });

  it("parses /note with body", () => {
    expect(parseSlashCommand("/note pick up dry cleaning")).toEqual({
      command: "note",
      body: "pick up dry cleaning",
    });
  });

  it("parses /search with body", () => {
    expect(parseSlashCommand("/search milk")).toEqual({ command: "search", body: "milk" });
  });

  it("parses /courses with no body", () => {
    expect(parseSlashCommand("/courses")).toEqual({ command: "courses", body: "" });
  });

  it("parses /courses add with body", () => {
    expect(parseSlashCommand("/courses add CS2040 Data Structures")).toEqual({
      command: "courses",
      body: "add CS2040 Data Structures",
    });
  });

  it("parses /exams with no body", () => {
    expect(parseSlashCommand("/exams")).toEqual({ command: "exams", body: "" });
  });

  it("parses /due with body", () => {
    expect(parseSlashCommand("/due CS2040")).toEqual({ command: "due", body: "CS2040" });
  });
});

describe("isAiHintCommand", () => {
  it("returns true for AI-routed commands", () => {
    expect(isAiHintCommand("todo")).toBe(true);
    expect(isAiHintCommand("remind")).toBe(true);
    expect(isAiHintCommand("event")).toBe(true);
  });

  it("returns false for DB-direct commands", () => {
    expect(isAiHintCommand("done")).toBe(false);
    expect(isAiHintCommand("today")).toBe(false);
    expect(isAiHintCommand("list")).toBe(false);
    expect(isAiHintCommand("start")).toBe(false);
    expect(isAiHintCommand("help")).toBe(false);
    expect(isAiHintCommand("undo")).toBe(false);
    expect(isAiHintCommand("week")).toBe(false);
    expect(isAiHintCommand("note")).toBe(false);
    expect(isAiHintCommand("search")).toBe(false);
    expect(isAiHintCommand("courses")).toBe(false);
    expect(isAiHintCommand("exams")).toBe(false);
    expect(isAiHintCommand("due")).toBe(false);
  });
});

describe("handleCommand", () => {
  const ctx: CommandContext = {
    userId: "u1",
    chatId: 42,
    user: {
      telegramUsername: "t",
      timezone: "Asia/Singapore",
      googleRefreshToken: null,
      googleCalendarId: null,
      eventReminderMinutes: null,
    },
  };

  it("routes /undo to handleUndo", async () => {
    const result = await handleCommand({ command: "undo", body: "" }, ctx);
    expect(handleUndo).toHaveBeenCalledWith(ctx);
    expect(result).toEqual({ text: "undo-reply" });
  });

  it("routes /week to handleWeek", async () => {
    const result = await handleCommand({ command: "week", body: "" }, ctx);
    expect(handleWeek).toHaveBeenCalledWith(ctx);
    expect(result).toEqual({ text: "week-reply" });
  });

  it("routes /note to handleNote with the body", async () => {
    const result = await handleCommand({ command: "note", body: "buy milk" }, ctx);
    expect(handleNote).toHaveBeenCalledWith("buy milk", ctx);
    expect(result).toEqual({ text: "note-reply" });
  });

  it("routes /search to handleSearch with the body", async () => {
    const result = await handleCommand({ command: "search", body: "milk" }, ctx);
    expect(handleSearch).toHaveBeenCalledWith("milk", ctx);
    expect(result).toEqual({ text: "search-reply" });
  });

  it("routes /courses to handleCourses with the body", async () => {
    const result = await handleCommand({ command: "courses", body: "add CS2040 Data Structures" }, ctx);
    expect(handleCourses).toHaveBeenCalledWith("add CS2040 Data Structures", ctx);
    expect(result).toEqual({ text: "courses-reply" });
  });

  it("routes /exams to handleExams", async () => {
    const result = await handleCommand({ command: "exams", body: "" }, ctx);
    expect(handleExams).toHaveBeenCalledWith(ctx);
    expect(result).toEqual({ text: "exams-reply" });
  });

  it("routes /due to handleDue with the body", async () => {
    const result = await handleCommand({ command: "due", body: "CS2040" }, ctx);
    expect(handleDue).toHaveBeenCalledWith("CS2040", ctx);
    expect(result).toEqual({ text: "due-reply" });
  });

  it("returns the help text wrapped in a CommandReply for /help and /start", async () => {
    expect(await handleCommand({ command: "help", body: "" }, ctx)).toEqual({ text: HELP_TEXT });
    expect(await handleCommand({ command: "start", body: "" }, ctx)).toEqual({ text: HELP_TEXT });
  });

  it("returns an unknown-command reply for unregistered commands", async () => {
    const result = await handleCommand({ command: "bogus", body: "" }, ctx);
    expect(result.text).toContain("Unknown command");
  });
});
