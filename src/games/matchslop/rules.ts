import type { MatchSlopPersonaSeed } from "./config/persona-examples";
import {
  MATCHSLOP_MOOD_THRESHOLD_UNMATCH,
  clampMatchSlopMood,
  type MatchSlopDecision,
  type MatchSlopOutcome,
  type MatchSlopProfile,
} from "./types";

/** Human votes count double: the room, not the bots, picks what gets sent. */
export const HUMAN_VOTE_WEIGHT = 2;
export const AI_VOTE_WEIGHT = 1;

export type TranscriptLine = {
  speaker: "PLAYERS" | "PERSONA";
  text: string;
  authorName: string | null;
};

/** What players write to in a round: the profile first, then the persona's last reply. */
export function roundPromptText(
  roundNumber: number,
  profile: MatchSlopProfile | null,
  transcript: TranscriptLine[],
): string {
  if (roundNumber === 1) {
    return profile
      ? `Pick one of ${profile.displayName}'s profile prompts and send the funniest opener.`
      : "Write the funniest opening line to this profile.";
  }
  return (
    transcript.findLast((entry) => entry.speaker === "PERSONA")?.text ??
    "Reply with the funniest next message."
  );
}

export function conversationContext(
  profile: MatchSlopProfile | null,
  transcript: TranscriptLine[],
  promptText: string,
): string {
  const profileSummary = profile ? `${profile.displayName}: ${profile.bio}` : "Unknown profile";
  const transcriptSummary = transcript
    .map((entry) => `${entry.speaker === "PERSONA" ? "Persona" : "Players"}: ${entry.text}`)
    .join("\n");
  return `${profileSummary}\n${transcriptSummary}\nCurrent writing context: ${promptText}`;
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

export function applyPersonaMood(
  currentMood: number,
  moodDelta: number,
  requestedOutcome: MatchSlopDecision,
  forceContinue: boolean,
): { mood: number; outcome: MatchSlopDecision } {
  const mood = clampMatchSlopMood(currentMood + moodDelta);
  if (forceContinue) return { mood, outcome: "CONTINUE" };
  return {
    mood,
    outcome: mood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH ? "UNMATCHED" : requestedOutcome,
  };
}

/**
 * Where the chat goes after the persona answers. An unmatch earns the players
 * one comeback message; a second unmatch, or any reply to the comeback, ends it.
 */
export function resolveAdvancePlan(args: {
  currentRound: number;
  totalRounds: number;
  comebackRound: number | null;
  personaOutcome: MatchSlopDecision;
}): {
  /** The game's outcome; IN_PROGRESS means another round. */
  outcome: MatchSlopOutcome;
  /** What the persona's message is labeled with in the chat. */
  messageOutcome: MatchSlopDecision | "COMEBACK" | "TURN_LIMIT";
  comebackRound: number | null;
} {
  const { currentRound, totalRounds, comebackRound, personaOutcome } = args;
  if (comebackRound === currentRound) {
    const outcome = personaOutcome === "UNMATCHED" ? "UNMATCHED" : "COMEBACK";
    return { outcome, messageOutcome: outcome, comebackRound };
  }
  if (personaOutcome === "UNMATCHED") {
    return {
      outcome: "IN_PROGRESS",
      messageOutcome: "UNMATCHED",
      comebackRound: currentRound + 1,
    };
  }
  if (personaOutcome === "DATE_SEALED") {
    return { outcome: "DATE_SEALED", messageOutcome: "DATE_SEALED", comebackRound };
  }
  if (currentRound >= totalRounds) {
    return { outcome: "TURN_LIMIT", messageOutcome: "TURN_LIMIT", comebackRound };
  }
  return { outcome: "IN_PROGRESS", messageOutcome: "CONTINUE", comebackRound };
}

/** The persona's stand-in reply when the model fails; the signal falls back too. */
export function fallbackPersonaReply(forceContinue: boolean): {
  text: string;
  outcome: MatchSlopDecision;
  moodDelta: number;
  signalCategory: null;
  sideComment: null;
  nextSignal: null;
} {
  const signal = { signalCategory: null, sideComment: null, nextSignal: null };
  return forceContinue
    ? {
        text: "okay, that was weirdly bold. keep going.",
        outcome: "CONTINUE",
        moodDelta: -5,
        ...signal,
      }
    : {
        text: "hmm. that bought you one more message.",
        outcome: "CONTINUE",
        moodDelta: 0,
        ...signal,
      };
}

export function fallbackSignal(
  moodDelta: number,
  mood: number,
  outcome: MatchSlopDecision,
): { category: string; nextSignal: string } {
  if (outcome === "DATE_SEALED") {
    return { category: "nailed it", nextSignal: "you actually pulled it off" };
  }
  if (outcome === "UNMATCHED")
    return { category: "too much", nextSignal: "that was the last straw" };
  if (moodDelta >= 15) return { category: "keep going", nextSignal: "more of that energy" };
  if (moodDelta >= 5) return { category: "solid", nextSignal: "stay specific and committed" };
  if (moodDelta > -5) {
    return { category: "meh", nextSignal: "say something that feels real for once" };
  }
  if (mood <= 30) return { category: "danger zone", nextSignal: "last chance, make it count" };
  return { category: "try harder", nextSignal: "be more specific instead of louder" };
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
    prompts: seed.promptExamples.slice(0, 3).map((prompt, index) => ({
      id: `seed-${index}`,
      prompt,
      answer: answers[index % Math.max(1, answers.length)] ?? "ask me",
    })),
    details: seed.details,
  };
}
