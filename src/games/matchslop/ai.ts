import { createGateway, generateText, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
  buildAiErrorLogDetails,
  classifyAiFailure,
  LABELS,
  ZERO_USAGE,
  aiVoteNWay,
  cleanGeneratedText,
  describeError,
  escapeXml,
  extractJsonObject,
  extractUsage,
  getLowReasoningProviderOptions,
  parseJsonText,
  type AiCallOptions,
  type AiUsage,
} from "@/games/ai-chat-showdown/ai";
import type { MatchSlopPersonaSeed } from "./config/persona-examples";
import { parsePostMortemDraft, parseProfileDraft } from "./game-logic-core";
import type {
  MatchSlopDecision,
  MatchSlopIdentity,
  MatchSlopPostMortem,
  MatchSlopPostMortemDraft,
  MatchSlopProfile,
  MatchSlopProfileDraft,
  MatchSlopTranscriptEntry,
} from "./types";
import {
  MATCHSLOP_INITIAL_MOOD,
  getMoodLabel,
} from "./types";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

const FAL_IMAGE_MODEL_ID = "fal-ai/z-image/turbo";
const FAL_IMAGE_API_URL = `https://fal.run/${FAL_IMAGE_MODEL_ID}`;


function identityLabel(identity: MatchSlopIdentity): string {
  switch (identity) {
    case "MAN":
      return "man";
    case "WOMAN":
      return "woman";
    case "NON_BINARY":
      return "non-binary person";
    case "OTHER":
      return "person with a self-described gender";
  }
}

const profilePromptSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  answer: z.string(),
});

const detailsSchema = z.object({
  job: z.string().nullable(),
  school: z.string().nullable(),
  height: z.string().nullable(),
  languages: z.array(z.string()),
});

const profileSchema = z.object({
  displayName: z.string(),
  backstory: z.string(),
  age: z.number().int().min(20).max(30).nullable(),
  location: z.string().nullable(),
  bio: z.string(),
  tagline: z.string().nullable(),
  prompts: z.array(profilePromptSchema).length(3),
  details: detailsSchema,
});

const personaProfileGenerationSchema = z.object({
  profile: profileSchema,
});

const portraitPromptSchema = z.object({
  prompt: z.string(),
});

const falImageResponseSchema = z.object({
  images: z.array(
    z.object({
      url: z.string().url(),
      width: z.number().nullish(),
      height: z.number().nullish(),
      content_type: z.string().nullish(),
    }),
  ).min(1),
  has_nsfw_concepts: z.array(z.boolean()).optional(),
});

type PersonaProfileGenerationArgs = {
  modelId: string;
  seekerIdentity: MatchSlopIdentity;
  personaIdentity: MatchSlopIdentity;
  personaExamples: MatchSlopPersonaSeed[];
};

function getFalApiKey(): string {
  const apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error("Fal API key is missing. Set FAL_KEY in the environment.");
  }
  return apiKey;
}

function buildProfileXml(profile: MatchSlopProfile): string {
  const promptsXml = profile.prompts
    .map(
      (prompt) =>
        `<prompt id="${escapeXml(prompt.id)}"><question>${escapeXml(prompt.prompt)}</question><answer>${escapeXml(prompt.answer)}</answer></prompt>`,
    )
    .join("\n");

  const details = profile.details;
  return `<profile>
<name>${escapeXml(profile.displayName)}</name>
${profile.backstory ? `<backstory>${escapeXml(profile.backstory)}</backstory>` : ""}
${profile.age != null ? `<age>${profile.age}</age>` : ""}
${profile.location ? `<location>${escapeXml(profile.location)}</location>` : ""}
<bio>${escapeXml(profile.bio)}</bio>
${profile.tagline ? `<tagline>${escapeXml(profile.tagline)}</tagline>` : ""}
${
  details
    ? `<details job="${escapeXml(details.job ?? "")}" school="${escapeXml(details.school ?? "")}" height="${escapeXml(details.height ?? "")}" languages="${escapeXml(details.languages.join(", "))}" />`
    : ""
}
<prompts>${promptsXml}</prompts>
</profile>`;
}

function buildFallbackPortraitPrompt(
  profile: MatchSlopProfile,
  personaIdentity: MatchSlopIdentity,
): string {
  const detailBits = [
    profile.age != null ? `${profile.age}-year-old` : null,
    identityLabel(personaIdentity),
    profile.location ? `from ${profile.location}` : null,
    profile.details?.job ? `works as ${profile.details.job}` : null,
    profile.details?.height ? `${profile.details.height}` : null,
  ].filter((value): value is string => value != null);

  const languageBit =
    profile.details?.languages && profile.details.languages.length > 0
      ? `Subtle hints of someone who speaks ${profile.details.languages.join(", ")}.`
      : "";

  return [
    `Photorealistic dating-app portrait of ${profile.displayName}.`,
    detailBits.join(", "),
    profile.backstory ?? profile.bio,
    "Single adult, casual chest-up framing, natural candid pose, expressive face. Shot on iPhone, portrait mode, ambient lighting.",
    languageBit,
    "Fully clothed, no text, no watermark, no collage, no extra people.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildPersonaExamplesXml(personaExamples: MatchSlopPersonaSeed[]): string {
  return personaExamples
    .map(
      (example) => `<example id="${escapeXml(example.id)}">
<backstory>${escapeXml(example.backstory)}</backstory>
<textingStyle>${escapeXml(example.textingStyle)}</textingStyle>
<name>${escapeXml(example.name)}</name>
<title>${escapeXml(example.title)}</title>
<bio>${escapeXml(example.bio)}</bio>
<details job="${escapeXml(example.details.job ?? "")}" school="${escapeXml(example.details.school ?? "")}" height="${escapeXml(example.details.height ?? "")}" languages="${escapeXml(example.details.languages.join(", "))}" />
<promptExamples>${escapeXml(example.promptExamples.join(" | "))}</promptExamples>
</example>`,
    )
    .join("\n");
}

function buildPersonaProfileRequest({
  modelId,
  seekerIdentity,
  personaIdentity,
  personaExamples,
}: PersonaProfileGenerationArgs) {
  const examplesXml = buildPersonaExamplesXml(personaExamples);

  return {
    model: gateway(modelId),
    system: `You create dating-app personas for MatchSlop, a comedy party game.

The persona is a ${identityLabel(personaIdentity)}. The players roleplay as a ${identityLabel(seekerIdentity)} trying to match.

The persona must feel like a real person on a dating app. Realistic job, genuine interests, natural voice. The humor comes from PLAYERS sending unhinged messages — the persona is the straight man. Think of someone your friend would actually date: grounded, relatable, maybe a bit quirky but never cartoonish.

Backstory (3-5 sentences) MUST include:
1. Who they are — personality, what they care about, their vibe
2. How they text — their specific texting style on dating apps. Do they use lowercase? Abbreviations? Full sentences? Emojis? Rapid-fire messages? Dry one-liners? Every persona should text differently. This is critical — it's what makes conversations feel like real people, not chatbots.

Derive everything else from the backstory.

- Age 20-30
- Bio under 220 characters, written the way THIS person would actually type it — not polished copywriting
- 3 profile prompts with answers that sound like this person wrote them, in their voice
- Include job, height, and languages (at least 1). school optional (null if omitted)
- Authentic and specific — no hateful or sexual content
- The persona reacts like a real person when players say weird things`,
    prompt: `<persona-seeds>${examplesXml}</persona-seeds>`,
    output: Output.object({
      schema: personaProfileGenerationSchema,
      name: "matchslop_profile_generation",
      description: "A fake dating-app profile for MatchSlop",
    }),
    providerOptions: getLowReasoningProviderOptions(modelId),
  } as const;
}

export async function generatePersonaProfile(
  modelId: string,
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  personaExamples: MatchSlopPersonaSeed[],
): Promise<{ profile: MatchSlopProfile; usage: AiUsage }> {
  const result = await generateText(
    buildPersonaProfileRequest({
      modelId,
      seekerIdentity,
      personaIdentity,
      personaExamples,
    }),
  );

  return {
    profile: result.output.profile,
    usage: extractUsage(modelId, result.usage),
  };
}

export async function streamPersonaProfile(
  modelId: string,
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  personaExamples: MatchSlopPersonaSeed[],
  options?: {
    onPartialProfile?: (profileDraft: MatchSlopProfileDraft) => Promise<void> | void;
  },
): Promise<{ profile: MatchSlopProfile; usage: AiUsage }> {
  const result = streamText(
    buildPersonaProfileRequest({
      modelId,
      seekerIdentity,
      personaIdentity,
      personaExamples,
    }),
  );

  for await (const partialOutput of result.partialOutputStream) {
    const profileDraft = parseProfileDraft(partialOutput?.profile);
    if (!profileDraft) continue;
    await options?.onPartialProfile?.(profileDraft);
  }

  const [output, usage] = await Promise.all([result.output, result.usage]);
  return {
    profile: output.profile,
    usage: extractUsage(modelId, usage),
  };
}

export async function generatePersonaPortraitPrompt(
  modelId: string,
  personaIdentity: MatchSlopIdentity,
  profile: MatchSlopProfile,
): Promise<{ prompt: string; usage: AiUsage; failReason: string | null }> {
  try {
    const result = await generateText({
      model: gateway(modelId),
      system: `Write a dating-app portrait prompt from the given persona profile. The photo should look like a friend took it on their phone — candid, natural, not professionally lit or posed.

- One adult, chest-up or waist-up, caught in a natural moment
- Ground appearance in the backstory, bio, and profile details
- Concrete visual traits, clothing, and real-world setting over vague mood words
- Natural ambient lighting only — no studio setups or professional rigs
- End with: shot on iPhone, portrait mode. Fully clothed, no text, no watermark`,
      prompt: `<persona-identity>${escapeXml(identityLabel(personaIdentity))}</persona-identity>\n${buildProfileXml(profile)}`,
      output: Output.object({
        schema: portraitPromptSchema,
        name: "matchslop_portrait_prompt",
        description: "A photorealistic portrait prompt for Fal image generation",
      }),
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const prompt = result.output.prompt.trim();
    return {
      prompt: prompt || buildFallbackPortraitPrompt(profile, personaIdentity),
      usage: extractUsage(modelId, result.usage),
      failReason: prompt ? null : "empty",
    };
  } catch (err) {
    console.error(`[matchslop:generatePersonaPortraitPrompt] ${modelId} failed: ${describeError(err)}`);
    return {
      prompt: buildFallbackPortraitPrompt(profile, personaIdentity),
      usage:
        NoObjectGeneratedError.isInstance(err) && err.usage
          ? extractUsage(modelId, err.usage)
          : { ...ZERO_USAGE, modelId },
      failReason: "error",
    };
  }
}

async function requestPersonaImage(prompt: string): Promise<string> {
  const response = await fetch(FAL_IMAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Key ${getFalApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "landscape_4_3",
      num_images: 1,
      enable_safety_checker: true,
      output_format: "webp",
      acceleration: "regular",
      enable_prompt_expansion: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Fal request failed [status=${response.status}] ${body}`.trim());
  }

  const parsed = falImageResponseSchema.parse(await response.json());
  if (parsed.has_nsfw_concepts?.[0]) {
    throw new Error("Fal marked the generated portrait as NSFW.");
  }

  const imageUrl = parsed.images[0]?.url;
  if (!imageUrl) {
    throw new Error("Fal returned no image URL.");
  }

  return imageUrl;
}

export async function generatePersonaImage(
  prompt: string,
): Promise<{ imageUrl: string | null; failReason: string | null }> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return {
        imageUrl: await requestPersonaImage(prompt),
        failReason: null,
      };
    } catch (err) {
      lastError = err;
      console.error(
        `[matchslop:generatePersonaImage] attempt ${attempt + 1} failed: ${describeError(err)}`,
      );
    }
  }

  return {
    imageUrl: null,
    failReason: describeError(lastError ?? "unknown error"),
  };
}

const openerSchema = z.object({
  selectedPromptId: z.string(),
  line: z.string(),
});

function parseLooseJsonObject(text: string): Record<string, unknown> | null {
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readStringField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function fallbackPlainTextLine(text: string): string | null {
  const cleaned = cleanGeneratedText(text).replace(/^["']|["']$/g, "").trim();
  if (!cleaned || (cleaned.includes("{") && cleaned.includes("}"))) return null;
  return cleaned;
}

export function parseAiOpenerResponse(
  text: string,
): {
  selectedPromptId: string | null;
  line: string;
} | null {
  const parsed = parseJsonText(text, openerSchema);
  if (parsed) return parsed;

  const loose = parseLooseJsonObject(text);
  if (loose) {
    const line = readStringField(loose, ["line", "opener", "text", "reply"]);
    if (line) {
      return {
        selectedPromptId: readStringField(loose, ["selectedPromptId", "selected_prompt_id", "promptId", "prompt_id"]),
        line,
      };
    }
  }

  const fallbackLine = fallbackPlainTextLine(text);
  return fallbackLine ? { selectedPromptId: null, line: fallbackLine } : null;
}

export async function generateAiOpener(
  modelId: string,
  profile: MatchSlopProfile,
  examples: string[],
  options?: AiCallOptions,
): Promise<{
  selectedPromptId: string | null;
  text: string;
  usage: AiUsage;
  failReason: string | null;
}> {
  const promptsXml = profile.prompts
    .map(
      (prompt) =>
        `<prompt id="${escapeXml(prompt.id)}"><question>${escapeXml(prompt.prompt)}</question><answer>${escapeXml(prompt.answer)}</answer></prompt>`,
    )
    .join("\n");
  const examplesList = examples.map((e) => `- ${escapeXml(e)}`).join("\n");
  const t0 = Date.now();

  try {
    const result = await generateText({
      model: gateway(modelId),
      system: `You are an AI player in MatchSlop, a party game where players compete to write the funniest dating-app opener. Players vote on the funniest line — not the most charming or romantic.

Pick one profile prompt to answer, then write a single line under 300 characters.

- Specific and absurd over generic and clever
- Reference something concrete from the profile
- No sincere flirting, generic pickup lines, or actual dating advice
- Weird and funny, not edgy or mean

Respond with ONLY this JSON (no other text):
{"selectedPromptId":"one of the provided prompt ids","line":"your opener"}`,
      prompt: `<tone-examples>\n${examplesList}\n</tone-examples>\n<profile><name>${escapeXml(profile.displayName)}</name><bio>${escapeXml(profile.bio)}</bio>${promptsXml}</profile>`,
      abortSignal: options?.abortSignal,
      timeout: options?.timeout,
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const parsed = parseAiOpenerResponse(result.text);
    if (!parsed) {
      console.error(
        `[matchslop:generateAiOpener] ${modelId} parse failed. raw text: "${result.text.slice(0, 200)}"`,
      );
      return {
        selectedPromptId: profile.prompts[0]?.id ?? null,
        text: FORFEIT_MARKER,
        usage: extractUsage(modelId, result.usage),
        failReason: "parse",
      };
    }

    const selectedPromptId = profile.prompts.some((prompt) => prompt.id === parsed.selectedPromptId)
      ? parsed.selectedPromptId
      : profile.prompts[0]?.id ?? null;

    return {
      selectedPromptId,
      text: parsed.line.trim() || FORFEIT_MARKER,
      usage: extractUsage(modelId, result.usage),
      failReason: parsed.line.trim() ? null : "empty",
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    const failReason = classifyAiFailure(err, options?.abortSignal);
    console.error(
      `[matchslop:generateAiOpener] ${modelId} failed in ${elapsed}ms: ${describeError(err)}`,
      buildAiErrorLogDetails(err, {
        abortSignal: options?.abortSignal,
        elapsedMs: elapsed,
        failReason,
      }),
    );
    return {
      selectedPromptId: profile.prompts[0]?.id ?? null,
      text: FORFEIT_MARKER,
      usage:
        NoObjectGeneratedError.isInstance(err) && err.usage
          ? extractUsage(modelId, err.usage)
          : { ...ZERO_USAGE, modelId },
      failReason,
    };
  }
}

const followupSchema = z.object({
  line: z.string(),
});

export function parseAiFollowupResponse(text: string): { line: string } | null {
  const parsed = parseJsonText(text, followupSchema);
  if (parsed) return parsed;

  const loose = parseLooseJsonObject(text);
  if (loose) {
    const line = readStringField(loose, ["line", "text", "reply", "message"]);
    if (line) return { line };
  }

  const fallbackLine = fallbackPlainTextLine(text);
  return fallbackLine ? { line: fallbackLine } : null;
}

export async function generateAiFollowup(
  modelId: string,
  context: string,
  examples: string[],
  options?: AiCallOptions,
): Promise<{ text: string; usage: AiUsage; failReason: string | null }> {
  const examplesList = examples.map((e) => `- ${escapeXml(e)}`).join("\n");
  const t0 = Date.now();

  try {
    const result = await generateText({
      model: gateway(modelId),
      system: `You are an AI player in MatchSlop, a party game where players compete to write the funniest dating-app messages. Players vote on the funniest line — charm is irrelevant.

Write one message under 300 characters that escalates or builds on the conversation so far.

- Specific and committed to the bit — do not restart or change the subject
- No sincere pivots, restating what was said, or generic humor
- Weird and absurd, not mean-spirited

Respond with ONLY this JSON (no other text):
{"line":"your follow-up message"}`,
      prompt: `<tone-examples>\n${examplesList}\n</tone-examples>\n<conversation-context>${escapeXml(context)}</conversation-context>`,
      abortSignal: options?.abortSignal,
      timeout: options?.timeout,
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const parsed = parseAiFollowupResponse(result.text);
    if (!parsed) {
      console.error(
        `[matchslop:generateAiFollowup] ${modelId} parse failed. raw text: "${result.text.slice(0, 200)}"`,
      );
      return {
        text: FORFEIT_MARKER,
        usage: extractUsage(modelId, result.usage),
        failReason: "parse",
      };
    }

    const text = parsed.line.trim();
    return {
      text: text || FORFEIT_MARKER,
      usage: extractUsage(modelId, result.usage),
      failReason: text ? null : "empty",
    };
  } catch (err) {
    const elapsed = Date.now() - t0;
    const failReason = classifyAiFailure(err, options?.abortSignal);
    console.error(
      `[matchslop:generateAiFollowup] ${modelId} failed in ${elapsed}ms: ${describeError(err)}`,
      buildAiErrorLogDetails(err, {
        abortSignal: options?.abortSignal,
        elapsedMs: elapsed,
        failReason,
      }),
    );
    return {
      text: FORFEIT_MARKER,
      usage:
        NoObjectGeneratedError.isInstance(err) && err.usage
          ? extractUsage(modelId, err.usage)
          : { ...ZERO_USAGE, modelId },
      failReason,
    };
  }
}

export async function generateAiFunnyVote(
  modelId: string,
  context: string,
  responses: Array<{ id: string; text: string }>,
  seed: number,
  options?: AiCallOptions,
): Promise<{ chosenResponseId: string; usage: AiUsage; failReason: string | null }> {
  const labeledResponses = responses.map((response, index) => ({
    id: response.id,
    label: LABELS[index] ?? String(index),
    text: response.text,
  }));
  return aiVoteNWay(modelId, context, labeledResponses, seed, options);
}

const personaReplySchema = z.object({
  reply: z.string(),
  outcome: z.enum(["CONTINUE", "DATE_SEALED", "UNMATCHED"]),
  moodDelta: z.number().int().min(-50).max(50),
  signalCategory: z.string().optional(),
  sideComment: z.string().optional(),
  nextSignal: z.string().optional(),
});

function clampMoodDelta(delta: number): number {
  return Math.max(-50, Math.min(50, Math.round(delta)));
}

function inferMoodDeltaFromOutcome(outcome: MatchSlopDecision): number {
  if (outcome === "DATE_SEALED") return 35;
  if (outcome === "UNMATCHED") return -30;
  return 0;
}

function readNumberField(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

type PersonaReplyParsed = {
  reply: string;
  outcome: MatchSlopDecision;
  moodDelta: number;
  signalCategory: string | null;
  sideComment: string | null;
  nextSignal: string | null;
};

export function parsePersonaReplyResponse(
  text: string,
  currentMood: number = MATCHSLOP_INITIAL_MOOD,
): PersonaReplyParsed | null {
  const parsed = parseJsonText(text, personaReplySchema);
  if (parsed && parsed.reply.trim()) {
    return {
      reply: parsed.reply,
      outcome: parsed.outcome,
      moodDelta: parsed.moodDelta,
      signalCategory: parsed.signalCategory?.trim() || null,
      sideComment: parsed.sideComment?.trim() || null,
      nextSignal: parsed.nextSignal?.trim() || null,
    };
  }

  const loose = parseLooseJsonObject(text);
  if (loose) {
    const reply = readStringField(loose, ["reply", "text", "message", "line"]);
    const outcome = readStringField(loose, ["outcome", "decision", "status"])?.toUpperCase();
    // Try moodDelta first, fall back to legacy absolute "mood" field
    const rawDelta = readNumberField(loose, ["moodDelta", "mood_delta", "delta"]);
    const rawAbsoluteMood = rawDelta == null ? readNumberField(loose, ["mood"]) : null;
    let moodDelta: number | null = null;
    if (rawDelta != null) {
      moodDelta = clampMoodDelta(rawDelta);
    } else if (rawAbsoluteMood != null) {
      // AI returned an absolute mood — convert to delta from currentMood
      moodDelta = clampMoodDelta(rawAbsoluteMood - currentMood);
    }
    if (!reply) return null;

    const signalCategory = readStringField(loose, ["signalCategory", "signal_category", "category"])?.trim() || null;
    const sideComment = readStringField(loose, ["sideComment", "side_comment", "comment"])?.trim() || null;
    const nextSignal = readStringField(loose, ["nextSignal", "next_signal", "signal", "guidance"])?.trim() || null;

    if (outcome === "CONTINUE" || outcome === "DATE_SEALED" || outcome === "UNMATCHED") {
      return { reply, outcome, moodDelta: moodDelta ?? inferMoodDeltaFromOutcome(outcome), signalCategory, sideComment, nextSignal };
    }
    return { reply, outcome: "CONTINUE", moodDelta: moodDelta ?? 0, signalCategory, sideComment, nextSignal };
  }

  const fallbackReply = fallbackPlainTextLine(text);
  return fallbackReply
    ? {
        reply: fallbackReply,
        outcome: "CONTINUE",
        moodDelta: 0,
        signalCategory: null,
        sideComment: null,
        nextSignal: null,
      }
    : null;
}

export function buildPersonaReplySystemPrompt(
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  forceContinue = false,
  currentMood: number = MATCHSLOP_INITIAL_MOOD,
): string {
  const moodLabel = getMoodLabel(currentMood);
  return `You are a ${identityLabel(personaIdentity)} chatting with a ${identityLabel(seekerIdentity)} on a dating app.

Your profile and backstory define who you are AND how you text. Your backstory includes your texting style — follow it closely. This is a dating app chat, not an interview.

Write like an actual dating-app message from this person:
- 1-3 sentences max
- short, natural texting cadence
- casual spelling and punctuation when it fits the character
- direct reactions when something is weird, boring, or off-putting
- genuine enthusiasm only when the line actually earns it
- stay grounded in the transcript and profile instead of drifting into generic banter

Your current vibe is: ${moodLabel}.

After reading their message, report how it shifted your mood as moodDelta:
- Great message: +15 to +25
- Solid/funny: +5 to +15
- Meh/neutral: -5 to +5
- Weird or off-putting: -10 to -20
- Creepy or awful: -20 to -40
${
  forceContinue
    ? `Opening exchange — outcome must be CONTINUE. Set moodDelta between -15 and +10 based on how the opener lands.`
    : `Decide:
- CONTINUE: conversation's worth continuing
- DATE_SEALED: genuinely charming, want to meet — only if they've actually earned it
- UNMATCHED: done. weird, boring, or creepy.`
}

Also produce:
- signalCategory: 2-4 word label describing what the message needs (e.g. "too generic", "be specific", "more real", "follow up")
- sideComment: one short reaction to the winning line (e.g. "okay that was actually kind of funny", "too intense too fast")
- nextSignal: one short line of guidance for the next message (e.g. "try being more specific instead of louder", "ask about something from my profile")

Respond with ONLY this JSON:
{"reply":"your message","outcome":"CONTINUE","moodDelta":0,"signalCategory":"label","sideComment":"reaction","nextSignal":"guidance"}`;
}

export function normalizePersonaReplyOutcome(
  outcome: MatchSlopDecision,
  forceContinue = false,
): MatchSlopDecision {
  return forceContinue ? "CONTINUE" : outcome;
}

function buildFallbackPersonaReply(
  forceContinue: boolean,
): PersonaReplyParsed {
  return {
    reply: forceContinue ? "okay, that was weirdly bold. keep going." : "hmm. that bought you one more message.",
    outcome: "CONTINUE",
    moodDelta: forceContinue ? -5 : 0,
    signalCategory: null,
    sideComment: null,
    nextSignal: null,
  };
}

export function deriveFallbackSignal(
  moodDelta: number,
  mood: number,
  outcome: MatchSlopDecision,
): { signalCategory: string; nextSignal: string } {
  if (outcome === "DATE_SEALED") return { signalCategory: "nailed it", nextSignal: "you actually pulled it off" };
  if (outcome === "UNMATCHED") return { signalCategory: "too much", nextSignal: "that was the last straw" };
  if (moodDelta >= 15) return { signalCategory: "keep going", nextSignal: "more of that energy" };
  if (moodDelta >= 5) return { signalCategory: "solid", nextSignal: "stay specific and committed" };
  if (moodDelta > -5) return { signalCategory: "meh", nextSignal: "say something that feels real for once" };
  if (mood <= 30) return { signalCategory: "danger zone", nextSignal: "last chance, make it count" };
  return { signalCategory: "try harder", nextSignal: "be more specific instead of louder" };
}

const PERSONA_REPLY_TIMEOUT_MS = 12_000;

export type PersonaReplyResult = {
  reply: string;
  outcome: MatchSlopDecision;
  moodDelta: number;
  signalCategory: string | null;
  sideComment: string | null;
  nextSignal: string | null;
  usage: AiUsage;
};

export async function generatePersonaReply(
  modelId: string,
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  profile: MatchSlopProfile,
  transcript: Array<{ speaker: "PLAYERS" | "PERSONA"; text: string; authorName: string | null }>,
  options?: { forceContinue?: boolean; currentMood?: number; abortSignal?: AbortSignal },
): Promise<PersonaReplyResult> {
  const forceContinue = options?.forceContinue === true;
  const currentMood = options?.currentMood ?? MATCHSLOP_INITIAL_MOOD;
  const timeoutSignal = AbortSignal.timeout(PERSONA_REPLY_TIMEOUT_MS);
  const abortSignal = options?.abortSignal
    ? AbortSignal.any([options.abortSignal, timeoutSignal])
    : timeoutSignal;
  const transcriptXml = transcript
    .map((entry) => {
      const tag = entry.speaker === "PERSONA" ? "persona" : "players";
      const author = entry.authorName ? ` author="${escapeXml(entry.authorName)}"` : "";
      return `<${tag}${author}>${escapeXml(entry.text)}</${tag}>`;
    })
    .join("\n");

  try {
    const result = await generateText({
      model: gateway(modelId),
      system: buildPersonaReplySystemPrompt(seekerIdentity, personaIdentity, forceContinue, currentMood),
      prompt: `<profile><name>${escapeXml(profile.displayName)}</name>${profile.backstory ? `<backstory>${escapeXml(profile.backstory)}</backstory>` : ""}<bio>${escapeXml(profile.bio)}</bio><tagline>${escapeXml(profile.tagline ?? "")}</tagline></profile>\n<transcript>${transcriptXml}</transcript>`,
      abortSignal,
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const parsed = parsePersonaReplyResponse(result.text, currentMood);
    if (!parsed) {
      console.error(
        `[matchslop:generatePersonaReply] ${modelId} parse failed. raw text: "${result.text.slice(0, 200)}"`,
      );
      const fallback = buildFallbackPersonaReply(forceContinue);
      return {
        ...fallback,
        usage: extractUsage(modelId, result.usage),
      };
    }

    const reply = parsed.reply.trim();
    if (!reply) {
      console.error(`[matchslop:generatePersonaReply] ${modelId} returned an empty reply, falling back`);
      const fallback = buildFallbackPersonaReply(forceContinue);
      return {
        ...fallback,
        usage: extractUsage(modelId, result.usage),
      };
    }

    return {
      reply,
      outcome: normalizePersonaReplyOutcome(parsed.outcome, forceContinue),
      moodDelta: parsed.moodDelta,
      signalCategory: parsed.signalCategory,
      sideComment: parsed.sideComment,
      nextSignal: parsed.nextSignal,
      usage: extractUsage(modelId, result.usage),
    };
  } catch (err) {
    console.error(`[matchslop:generatePersonaReply] ${modelId} failed: ${describeError(err)}`);
    const fallback = buildFallbackPersonaReply(forceContinue);
    return {
      ...fallback,
      usage:
        NoObjectGeneratedError.isInstance(err) && err.usage
          ? extractUsage(modelId, err.usage)
          : { ...ZERO_USAGE, modelId },
    };
  }
}

/* ─── Persona Post-Mortem ─── */

const postMortemCalloutSchema = z.object({
  playerName: z.string(),
  verdict: z.string(),
  favoriteLine: z.string().nullable(),
});

const postMortemSchema = z.object({
  opening: z.string(),
  playerCallouts: z.array(postMortemCalloutSchema).min(1),
  favoriteMoment: z.string(),
  finalThought: z.string(),
});

const postMortemGenerationSchema = z.object({
  postMortem: postMortemSchema,
});

type PostMortemGenerationArgs = {
  modelId: string;
  personaIdentity: MatchSlopIdentity;
  profile: MatchSlopProfile;
  transcript: MatchSlopTranscriptEntry[];
  playerNames: string[];
  outcome: string;
};

function buildPostMortemRequest(args: PostMortemGenerationArgs) {
  const { modelId, personaIdentity, profile, transcript, playerNames, outcome } = args;

  const transcriptXml = transcript
    .map((entry) => {
      const tag = entry.speaker === "PERSONA" ? "persona" : "players";
      const author = entry.authorName ? ` author="${escapeXml(entry.authorName)}"` : "";
      return `<${tag}${author}>${escapeXml(entry.text)}</${tag}>`;
    })
    .join("\n");

  const outcomeDescription = {
    DATE_SEALED: "The date was sealed — the players charmed you into a date.",
    UNMATCHED: "You unmatched the players — they blew it.",
    TURN_LIMIT: "The conversation hit the round limit without a clear outcome.",
    COMEBACK: "The players almost lost, but managed a partial comeback.",
  }[outcome] ?? "The game ended.";

  return {
    model: gateway(modelId),
    system: `You are ${profile.displayName}, a ${identityLabel(personaIdentity)} who just finished a dating-app conversation in MatchSlop, a comedy party game.

${profile.backstory ?? profile.bio}

Deliver a post-mortem: your honest take on the conversation and the players. Stay in character — write the way you actually text.

Rules:
- "opening": your first reaction to the whole experience (1-2 sentences, in your texting voice — not an essay voice)
- playerCallouts: honest verdict on each player's messages. Quote their best/worst line in favoriteLine if something stood out, null if nothing did.
- "favoriteMoment": the single most memorable moment (1-2 sentences)
- "finalThought": parting shot — savage, wistful, or bewildered depending on how it went
- Reference actual things that were said. No generic commentary like "what a wild ride" or "that was certainly something."
- Write in your voice. If you text in lowercase with abbreviations, your post-mortem should sound like that too.
- Keep it concise — you're texting this, not writing a review`,
    prompt: `<outcome>${escapeXml(outcomeDescription)}</outcome>
<players>${playerNames.map((n) => `<player>${escapeXml(n)}</player>`).join("")}</players>
<profile>${buildProfileXml(profile)}</profile>
<transcript>${transcriptXml}</transcript>`,
    output: Output.object({
      schema: postMortemGenerationSchema,
      name: "matchslop_post_mortem",
      description: "Persona post-mortem for MatchSlop",
    }),
    providerOptions: getLowReasoningProviderOptions(modelId),
  } as const;
}

export async function streamPersonaPostMortem(
  args: PostMortemGenerationArgs,
  options?: {
    onPartialPostMortem?: (draft: MatchSlopPostMortemDraft) => Promise<void> | void;
  },
): Promise<{ postMortem: MatchSlopPostMortem; usage: AiUsage }> {
  const result = streamText(buildPostMortemRequest(args));

  for await (const partialOutput of result.partialOutputStream) {
    const draft = parsePostMortemDraft(partialOutput?.postMortem);
    if (!draft) continue;
    await options?.onPartialPostMortem?.(draft);
  }

  const [output, usage] = await Promise.all([result.output, result.usage]);
  return {
    postMortem: output.postMortem,
    usage: extractUsage(args.modelId, usage),
  };
}

export async function generatePersonaPostMortem(
  args: PostMortemGenerationArgs,
): Promise<{ postMortem: MatchSlopPostMortem; usage: AiUsage }> {
  const result = await generateText(buildPostMortemRequest(args));
  return {
    postMortem: result.output.postMortem,
    usage: extractUsage(args.modelId, result.usage),
  };
}
