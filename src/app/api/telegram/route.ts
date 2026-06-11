import { NextRequest, NextResponse } from "next/server";
import { findOrCreateUser, decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";
import { sendMessage } from "@/lib/services/telegram";
import { executeToolCall } from "@/lib/services/execute-tool";
import { parseSlashCommand, handleCommand, isAiHintCommand, getAiHint } from "@/lib/services/commands";
import { listCategories } from "@/lib/services/category";
import { getRecentMessages, saveMessage } from "@/lib/services/conversation";
import type { TelegramUpdate } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update: TelegramUpdate = await request.json();
  const message = update.message;
  if (!message?.from || (!message.text && !message.voice)) {
    return NextResponse.json({ ok: true });
  }

  const telegramId = BigInt(message.from.id);
  const username = message.from.username ?? message.from.first_name;
  const chatId = message.chat.id;

  const user = await findOrCreateUser(telegramId, username);
  const aiApiKey = decryptUserApiKey(user.aiApiKey);
  const aiConfig = { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel };

  let messageText = message.text ?? "";

  if (message.voice && !messageText) {
    try {
      const { downloadFile } = await import("@/lib/services/telegram");
      const { transcribeVoice } = await import("@/lib/services/transcribe");
      const audioBuffer = await downloadFile(message.voice.file_id);
      messageText = await transcribeVoice(audioBuffer, aiConfig);
      if (!messageText.trim()) {
        await sendMessage(chatId, "I couldn't understand that voice message. Try again?");
        return NextResponse.json({ ok: true });
      }
    } catch {
      await sendMessage(chatId, "Sorry, I couldn't process that voice message.");
      return NextResponse.json({ ok: true });
    }
  }

  try {
    const parsed = parseSlashCommand(messageText);

    if (parsed && !isAiHintCommand(parsed.command)) {
      const response = await handleCommand(parsed, {
        userId: user.id,
        user: {
          telegramUsername: user.telegramUsername,
          timezone: user.timezone,
          googleRefreshToken: user.googleRefreshToken,
          googleCalendarId: user.googleCalendarId,
        },
      });
      await sendMessage(chatId, response);
    } else {
      let userMessage = messageText;
      if (parsed && isAiHintCommand(parsed.command)) {
        if (!parsed.body) {
          await sendMessage(chatId, `Usage: /${parsed.command} <description>`);
          return NextResponse.json({ ok: true });
        }
        userMessage = `${getAiHint(parsed.command)} ${parsed.body}`;
      }

      const categories = await listCategories(user.id);
      const categoryNames = categories.map((c) => c.name);
      const history = await getRecentMessages(user.id, chatId);
      await saveMessage(user.id, chatId, "user", userMessage);

      const { text, toolCalls } = await chatWithAi(
        userMessage,
        { telegramUsername: user.telegramUsername, timezone: user.timezone, categories: categoryNames },
        aiConfig,
        history
      );

      const results: string[] = [];
      for (const call of toolCalls) {
        const result = await executeToolCall(call.name, call.args, user.id, user);
        if (result) results.push(result);
      }

      const response = [text, ...results].filter(Boolean).join("\n\n");
      if (response) {
        await saveMessage(user.id, chatId, "assistant", response.slice(0, 500));
        await sendMessage(chatId, response);
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Something went wrong";
    await sendMessage(chatId, `Sorry, I ran into an error: ${errMsg}`);
  }

  return NextResponse.json({ ok: true });
}
