import { prisma } from "./db";
import { getRandomPrompts } from "./prompts";
import { generateJoke, aiVote, FORFEIT_TEXT, type AiUsage, type RoundHistoryEntry } from "./ai";
import { generateSpeechAudio } from "./tts";
import { scorePrompt, type PlayerState } from "./scoring";
import { WRITING_DURATION_SECONDS, VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS, HOST_STALE_MS } from "./game-constants";

export { MAX_PLAYERS, MAX_SPECTATORS, MIN_PLAYERS, WRITING_DURATION_SECONDS, VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS, HOST_STALE_MS } from "./game-constants";

/** The phase that was advanced to, or null if no transition occurred. */
export type PhaseAdvanceResult = "VOTING" | "VOTING_SUBPHASE" | "ROUND_RESULTS" | null;

function getAiPlayers<T extends { id: string; type: string; modelId: string | null }>(
  players: T[],
): (T & { modelId: string })[] {
  return players.filter(
    (p): p is T & { modelId: string } => p.type === "AI" && p.modelId !== null,
  );
}

/** Shape returned by the previous-rounds query for building AI history. */
type PreviousRound = {
  roundNumber: number;
  prompts: {
    text: string;
    responses: { id: string; playerId: string; text: string }[];
    votes: { responseId: string | null }[];
  }[];
};

/**
 * Build a chronological history of a player's past prompts, jokes, and results.
 * Used to give AI players context about their performance in previous rounds.
 */
export function buildPlayerHistory(
  playerId: string,
  previousRounds: PreviousRound[],
): RoundHistoryEntry[] {
  const entries: RoundHistoryEntry[] = [];

  for (const round of previousRounds) {
    for (const prompt of round.prompts) {
      const playerResponse = prompt.responses.find((r) => r.playerId === playerId);
      if (!playerResponse) continue;

      const opponent = prompt.responses.find((r) => r.playerId !== playerId);
      const playerForfeited = playerResponse.text === FORFEIT_TEXT;
      const opponentForfeited = opponent?.text === FORFEIT_TEXT;

      let won: boolean;
      if (playerForfeited) {
        won = false;
      } else if (opponentForfeited) {
        won = true;
      } else {
        const castVotes = prompt.votes.filter((v) => v.responseId != null);
        const playerVotes = castVotes.filter((v) => v.responseId === playerResponse.id).length;
        const opponentVotes = opponent
          ? castVotes.filter((v) => v.responseId === opponent.id).length
          : 0;
        won = playerVotes > opponentVotes;
      }

      entries.push({
        round: round.roundNumber,
        prompt: prompt.text,
        yourJoke: playerResponse.text,
        won,
        winningJoke: !won && opponent && !opponentForfeited ? opponent.text : undefined,
      });
    }
  }

  return entries;
}

async function collectUsages(
  promises: Promise<AiUsage>[],
): Promise<AiUsage[]> {
  const results = await Promise.allSettled(promises);
  return results
    .filter((r): r is PromiseFulfilledResult<AiUsage> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function accumulateUsage(gameId: string, usages: AiUsage[]): Promise<void> {
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

  const totals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  for (const m of byModel.values()) {
    totals.inputTokens += m.inputTokens;
    totals.outputTokens += m.outputTokens;
    totals.costUsd += m.costUsd;
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
    prisma.player.findMany({ where: { gameId, type: { not: "SPECTATOR" } } }),
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

  // Fetch previous rounds for AI history (skip on round 1)
  const previousRounds = round.roundNumber > 1
    ? await prisma.round.findMany({
        where: { gameId, roundNumber: { lt: round.roundNumber } },
        orderBy: { roundNumber: "asc" },
        include: { prompts: { include: { responses: true, votes: true } } },
      })
    : [];

  const aiPlayers = getAiPlayers(players);
  console.log(`[generateAiResponses] Starting ${aiPlayers.length} AI players × ${round.prompts.length} prompts for game ${gameId}`);

  const aiResponsePromises = round.prompts.flatMap((prompt) =>
    prompt.assignments
      .map((a) => aiPlayers.find((p) => p.id === a.playerId))
      .filter((p) => p != null)
      .map(async (player) => {
        const history = buildPlayerHistory(player.id, previousRounds);
        const { text, usage } = await generateJoke(player.modelId, prompt.text, history);
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

  const players = await prisma.player.findMany({
    where: { gameId, type: { not: "SPECTATOR" } },
  });
  const respondentIds = new Set(currentPrompt.responses.map((r) => r.playerId));
  const eligibleVoters = players.filter((p) => !respondentIds.has(p.id));

  return currentPrompt.votes.length >= eligibleVoters.length;
}

/**
 * Create abstain votes (null responseId) for eligible voters who didn't vote on the current prompt.
 * Called before revealing when a deadline expires, so non-voters are recorded as abstentions.
 */
export async function fillAbstainVotes(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game || game.status !== "VOTING") return;

  const votablePrompts = await getVotablePrompts(gameId);
  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return;

  const players = await prisma.player.findMany({
    where: { gameId, type: { not: "SPECTATOR" } },
  });
  const respondentIds = new Set(currentPrompt.responses.map((r) => r.playerId));
  const existingVoterIds = new Set(currentPrompt.votes.map((v) => v.voterId));

  const missingVoters = players.filter(
    (p) => !respondentIds.has(p.id) && !existingVoterIds.has(p.id),
  );

  if (missingVoters.length > 0) {
    await prisma.vote.createMany({
      data: missingVoters.map((p) => ({
        promptId: currentPrompt.id,
        voterId: p.id,
      })),
      skipDuplicates: true,
    });
  }
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
        const { choice, reactionsA, reactionsB, usage } = await aiVote(
          aiPlayer.modelId,
          prompt.text,
          respA.text,
          respB.text,
        );
        const choiceMap: Record<string, string> = { A: respA.id, B: respB.id };
        await prisma.vote.create({
          data: { promptId: prompt.id, voterId: aiPlayer.id, responseId: choiceMap[choice] },
        });

        // Create AI reaction records
        const reactionData = [
          ...reactionsA.map((emoji) => ({ responseId: respA.id, playerId: aiPlayer.id, emoji })),
          ...reactionsB.map((emoji) => ({ responseId: respB.id, playerId: aiPlayer.id, emoji })),
        ];
        if (reactionData.length > 0) {
          await prisma.reaction.createMany({ data: reactionData, skipDuplicates: true });
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
        prompts: {
          include: {
            responses: true,
            votes: { include: { voter: { select: { id: true, type: true } } } },
          },
        },
      },
    }),
    prisma.player.findMany({ where: { gameId, type: { not: "SPECTATOR" } } }),
  ]);

  if (!round) return;

  // Build mutable player states — updated after each prompt
  const playerStates = new Map<string, PlayerState>(
    players.map((p) => [p.id, { score: p.score, humorRating: p.humorRating, winStreak: p.winStreak }]),
  );

  const scoreIncrements: Record<string, number> = {};
  const responsePoints: { id: string; points: number }[] = [];

  for (const prompt of round.prompts) {
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
    const eligibleVoterCount = players.filter((p) => !respondentIds.has(p.id)).length;

    const result = scorePrompt(
      prompt.responses.map((r) => ({ id: r.id, playerId: r.playerId, text: r.text })),
      prompt.votes.map((v) => ({ id: v.voter.id, type: v.voter.type, responseId: v.responseId })),
      playerStates,
      round.roundNumber,
      eligibleVoterCount,
    );

    // Accumulate score increments and track per-response points
    for (const resp of prompt.responses) {
      const pts = result.points[resp.id] ?? 0;
      scoreIncrements[resp.playerId] = (scoreIncrements[resp.playerId] ?? 0) + pts;
      if (pts > 0) responsePoints.push({ id: resp.id, points: pts });

      // Keep running score in sync for subsequent scorePrompt calls
      const state = playerStates.get(resp.playerId);
      if (state) state.score += pts;
    }

    // Update local HR and streak for subsequent prompts in this round
    for (const [playerId, newHR] of Object.entries(result.hrUpdates)) {
      const state = playerStates.get(playerId);
      if (state) state.humorRating = newHR;
    }
    for (const [playerId, newStreak] of Object.entries(result.streakUpdates)) {
      const state = playerStates.get(playerId);
      if (state) state.winStreak = newStreak;
    }
  }

  // Batch DB updates
  await Promise.all([
    // Player score, HR, streak
    ...Object.entries(scoreIncrements).map(([playerId, points]) => {
      const state = playerStates.get(playerId)!;
      return prisma.player.update({
        where: { id: playerId },
        data: {
          score: { increment: points },
          humorRating: state.humorRating,
          winStreak: state.winStreak,
        },
      });
    }),
    // Response pointsEarned
    ...responsePoints.map(({ id, points }) =>
      prisma.response.update({
        where: { id },
        data: { pointsEarned: points },
      }),
    ),
  ]);
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
 * Also tracks idle rounds: increment for HUMAN players who didn't submit, reset for those who did.
 */
async function fillPlaceholderResponses(gameId: string): Promise<void> {
  const [round, humanPlayers] = await Promise.all([
    prisma.round.findFirst({
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
    }),
    prisma.player.findMany({
      where: { gameId, type: "HUMAN" },
      select: { id: true },
    }),
  ]);

  if (!round) return;

  // Collect player IDs who were assigned but didn't submit (idle)
  const idlePlayerIds = new Set<string>();
  const activePlayerIds = new Set<string>();

  const creates = round.prompts.flatMap((prompt) => {
    const submittedPlayerIds = new Set(prompt.responses.map((r) => r.playerId));
    // Track active submitters
    for (const pid of submittedPlayerIds) activePlayerIds.add(pid);

    return prompt.assignments
      .filter((a) => !submittedPlayerIds.has(a.playerId))
      .map((a) => {
        idlePlayerIds.add(a.playerId);
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

  // Update idle tracking for HUMAN players
  const idleUpdates = humanPlayers
    .filter((p) => idlePlayerIds.has(p.id) || activePlayerIds.has(p.id))
    .map((p) =>
      prisma.player.update({
        where: { id: p.id },
        data: { idleRounds: idlePlayerIds.has(p.id) ? { increment: 1 } : 0 },
      }),
    );
  if (idleUpdates.length > 0) {
    await Promise.all(idleUpdates);
  }
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

/** Advance through voting sub-phases: fill abstain votes → reveal, or advance to next prompt. */
async function advanceVotingSubPhase(gameId: string, votingRevealing: boolean): Promise<PhaseAdvanceResult> {
  if (!votingRevealing) {
    await fillAbstainVotes(gameId);
    const claimed = await revealCurrentPrompt(gameId);
    return claimed ? "VOTING_SUBPHASE" : null;
  }
  return advanceToNextPrompt(gameId);
}

/**
 * Fill placeholder responses for missing players and advance the phase.
 * During VOTING, steps through sub-phases (vote -> reveal -> next) instead of jumping to ROUND_RESULTS.
 * Returns the phase advanced to, so callers can trigger AI work in background.
 */
export async function forceAdvancePhase(gameId: string): Promise<PhaseAdvanceResult> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return null;

  if (game.status === "WRITING") {
    await fillPlaceholderResponses(gameId);
    const claimed = await startVoting(gameId);
    return claimed ? "VOTING" : null;
  }

  if (game.status === "VOTING") {
    return advanceVotingSubPhase(gameId, game.votingRevealing);
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

  if (game.status === "VOTING") {
    return advanceVotingSubPhase(gameId, game.votingRevealing);
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
