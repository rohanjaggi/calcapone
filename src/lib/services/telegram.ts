const TELEGRAM_API = "https://api.telegram.org/bot";

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return token;
}

export async function sendMessage(chatId: number | bigint, text: string) {
  const res = await fetch(`${TELEGRAM_API}${getToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId.toString(),
      text,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
  return res.json();
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
