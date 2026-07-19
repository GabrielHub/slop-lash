import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { roomPresence } from "./components";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { MAX_PLAYERS } from "../src/games/quizslop/game-constants";

export type QuizslopDatabaseCtx = MutationCtx | QueryCtx;

const MAX_LOBBY_PLAYERS = 16;
const MAX_PLAYER_SESSIONS_PER_GAME = 32;
const MAX_TOPICS_PER_PACK = 64;
const MAX_QUESTIONS_PER_TOPIC = 32;
const MAX_SOURCES_PER_QUESTION = 3;
const MAX_ASSIGNMENTS_PER_SECTION = MAX_PLAYERS;
const MAX_DEFENSES_PER_ASSIGNMENT = 2;

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
  if (!isQuizslopGame(game)) throw new ConvexError("This action is only available for QuizSlop");
}

async function loadQuizslopState(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("quizSlopState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
}

export async function getQuizslopState(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const state = await loadQuizslopState(ctx, gameId);
  if (!state) throw new ConvexError("QuizSlop state is missing");
  return state;
}

export async function listQuizslopParticipants(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("quizSlopParticipants")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS + 1);
  return requireCap(rows, MAX_PLAYERS, "frozen participants").toSorted(
    (left, right) => left.seatOrder - right.seatOrder,
  );
}

export async function getQuizslopParticipant(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
  playerId: Id<"players">,
) {
  return ctx.db
    .query("quizSlopParticipants")
    .withIndex("by_gameId_and_playerId", (index) =>
      index.eq("gameId", gameId).eq("playerId", playerId),
    )
    .unique();
}

export async function listQuizslopTopics(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("quizSlopTopics")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_TOPICS_PER_PACK + 1);
  return requireCap(rows, MAX_TOPICS_PER_PACK, "topics in a frozen pack");
}

export async function listQuestionsForTopic(
  ctx: QuizslopDatabaseCtx,
  topicId: Id<"quizSlopTopics">,
) {
  const rows = await ctx.db
    .query("quizSlopQuestions")
    .withIndex("by_topicId_and_tier", (index) => index.eq("topicId", topicId))
    .take(MAX_QUESTIONS_PER_TOPIC + 1);
  return requireCap(rows, MAX_QUESTIONS_PER_TOPIC, "questions in a topic bank");
}

export async function listSourcesForQuestion(
  ctx: QuizslopDatabaseCtx,
  questionId: Id<"quizSlopQuestions">,
) {
  const rows = await ctx.db
    .query("quizSlopQuestionSources")
    .withIndex("by_questionId", (index) => index.eq("questionId", questionId))
    .take(MAX_SOURCES_PER_QUESTION + 1);
  return requireCap(rows, MAX_SOURCES_PER_QUESTION, "sources on a question");
}

export async function loadQuizslopRoundBySection(
  ctx: QuizslopDatabaseCtx,
  gameId: Id<"games">,
  sectionIndex: number,
) {
  return ctx.db
    .query("quizSlopRounds")
    .withIndex("by_gameId_and_sectionIndex", (index) =>
      index.eq("gameId", gameId).eq("sectionIndex", sectionIndex),
    )
    .unique();
}

export async function listRoundAssignments(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
) {
  const rows = await ctx.db
    .query("quizSlopAssignments")
    .withIndex("by_roundId_and_candidatePlayerId", (index) => index.eq("roundId", roundId))
    .take(MAX_ASSIGNMENTS_PER_SECTION + 1);
  return requireCap(rows, MAX_ASSIGNMENTS_PER_SECTION, "assignments in a section");
}

export async function loadCandidateAssignment(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
  playerId: Id<"players">,
) {
  return ctx.db
    .query("quizSlopAssignments")
    .withIndex("by_roundId_and_candidatePlayerId", (index) =>
      index.eq("roundId", roundId).eq("candidatePlayerId", playerId),
    )
    .unique();
}

export async function loadProxyAssignment(
  ctx: QuizslopDatabaseCtx,
  roundId: Id<"quizSlopRounds">,
  playerId: Id<"players">,
) {
  return ctx.db
    .query("quizSlopAssignments")
    .withIndex("by_roundId_and_proxyPlayerId", (index) =>
      index.eq("roundId", roundId).eq("proxyPlayerId", playerId),
    )
    .unique();
}

export async function listGroupAnswers(
  ctx: QuizslopDatabaseCtx,
  assignmentId: Id<"quizSlopAssignments">,
) {
  const rows = await ctx.db
    .query("quizSlopGroupAnswers")
    .withIndex("by_assignmentId_and_voterId", (index) => index.eq("assignmentId", assignmentId))
    .take(MAX_PLAYERS + 1);
  return requireCap(rows, MAX_PLAYERS, "group answer ballots");
}

export async function listAssignmentDefenses(
  ctx: QuizslopDatabaseCtx,
  assignmentId: Id<"quizSlopAssignments">,
) {
  const rows = await ctx.db
    .query("quizSlopDefenses")
    .withIndex("by_assignmentId_and_playerId", (index) => index.eq("assignmentId", assignmentId))
    .take(MAX_DEFENSES_PER_ASSIGNMENT + 1);
  return requireCap(rows, MAX_DEFENSES_PER_ASSIGNMENT, "oral defenses on an assignment");
}

export async function listSuspensionVotes(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("quizSlopSuspensionVotes")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS + 1);
  return requireCap(rows, MAX_PLAYERS, "suspension votes");
}

export async function listAccusations(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("quizSlopAccusations")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS + 1);
  return requireCap(rows, MAX_PLAYERS, "final accusations");
}

export async function listGamePlayers(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_LOBBY_PLAYERS + 1);
  return requireCap(rows, MAX_LOBBY_PLAYERS, "players in a room");
}

export async function listOnlinePlayerIds(ctx: QuizslopDatabaseCtx, gameId: Id<"games">) {
  const [presenceRows, sessionRows] = await Promise.all([
    roomPresence.listRoom(ctx, gameId, true, MAX_PLAYER_SESSIONS_PER_GAME + 1),
    ctx.db
      .query("playerSessions")
      .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
      .take(MAX_PLAYER_SESSIONS_PER_GAME + 1),
  ]);
  const presence = requireCap(presenceRows, MAX_PLAYER_SESSIONS_PER_GAME, "presence sessions");
  const sessions = requireCap(sessionRows, MAX_PLAYER_SESSIONS_PER_GAME, "player sessions");
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

export async function listBoundaryActivePlayerIds(ctx: MutationCtx, gameId: Id<"games">) {
  const [online, players] = await Promise.all([
    listOnlinePlayerIds(ctx, gameId),
    listGamePlayers(ctx, gameId),
  ]);
  const activeIds = new Set(players.filter(isActiveCompetitor).map((player) => player._id));
  return new Set([...online].filter((playerId) => activeIds.has(playerId)));
}
