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
    { command: "todo", description: "Create a todo — /todo buy groceries by Friday" },
    { command: "remind", description: "Set a reminder — /remind medication daily 9am" },
    { command: "event", description: "Create calendar event — /event lunch tomorrow noon" },
    { command: "done", description: "Complete a task — /done buy groceries" },
    { command: "today", description: "Today's agenda" },
    { command: "list", description: "List pending tasks" },
    { command: "help", description: "Show available commands" },
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
  };
};
