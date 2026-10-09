"use node";

import { fal } from "@fal-ai/client";
import { generateText, Output } from "ai";
import { z } from "zod";
import { env } from "../_generated/server";
import { getAiProviderKeys } from "../aiGateway";
import type { JobRunners } from "../jobs";
import type { MatchslopJobs } from "./mode";
import {
  aiVoteNWay,
  escapeXml,
  extractUsage,
  simpleHash,
} from "../../src/games/matchslop/ai-voting";
import type { MatchSlopPersonaSeed } from "../../src/games/matchslop/config/persona-examples";
import type { MatchSlopIdentity, MatchSlopProfile } from "../../src/games/matchslop/types";
import type { TranscriptLine } from "../../src/games/matchslop/rules";
import { getLanguageModel } from "../../src/lib/ai-gateway";
import { MINIMAL_REASONING } from "../../src/lib/ai-reasoning";

/** Every call gives up well before its phase does, so a fallback can still land. */
const AI_CALL_TIMEOUT_MS = 30_000;
const REPLY_TIMEOUT_MS = 20_000;
const PORTRAIT_TIMEOUT_MS = 60_000;

const profileSchema = z.object({
  displayName: z.string().min(1),
  backstory: z.string().nullable(),
  appearance: z.string().nullable().optional(),
  age: z.number().int().min(20).max(30).nullable(),
  location: z.string().nullable(),
  bio: z.string().min(1),
  tagline: z.string().nullable(),
  prompts: z
    .array(
      z.object({ id: z.string().min(1), prompt: z.string().min(1), answer: z.string().min(1) }),
    )
    .length(3),
  details: z
    .object({
      job: z.string().nullable(),
      school: z.string().nullable(),
      height: z.string().nullable(),
      languages: z.array(z.string()),
    })
    .nullable(),
});

const replySchema = z.object({
  reply: z.string().min(1),
  outcome: z.enum(["CONTINUE", "DATE_SEALED", "UNMATCHED"]),
  moodDelta: z.number().int().min(-50).max(50),
  signalCategory: z.string().nullable().optional(),
  sideComment: z.string().nullable().optional(),
  nextSignal: z.string().nullable().optional(),
});

const postMortemSchema = z.object({
  opening: z.string().min(1),
  playerCallouts: z
    .array(
      z.object({
        playerName: z.string().min(1),
        verdict: z.string().min(1),
        favoriteLine: z.string().nullable(),
      }),
    )
    .min(1),
  favoriteMoment: z.string().min(1),
  finalThought: z.string().min(1),
});

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().url() })).min(1),
  has_nsfw_concepts: z.array(z.boolean()).optional(),
});

function identityLabel(identity: MatchSlopIdentity): string {
  if (identity === "MAN") return "man";
  if (identity === "WOMAN") return "woman";
  if (identity === "NON_BINARY") return "non-binary person";
  return "person with a self-described gender";
}

function profileXml(profile: MatchSlopProfile): string {
  const prompts = profile.prompts
    .map(
      (prompt) =>
        `<prompt id="${escapeXml(prompt.id)}"><question>${escapeXml(prompt.prompt)}</question><answer>${escapeXml(prompt.answer)}</answer></prompt>`,
    )
    .join("\n");
  return `<profile><name>${escapeXml(profile.displayName)}</name><backstory>${escapeXml(profile.backstory ?? "")}</backstory><appearance>${escapeXml(profile.appearance ?? "")}</appearance><bio>${escapeXml(profile.bio)}</bio><tagline>${escapeXml(profile.tagline ?? "")}</tagline><prompts>${prompts}</prompts></profile>`;
}

function seedXml(seed: MatchSlopPersonaSeed): string {
  return `<example id="${escapeXml(seed.id)}"><avoidName>${escapeXml(seed.name)}</avoidName><backstory>${escapeXml(seed.backstory)}</backstory><textingStyle>${escapeXml(seed.textingStyle)}</textingStyle><appearance>${escapeXml(seed.appearance)}</appearance><imagePrompt>${escapeXml(seed.imagePrompt)}</imagePrompt><bio>${escapeXml(seed.bio)}</bio></example>`;
}

function transcriptXml(transcript: TranscriptLine[]): string {
  return transcript
    .map((entry) => {
      const author = entry.authorName ? ` author="${escapeXml(entry.authorName)}"` : "";
      const tag = entry.speaker === "PERSONA" ? "persona" : "players";
      return `<${tag}${author}>${escapeXml(entry.text)}</${tag}>`;
    })
    .join("\n");
}

async function requestPortrait(prompt: string): Promise<string> {
  const apiKey = env.FAL_KEY;
  if (!apiKey) throw new Error("Fal API key is missing. Set FAL_KEY in the environment.");
  fal.config({ credentials: apiKey });
  const result = await fal.run("recraft/v4.1/flash/text-to-image", {
    input: { prompt, image_size: "landscape_4_3", enable_safety_checker: true },
    abortSignal: AbortSignal.timeout(PORTRAIT_TIMEOUT_MS),
  });
  const parsed = falResponseSchema.parse(result.data);
  if (parsed.has_nsfw_concepts?.[0]) throw new Error("Fal marked the portrait as NSFW.");
  return parsed.images[0]!.url;
}

/** One structured model call with the shared timeout, reasoning, and usage accounting. */
async function structured<T>(
  modelId: string,
  schema: z.ZodType<T>,
  request: { instructions: string; prompt: string; timeoutMs?: number },
) {
  const result = await generateText({
    model: getLanguageModel(modelId, getAiProviderKeys()),
    instructions: request.instructions,
    prompt: request.prompt,
    output: Output.object({ schema }),
    abortSignal: AbortSignal.timeout(request.timeoutMs ?? AI_CALL_TIMEOUT_MS),
    ...MINIMAL_REASONING,
  });
  return { output: result.output as T, usage: [extractUsage(modelId, result.usage)] };
}

export const matchslopRunners: JobRunners<MatchslopJobs> = {
  async MATCHSLOP_PROFILE(input) {
    return structured(input.modelId, z.object({ profile: profileSchema }), {
      instructions: `You create realistic dating-app personas for MatchSlop, a comedy party game. The persona is a ${identityLabel(input.personaIdentity)} and the players roleplay as a ${identityLabel(input.seekerIdentity)}. The persona is grounded and believable; the players create the absurdity. Invent a new first name, age 20-30, a concrete appearance, realistic backstory with a distinct texting style, concise bio, exactly three profile prompts, and job, height, and at least one language. Do not copy seed facts, names, or settings. No sexual or hateful content.`,
      prompt: `<avoid-names>${escapeXml(input.seed.name)}</avoid-names><calibration>${seedXml(input.seed)}</calibration>`,
    });
  },

  async MATCHSLOP_PORTRAIT(input) {
    const { output, usage } = await structured(
      input.modelId,
      z.object({ prompt: z.string().min(1) }),
      {
        instructions:
          "Write a photorealistic dating-app portrait prompt. Treat the profile appearance as the source of truth, preserve concrete traits, and use a candid phone-photo composition with natural ambient lighting. One fully clothed adult, no text, no watermark, no collage, no extra people.",
        prompt: `<identity>${escapeXml(identityLabel(input.personaIdentity))}</identity><portrait-seeds><seed>${escapeXml(input.seed.imagePrompt)}</seed></portrait-seeds>${profileXml(input.profile)}`,
      },
    );
    return { output: { url: await requestPortrait(output.prompt.trim()) }, usage };
  },

  async MATCHSLOP_RESPONSE(input) {
    const examples = `<tone-examples>${input.examples.map(escapeXml).join(" | ")}</tone-examples>`;
    const responseSchema = z.object({
      line: z.string(),
      selectedPromptId: z.string().nullable().optional(),
    });
    const { output, usage } = await structured(input.modelId, responseSchema, {
      instructions: input.opener
        ? "You are an AI competitor in MatchSlop. Pick one provided profile prompt and write one funny dating-app opener under 200 characters. Be specific, absurd, and grounded in the profile. No sincere flirting or generic pickup lines. Return JSON with selectedPromptId and line."
        : "You are an AI competitor in MatchSlop. Write one funny dating-app follow-up under 200 characters that escalates the existing bit. Be specific and absurd, not mean. Return JSON with line.",
      prompt: input.opener
        ? `${examples}${profileXml(input.profile)}`
        : `${examples}<conversation>${escapeXml(input.context)}</conversation>`,
    });
    return {
      output: { text: output.line.trim(), openerPromptId: output.selectedPromptId ?? null },
      usage,
    };
  },

  async MATCHSLOP_VOTE(input) {
    const vote = await aiVoteNWay(
      input.modelId,
      input.context,
      input.responses.map((response, index) => ({
        id: response.id,
        label: String.fromCharCode(65 + index),
        text: response.text,
      })),
      simpleHash(input.seedKey),
      { keys: getAiProviderKeys(), timeout: AI_CALL_TIMEOUT_MS },
    );
    const chosen = input.responses.find((response) => response.id === vote.chosenResponseId);
    return {
      output: { responseId: chosen?.id ?? null, failed: !chosen },
      usage: [vote.usage],
    };
  },

  async MATCHSLOP_REPLY(input) {
    const { output, usage } = await structured(input.modelId, replySchema, {
      instructions: `You are the ${identityLabel(input.personaIdentity)} in a realistic dating-app chat with a ${identityLabel(input.seekerIdentity)}. Follow the profile's texting style. Write 1-3 short natural sentences, then assess a moodDelta from -50 to 50. ${input.forceContinue ? "This is the opening exchange, so outcome MUST be CONTINUE." : "Choose CONTINUE, DATE_SEALED, or UNMATCHED based on whether the line earned it."} Also return a 2-4 word signalCategory, a short sideComment, and concise nextSignal guidance.`,
      prompt: `${profileXml(input.profile)}<current-mood>${input.mood}</current-mood><transcript>${transcriptXml(input.transcript)}</transcript>`,
      timeoutMs: REPLY_TIMEOUT_MS,
    });
    return {
      output: {
        text: output.reply.trim(),
        outcome: input.forceContinue ? "CONTINUE" : output.outcome,
        moodDelta: output.moodDelta,
        signalCategory: output.signalCategory?.trim() || null,
        sideComment: output.sideComment?.trim() || null,
        nextSignal: output.nextSignal?.trim() || null,
      },
      usage,
    };
  },

  async MATCHSLOP_POST_MORTEM(input) {
    return structured(input.modelId, z.object({ postMortem: postMortemSchema }), {
      instructions: `You are ${input.profile.displayName}, the ${identityLabel(input.personaIdentity)} who just finished this MatchSlop dating chat. Deliver a concise in-character postmortem: an opening reaction, an honest callout for each player using actual lines, the favorite moment, and a final parting shot. Match the profile's texting style and avoid generic commentary.`,
      prompt: `<outcome>${escapeXml(input.outcome)}</outcome><players>${input.playerNames.map((name) => `<player>${escapeXml(name)}</player>`).join("")}</players>${profileXml(input.profile)}<transcript>${transcriptXml(input.transcript)}</transcript>`,
    });
  },
};
