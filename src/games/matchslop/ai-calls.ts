/**
 * MatchSlop's model calls on the shared task layer (`src/lib/ai`). Each one
 * returns its output plus the `aiCalls` rows; the Convex runners only add
 * provider keys. `languageModel` swaps in a mock for tests.
 */
import { Output } from "ai";
import { z } from "zod";
import type { AiProviderKeys } from "../../lib/ai-gateway";
import { decodeXmlEntities } from "../../lib/ai/xml";
import {
  runStructured,
  type AiCallRecord,
  type AiFailReason,
  type LanguageModelInstance,
} from "../../lib/ai/run";
import { MATCHSLOP_PROFILE_PROMPTS } from "./config/game-config";
import type { MatchSlopPersonaSeed } from "./config/persona-examples";
import { MAX_PLAYERS } from "./game-constants";
import {
  MATCHSLOP_PROMPT_VERSION,
  OPENER_KEYS,
  PLAYER_KEYS,
  botFollowUpPrompt,
  botLineInstructions,
  botOpenerPrompt,
  postMortemInstructions,
  postMortemPrompt,
  type PostMortemPlayer,
  profileInstructions,
  profilePrompt,
  type ProfileAvoid,
  replyInstructions,
  replyMessages,
  type PersonaBrief,
  type ReplyState,
} from "./prompts";
import { standInReply, type Consequence, type TranscriptLine } from "./rules";
import {
  MATCHSLOP_LEVELS,
  type MatchSlopIdentity,
  type MatchSlopLevel,
  type MatchSlopPostMortem,
  type MatchSlopProfile,
  type MatchSlopReplySource,
  type MatchSlopVerdict,
} from "./types";

export type CallOptions = { keys: AiProviderKeys; languageModel?: LanguageModelInstance };

type Called<Output> = { output: Output; calls: AiCallRecord[]; failReason: AiFailReason | null };

const trimmed = (value: string | null | undefined) => value?.trim() || null;

/**
 * Model text that is shown or stored. Player text reaches the model
 * entity-escaped (`xml()`), so a model that echoes it can answer `&lt;3`.
 */
const modelText = (value: string) => decodeXmlEntities(value).trim();
const modelTextOrNull = (value: string | null | undefined) =>
  value ? modelText(value) || null : null;

// ---------------------------------------------------------------------------
// Profile + image prompt
// ---------------------------------------------------------------------------

/** No numeric or length bounds: providers strip them, so code clamps instead. */
export const profileSchema = z.object({
  displayName: z.string(),
  age: z.number().nullable(),
  location: z.string().nullable(),
  appearance: z.string(),
  backstory: z.string(),
  textingStyle: z.string(),
  bio: z.string(),
  tagline: z.string().nullable(),
  prompts: z.array(z.object({ prompt: z.string(), answer: z.string() })),
  details: z.object({
    job: z.string().nullable(),
    school: z.string().nullable(),
    height: z.string().nullable(),
    languages: z.array(z.string()),
  }),
  imagePrompt: z.string(),
});

export type GeneratedPersona = {
  profile: MatchSlopProfile;
  textingStyle: string | null;
  imagePrompt: string | null;
};

const MIN_AGE = 20;
const MAX_AGE = 30;

/** The model's profile in stored shape; null when it is unusable. */
export function toGeneratedPersona(raw: z.infer<typeof profileSchema>): GeneratedPersona | null {
  const displayName = raw.displayName.trim();
  const bio = raw.bio.trim();
  const prompts = raw.prompts
    .map((prompt) => ({ prompt: prompt.prompt.trim(), answer: prompt.answer.trim() }))
    .filter((prompt) => prompt.prompt && prompt.answer)
    .slice(0, MATCHSLOP_PROFILE_PROMPTS)
    .map((prompt, index) => ({ id: `p${index + 1}`, ...prompt }));
  if (!displayName || !bio || prompts.length === 0) return null;
  const age =
    raw.age === null || !Number.isFinite(raw.age)
      ? null
      : Math.max(MIN_AGE, Math.min(MAX_AGE, Math.round(raw.age)));
  return {
    profile: {
      displayName,
      backstory: trimmed(raw.backstory),
      appearance: trimmed(raw.appearance),
      age,
      location: trimmed(raw.location),
      bio,
      tagline: trimmed(raw.tagline),
      prompts,
      details: {
        job: trimmed(raw.details.job),
        school: trimmed(raw.details.school),
        height: trimmed(raw.details.height),
        languages: raw.details.languages.map((language) => language.trim()).filter(Boolean),
      },
    },
    textingStyle: trimmed(raw.textingStyle),
    imagePrompt: trimmed(raw.imagePrompt),
  };
}

export async function generatePersona(
  input: {
    modelId: string;
    seekerIdentity: MatchSlopIdentity;
    personaIdentity: MatchSlopIdentity;
    seed: MatchSlopPersonaSeed;
    /** Names and locations of personas this room already met. */
    avoid?: ProfileAvoid;
  },
  options: CallOptions,
): Promise<Called<GeneratedPersona | null>> {
  const result = await runStructured("matchslop.profile", {
    model: input.modelId,
    keys: options.keys,
    promptVersion: MATCHSLOP_PROMPT_VERSION.profile,
    instructions: profileInstructions(input.seekerIdentity, input.personaIdentity),
    prompt: profilePrompt(input.seed, input.avoid),
    // Written while the lobby fills: no phase deadline applies.
    deadline: null,
    output: Output.object({ schema: profileSchema }),
    languageModel: options.languageModel,
  });
  if (!result.ok) return { output: null, calls: [result.call], failReason: result.failReason };
  const persona = toGeneratedPersona(result.output);
  return {
    output: persona,
    calls: [result.call],
    failReason: persona ? null : "invalid-output",
  };
}

// ---------------------------------------------------------------------------
// Bot lines
// ---------------------------------------------------------------------------

export type BotLineInput = {
  modelId: string;
  deadline: number | null;
  /** Round 1 picks a profile prompt; later rounds reply to the chat. */
  opener: boolean;
  profile: MatchSlopProfile;
  examples: string[];
  /** The `<context>` XML from `chatContextXml`, for follow-ups. */
  context: string;
};

/**
 * One schema for every round, so the cached prefix holds across the opener
 * and follow-ups: `promptId` is a fixed slot key in round 1 and null after.
 */
export const botLineSchema = z.object({
  promptId: z.enum(OPENER_KEYS).nullable(),
  line: z.string(),
});

export async function writeBotLine(
  input: BotLineInput,
  options: CallOptions,
): Promise<Called<{ text: string; openerPromptId: string | null } | null>> {
  const openerPrompts = input.profile.prompts.slice(0, MATCHSLOP_PROFILE_PROMPTS);
  const opener = input.opener && openerPrompts.length > 0;
  const result = await runStructured("matchslop.botLine", {
    model: input.modelId,
    keys: options.keys,
    promptVersion: MATCHSLOP_PROMPT_VERSION.botLine,
    instructions: botLineInstructions(input.examples),
    deadline: input.deadline,
    prompt: opener ? botOpenerPrompt(input.profile) : botFollowUpPrompt(input.context),
    output: Output.object({ schema: botLineSchema }),
    languageModel: options.languageModel,
  });
  if (!result.ok) return { output: null, calls: [result.call], failReason: result.failReason };
  const text = modelText(result.output.line);
  // A blank line is a failed call: the seat forfeits and the job says why.
  if (!text) return { output: null, calls: [result.call], failReason: "invalid-output" };
  if (!opener)
    return { output: { text, openerPromptId: null }, calls: [result.call], failReason: null };
  const slot = result.output.promptId ? OPENER_KEYS.indexOf(result.output.promptId) : -1;
  const picked = openerPrompts[slot];
  if (!picked) return { output: null, calls: [result.call], failReason: "invalid-output" };
  return { output: { text, openerPromptId: picked.id }, calls: [result.call], failReason: null };
}

// ---------------------------------------------------------------------------
// Persona reply
// ---------------------------------------------------------------------------

/** Judge first, reply second. No numeric bounds; code caps the text. */
export const replySchema = z.object({
  level: z.enum(MATCHSLOP_LEVELS),
  reply: z.string(),
  thought: z.string().nullable(),
});

export type ReplyInput = PersonaBrief & {
  modelId: string;
  deadline: number | null;
  /** The chat including the line just sent; authors are never included. */
  transcript: TranscriptLine[];
  state: ReplyState;
  consequences: Record<MatchSlopLevel, Consequence>;
};

export type ReplyOutput = {
  source: MatchSlopReplySource;
  level: MatchSlopLevel | null;
  text: string | null;
  thought: string | null;
};

/** A refusal is "declined"; any other failure is a "fallback". Neither scores. */
export function replySourceOf(failReason: AiFailReason): Exclude<MatchSlopReplySource, "model"> {
  return failReason === "refused" ? "declined" : "fallback";
}

export async function writePersonaReply(
  input: ReplyInput,
  options: CallOptions,
): Promise<Called<ReplyOutput>> {
  const result = await runStructured("matchslop.reply", {
    model: input.modelId,
    keys: options.keys,
    promptVersion: MATCHSLOP_PROMPT_VERSION.reply,
    instructions: replyInstructions(input),
    messages: replyMessages(input.transcript, input.state, input.consequences),
    deadline: input.deadline,
    output: Output.object({ schema: replySchema }),
    languageModel: options.languageModel,
  });
  if (!result.ok) {
    return {
      output: standInReply(replySourceOf(result.failReason)),
      calls: [result.call],
      failReason: result.failReason,
    };
  }
  const text = modelText(result.output.reply);
  // A blank reply is a failed call: shown canned, never scored, and recorded.
  if (!text) {
    return {
      output: standInReply(),
      calls: [result.call],
      failReason: "invalid-output",
    };
  }
  return {
    output: {
      source: "model",
      level: result.output.level,
      text,
      thought: modelTextOrNull(result.output.thought),
    },
    calls: [result.call],
    failReason: null,
  };
}

// ---------------------------------------------------------------------------
// Post-mortem
// ---------------------------------------------------------------------------

export type PostMortemInput = PersonaBrief & {
  modelId: string;
  deadline: number | null;
  verdict: MatchSlopVerdict | null;
  /** Each active player once, with how many lines they wrote and how many were sent. */
  players: PostMortemPlayer[];
  transcript: TranscriptLine[];
};

export const postMortemSchema = z.object({
  verdicts: z.array(z.object({ player: z.enum(PLAYER_KEYS), verdict: z.string() })),
  parting: z.string(),
});

export async function writePostMortem(
  input: PostMortemInput,
  options: CallOptions,
): Promise<Called<MatchSlopPostMortem | null>> {
  const players = input.players.slice(0, MAX_PLAYERS);
  const names = players.map((player) => player.name);
  if (names.length === 0) return { output: null, calls: [], failReason: null };
  const result = await runStructured("matchslop.postMortem", {
    model: input.modelId,
    keys: options.keys,
    promptVersion: MATCHSLOP_PROMPT_VERSION.postMortem,
    instructions: postMortemInstructions(input),
    prompt: postMortemPrompt(input.verdict, players, input.transcript),
    deadline: input.deadline,
    output: Output.object({ schema: postMortemSchema }),
    languageModel: options.languageModel,
  });
  if (!result.ok) return { output: null, calls: [result.call], failReason: result.failReason };
  const verdicts = [];
  for (const entry of result.output.verdicts) {
    const playerName = names[PLAYER_KEYS.indexOf(entry.player)];
    // A key past the room's players names nobody: the output is invalid.
    if (playerName === undefined) {
      return { output: null, calls: [result.call], failReason: "invalid-output" };
    }
    verdicts.push({ playerName, verdict: modelText(entry.verdict) });
  }
  return {
    output: { verdicts, parting: modelText(result.output.parting) },
    calls: [result.call],
    failReason: null,
  };
}
