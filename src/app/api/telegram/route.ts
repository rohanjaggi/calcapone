import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateUser, decryptUserApiKey } from "@/lib/services/user";
import { chatWithAi, AiConfigError } from "@/lib/services/ai";
import {
  sendMessage,
  sendMessageSafe,
  sendTyping,
  answerCallbackQuery,
  editMessageText,
  esc,
  mdToHtml,
  htmlToPlain,
} from "@/lib/services/telegram";
import { executeToolCall } from "@/lib/services/execute-tool";
import { parseSlashCommand, handleCommand, isAiHintCommand, getAiHint } from "@/lib/services/commands";
import { listCategories } from "@/lib/services/category";
import { getRecentMessages, saveMessage } from "@/lib/services/conversation";
import { checkAndConsumeTrialQuota, trialLimitMessage } from "@/lib/services/trial";
import { handleCallback } from "@/lib/services/callbacks";
import { notifyOwner } from "@/lib/services/alert";
import type { TelegramUpdate } from "@/lib/services/telegram";

// The whole AI + tool pipeline is awaited before we answer Telegram.
export const maxDuration = 60;

/** Long voice notes cost real transcription money and are almost never intentional. */
const MAX_VOICE_SECONDS = 300;

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

  if (update.callback_query) return handleButtonPress(update);

  const message = update.message;
  if (!message?.from || message.from.is_bot) return ok();

  const chatId = message.chat.id;
  // A caption is what a photo-with-text arrives as; treating it as text means a shared
  // screenshot with "add this deadline" written under it still does something useful.
  const incomingText = message.text ?? message.caption ?? "";

  if (!incomingText && !message.voice) {
    // Stickers, bare photos, documents, service messages.
    await sendMessageSafe(chatId, "I can only read text and voice messages for now.");
    return ok();
  }

  if (!(await claimUpdate(update.update_id))) return ok();

  try {
    const telegramId = BigInt(message.from.id);
    const username = message.from.username ?? message.from.first_name;
    const user = await findOrCreateUser(telegramId, username);

    const aiApiKey = decryptUserApiKey(user.aiApiKey);
    // A stored-but-unreadable key means the encryption key changed or the row was tampered with.
    const keyWarning =
      user.aiApiKey && !aiApiKey
        ? "\n\n⚠️ I couldn't read your saved API key — please re-enter it in Settings."
        : "";
    const aiConfig = { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel };

    let messageText = incomingText;

    if (message.voice && !messageText) {
      if (message.voice.duration > MAX_VOICE_SECONDS) {
        await sendMessageSafe(
          chatId,
          `That voice note is ${Math.round(message.voice.duration / 60)} minutes long — send me something under 5 minutes, or type it instead.`
        );
        return ok();
      }
      try {
        const { downloadFile } = await import("@/lib/services/telegram");
        const { transcribeVoice } = await import("@/lib/services/transcribe");
        await sendTyping(chatId);
        const audioBuffer = await downloadFile(message.voice.file_id);
        messageText = await transcribeVoice(audioBuffer, aiConfig);
        if (!messageText.trim()) {
          await sendMessageSafe(chatId, "I couldn't understand that voice message. Try again?");
          return ok();
        }
      } catch (error) {
        const { TranscriptionUnavailableError } = await import("@/lib/services/transcribe");
        if (error instanceof TranscriptionUnavailableError) {
          await sendMessageSafe(
            chatId,
            "Voice notes need an OpenAI key — this bot doesn't have one configured. Send me text instead, or add an OpenAI key in Settings."
          );
          return ok();
        }
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
    // Store what the user actually said, not the hint-prefixed variant — the prefix is an
    // instruction to the model, and replaying it as history muddles later follow-ups.
    await saveMessage(user.id, chatId, "user", messageText);

    // An AI turn is several seconds of silence otherwise.
    await sendTyping(chatId);

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
        await notifyOwner(`tool:${call.name}`, error);
      }
    }

    // The model's free text is Markdown and not HTML-safe; mdToHtml escapes it first, then
    // renders the Markdown it insists on emitting. Tool results are already HTML-safe.
    const response = [text ? mdToHtml(text) : "", ...results].filter(Boolean).join("\n\n") + keyWarning;
    if (response.trim()) {
      // History is replayed to the model — store the words, not the markup, or it learns to
      // emit tags that get escaped on the way back out and reach the user literally.
      await saveMessage(user.id, chatId, "assistant", htmlToPlain(response).slice(0, 500));
      await sendMessage(chatId, response);
    }
  } catch (error) {
    if (error instanceof AiConfigError) {
      // Authored by us and secret-free: the user is the only one who can fix this.
      await sendMessageSafe(chatId, esc(error.message));
      return ok();
    }
    // Provider/Prisma messages can carry keys, IDs and SQL — log them, never echo them into chat.
    console.error("[telegram] webhook error:", error instanceof Error ? error.stack ?? error.message : error);
    await sendMessageSafe(chatId, "Sorry, something went wrong on my end. Please try again.");
    await notifyOwner("telegram:webhook", error);
  }

  return ok();
}

/**
 * Apply a reminder action button.
 *
 * Telegram spins the button until the callback is answered, so every path answers — even
 * the ones that change nothing.
 */
async function handleButtonPress(update: TelegramUpdate) {
  const query = update.callback_query;
  if (!query?.from || query.from.is_bot) return ok();

  if (!(await claimUpdate(update.update_id))) return ok();

  try {
    const user = await findOrCreateUser(
      BigInt(query.from.id),
      query.from.username ?? query.from.first_name
    );
    const outcome = query.data ? await handleCallback(query.data, user.id, user.timezone) : null;

    if (!outcome) {
      await answerCallbackQuery(query.id);
      return ok();
    }

    await answerCallbackQuery(query.id, outcome.toast);
    if (query.message) {
      await editMessageText(query.message.chat.id, query.message.message_id, outcome.text);
    }
  } catch (error) {
    console.error("[telegram] callback error:", error instanceof Error ? error.stack ?? error.message : error);
    await answerCallbackQuery(query.id, "Couldn't do that — try again");
    await notifyOwner("telegram:callback", error);
  }

  return ok();
}
