import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { roomPresence } from "./components";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import {
  MAX_ASSIGNMENTS_PER_ROUND,
  MAX_BALLOTS_PER_ROUND,
  MAX_CALLS_PER_ROUND,
  MAX_DISPUTE_VOTES_PER_ROUND,
  MAX_FROZEN_PLAYERS,
  MAX_FROZEN_TOPICS,
  MAX_ROUNDS_CAP,
  MAX_SOURCES_PER_QUESTION,
  QUESTIONS_PER_PACK,
} from "../src/games/quizslop/game-constants";

/**
 * Bounded QuizSlop loaders. Every read uses a structural cap from the mode
 * constants, reads `cap + 1`, and fails closed on the extra row instead of
 * silently truncating.
 */

export type QuizslopDatabaseCtx = MutationCtx | QueryCtx;

const MAX_LOBBY_PLAYERS = 16;
const MAX_PLAYER_SESSIONS_PER_GAME = 32;

function requireCap<T>(rows: T[], cap: number, what: string): T[] {
  if (rows.length > cap) {
    throw new ConvexError(`QuizSlop invariant violated: more than ${cap} ${what}`);
  }
  return rows;
}

export function isQuizslopGame(game: Doc<"games">): boolean {
  return game.gameType === "QUIZSLOP";
}

export function requireQuizslopGame(game: Doc<"games">): void {
  if (!isQuizslopGame(game)) {
    throw new ConvexError("This action is only available for QuizSlop");
  }
}

export async function loadQuizslopState(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopState"> | null> {
  return ctx.db
    .query("quizSlopState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
}

export async function getQuizslopState(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopState">> {
  const state = await loadQuizslopState(ctx, gameId);
  if (!state) throw new ConvexError("QuizSlop state is missing");
  return state;
}

export async function listQuizslopParticipants(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopParticipants">[]> {
  const rows = await ctx.db
    .query("quizSlopParticipants")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_FROZEN_PLAYERS + 1);
  return requireCap(rows, MAX_FROZEN_PLAYERS, "frozen participants").toSorted(
    (left, right) => left.seatOrder - right.seatOrder,
  );
}

export async function getQuizslopParticipant(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
  playerId: Id<"players">,
): Promise<Doc<"quizSlopParticipants"> | null> {
  return ctx.db
    .query("quizSlopParticipants")
    .withIndex("by_gameId_and_playerId", (index) =>
      index.eq("gameId", gameId).eq("playerId", playerId),
    )
    .unique();
}

export async function listQuizslopTopics(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopTopics">[]> {
  const rows = await ctx.db
    .query("quizSlopTopics")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_FROZEN_TOPICS + MAX_FROZEN_PLAYERS + 1);
  // Pre-freeze rooms may briefly hold replaced/fallback topic rows beyond the
  // frozen cap; the frozen deck itself is validated at the start transition.
  return requireCap(rows, MAX_FROZEN_TOPICS + MAX_FROZEN_PLAYERS, "topics");
}

export async function loadQuizslopTopicForOwner(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
  ownerPlayerId: Id<"players">,
): Promise<Doc<"quizSlopTopics"> | null> {
  return ctx.db
    .query("quizSlopTopics")
    .withIndex("by_gameId_and_ownerPlayerId", (index) =>
      index.eq("gameId", gameId).eq("ownerPlayerId", ownerPlayerId),
    )
    .unique();
}

export async function loadQuizslopRoundByOrdinal(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
  deckOrdinal: number,
): Promise<Doc<"quizSlopRounds"> | null> {
  return ctx.db
    .query("quizSlopRounds")
    .withIndex("by_gameId_and_deckOrdinal", (index) =>
      index.eq("gameId", gameId).eq("deckOrdinal", deckOrdinal),
    )
    .unique();
}

export async function listQuizslopRounds(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"quizSlopRounds">[]> {
  const rows = await ctx.db
    .query("quizSlopRounds")
    .withIndex("by_gameId_and_deckOrdinal", (index) => index.eq("gameId", gameId))
    .take(MAX_ROUNDS_CAP + 1);
  return requireCap(rows, MAX_ROUNDS_CAP, "rounds");
}

export async function listQuestionsForTopic(
  ctx: QuizslopDatabaseCtx,
  topicId: Id<"quizSlopTopics">,
): Promise<Doc<"quizSlopQuestions">[]> {
  const rows = await ctx.db
    .query("quizSlopQuestions")
    .withIndex("by_topicId_and_tier", (index) => index.eq("topicId", topicId))
    .take(QUESTIONS_PER_PACK + 1);
  return requireCap(rows, QUESTIONS_PER_PACK, "questions in a pack");
}

export async function listSourcesForQuestion(
  ctx: QuizslopDatabaseCtx,
  questionId: Id<"quizSlopQuestions">,
): Promise<Doc<"quizSlopQuestionSources">[]> {
  const rows = await ctx.db
    .query("quizSlopQuestionSources")
    .withIndex("by_questionId", (index) => index.eq("questionId", questionId))
    .take(MAX_SOURCES_PER_QUESTION + 1);
  return requireCap(rows, MAX_SOURCES_PER_QUESTION, "sources on a question");
}

export async function listRoundAssignments(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
): Promise<Doc<"quizSlopAssignments">[]> {
  const rows = await ctx.db
    .query("quizSlopAssignments")
    .withIndex("by_roundId_and_playerId", (index) => index.eq("roundId", roundId))
    .take(MAX_ASSIGNMENTS_PER_ROUND + 1);
  return requireCap(rows, MAX_ASSIGNMENTS_PER_ROUND, "assignments in a round");
}

export async function loadAssignmentForPlayer(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
  playerId: Id<"players">,
): Promise<Doc<"quizSlopAssignments"> | null> {
  return ctx.db
    .query("quizSlopAssignments")
    .withIndex("by_roundId_and_playerId", (index) =>
      index.eq("roundId", roundId).eq("playerId", playerId),
    )
    .unique();
}

export async function listRoundCalls(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
): Promise<Doc<"quizSlopCalls">[]> {
  const rows = await ctx.db
    .query("quizSlopCalls")
    .withIndex("by_roundId_and_callerId", (index) => index.eq("roundId", roundId))
    .take(MAX_CALLS_PER_ROUND + 1);
  return requireCap(rows, MAX_CALLS_PER_ROUND, "calls in a round");
}

export async function listRoundHouseVotes(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
): Promise<Doc<"quizSlopHouseVotes">[]> {
  const rows = await ctx.db
    .query("quizSlopHouseVotes")
    .withIndex("by_roundId_and_playerId", (index) => index.eq("roundId", roundId))
    .take(MAX_FROZEN_PLAYERS + 1);
  return requireCap(rows, MAX_FROZEN_PLAYERS, "house votes in a round");
}

export async function listRoundDisputes(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
): Promise<Doc<"quizSlopDisputes">[]> {
  const rows = await ctx.db
    .query("quizSlopDisputes")
    .withIndex("by_roundId_and_questionId", (index) => index.eq("roundId", roundId))
    .take(MAX_BALLOTS_PER_ROUND + 1);
  return requireCap(rows, MAX_BALLOTS_PER_ROUND, "dispute ballots in a round");
}

export async function listDisputeVotes(
  ctx: QuizslopDatabaseCtx,
  disputeId: Id<"quizSlopDisputes">,
): Promise<Doc<"quizSlopDisputeVotes">[]> {
  const rows = await ctx.db
    .query("quizSlopDisputeVotes")
    .withIndex("by_disputeId_and_voterId", (index) => index.eq("disputeId", disputeId))
    .take(MAX_DISPUTE_VOTES_PER_ROUND + 1);
  return requireCap(rows, MAX_DISPUTE_VOTES_PER_ROUND, "dispute votes on a ballot");
}

export async function listEligibility(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
  kind: Doc<"quizSlopEligibility">["kind"],
): Promise<Doc<"quizSlopEligibility">[]> {
  const rows = await ctx.db
    .query("quizSlopEligibility")
    .withIndex("by_roundId_and_kind_and_playerId", (index) =>
      index.eq("roundId", roundId).eq("kind", kind),
    )
    .take(MAX_FROZEN_PLAYERS + 1);
  return requireCap(rows, MAX_FROZEN_PLAYERS, "eligibility snapshots for a phase");
}

export async function isEligible(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
  kind: Doc<"quizSlopEligibility">["kind"],
  playerId: Id<"players">,
): Promise<boolean> {
  const row = await ctx.db
    .query("quizSlopEligibility")
    .withIndex("by_roundId_and_kind_and_playerId", (index) =>
      index.eq("roundId", roundId).eq("kind", kind).eq("playerId", playerId),
    )
    .unique();
  return row !== null;
}

export async function listGamePlayers(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Doc<"players">[]> {
  const rows = await ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_LOBBY_PLAYERS + 1);
  return requireCap(rows, MAX_LOBBY_PLAYERS, "players in a room");
}

/** Player IDs with at least one valid session currently online in Presence. */
export async function listOnlinePlayerIds(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
): Promise<Set<Id<"players">>> {
  const [presenceRows, sessionRows] = await Promise.all([
    roomPresence.listRoom(ctx, gameId, true, MAX_PLAYER_SESSIONS_PER_GAME + 1),
    ctx.db
      .query("playerSessions")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(MAX_PLAYER_SESSIONS_PER_GAME + 1),
  ]);
  const presence = requireCap(
    presenceRows,
    MAX_PLAYER_SESSIONS_PER_GAME,
    "online presence sessions",
  );
  const sessions = requireCap(
    sessionRows,
    MAX_PLAYER_SESSIONS_PER_GAME,
    "player sessions in a room",
  );
  const onlineSessionIds = new Set(presence.map((entry) => entry.userId));
  const onlinePlayerIds = new Set<Id<"players">>();
  const now = Date.now();
  for (const session of sessions) {
    if (!session.playerId || !onlineSessionIds.has(session._id)) continue;
    if (session.revokedAt !== undefined) continue;
    if (session.expiresAt !== undefined && session.expiresAt <= now) continue;
    onlinePlayerIds.add(session.playerId);
  }
  return onlinePlayerIds;
}

/**
 * Boundary-active roster: durable ACTIVE participation plus at least one
 * online, unexpired presence session at the exact server transition. A
 * Presence read failure propagates so the transition aborts and retries
 * rather than treating everyone as offline.
 */
export async function listBoundaryActivePlayerIds(
  ctx: MutationCtx,
  gameId: Id<"games">,
): Promise<Set<Id<"players">>> {
  const [presence, players] = await Promise.all([
    listOnlinePlayerIds(ctx, gameId),
    listGamePlayers(ctx, gameId),
  ]);
  const activePlayerIds = new Set(players.filter(isActiveCompetitor).map((player) => player._id));
  const boundaryActive = new Set<Id<"players">>();
  for (const playerId of presence) {
    if (activePlayerIds.has(playerId)) boundaryActive.add(playerId);
  }
  return boundaryActive;
}
