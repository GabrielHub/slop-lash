import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import type { ControllerGameState } from "@/lib/controller-types";

export const controllerMetaSelect = {
  id: true,
  gameType: true,
  status: true,
  version: true,
  phaseDeadline: true,
  hostPlayerId: true,
  hostControlLastSeen: true,
} as const satisfies Prisma.GameSelect;

export type ControllerMetaPayload = Prisma.GameGetPayload<{ select: typeof controllerMetaSelect }>;

export function findControllerMeta(roomCode: string) {
  return prisma.game.findUnique({
    where: { roomCode },
    select: controllerMetaSelect,
  });
}

export async function findControllerPayload(roomCode: string, playerId: string | null): Promise<ControllerGameState | null> {
  const game = await prisma.game.findUnique({
    where: { roomCode },
    select: {
      id: true,
      roomCode: true,
      gameType: true,
      status: true,
      currentRound: true,
      totalRounds: true,
      hostPlayerId: true,
      phaseDeadline: true,
      timersDisabled: true,
      votingPromptIndex: true,
      votingRevealing: true,
      nextGameCode: true,
      version: true,
      players: {
        select: { id: true, name: true, type: true, participationStatus: true },
        orderBy: { name: "asc" },
      },
      rounds: {
        orderBy: { roundNumber: "desc" },
        take: 1,
        select: {
          roundNumber: true,
          prompts: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              text: true,
              assignments: { select: { playerId: true } },
              responses: {
                select: { id: true, playerId: true, text: true },
                orderBy: { id: "asc" },
              },
              votes: {
                select: { voterId: true, responseId: true, failReason: true },
              },
            },
          },
        },
      },
    },
  });

  if (!game) return null;

  const { players } = game;
  const me = playerId ? players.find((p) => p.id === playerId) ?? null : null;
  const currentRound = game.rounds[0];

  let writing: ControllerGameState["writing"] = null;
  if (game.status === "WRITING" && currentRound && playerId && me?.type !== "AI") {
    const prompts = currentRound.prompts
      .filter((p) => p.assignments.some((a) => a.playerId === playerId))
      .map((p) => ({
        id: p.id,
        text: p.text,
        submitted: p.responses.some((r) => r.playerId === playerId),
      }));
    writing = { prompts };
  }

  let voting: ControllerGameState["voting"] = null;
  if (game.status === "VOTING" && currentRound) {
    const votablePrompts = currentRound.prompts.filter(
      (p) =>
        p.responses.length >= 2 &&
        !p.responses.some((r) => r.text === FORFEIT_MARKER),
    );
    const currentPrompt = votablePrompts[game.votingPromptIndex] ?? null;

    if (currentPrompt && playerId) {
      const isRespondent = currentPrompt.responses.some((r) => r.playerId === playerId);
      const ownVote = currentPrompt.votes.find((v) => v.voterId === playerId) ?? null;
      voting = {
        totalPrompts: votablePrompts.length,
        currentPrompt: {
          id: currentPrompt.id,
          text: currentPrompt.text,
          responses: currentPrompt.responses
            .filter((r) => r.text !== FORFEIT_MARKER)
            .map((r) => ({
              id: r.id,
              text: r.text,
            })),
          isRespondent,
          hasVoted: ownVote != null,
          hasAbstained:
            ownVote != null &&
            ownVote.responseId == null &&
            ownVote.failReason == null,
        },
      };
    } else {
      voting = {
        totalPrompts: votablePrompts.length,
        currentPrompt: null,
      };
    }
  }

  return {
    id: game.id,
    roomCode: game.roomCode,
    gameType: game.gameType,
    status: game.status,
    currentRound: game.currentRound,
    totalRounds: game.totalRounds,
    hostPlayerId: game.hostPlayerId,
    phaseDeadline: game.phaseDeadline?.toISOString() ?? null,
    timersDisabled: game.timersDisabled,
    votingPromptIndex: game.votingPromptIndex,
    votingRevealing: game.votingRevealing,
    nextGameCode: game.nextGameCode,
    version: game.version,
    players,
    me,
    writing,
    voting,
  };
}
