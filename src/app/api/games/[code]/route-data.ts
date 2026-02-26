import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { modelUsagesInclude, roundsInclude } from "@/lib/game-queries";

const publicPlayerSelect = {
  id: true,
  name: true,
  type: true,
  modelId: true,
  idleRounds: true,
  score: true,
  humorRating: true,
  winStreak: true,
  lastSeen: true,
} as const;

export const gameMetaSelect = {
  id: true,
  status: true,
  version: true,
  phaseDeadline: true,
  hostPlayerId: true,
} as const satisfies Prisma.GameSelect;

export const gamePayloadLatestSelect = {
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
  aiInputTokens: true,
  aiOutputTokens: true,
  aiCostUsd: true,
  players: {
    select: publicPlayerSelect,
    orderBy: { score: "desc" as const },
  },
  rounds: {
    orderBy: { roundNumber: "desc" as const },
    take: 1,
    include: roundsInclude,
  },
  modelUsages: modelUsagesInclude,
} as const satisfies Prisma.GameSelect;

export const gamePayloadAllRoundsSelect = {
  ...gamePayloadLatestSelect,
  rounds: {
    orderBy: { roundNumber: "asc" as const },
    include: roundsInclude,
  },
} as const satisfies Prisma.GameSelect;

export type GameMetaPayload = Prisma.GameGetPayload<{ select: typeof gameMetaSelect }>;
export type GameRoutePayload = Prisma.GameGetPayload<{ select: typeof gamePayloadAllRoundsSelect }>;

export function findGameMeta(roomCode: string) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: gameMetaSelect,
  });
}

export function findGamePayload(roomCode: string, { allRounds = false } = {}) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: allRounds ? gamePayloadAllRoundsSelect : gamePayloadLatestSelect,
  });
}
