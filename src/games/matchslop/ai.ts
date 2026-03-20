import { createGateway, generateText, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
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
import { parseProfileDraft } from "./game-logic-core";
import type {
  MatchSlopDecision,
  MatchSlopIdentity,
  MatchSlopProfile,
  MatchSlopProfileDraft,
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
  age: z.number().int().nullable(),
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
<name>${escapeXml(example.name)}</name>
<title>${escapeXml(example.title)}</title>
<bio>${escapeXml(example.bio)}</bio>
<details job="${escapeXml(example.details.job ?? "")}" school="${escapeXml(example.details.school ?? "")}" height="${escapeXml(example.details.height ?? "")}" languages="${escapeXml(example.details.languages.join(", "))}" />
<promptExamples>${escapeXml(example.promptExamples.join(" | "))}</promptExamples>
<toneTags>${escapeXml(example.toneTags.join(", "))}</toneTags>
<redFlags>${escapeXml(example.redFlags.join(", "))}</redFlags>
<greenFlags>${escapeXml(example.greenFlags.join(", "))}</greenFlags>
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

The persona is a ${identityLabel(personaIdentity)}. The players collectively roleplay as a ${identityLabel(seekerIdentity)} trying to match.

Start with a backstory (3-5 sentences: personality, contradictions, obsessions, voice). Derive everything else from it.

- Bio under 220 characters
- 3 profile prompts with short, punchy answers
- Include job, height, and languages (at least 1). school is optional (null if omitted)
- Playful, specific, a little cursed — no hateful or sexual content
- Backstory must sustain the character across multiple conversation rounds`,
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
    console.error(`[matchslop:generateAiOpener] ${modelId} failed: ${describeError(err)}`);
    return {
      selectedPromptId: profile.prompts[0]?.id ?? null,
      text: FORFEIT_MARKER,
      usage:
        NoObjectGeneratedError.isInstance(err) && err.usage
          ? extractUsage(modelId, err.usage)
          : { ...ZERO_USAGE, modelId },
      failReason: "error",
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
    console.error(`[matchslop:generateAiFollowup] ${modelId} failed: ${describeError(err)}`);
    return {
      text: FORFEIT_MARKER,
      usage:
        NoObjectGeneratedError.isInstance(err) && err.usage
          ? extractUsage(modelId, err.usage)
          : { ...ZERO_USAGE, modelId },
      failReason: "error",
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
});

export function parsePersonaReplyResponse(
  text: string,
): {
  reply: string;
  outcome: MatchSlopDecision;
} | null {
  const parsed = parseJsonText(text, personaReplySchema);
  if (parsed && parsed.reply.trim()) return parsed;

  const loose = parseLooseJsonObject(text);
  if (loose) {
    const reply = readStringField(loose, ["reply", "text", "message", "line"]);
    const outcome = readStringField(loose, ["outcome", "decision", "status"])?.toUpperCase();
    if (!reply) return null;
    if (outcome === "CONTINUE" || outcome === "DATE_SEALED" || outcome === "UNMATCHED") {
      return { reply, outcome };
    }
    return { reply, outcome: "CONTINUE" };
  }

  const fallbackReply = fallbackPlainTextLine(text);
  return fallbackReply ? { reply: fallbackReply, outcome: "CONTINUE" } : null;
}

export function buildPersonaReplySystemPrompt(
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  forceContinue = false,
): string {
  return `You are a ${identityLabel(personaIdentity)} on a dating app. You just matched with a ${identityLabel(seekerIdentity)} and are chatting with them.

Your profile and backstory are provided — stay consistent with who you are. Reply the way you'd actually text on a dating app: short, natural, in your own voice.
${
  forceContinue
    ? `This is the opening exchange — keep the conversation going. outcome must be CONTINUE.`
    : `After replying, decide what happens next:
- CONTINUE: you're interested enough to keep talking
- DATE_SEALED: you're genuinely into this and ready to meet up
- UNMATCHED: this isn't working — you're done`
}

Respond with ONLY this JSON (no other text):
{"reply":"your message","outcome":"CONTINUE"}`;
}

export function normalizePersonaReplyOutcome(
  outcome: MatchSlopDecision,
  forceContinue = false,
): MatchSlopDecision {
  return forceContinue ? "CONTINUE" : outcome;
}

function buildFallbackPersonaReply(forceContinue: boolean): {
  reply: string;
  outcome: MatchSlopDecision;
} {
  return {
    reply: forceContinue ? "okay, that was weirdly bold. keep going." : "hmm. that bought you one more message.",
    outcome: "CONTINUE",
  };
}

export async function generatePersonaReply(
  modelId: string,
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  profile: MatchSlopProfile,
  transcript: Array<{ speaker: "PLAYERS" | "PERSONA"; text: string; authorName: string | null }>,
  options?: { forceContinue?: boolean },
): Promise<{ reply: string; outcome: MatchSlopDecision; usage: AiUsage }> {
  const forceContinue = options?.forceContinue === true;
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
      system: buildPersonaReplySystemPrompt(seekerIdentity, personaIdentity, forceContinue),
      prompt: `<profile><name>${escapeXml(profile.displayName)}</name>${profile.backstory ? `<backstory>${escapeXml(profile.backstory)}</backstory>` : ""}<bio>${escapeXml(profile.bio)}</bio><tagline>${escapeXml(profile.tagline ?? "")}</tagline></profile>\n<transcript>${transcriptXml}</transcript>`,
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const parsed = parsePersonaReplyResponse(result.text);
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
