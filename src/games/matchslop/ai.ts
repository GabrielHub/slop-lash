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
      schema: profileSchema,
      name: "matchslop_profile",
      description: "A fake dating-app profile for MatchSlop",
    }),
    providerOptions: getLowReasoningProviderOptions(modelId),
  });

  return {
    profile: result.output,
    usage: extractUsage(modelId, result.usage),
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

export async function generatePersonaReply(
  modelId: string,
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
  profile: MatchSlopProfile,
  transcript: Array<{ speaker: "PLAYERS" | "PERSONA"; text: string; authorName: string | null }>,
): Promise<{ reply: string; outcome: MatchSlopDecision; usage: AiUsage }> {
  const transcriptXml = transcript
    .map((entry) => {
      const tag = entry.speaker === "PERSONA" ? "persona" : "players";
      const author = entry.authorName ? ` author="${escapeXml(entry.authorName)}"` : "";
      return `<${tag}${author}>${escapeXml(entry.text)}</${tag}>`;
    })
    .join("\n");

  const result = await generateText({
    model: gateway(modelId),
    system: `You are roleplaying as the AI dating persona in MatchSlop.

Stay consistent with the persona profile. Reply like a real app conversation, not a narrator.

Rules:
- The persona is a ${identityLabel(personaIdentity)}
- The players are collectively messaging as a ${identityLabel(seekerIdentity)}
- Reply with one short dating-app style message
- Decide whether the conversation should continue, the date is sealed, or the persona unmatches
- DATE_SEALED means the conversation genuinely landed
- UNMATCHED means the players flopped or got too weird
- CONTINUE means there is enough spark for one more exchange`,
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
    outcome: result.output.outcome,
    usage: extractUsage(modelId, result.usage),
  };
}
