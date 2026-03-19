import { prisma } from "@/lib/db";
import {
  MATCHSLOP_AI_VOTE_WEIGHT,
  MATCHSLOP_HUMAN_VOTE_WEIGHT,
  MATCHSLOP_PERSONA_EXAMPLE_COUNT,
  MATCHSLOP_PLAYER_EXAMPLE_COUNT,
} from "./config/game-config";
import { MATCHSLOP_PERSONA_EXAMPLES } from "./config/persona-examples";
import { MATCHSLOP_PLAYER_EXAMPLES } from "./config/player-examples";
import { createInitialPersonaImageState } from "./config/persona-image";
import {
  ROUND_RESULTS_SECONDS,
  VOTING_SECONDS,
  WRITING_SECONDS,
} from "./game-constants";
import type {
  MatchSlopIdentity,
  MatchSlopModeState,
  MatchSlopProfile,
  MatchSlopProfilePrompt,
  MatchSlopRoundResult,
  MatchSlopTranscriptEntry,
} from "./types";
import { asRecord, asString, asNumber } from "@/lib/json-guards";

function isIdentity(value: unknown): value is MatchSlopIdentity {
  return value === "MAN" || value === "WOMAN" || value === "NON_BINARY" || value === "OTHER";
}

function parseProfilePrompt(value: unknown): MatchSlopProfilePrompt | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const prompt = asString(record.prompt);
  const answer = asString(record.answer);
  if (!id || !prompt || !answer) return null;
  return { id, prompt, answer };
}

function parseProfile(value: unknown): MatchSlopProfile | null {
  const record = asRecord(value);
  if (!record) return null;
  const displayName = asString(record.displayName);
  const bio = asString(record.bio);
  if (!displayName || !bio) return null;

  const prompts = Array.isArray(record.prompts)
    ? record.prompts
        .map(parseProfilePrompt)
        .filter((prompt): prompt is MatchSlopProfilePrompt => prompt != null)
    : [];
  if (prompts.length === 0) return null;

  return {
    displayName,
    age: asNumber(record.age),
    location: asString(record.location),
    bio,
    tagline: asString(record.tagline),
    prompts,
  };
}

function parseTranscriptEntry(value: unknown, index: number): MatchSlopTranscriptEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const speaker =
    record.speaker === "PERSONA"
      ? "PERSONA"
      : record.speaker === "PLAYERS"
        ? "PLAYERS"
        : null;
  const text = asString(record.text);
  if (!speaker || !text) return null;
  const outcome = asString(record.outcome);
  return {
    id: asString(record.id) ?? `entry-${index + 1}`,
    speaker,
    text,
    turn: asNumber(record.turn) ?? index + 1,
    outcome:
      outcome === "CONTINUE" ||
      outcome === "DATE_SEALED" ||
      outcome === "UNMATCHED" ||
      outcome === "TURN_LIMIT"
        ? outcome
        : null,
    authorName: asString(record.authorName),
  };
}

function parseLastRoundResult(value: unknown): MatchSlopRoundResult | null {
  const record = asRecord(value);
  if (!record) return null;
  const promptId = asString(record.promptId);
  const winnerResponseId = asString(record.winnerResponseId);
  const winnerPlayerId = asString(record.winnerPlayerId);
  const winnerText = asString(record.winnerText);
  if (!promptId || !winnerResponseId || !winnerPlayerId || !winnerText) return null;
  return {
    promptId,
    winnerResponseId,
    winnerPlayerId,
    winnerText,
    authorName: asString(record.authorName),
    weightedVotes: asNumber(record.weightedVotes) ?? 0,
    rawVotes: asNumber(record.rawVotes) ?? 0,
    selectedPromptId: asString(record.selectedPromptId),
    selectedPromptText: asString(record.selectedPromptText),
  };
}

export function createInitialModeState(
  seekerIdentity: MatchSlopIdentity,
  personaIdentity: MatchSlopIdentity,
): MatchSlopModeState {
  return {
    seekerIdentity,
    personaIdentity,
    outcome: "IN_PROGRESS",
    humanVoteWeight: MATCHSLOP_HUMAN_VOTE_WEIGHT,
    aiVoteWeight: MATCHSLOP_AI_VOTE_WEIGHT,
    selectedPersonaExampleIds: [],
    selectedPlayerExampleIds: [],
    transcript: [],
    profile: null,
    personaImage: createInitialPersonaImageState(),
    lastRoundResult: null,
  };
}

export function parseModeState(raw: unknown): MatchSlopModeState {
  const record = asRecord(raw);
  const seekerIdentity = isIdentity(record?.seekerIdentity) ? record.seekerIdentity : "OTHER";
  const personaIdentity = isIdentity(record?.personaIdentity) ? record.personaIdentity : "OTHER";
  const imageRecord = asRecord(record?.personaImage);
  const defaultImage = createInitialPersonaImageState();

  return {
    seekerIdentity,
    personaIdentity,
    outcome:
      record?.outcome === "DATE_SEALED" ||
      record?.outcome === "UNMATCHED" ||
      record?.outcome === "TURN_LIMIT"
        ? record.outcome
        : "IN_PROGRESS",
    humanVoteWeight: asNumber(record?.humanVoteWeight) ?? MATCHSLOP_HUMAN_VOTE_WEIGHT,
    aiVoteWeight: asNumber(record?.aiVoteWeight) ?? MATCHSLOP_AI_VOTE_WEIGHT,
    selectedPersonaExampleIds: Array.isArray(record?.selectedPersonaExampleIds)
      ? record.selectedPersonaExampleIds.filter((value): value is string => typeof value === "string")
      : [],
    selectedPlayerExampleIds: Array.isArray(record?.selectedPlayerExampleIds)
      ? record.selectedPlayerExampleIds.filter((value): value is string => typeof value === "string")
      : [],
    transcript: Array.isArray(record?.transcript)
      ? record.transcript
          .map((value, index) => parseTranscriptEntry(value, index))
          .filter((value): value is MatchSlopTranscriptEntry => value != null)
      : [],
    profile: parseProfile(record?.profile),
    personaImage: {
      ...defaultImage,
      ...imageRecord,
      updatedAt: asString(imageRecord?.updatedAt) ?? defaultImage.updatedAt,
    },
    lastRoundResult: parseLastRoundResult(record?.lastRoundResult),
  };
}

function futureDeadline(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export function buildWritingDeadline(timersDisabled: boolean): Date | null {
  return timersDisabled ? null : futureDeadline(WRITING_SECONDS);
}

export function buildVotingDeadline(timersDisabled: boolean): Date | null {
  return timersDisabled ? null : futureDeadline(VOTING_SECONDS);
}

export function buildResultsDeadline(timersDisabled: boolean): Date | null {
  return timersDisabled ? null : futureDeadline(ROUND_RESULTS_SECONDS);
}

export async function getActivePlayers(gameId: string) {
  return prisma.player.findMany({
    where: {
      gameId,
      type: { not: "SPECTATOR" },
      participationStatus: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      type: true,
      modelId: true,
      score: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getActivePlayerIds(gameId: string): Promise<string[]> {
  const players = await getActivePlayers(gameId);
  return players.map((player) => player.id);
}

function sampleItems<T extends { id: string }>(items: T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const pool = [...items];
  const selected: T[] = [];
  while (pool.length > 0 && selected.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(index, 1);
    if (item) selected.push(item);
  }
  return selected;
}

export function selectPersonaExamples() {
  return sampleItems(MATCHSLOP_PERSONA_EXAMPLES, MATCHSLOP_PERSONA_EXAMPLE_COUNT);
}

export function selectPlayerExamples() {
  return sampleItems(MATCHSLOP_PLAYER_EXAMPLES, MATCHSLOP_PLAYER_EXAMPLE_COUNT);
}

export function resolvePersonaExamples(ids: string[]) {
  if (ids.length === 0) return selectPersonaExamples();
  const byId = new Map(MATCHSLOP_PERSONA_EXAMPLES.map((example) => [example.id, example]));
  return ids
    .map((id) => byId.get(id))
    .filter((example): example is (typeof MATCHSLOP_PERSONA_EXAMPLES)[number] => example != null);
}

export function resolvePlayerExamples(ids: string[]) {
  if (ids.length === 0) return selectPlayerExamples();
  const byId = new Map(MATCHSLOP_PLAYER_EXAMPLES.map((example) => [example.id, example]));
  return ids
    .map((id) => byId.get(id))
    .filter((example): example is (typeof MATCHSLOP_PLAYER_EXAMPLES)[number] => example != null);
}

export function buildRoundPromptText(
  roundNumber: number,
  profile: MatchSlopProfile | null,
  transcript: MatchSlopTranscriptEntry[],
): string {
  if (roundNumber === 1) {
    return profile
      ? `Pick one of ${profile.displayName}'s profile prompts and send the funniest opener.`
      : "Write the funniest opening line to this profile.";
  }
  const latestPersonaEntry = [...transcript].reverse().find((entry) => entry.speaker === "PERSONA");
  return latestPersonaEntry?.text ?? "Reply with the funniest next message.";
}

export function buildVoteContext(
  profile: MatchSlopProfile | null,
  transcript: MatchSlopTranscriptEntry[],
  currentPromptText: string,
): string {
  const profileSummary = profile
    ? `${profile.displayName}: ${profile.bio}`
    : "Unknown profile";
  const transcriptSummary = transcript
    .map((entry) => `${entry.speaker === "PERSONA" ? "Persona" : "Players"}: ${entry.text}`)
    .join("\n");
  return `${profileSummary}\n${transcriptSummary}\nCurrent writing context: ${currentPromptText}`;
}
