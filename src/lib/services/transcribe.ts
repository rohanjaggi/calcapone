import OpenAI from "openai";

type TranscribeConfig = {
  provider: string | null;
  apiKey: string | null;
  model: string | null;
};

/** No usable key for speech-to-text. Distinct from a failed call so the user gets told why. */
export class TranscriptionUnavailableError extends Error {
  constructor() {
    super("No API key available for voice transcription");
    this.name = "TranscriptionUnavailableError";
  }
}

/**
 * Transcription always goes to OpenAI, so it needs an *OpenAI* key.
 *
 * Previously it used whatever key the AI provider resolved to, which meant an Anthropic,
 * Gemini or OpenRouter user's key was sent to api.openai.com and rejected — with the error
 * swallowed, so voice notes just silently did nothing. A user whose chat provider already
 * is OpenAI can reuse their own key; everyone else needs the deployment's.
 */
function resolveTranscriptionKey(config: TranscribeConfig): string | null {
  const envKey = process.env.TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY;
  if (envKey) return envKey;
  if (config.provider === "openai" && config.apiKey) return config.apiKey;
  return null;
}

export function isTranscriptionAvailable(config: TranscribeConfig): boolean {
  return resolveTranscriptionKey(config) !== null;
}

export async function transcribeVoice(audioBuffer: Buffer, config: TranscribeConfig): Promise<string> {
  const apiKey = resolveTranscriptionKey(config);
  if (!apiKey) throw new TranscriptionUnavailableError();

  const client = new OpenAI({ apiKey });
  const file = new File([new Uint8Array(audioBuffer)], "voice.ogg", { type: "audio/ogg" });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "text",
  });

  return typeof transcription === "string" ? transcription : (transcription as unknown as { text: string }).text;
}
