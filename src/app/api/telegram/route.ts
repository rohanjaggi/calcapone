import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateUser, decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi } from "@/lib/services/ai";
import { sendMessage, sendMessageSafe, esc } from "@/lib/services/telegram";
import { executeToolCall } from "@/lib/services/execute-tool";
import { parseSlashCommand, handleCommand, isAiHintCommand, getAiHint } from "@/lib/services/commands";
import { listCategories } from "@/lib/services/category";
import { getRecentMessages, saveMessage } from "@/lib/services/conversation";
import { checkAndConsumeTrialQuota, trialLimitMessage } from "@/lib/services/trial";
import type { TelegramUpdate } from "@/lib/services/telegram";

// The whole AI + tool pipeline is awaited before we answer Telegram.
export const maxDuration = 60;

const ok = () => NextResponse.json({ ok: true });

/** Record the update id; returns false if we've already seen it (Telegram redelivery). */
async function claimUpdate(updateId: number | undefined): Promise<boolean> {
  if (updateId === undefined) return true;
  try {
    await prisma.telegramUpdate.create({ data: { updateId: BigInt(updateId) } });
    return true;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") return false; // already processed
    console.error("[telegram] failed to record update id:", error);
    return true; // don't block processing on bookkeeping failures
  }
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return ok();
  }

  const message = update.message;
  if (!message?.from || message.from.is_bot) return ok();

  const chatId = message.chat.id;

  if (!message.text && !message.voice) {
    // Photos, stickers, documents, etc.
    await sendMessageSafe(chatId, "I can only read text and voice messages for now.");
    return ok();
  }

  if (!(await claimUpdate(update.update_id))) return ok();

  try {
    const telegramId = BigInt(message.from.id);
    const username = message.from.username ?? message.from.first_name;
    const user = await findOrCreateUser(telegramId, username);

    let aiApiKey: string | null = null;
    let keyWarning = "";
    try {
      aiApiKey = decryptUserApiKey(user.aiApiKey);
    } catch {
      keyWarning = "\n\n⚠️ I couldn't read your saved API key — please re-enter it in Settings.";
    }
    const aiConfig = { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel };

    let messageText = message.text ?? "";

    if (message.voice && !messageText) {
      try {
        const { downloadFile } = await import("@/lib/services/telegram");
        const { transcribeVoice } = await import("@/lib/services/transcribe");
        const audioBuffer = await downloadFile(message.voice.file_id);
        messageText = await transcribeVoice(audioBuffer, aiConfig);
        if (!messageText.trim()) {
          await sendMessageSafe(chatId, "I couldn't understand that voice message. Try again?");
          return ok();
        }
      } catch (error) {
        console.error("[telegram] voice transcription failed:", error instanceof Error ? error.message : error);
        await sendMessageSafe(chatId, "Sorry, I couldn't process that voice message.");
        return ok();
      }
    }

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
      return ok();
    }

    let userMessage = messageText;
    if (parsed && isAiHintCommand(parsed.command)) {
      if (!parsed.body) {
        await sendMessage(chatId, `Usage: /${parsed.command} &lt;description&gt;`);
        return ok();
      }
      userMessage = `${getAiHint(parsed.command)} ${parsed.body}`;
    }

    const quota = await checkAndConsumeTrialQuota({ ...user, aiApiKey: aiApiKey ? user.aiApiKey : null });
    if (!quota.allowed) {
      await sendMessage(chatId, trialLimitMessage(quota.limit));
      return ok();
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
      try {
        const result = await executeToolCall(call.name, call.args, user.id, user);
        if (result) results.push(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "unknown error";
        console.error(`[telegram] tool ${call.name} failed:`, msg);
        results.push(`⚠️ ${esc(call.name)} failed: ${esc(msg)}`);
      }
    }

    // The model's free text is not HTML-safe; tool results already are.
    const response = [text ? esc(text) : "", ...results].filter(Boolean).join("\n\n") + keyWarning;
    if (response.trim()) {
      await saveMessage(user.id, chatId, "assistant", response.slice(0, 500));
      await sendMessage(chatId, response);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Something went wrong";
    console.error("[telegram] webhook error:", errMsg);
    await sendMessageSafe(chatId, `Sorry, I ran into an error: ${esc(errMsg)}`);
  }

  return ok();
}
