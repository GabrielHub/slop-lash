import type { GameStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { sortPlayersByScore } from "@/games/core/player-rankings";
import { modelUsagesInclude, roundsInclude, roundsIncludeWriting, roundsIncludeActive } from "@/games/core/queries";
import { createTimedCache } from "@/lib/timed-cache";
import {
  normalizeWinnerTagline,
  WINNER_TAGLINE_GENERATING,
} from "@/games/sloplash/winner-tagline";

const GAME_PAYLOAD_CACHE_TTL_MS = 30_000;
const gamePayloadCache = createTimedCache(300);

const publicPlayerSelect = {
  id: true,
  name: true,
  type: true,
  modelId: true,
  idleRounds: true,
  score: true,
  humorRating: true,
  winStreak: true,
  participationStatus: true,
} as const;

export const gameMetaSelect = {
  id: true,
  gameType: true,
  status: true,
  version: true,
  phaseDeadline: true,
  hostPlayerId: true,
  hostControlTokenHash: true,
  hostControlLastSeen: true,
  reactionsVersion: true,
} as const satisfies Prisma.GameSelect;

const gamePayloadCommonSelect = {
  id: true,
  roomCode: true,
  gameType: true,
  personaModelId: true,
  modeState: true,
  status: true,
  currentRound: true,
  totalRounds: true,
  hostPlayerId: true,
  phaseDeadline: true,
  timersDisabled: true,
  ttsMode: true,
  ttsVoice: true,
  votingPromptIndex: true,
  votingRevealing: true,
  nextGameCode: true,
  winnerTagline: true,
  version: true,
} as const satisfies Prisma.GameSelect;

const gamePayloadPlayersSelect = {
  players: {
    select: publicPlayerSelect,
    orderBy: { score: "desc" as const },
  },
} as const satisfies Prisma.GameSelect;

export const gamePayloadLobbySelect = {
  ...gamePayloadCommonSelect,
  ...gamePayloadPlayersSelect,
} as const satisfies Prisma.GameSelect;

export const gamePayloadWritingSelect = {
  ...gamePayloadCommonSelect,
  ...gamePayloadPlayersSelect,
  rounds: {
    orderBy: { roundNumber: "desc" as const },
    take: 1,
    include: roundsIncludeWriting,
  },
} as const satisfies Prisma.GameSelect;

export const gamePayloadActiveSelect = {
  ...gamePayloadCommonSelect,
  ...gamePayloadPlayersSelect,
  rounds: {
    orderBy: { roundNumber: "desc" as const },
    take: 1,
    include: roundsIncludeActive,
  },
} as const satisfies Prisma.GameSelect;

export const gamePayloadAllRoundsSelect = {
  ...gamePayloadCommonSelect,
  ...gamePayloadPlayersSelect,
  aiInputTokens: true,
  aiOutputTokens: true,
  aiCostUsd: true,
  rounds: {
    orderBy: { roundNumber: "asc" as const },
    include: roundsInclude,
  },
  modelUsages: modelUsagesInclude,
} as const satisfies Prisma.GameSelect;

export type GameMetaPayload = Prisma.GameGetPayload<{ select: typeof gameMetaSelect }>;
export type GameRoutePayload = Prisma.GameGetPayload<{ select: typeof gamePayloadAllRoundsSelect }>;
export type NormalizedGameRoutePayload = GameRoutePayload & { winnerTaglinePending: boolean };

export function findGameMeta(roomCode: string) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: gameMetaSelect,
  });
}

/** Fill optional fields that may be absent in lighter select queries. */
export function normalizePayload(game: unknown): NormalizedGameRoutePayload {
  const g = game as Record<string, unknown>;
  return {
    ...g,
    personaModelId: (g.personaModelId as string | null) ?? null,
    modeState: g.modeState ?? null,
    winnerTagline: normalizeWinnerTagline((g.winnerTagline as string | null) ?? null),
    winnerTaglinePending: (g.winnerTagline as string | null) === WINNER_TAGLINE_GENERATING,
    aiInputTokens: (g.aiInputTokens as number) ?? 0,
    aiOutputTokens: (g.aiOutputTokens as number) ?? 0,
    aiCostUsd: (g.aiCostUsd as number) ?? 0,
    modelUsages: (g.modelUsages as GameRoutePayload["modelUsages"]) ?? [],
    players: sortPlayersByScore((g.players as GameRoutePayload["players"]) ?? []),
    rounds: (g.rounds as GameRoutePayload["rounds"]) ?? [],
  } as NormalizedGameRoutePayload;
}

export function findGamePayloadByStatus(
  roomCode: string,
  status: GameStatus,
  cacheKey?: string,
) {
  const select = (() => {
    switch (status) {
      case "LOBBY":
        return gamePayloadLobbySelect;
      case "WRITING":
        return gamePayloadWritingSelect;
      case "FINAL_RESULTS":
        return gamePayloadAllRoundsSelect;
      default:
        return gamePayloadActiveSelect;
    }
  })();

  if (cacheKey) {
    return gamePayloadCache.getOrLoad(
      `${roomCode}:${status}:${cacheKey}`,
      GAME_PAYLOAD_CACHE_TTL_MS,
      () => prisma.game.findUnique({ where: { roomCode }, select }),
    );
  }

  return prisma.game.findUnique({ where: { roomCode }, select });
}
