import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { PhaseAdvanceResult } from "@/games/core";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { advanceGame } from "./game-logic-rounds";
import { getActivePlayerIds, parseModeState } from "./game-logic-core";
import {
  getVotablePrompts,
  revealCurrentPrompt,
  startVoting,
} from "./game-logic-voting";
import { generateAiVotes } from "./game-logic-ai";
import { HOST_STALE_MS } from "./game-constants";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function fillPlaceholderResponses(gameId: string): Promise<void> {
  const [round, activePlayerIds] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          select: {
            id: true,
            assignments: { select: { playerId: true } },
            responses: { select: { playerId: true } },
          },
        },
      },
    }),
    getActivePlayerIds(gameId),
  ]);

  const prompt = round?.prompts[0];
  if (!prompt) return;

  const activeSet = new Set(activePlayerIds);
  const submitted = new Set(prompt.responses.map((response) => response.playerId));

  const missing = prompt.assignments
    .map((assignment) => assignment.playerId)
    .filter((playerId) => activeSet.has(playerId) && !submitted.has(playerId));

  if (missing.length === 0) return;

  await prisma.response.createMany({
    data: missing.map((playerId) => ({
      promptId: prompt.id,
      playerId,
      text: FORFEIT_MARKER,
    })),
    skipDuplicates: true,
  });
}

async function fillMissingVotes(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { votingPromptIndex: true },
  });
  if (!game) return;

  const [votablePrompts, activePlayerIds] = await Promise.all([
    getVotablePrompts(gameId),
    getActivePlayerIds(gameId),
  ]);

  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return;

  const prompt = await prisma.prompt.findUnique({
    where: { id: currentPrompt.id },
    select: { votes: { select: { voterId: true } } },
  });
  if (!prompt) return;

  const existing = new Set(prompt.votes.map((vote) => vote.voterId));
  const missing = activePlayerIds.filter((playerId) => !existing.has(playerId));
  if (missing.length === 0) return;

  await prisma.vote.createMany({
    data: missing.map((voterId) => ({
      promptId: currentPrompt.id,
      voterId,
      responseId: null,
    })),
    skipDuplicates: true,
  });
}

export async function forceAdvancePhase(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingRevealing: true, currentRound: true, modeState: true },
  });
  if (!game) return null;

  switch (game.status) {
    case "WRITING": {
      if (game.currentRound === 1 && parseModeState(game.modeState).profile == null) {
        return null;
      }
      await fillPlaceholderResponses(gameId);
      const claimed = await startVoting(gameId);
      if (claimed) {
        await generateAiVotes(gameId);
      }
      return claimed ? "VOTING" : null;
    }
    case "VOTING": {
      if (game.votingRevealing) return null;
      await fillMissingVotes(gameId);
      const claimed = await revealCurrentPrompt(gameId);
      return claimed ? "ROUND_RESULTS" : null;
    }
    case "ROUND_RESULTS": {
      const advanced = await advanceGame(gameId);
      return advanced ? "WRITING" : "FINAL_RESULTS";
    }
    default:
      return null;
  }
}

export async function checkAndEnforceDeadline(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { phaseDeadline: true },
  });
  if (!game?.phaseDeadline) return null;
  if (game.phaseDeadline.getTime() > Date.now()) return null;

  const claim = await prisma.game.updateMany({
    where: { id: gameId, phaseDeadline: game.phaseDeadline },
    data: { phaseDeadline: null, version: { increment: 1 } },
  });
  if (claim.count === 0) return null;

  return forceAdvancePhase(gameId);
}

export async function endGameEarly(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true },
  });
  if (!game || game.status === "LOBBY" || game.status === "FINAL_RESULTS") return;

  if (game.status === "WRITING") {
    await fillPlaceholderResponses(gameId);
  }
  if (game.status === "VOTING") {
    await fillMissingVotes(gameId);
    await revealCurrentPrompt(gameId);
  }

  const latestGame = await prisma.game.findUnique({
    where: { id: gameId },
    select: { modeState: true },
  });
  const latestModeState = parseModeState(latestGame?.modeState);

  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: "FINAL_RESULTS",
      phaseDeadline: null,
      votingRevealing: false,
      modeState: toJson({
        ...latestModeState,
        outcome:
          latestModeState.outcome === "IN_PROGRESS"
            ? "TURN_LIMIT"
            : latestModeState.outcome,
      }),
      version: { increment: 1 },
    },
  });
}

export async function promoteHost(gameId: string): Promise<void> {
  const nextHost = await prisma.player.findFirst({
    where: {
      gameId,
      type: "HUMAN",
      participationStatus: "ACTIVE",
      lastSeen: { gte: new Date(Date.now() - HOST_STALE_MS) },
    },
    orderBy: { lastSeen: "desc" },
    select: { id: true },
  });

  if (nextHost) {
    await prisma.game.update({
      where: { id: gameId },
      data: {
        hostPlayerId: nextHost.id,
        hostControlTokenHash: null,
        hostControlLastSeen: null,
        version: { increment: 1 },
      },
    });
  }
}
