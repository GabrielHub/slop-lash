import { prisma } from "@/lib/db";
import { aiVote, FORFEIT_TEXT, generateJoke, type AiUsage } from "./ai";
import { buildPlayerHistory } from "./game-logic-core";
import {
  checkAllResponsesIn,
  checkAllVotesForCurrentPrompt,
  revealCurrentPrompt,
  startVoting,
} from "./game-logic-voting";
import { bumpReactionsVersion } from "@/lib/reactions-version";

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

export async function accumulateUsage(gameId: string, usages: AiUsage[]): Promise<void> {
  if (usages.length === 0) return;

  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
  for (const usage of usages) {
    if (!usage.modelId) continue;
    const current = byModel.get(usage.modelId) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    current.inputTokens += usage.inputTokens;
    current.outputTokens += usage.outputTokens;
    current.costUsd += usage.costUsd;
    byModel.set(usage.modelId, current);
  }

  if (byModel.size === 0) return;

  const totals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  for (const modelTotals of byModel.values()) {
    totals.inputTokens += modelTotals.inputTokens;
    totals.outputTokens += modelTotals.outputTokens;
    totals.costUsd += modelTotals.costUsd;
  }

  await Promise.all([
    prisma.game.update({
      where: { id: gameId },
      data: {
        aiInputTokens: { increment: totals.inputTokens },
        aiOutputTokens: { increment: totals.outputTokens },
        aiCostUsd: { increment: totals.costUsd },
      },
    }),
    ...Array.from(byModel.entries()).map(([modelId, totalsByModel]) =>
      prisma.$executeRaw`
        INSERT INTO "GameModelUsage" (id, "gameId", "modelId", "inputTokens", "outputTokens", "costUsd")
        VALUES (gen_random_uuid(), ${gameId}, ${modelId}, ${totalsByModel.inputTokens}, ${totalsByModel.outputTokens}, ${totalsByModel.costUsd})
        ON CONFLICT ("gameId", "modelId") DO UPDATE SET
          "inputTokens" = "GameModelUsage"."inputTokens" + EXCLUDED."inputTokens",
          "outputTokens" = "GameModelUsage"."outputTokens" + EXCLUDED."outputTokens",
          "costUsd" = "GameModelUsage"."costUsd" + EXCLUDED."costUsd"
      `,
    ),
  ]);
}

/**
 * Generate AI responses for the current round (slow, run in background).
 * Auto-advances to voting if all responses are in after AI finishes.
 */
export async function generateAiResponses(gameId: string): Promise<void> {
  const startedAt = Date.now();
  const [players, round] = await Promise.all([
    prisma.player.findMany({ where: { gameId }, select: { id: true, type: true, modelId: true, name: true } }),
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
          },
        },
      },
    }),
  ]);

  if (!round) return;

  const previousRounds = round.roundNumber > 1
    ? await prisma.round.findMany({
        where: { gameId, roundNumber: { lt: round.roundNumber } },
        orderBy: { roundNumber: "asc" },
        select: {
          roundNumber: true,
          prompts: {
            select: {
              text: true,
              responses: { select: { id: true, playerId: true, text: true } },
              votes: { select: { responseId: true } },
            },
          },
        },
      })
    : [];

  const aiPlayers = getAiPlayers(players);
  console.log(
    `[generateAiResponses] Starting ${aiPlayers.length} AI players × ${round.prompts.length} prompts for game ${gameId}`,
  );

  const responsePromises = round.prompts.flatMap((prompt) =>
    prompt.assignments
      .map((assignment) => aiPlayers.find((player) => player.id === assignment.playerId))
      .filter((player) => player != null)
      .map(async (player) => {
        const history = buildPlayerHistory(player.id, previousRounds);
        const { text, usage, failReason } = await generateJoke(player.modelId, prompt.text, history);
        await prisma.response.create({
          data: { promptId: prompt.id, playerId: player.id, text, failReason },
        });
        return usage;
      }),
  );

  const usages = await collectUsages(responsePromises);
  await accumulateUsage(gameId, usages);
  console.log(`[generateAiResponses] All AI responses done in ${Date.now() - startedAt}ms for game ${gameId}`);

  const allResponsesIn = await checkAllResponsesIn(gameId);
  if (!allResponsesIn) return;

  const claimed = await startVoting(gameId);
  if (claimed) {
    await generateAiVotes(gameId);
  }
}

/**
 * Generate AI votes for the current round (slow, run in background).
 * Forfeited prompts are skipped (only votable prompts with 2+ valid responses).
 * Bumps the game version only for votes on the currently-visible prompt so
 * clients see live vote progress; future-prompt votes stay hidden.
 * After completion, checks if the current prompt can be revealed.
 */
export async function generateAiVotes(gameId: string): Promise<void> {
  const startedAt = Date.now();
  const [game, players, round] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId }, select: { votingPromptIndex: true } }),
    prisma.player.findMany({ where: { gameId }, select: { id: true, type: true, modelId: true, name: true } }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            text: true,
            responses: {
              orderBy: { id: "asc" },
              select: { id: true, playerId: true, text: true },
            },
          },
        },
      },
    }),
  ]);

  if (!game || !round) return;

  const aiPlayers = getAiPlayers(players);
  const votable = round.prompts.filter(
    (p) => p.responses.length >= 2 && !p.responses.some((r) => r.text === FORFEIT_TEXT),
  );
  const currentPromptId = votable[game.votingPromptIndex]?.id ?? null;

  console.log(
    `[generateAiVotes] Starting AI votes for game ${gameId}: ${aiPlayers.length} voters × ${votable.length} prompts`,
  );

  const votePromises = votable.flatMap((prompt) => {
    const [responseA, responseB] = prompt.responses;
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));

    return aiPlayers
      .filter((player) => !respondentIds.has(player.id))
      .map(async (aiPlayer): Promise<AiUsage> => {
        const { choice, reactionsA, reactionsB, usage, failReason } = await aiVote(
          aiPlayer.modelId,
          prompt.text,
          responseA.text,
          responseB.text,
        );

        const responseId = choice === "A" ? responseA.id : choice === "B" ? responseB.id : null;
        await prisma.vote.create({
          data: {
            promptId: prompt.id,
            voterId: aiPlayer.id,
            responseId,
            failReason,
          },
        });

        // Bump version only for the currently-visible prompt so pollers see live progress
        if (prompt.id === currentPromptId) {
          await prisma.game.update({
            where: { id: gameId },
            data: { version: { increment: 1 } },
          });
        }

        const reactionData = [
          ...reactionsA.map((emoji) => ({ responseId: responseA.id, playerId: aiPlayer.id, emoji })),
          ...reactionsB.map((emoji) => ({ responseId: responseB.id, playerId: aiPlayer.id, emoji })),
        ];
        if (reactionData.length > 0) {
          await prisma.reaction.createMany({ data: reactionData, skipDuplicates: true });
          await bumpReactionsVersion(gameId);
        }

        return usage;
      });
  });

  const usages = await collectUsages(votePromises);
  await accumulateUsage(gameId, usages);

  console.log(`[generateAiVotes] All AI votes done in ${Date.now() - startedAt}ms for game ${gameId}`);

  const allVotesIn = await checkAllVotesForCurrentPrompt(gameId);
  if (allVotesIn) {
    await revealCurrentPrompt(gameId);
  }
}
