import { prisma } from "@/lib/db";
import { FORFEIT_TEXT } from "./ai";
import { REVEAL_SECONDS, VOTE_PER_PROMPT_SECONDS } from "./game-constants";

/** Return true if every prompt in the current round has both responses. */
export async function checkAllResponsesIn(gameId: string): Promise<boolean> {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    select: {
      prompts: {
        select: { _count: { select: { responses: true } } },
      },
    },
  });

  if (!round) return false;

  return round.prompts.every((p) => p._count.responses >= 2);
}

/**
 * Transition the game from WRITING to VOTING. Fast DB-only operation.
 * Returns true if this caller claimed the transition.
 * AI vote generation is handled separately by generateAiVotes().
 */
export async function startVoting(gameId: string): Promise<boolean> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { timersDisabled: true },
  });
  if (!game) return false;

  const deadline = game.timersDisabled
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
    select: {
      prompts: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          responses: { select: { id: true, playerId: true, text: true } },
          votes: { select: { id: true, voterId: true } },
        },
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
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingPromptIndex: true },
  });
  if (!game || game.status !== "VOTING") return false;

  const votablePrompts = await getVotablePrompts(gameId);
  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return false;

  const playerCount = await prisma.player.count({
    where: { gameId, type: { not: "SPECTATOR" } },
  });
  const respondentCount = currentPrompt.responses.length;
  const eligibleVoterCount = playerCount - respondentCount;

  return currentPrompt.votes.length >= eligibleVoterCount;
}

/**
 * Create abstain votes (null responseId) for eligible voters who didn't vote on the current prompt.
 * Called before revealing when a deadline expires, so non-voters are recorded as abstentions.
 */
export async function fillAbstainVotes(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, votingPromptIndex: true },
  });
  if (!game || game.status !== "VOTING") return;

  const votablePrompts = await getVotablePrompts(gameId);
  const currentPrompt = votablePrompts[game.votingPromptIndex];
  if (!currentPrompt) return;

  const players = await prisma.player.findMany({
    where: { gameId, type: { not: "SPECTATOR" } },
    select: { id: true },
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
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { status: true, timersDisabled: true },
  });
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
