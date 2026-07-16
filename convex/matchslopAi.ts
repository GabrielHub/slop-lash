"use node";

import { fal } from "@fal-ai/client";
import { generateText, Output } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import {
  aiVoteNWay,
  escapeXml,
  extractUsage,
  simpleHash,
  type AiUsage,
} from "../src/games/ai-chat-showdown/ai";
import { FORFEIT_MARKER } from "../src/games/core/constants";
import { getGameplayReasoningSettings } from "../src/lib/ai-reasoning";
import type { MatchSlopPersonaSeed } from "../src/games/matchslop/config/persona-examples";
import type { MatchSlopIdentity, MatchSlopProfile } from "../src/games/matchslop/types";
import { getGatewayModel } from "../src/lib/ai-gateway";
import { env, internalAction } from "./_generated/server";
import { requireAiGatewayApiKey } from "./aiGateway";
import {
  matchSlopImageReadyContextValidator,
  matchSlopPostMortemReadyContextValidator,
  matchSlopPostMortemValidator,
  matchSlopProfileReadyContextValidator,
  matchSlopProfileValidator,
  matchSlopReplyReadyContextValidator,
  matchSlopResponseReadyContextValidator,
  matchSlopUsageValidator,
  matchSlopVoteReadyContextValidator,
} from "./matchslopValidators";

const identitySchema = z.enum(["MAN", "WOMAN", "NON_BINARY", "OTHER"]);
const profilePromptSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answer: z.string().min(1),
});
const detailsSchema = z.object({
  job: z.string().nullable(),
  school: z.string().nullable(),
  height: z.string().nullable(),
  languages: z.array(z.string()),
});
const profileSchema = z.object({
  displayName: z.string().min(1),
  backstory: z.string().nullable(),
  appearance: z.string().nullable().optional(),
  age: z.number().int().min(20).max(30).nullable(),
  location: z.string().nullable(),
  bio: z.string().min(1),
  tagline: z.string().nullable(),
  prompts: z.array(profilePromptSchema).length(3),
  details: detailsSchema.nullable(),
});
const generatedProfileSchema = z.object({ profile: profileSchema });
const portraitPromptSchema = z.object({ prompt: z.string().min(1) });
const responseSchema = z.object({
  line: z.string(),
  selectedPromptId: z.string().nullable().optional(),
});
const personaReplySchema = z.object({
  reply: z.string().min(1),
  outcome: z.enum(["CONTINUE", "DATE_SEALED", "UNMATCHED"]),
  moodDelta: z.number().int().min(-50).max(50),
  signalCategory: z.string().nullable().optional(),
  sideComment: z.string().nullable().optional(),
  nextSignal: z.string().nullable().optional(),
});
const postMortemSchema = z.object({
  postMortem: z.object({
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
  }),
});

const personaSeedSchema = z.object({
  id: z.string(),
  name: z.string(),
  identity: identitySchema,
  backstory: z.string(),
  textingStyle: z.string(),
  title: z.string(),
  bio: z.string(),
  details: detailsSchema,
  appearance: z.string(),
  imagePrompt: z.string(),
  promptExamples: z.array(z.string()),
  toneTags: z.array(z.string()),
  redFlags: z.array(z.string()),
  greenFlags: z.array(z.string()),
});

function identityLabel(identity: MatchSlopIdentity): string {
  if (identity === "MAN") return "man";
  if (identity === "WOMAN") return "woman";
  if (identity === "NON_BINARY") return "non-binary person";
  return "person with a self-described gender";
}

function parseContext<T>(schema: z.ZodType<T>, context: unknown): T {
  return schema.parse(context);
}

function buildProfileXml(profile: MatchSlopProfile): string {
  const prompts = profile.prompts
    .map(
      (prompt) =>
        `<prompt id="${escapeXml(prompt.id)}"><question>${escapeXml(prompt.prompt)}</question><answer>${escapeXml(prompt.answer)}</answer></prompt>`,
    )
    .join("\n");
  return `<profile><name>${escapeXml(profile.displayName)}</name><backstory>${escapeXml(profile.backstory ?? "")}</backstory><appearance>${escapeXml(profile.appearance ?? "")}</appearance><bio>${escapeXml(profile.bio)}</bio><tagline>${escapeXml(profile.tagline ?? "")}</tagline><prompts>${prompts}</prompts></profile>`;
}

function buildPersonaSeedsXml(seeds: MatchSlopPersonaSeed[]): string {
  return seeds
    .map(
      (seed) =>
        `<example id="${escapeXml(seed.id)}"><avoidName>${escapeXml(seed.name)}</avoidName><backstory>${escapeXml(seed.backstory)}</backstory><textingStyle>${escapeXml(seed.textingStyle)}</textingStyle><appearance>${escapeXml(seed.appearance)}</appearance><imagePrompt>${escapeXml(seed.imagePrompt)}</imagePrompt><bio>${escapeXml(seed.bio)}</bio></example>`,
    )
    .join("\n");
}

const profileContextSchema = z.object({
  kind: z.literal("ready"),
  modelId: z.string(),
  seekerIdentity: identitySchema,
  personaIdentity: identitySchema,
  personaExamples: z.array(personaSeedSchema),
});

export const generateProfile = internalAction({
  args: { context: matchSlopProfileReadyContextValidator },
  returns: v.object({ profile: matchSlopProfileValidator, usage: matchSlopUsageValidator }),
  handler: async (_ctx, args) => {
    const context = parseContext(profileContextSchema, args.context);
    const seedNames = context.personaExamples.map((seed) => seed.name).join(" | ");
    const result = await generateText({
      model: getGatewayModel(context.modelId, requireAiGatewayApiKey()),
      instructions: `You create realistic dating-app personas for MatchSlop, a comedy party game. The persona is a ${identityLabel(context.personaIdentity)} and the players roleplay as a ${identityLabel(context.seekerIdentity)}. The persona is grounded and believable; the players create the absurdity. Invent a new first name, age 20-30, a concrete appearance, realistic backstory with a distinct texting style, concise bio, exactly three profile prompts, and job, height, and at least one language. Do not copy seed facts, names, or settings. No sexual or hateful content.`,
      prompt: `<avoid-names>${escapeXml(seedNames)}</avoid-names><calibration>${buildPersonaSeedsXml(context.personaExamples)}</calibration>`,
      output: Output.object({
        schema: generatedProfileSchema,
        name: "matchslop_profile_generation",
        description: "A realistic dating-app profile for MatchSlop",
      }),
      ...getGameplayReasoningSettings(context.modelId),
    });
    return {
      profile: result.output.profile,
      usage: extractUsage(context.modelId, result.usage),
    };
  },
});

const imageContextSchema = z.object({
  kind: z.literal("ready"),
  modelId: z.string(),
  personaIdentity: identitySchema,
  profile: profileSchema,
  personaExamples: z.array(personaSeedSchema),
});

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string().url() })).min(1),
  has_nsfw_concepts: z.array(z.boolean()).optional(),
});

async function requestPersonaImage(prompt: string): Promise<string> {
  const apiKey = env.FAL_KEY;
  if (!apiKey) throw new Error("Fal API key is missing. Set FAL_KEY in the environment.");
  fal.config({ credentials: apiKey });
  const result = await fal.run("fal-ai/z-image/turbo", {
    input: {
      prompt,
      image_size: "landscape_4_3",
      num_images: 1,
      enable_safety_checker: true,
      output_format: "webp",
      acceleration: "regular",
      enable_prompt_expansion: false,
    },
  });
  const parsed = falResponseSchema.parse(result.data);
  if (parsed.has_nsfw_concepts?.[0]) throw new Error("Fal marked the generated portrait as NSFW.");
  const imageUrl = parsed.images[0]?.url;
  if (!imageUrl) throw new Error("Fal returned no image URL.");
  return imageUrl;
}

export const generateImage = internalAction({
  args: { context: matchSlopImageReadyContextValidator },
  returns: v.object({ imageUrl: v.string(), usage: matchSlopUsageValidator }),
  handler: async (_ctx, args) => {
    const context = parseContext(imageContextSchema, args.context);
    const portraitSeeds = context.personaExamples
      .map((seed) => `<seed>${escapeXml(seed.imagePrompt)}</seed>`)
      .join("");
    const promptResult = await generateText({
      model: getGatewayModel(context.modelId, requireAiGatewayApiKey()),
      instructions:
        "Write a photorealistic dating-app portrait prompt. Treat the profile appearance as the source of truth, preserve concrete traits, and use a candid phone-photo composition with natural ambient lighting. One fully clothed adult, no text, no watermark, no collage, no extra people.",
      prompt: `<identity>${escapeXml(identityLabel(context.personaIdentity))}</identity><portrait-seeds>${portraitSeeds}</portrait-seeds>${buildProfileXml(context.profile)}`,
      output: Output.object({
        schema: portraitPromptSchema,
        name: "matchslop_portrait_prompt",
        description: "A candid dating-app portrait prompt",
      }),
      ...getGameplayReasoningSettings(context.modelId),
    });
    return {
      imageUrl: await requestPersonaImage(promptResult.output.prompt.trim()),
      usage: extractUsage(context.modelId, promptResult.usage),
    };
  },
});

const responseContextSchema = z.object({
  kind: z.literal("ready"),
  modelId: z.string(),
  currentRound: z.number().int().positive(),
  profile: profileSchema,
  examples: z.array(z.string()),
  conversationContext: z.string(),
  timeoutMs: z.number().int().positive().nullable(),
});

export const generateResponse = internalAction({
  args: { context: matchSlopResponseReadyContextValidator },
  returns: v.object({
    text: v.string(),
    selectedPromptId: v.union(v.string(), v.null()),
    failReason: v.union(v.string(), v.null()),
    usage: matchSlopUsageValidator,
  }),
  handler: async (_ctx, args) => {
    const context = parseContext(responseContextSchema, args.context);
    const opener = context.currentRound === 1;
    const profilePrompts = context.profile.prompts
      .map(
        (prompt) =>
          `<prompt id="${escapeXml(prompt.id)}"><question>${escapeXml(prompt.prompt)}</question><answer>${escapeXml(prompt.answer)}</answer></prompt>`,
      )
      .join("");
    const result = await generateText({
      model: getGatewayModel(context.modelId, requireAiGatewayApiKey()),
      instructions: opener
        ? "You are an AI competitor in MatchSlop. Pick one provided profile prompt and write one funny dating-app opener under 300 characters. Be specific, absurd, and grounded in the profile. No sincere flirting or generic pickup lines. Return JSON with selectedPromptId and line."
        : "You are an AI competitor in MatchSlop. Write one funny dating-app follow-up under 300 characters that escalates the existing bit. Be specific and absurd, not mean. Return JSON with line.",
      prompt: opener
        ? `<tone-examples>${context.examples.map(escapeXml).join(" | ")}</tone-examples>${buildProfileXml(context.profile)}<profile-prompts>${profilePrompts}</profile-prompts>`
        : `<tone-examples>${context.examples.map(escapeXml).join(" | ")}</tone-examples><conversation>${escapeXml(context.conversationContext)}</conversation>`,
      output: Output.object({ schema: responseSchema, name: "matchslop_competitor_response" }),
      ...(context.timeoutMs ? { timeout: context.timeoutMs } : {}),
      ...getGameplayReasoningSettings(context.modelId),
    });
    const text = result.output.line.trim();
    const selectedPromptId =
      opener &&
      context.profile.prompts.some((prompt) => prompt.id === result.output.selectedPromptId)
        ? (result.output.selectedPromptId ?? null)
        : opener
          ? (context.profile.prompts[0]?.id ?? null)
          : null;
    return {
      text: text || FORFEIT_MARKER,
      selectedPromptId,
      failReason: text ? null : "empty",
      usage: extractUsage(context.modelId, result.usage),
    };
  },
});

const voteContextSchema = z.object({
  kind: z.literal("ready"),
  modelId: z.string(),
  conversationContext: z.string(),
  seedKey: z.string(),
  timeoutMs: z.number().int().positive().nullable(),
  responses: z.array(z.object({ id: z.string(), text: z.string() })),
});

export const generateVote = internalAction({
  args: { context: matchSlopVoteReadyContextValidator },
  returns: v.object({
    responseId: v.union(v.string(), v.null()),
    failReason: v.union(v.string(), v.null()),
    usage: matchSlopUsageValidator,
  }),
  handler: async (_ctx, args) => {
    const context = parseContext(voteContextSchema, args.context);
    if (context.responses.length === 0) {
      const usage: AiUsage = {
        modelId: context.modelId,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      return { responseId: null, failReason: null, usage };
    }
    const vote = await aiVoteNWay(
      context.modelId,
      context.conversationContext,
      context.responses.map((response, index) => ({
        id: response.id,
        label: String.fromCharCode(65 + index),
        text: response.text,
      })),
      simpleHash(context.seedKey),
      {
        apiKey: requireAiGatewayApiKey(),
        ...(context.timeoutMs ? { timeout: context.timeoutMs } : {}),
      },
    );
    return {
      responseId: vote.chosenResponseId || null,
      failReason: vote.failReason,
      usage: vote.usage,
    };
  },
});

const replyContextSchema = z.object({
  kind: z.literal("ready"),
  modelId: z.string(),
  seekerIdentity: identitySchema,
  personaIdentity: identitySchema,
  profile: profileSchema,
  currentMood: z.number(),
  forceContinue: z.boolean(),
  transcript: z.array(
    z.object({
      speaker: z.enum(["PLAYERS", "PERSONA"]),
      text: z.string(),
      authorName: z.string().nullable(),
    }),
  ),
});

export const generateReply = internalAction({
  args: { context: matchSlopReplyReadyContextValidator },
  returns: v.object({
    reply: v.string(),
    outcome: v.union(v.literal("CONTINUE"), v.literal("DATE_SEALED"), v.literal("UNMATCHED")),
    moodDelta: v.number(),
    signalCategory: v.union(v.string(), v.null()),
    sideComment: v.union(v.string(), v.null()),
    nextSignal: v.union(v.string(), v.null()),
    usage: matchSlopUsageValidator,
  }),
  handler: async (_ctx, args) => {
    const context = parseContext(replyContextSchema, args.context);
    const transcript = context.transcript
      .map((entry) => {
        const author = entry.authorName ? ` author="${escapeXml(entry.authorName)}"` : "";
        const tag = entry.speaker === "PERSONA" ? "persona" : "players";
        return `<${tag}${author}>${escapeXml(entry.text)}</${tag}>`;
      })
      .join("\n");
    const result = await generateText({
      model: getGatewayModel(context.modelId, requireAiGatewayApiKey()),
      instructions: `You are the ${identityLabel(context.personaIdentity)} in a realistic dating-app chat with a ${identityLabel(context.seekerIdentity)}. Follow the profile's texting style. Write 1-3 short natural sentences, then assess a moodDelta from -50 to 50. ${context.forceContinue ? "This is the opening exchange, so outcome MUST be CONTINUE." : "Choose CONTINUE, DATE_SEALED, or UNMATCHED based on whether the line earned it."} Also return a 2-4 word signalCategory, a short sideComment, and concise nextSignal guidance.`,
      prompt: `${buildProfileXml(context.profile)}<current-mood>${context.currentMood}</current-mood><transcript>${transcript}</transcript>`,
      output: Output.object({ schema: personaReplySchema, name: "matchslop_persona_reply" }),
      timeout: 12_000,
      ...getGameplayReasoningSettings(context.modelId),
    });
    return {
      reply: result.output.reply.trim(),
      outcome: context.forceContinue ? ("CONTINUE" as const) : result.output.outcome,
      moodDelta: result.output.moodDelta,
      signalCategory: result.output.signalCategory?.trim() || null,
      sideComment: result.output.sideComment?.trim() || null,
      nextSignal: result.output.nextSignal?.trim() || null,
      usage: extractUsage(context.modelId, result.usage),
    };
  },
});

const postMortemContextSchema = z.object({
  kind: z.literal("ready"),
  modelId: z.string(),
  personaIdentity: identitySchema,
  profile: profileSchema,
  outcome: z.string(),
  playerNames: z.array(z.string()).min(1),
  transcript: z.array(
    z.object({
      speaker: z.enum(["PLAYERS", "PERSONA"]),
      text: z.string(),
      authorName: z.string().nullable(),
    }),
  ),
});

export const generatePostMortem = internalAction({
  args: { context: matchSlopPostMortemReadyContextValidator },
  returns: v.object({
    postMortem: matchSlopPostMortemValidator,
    usage: matchSlopUsageValidator,
  }),
  handler: async (_ctx, args) => {
    const context = parseContext(postMortemContextSchema, args.context);
    const transcript = context.transcript
      .map(
        (entry) =>
          `<${entry.speaker.toLowerCase()}>${escapeXml(entry.text)}</${entry.speaker.toLowerCase()}>`,
      )
      .join("\n");
    const result = await generateText({
      model: getGatewayModel(context.modelId, requireAiGatewayApiKey()),
      instructions: `You are ${context.profile.displayName}, the ${identityLabel(context.personaIdentity)} who just finished this MatchSlop dating chat. Deliver a concise in-character postmortem: an opening reaction, an honest callout for each player using actual lines, the favorite moment, and a final parting shot. Match the profile's texting style and avoid generic commentary.`,
      prompt: `<outcome>${escapeXml(context.outcome)}</outcome><players>${context.playerNames.map((name) => `<player>${escapeXml(name)}</player>`).join("")}</players>${buildProfileXml(context.profile)}<transcript>${transcript}</transcript>`,
      output: Output.object({ schema: postMortemSchema, name: "matchslop_post_mortem" }),
      ...getGameplayReasoningSettings(context.modelId),
    });
    return {
      postMortem: result.output.postMortem,
      usage: extractUsage(context.modelId, result.usage),
    };
  },
});
