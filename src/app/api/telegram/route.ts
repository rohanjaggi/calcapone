import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateUser, decryptUserApiKey } from "@/lib/services/user";
import { runAgent, AiConfigError, type ToolCall, type ImageInput } from "@/lib/services/ai";
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
import { executeToolCall, FORCED_ITEM_ID } from "@/lib/services/execute-tool";
import { parseSlashCommand, handleCommand, isAiHintCommand, getAiHint } from "@/lib/services/commands";
import { listCategories } from "@/lib/services/category";
import { getRecentMessages, saveMessage } from "@/lib/services/conversation";
import { checkAndConsumeTrialQuota, trialLimitMessage } from "@/lib/services/trial";
import { parseCallbackData, handleCallback, undoKeyboard, chooseKeyboard } from "@/lib/services/callbacks";
import { recordAction } from "@/lib/services/action-log";
import { rememberMessageRef, getMessageRef, resolvePosition } from "@/lib/services/message-ref";
import { createPendingAction, consumePendingAction } from "@/lib/services/pending-action";
import { getItem } from "@/lib/services/item";
import { forwardSourceLine } from "@/lib/services/forward-source";
import { parseConflictData, resolveConflict } from "@/lib/services/conflict";
import { notifyOwner } from "@/lib/services/alert";
import type { AgentCall } from "@/lib/services/ai";
import type { UndoOp, ToolOutcome } from "@/lib/services/tool-outcome";
import type { TelegramUpdate, TelegramMessage, InlineKeyboard } from "@/lib/services/telegram";

export const maxDuration = 60;

/** Long voice notes cost real transcription money and are almost never intentional. */
const MAX_VOICE_SECONDS = 300;

/**
 * Base64 inflates a payload by a third and the whole thing rides in one model request, so the
 * largest rendition Telegram offers is not always the one to send.
 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const PHOTO_PROMPT =
  "This image was sent with no caption. Read it and create whatever it describes — a calendar event for a poster or invitation, tasks for a to-do list or timetable, an assignment or exam for a syllabus screenshot. Use the dates and times shown. If it contains nothing actionable, say what you see in one line and create nothing.";

/** The best rendition that still fits the budget, or the smallest if none do. */
function pickPhoto<T extends { file_size?: number }>(sizes: T[]): T | null {
  if (sizes.length === 0) return null;
  const affordable = sizes.filter((size) => (size.file_size ?? 0) <= MAX_IMAGE_BYTES);
  return affordable.length > 0 ? affordable[affordable.length - 1] : sizes[0];
}

const IMAGE_MIME = /^image\/(jpeg|png|gif|webp)$/;

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

/** Which item a reversible action was about, so a receipt can be replied to later. */
function itemIdFromUndo(op: UndoOp): string | null {
  if (op.op === "delete_item" || op.op === "restore_item") return op.itemId;
  if (op.op === "recreate_item") return op.itemId;
  return null;
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
  const incomingText = message.text ?? message.caption ?? "";

  const photo = pickPhoto(message.photo ?? []);
  const imageDocument =
    message.document?.mime_type && IMAGE_MIME.test(message.document.mime_type) ? message.document : null;
  const hasImage = Boolean(photo || imageDocument);

  if (!incomingText && !message.voice && !hasImage) {
    await sendMessageSafe(chatId, "I can read text, voice notes and photos — that one I can't.");
    return ok();
  }

  if (!(await claimUpdate(update.update_id))) return ok();

  try {
    const telegramId = BigInt(message.from.id);
    const username = message.from.username ?? message.from.first_name;
    const user = await findOrCreateUser(telegramId, username);

    const aiApiKey = decryptUserApiKey(user.aiApiKey);
    const keyWarning =
      user.aiApiKey && !aiApiKey
        ? "\n\n⚠️ I couldn't read your saved API key — please re-enter it in Settings."
        : "";
    const aiConfig = { provider: user.aiProvider as string | null, apiKey: aiApiKey, model: user.aiModel };

    let messageText = incomingText;
    let images: ImageInput[] | undefined;

    if (hasImage) {
      try {
        const { downloadFile } = await import("@/lib/services/telegram");
        await sendTyping(chatId);
        const fileId = photo?.file_id ?? imageDocument!.file_id;
        const buffer = await downloadFile(fileId);
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          await sendMessageSafe(chatId, "That image is too large for me to read — try a smaller one or a screenshot.");
          return ok();
        }
        // Telegram re-encodes anything sent as a photo to JPEG; a document keeps its own type.
        images = [{ mimeType: imageDocument?.mime_type ?? "image/jpeg", base64: buffer.toString("base64") }];
        if (!messageText) messageText = PHOTO_PROMPT;
      } catch (error) {
        console.error("[telegram] image download failed:", error instanceof Error ? error.message : error);
        await sendMessageSafe(chatId, "I couldn't download that image. Try sending it again?");
        return ok();
      }
    }

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
        // Echoed before the model runs: a mis-transcription is obvious immediately, instead
        // of only becoming obvious once the wrong thing has already been created.
        await sendMessageSafe(chatId, `🎤 Heard: ${esc(messageText.trim())}`);
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
      const reply = await handleCommand(parsed, {
        userId: user.id,
        chatId,
        user: {
          telegramUsername: user.telegramUsername,
          timezone: user.timezone,
          googleRefreshToken: user.googleRefreshToken,
          googleCalendarId: user.googleCalendarId,
          eventReminderMinutes: user.eventReminderMinutes,
        },
      });
      const messageId = await sendMessage(chatId, reply.text);
      if (messageId && reply.itemIds?.length) {
        await rememberMessageRef({ userId: user.id, chatId, messageId, kind: "list", itemIds: reply.itemIds });
      }
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

    const replyContext = await describeReplyTarget(message, user.id, messageText);
    if (replyContext) userMessage = `${userMessage}\n\n${replyContext}`;

    // A forwarded message is usually a thing to act on plus a place it came from; without the
    // provenance the resulting task is stranded from whatever prompted it.
    const source = forwardSourceLine(message.forward_origin);
    if (source) {
      userMessage = `${userMessage}\n\n(This was forwarded. Put "${source}" at the end of the item's description so the original can be found again.)`;
    }

    const quota = await checkAndConsumeTrialQuota({ ...user, aiApiKey: aiApiKey ? user.aiApiKey : null });
    if (!quota.allowed) {
      await sendMessage(chatId, trialLimitMessage(quota.limit));
      return ok();
    }

    const categories = await listCategories(user.id);
    const history = await getRecentMessages(user.id, chatId);
    await saveMessage(user.id, chatId, "user", messageText);

    await sendTyping(chatId);

    const run = await runAgent(
      userMessage,
      { telegramUsername: user.telegramUsername, timezone: user.timezone, categories: categories.map((c) => c.name) },
      aiConfig,
      history,
      (call: ToolCall) => executeToolCall(call.name, call.args, user.id, user),
      { onStep: () => void sendTyping(chatId), ...(images ? { images } : {}) }
    );

    const rendered = await renderRun(run.calls, run.text, user.id, chatId);
    const response = rendered.text + keyWarning;

    if (response.trim()) {
      await saveMessage(user.id, chatId, "assistant", htmlToPlain(response).slice(0, 500));
      const messageId = await sendMessage(chatId, response, { keyboard: rendered.keyboard });
      if (messageId && rendered.ref) {
        await rememberMessageRef({ userId: user.id, chatId, messageId, ...rendered.ref });
      }
    }
  } catch (error) {
    if (error instanceof AiConfigError) {
      await sendMessageSafe(chatId, esc(error.message));
      return ok();
    }
    console.error("[telegram] webhook error:", error instanceof Error ? error.stack ?? error.message : error);
    // A model without vision fails only once an image is actually attached, so the useful
    // message is the one that names the cause rather than the generic apology.
    const looksLikeVision = /image|vision|multimodal|not supported/i.test(
      error instanceof Error ? error.message : ""
    );
    await sendMessageSafe(
      chatId,
      looksLikeVision && (message.photo || message.document)
        ? "Your AI model can't read images. Switch to a vision-capable model in Settings, or tell me what's in it."
        : "Sorry, something went wrong on my end. Please try again."
    );
    await notifyOwner("telegram:webhook", error);
  }

  return ok();
}

/**
 * Turn a completed agent run into one message.
 *
 * Receipts come first and the model's prose last, because the receipt is what actually
 * happened and the prose is commentary on it. Read-only output is deliberately dropped —
 * the model has just summarised it, and printing both gives the user the dump *and* the
 * summary. The one exception is a run that produced no prose at all, where the raw output
 * is better than silence.
 */
async function renderRun(
  calls: AgentCall[],
  modelText: string,
  userId: string,
  chatId: number
): Promise<{ text: string; keyboard?: InlineKeyboard; ref?: { kind: "list" | "item"; itemIds: string[] } }> {
  const parts: string[] = [];
  const undoIds: string[] = [];
  const receiptItemIds: string[] = [];

  for (const { outcome } of calls) {
    if (outcome.echo && outcome.text) parts.push(outcome.text);
    if (outcome.undo) {
      const actionId = await recordAction(userId, chatId, outcome.undo);
      if (actionId) undoIds.push(actionId);
      const itemId = itemIdFromUndo(outcome.undo.inverse);
      if (itemId) receiptItemIds.push(itemId);
    }
  }

  if (modelText.trim()) parts.push(mdToHtml(modelText));

  if (parts.length === 0) {
    const readText = calls.map(({ outcome }) => outcome.text).filter(Boolean);
    if (readText.length > 0) parts.push(readText.join("\n\n"));
  }

  const keyboard = await chooseOrUndoKeyboard(calls, undoIds, userId, chatId);

  // A numbered list the user can act on beats a single receipt: `/done 3` needs the ordering.
  const listed = calls.find(({ outcome }) => !outcome.echo && outcome.itemIds?.length);
  const ref = listed?.outcome.itemIds
    ? ({ kind: "list", itemIds: listed.outcome.itemIds } as const)
    : receiptItemIds.length === 1
    ? ({ kind: "item", itemIds: receiptItemIds } as const)
    : undefined;

  return {
    text: parts.filter(Boolean).join("\n\n"),
    ...(keyboard ? { keyboard } : {}),
    ...(ref ? { ref } : {}),
  };
}

/**
 * At most one keyboard fits on a message, so an unanswered question wins over a convenience.
 * The undo button is offered only for a single change — one button next to three creations
 * would silently revert just one of them.
 */
async function chooseOrUndoKeyboard(
  calls: AgentCall[],
  undoIds: string[],
  userId: string,
  chatId: number
): Promise<InlineKeyboard | undefined> {
  const choice = calls.map(({ outcome }) => outcome.choose).find(Boolean);
  if (choice) {
    const pendingId = await createPendingAction({
      userId,
      chatId,
      tool: choice.tool,
      args: choice.args,
      candidates: choice.candidates.map((c) => c.id),
    });
    return chooseKeyboard(pendingId, choice.candidates);
  }
  return undoIds.length === 1 ? undoKeyboard(undoIds[0]) : undefined;
}

/**
 * What is the user replying to?
 *
 * Telegram gives the replied-to message's id and nothing else, so the bot used to answer a
 * bare "done" by guessing from conversation history. Resolving the id against what that
 * message was actually about turns "done" and "move it to Friday" into precise instructions.
 */
async function describeReplyTarget(
  message: TelegramMessage,
  userId: string,
  body: string
): Promise<string | null> {
  const repliedTo = message.reply_to_message;
  if (!repliedTo) return null;

  const ref = await getMessageRef(message.chat.id, repliedTo.message_id);
  if (!ref || ref.itemIds.length === 0) return null;

  const leadingNumber = body.trim().match(/^(\d+)/)?.[1];
  const targetId =
    ref.kind === "item"
      ? ref.itemIds[0]
      : (leadingNumber && resolvePosition(ref.itemIds, leadingNumber)) ||
        (ref.itemIds.length === 1 ? ref.itemIds[0] : null);
  if (!targetId) return null;

  const item = await getItem(targetId, userId);
  if (!item) return null;

  return `(Context: the user is replying to a message about the task "${item.title}". Any instruction like "done", "move it", or "delete it" refers to that exact task — pass "${item.title}" as the tool's title/query.)`;
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
    const user = await findOrCreateUser(BigInt(query.from.id), query.from.username ?? query.from.first_name);

    // Conflict buttons are parsed separately: settling one needs the calendar credentials and
    // the local mirror, neither of which the item-centric callback layer knows about.
    const conflict = query.data ? parseConflictData(query.data) : null;
    if (conflict) {
      const settled = await resolveConflict(conflict.itemId, conflict.side, user);
      await answerCallbackQuery(query.id, settled.ok ? settled.toast : "Couldn't do that");
      if (query.message) {
        await editMessageText(
          query.message.chat.id,
          query.message.message_id,
          settled.ok ? settled.text : esc(settled.reason)
        );
      }
      return ok();
    }

    const parsed = query.data ? parseCallbackData(query.data) : null;

    if (!parsed) {
      await answerCallbackQuery(query.id);
      return ok();
    }

    const outcome =
      parsed.action === "pick"
        ? await applyPick(parsed.pendingId, parsed.index, user, query.message?.chat.id ?? 0)
        : await handleCallback(parsed, user);

    if (!outcome) {
      await answerCallbackQuery(query.id);
      return ok();
    }

    await answerCallbackQuery(query.id, outcome.toast);
    if (query.message) {
      await editMessageText(query.message.chat.id, query.message.message_id, outcome.text, {
        ...(outcome.keyboard ? { keyboard: outcome.keyboard } : {}),
      });
    }
  } catch (error) {
    console.error("[telegram] callback error:", error instanceof Error ? error.stack ?? error.message : error);
    await answerCallbackQuery(query.id, "Couldn't do that — try again");
    await notifyOwner("telegram:callback", error);
  }

  return ok();
}

/**
 * The user picked which item an ambiguous call meant. Re-runs the parked call against that
 * exact id — the tool runtime lives here, which is why the callback layer defers this one.
 */
async function applyPick(
  pendingId: string,
  index: number,
  user: { id: string; timezone: string; googleRefreshToken: string | null; googleCalendarId: string | null },
  chatId: number
): Promise<{ text: string; toast: string; keyboard?: InlineKeyboard } | null> {
  const pending = await consumePendingAction(pendingId, user.id);
  if (!pending) return { text: "That choice has expired — ask me again.", toast: "Expired" };

  const itemId = pending.candidates[index];
  if (!itemId) return { text: "I couldn't tell which one you meant — ask me again.", toast: "Not found" };

  let outcome: ToolOutcome;
  try {
    outcome = await executeToolCall(pending.tool, { ...pending.args, [FORCED_ITEM_ID]: itemId }, user.id, user);
  } catch (error) {
    console.error("[telegram] pick failed:", error instanceof Error ? error.message : error);
    return { text: "That didn't work — try asking again.", toast: "Failed" };
  }

  if (outcome.undo) {
    const actionId = await recordAction(user.id, chatId, outcome.undo);
    if (actionId) {
      return { text: outcome.text ?? "Done.", toast: "Done", keyboard: undoKeyboard(actionId) };
    }
  }

  return { text: outcome.text ?? "Done.", toast: "Done" };
}
