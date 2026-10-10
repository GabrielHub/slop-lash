import { defineTable } from "convex/server";
import { v } from "convex/values";

// Foundation stub of the SlopFight tables (build plan 3.6). The Backend
// workstream owns this file and tightens the `v.any()` payloads (champion
// sheets, streamed parts, fight outcomes, matchup notes, strokes) once the
// contracts in src/games/slopfight/ settle.

export const arenaIdValidator = v.union(
  v.literal("FLOODED_GARAGE"),
  v.literal("KITCHEN_COUNTER"),
  v.literal("ROOFTOP"),
);

export const fightSideValidator = v.union(v.literal("A"), v.literal("B"));

export const fighterStatusValidator = v.union(
  v.literal("EMPTY"),
  v.literal("DRAWING"),
  v.literal("DESCRIBING"),
  v.literal("FORGING"),
  v.literal("READY"),
  v.literal("REJECTED"),
  v.literal("FAILED"),
);

export const inputKindValidator = v.union(v.literal("DRAW"), v.literal("DESCRIBE"));

export const slopfightTables = {
  /** One per game: tonight's arenas, the game seed and the bracket. */
  slopFightState: defineTable({
    gameId: v.id("games"),
    /** The three arenas in play order; the Final is the third. */
    arenas: v.array(arenaIdValidator),
    seed: v.number(),
    /** Fighter ids per round, as [a, b] pairs in fight order. */
    pairings: v.array(v.array(v.array(v.id("slopFightFighters")))),
    totalFights: v.number(),
  }).index("by_gameId", ["gameId"]),

  /** The four champions' seats: a player's or the house's. */
  slopFightFighters: defineTable({
    gameId: v.id("games"),
    slot: v.number(),
    /** Null for a house champion. */
    ownerId: v.union(v.id("players"), v.null()),
    inputKind: v.union(inputKindValidator, v.null()),
    text: v.string(),
    status: fighterStatusValidator,
    forgeToken: v.string(),
    attempt: v.number(),
    /** Streamed parts while forging; cleared when READY. */
    partial: v.optional(v.any()),
    /** The current champion sheet. */
    champion: v.optional(v.any()),
    /** The sheet before the latest upgrade. */
    previous: v.optional(v.any()),
    rejection: v.optional(v.object({ reason: v.string(), suggestion: v.string() })),
    /** 0 at Build, the round number after an upgrade. */
    version: v.number(),
    record: v.object({ wins: v.number(), losses: v.number(), healthLeft: v.number() }),
  }).index("by_gameId_and_slot", ["gameId", "slot"]),

  /** One row per stroke batch, so live drawing never rewrites a fighter. */
  slopFightStrokes: defineTable({
    gameId: v.id("games"),
    fighterId: v.id("slopFightFighters"),
    /** 0 for Build, the round number for an upgrade's strokes. */
    layer: v.number(),
    seq: v.number(),
    strokes: v.any(),
  }).index("by_gameId_and_fighterId", ["gameId", "fighterId"]),

  /** Every fight in the bracket; `step` is its index within the round. */
  slopFightFights: defineTable({
    gameId: v.id("games"),
    round: v.number(),
    step: v.number(),
    a: v.id("slopFightFighters"),
    b: v.id("slopFightFighters"),
    arena: arenaIdValidator,
    notes: v.optional(v.any()),
    walkOn: v.optional(v.array(v.string())),
    seed: v.number(),
    /** Server time of the sim's t = 0. */
    startsAt: v.optional(v.number()),
    /** The canonical result with its event log and health timeline. */
    outcome: v.optional(v.any()),
    recapLine: v.optional(v.string()),
    hype: v.object({ A: v.number(), B: v.number() }),
    isFinal: v.boolean(),
    isThirdPlace: v.boolean(),
  }).index("by_gameId_and_round_and_step", ["gameId", "round", "step"]),

  /** One bet per player per fight. */
  slopFightBets: defineTable({
    gameId: v.id("games"),
    fightId: v.id("slopFightFights"),
    playerId: v.id("players"),
    side: fightSideValidator,
  })
    .index("by_gameId", ["gameId"])
    .index("by_fightId_and_playerId", ["fightId", "playerId"]),
};
