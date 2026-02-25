/**
 * Server-side Gemini single-speaker TTS for Quiplash-style readouts.
 *
 * One narrator voice reads the prompt, then both player answers —
 * just like real Quiplash.
 */

import { GoogleGenAI } from "@google/genai";
import { pickRandomVoice, VOICE_NAMES } from "./voices";

const TIMEOUT_MS = 15_000;
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

/** Resolve a voice setting to a concrete voice name. */
function resolveVoice(voice: string): string {
  if (voice === "RANDOM" || !VOICE_NAMES.includes(voice)) {
    return pickRandomVoice();
  }
  return voice;
}

/** Replace madlib blanks with an ellipsis for a natural spoken pause. */
export function prepareTtsText(text: string): string {
  return text.replace(/_+/g, "...");
}

/**
 * System instruction for the TTS model — voice direction following
 * Google's recommended structure (audio profile, scene, director's notes).
 */
const TTS_SYSTEM_INSTRUCTION = [
  "You are the narrator of a live comedy game show called Sloplash.",
  "",
  "Scene: A brightly lit studio stage in front of a rowdy live audience.",
  "The vibe is late-night improv meets party game — irreverent, fast, and funny.",
  "",
  "Director's notes:",
  "- Big, charismatic game-show MC energy. Vocal smile throughout.",
  "- Punchy, projected delivery like you're addressing a studio audience.",
  "- Build anticipation on the prompt, then read each answer with comedic timing.",
  "- Think comedy roast host — sharp, playful, always on the edge of cracking up.",
  "- Commit to reading ridiculous answers with a straight face for maximum comedy.",
].join("\n");

/** Build the narrator script for a prompt + two answers. */
export function buildScript(
  prompt: string,
  responseA: string,
  responseB: string,
): string {
  return [
    prepareTtsText(prompt),
    prepareTtsText(responseA),
    "Or...",
    prepareTtsText(responseB),
  ].join("\n");
}

/** Prepend a 44-byte WAV header to raw PCM data (24 kHz, mono, 16-bit LE). */
export function pcmToWav(pcmData: Buffer): Buffer {
  const sampleRate = 24_000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

const TTS_MAX_RETRIES = 3;
const TTS_BASE_DELAY_MS = 1_000;

interface TtsErrorInfo {
  message: string;
  retryable: boolean;
  retryDelayMs?: number;
}

/** Extract useful error details for logging and retry decisions. */
function describeTtsError(err: unknown): TtsErrorInfo {
  if (!(err instanceof Error)) return { message: String(err), retryable: false };
  if (err.name === "AbortError") return { message: "timed out", retryable: false };

  const status = "status" in err ? (err as { status: number }).status : undefined;
  const body = "responseBody" in err ? String((err as { responseBody: unknown }).responseBody).slice(0, 200) : undefined;
  const parts = [`${err.name}: ${err.message}`];
  if (status) parts.push(`status=${status}`);
  if (body) parts.push(`body=${body}`);

  const retryable = status === 500 || status === 503 || status === 429;
  // Gemini 429 responses include retryDelay -- use 11s as default for rate limits
  const retryDelayMs = status === 429 ? 11_000 : undefined;
  return { message: parts.join(", "), retryable, retryDelayMs };
}

/**
 * Call Gemini TTS to generate a single-speaker WAV for a prompt + two responses.
 * Retries up to 3 times with exponential backoff for transient server errors.
 * Returns a WAV Buffer on success, or null if all attempts fail or time out.
 */
export async function generateSpeechAudio(
  prompt: string,
  responseA: string,
  responseB: string,
  voice: string = "RANDOM",
): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[TTS] GEMINI_API_KEY not set");
    return null;
  }

  const voiceName = resolveVoice(voice);
  const ai = new GoogleGenAI({ apiKey });
  const script = buildScript(prompt, responseA, responseB);

  console.log(`[TTS] Starting: model=${TTS_MODEL}, voice=${voiceName}, scriptLen=${script.length}`);

  for (let attempt = 1; attempt <= TTS_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: script }] }],
        config: {
          systemInstruction: TTS_SYSTEM_INSTRUCTION,
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          abortSignal: controller.signal,
        },
      });

      clearTimeout(timer);

      const candidate = response.candidates?.[0];
      const data = candidate?.content?.parts?.[0]?.inlineData?.data;
      if (!data) {
        const finishReason = candidate?.finishReason;
        const partTypes = candidate?.content?.parts?.map((p) => Object.keys(p).join(",")).join("; ");
        console.error(`[TTS] No audio data in response. finishReason=${finishReason}, parts=[${partTypes ?? "none"}]`);
        return null;
      }

      const pcm = Buffer.from(data, "base64");
      console.log(`[TTS] OK: ${pcm.length} bytes PCM (attempt ${attempt})`);
      return pcmToWav(pcm);
    } catch (err) {
      clearTimeout(timer);
      const { message, retryable, retryDelayMs } = describeTtsError(err);

      if (retryable && attempt < TTS_MAX_RETRIES) {
        const delay = retryDelayMs ?? TTS_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(`[TTS] ${message} (attempt ${attempt}/${TTS_MAX_RETRIES}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(`[TTS] FAILED (attempt ${attempt}/${TTS_MAX_RETRIES}): ${message}`);
      return null;
    }
  }

  return null;
}
