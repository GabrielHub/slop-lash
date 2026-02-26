import type { GameStatus, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { modelUsagesInclude, roundsInclude, roundsIncludeWriting, roundsIncludeActive } from "@/lib/game-queries";

const publicPlayerSelect = {
  id: true,
  name: true,
  type: true,
  modelId: true,
  idleRounds: true,
  score: true,
  humorRating: true,
  winStreak: true,
} as const;

export const gameMetaSelect = {
  id: true,
  status: true,
  version: true,
  phaseDeadline: true,
  hostPlayerId: true,
} as const satisfies Prisma.GameSelect;

const gamePayloadCommonSelect = {
  id: true,
  roomCode: true,
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

export function findGameMeta(roomCode: string) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: gameMetaSelect,
  });
}

export function findGamePayloadByStatus(
  roomCode: string,
  status: GameStatus,
) {
  if (status === "LOBBY") {
    return prisma.game.findUnique({
      where: { roomCode },
      select: gamePayloadLobbySelect,
    });
  }

  if (status === "WRITING") {
    return prisma.game.findUnique({
      where: { roomCode },
      select: gamePayloadWritingSelect,
    });
  }

  if (status === "FINAL_RESULTS") {
    return prisma.game.findUnique({
      where: { roomCode },
      select: gamePayloadAllRoundsSelect,
    });
  }

  // VOTING and ROUND_RESULTS
  return prisma.game.findUnique({
    where: { roomCode },
    select: gamePayloadActiveSelect,
  });
}
