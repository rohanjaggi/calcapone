import OpenAI from "openai";
import { resolveAiClient } from "./ai";

type TranscribeConfig = {
  provider: string | null;
  apiKey: string | null;
  model: string | null;
};

export async function transcribeVoice(
  audioBuffer: Buffer,
  config: TranscribeConfig
): Promise<string> {
  const { apiKey } = resolveAiClient(config);
  const client = new OpenAI({ apiKey });
  const file = new File([new Uint8Array(audioBuffer)], "voice.ogg", { type: "audio/ogg" });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "text",
  });

  return typeof transcription === "string" ? transcription : (transcription as unknown as { text: string }).text;
}
