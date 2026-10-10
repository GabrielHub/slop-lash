import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * SlopLash's own tables. Prompts, responses, votes and reactions live in the
 * shared round tables (`convex/rounds.ts`).
 */
export const sloplashTables = {
  /**
   * An AI voter's ballot, decided when WRITING closes and held here, out of
   * every view, until its matchup's VOTING starts. Then it becomes a `votes`
   * row (after a short per-voter delay) and this row is deleted.
   */
  sloplashBallots: defineTable({
    gameId: v.id("games"),
    roundId: v.id("rounds"),
    promptId: v.id("prompts"),
    voterId: v.id("players"),
    responseId: v.id("responses"),
    /** A reaction to the picked answer; shown from REVEAL on. */
    reaction: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_promptId_and_voterId", ["promptId", "voterId"]),
};
