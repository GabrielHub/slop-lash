import type {
  MatchSlopDecision,
  MatchSlopPendingPersonaReply,
  MatchSlopPostMortem,
  MatchSlopProfile,
  MatchSlopRoundResult,
} from "../src/games/matchslop/types";
import {
  MATCHSLOP_INITIAL_MOOD,
  MATCHSLOP_MOOD_THRESHOLD_UNMATCH,
  clampMatchSlopMood,
} from "../src/games/matchslop/types";

export type MatchSlopPhase = "FINAL_RESULTS" | "ROUND_RESULTS" | "VOTING" | "WRITING";

export type MatchSlopProfileGeneration = {
  status: "FAILED" | "NOT_REQUESTED" | "READY" | "STREAMING";
  updatedAt: string;
  generationId: string | null;
};

export type MatchSlopPersonaImage = {
  status: "FAILED" | "NOT_REQUESTED" | "PENDING" | "PROCESSING" | "READY";
  imageUrl: string | null;
  updatedAt: string;
};

export type MatchSlopPostMortemGeneration = {
  status: "FAILED" | "NOT_REQUESTED" | "READY" | "STREAMING";
  updatedAt: string;
  generationId: string | null;
};

export type MatchSlopTranscriptRow = {
  turn: number;
  ordinal: number;
  speaker: "PERSONA" | "PLAYERS";
  text: string;
  outcome?: "COMEBACK" | MatchSlopDecision | "TURN_LIMIT";
  authorName?: string;
  selectedPromptId?: string;
  selectedPromptText?: string;
  mood?: number;
};

export type MatchSlopRuntimeState = {
  profile: MatchSlopProfile | null;
  profileGeneration: MatchSlopProfileGeneration;
  personaImage: MatchSlopPersonaImage;
  lastRoundResult: MatchSlopRoundResult | null;
  pendingPersonaReply: MatchSlopPendingPersonaReply;
  postMortem: MatchSlopPostMortem | null;
  postMortemGeneration: MatchSlopPostMortemGeneration;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseProfile(value: unknown): MatchSlopProfile | null {
  const profile = asRecord(value);
  if (!profile) return null;
  const displayName = asString(profile.displayName);
  const bio = asString(profile.bio);
  if (!displayName || !bio || !Array.isArray(profile.prompts)) return null;

  const prompts = profile.prompts.flatMap((candidate) => {
    const prompt = asRecord(candidate);
    const id = asString(prompt?.id);
    const question = asString(prompt?.prompt);
    const answer = asString(prompt?.answer);
    return id && question && answer ? [{ id, prompt: question, answer }] : [];
  });
  if (prompts.length === 0) return null;

  const detailsRecord = asRecord(profile.details);
  const languages = Array.isArray(detailsRecord?.languages)
    ? detailsRecord.languages.filter((language): language is string => typeof language === "string")
    : [];

  return {
    displayName,
    backstory: asNullableString(profile.backstory),
    appearance: asNullableString(profile.appearance),
    age: typeof profile.age === "number" && Number.isFinite(profile.age) ? profile.age : null,
    location: asNullableString(profile.location),
    bio,
    tagline: asNullableString(profile.tagline),
    prompts,
    details: detailsRecord
      ? {
          job: asNullableString(detailsRecord.job),
          school: asNullableString(detailsRecord.school),
          height: asNullableString(detailsRecord.height),
          languages,
        }
      : null,
  };
}

function parseProfileGeneration(value: unknown, now: number): MatchSlopProfileGeneration {
  const generation = asRecord(value);
  const status = generation?.status;
  return {
    status:
      status === "STREAMING" || status === "READY" || status === "FAILED"
        ? status
        : "NOT_REQUESTED",
    updatedAt: asString(generation?.updatedAt) ?? new Date(now).toISOString(),
    generationId: asNullableString(generation?.generationId),
  };
}

function parsePersonaImage(value: unknown, now: number): MatchSlopPersonaImage {
  const image = asRecord(value);
  const status = image?.status;
  return {
    status:
      status === "PENDING" || status === "PROCESSING" || status === "READY" || status === "FAILED"
        ? status
        : "NOT_REQUESTED",
    imageUrl: asNullableString(image?.imageUrl),
    updatedAt: asString(image?.updatedAt) ?? new Date(now).toISOString(),
  };
}

export function emptyPendingPersonaReply(): MatchSlopPendingPersonaReply {
  return {
    status: "NOT_REQUESTED",
    reply: null,
    outcome: null,
    moodDelta: null,
    generationId: null,
    signalCategory: null,
    sideComment: null,
    nextSignal: null,
  };
}

function parsePendingPersonaReply(value: unknown): MatchSlopPendingPersonaReply {
  const pending = asRecord(value);
  const status = pending?.status;
  const outcome = pending?.outcome;
  return {
    status:
      status === "GENERATING" || status === "READY" || status === "FAILED"
        ? status
        : "NOT_REQUESTED",
    reply: asNullableString(pending?.reply),
    outcome:
      outcome === "CONTINUE" || outcome === "DATE_SEALED" || outcome === "UNMATCHED"
        ? outcome
        : null,
    moodDelta:
      typeof pending?.moodDelta === "number" && Number.isFinite(pending.moodDelta)
        ? pending.moodDelta
        : null,
    generationId: asNullableString(pending?.generationId),
    signalCategory: asNullableString(pending?.signalCategory),
    sideComment: asNullableString(pending?.sideComment),
    nextSignal: asNullableString(pending?.nextSignal),
  };
}

function parseRoundResult(value: unknown): MatchSlopRoundResult | null {
  const result = asRecord(value);
  const promptId = asString(result?.promptId);
  const winnerResponseId = asString(result?.winnerResponseId);
  const winnerPlayerId = asString(result?.winnerPlayerId);
  const winnerText = asString(result?.winnerText);
  if (!promptId || !winnerResponseId || !winnerPlayerId || !winnerText) return null;
  return {
    promptId,
    winnerResponseId,
    winnerPlayerId,
    winnerText,
    authorName: asNullableString(result?.authorName),
    weightedVotes: typeof result?.weightedVotes === "number" ? result.weightedVotes : 0,
    rawVotes: typeof result?.rawVotes === "number" ? result.rawVotes : 0,
    selectedPromptId: asNullableString(result?.selectedPromptId),
    selectedPromptText: asNullableString(result?.selectedPromptText),
  };
}

function parsePostMortem(value: unknown): MatchSlopPostMortem | null {
  const postMortem = asRecord(value);
  const opening = asString(postMortem?.opening);
  const favoriteMoment = asString(postMortem?.favoriteMoment);
  const finalThought = asString(postMortem?.finalThought);
  if (!opening || !favoriteMoment || !finalThought || !Array.isArray(postMortem?.playerCallouts)) {
    return null;
  }
  const playerCallouts = postMortem.playerCallouts.flatMap((candidate) => {
    const callout = asRecord(candidate);
    const playerName = asString(callout?.playerName);
    const verdict = asString(callout?.verdict);
    return playerName && verdict
      ? [{ playerName, verdict, favoriteLine: asNullableString(callout?.favoriteLine) }]
      : [];
  });
  return playerCallouts.length > 0
    ? { opening, playerCallouts, favoriteMoment, finalThought }
    : null;
}

function parsePostMortemGeneration(value: unknown, now: number): MatchSlopPostMortemGeneration {
  const generation = asRecord(value);
  const status = generation?.status;
  return {
    status:
      status === "STREAMING" || status === "READY" || status === "FAILED"
        ? status
        : "NOT_REQUESTED",
    updatedAt: asString(generation?.updatedAt) ?? new Date(now).toISOString(),
    generationId: asNullableString(generation?.generationId),
  };
}

export function readMatchSlopRuntimeState(
  state: {
    profile?: unknown;
    profileGeneration?: unknown;
    personaImage?: unknown;
    lastRoundResult?: unknown;
    pendingPersonaReply?: unknown;
    postMortem?: unknown;
    postMortemGeneration?: unknown;
  },
  now = Date.now(),
): MatchSlopRuntimeState {
  return {
    profile: parseProfile(state.profile),
    profileGeneration: parseProfileGeneration(state.profileGeneration, now),
    personaImage: parsePersonaImage(state.personaImage, now),
    lastRoundResult: parseRoundResult(state.lastRoundResult),
    pendingPersonaReply: parsePendingPersonaReply(state.pendingPersonaReply),
    postMortem: parsePostMortem(state.postMortem),
    postMortemGeneration: parsePostMortemGeneration(state.postMortemGeneration, now),
  };
}

export function buildRoundPromptText(
  roundNumber: number,
  profile: MatchSlopProfile | null,
  transcript: MatchSlopTranscriptRow[],
): string {
  if (roundNumber === 1) {
    return profile
      ? `Pick one of ${profile.displayName}'s profile prompts and send the funniest opener.`
      : "Write the funniest opening line to this profile.";
  }
  return (
    [...transcript].reverse().find((entry) => entry.speaker === "PERSONA")?.text ??
    "Reply with the funniest next message."
  );
}

export function buildConversationContext(
  profile: MatchSlopProfile | null,
  transcript: MatchSlopTranscriptRow[],
  promptText: string,
): string {
  const profileSummary = profile ? `${profile.displayName}: ${profile.bio}` : "Unknown profile";
  const transcriptSummary = transcript
    .map((entry) => `${entry.speaker === "PERSONA" ? "Persona" : "Players"}: ${entry.text}`)
    .join("\n");
  return `${profileSummary}\n${transcriptSummary}\nCurrent writing context: ${promptText}`;
}

export function resolveAdvancePlan(args: {
  currentRound: number;
  totalRounds: number;
  comebackRound: number | null;
  personaOutcome: MatchSlopDecision;
}):
  | {
      kind: "FINAL_RESULTS";
      nextOutcome: "COMEBACK" | "DATE_SEALED" | "TURN_LIMIT" | "UNMATCHED";
      transcriptOutcome: "COMEBACK" | MatchSlopDecision | "TURN_LIMIT";
      comebackRound: number | null;
    }
  | {
      kind: "NEXT_ROUND";
      nextRound: number;
      nextOutcome: "IN_PROGRESS";
      transcriptOutcome: MatchSlopDecision;
      comebackRound: number | null;
    } {
  if (args.comebackRound === args.currentRound) {
    return args.personaOutcome === "UNMATCHED"
      ? {
          kind: "FINAL_RESULTS",
          nextOutcome: "UNMATCHED",
          transcriptOutcome: "UNMATCHED",
          comebackRound: args.comebackRound,
        }
      : {
          kind: "FINAL_RESULTS",
          nextOutcome: "COMEBACK",
          transcriptOutcome: "COMEBACK",
          comebackRound: args.comebackRound,
        };
  }

  if (args.personaOutcome === "UNMATCHED") {
    const comebackRound = args.currentRound + 1;
    return {
      kind: "NEXT_ROUND",
      nextRound: comebackRound,
      nextOutcome: "IN_PROGRESS",
      transcriptOutcome: "UNMATCHED",
      comebackRound,
    };
  }
  if (args.personaOutcome === "DATE_SEALED") {
    return {
      kind: "FINAL_RESULTS",
      nextOutcome: "DATE_SEALED",
      transcriptOutcome: "DATE_SEALED",
      comebackRound: args.comebackRound,
    };
  }
  if (args.currentRound >= args.totalRounds) {
    return {
      kind: "FINAL_RESULTS",
      nextOutcome: "TURN_LIMIT",
      transcriptOutcome: "TURN_LIMIT",
      comebackRound: args.comebackRound,
    };
  }
  return {
    kind: "NEXT_ROUND",
    nextRound: args.currentRound + 1,
    nextOutcome: "IN_PROGRESS",
    transcriptOutcome: "CONTINUE",
    comebackRound: args.comebackRound,
  };
}

export function applyPersonaMood(
  currentMood: number,
  moodDelta: number,
  requestedOutcome: MatchSlopDecision,
  forceContinue: boolean,
): { mood: number; outcome: MatchSlopDecision } {
  const mood = clampMatchSlopMood(currentMood + moodDelta);
  const normalizedOutcome = forceContinue ? "CONTINUE" : requestedOutcome;
  return {
    mood,
    outcome:
      !forceContinue && mood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH ? "UNMATCHED" : normalizedOutcome,
  };
}

export function fallbackPersonaReply(forceContinue: boolean): {
  reply: string;
  outcome: MatchSlopDecision;
  moodDelta: number;
} {
  return forceContinue
    ? { reply: "okay, that was weirdly bold. keep going.", outcome: "CONTINUE", moodDelta: -5 }
    : { reply: "hmm. that bought you one more message.", outcome: "CONTINUE", moodDelta: 0 };
}

export function deriveFallbackSignal(
  moodDelta: number,
  mood: number,
  outcome: MatchSlopDecision,
): { signalCategory: string; nextSignal: string } {
  if (outcome === "DATE_SEALED") {
    return { signalCategory: "nailed it", nextSignal: "you actually pulled it off" };
  }
  if (outcome === "UNMATCHED") {
    return { signalCategory: "too much", nextSignal: "that was the last straw" };
  }
  if (moodDelta >= 15) return { signalCategory: "keep going", nextSignal: "more of that energy" };
  if (moodDelta >= 5) {
    return { signalCategory: "solid", nextSignal: "stay specific and committed" };
  }
  if (moodDelta > -5) {
    return { signalCategory: "meh", nextSignal: "say something that feels real for once" };
  }
  if (mood <= 30) {
    return { signalCategory: "danger zone", nextSignal: "last chance, make it count" };
  }
  return { signalCategory: "try harder", nextSignal: "be more specific instead of louder" };
}

export { MATCHSLOP_INITIAL_MOOD };
