import { defineTable } from "convex/server";
import { v } from "convex/values";

export const tierValidator = v.union(
  v.literal("EASY"),
  v.literal("MEDIUM"),
  v.literal("HARD"),
  v.literal("INSANE"),
);

export const roundKindValidator = v.union(
  v.literal("WARM_UP"),
  v.literal("HOME_TURF"),
  v.literal("HOUSE_CHOICE"),
);

/**
 * QuizSlop questions come straight from the reviewed catalog in
 * `src/games/quizslop/config`; these tables only hold what the room did.
 */
export const quizslopTables = {
  /** One per player: their Home Topic, hidden difficulty, and running totals. */
  quizSlopSeats: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    /** Catalog topic id the player brings for their Home Turf round. */
    homeTopicId: v.optional(v.string()),
    /** Hidden adaptive difficulty; never sent to any screen. */
    tier: tierValidator,
    callTokens: v.number(),
    quizPoints: v.number(),
    callPoints: v.number(),
    correctAnswers: v.number(),
    successfulCalls: v.number(),
    incorrectCalls: v.number(),
  }).index("by_gameId_and_playerId", ["gameId", "playerId"]),

  /** The deck, frozen at start. `ordinal` matches `games.round`. */
  quizSlopRounds: defineTable({
    gameId: v.id("games"),
    ordinal: v.number(),
    kind: roundKindValidator,
    /** Unset for the finale until the room votes. */
    topicId: v.optional(v.string()),
    ownerPlayerId: v.optional(v.id("players")),
    /** The finale's three candidates, best tie-break first. */
    finalistTopicIds: v.optional(v.array(v.string())),
    /** Distinct questions in reveal order, frozen when answers lock. */
    revealQuestionIds: v.optional(v.array(v.string())),
    settledAt: v.optional(v.number()),
  }).index("by_gameId_and_ordinal", ["gameId", "ordinal"]),

  /** One question per player per round, at that player's hidden tier. */
  quizSlopAnswers: defineTable({
    gameId: v.id("games"),
    ordinal: v.number(),
    playerId: v.id("players"),
    questionId: v.string(),
    selectedIndex: v.optional(v.number()),
    lockedAt: v.optional(v.number()),
    correct: v.optional(v.boolean()),
    points: v.optional(v.number()),
  }).index("by_gameId_and_ordinal_and_playerId", ["gameId", "ordinal", "playerId"]),

  /** A Slop Call: betting another player misses. No target means the player held. */
  quizSlopCalls: defineTable({
    gameId: v.id("games"),
    ordinal: v.number(),
    callerId: v.id("players"),
    targetId: v.optional(v.id("players")),
    outcome: v.optional(v.union(v.literal("WON"), v.literal("LOST"), v.literal("REFUNDED"))),
    delta: v.optional(v.number()),
  }).index("by_gameId_and_ordinal_and_callerId", ["gameId", "ordinal", "callerId"]),

  /** Votes for the finale topic. */
  quizSlopHouseVotes: defineTable({
    gameId: v.id("games"),
    voterId: v.id("players"),
    topicId: v.string(),
  }).index("by_gameId_and_voterId", ["gameId", "voterId"]),
};
