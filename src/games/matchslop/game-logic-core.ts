import { prisma } from "@/lib/db";
import {
  MATCHSLOP_AI_VOTE_WEIGHT,
  MATCHSLOP_HUMAN_VOTE_WEIGHT,
  MATCHSLOP_PERSONA_EXAMPLE_COUNT,
  MATCHSLOP_PLAYER_EXAMPLE_COUNT,
} from "./config/game-config";
import { MATCHSLOP_PERSONA_EXAMPLES } from "./config/persona-examples";
import { MATCHSLOP_PLAYER_EXAMPLES } from "./config/player-examples";
import {
  ROUND_RESULTS_SECONDS,
  VOTING_SECONDS,
  WRITING_SECONDS,
} from "./game-constants";
import type {
  MatchSlopIdentity,
  MatchSlopModeState,
  MatchSlopPersonaDetails,
  MatchSlopPersonaImageState,
  MatchSlopProfile,
  MatchSlopProfilePrompt,
  MatchSlopRoundResult,
  MatchSlopTranscriptOutcome,
  MatchSlopTranscriptEntry,
} from "./types";
import { asRecord, asString, asNumber, asStringArray } from "@/lib/json-guards";

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

export function parseDetails(value: unknown): MatchSlopPersonaDetails | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    job: asString(record.job) ?? null,
    school: asString(record.school) ?? null,
    height: asString(record.height) ?? null,
    languages: asStringArray(record.languages),
  };
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
    backstory: asString(record.backstory),
    age: asNumber(record.age),
    location: asString(record.location),
    bio,
    tagline: asString(record.tagline),
    prompts,
    details: parseDetails(record.details),
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
  const outcome = asString(record.outcome) as MatchSlopTranscriptOutcome | null;
  return {
    id: asString(record.id) ?? `entry-${index + 1}`,
    speaker,
    text,
    turn: asNumber(record.turn) ?? index + 1,
    outcome:
      outcome === "CONTINUE" ||
      outcome === "DATE_SEALED" ||
      outcome === "UNMATCHED" ||
      outcome === "TURN_LIMIT" ||
      outcome === "COMEBACK"
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

function createInitialImageState(): MatchSlopPersonaImageState {
  return {
    status: "NOT_REQUESTED",
    imageUrl: null,
    updatedAt: new Date().toISOString(),
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
    selectedPlayerExamples: [],
    comebackRound: null,
    transcript: [],
    profile: null,
    personaImage: createInitialImageState(),
    lastRoundResult: null,
  };
}

export function parseModeState(raw: unknown): MatchSlopModeState {
  const record = asRecord(raw);
  const seekerIdentity = isIdentity(record?.seekerIdentity) ? record.seekerIdentity : "OTHER";
  const personaIdentity = isIdentity(record?.personaIdentity) ? record.personaIdentity : "OTHER";
  const imageRecord = asRecord(record?.personaImage);
  const defaultImage = createInitialImageState();

  return {
    seekerIdentity,
    personaIdentity,
    outcome:
      record?.outcome === "DATE_SEALED" ||
      record?.outcome === "UNMATCHED" ||
      record?.outcome === "TURN_LIMIT" ||
      record?.outcome === "COMEBACK"
        ? record.outcome
        : "IN_PROGRESS",
    humanVoteWeight: asNumber(record?.humanVoteWeight) ?? MATCHSLOP_HUMAN_VOTE_WEIGHT,
    aiVoteWeight: asNumber(record?.aiVoteWeight) ?? MATCHSLOP_AI_VOTE_WEIGHT,
    selectedPersonaExampleIds: asStringArray(record?.selectedPersonaExampleIds),
    selectedPlayerExamples: asStringArray(record?.selectedPlayerExamples),
    comebackRound: asNumber(record?.comebackRound) ?? null,
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

export function isComebackRound(
  modeState: Pick<MatchSlopModeState, "comebackRound">,
  roundNumber: number,
): boolean {
  return modeState.comebackRound === roundNumber;
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

function sampleItems<T>(items: T[], count: number): T[] {
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

export function selectPersonaExamples(personaIdentity?: MatchSlopIdentity) {
  const pool = personaIdentity
    ? MATCHSLOP_PERSONA_EXAMPLES.filter((e) => e.identity === personaIdentity)
    : MATCHSLOP_PERSONA_EXAMPLES;
  const source = pool.length > 0 ? pool : MATCHSLOP_PERSONA_EXAMPLES;
  return sampleItems(source, MATCHSLOP_PERSONA_EXAMPLE_COUNT);
}

export function selectPlayerExamples(): string[] {
  return sampleItems(MATCHSLOP_PLAYER_EXAMPLES, MATCHSLOP_PLAYER_EXAMPLE_COUNT);
}

const PERSONA_EXAMPLES_BY_ID = new Map(
  MATCHSLOP_PERSONA_EXAMPLES.map((e) => [e.id, e]),
);

export function resolvePersonaExamples(ids: string[]) {
  if (ids.length === 0) return selectPersonaExamples();
  return ids
    .map((id) => PERSONA_EXAMPLES_BY_ID.get(id))
    .filter((example): example is (typeof MATCHSLOP_PERSONA_EXAMPLES)[number] => example != null);
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
