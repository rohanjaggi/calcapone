// src/app/api/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { findOrCreateUser, decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";
import { sendMessage } from "@/lib/services/telegram";
import { executeToolCall } from "@/lib/services/execute-tool";
import type { TelegramUpdate } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update: TelegramUpdate = await request.json();
  const message = update.message;
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true });
  }

  const telegramId = BigInt(message.from.id);
  const username = message.from.username ?? message.from.first_name;
  const chatId = message.chat.id;

  const user = await findOrCreateUser(telegramId, username);
  const aiApiKey = decryptUserApiKey(user.aiApiKey);

  try {
    const { text, toolCalls } = await chatWithAi(
      message.text,
      { telegramUsername: user.telegramUsername, timezone: user.timezone },
      { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel }
    );

    const results: string[] = [];

    for (const call of toolCalls) {
      const result = await executeToolCall(call.name, call.args, user.id, user);
      if (result) results.push(result);
    }

    const response = [text, ...results].filter(Boolean).join("\n\n");
    if (response) {
      await sendMessage(chatId, response);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Something went wrong";
    await sendMessage(chatId, `Sorry, I ran into an error: ${errMsg}`);
  }

  return NextResponse.json({ ok: true });
}
