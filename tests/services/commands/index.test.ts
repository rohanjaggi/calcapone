import { describe, it, expect } from "vitest";
import { parseSlashCommand, COMMANDS } from "@/lib/services/commands";

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
});

describe("COMMANDS", () => {
  it("contains expected commands", () => {
    expect(COMMANDS.has("todo")).toBe(true);
    expect(COMMANDS.has("remind")).toBe(true);
    expect(COMMANDS.has("event")).toBe(true);
    expect(COMMANDS.has("done")).toBe(true);
    expect(COMMANDS.has("today")).toBe(true);
    expect(COMMANDS.has("list")).toBe(true);
    expect(COMMANDS.has("start")).toBe(true);
    expect(COMMANDS.has("help")).toBe(true);
  });
});
