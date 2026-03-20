import { createGateway, generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
  LABELS,
  aiVoteNWay,
  escapeXml,
  extractUsage,
  getLowReasoningProviderOptions,
  type AiUsage,
} from "@/games/ai-chat-showdown/ai";
import type { MatchSlopPersonaSeed } from "./config/persona-examples";
import type {
  MatchSlopDecision,
  MatchSlopIdentity,
  MatchSlopProfile,
} from "./types";

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

const FAL_IMAGE_MODEL_ID = "fal-ai/z-image/turbo";
const FAL_IMAGE_API_URL = `https://fal.run/${FAL_IMAGE_MODEL_ID}`;

const ZERO_USAGE: AiUsage = {
  modelId: "",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const status = "status" in err ? ` [status=${(err as { status: unknown }).status}]` : "";
  return `${err.name}: ${err.message}${status}`;
}

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
    "Single adult subject, chest-up framing, natural candid pose, expressive face, modern lifestyle styling, detailed skin texture, shallow depth of field, flattering natural light.",
    languageBit,
    "No text, no watermark, no collage, no extra people, no phone in frame.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generatePersonaProfile(
  modelId: string,
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  personaExamples: MatchSlopPersonaSeed[],
): Promise<{ profile: MatchSlopProfile; usage: AiUsage }> {
  const examplesXml = personaExamples
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

  const result = await generateText({
    model: gateway(modelId),
    system: `You create fake dating-app personas for a party game called MatchSlop.

Create one dating persona with a rich backstory. Start with the backstory (3-5 sentences defining who this person really is — personality, contradictions, specific obsessions, how they talk). Then derive everything else from that backstory.

Rules:
- The persona is a ${identityLabel(personaIdentity)}
- The players are collectively roleplaying as a ${identityLabel(seekerIdentity)} trying to match with this persona
- Keep the persona playful, specific, and a little cursed
- Do not produce hateful or sexual content
- Write exactly 3 dating-app prompts with short, punchy answers
- Keep the bio under 220 characters
- Include profile details: job, height, and languages (at least 1). school is optional (null if omitted)
- The backstory drives the persona's voice in multi-round conversations — make it specific enough to sustain a character`,
    prompt: `<persona-seeds>${examplesXml}</persona-seeds>`,
    output: Output.object({
      schema: personaProfileGenerationSchema,
      name: "matchslop_profile_generation",
      description: "A fake dating-app profile for MatchSlop",
    }),
    providerOptions: getLowReasoningProviderOptions(modelId),
  });

  return {
    profile: result.output.profile,
    usage: extractUsage(modelId, result.usage),
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
      system: `You write image-generation prompts for MatchSlop, a comedy dating-app game.

Turn the persona profile into one prompt for a photorealistic dating-app portrait.

Rules:
- Describe exactly one adult person
- Make the appearance feel grounded in the backstory, bio, and profile details
- Favor concrete visual traits, clothing, styling, setting, and camera framing over vague mood words
- Keep it suitable for a dating-app profile photo: chest-up or waist-up, believable, attractive, candid, not glamour-shot overkill
- Add a few camera/lighting details that help realism
- Do not mention text, UI, split screens, collages, watermarks, usernames, or extra people
- Do not invent anything sexual, hateful, or violent
- Return only the final prompt string`,
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

export async function generateAiOpener(
  modelId: string,
  profile: MatchSlopProfile,
  examples: string[],
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
      system: `You are an AI player in MatchSlop, a party game where players compete to write the funniest dating-app opener. Players vote on the funniest line — not the most charming or romantic. You win by being the one everyone wishes they'd written.

Pick one profile prompt to answer, then write a single line.

Constraints:
- Under 300 characters — short punchy one-liners and longer unhinged monologues are both great
- Be specific and absurd over generic and clever
- Reference something concrete from the profile when possible

Avoid:
- Sincere compliments or genuine flirting
- Generic pickup lines or puns
- Anything that sounds like actual dating advice
- Being edgy for shock value — the humor should be weird, not mean

Example lines (tone reference only — do not copy these):
${examplesList}`,
      prompt: `<profile><name>${escapeXml(profile.displayName)}</name><bio>${escapeXml(profile.bio)}</bio>${promptsXml}</profile>`,
      output: Output.object({
        schema: openerSchema,
        name: "matchslop_ai_opener",
        description: "An opener and the prompt it answers",
      }),
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const selectedPromptId = profile.prompts.some((prompt) => prompt.id === result.output.selectedPromptId)
      ? result.output.selectedPromptId
      : profile.prompts[0]?.id ?? null;

    return {
      selectedPromptId,
      text: result.output.line.trim() || FORFEIT_MARKER,
      usage: extractUsage(modelId, result.usage),
      failReason: null,
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

export async function generateAiFollowup(
  modelId: string,
  context: string,
  examples: string[],
): Promise<{ text: string; usage: AiUsage; failReason: string | null }> {
  const examplesList = examples.map((e) => `- ${escapeXml(e)}`).join("\n");

  try {
    const result = await generateText({
      model: gateway(modelId),
      system: `You are an AI player in MatchSlop, a party game where players compete to write the funniest dating-app messages. Players vote on who makes the room laugh — charm is irrelevant, comedy is everything.

Write the single funniest next message in this conversation.

Constraints:
- Under 300 characters — a quick escalation or a full committed bit, either works
- One message only
- Escalate or build on what's already happening — do not restart the conversation or change the subject
- Be specific and committed to the bit

Avoid:
- Sincere or wholesome pivots
- Restating what was already said
- Generic humor that could work in any conversation
- Being mean-spirited — weird and absurd beats edgy

Example lines (tone reference only — do not copy these):
${examplesList}`,
      prompt: `<conversation-context>${escapeXml(context)}</conversation-context>`,
      output: Output.object({
        schema: followupSchema,
        name: "matchslop_ai_followup",
        description: "A funny follow-up message",
      }),
      providerOptions: getLowReasoningProviderOptions(modelId),
    });

    const text = result.output.line.trim();
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
): Promise<{ chosenResponseId: string; usage: AiUsage; failReason: string | null }> {
  const labeledResponses = responses.map((response, index) => ({
    id: response.id,
    label: LABELS[index] ?? String(index),
    text: response.text,
  }));
  return aiVoteNWay(modelId, context, labeledResponses, seed);
}

const personaReplySchema = z.object({
  reply: z.string(),
  outcome: z.enum(["CONTINUE", "DATE_SEALED", "UNMATCHED"]),
});

export function buildPersonaReplySystemPrompt(
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  forceContinue = false,
): string {
  return `You are roleplaying as the AI dating persona in MatchSlop.

Stay consistent with the persona profile. Reply like a real app conversation, not a narrator.

Rules:
- The persona is a ${identityLabel(personaIdentity)}
- The players are collectively messaging as a ${identityLabel(seekerIdentity)}
- Reply with one short dating-app style message
${
  forceContinue
    ? `- This is the opening exchange after a successful match
- The conversation must continue from here
- Outcome must be CONTINUE for this turn
- Do not unmatch or seal the date yet`
    : `- Decide whether the conversation should continue, the date is sealed, or the persona unmatches
- DATE_SEALED means the conversation genuinely landed
- UNMATCHED means the players flopped or got too weird
- CONTINUE means there is enough spark for one more exchange`
}`;
}

export function normalizePersonaReplyOutcome(
  outcome: MatchSlopDecision,
  forceContinue = false,
): MatchSlopDecision {
  return forceContinue ? "CONTINUE" : outcome;
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

  const result = await generateText({
    model: gateway(modelId),
    system: buildPersonaReplySystemPrompt(seekerIdentity, personaIdentity, forceContinue),
    prompt: `<profile><name>${escapeXml(profile.displayName)}</name>${profile.backstory ? `<backstory>${escapeXml(profile.backstory)}</backstory>` : ""}<bio>${escapeXml(profile.bio)}</bio><tagline>${escapeXml(profile.tagline ?? "")}</tagline></profile>\n<transcript>${transcriptXml}</transcript>`,
    output: Output.object({
      schema: personaReplySchema,
      name: "matchslop_persona_reply",
      description: "The persona's next reply and match outcome",
    }),
    providerOptions: getLowReasoningProviderOptions(modelId),
  });

  return {
    reply: result.output.reply.trim(),
    outcome: normalizePersonaReplyOutcome(result.output.outcome, forceContinue),
    usage: extractUsage(modelId, result.usage),
  };
}
