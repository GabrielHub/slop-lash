import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { FORFEIT_MARKER } from "../src/games/core/constants";

/**
 * Rounds of prompts, responses, and votes. SlopLash and MatchSlop both play on
 * these tables; each mode decides who answers and who votes.
 */

type DatabaseCtx = QueryCtx | MutationCtx;

const MAX_ROUNDS = 16;
const MAX_ROUND_PROMPTS = 16;
const MAX_ROUND_RESPONSES = 64;
const MAX_ROUND_VOTES = 256;
const MAX_ROUND_REACTIONS = 1_024;

export type RoundBundle = {
  round: Doc<"rounds">;
  prompts: Doc<"prompts">[];
  responses: Doc<"responses">[];
  votes: Doc<"votes">[];
};

export async function loadRoundDoc(ctx: DatabaseCtx, gameId: Id<"games">, roundNumber: number) {
  return ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) =>
      index.eq("gameId", gameId).eq("roundNumber", roundNumber),
    )
    .unique();
}

export async function loadRoundData(ctx: DatabaseCtx, round: Doc<"rounds">): Promise<RoundBundle> {
  const [prompts, responses, votes] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_roundId", (index) => index.eq("roundId", round._id))
      .take(MAX_ROUND_PROMPTS),
    ctx.db
      .query("responses")
      .withIndex("by_roundId", (index) => index.eq("roundId", round._id))
      .take(MAX_ROUND_RESPONSES),
    ctx.db
      .query("votes")
      .withIndex("by_roundId", (index) => index.eq("roundId", round._id))
      .take(MAX_ROUND_VOTES),
  ]);
  return {
    round,
    prompts: prompts.toSorted((left, right) => left.ordinal - right.ordinal),
    responses,
    votes,
  };
}

export async function loadRound(
  ctx: DatabaseCtx,
  gameId: Id<"games">,
  roundNumber: number,
): Promise<RoundBundle | null> {
  const round = await loadRoundDoc(ctx, gameId, roundNumber);
  return round ? loadRoundData(ctx, round) : null;
}

/** The round the game is on, or null before the first one. */
export async function loadCurrentRound(ctx: DatabaseCtx, game: Doc<"games">) {
  return game.round > 0 ? loadRound(ctx, game._id, game.round) : null;
}

export async function loadAllRounds(ctx: DatabaseCtx, gameId: Id<"games">) {
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) => index.eq("gameId", gameId))
    .take(MAX_ROUNDS);
  return Promise.all(rounds.map((round) => loadRoundData(ctx, round)));
}

export async function loadRoundReactions(ctx: DatabaseCtx, roundId: Id<"rounds">) {
  return ctx.db
    .query("reactions")
    .withIndex("by_roundId", (index) => index.eq("roundId", roundId))
    .take(MAX_ROUND_REACTIONS);
}

export function responsesFor(bundle: RoundBundle, promptId: Id<"prompts">) {
  return bundle.responses.filter((response) => response.promptId === promptId);
}

export function votesFor(bundle: RoundBundle, promptId: Id<"prompts">) {
  return bundle.votes.filter((vote) => vote.promptId === promptId);
}

export function isForfeit(response: Pick<Doc<"responses">, "text">): boolean {
  return response.text === FORFEIT_MARKER;
}

export async function createRound(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roundNumber: number,
  prompts: { text: string; assigneeIds: Id<"players">[] }[],
): Promise<Id<"rounds">> {
  const roundId = await ctx.db.insert("rounds", { gameId, roundNumber });
  for (const [ordinal, prompt] of prompts.entries()) {
    await ctx.db.insert("prompts", { gameId, roundId, ordinal, ...prompt });
  }
  return roundId;
}

export async function insertResponse(
  ctx: MutationCtx,
  prompt: Doc<"prompts">,
  playerId: Id<"players">,
  text: string,
  openerPromptId?: string,
): Promise<Id<"responses">> {
  return ctx.db.insert("responses", {
    gameId: prompt.gameId,
    roundId: prompt.roundId,
    promptId: prompt._id,
    playerId,
    text,
    ...(openerPromptId ? { openerPromptId } : {}),
    pointsEarned: 0,
    submittedAt: Date.now(),
  });
}

export async function findResponse(
  ctx: DatabaseCtx,
  promptId: Id<"prompts">,
  playerId: Id<"players">,
) {
  return ctx.db
    .query("responses")
    .withIndex("by_promptId_and_playerId", (index) =>
      index.eq("promptId", promptId).eq("playerId", playerId),
    )
    .unique();
}

export async function findVote(ctx: DatabaseCtx, promptId: Id<"prompts">, voterId: Id<"players">) {
  return ctx.db
    .query("votes")
    .withIndex("by_promptId_and_voterId", (index) =>
      index.eq("promptId", promptId).eq("voterId", voterId),
    )
    .unique();
}

/** Writes a forfeit for every assignee who has not answered yet. */
export async function fillForfeits(ctx: MutationCtx, bundle: RoundBundle): Promise<void> {
  for (const prompt of bundle.prompts) {
    const answered = new Set(responsesFor(bundle, prompt._id).map((response) => response.playerId));
    for (const playerId of prompt.assigneeIds) {
      if (answered.has(playerId)) continue;
      await insertResponse(ctx, prompt, playerId, FORFEIT_MARKER);
    }
  }
}

/** Records an empty ballot for every listed voter who has not voted on the prompt. */
export async function fillTimedOutVotes(
  ctx: MutationCtx,
  bundle: RoundBundle,
  prompt: Doc<"prompts">,
  voterIds: Id<"players">[],
): Promise<void> {
  const voted = new Set(votesFor(bundle, prompt._id).map((vote) => vote.voterId));
  for (const voterId of voterIds) {
    if (!voted.has(voterId)) await insertVote(ctx, prompt, voterId, null, true);
  }
}

/** A ballot for one answer, a pass (`null`), or an empty ballot that ran out of time. */
export async function insertVote(
  ctx: MutationCtx,
  prompt: Doc<"prompts">,
  voterId: Id<"players">,
  responseId: Id<"responses"> | null,
  timedOut = false,
): Promise<Id<"votes">> {
  return ctx.db.insert("votes", {
    gameId: prompt.gameId,
    roundId: prompt.roundId,
    promptId: prompt._id,
    voterId,
    ...(responseId ? { responseId } : {}),
    timedOut,
    castAt: Date.now(),
  });
}

export async function insertReaction(
  ctx: MutationCtx,
  response: Pick<Doc<"responses">, "_id" | "gameId" | "roundId">,
  playerId: Id<"players">,
  emoji: string,
): Promise<void> {
  await ctx.db.insert("reactions", {
    gameId: response.gameId,
    roundId: response.roundId,
    responseId: response._id,
    playerId,
    emoji,
    createdAt: Date.now(),
  });
}
