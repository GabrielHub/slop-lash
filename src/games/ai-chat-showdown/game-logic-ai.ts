import { prisma } from "@/lib/db";
import { hasPrismaErrorCode } from "@/lib/prisma-errors";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { generateJoke, aiVoteNWay, simpleHash, LABELS, type AiUsage, type VotableResponse } from "./ai";
import {
  checkAllResponsesIn,
  checkAllVotesForCurrentPrompt,
  revealCurrentPrompt,
  startVoting,
} from "./game-logic-voting";
import { accumulateUsage } from "@/games/sloplash/game-logic-ai";

function getAiPlayers<T extends { id: string; type: string; modelId: string | null }>(
  players: T[],
): (T & { modelId: string })[] {
  return players.filter(
    (player): player is T & { modelId: string } =>
      player.type === "AI" && player.modelId !== null,
  );
}

async function collectUsages(promises: Promise<AiUsage>[]): Promise<AiUsage[]> {
  const results = await Promise.allSettled(promises);
  return results
    .filter((result): result is PromiseFulfilledResult<AiUsage> => result.status === "fulfilled")
    .map((result) => result.value);
}

/**
 * In-memory dedup: if a generation is already in-flight for a game,
 * subsequent callers piggyback on the existing promise instead of
 * firing duplicate LLM calls. Safe for serverless because after()
 * callbacks run in the same isolate.
 */
const inflightResponses = new Map<string, Promise<void>>();
const inflightVotes = new Map<string, Promise<void>>();

/** Generate AI responses for the current round. Idempotent (pre-checks + P2002 guard + in-flight dedup). */
export async function generateAiResponses(gameId: string): Promise<void> {
  const existing = inflightResponses.get(gameId);
  if (existing) {
    console.log(`[chatslop:generateAiResponses] Already in-flight for ${gameId}, waiting`);
    return existing;
  }

  const promise = doGenerateAiResponses(gameId).finally(() => {
    inflightResponses.delete(gameId);
  });
  inflightResponses.set(gameId, promise);
  return promise;
}

async function doGenerateAiResponses(gameId: string): Promise<void> {
  const startedAt = Date.now();
  const [players, round] = await Promise.all([
    prisma.player.findMany({
      where: { gameId },
      select: { id: true, type: true, modelId: true },
    }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        roundNumber: true,
        prompts: {
          select: {
            id: true,
            text: true,
            assignments: { select: { playerId: true } },
            responses: { select: { playerId: true } },
          },
        },
      },
    }),
  ]);

  if (!round) return;

  const aiPlayers = getAiPlayers(players);
  if (aiPlayers.length === 0) return;

  console.log(
    `[chatslop:generateAiResponses] Starting ${aiPlayers.length} AI players for game ${gameId} round ${round.roundNumber}`,
  );

  const responsePromises = round.prompts.flatMap((prompt) => {
    const existingResponders = new Set(prompt.responses.map((r) => r.playerId));

    return prompt.assignments
      .map((a) => aiPlayers.find((p) => p.id === a.playerId))
      .filter((player) => player != null)
      .filter((player) => !existingResponders.has(player.id))
      .map(async (player): Promise<AiUsage> => {
        const { text, usage, failReason } = await generateJoke(player.modelId, prompt.text);

        try {
          await prisma.response.create({
            data: { promptId: prompt.id, playerId: player.id, text, failReason },
          });
        } catch (err) {
          if (hasPrismaErrorCode(err, "P2002")) {
            console.log(`[chatslop:generateAiResponses] Duplicate response for ${player.id}, skipping`);
          } else {
            throw err;
          }
        }

        return usage;
      });
  });

  const usages = await collectUsages(responsePromises);
  await accumulateUsage(gameId, usages);
  console.log(`[chatslop:generateAiResponses] Done in ${Date.now() - startedAt}ms for game ${gameId}`);

  const allIn = await checkAllResponsesIn(gameId);
  if (!allIn) return;

  const claimed = await startVoting(gameId);
  if (claimed) {
    await generateAiVotes(gameId);
  }
}

/** Generate AI votes for the current round's single prompt. Idempotent (pre-checks + P2002 guard + in-flight dedup). */
export async function generateAiVotes(gameId: string): Promise<void> {
  const existing = inflightVotes.get(gameId);
  if (existing) {
    console.log(`[chatslop:generateAiVotes] Already in-flight for ${gameId}, waiting`);
    return existing;
  }

  const promise = doGenerateAiVotes(gameId).finally(() => {
    inflightVotes.delete(gameId);
  });
  inflightVotes.set(gameId, promise);
  return promise;
}

async function doGenerateAiVotes(gameId: string): Promise<void> {
  const startedAt = Date.now();
  const [players, round] = await Promise.all([
    prisma.player.findMany({
      where: { gameId },
      select: { id: true, type: true, modelId: true },
    }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        roundNumber: true,
        prompts: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            text: true,
            responses: {
              orderBy: { id: "asc" },
              select: { id: true, playerId: true, text: true },
            },
            votes: { select: { voterId: true } },
          },
        },
      },
    }),
  ]);

  if (!round) return;

  const aiPlayers = getAiPlayers(players);
  if (aiPlayers.length === 0) return;

  const prompt = round.prompts[0];
  if (!prompt) return;

  const validResponses = prompt.responses.filter((r) => r.text !== FORFEIT_MARKER);
  if (validResponses.length < 2) return;

  const existingVoterIds = new Set(prompt.votes.map((v) => v.voterId));

  console.log(
    `[chatslop:generateAiVotes] Starting AI votes for game ${gameId}: ${aiPlayers.length} voters, ${validResponses.length} responses`,
  );

  const pendingVoters = aiPlayers.filter((player) => !existingVoterIds.has(player.id));

  const votePromises = pendingVoters.map(async (aiPlayer): Promise<AiUsage> => {
      const candidateResponses = validResponses.filter((r) => r.playerId !== aiPlayer.id);
      if (candidateResponses.length === 0) {
        return { modelId: aiPlayer.modelId, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      }

      const labeledResponses: VotableResponse[] = candidateResponses.map((r, i) => ({
        id: r.id,
        label: LABELS[i] ?? String(i),
        text: r.text,
      }));

      const seed = simpleHash(`${gameId}:${round.roundNumber}:${aiPlayer.id}`);

      const { chosenResponseId, usage, failReason } = await aiVoteNWay(
        aiPlayer.modelId,
        prompt.text,
        labeledResponses,
        seed,
      );

      if (!chosenResponseId) return usage;

      try {
        await prisma.vote.create({
          data: {
            promptId: prompt.id,
            voterId: aiPlayer.id,
            responseId: chosenResponseId,
            failReason,
          },
        });
      } catch (err) {
        if (hasPrismaErrorCode(err, "P2002")) {
          console.log(`[chatslop:generateAiVotes] Duplicate vote for ${aiPlayer.id}, skipping`);
        } else {
          throw err;
        }
      }

      return usage;
    });

  const usages = await collectUsages(votePromises);
  await accumulateUsage(gameId, usages);

  // Single version bump after all AI votes are written (not per-vote)
  if (pendingVoters.length > 0) {
    await prisma.game.update({
      where: { id: gameId },
      data: { version: { increment: 1 } },
    });
  }
  console.log(`[chatslop:generateAiVotes] Done in ${Date.now() - startedAt}ms for game ${gameId}`);

  const allVotesIn = await checkAllVotesForCurrentPrompt(gameId);
  if (allVotesIn) {
    await revealCurrentPrompt(gameId);
  }
}
