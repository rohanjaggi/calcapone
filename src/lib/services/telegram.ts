const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return token;
}

const MAX_MESSAGE_LENGTH = 4096;

/** Telegram caps `callback_data` at 64 bytes — longer payloads are rejected at send time. */
export const MAX_CALLBACK_DATA_BYTES = 64;

/**
 * The chat is permanently unreachable — the user blocked the bot, or deleted the chat.
 * Distinct from a transient failure because retrying can never succeed: callers should
 * drop the message rather than re-queue it.
 */
export class TelegramBlockedError extends Error {
  constructor(public readonly chatId: string) {
    super(`Telegram chat ${chatId} is unreachable (bot blocked or chat deleted)`);
    this.name = "TelegramBlockedError";
  }
}

/** HTML-escape text that will be interpolated into a Telegram HTML-mode message. */
export function esc(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Bold helper: escapes the content and wraps it in <b>. */
export function b(text: unknown): string {
  return `<b>${esc(text)}</b>`;
}

// Private-use codepoints: they cannot occur in model output, so parked code spans can be
// restored without a plain number in the prose being mistaken for a placeholder.
const PARK_OPEN = "";
const PARK_CLOSE = "";

/**
 * Render the model's Markdown as Telegram HTML.
 *
 * Models emit Markdown no matter how firmly the prompt asks them not to, and Telegram's
 * HTML parse mode renders none of it — so `**due Friday**` reached the user with the
 * asterisks still attached. Escaping happens first, so any HTML in the model's own output
 * is already inert before these rules run.
 */
export function mdToHtml(raw: string): string {
  const parked: string[] = [];
  const park = (html: string): string => {
    parked.push(html);
    return `${PARK_OPEN}${parked.length - 1}${PARK_CLOSE}`;
  };

  // Code spans go first so their contents can never be reinterpreted as emphasis.
  const withoutCode = esc(raw)
    .replace(/```(?:[a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_m, code: string) =>
      park(`<pre>${code.replace(/\n$/, "")}</pre>`)
    )
    .replace(/`([^`\n]+)`/g, (_m, code: string) => park(`<code>${code}</code>`));

  const formatted = withoutCode
    // Headers carry no size in Telegram; bold is the closest honest equivalent.
    .replace(/^#{1,6}[ \t]+(.+)$/gm, "<b>$1</b>")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/\*\*([^\n]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([^\n]+?)__/g, "<b>$1</b>")
    .replace(/~~([^\n]+?)~~/g, "<s>$1</s>")
    // Single-char emphasis last, and only when not touching a word character, so
    // snake_case identifiers and `3 * 4` survive intact.
    .replace(/(^|[^\w*])\*([^\s*][^*\n]*?)\*(?![\w*])/g, "$1<i>$2</i>")
    .replace(/(^|[^\w_])_([^\s_][^_\n]*?)_(?![\w_])/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

  return formatted.replace(
    new RegExp(`${PARK_OPEN}(\\d+)${PARK_CLOSE}`, "g"),
    (_m, index: string) => parked[Number(index)] ?? ""
  );
}

/**
 * Flatten Telegram HTML back to plain text.
 *
 * Assistant turns are replayed to the model as conversation history. Storing them with
 * markup taught it to emit `<b>` itself, which then got escaped on the way out and reached
 * the user as literal tags — so history keeps the words and drops the formatting.
 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Split a long message on newline boundaries so each chunk fits Telegram's 4096-char limit. */
export function chunkMessage(text: string, limit = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

export type InlineButton = { text: string; callback_data: string };
export type InlineKeyboard = InlineButton[][];

/** Drop buttons whose payload exceeds Telegram's 64-byte cap rather than failing the send. */
export function sanitizeKeyboard(keyboard: InlineKeyboard): InlineKeyboard {
  return keyboard
    .map((row) => row.filter((btn) => Buffer.byteLength(btn.callback_data, "utf8") <= MAX_CALLBACK_DATA_BYTES))
    .filter((row) => row.length > 0);
}

type TelegramResult =
  | { ok: true; result: unknown }
  | { ok: false; status: number; body: string };

const MAX_ATTEMPTS = 3;
/** Wait longer than this and the serverless invocation times out anyway — let cron retry. */
const MAX_RETRY_AFTER_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Bot API call, retrying only what is worth retrying.
 *
 * 429 carries `parameters.retry_after`; honouring it is the difference between a burst of
 * reminders being delivered and Telegram discarding them. 5xx and network faults get a
 * short backoff. 403 is raised as {@link TelegramBlockedError} because no retry can fix it.
 */
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<TelegramResult> {
  let last: { status: number; body: string } = { status: 0, body: "no attempt made" };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${TELEGRAM_API}${getToken()}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      last = { status: 0, body: error instanceof Error ? error.message : "network error" };
      if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt);
      continue;
    }

    if (res.ok) return { ok: true, result: await res.json() };

    const body = await res.text();
    last = { status: res.status, body };

    if (res.status === 403) throw new TelegramBlockedError(String(payload.chat_id ?? "unknown"));

    if (res.status === 429) {
      const retryAfterMs = parseRetryAfter(body);
      if (retryAfterMs === null || retryAfterMs > MAX_RETRY_AFTER_MS || attempt === MAX_ATTEMPTS) {
        return { ok: false, ...last };
      }
      await sleep(retryAfterMs);
      continue;
    }

    if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(500 * attempt);
      continue;
    }

    return { ok: false, ...last };
  }

  return { ok: false, ...last };
}

function parseRetryAfter(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { parameters?: { retry_after?: number } };
    const seconds = parsed.parameters?.retry_after;
    return typeof seconds === "number" && seconds >= 0 ? seconds * 1000 : null;
  } catch {
    return null;
  }
}

type SendOptions = { parseMode?: "HTML" | null; keyboard?: InlineKeyboard };

/**
 * Send a message (HTML parse mode by default). Long messages are chunked; buttons ride on
 * the final chunk so they land at the bottom of the conversation.
 *
 * If Telegram rejects the HTML entities the chunk is retried once as plain text, so the
 * user still gets the content instead of nothing.
 */
export async function sendMessage(chatId: number | bigint, text: string, options: SendOptions = {}) {
  const parseMode = options.parseMode === undefined ? "HTML" : options.parseMode;
  const keyboard = options.keyboard ? sanitizeKeyboard(options.keyboard) : undefined;
  const chunks = chunkMessage(text);
  let last: unknown = null;

  for (const [index, chunk] of chunks.entries()) {
    const isLast = index === chunks.length - 1;
    const payload = (mode: "HTML" | null) => ({
      chat_id: chatId.toString(),
      text: chunk,
      ...(mode ? { parse_mode: mode } : {}),
      link_preview_options: { is_disabled: true },
      ...(isLast && keyboard?.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });

    let res = await callTelegram("sendMessage", payload(parseMode));

    const entityError =
      !res.ok &&
      res.status === 400 &&
      Boolean(parseMode) &&
      /parse entities|can't find end|unsupported start tag|can't parse/i.test(res.body);
    if (entityError) res = await callTelegram("sendMessage", payload(null));

    if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${res.body}`);
    last = res.result;
  }

  return last;
}

/** Best-effort send that never throws (for error replies inside catch blocks). */
export async function sendMessageSafe(chatId: number | bigint, text: string, options: SendOptions = {}) {
  try {
    return await sendMessage(chatId, text, options);
  } catch (error) {
    console.error("[telegram] sendMessage failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Show the "typing" indicator. Fire-and-forget: an AI turn takes several seconds and this
 * is the only signal the user gets that anything is happening, but never worth failing over.
 */
export async function sendTyping(chatId: number | bigint): Promise<void> {
  try {
    await callTelegram("sendChatAction", { chat_id: chatId.toString(), action: "typing" });
  } catch {
  }
}

/**
 * Acknowledge a button press. Telegram spins the button until this returns, so it must be
 * sent on every path — including failures — and must never throw.
 */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await callTelegram("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text, show_alert: false } : {}),
    });
  } catch {
  }
}

/**
 * Rewrite an already-sent message, dropping its buttons unless new ones are supplied.
 * Turns a fired reminder into its own receipt instead of stacking a second message.
 */
export async function editMessageText(
  chatId: number | bigint,
  messageId: number,
  text: string,
  options: SendOptions = {}
): Promise<boolean> {
  const keyboard = options.keyboard ? sanitizeKeyboard(options.keyboard) : undefined;
  const res = await callTelegram("editMessageText", {
    chat_id: chatId.toString(),
    message_id: messageId,
    text: text.slice(0, MAX_MESSAGE_LENGTH),
    ...(options.parseMode === null ? {} : { parse_mode: "HTML" }),
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });
  if (!res.ok) console.error(`[telegram] editMessageText failed: ${res.status} ${res.body}`);
  return res.ok;
}

export async function setWebhook(url: string, secret: string) {
  const res = await callTelegram("setWebhook", {
    url,
    secret_token: secret,
    // callback_query is required for the reminder action buttons to reach us at all.
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!res.ok) throw new Error(`Telegram setWebhook failed: ${res.status} ${res.body}`);
  return res.result;
}

export async function setMyCommands() {
  const commands = [
    { command: "todo", description: "Add a task" },
    { command: "remind", description: "Set a reminder" },
    { command: "event", description: "Create a calendar event" },
    { command: "done", description: "Mark a task complete" },
    { command: "today", description: "Today's agenda" },
    { command: "list", description: "All pending tasks" },
    { command: "help", description: "Show commands" },
  ];

  const res = await callTelegram("setMyCommands", { commands });
  if (!res.ok) throw new Error(`Telegram setMyCommands failed: ${res.status} ${res.body}`);
  return res.result;
}

export async function setChatMenuButton(webAppUrl: string) {
  const res = await callTelegram("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Open Calcapone", web_app: { url: webAppUrl } },
  });
  if (!res.ok) throw new Error(`Telegram setChatMenuButton failed: ${res.status} ${res.body}`);
  return res.result;
}

/** Webhook health — `last_error_message` is the fastest way to see why updates stopped. */
export async function getWebhookInfo() {
  const res = await callTelegram("getWebhookInfo", {});
  if (!res.ok) throw new Error(`Telegram getWebhookInfo failed: ${res.status} ${res.body}`);
  return res.result;
}

export async function getFileUrl(fileId: string): Promise<string> {
  const res = await callTelegram("getFile", { file_id: fileId });
  if (!res.ok) throw new Error(`getFile failed: ${res.status} ${res.body}`);
  const filePath = (res.result as { result: { file_path: string } }).result.file_path;
  return `https://api.telegram.org/file/bot${getToken()}/${filePath}`;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export type TelegramMessage = {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
  voice?: {
    file_id: string;
    file_unique_id: string;
    duration: number;
    mime_type?: string;
    file_size?: number;
  };
};

export type TelegramCallbackQuery = {
  id: string;
  from: { id: number; is_bot: boolean; first_name: string; username?: string };
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};
