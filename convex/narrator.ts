"use node";

import { generateSpeech as synthesizeSpeech } from "ai";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, type ActionCtx } from "./_generated/server";
import { getGatewaySpeechModel } from "../src/lib/ai-gateway";
import {
  decodeXmlEntities,
  PLAYER_TEXT_IS_DATA,
  runText,
  xml,
  type AiCallRecord,
} from "../src/lib/ai";
import {
  NARRATOR_SCRIPT_INSTRUCTIONS,
  NARRATOR_SCRIPT_MODEL,
  NARRATOR_TTS_MODEL,
} from "../src/games/sloplash/narrator-config";
import { VOICE_IDS, pickVoiceForSeed } from "../src/games/sloplash/voices";
import { requireAiGatewayApiKey } from "./aiGateway";
import type { Id } from "./_generated/dataModel";

const MAX_NARRATION_CHARS = 1_000;
const MAX_GENERATION_CONTEXT_CHARS = 1_000;
const MAX_GENERATED_SCRIPT_CHARS = 240;
const MAX_GENERATED_SCRIPT_WORDS = 24;
const NARRATOR_TTS_TIMEOUT_MS = 15_000;
/**
 * Bump on any change to the narrator instructions or prompt layout.
 * 2: event facts keep their quotes unescaped inside `<context>`.
 */
const NARRATOR_PROMPT_VERSION = 2;

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

/**
 * The spoken line: a generated one for the events that get one, else the
 * client's fallback. A generated line is used only when the model finished
 * on its own (`runText` requires finish reason `stop`), so a cut-off line is
 * never read out. Returns the call to record, when one was made.
 */
async function writeHostScript(
  eventType: string,
  generationContext: string | undefined,
  fallbackText: string,
  apiKey: string,
): Promise<{ script: string; call: AiCallRecord | null }> {
  if (!generationContext || !GENERATED_EVENT_TYPES.has(eventType)) {
    return { script: fallbackText, call: null };
  }
  const context = validateText(
    generationContext,
    "Narration generation context",
    MAX_GENERATION_CONTEXT_CHARS,
  );

  const result = await runText("narrator.line", {
    model: NARRATOR_SCRIPT_MODEL,
    keys: { gateway: apiKey },
    promptVersion: NARRATOR_PROMPT_VERSION,
    instructions: [
      { text: NARRATOR_SCRIPT_INSTRUCTIONS, cache: "static" },
      { text: PLAYER_TEXT_IS_DATA, cache: "static" },
    ],
    // Event facts can quote player answers, so they go in as data.
    prompt: `Event type: ${eventType}\n${xml("context", context)}`,
    deadline: null,
  });
  // The model may copy an entity from the escaped context (`&lt;3`); speak the character.
  const script = result.ok ? normalizeGeneratedScript(decodeXmlEntities(result.text)) : "";
  return { script: script || fallbackText, call: result.call };
}

/**
 * Writes the script call to `aiCalls` (only there, so narrator spend never
 * counts as player spend). Bookkeeping must never cost a cue its audio, so
 * this never rejects.
 */
async function recordScriptCall(
  ctx: ActionCtx,
  gameId: Id<"games">,
  call: AiCallRecord | null,
): Promise<void> {
  if (!call) return;
  try {
    await ctx.runMutation(internal.jobs.recordAiCalls, { gameId, calls: [call] });
  } catch (error) {
    console.warn("[narrator] could not record the script call", error);
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
    const { gameId, voice } = await ctx.runQuery(internal.narratorData.authorizeSpeech, {
      capability: args.capability,
    });
    const fallbackText = validateText(
      args.fallbackText,
      "Narration fallback text",
      MAX_NARRATION_CHARS,
    );
    const apiKey = requireAiGatewayApiKey();
    const { script, call } = await writeHostScript(
      args.eventType,
      args.generationContext,
      fallbackText,
      apiKey,
    );
    // Record alongside speech synthesis, not before it, so the cue isn't delayed.
    const recorded = recordScriptCall(ctx, gameId, call);
    try {
      const result = await synthesizeSpeech({
        model: getGatewaySpeechModel(NARRATOR_TTS_MODEL, apiKey),
        text: script,
        voice: resolveVoice(voice, gameId),
        outputFormat: "wav",
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(NARRATOR_TTS_TIMEOUT_MS),
      });
      return { audioBase64: result.audio.base64 };
    } finally {
      await recorded;
    }
  },
});
