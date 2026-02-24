import { prisma } from "./db";
import { getRandomPrompts } from "./prompts";
import { generateJoke, aiVote, FORFEIT_TEXT, type AiUsage } from "./ai";
import { generateSpeechAudio } from "./tts";
import { filterCastVotes } from "./types";
import { WRITING_DURATION_SECONDS, VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS, HOST_STALE_MS } from "./game-constants";

export { MAX_PLAYERS, MIN_PLAYERS, WRITING_DURATION_SECONDS, VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS, HOST_STALE_MS } from "./game-constants";

/** The phase that was advanced to, or null if no transition occurred. */
export type PhaseAdvanceResult = "VOTING" | "VOTING_SUBPHASE" | "ROUND_RESULTS" | null;

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
  if (usages.length === 0) return;

  // Group by modelId — aggregate totals are derived from this map
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number }>();
  for (const u of usages) {
    if (!u.modelId) continue;
    const prev = byModel.get(u.modelId) ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    prev.inputTokens += u.inputTokens;
    prev.outputTokens += u.outputTokens;
    prev.costUsd += u.costUsd;
    byModel.set(u.modelId, prev);
  }

  if (byModel.size === 0) return;

  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  for (const m of byModel.values()) {
    totalInput += m.inputTokens;
    totalOutput += m.outputTokens;
    totalCost += m.costUsd;
  }

  await Promise.all([
    prisma.game.update({
      where: { id: gameId },
      data: {
        aiInputTokens: { increment: totalInput },
        aiOutputTokens: { increment: totalOutput },
        aiCostUsd: { increment: totalCost },
      },
    }),
    // Atomic INSERT ... ON CONFLICT to avoid race conditions between
    // concurrent accumulateUsage calls (e.g. AI responses + AI votes overlap)
    ...Array.from(byModel.entries()).map(([modelId, m]) =>
      prisma.$executeRaw`
        INSERT INTO "GameModelUsage" (id, "gameId", "modelId", "inputTokens", "outputTokens", "costUsd")
        VALUES (gen_random_uuid(), ${gameId}, ${modelId}, ${m.inputTokens}, ${m.outputTokens}, ${m.costUsd})
        ON CONFLICT ("gameId", "modelId") DO UPDATE SET
          "inputTokens" = "GameModelUsage"."inputTokens" + EXCLUDED."inputTokens",
          "outputTokens" = "GameModelUsage"."outputTokens" + EXCLUDED."outputTokens",
          "costUsd" = "GameModelUsage"."costUsd" + EXCLUDED."costUsd"
      `
    ),
  ]);
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
  const t0 = Date.now();
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
  console.log(`[generateAiResponses] Starting ${aiPlayers.length} AI players × ${round.prompts.length} prompts for game ${gameId}`);

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
  console.log(`[generateAiResponses] All AI responses done in ${Date.now() - t0}ms for game ${gameId}`);

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
    : new Date(Date.now() + VOTE_PER_PROMPT_SECONDS * 1000);

  // Atomic guard: only one caller can claim WRITING→VOTING
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "WRITING" },
    data: {
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: false,
      phaseDeadline: deadline,
      version: { increment: 1 },
    },
  });

  return claim.count > 0;
}

/** Returns prompts with 2+ non-forfeited responses for the current round, ordered by id asc. */
export async function getVotablePrompts(gameId: string) {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: {
        include: { responses: true, votes: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!round) return [];
  return round.prompts.filter(
    (p) => p.responses.length >= 2 && !p.responses.some((r) => r.text === FORFEIT_TEXT),
  );
}

/** Check if all eligible voters have voted on the prompt at votingPromptIndex. */
export async function checkAllVotesForCurrentPrompt(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== "VOTING") return false;

  const votablePrompts = await getVotablePrompts(gameId);
  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return false;

  const players = await prisma.player.findMany({ where: { gameId } });
  const respondentIds = new Set(currentPrompt.responses.map((r) => r.playerId));
  const eligibleVoters = players.filter((p) => !respondentIds.has(p.id));

  return currentPrompt.votes.length >= eligibleVoters.length;
}

/** Atomically reveal the current prompt. Returns true if this caller claimed the transition. */
export async function revealCurrentPrompt(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== "VOTING") return false;

  const deadline = game.timersDisabled
    ? null
    : new Date(Date.now() + REVEAL_SECONDS * 1000);

  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "VOTING", votingRevealing: false },
    data: {
      votingRevealing: true,
      phaseDeadline: deadline,
      version: { increment: 1 },
    },
  });

  return claim.count > 0;
}

/** Advance to the next prompt, or transition to ROUND_RESULTS if last prompt. */
export async function advanceToNextPrompt(gameId: string): Promise<"VOTING_SUBPHASE" | "ROUND_RESULTS" | null> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== "VOTING" || !game.votingRevealing) return null;

  const votablePrompts = await getVotablePrompts(gameId);
  const nextIndex = game.votingPromptIndex + 1;

  if (nextIndex >= votablePrompts.length) {
    // Last prompt done — transition to ROUND_RESULTS
    await calculateRoundScores(gameId);
    return "ROUND_RESULTS";
  }

  const deadline = game.timersDisabled
    ? null
    : new Date(Date.now() + VOTE_PER_PROMPT_SECONDS * 1000);

  const claim = await prisma.game.updateMany({
    where: {
      id: gameId,
      status: "VOTING",
      votingRevealing: true,
      votingPromptIndex: game.votingPromptIndex,
    },
    data: {
      votingPromptIndex: nextIndex,
      votingRevealing: false,
      phaseDeadline: deadline,
      version: { increment: 1 },
    },
  });

  return claim.count > 0 ? "VOTING_SUBPHASE" : null;
}

/**
 * Generate AI votes for the current round (slow, run in background).
 * Forfeited prompts (where an AI failed to generate a response) get auto-resolved:
 * all eligible voters' votes are pre-created for the non-forfeited response.
 * After completion, checks if the current prompt can be revealed.
 */
export async function generateAiVotes(gameId: string): Promise<void> {
  const t0 = Date.now();
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
  console.log(`[generateAiVotes] Starting AI votes for game ${gameId}: ${aiPlayers.length} voters × ${round.prompts.length} prompts`);

  // AI voting — skip forfeited prompts (handled separately in scoring)
  const votePromises = round.prompts.flatMap((prompt) => {
    if (prompt.responses.length < 2) return [];
    if (prompt.responses.some((r) => r.text === FORFEIT_TEXT)) return [];

    const [respA, respB] = [...prompt.responses].sort((a, b) => a.id.localeCompare(b.id));
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));

    return aiPlayers
      .filter((p) => !respondentIds.has(p.id))
      .map(async (aiPlayer): Promise<AiUsage> => {
        const { choice, usage } = await aiVote(
          aiPlayer.modelId,
          prompt.text,
          respA.text,
          respB.text,
        );
        if (choice === "ABSTAIN") {
          // Omit responseId — nullable column defaults to null (abstention)
          await prisma.vote.create({
            data: { promptId: prompt.id, voterId: aiPlayer.id },
          });
        } else {
          const chosenResponse = choice === "A" ? respA : respB;
          await prisma.vote.create({
            data: { promptId: prompt.id, voterId: aiPlayer.id, responseId: chosenResponse.id },
          });
        }
        return usage;
      });
  });

  const voteUsages = await collectUsages(votePromises);
  await accumulateUsage(gameId, voteUsages);
  console.log(`[generateAiVotes] All AI votes done in ${Date.now() - t0}ms for game ${gameId}`);

  // After AI votes: check if current prompt can be revealed
  const allVotesIn = await checkAllVotesForCurrentPrompt(gameId);
  if (allVotesIn) {
    await revealCurrentPrompt(gameId);
  }
}

async function applyRoundScores(gameId: string): Promise<void> {
  const [round, players] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      include: {
        prompts: { include: { responses: true, votes: true } },
      },
    }),
    prisma.player.findMany({ where: { gameId } }),
  ]);

  if (!round) return;

  const scoreUpdates: Record<string, number> = {};

  for (const prompt of round.prompts) {
    const hasForfeit = prompt.responses.some((r) => r.text === FORFEIT_TEXT);

    if (hasForfeit) {
      // Forfeited prompt: award the non-forfeited response full points (unanimous win equivalent)
      const winner = prompt.responses.find((r) => r.text !== FORFEIT_TEXT);
      if (!winner) continue; // both forfeited — no points for anyone
      const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
      const eligibleVoterCount = players.filter((p) => !respondentIds.has(p.id)).length;
      const points = eligibleVoterCount * 100 * round.roundNumber
        + (eligibleVoterCount >= 2 ? 100 * round.roundNumber : 0);
      scoreUpdates[winner.playerId] = (scoreUpdates[winner.playerId] ?? 0) + points;
      continue;
    }

    // Normal scoring
    const actualVotes = filterCastVotes(prompt.votes);
    const totalVotes = actualVotes.length;

    for (const response of prompt.responses) {
      const voteCount = actualVotes.filter(
        (v) => v.responseId === response.id
      ).length;

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
      .map((a) => {
        console.warn(`[fillPlaceholder] Player ${a.playerId} timed out on prompt "${prompt.text.slice(0, 50)}" in game ${gameId}`);
        return prisma.response.create({
          data: {
            promptId: prompt.id,
            playerId: a.playerId,
            text: "...",
          },
        });
      });
  });
  if (creates.length > 0) {
    console.warn(`[fillPlaceholder] Filling ${creates.length} placeholder responses for game ${gameId}`);
  }
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
 * During VOTING, steps through sub-phases (vote→reveal→next) instead of jumping to ROUND_RESULTS.
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
    if (!game.votingRevealing) {
      const claimed = await revealCurrentPrompt(gameId);
      return claimed ? "VOTING_SUBPHASE" : null;
    } else {
      return advanceToNextPrompt(gameId);
    }
  }
  return null;
}

/**
 * Check if the phase deadline has passed and advance if so.
 * Uses optimistic locking to prevent duplicate transitions from concurrent pollers.
 * During VOTING, delegates to sub-phase functions which have their own atomic guards.
 * Returns the phase advanced to, so callers can trigger AI work in background.
 */
export async function checkAndEnforceDeadline(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game?.phaseDeadline) return null;

  if (new Date() < game.phaseDeadline) return null;

  // VOTING sub-phases: delegate to sub-phase functions with their own atomic guards
  if (game.status === "VOTING") {
    if (!game.votingRevealing) {
      const claimed = await revealCurrentPrompt(gameId);
      return claimed ? "VOTING_SUBPHASE" : null;
    } else {
      return advanceToNextPrompt(gameId);
    }
  }

  // Non-VOTING phases: optimistic lock on phaseDeadline
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
