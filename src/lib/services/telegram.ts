const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return token;
}

const MAX_MESSAGE_LENGTH = 4096;

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

type SendOptions = { parseMode?: "HTML" | null };

async function postSendMessage(chatId: number | bigint, text: string, parseMode: "HTML" | null) {
  const res = await fetch(`${TELEGRAM_API}${getToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.toString(),
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      link_preview_options: { is_disabled: true },
    }),
  });
  return res;
}

/**
 * Send a message (HTML parse mode by default). Long messages are chunked.
 * If Telegram rejects the HTML entities, the chunk is retried once as plain text
 * so the user still gets the content instead of nothing.
 */
export async function sendMessage(chatId: number | bigint, text: string, options: SendOptions = {}) {
  const parseMode = options.parseMode === undefined ? "HTML" : options.parseMode;
  let last: unknown = null;
  for (const chunk of chunkMessage(text)) {
    let res = await postSendMessage(chatId, chunk, parseMode);
    if (!res.ok && res.status === 400 && parseMode) {
      const body = await res.text();
      if (/parse entities|can't find end|unsupported start tag|can't parse/i.test(body)) {
        res = await postSendMessage(chatId, chunk, null);
      } else {
        throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
      }
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
    }
    last = await res.json();
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

export async function setWebhook(url: string, secret: string) {
  const res = await fetch(`${TELEGRAM_API}${getToken()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message"],
    }),
  });
  return res.json();
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

  const res = await fetch(`${TELEGRAM_API}${getToken()}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram setMyCommands failed: ${res.status} ${body}`);
  }

  return res.json();
}

export async function setChatMenuButton(webAppUrl: string) {
  const res = await fetch(`${TELEGRAM_API}${getToken()}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: {
        type: "web_app",
        text: "Open Calcapone",
        web_app: { url: webAppUrl },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram setChatMenuButton failed: ${res.status} ${body}`);
  }

  return res.json();
}

export async function getFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${TELEGRAM_API}${getToken()}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
  const data = await res.json();
  const filePath = data.result.file_path;
  return `https://api.telegram.org/file/bot${getToken()}/${filePath}`;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
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
    voice?: {
      file_id: string;
      file_unique_id: string;
      duration: number;
      mime_type?: string;
      file_size?: number;
    };
  };
};
