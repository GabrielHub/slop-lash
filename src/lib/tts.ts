/**
 * Server-side Gemini multi-speaker TTS for Quiplash-style readouts.
 *
 * Two voice presets:
 *   MALE:   Host=Puck, Player 1=Charon, Player 2=Fenrir
 *   FEMALE: Host=Aoede, Player 1=Kore, Player 2=Zephyr
 */

import { GoogleGenAI } from "@google/genai";
import type { TtsVoice } from "./types";

const TIMEOUT_MS = 8_000;
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

function speakerConfig(speaker: string, voiceName: string) {
  return { speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName } } };
}

const VOICE_PRESETS: Record<TtsVoice, ReturnType<typeof speakerConfig>[]> = {
  MALE: [
    speakerConfig("Host", "Puck"),
    speakerConfig("Player 1", "Charon"),
    speakerConfig("Player 2", "Fenrir"),
  ],
  FEMALE: [
    speakerConfig("Host", "Aoede"),
    speakerConfig("Player 1", "Kore"),
    speakerConfig("Player 2", "Zephyr"),
  ],
};

/** Replace madlib blanks with an ellipsis for a natural spoken pause. */
export function prepareTtsText(text: string): string {
  return text.replace(/_+/g, "...");
}

/** Build a multi-speaker script with game-show host instructions. */
export function buildMultiSpeakerScript(
  prompt: string,
  responseA: string,
  responseB: string,
): string {
  return [
    "Read this like a Quiplash game show. The Host announces the prompt with energy. Player 1 and Player 2 each deliver their punchline.",
    "",
    `Host: ${prepareTtsText(prompt)}`,
    `Player 1: ${prepareTtsText(responseA)}`,
    `Player 2: ${prepareTtsText(responseB)}`,
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

/**
 * Call Gemini TTS to generate a multi-speaker WAV for a prompt + two responses.
 * Returns a WAV Buffer on success, or null if the call fails or times out.
 */
export async function generateSpeechAudio(
  prompt: string,
  responseA: string,
  responseB: string,
  voice: TtsVoice = "MALE",
): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[TTS] GEMINI_API_KEY not set");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });
  const script = buildMultiSpeakerScript(prompt, responseA, responseB);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ parts: [{ text: script }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: VOICE_PRESETS[voice],
          },
        },
        abortSignal: controller.signal,
      },
    });

    clearTimeout(timer);

    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data) {
      console.error("[TTS] No audio data in Gemini response");
      return null;
    }

    const pcm = Buffer.from(data, "base64");
    return pcmToWav(pcm);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("[TTS] Gemini TTS timed out after", TIMEOUT_MS, "ms");
    } else {
      console.error("[TTS] Gemini TTS error:", err);
    }
    return null;
  }
}
