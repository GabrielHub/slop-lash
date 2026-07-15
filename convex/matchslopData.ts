import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { MatchSlopTranscriptRow } from "./matchslopState";

const MAX_PLAYERS = 16;
const MAX_ASSIGNMENTS = 16;
const MAX_RESPONSES = 16;
const MAX_VOTES = 16;
const MAX_TRANSCRIPT_ENTRIES = 32;

export type MatchSlopDatabaseCtx = MutationCtx | QueryCtx;

export type MatchSlopRoundBundle = {
  round: Doc<"rounds">;
  prompt: Doc<"prompts">;
  assignments: Doc<"promptAssignments">[];
  responses: Doc<"responses">[];
  votes: Doc<"votes">[];
};

export function isActiveMatchSlopCompetitor(player: Doc<"players">): boolean {
  return player.type !== "SPECTATOR" && player.participationStatus === "ACTIVE";
}

export async function listMatchSlopPlayers(
  ctx: MatchSlopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"players">[]> {
  return ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS);
}

export async function loadMatchSlopState(
  ctx: MatchSlopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"matchSlopState"> | null> {
  return ctx.db
    .query("matchSlopState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
}

export async function loadMatchSlopTranscript(
  ctx: MatchSlopDatabaseCtx,
  gameId: Id<"games">,
): Promise<MatchSlopTranscriptRow[]> {
  return ctx.db
    .query("matchSlopTranscriptEntries")
    .withIndex("by_gameId_and_turn_and_ordinal", (index) => index.eq("gameId", gameId))
    .take(MAX_TRANSCRIPT_ENTRIES);
}

export async function loadMatchSlopRound(
  ctx: MatchSlopDatabaseCtx,
  gameId: Id<"games">,
  roundNumber: number,
): Promise<MatchSlopRoundBundle | null> {
  const round = await ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) =>
      index.eq("gameId", gameId).eq("roundNumber", roundNumber),
    )
    .unique();
  if (!round) return null;

  const [prompt, assignments, responses, votes] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_roundId_and_ordinal", (index) =>
        index.eq("roundId", round._id).eq("ordinal", 0),
      )
      .unique(),
    ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_ASSIGNMENTS),
    ctx.db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_RESPONSES),
    ctx.db
      .query("votes")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", round._id),
      )
      .take(MAX_VOTES),
  ]);
  if (!prompt || prompt.gameId !== gameId || prompt.roundId !== round._id) return null;
  return {
    round,
    prompt,
    assignments: assignments.filter((assignment) => assignment.promptId === prompt._id),
    responses: responses.filter((response) => response.promptId === prompt._id),
    votes: votes.filter((vote) => vote.promptId === prompt._id),
  };
}

export function requireCurrentMatchSlopRound(
  bundle: MatchSlopRoundBundle | null,
  promptId?: Id<"prompts">,
): asserts bundle is MatchSlopRoundBundle {
  if (!bundle || (promptId !== undefined && bundle.prompt._id !== promptId)) {
    throw new ConvexError("Prompt is not from the current MatchSlop round");
  }
}

export function getCurrentMatchSlopRound(
  ctx: MatchSlopDatabaseCtx,
  game: Doc<"games">,
): Promise<MatchSlopRoundBundle | null> {
  return loadMatchSlopRound(ctx, game._id, game.currentRound);
}

export async function getMatchSlopState(
  ctx: MatchSlopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"matchSlopState">> {
  const state = await loadMatchSlopState(ctx, gameId);
  if (!state) throw new ConvexError("MatchSlop state is missing");
  return state;
}

export function isMatchSlopGame(game: Doc<"games">): boolean {
  return game.gameType === "MATCHSLOP";
}

export function canGenerateMatchSlopProfile(game: Doc<"games">): boolean {
  return game.status === "LOBBY" || (game.status === "WRITING" && game.currentRound === 1);
}
