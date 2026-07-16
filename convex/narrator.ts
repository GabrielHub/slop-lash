"use node";

import { generateSpeech as synthesizeSpeech, generateText } from "ai";
import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action } from "./_generated/server";
import { getGatewayModel, getGatewaySpeechModel } from "../src/lib/ai-gateway";
import { getReasoningSettings } from "../src/lib/ai-reasoning";
import {
  NARRATOR_SCRIPT_INSTRUCTIONS,
  NARRATOR_SCRIPT_MODEL,
  NARRATOR_TTS_MODEL,
} from "../src/games/sloplash/narrator-config";
import { VOICE_IDS, pickVoiceForSeed } from "../src/games/sloplash/voices";
import { requireAiGatewayApiKey } from "./aiGateway";

const MAX_NARRATION_CHARS = 1_000;
const MAX_GENERATION_CONTEXT_CHARS = 1_000;
const MAX_GENERATED_SCRIPT_CHARS = 240;
const MAX_GENERATED_SCRIPT_WORDS = 24;
const NARRATOR_TTS_TIMEOUT_MS = 15_000;

const GENERATED_EVENT_TYPES = new Set(["game_start", "vote_result", "round_over", "next_round"]);

const narrationEventType = v.union(
  v.literal("game_start"),
  v.literal("hurry_up"),
  v.literal("voting_start"),
  v.literal("matchup"),
  v.literal("vote_result"),
  v.literal("round_over"),
  v.literal("next_round"),
);

const authorizeSpeech = makeFunctionReference<
  "query",
  { capability: string },
  { gameId: string; voice: string }
>("narratorData:authorizeSpeech");

function resolveVoice(voice: string, gameId: string): string {
  if (voice === "RANDOM" || !VOICE_IDS.includes(voice)) return pickVoiceForSeed(gameId);
  return voice;
}

function validateText(value: string, label: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new ConvexError(`${label} is required`);
  if (normalized.length > maxChars) {
    throw new ConvexError(`${label} cannot exceed ${maxChars} characters`);
  }
  return normalized;
}

function normalizeGeneratedScript(value: string): string {
  const normalized = value
    .replace(/^[\s#*'"-]+|[\s'"*]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = normalized.split(" ").slice(0, MAX_GENERATED_SCRIPT_WORDS).join(" ");
  return words.slice(0, MAX_GENERATED_SCRIPT_CHARS).trim();
}

async function writeHostScript(
  eventType: string,
  generationContext: string | undefined,
  fallbackText: string,
  apiKey: string,
): Promise<string> {
  if (!generationContext || !GENERATED_EVENT_TYPES.has(eventType)) return fallbackText;
  const context = validateText(
    generationContext,
    "Narration generation context",
    MAX_GENERATION_CONTEXT_CHARS,
  );

  try {
    const result = await generateText({
      model: getGatewayModel(NARRATOR_SCRIPT_MODEL, apiKey),
      instructions: NARRATOR_SCRIPT_INSTRUCTIONS,
      prompt: `Event type: ${eventType}\nEvent facts: ${context}`,
      maxOutputTokens: 64,
      maxRetries: 0,
      timeout: 3_000,
      // The catalog rates this model for gameplay; the narrator races a 3s
      // timeout, so it opts out of thinking regardless of that policy.
      ...getReasoningSettings(NARRATOR_SCRIPT_MODEL, "minimal"),
    });
    return normalizeGeneratedScript(result.text) || fallbackText;
  } catch (error) {
    console.warn(
      `[narrator] ${NARRATOR_SCRIPT_MODEL} script generation failed; using fallback`,
      error,
    );
    return fallbackText;
  }
}

export const generate = action({
  args: {
    capability: v.string(),
    eventType: narrationEventType,
    fallbackText: v.string(),
    generationContext: v.optional(v.string()),
  },
  returns: v.object({ audioBase64: v.string() }),
  handler: async (ctx, args) => {
    const { gameId, voice } = await ctx.runQuery(authorizeSpeech, {
      capability: args.capability,
    });
    const fallbackText = validateText(
      args.fallbackText,
      "Narration fallback text",
      MAX_NARRATION_CHARS,
    );
    const apiKey = requireAiGatewayApiKey();
    const script = await writeHostScript(
      args.eventType,
      args.generationContext,
      fallbackText,
      apiKey,
    );

    const result = await synthesizeSpeech({
      model: getGatewaySpeechModel(NARRATOR_TTS_MODEL, apiKey),
      text: script,
      voice: resolveVoice(voice, gameId),
      outputFormat: "mp3",
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(NARRATOR_TTS_TIMEOUT_MS),
    });

    return { audioBase64: result.audio.base64 };
  },
});
