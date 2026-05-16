import type { CommandContext } from "./index";

export async function handleTodo(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}

export async function handleRemind(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}

export async function handleEvent(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}

export async function handleDone(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}

export async function handleToday(
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}

export async function handleList(
  _body: string,
  _ctx: CommandContext
): Promise<string> {
  return "Not implemented";
}
