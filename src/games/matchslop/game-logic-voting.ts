import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import {
  buildResultsDeadline,
  buildVotingDeadline,
  getActivePlayerIds,
  parseModeState,
} from "./game-logic-core";
import type { MatchSlopRoundResult } from "./types";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function countDistinctActiveActors(actorIds: string[], activePlayerIds: string[]): number {
  if (actorIds.length === 0 || activePlayerIds.length === 0) return 0;
  const activeSet = new Set(activePlayerIds);
  return new Set(actorIds.filter((id) => activeSet.has(id))).size;
}

export async function checkAllResponsesIn(gameId: string): Promise<boolean> {
  const [round, activePlayerIds] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          select: {
            responses: { select: { playerId: true } },
          },
        },
      },
    }),
    getActivePlayerIds(gameId),
  ]);

  const prompt = round?.prompts[0];
  if (!prompt) return false;
  const activeResponses = countDistinctActiveActors(
    prompt.responses.map((response) => response.playerId),
    activePlayerIds,
  );
  return activeResponses >= activePlayerIds.length;
}

export async function startVoting(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { timersDisabled: true },
  });
  if (!game) return false;

  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "WRITING" },
    data: {
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: false,
      phaseDeadline: buildVotingDeadline(game.timersDisabled),
      version: { increment: 1 },
    },
  });
  return claim.count > 0;
}

export async function getVotablePrompts(gameId: string) {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    select: {
      prompts: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          responses: { select: { id: true, text: true } },
        },
      },
    },
  });
  if (!round) return [];
  return round.prompts.filter((prompt) =>
    prompt.responses.some((response) => response.text !== FORFEIT_MARKER),
  );
}

export async function checkAllVotesForCurrentPrompt(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingPromptIndex: true },
  });
  if (!game || game.status !== "VOTING") return false;

  const [votablePrompts, activePlayerIds] = await Promise.all([
    getVotablePrompts(gameId),
    getActivePlayerIds(gameId),
  ]);

  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return false;

  const promptWithVotes = await prisma.prompt.findUnique({
    where: { id: currentPrompt.id },
    select: {
      votes: { select: { voterId: true } },
    },
  });
  if (!promptWithVotes) return false;

  const activeVotes = countDistinctActiveActors(
    promptWithVotes.votes.map((vote) => vote.voterId),
    activePlayerIds,
  );
  return activeVotes >= activePlayerIds.length;
}

function compareResults(a: MatchSlopRoundResult, b: MatchSlopRoundResult): number {
  if (b.weightedVotes !== a.weightedVotes) return b.weightedVotes - a.weightedVotes;
  if (b.rawVotes !== a.rawVotes) return b.rawVotes - a.rawVotes;
  return a.winnerResponseId.localeCompare(b.winnerResponseId);
}

async function finalizeGameWithoutWinner(gameId: string, modeState: ReturnType<typeof parseModeState>) {
  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: "FINAL_RESULTS",
      phaseDeadline: null,
      modeState: toJson({
        ...modeState,
        outcome: "TURN_LIMIT",
        lastRoundResult: null,
      }),
      version: { increment: 1 },
    },
  });
}

export async function calculateRoundScores(gameId: string): Promise<void> {
  const [game, round, players] = await Promise.all([
    prisma.game.findUnique({
      where: { id: gameId },
      select: { status: true, timersDisabled: true, modeState: true },
    }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          select: {
            id: true,
            responses: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                playerId: true,
                text: true,
                metadata: true,
                player: { select: { name: true } },
              },
            },
            votes: {
              select: {
                responseId: true,
                voter: { select: { id: true, type: true } },
              },
            },
          },
        },
      },
    }),
    prisma.player.findMany({
      where: { gameId },
      select: { id: true, type: true },
    }),
  ]);

  if (!game || !round) return;

  const modeState = parseModeState(game.modeState);
  const playerTypeById = new Map(players.map((player) => [player.id, player.type]));

  const results = round.prompts.flatMap((prompt) => {
    const nonForfeitResponses = prompt.responses.filter((response) => response.text !== FORFEIT_MARKER);
    if (nonForfeitResponses.length === 0) return [];

    const weighted = new Map<string, number>();
    const raw = new Map<string, number>();

    for (const vote of prompt.votes) {
      if (!vote.responseId) continue;
      const voterType = playerTypeById.get(vote.voter.id);
      const weight = voterType === "AI" ? modeState.aiVoteWeight : modeState.humanVoteWeight;
      weighted.set(vote.responseId, (weighted.get(vote.responseId) ?? 0) + weight);
      raw.set(vote.responseId, (raw.get(vote.responseId) ?? 0) + 1);
    }

    const promptResults = nonForfeitResponses.map((response) => {
      const metadata =
        response.metadata != null && typeof response.metadata === "object" && !Array.isArray(response.metadata)
          ? (response.metadata as Record<string, unknown>)
          : null;
      return {
        promptId: prompt.id,
        winnerResponseId: response.id,
        winnerPlayerId: response.playerId,
        winnerText: response.text,
        authorName: response.player.name,
        weightedVotes: weighted.get(response.id) ?? 0,
        rawVotes: raw.get(response.id) ?? 0,
        selectedPromptId:
          typeof metadata?.selectedPromptId === "string" ? metadata.selectedPromptId : null,
        selectedPromptText:
          typeof metadata?.selectedPromptText === "string" ? metadata.selectedPromptText : null,
      } satisfies MatchSlopRoundResult;
    });

    promptResults.sort(compareResults);
    return promptResults.slice(0, 1);
  });

  const winner = [...results].sort(compareResults)[0];
  if (!winner) {
    await finalizeGameWithoutWinner(gameId, modeState);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id: gameId },
      data: {
        status: "ROUND_RESULTS",
        phaseDeadline: buildResultsDeadline(game.timersDisabled),
        modeState: toJson({
          ...modeState,
          lastRoundResult: winner,
        }),
        version: { increment: 1 },
      },
    });

    await tx.player.update({
      where: { id: winner.winnerPlayerId },
      data: { score: { increment: 100 } },
    });

    await tx.response.updateMany({
      where: { prompt: { round: { gameId } } },
      data: { pointsEarned: 0 },
    });

    await tx.response.update({
      where: { id: winner.winnerResponseId },
      data: { pointsEarned: 100 },
    });
  });
}

export async function revealCurrentPrompt(gameId: string): Promise<boolean> {
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "VOTING", votingRevealing: false },
    data: {
      votingRevealing: true,
      phaseDeadline: null,
      version: { increment: 1 },
    },
  });
  if (claim.count === 0) return false;
  await calculateRoundScores(gameId);
  return true;
}
