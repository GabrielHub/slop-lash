import { prisma } from "./db";
import { getRandomPrompts } from "./prompts";
import { generateJoke, aiVote, type AiUsage } from "./ai";
import { generateSpeechAudio } from "./tts";
import { WRITING_DURATION_SECONDS, VOTING_DURATION_SECONDS, HOST_STALE_MS } from "./game-constants";

export { MAX_PLAYERS, MIN_PLAYERS, WRITING_DURATION_SECONDS, VOTING_DURATION_SECONDS, HOST_STALE_MS } from "./game-constants";

/** The phase that was advanced to, or null if no transition occurred. */
export type PhaseAdvanceResult = "VOTING" | "ROUND_RESULTS" | null;

function getAiPlayers<T extends { id: string; type: string; modelId: string | null }>(
  players: T[],
): (T & { modelId: string })[] {
  return players.filter(
    (p): p is T & { modelId: string } => p.type === "AI" && p.modelId !== null,
  );
}

async function collectUsages(
  promises: Promise<AiUsage>[],
): Promise<AiUsage[]> {
  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<AiUsage> => r.status === "fulfilled")
    .map((r) => r.value);
}

async function accumulateUsage(gameId: string, usages: AiUsage[]): Promise<void> {
  const totals = usages.reduce(
    (acc, u) => ({
      inputTokens: acc.inputTokens + u.inputTokens,
      outputTokens: acc.outputTokens + u.outputTokens,
      costUsd: acc.costUsd + u.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
  if (totals.inputTokens === 0 && totals.outputTokens === 0) return;
  await prisma.game.update({
    where: { id: gameId },
    data: {
      aiInputTokens: { increment: totals.inputTokens },
      aiOutputTokens: { increment: totals.outputTokens },
      aiCostUsd: { increment: totals.costUsd },
    },
  });
}

/** Generate a random 4-character room code using unambiguous characters. */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Try up to 10 times to generate a room code not already in use. */
export async function generateUniqueRoomCode(): Promise<string | null> {
  for (let i = 0; i < 10; i++) {
    const roomCode = generateRoomCode();
    const existing = await prisma.game.findUnique({ where: { roomCode } });
    if (!existing) return roomCode;
  }
  return null;
}

export interface PromptAssignment {
  promptText: string;
  playerIds: [string, string];
}

/** Pair players with prompts in a round-robin pattern, excluding previously used prompts. */
export function assignPrompts(
  playerIds: string[],
  count: number,
  exclude: Set<string> = new Set(),
): PromptAssignment[] {
  const promptTexts = getRandomPrompts(count, exclude);
  const assignments: PromptAssignment[] = [];

  for (let i = 0; i < count; i++) {
    const p1 = playerIds[i % playerIds.length];
    const p2 = playerIds[(i + 1) % playerIds.length];
    const text = promptTexts[i] ?? `Prompt #${i + 1}: Make us laugh!`;
    assignments.push({ promptText: text, playerIds: [p1, p2] });
  }

  return assignments;
}

/**
 * Create the round and set the game to WRITING. Fast DB-only operation.
 * AI response generation is handled separately by generateAiResponses().
 */
export async function startRound(gameId: string, roundNumber: number): Promise<void> {
  const [game, players, usedPrompts] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId } }),
    prisma.player.findMany({ where: { gameId } }),
    prisma.prompt.findMany({
      where: { round: { gameId } },
      select: { text: true },
    }),
  ]);
  const playerIds = players.map((p) => p.id);
  const promptCount = playerIds.length;
  const exclude = new Set(usedPrompts.map((p) => p.text));

  const assignments = assignPrompts(playerIds, promptCount, exclude);

  const deadline = game?.timersDisabled
    ? null
    : new Date(Date.now() + WRITING_DURATION_SECONDS * 1000);

  await prisma.round.create({
    data: {
      gameId,
      roundNumber,
      prompts: {
        create: assignments.map((a) => ({
          text: a.promptText,
          assignments: {
            create: a.playerIds.map((pid) => ({ playerId: pid })),
          },
        })),
      },
    },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: { status: "WRITING", currentRound: roundNumber, phaseDeadline: deadline, version: { increment: 1 } },
  });
}

/**
 * Generate AI responses for the current round (slow, run in background).
 * Auto-advances to voting if all responses are in after AI finishes.
 */
export async function generateAiResponses(gameId: string): Promise<void> {
  const [players, round] = await Promise.all([
    prisma.player.findMany({ where: { gameId } }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      include: { prompts: { include: { assignments: true } } },
    }),
  ]);

  if (!round) return;

  const aiPlayers = getAiPlayers(players);

  const aiResponsePromises = round.prompts.flatMap((prompt) =>
    prompt.assignments
      .map((a) => aiPlayers.find((p) => p.id === a.playerId))
      .filter((p) => p != null)
      .map(async (player) => {
        const { text, usage } = await generateJoke(player.modelId, prompt.text);
        await prisma.response.create({
          data: { promptId: prompt.id, playerId: player.id, text },
        });
        return usage;
      }),
  );

  const usages = await collectUsages(aiResponsePromises);
  await accumulateUsage(gameId, usages);

  // If humans submitted before AI finished, all responses may now be in.
  const allIn = await checkAllResponsesIn(gameId);
  if (allIn) {
    const claimed = await startVoting(gameId);
    if (claimed) {
      await generateAiVotes(gameId);
    }
  }
}

/** Return true if every prompt in the current round has both responses. */
export async function checkAllResponsesIn(gameId: string): Promise<boolean> {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: { include: { responses: true } },
    },
  });

  if (!round) return false;

  return round.prompts.every((p) => p.responses.length >= 2);
}

/**
 * Transition the game from WRITING to VOTING. Fast DB-only operation.
 * Returns true if this caller claimed the transition.
 * AI vote generation is handled separately by generateAiVotes().
 */
export async function startVoting(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });

  const deadline = game?.timersDisabled
    ? null
    : new Date(Date.now() + VOTING_DURATION_SECONDS * 1000);

  // Atomic guard: only one caller can claim WRITING→VOTING
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "WRITING" },
    data: { status: "VOTING", phaseDeadline: deadline, version: { increment: 1 } },
  });

  return claim.count > 0;
}

/**
 * Generate AI votes for the current round (slow, run in background).
 * Auto-advances to round results if all votes are in after AI finishes.
 */
export async function generateAiVotes(gameId: string): Promise<void> {
  const [players, round] = await Promise.all([
    prisma.player.findMany({ where: { gameId } }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      include: {
        prompts: { include: { responses: { include: { player: true } } } },
      },
    }),
  ]);

  if (!round) return;

  const aiPlayers = getAiPlayers(players);

  const votePromises = round.prompts.flatMap((prompt) => {
    if (prompt.responses.length < 2) return [];
    const [respA, respB] = prompt.responses;
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));

    return aiPlayers
      .filter((p) => !respondentIds.has(p.id))
      .map(async (aiPlayer) => {
        const { choice, usage } = await aiVote(
          aiPlayer.modelId,
          prompt.text,
          respA.text,
          respB.text
        );
        const chosenResponse = choice === "A" ? respA : respB;
        await prisma.vote.create({
          data: {
            promptId: prompt.id,
            voterId: aiPlayer.id,
            responseId: chosenResponse.id,
          },
        });
        return usage;
      });
  });

  const voteUsages = await collectUsages(votePromises);
  await accumulateUsage(gameId, voteUsages);

  // If humans voted before AI finished, all votes may now be in.
  const allVotesIn = await checkAllVotesIn(gameId);
  if (allVotesIn) {
    await calculateRoundScores(gameId);
  }
}

/** Return true if every eligible voter has voted on every prompt in the current round. */
export async function checkAllVotesIn(gameId: string): Promise<boolean> {
  const [players, round] = await Promise.all([
    prisma.player.findMany({ where: { gameId } }),
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      include: {
        prompts: { include: { responses: true, votes: true } },
      },
    }),
  ]);

  if (!round) return false;

  for (const prompt of round.prompts) {
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
    const eligibleVoters = players.filter((p) => !respondentIds.has(p.id));
    if (prompt.votes.length < eligibleVoters.length) return false;
  }

  return true;
}

async function applyRoundScores(gameId: string): Promise<void> {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: { include: { responses: true, votes: true } },
    },
  });

  if (!round) return;

  const scoreUpdates: Record<string, number> = {};

  for (const prompt of round.prompts) {
    for (const response of prompt.responses) {
      const voteCount = prompt.votes.filter(
        (v) => v.responseId === response.id
      ).length;
      const totalVotes = prompt.votes.length;

      let points = voteCount * 100 * round.roundNumber;
      if (totalVotes >= 2 && voteCount === totalVotes) {
        points += 100 * round.roundNumber;
      }

      scoreUpdates[response.playerId] =
        (scoreUpdates[response.playerId] ?? 0) + points;
    }
  }

  await Promise.all(
    Object.entries(scoreUpdates).map(([playerId, points]) =>
      prisma.player.update({
        where: { id: playerId },
        data: { score: { increment: points } },
      })
    )
  );
}

/** Atomically transition VOTING to ROUND_RESULTS and apply scores. */
export async function calculateRoundScores(gameId: string): Promise<void> {
  // Atomic guard: only one caller can claim VOTING→ROUND_RESULTS
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "VOTING" },
    data: { status: "ROUND_RESULTS", phaseDeadline: null, version: { increment: 1 } },
  });
  if (claim.count === 0) return;

  await applyRoundScores(gameId);
}

/**
 * Fill "..." placeholder responses for any assigned players who haven't submitted.
 */
async function fillPlaceholderResponses(gameId: string): Promise<void> {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: {
        include: {
          assignments: true,
          responses: true,
        },
      },
    },
  });

  if (!round) return;

  const creates = round.prompts.flatMap((prompt) => {
    const submittedPlayerIds = new Set(prompt.responses.map((r) => r.playerId));
    return prompt.assignments
      .filter((a) => !submittedPlayerIds.has(a.playerId))
      .map((a) =>
        prisma.response.create({
          data: {
            promptId: prompt.id,
            playerId: a.playerId,
            text: "...",
          },
        })
      );
  });
  await Promise.all(creates);
}

/**
 * Advance from ROUND_RESULTS to next round or FINAL_RESULTS.
 * Returns true if a new round was started (caller should trigger AI generation).
 */
export async function advanceGame(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) return false;

  if (game.currentRound >= game.totalRounds) {
    await prisma.game.update({
      where: { id: gameId },
      data: { status: "FINAL_RESULTS", version: { increment: 1 } },
    });
    return false;
  }

  await startRound(gameId, game.currentRound + 1);
  return true;
}

/**
 * Fill placeholder responses for missing players and advance the phase.
 * Returns the phase advanced to, so callers can trigger AI work in background.
 */
export async function forceAdvancePhase(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return null;

  if (game.status === "WRITING") {
    await fillPlaceholderResponses(gameId);
    const claimed = await startVoting(gameId);
    return claimed ? "VOTING" : null;
  } else if (game.status === "VOTING") {
    await calculateRoundScores(gameId);
    return "ROUND_RESULTS";
  }
  return null;
}

/**
 * Check if the phase deadline has passed and advance if so.
 * Uses optimistic locking to prevent duplicate transitions from concurrent pollers.
 * Returns the phase advanced to, so callers can trigger AI work in background.
 */
export async function checkAndEnforceDeadline(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game?.phaseDeadline) return null;

  if (new Date() < game.phaseDeadline) return null;

  // Optimistic lock: only one concurrent caller succeeds
  const result = await prisma.game.updateMany({
    where: { id: gameId, phaseDeadline: game.phaseDeadline },
    data: { phaseDeadline: null },
  });

  if (result.count === 0) return null;

  return forceAdvancePhase(gameId);
}

/**
 * End the game early, skipping to FINAL_RESULTS.
 * Fills placeholder responses and calculates scores for the current round if needed.
 */
export async function endGameEarly(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status === "LOBBY" || game.status === "FINAL_RESULTS") return;

  // Atomically claim the transition to FINAL_RESULTS
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: game.status },
    data: { status: "FINAL_RESULTS", phaseDeadline: null, version: { increment: 1 } },
  });
  if (claim.count === 0) return;

  if (game.status === "WRITING") {
    await fillPlaceholderResponses(gameId);
  }

  if (game.status === "WRITING" || game.status === "VOTING") {
    await applyRoundScores(gameId);
  }
}

/**
 * Pre-generate TTS audio for all prompts in the current round (run in background).
 * Skips prompts that already have cached audio or fewer than 2 responses.
 */
export async function preGenerateTtsAudio(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.ttsMode !== "AI_VOICE") return;

  const round = await prisma.round.findFirst({
    where: { gameId, roundNumber: game.currentRound },
    include: {
      prompts: {
        where: { ttsAudio: null },
        include: { responses: { orderBy: { id: "asc" }, take: 2 } },
      },
    },
  });
  if (!round) return;

  const eligible = round.prompts.filter((p) => p.responses.length >= 2);

  await Promise.all(
    eligible.map(async (prompt) => {
      const [a, b] = prompt.responses;
      const audio = await generateSpeechAudio(prompt.text, a.text, b.text, game.ttsVoice);
      if (audio) {
        await prisma.prompt.updateMany({
          where: { id: prompt.id, ttsAudio: null },
          data: { ttsAudio: audio.toString("base64") },
        });
      }
    }),
  );
}

/**
 * Promote the most recently active human player to host.
 */
export async function promoteHost(gameId: string): Promise<void> {
  const nextHost = await prisma.player.findFirst({
    where: {
      gameId,
      type: "HUMAN",
      lastSeen: { gte: new Date(Date.now() - HOST_STALE_MS) },
    },
    orderBy: { lastSeen: "desc" },
  });

  if (nextHost) {
    await prisma.game.update({
      where: { id: gameId },
      data: { hostPlayerId: nextHost.id, version: { increment: 1 } },
    });
  }
}
