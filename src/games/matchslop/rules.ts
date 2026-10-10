import { fitText } from "../../lib/fit-text";
import { sanitize } from "../../lib/sanitize";
import type { ReplyOutput } from "./ai-calls";
import { MATCHSLOP_MAX_LINE_LENGTH, MATCHSLOP_PROFILE_PROMPTS } from "./config/game-config";
import type { MatchSlopPersonaSeed } from "./config/persona-examples";
import {
  MATCHSLOP_DATE_LINE,
  MATCHSLOP_LEVEL_DELTA,
  MATCHSLOP_LEVELS,
  MATCHSLOP_MOOD_THRESHOLD_UNMATCH,
  clampMatchSlopMood,
  type MatchSlopDecision,
  type MatchSlopLevel,
  type MatchSlopOutcome,
  type MatchSlopProfile,
  type MatchSlopReplySource,
  type MatchSlopVerdict,
} from "./types";

/** Human votes count double: the room, not the bots, picks what gets sent. */
export const HUMAN_VOTE_WEIGHT = 2;
export const AI_VOTE_WEIGHT = 1;

export type TranscriptLine = {
  speaker: "PLAYERS" | "PERSONA";
  text: string;
  /** Who wrote a PLAYERS line; only the post-mortem prompt sees it. */
  authorName: string | null;
  /** How the persona judged the line (persona lines from the model only). */
  level: MatchSlopLevel | null;
  /** The profile prompt an opener answered. */
  openerPromptText: string | null;
};

/** What players write to in a round: the profile first, then the persona's last reply. */
export function roundPromptText(
  roundNumber: number,
  profile: MatchSlopProfile | null,
  transcript: TranscriptLine[],
): string {
  if (roundNumber === 1) {
    return profile
      ? `Pick one of ${profile.displayName}'s profile prompts and write the opener most likely to charm ${profile.displayName}.`
      : "Write the opening line most likely to charm this match.";
  }
  return (
    transcript.findLast((entry) => entry.speaker === "PERSONA")?.text ??
    "Write the reply most likely to charm them."
  );
}

export type Candidate = {
  id: string;
  submittedAt: number;
  weightedVotes: number;
  rawVotes: number;
};

/**
 * The message the room sends. Most weighted votes wins, then most raw votes,
 * then whoever answered first. Nobody voting still sends something.
 */
export function pickWinner<T extends Candidate>(candidates: T[]): T | null {
  return (
    candidates.toSorted(
      (left, right) =>
        right.weightedVotes - left.weightedVotes ||
        right.rawVotes - left.rawVotes ||
        left.submittedAt - right.submittedAt ||
        left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

// ---------------------------------------------------------------------------
// The persona's turn: code, not the model, decides what a reply does.
// ---------------------------------------------------------------------------

/**
 * The sent line's author earns ten points per mood point, capped at ±200. Her
 * reaction must outweigh the room's votes: a dealbreaker (-200) costs more
 * than a sent line's typical vote points plus the sent bonus, so the worst
 * texter cannot win on votes alone.
 */
export const moodPoints = (delta: number) => Math.max(-200, Math.min(200, delta * 10));

export type TurnInput = {
  mood: number;
  /** The judged level; null for a stand-in reply, which never scores. */
  level: MatchSlopLevel | null;
  round: number;
  totalRounds: number;
  /** This round is the one last shot after an unmatch. */
  comeback: boolean;
};

export type TurnResult = {
  mood: number;
  /** The level's mood delta, not the jump a comeback rescue forces. */
  delta: number;
  points: number;
  /** What the persona message is labelled with. */
  message: MatchSlopDecision;
  /** The game's outcome after this reply. */
  outcome: MatchSlopOutcome;
  /** The round of the one last shot, when this reply books it. */
  comebackRound: number | null;
};

/**
 * Applies one judged reply. Reaching the date line seals the date; the last
 * message forces a verdict; dropping to 20 books one last shot; a comeback
 * seals the date only at good or better.
 */
export function resolveTurn({ mood, level, round, totalRounds, comeback }: TurnInput): TurnResult {
  const delta = level ? MATCHSLOP_LEVEL_DELTA[level] : 0;
  const points = level ? moodPoints(delta) : 0;
  const next = clampMatchSlopMood(mood + delta);
  const result = { delta, points, comebackRound: null };
  if (comeback) {
    const saved = level === "good" || level === "great";
    return saved
      ? {
          ...result,
          mood: Math.max(next, MATCHSLOP_DATE_LINE),
          message: "DATE_SEALED",
          outcome: "DATE_SEALED",
        }
      : { ...result, mood: next, message: "UNMATCHED", outcome: "UNMATCHED" };
  }
  if (next >= MATCHSLOP_DATE_LINE) {
    return { ...result, mood: next, message: "DATE_SEALED", outcome: "DATE_SEALED" };
  }
  if (isLastMessage(round, totalRounds)) {
    return { ...result, mood: next, message: "UNMATCHED", outcome: "UNMATCHED" };
  }
  if (next <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH) {
    return {
      ...result,
      mood: next,
      message: "UNMATCHED",
      outcome: "IN_PROGRESS",
      comebackRound: round + 1,
    };
  }
  return { ...result, mood: next, message: "CONTINUE", outcome: "IN_PROGRESS" };
}

/** This round's message is the room's last one (rounds never pass the total). */
export function isLastMessage(round: number, totalRounds: number): boolean {
  return round >= totalRounds;
}

/** What a level leads to right now, as the persona is told it. */
export type Consequence = "continue" | "last-shot" | "date" | "unmatch" | "no-second-date";

function consequenceOf(turn: TurnResult, comeback: boolean): Consequence {
  if (turn.message === "DATE_SEALED") return "date";
  if (turn.message === "CONTINUE") return "continue";
  if (turn.outcome === "IN_PROGRESS") return "last-shot";
  if (comeback || turn.mood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH) return "unmatch";
  return "no-second-date";
}

/**
 * Every level's consequence from this state, computed with `resolveTurn`, so
 * the persona's reply text can agree with what the code will do.
 */
export function levelConsequences(
  state: Omit<TurnInput, "level">,
): Record<MatchSlopLevel, Consequence> {
  return Object.fromEntries(
    MATCHSLOP_LEVELS.map((level) => [
      level,
      consequenceOf(resolveTurn({ ...state, level }), state.comeback),
    ]),
  ) as Record<MatchSlopLevel, Consequence>;
}

/** How a finished game is described; null while it is still going. */
export function verdictOf(state: {
  outcome: MatchSlopOutcome;
  mood: number;
  comebackRound?: number | null;
}): MatchSlopVerdict | null {
  if (state.outcome === "DATE_SEALED") return "DATE";
  if (state.outcome === "IN_PROGRESS") return null;
  return state.mood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH || state.comebackRound != null
    ? "UNMATCHED"
    : "NO_SECOND_DATE";
}

/** Which canned line a stand-in reply needs. */
export type CannedReplyKind = "continue" | "ending" | "comeback";

/** A reply that is not the model's: shown canned, it never moves mood or points. */
export function standInReply(
  source: Exclude<MatchSlopReplySource, "model"> = "fallback",
): ReplyOutput {
  return { source, level: null, text: null, thought: null };
}

/** The persona's stand-in text when the model failed or declined. */
export function cannedReply(source: MatchSlopReplySource, kind: CannedReplyKind): string {
  if (kind === "ending") return "this was fun, but I don't think we're a match.";
  if (kind === "comeback") return "I appreciate the effort, but I'm going to pass.";
  return source === "declined" ? "ok, moving on." : "sorry, got distracted. say that again?";
}

/**
 * Text cut to at most `max` characters: a whole sentence when one fits,
 * otherwise a word boundary with "…" (see `fitText`).
 */
export function trimAtWord(text: string, max: number): string {
  return fitText(text, max, true);
}

/** Generous pre-cap for `sanitize`, so `trimAtWord` still sees whole sentences. */
const SANITIZE_PRE_CAP = 400;

/** Untrusted text (a player's or a model's), sanitized and cut to `max` at a word. */
export function clip(text: string, max: number): string {
  return trimAtWord(sanitize(text, SANITIZE_PRE_CAP), max);
}

/** A chat line from a player or a bot: one spaced line, cut to the line cap. */
export function cleanLine(text: string): string {
  return trimAtWord(
    sanitize(text, SANITIZE_PRE_CAP).replace(/\s+/gu, " "),
    MATCHSLOP_MAX_LINE_LENGTH,
  );
}

/** A usable profile straight from a hand-written seed, for when generation fails. */
export function profileFromSeed(seed: MatchSlopPersonaSeed): MatchSlopProfile {
  const answers = [...seed.greenFlags, ...seed.redFlags];
  return {
    displayName: seed.name,
    backstory: seed.backstory,
    appearance: seed.appearance,
    age: null,
    location: null,
    bio: seed.bio,
    tagline: seed.title,
    prompts: seed.promptExamples.slice(0, MATCHSLOP_PROFILE_PROMPTS).map((prompt, index) => ({
      id: `seed-${index}`,
      prompt,
      answer: answers[index % Math.max(1, answers.length)] ?? "ask me",
    })),
    details: seed.details,
  };
}
