import { defineTable } from "convex/server";
import { v, type Infer, type Validator } from "convex/values";
import { MODIFIER_KEYS } from "../../src/games/slopfight/modifiers";
import type { Champion } from "../../src/games/slopfight/sheet";
import {
  ANCHORS,
  BODY_PLANS,
  DELIVERIES,
  ELONGATIONS,
  EYE_STYLES,
  MARKING_KINDS,
  MOUTH_STYLES,
  MOVE_TYPES,
  PART_COLORS,
  PART_ROLES,
  PART_SHAPES,
  PART_SIZES,
  PROP_TAGS,
  TOY_COLORS,
  TRAITS,
} from "../../src/games/slopfight/vocab";

// SlopFight's stored and public contracts. ChampionSchema + balanceChampion
// normalize model output; these validators guard every database/API boundary.

/** A union of string literals from a fixed vocabulary array. */
function oneOf<const T extends string>(values: readonly T[]) {
  return v.union(...values.map((value) => v.literal(value)));
}

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
export type FighterStatus = Infer<typeof fighterStatusValidator>;

export const inputKindValidator = v.union(v.literal("DRAW"), v.literal("DESCRIBE"));
export type InputKind = Infer<typeof inputKindValidator>;

/**
 * What a forge is for: a phone's submit, the lenient forge at a deadline (or a
 * retry once the player's clock is gone), an upgrade and its lenient twin, a
 * house champion and its upgrade.
 */
export const forgeKindValidator = v.union(
  v.literal("SUBMIT"),
  v.literal("LENIENT"),
  v.literal("UPGRADE"),
  v.literal("LENIENT_UPGRADE"),
  v.literal("HOUSE"),
  v.literal("HOUSE_UPGRADE"),
);
export type ForgeKind = Infer<typeof forgeKindValidator>;

/** One streamed part (sheet.ts `Part`), as `parsePartialParts` returns it. */
export const partValidator = v.object({
  id: v.string(),
  role: oneOf(PART_ROLES),
  shape: oneOf(PART_SHAPES),
  size: oneOf(PART_SIZES),
  elongation: oneOf(ELONGATIONS),
  parent: v.union(v.string(), v.null()),
  anchor: v.union(oneOf(ANCHORS), v.null()),
  color: oneOf(PART_COLORS),
  mirror: v.boolean(),
});

export const bodyPlanValidator = oneOf(BODY_PLANS);

const pipValidator = v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5));

/** Typed end to end, including persisted replay sheets and streamed forge results. */
export const championValidator = v.object({
  bodyPlan: bodyPlanValidator,
  palette: v.object({
    primary: oneOf(TOY_COLORS),
    secondary: oneOf(TOY_COLORS),
    accent: oneOf(TOY_COLORS),
  }),
  parts: v.array(partValidator),
  markings: v.optional(
    v.array(v.object({ part: v.string(), kind: oneOf(MARKING_KINDS), color: oneOf(PART_COLORS) })),
  ),
  face: v.object({ eyes: oneOf(EYE_STYLES), mouth: oneOf(MOUTH_STYLES) }),
  item: v.union(oneOf(PROP_TAGS), v.null()),
  stats: v.object({ heft: pipValidator, reach: pipValidator, chaos: pipValidator }),
  moves: v.array(
    v.object({
      name: v.string(),
      type: oneOf(MOVE_TYPES),
      power: pipValidator,
      delivery: oneOf(DELIVERIES),
    }),
  ),
  traits: v.array(oneOf(TRAITS)),
  temperament: v.object({ aggression: v.number(), caution: v.number(), showboating: v.number() }),
  name: v.string(),
  bio: v.string(),
  narration: v.object({
    walkOn: v.array(v.string()),
    landHit: v.array(v.string()),
    takeHit: v.array(v.string()),
    win: v.array(v.string()),
    lose: v.array(v.string()),
    ringOut: v.array(v.string()),
  }),
}) satisfies Validator<Champion, "required", string>;

export const forgeValidator = v.object({
  kind: forgeKindValidator,
  version: v.number(),
  startedAt: v.number(),
});

export const forgeOutcomeValidator = v.union(
  v.object({ kind: v.literal("FORGE"), champion: championValidator }),
  v.object({ kind: v.literal("REJECT"), reason: v.string(), suggestion: v.string() }),
  v.object({ kind: v.literal("FAILED"), failReason: v.string() }),
);

/** strokes.ts `Stroke`; the exact ranges are checked by `StrokeSchema`. */
export const strokeValidator = v.object({ c: v.number(), w: v.number(), p: v.array(v.number()) });
export const strokeBatchFields = {
  fighterId: v.id("slopFightFighters"),
  layer: v.number(),
  seq: v.number(),
  strokes: v.array(strokeValidator),
};

/** modifiers.ts `MatchupNote`, clamped and trimmed before it is stored. */
export const matchupNoteValidator = v.object({
  side: fightSideValidator,
  modifies: oneOf(MODIFIER_KEYS),
  value: v.number(),
  reason: v.string(),
});

export const fightMethodValidator = v.union(
  v.literal("KO"),
  v.literal("RINGOUT"),
  v.literal("DECISION"),
  v.literal("SUDDEN_DEATH"),
);

const sidesValidator = v.object({ A: v.number(), B: v.number() });

/**
 * The canonical fight result (sim `FightOutcome`), compacted to stay small:
 * the event log and the health timeline are capped (see outcome.ts). `hash`
 * still covers the full run.
 */
export const fightOutcomeValidator = v.object({
  winner: fightSideValidator,
  method: fightMethodValidator,
  endMs: v.number(),
  health: sidesValidator,
  maxHealth: sidesValidator,
  /** sim `FightEvent`s: `{ t, kind, side, ... }`. */
  events: v.array(v.any()),
  /** `[ms, healthA, healthB]` samples. */
  healthTimeline: v.array(v.array(v.number())),
  hash: v.string(),
  /** Minor events were dropped to fit the cap. */
  truncated: v.optional(v.boolean()),
  /** The sim failed twice, so the seed picked the winner and there is no fight to show. */
  decidedBySeed: v.optional(v.boolean()),
});
export type StoredOutcome = Infer<typeof fightOutcomeValidator>;

export const awardValidator = v.object({
  playerId: v.id("players"),
  reason: v.union(v.literal("WIN"), v.literal("FINISH"), v.literal("BET")),
  points: v.number(),
});

export const fightRecordValidator = v.object({
  wins: v.number(),
  losses: v.number(),
  healthLeft: v.number(),
});

export const slopfightTables = {
  /** One per game: tonight's arenas, the game seed and the bracket. */
  slopFightState: defineTable({
    gameId: v.id("games"),
    /** The three arenas in play order; the Final round is the third. */
    arenas: v.array(arenaIdValidator),
    seed: v.number(),
    humanCount: v.number(),
    /** Fighter pairs per round in fight order; round 3 is added after round 2. */
    pairings: v.array(
      v.array(v.object({ a: v.id("slopFightFighters"), b: v.id("slopFightFighters") })),
    ),
    /** Best first, set when round 2 ends. */
    seeding: v.optional(v.array(v.id("slopFightFighters"))),
    totalFights: v.number(),
  }).index("by_gameId", ["gameId"]),

  /** The four champions' seats: a player's or the house's. */
  slopFightFighters: defineTable({
    gameId: v.id("games"),
    slot: v.number(),
    /** Null for a house champion. */
    ownerId: v.union(v.id("players"), v.null()),
    inputKind: v.union(inputKindValidator, v.null()),
    /** The Build description (a house champion's invented one), sanitized. */
    text: v.string(),
    status: fighterStatusValidator,
    /** Bumped per forge; a result for an older token is ignored. */
    forgeToken: v.string(),
    attempt: v.number(),
    /** The latest forge: what it is for and the version it produces. */
    forge: v.optional(forgeValidator),
    /**
     * What the player's own submit forged (kind, then the sanitized text or the
     * layer's last stroke row), so an identical resubmit while it runs is a
     * no-op. Unset for forges the server starts. Never sent to clients.
     */
    forgeInput: v.optional(v.string()),
    /** Streamed parts while forging; cleared when the forge ends. */
    partial: v.optional(v.array(partValidator)),
    /** The body plan the forge streamed before its parts (paces the phone's progress). */
    partialPlan: v.optional(bodyPlanValidator),
    /** The current champion sheet (sheet.ts `Champion`, balanced). */
    champion: v.optional(championValidator),
    /** The sheet before the latest upgrade. */
    previous: v.optional(championValidator),
    rejection: v.optional(v.object({ reason: v.string(), suggestion: v.string() })),
    /** Why the last forge failed on both models (`AiFailReason` or a code). */
    failure: v.optional(v.string()),
    /** The latest upgrade addition the owner submitted. */
    addition: v.optional(
      v.object({ round: v.number(), kind: inputKindValidator, text: v.string() }),
    ),
    /** Last keystroke time, throttled, for the stage's typing shimmer. */
    typingAt: v.optional(v.number()),
    /** When the latest forge landed READY: the stage's reveal runs from here (see `revealEndsAt`). */
    readyAt: v.optional(v.number()),
    /** 0 at Build, the round number after an upgrade. */
    version: v.number(),
    record: fightRecordValidator,
  }).index("by_gameId_and_slot", ["gameId", "slot"]),

  /** One row per stroke batch, so live drawing never rewrites a fighter. */
  slopFightStrokes: defineTable({
    gameId: v.id("games"),
    fighterId: v.id("slopFightFighters"),
    /** 0 for Build, the round number for an upgrade's strokes. */
    layer: v.number(),
    seq: v.number(),
    strokes: v.array(strokeValidator),
    /** Strokes in this layer up to and including this row, for the per-layer cap. */
    total: v.number(),
  })
    .index("by_gameId_and_fighterId", ["gameId", "fighterId"])
    .index("by_fighterId_and_layer_and_seq", ["fighterId", "layer", "seq"]),

  /** Every fight in the bracket; `step` is its index within the round. */
  slopFightFights: defineTable({
    gameId: v.id("games"),
    round: v.number(),
    step: v.number(),
    a: v.id("slopFightFighters"),
    b: v.id("slopFightFighters"),
    arena: arenaIdValidator,
    /** Sim time limit: shorter for house versus house. */
    limitMs: v.number(),
    seed: v.number(),
    isFinal: v.boolean(),
    isThirdPlace: v.boolean(),
    /** The MATCHUP call: notes and walk-on lines, or a failure (no notes). */
    matchup: v.union(v.literal("PENDING"), v.literal("READY"), v.literal("FAILED")),
    matchupAttempt: v.number(),
    notes: v.optional(v.array(matchupNoteValidator)),
    walkOn: v.optional(v.array(v.string())),
    /** The server sim: attempt counts runs; a result for another attempt is ignored. */
    sim: v.object({
      status: v.union(
        v.literal("IDLE"),
        v.literal("RUNNING"),
        v.literal("DONE"),
        v.literal("FAILED"),
      ),
      attempt: v.number(),
      error: v.optional(v.string()),
    }),
    /**
     * Both champions as the sim ran them, frozen when it first starts, so the
     * recap re-simulates a round-1 fight with round-1 sheets after upgrades.
     */
    sheets: v.optional(v.object({ A: championValidator, B: championValidator })),
    /** Server time of the sim's t = 0. */
    startsAt: v.optional(v.number()),
    outcome: v.optional(fightOutcomeValidator),
    scoredAt: v.optional(v.number()),
    awards: v.optional(v.array(awardValidator)),
    recapLine: v.optional(v.string()),
    hype: sidesValidator,
  }).index("by_gameId_and_round_and_step", ["gameId", "round", "step"]),

  /** One bet per player per fight, changeable until the face-off closes. */
  slopFightBets: defineTable({
    gameId: v.id("games"),
    fightId: v.id("slopFightFights"),
    playerId: v.id("players"),
    side: fightSideValidator,
  })
    .index("by_gameId", ["gameId"])
    .index("by_fightId_and_playerId", ["fightId", "playerId"]),
};
