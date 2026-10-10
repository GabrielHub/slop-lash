import { Output } from "ai";
import { z } from "zod";
import type { AiProviderKeys } from "@/lib/ai-gateway";
import { canUseJev, decideChoices, type DecideChoicesOptions } from "@/lib/ai/jev";
import { slotKeys } from "@/lib/ai/prompt";
import { decodeXmlEntities, singleLine } from "@/lib/ai/xml";
import {
  runStructured,
  runText,
  type AiCallRecord,
  type AiFailReason,
  type LanguageModelInstance,
} from "@/lib/ai/run";
import { isForfeitMarker } from "@/games/core/constants";
import { FREE_PLAY_WRITER_MODEL_ID } from "@/lib/free-play";
import { capAnswer, dropEchoedPrompt } from "./answer";
import { mixedHash } from "../../lib/hash";
import {
  AI_RETRY_MIN_REMAINING_MS,
  MAX_PLAYERS,
  REACTION_STRIP,
  SLOPLASH_MAX_ANSWER,
  TAGLINE_MAX,
} from "./game-constants";
import {
  ballotsInstructions,
  ballotsPrompt,
  jokesInstructions,
  jokesPrompt,
  judgeQuestion,
  matchupKey,
  promptKey,
  SLOPLASH_PROMPT_VERSION,
  taglineInstructions,
  taglinePrompt,
  type JokeSeat,
  type RoundHistoryEntry,
  type TaglineFacts,
} from "./prompts";

export type { RoundHistoryEntry } from "./prompts";

/**
 * SlopLash's AI calls on the shared task layer (`src/lib/ai`): one jokes call
 * per AI seat per round, one ballots call per AI voter per round, and one
 * tagline for the leading AI. None of these throw for a model problem; each
 * returns what it got plus every call made, for `aiCalls`.
 */

/** Test seams: call these models instead of resolving them from the catalog. */
export interface ModelOverrides {
  languageModel?: LanguageModelInstance;
  decisionModel?: DecideChoicesOptions["decisionModel"];
  now?: () => number;
}

/** A failed joke call may be retried only while more than 30s of WRITING remain. */
export const canRetry = (deadline: number | null, now: number): boolean =>
  deadline === null || now < deadline - AI_RETRY_MIN_REMAINING_MS;

/**
 * Model text as it goes on the TV: entities decoded, a wrapping pair of quotes
 * stripped, capped at `max`. A quote that closes a quotation inside the line
 * ("…is still 'password123'") stays.
 */
export function cleanLine(text: string, max: number): string {
  const trimmed = decodeXmlEntities(text).trim();
  return capAnswer(unwrapQuotes(trimmed), max);
}

/**
 * Drops a quote pair that wraps the whole line, and only then: the opening
 * and closing marks must match, and no other quote of that kind may sit
 * inside (an apostrophe between letters is fine). `"No," said Dad, "no."`
 * and `'Tis the season, said 'nobody'` stay as they are.
 */
function unwrapQuotes(line: string): string {
  const double = /^["“](.*)["”]$/su.exec(line)?.[1];
  if (double !== undefined) return /["“”]/u.test(double) ? line : double;
  const single = /^['‘](.*)['’]$/su.exec(line)?.[1];
  if (single !== undefined) {
    const stray = single.replace(/(?<=\p{L})['’](?=\p{L})/gu, "");
    return /['‘’]/u.test(stray) ? line : single;
  }
  return line;
}

/**
 * Schema enums are fixed per task (providers cache the schema with the
 * prompt), so they list every key a call could ever need; the prompt names
 * the keys that apply and code ignores the rest. A seat answers two prompts
 * a round, and a voter sees at most every prompt but its own two.
 */
const JOKE_KEYS = slotKeys("P", 2);
const MATCHUP_KEYS = slotKeys("M", MAX_PLAYERS);

// ---------------------------------------------------------------------------
// Jokes
// ---------------------------------------------------------------------------

export interface JokesRequest<PromptId extends string = string> extends ModelOverrides {
  modelId: string;
  keys: AiProviderKeys;
  seat: JokeSeat;
  prompts: readonly { promptId: PromptId; text: string }[];
  history: readonly RoundHistoryEntry[];
  /** The WRITING deadline, or null when timers are off. */
  deadline: number | null;
}

export interface JokesResult<PromptId extends string = string> {
  /** Capped answers for the prompts the model answered; the rest are walkovers. */
  answers: { promptId: PromptId; text: string }[];
  calls: AiCallRecord[];
  /** Null when every prompt got an answer. */
  failReason: string | null;
}

const jokesSchema = z.object({
  answers: z
    .array(
      z.object({
        prompt: z.enum(JOKE_KEYS),
        text: z
          .string()
          .describe(`The answer: at most 12 words and ${SLOPLASH_MAX_ANSWER} characters`),
      }),
    )
    .describe("One answer per prompt key you were given"),
});

/**
 * Answers all of a seat's prompts in one structured call. When anything is
 * missing (a failed call, or answers left out or empty) and there is still
 * time, one retry asks again for only the missing prompts.
 */
export async function writeJokes<PromptId extends string>(
  request: JokesRequest<PromptId>,
): Promise<JokesResult<PromptId>> {
  const now = request.now ?? Date.now;
  const keyed = request.prompts.map((prompt, index) => ({ ...prompt, key: promptKey(index) }));
  const answers = new Map<string, string>();
  const calls: AiCallRecord[] = [];
  let failReason: AiFailReason | "incomplete" | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const missing = keyed.filter((prompt) => !answers.has(prompt.promptId));
    if (missing.length === 0) break;
    if (attempt > 0 && (failReason === "missing-key" || !canRetry(request.deadline, now()))) {
      break;
    }
    const result = await runStructured("sloplash.jokes", {
      model: request.modelId,
      keys: request.keys,
      promptVersion: SLOPLASH_PROMPT_VERSION,
      instructions: jokesInstructions(request.seat),
      prompt: jokesPrompt(missing, request.history),
      deadline: request.deadline,
      output: Output.object({ schema: jokesSchema }),
      languageModel: request.languageModel,
      now: request.now,
    });
    calls.push(result.call);
    if (!result.ok) {
      failReason = result.failReason;
      continue;
    }
    for (const answer of result.output.answers) {
      const prompt = missing.find((candidate) => candidate.key === answer.prompt);
      const text = prompt
        ? cleanLine(dropEchoedPrompt(prompt.text, answer.text), SLOPLASH_MAX_ANSWER)
        : "";
      if (!prompt || answers.has(prompt.promptId) || !text || isForfeitMarker(text)) continue;
      answers.set(prompt.promptId, text);
    }
    failReason = answers.size === keyed.length ? null : "incomplete";
  }

  return {
    answers: keyed.flatMap((prompt) => {
      const text = answers.get(prompt.promptId);
      return text === undefined ? [] : [{ promptId: prompt.promptId, text }];
    }),
    calls,
    failReason: answers.size === keyed.length ? null : (failReason ?? "incomplete"),
  };
}

// ---------------------------------------------------------------------------
// Ballots
// ---------------------------------------------------------------------------

/** A contested matchup an AI voter may vote on, in the server's A/B order. */
export interface BallotMatchup<PromptId extends string = string, ResponseId extends string = string> {
  promptId: PromptId;
  prompt: string;
  a: { responseId: ResponseId; text: string };
  b: { responseId: ResponseId; text: string };
}

export type BallotReaction = (typeof REACTION_STRIP)[number];

export interface Ballot<PromptId extends string = string, ResponseId extends string = string> {
  promptId: PromptId;
  responseId: ResponseId;
  reaction: BallotReaction | null;
}

export interface BallotsRequest<PromptId extends string = string, ResponseId extends string = string>
  extends ModelOverrides {
  /** Seeds this voter's A/B shuffle. */
  voterId: string;
  /** The voter's own model (the Free Play fallback is Haiku either way). */
  modelId: string;
  keys: AiProviderKeys;
  /** Free Play rooms ask Jev first, then fall back to the structured call. */
  freePlay: boolean;
  matchups: readonly BallotMatchup<PromptId, ResponseId>[];
  deadline: number | null;
}

export interface BallotsResult<PromptId extends string = string, ResponseId extends string = string> {
  /** One ballot per matchup the model decided; anything absent abstains. */
  ballots: Ballot<PromptId, ResponseId>[];
  calls: AiCallRecord[];
  /** Null when every matchup got a ballot. */
  failReason: string | null;
}

/**
 * Whether this voter sees the matchup's answers swapped. Derived from a mixed
 * hash of voter and matchup, so position bias cancels out across voters while
 * each ballot stays reproducible.
 */
export function swappedFor(voterId: string, promptId: string): boolean {
  return mixedHash(`${voterId}:${promptId}`) >>> 31 === 1;
}

/** The voter's view of each matchup, keyed M1…, plus how to map a pick back. */
function shuffledMatchups<P extends string, R extends string>(
  voterId: string,
  matchups: readonly BallotMatchup<P, R>[],
) {
  return matchups.map((matchup, index) => {
    const swapped = swappedFor(voterId, matchup.promptId);
    const [first, second] = swapped ? [matchup.b, matchup.a] : [matchup.a, matchup.b];
    return {
      matchup,
      key: matchupKey(index),
      view: { key: matchupKey(index), prompt: matchup.prompt, a: first.text, b: second.text },
      /** The real answer behind a shown "A" or "B". */
      responseFor: (pick: "A" | "B") => (pick === "A" ? first : second).responseId,
    };
  });
}

type Shuffled<P extends string, R extends string> = ReturnType<typeof shuffledMatchups<P, R>>;

const ballotsSchema = z.object({
  ballots: z
    .array(
      z.object({
        matchup: z.enum(MATCHUP_KEYS),
        pick: z.enum(["A", "B"]),
        reaction: z.enum(REACTION_STRIP).nullable(),
      }),
    )
    .describe("One ballot per matchup key you were given"),
});

async function structuredBallots<P extends string, R extends string>(
  request: BallotsRequest<P, R>,
  modelId: string,
  shuffled: Shuffled<P, R>,
  budgetEndsAt?: number,
) {
  const result = await runStructured("sloplash.ballots", {
    ...(budgetEndsAt === undefined ? {} : { budgetEndsAt }),
    model: modelId,
    keys: request.keys,
    promptVersion: SLOPLASH_PROMPT_VERSION,
    instructions: ballotsInstructions(),
    prompt: ballotsPrompt(shuffled.map((entry) => entry.view)),
    deadline: request.deadline,
    output: Output.object({ schema: ballotsSchema }),
    languageModel: request.languageModel,
    now: request.now,
  });
  if (!result.ok) return { call: result.call, failReason: result.failReason, ballots: null };
  const ballots: Ballot<P, R>[] = [];
  for (const ballot of result.output.ballots) {
    const entry = shuffled.find((candidate) => candidate.key === ballot.matchup);
    if (!entry || ballots.some((seen) => seen.promptId === entry.matchup.promptId)) continue;
    ballots.push({
      promptId: entry.matchup.promptId,
      responseId: entry.responseFor(ballot.pick),
      reaction: ballot.reaction,
    });
  }
  return { call: result.call, failReason: null, ballots };
}

async function judgedBallots<P extends string, R extends string>(
  request: BallotsRequest<P, R>,
  shuffled: Shuffled<P, R>,
) {
  const questions: Record<string, { instructions: string; options: Record<string, string> }> = {};
  const state: Record<string, { prompt: string; A: string; B: string }> = {};
  for (const entry of shuffled) {
    // JSON state rather than prompt text, but stripped the same way as xml() does.
    state[entry.key] = {
      prompt: singleLine(entry.view.prompt),
      A: singleLine(entry.view.a),
      B: singleLine(entry.view.b),
    };
    questions[entry.key] = {
      instructions: judgeQuestion(entry.key),
      options: {
        A: `\`matchups.${entry.key}.A\` is funnier`,
        B: `\`matchups.${entry.key}.B\` is funnier`,
      },
    };
  }
  const result = await decideChoices(questions, { matchups: state }, request.keys, {
    promptVersion: SLOPLASH_PROMPT_VERSION,
    deadline: request.deadline,
    decisionModel: request.decisionModel,
    now: request.now,
  });
  if (!result.ok) return { call: result.call, budgetEndsAt: result.budgetEndsAt, ballots: null };
  const output = result.output as Record<string, string>;
  return {
    call: result.call,
    budgetEndsAt: result.budgetEndsAt,
    ballots: shuffled.flatMap((entry): Ballot<P, R>[] => {
      const pick = output[entry.key];
      if (pick !== "A" && pick !== "B") return [];
      return [{ promptId: entry.matchup.promptId, responseId: entry.responseFor(pick), reaction: null }];
    }),
  };
}

/**
 * One AI voter's ballots for a whole round, anonymous and shuffled per voter.
 * Free Play asks Jev (one question per matchup, no reactions) and falls back
 * to the structured call; otherwise the voter's own model votes. When a reply
 * fails or leaves matchups out, one retry asks again for only the missing
 * matchups, under their original keys. A voter that still has no pick for a
 * matchup abstains on it: there is no made-up ballot.
 */
export async function castBallots<P extends string, R extends string>(
  request: BallotsRequest<P, R>,
): Promise<BallotsResult<P, R>> {
  const shuffled = shuffledMatchups(request.voterId, request.matchups);
  const calls: AiCallRecord[] = [];
  const picked = new Map<string, Ballot<P, R>>();
  const missing = () => shuffled.filter((entry) => !picked.has(entry.matchup.promptId));
  const keep = (ballots: readonly Ballot<P, R>[]) => {
    for (const ballot of ballots) if (!picked.has(ballot.promptId)) picked.set(ballot.promptId, ballot);
  };
  const finish = (failReason: string | null): BallotsResult<P, R> => {
    const ballots = shuffled.flatMap((entry) => picked.get(entry.matchup.promptId) ?? []);
    const complete = ballots.length === request.matchups.length;
    return { ballots, calls, failReason: complete ? null : (failReason ?? "incomplete") };
  };
  if (shuffled.length === 0) return finish(null);

  // Jev's fallback only gets the time Jev's budget left; the one retry gets a fresh budget.
  let fallbackEndsAt: number | undefined;
  if (request.freePlay && (request.decisionModel || canUseJev(request.keys))) {
    const judged = await judgedBallots(request, shuffled);
    calls.push(judged.call);
    if (judged.ballots) keep(judged.ballots);
    if (missing().length === 0) return finish(null);
    fallbackEndsAt = judged.budgetEndsAt;
  }

  const modelId = request.freePlay ? FREE_PLAY_WRITER_MODEL_ID : request.modelId;
  let failReason: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await structuredBallots(
      request,
      modelId,
      missing(),
      attempt === 0 ? fallbackEndsAt : undefined,
    );
    calls.push(result.call);
    if (result.ballots) keep(result.ballots);
    if (missing().length === 0) return finish(null);
    failReason = result.ballots ? "incomplete" : result.failReason;
    // A missing key or a spent budget won't get better on a second try.
    if (failReason === "missing-key" || failReason === "timeout") break;
  }
  return finish(failReason);
}

// ---------------------------------------------------------------------------
// Tagline
// ---------------------------------------------------------------------------

export interface TaglineRequest extends ModelOverrides, TaglineFacts {
  modelId: string;
  keys: AiProviderKeys;
  deadline: number | null;
}

/** The leading AI's victory line, capped at 100 characters; null when it failed or came back empty. */
export async function writeTagline(
  request: TaglineRequest,
): Promise<{ text: string | null; call: AiCallRecord; failReason: string | null }> {
  const result = await runText("sloplash.tagline", {
    model: request.modelId,
    keys: request.keys,
    promptVersion: SLOPLASH_PROMPT_VERSION,
    instructions: taglineInstructions(),
    prompt: taglinePrompt(request),
    deadline: request.deadline,
    languageModel: request.languageModel,
    now: request.now,
  });
  if (!result.ok) return { text: null, call: result.call, failReason: result.failReason };
  const text = cleanLine(result.text, TAGLINE_MAX);
  return text
    ? { text, call: result.call, failReason: null }
    : { text: null, call: result.call, failReason: "empty" };
}
