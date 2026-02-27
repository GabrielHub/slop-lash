import { prisma } from "@/lib/db";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { getActivePlayerIds } from "./game-logic-core";

function countDistinctActiveActors(
  actorIds: string[],
  activePlayerIds: string[],
): number {
  if (actorIds.length === 0 || activePlayerIds.length === 0) return 0;
  const activeSet = new Set(activePlayerIds);
  return new Set(actorIds.filter((id) => activeSet.has(id))).size;
}

/** Check if all active players have submitted a response for the current round. */
export async function checkAllResponsesIn(gameId: string): Promise<boolean> {
  const [round, activePlayerIds] = await Promise.all([
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: {
        prompts: {
          select: { responses: { select: { playerId: true } } },
        },
      },
    }),
    getActivePlayerIds(gameId),
  ]);

  if (!round || round.prompts.length === 0) return false;

  const prompt = round.prompts[0];
  const activeResponses = countDistinctActiveActors(
    prompt.responses.map((response) => response.playerId),
    activePlayerIds,
  );
  return activeResponses >= activePlayerIds.length;
}

/** Transition WRITING -> VOTING. Returns true if this caller claimed the transition. */
export async function startVoting(gameId: string): Promise<boolean> {
  const claim = await prisma.game.updateMany({
    where: { id: gameId, status: "WRITING" },
    data: {
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: false,
      phaseDeadline: null,
      version: { increment: 1 },
    },
  });

  return claim.count > 0;
}

/** Get votable prompts for the current round (2+ non-forfeited responses). */
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
    (p) => p.responses.length >= 2 && !p.responses.every((r) => r.text === FORFEIT_MARKER),
  );
}

/** Check if all active players have voted on the current prompt. */
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

  const activeVotes = countDistinctActiveActors(
    currentPrompt.votes.map((vote) => vote.voterId),
    activePlayerIds,
  );
  return activeVotes >= activePlayerIds.length;
}

/** Reveal the current prompt and calculate scores. Returns true if this caller claimed it. */
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

  // Lazy import to avoid circular dependency
  const { calculateRoundScores } = await import("./game-logic-deadlines-admin");
  await calculateRoundScores(gameId);

  return true;
}
