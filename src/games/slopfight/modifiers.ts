// Fight modifiers: the parameter tweaks traits, arena hazards and Matchup Notes
// make before a fight starts. resolveModifiers() folds all three into one
// clamped FighterModifiers per side; it is pure and deterministic, so the
// server sim and every stage get the same numbers.
//
// Effect and note values share one unit per kind:
// - additive: points added (Strike +1, Reach -1);
// - multiplier: percent change (speed +15 means x1.15);
// - flat: amount added (self-damage +15 HP per hit taken);
// - flag: any value above 0 turns it on.

import { z } from "zod";
import {
  ARENAS,
  matchesCondition,
  type Arena,
  type ArenaId,
  type DynamicHazardId,
} from "./arenas";
import { MATCHUP_NOTES_MAX, NOTE_REASON_MAX } from "./constants";
import { cleanText, type Champion } from "./sheet";
import type { Trait } from "./vocab";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export const MODIFIER_KEYS = [
  "strikePower",
  "grapplePower",
  "trickPower",
  "damageDealt",
  "damageTaken",
  "knockbackDealt",
  "knockbackTaken",
  "speed",
  "staggerResist",
  "hurtbox",
  "reach",
  "selfDamageOnHitTaken",
  "grappleImmune",
  "strikeKnockbackImmune",
  "pushImmune",
] as const;
export type ModifierKey = (typeof MODIFIER_KEYS)[number];
export type ModifierKind = "additive" | "multiplier" | "flat" | "flag";

export type FlagKey = "grappleImmune" | "strikeKnockbackImmune" | "pushImmune";
export type NumericKey = Exclude<ModifierKey, FlagKey>;

export interface ModifierSpec {
  kind: ModifierKind;
  /** Card label: "Strike +1", "Speed +15%". */
  label: string;
  /** What the sim does with it. */
  meaning: string;
  /** Final clamp (multiplier keys: the multiplier itself). Flags: 0..1. */
  min: number;
  max: number;
  /** Neutral value. */
  base: number;
  /** One note's value range, in note units. */
  noteMin: number;
  noteMax: number;
  /** Advantage score per note unit for the fighter that has it (negative: a drawback). */
  weight: number;
}

export const MODIFIER_SPECS: Readonly<Record<ModifierKey, ModifierSpec>> = {
  strikePower: {
    kind: "additive",
    label: "Strike",
    meaning: "Added to the power of its Strike moves.",
    min: -2,
    max: 2,
    base: 0,
    noteMin: -2,
    noteMax: 2,
    weight: 8,
  },
  grapplePower: {
    kind: "additive",
    label: "Grapple",
    meaning: "Added to the power of its Grapple moves.",
    min: -2,
    max: 2,
    base: 0,
    noteMin: -2,
    noteMax: 2,
    weight: 8,
  },
  trickPower: {
    kind: "additive",
    label: "Trick",
    meaning: "Added to the power of its Trick moves.",
    min: -2,
    max: 2,
    base: 0,
    noteMin: -2,
    noteMax: 2,
    weight: 8,
  },
  damageDealt: {
    kind: "multiplier",
    label: "Damage",
    meaning: "Multiplies the damage of every hit it lands.",
    min: 0.6,
    max: 1.5,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: 1,
  },
  damageTaken: {
    kind: "multiplier",
    label: "Damage taken",
    meaning: "Multiplies the damage of every hit it takes.",
    min: 0.6,
    max: 1.5,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: -1,
  },
  knockbackDealt: {
    kind: "multiplier",
    label: "Knockback",
    meaning: "Multiplies the impulse of every hit it lands.",
    min: 0.5,
    max: 1.75,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: 0.5,
  },
  knockbackTaken: {
    kind: "multiplier",
    label: "Knockback taken",
    meaning: "Multiplies the impulse of every hit it takes.",
    min: 0.5,
    max: 1.75,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: -0.6,
  },
  speed: {
    kind: "multiplier",
    label: "Speed",
    meaning: "Multiplies locomotion and move speed.",
    min: 0.6,
    max: 1.4,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: 0.6,
  },
  staggerResist: {
    kind: "multiplier",
    label: "Stagger resist",
    meaning: "Multiplies the hit size it takes to stagger it.",
    min: 0.5,
    max: 2,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: 0.4,
  },
  hurtbox: {
    kind: "multiplier",
    label: "Hurtbox",
    meaning: "Multiplies the size of the volume that counts as hitting it.",
    min: 0.7,
    max: 1.3,
    base: 1,
    noteMin: -30,
    noteMax: 30,
    weight: -0.5,
  },
  reach: {
    kind: "additive",
    label: "Reach",
    meaning: "Added to the Reach stat for hit range and limb length.",
    min: -1,
    max: 1,
    base: 0,
    noteMin: -1,
    noteMax: 1,
    weight: 10,
  },
  selfDamageOnHitTaken: {
    kind: "flat",
    label: "Self-damage per hit taken",
    meaning: "Extra damage it deals itself every time it takes a hit.",
    min: 0,
    max: 20,
    base: 0,
    noteMin: -15,
    noteMax: 15,
    weight: -1.5,
  },
  grappleImmune: {
    kind: "flag",
    label: "Can't be grappled",
    meaning: "Grapples against it fail; brains facing it stop choosing Grapple.",
    min: 0,
    max: 1,
    base: 0,
    noteMin: 0,
    noteMax: 1,
    weight: 12,
  },
  strikeKnockbackImmune: {
    kind: "flag",
    label: "No knockback from Strikes",
    meaning: "Strikes still damage it but apply no impulse.",
    min: 0,
    max: 1,
    base: 0,
    noteMin: 0,
    noteMax: 1,
    weight: 10,
  },
  pushImmune: {
    kind: "flag",
    label: "Can't be pushed",
    meaning: "Ignores non-hit pushes: wind gusts and body shoves.",
    min: 0,
    max: 1,
    base: 0,
    noteMin: 0,
    noteMax: 1,
    weight: 8,
  },
};

const FLAG_KEYS = MODIFIER_KEYS.filter(
  (key): key is FlagKey => MODIFIER_SPECS[key].kind === "flag",
);
const NUMERIC_KEYS = MODIFIER_KEYS.filter(
  (key): key is NumericKey => MODIFIER_SPECS[key].kind !== "flag",
);

// ---------------------------------------------------------------------------
// Brain flags (passed straight to the sim's brain)
// ---------------------------------------------------------------------------

export const BRAIN_FLAGS = [
  "retreatsWhenLow",
  "neverRetreats",
  "showboatsAfterHit",
  "erratic",
  "slowStarter",
  "berserkWhenLow",
] as const;
export type BrainFlag = (typeof BRAIN_FLAGS)[number];

export const BRAIN_FLAG_INFO = {
  retreatsWhenLow: "Backs away from the fight when its health is low.",
  neverRetreats: "Never backs off at low health (wins over retreatsWhenLow).",
  showboatsAfterHit: "Poses after landing a hit, leaving a real opening.",
  erratic: "Extra seeded noise on timing and move choice, on top of Chaos.",
  slowStarter: "Dozes through the first seconds before it engages.",
  berserkWhenLow: "Aggression jumps when its health is low.",
} as const satisfies Record<BrainFlag, string>;

// ---------------------------------------------------------------------------
// Trait effects
// ---------------------------------------------------------------------------

export interface ModifierEffect {
  key: ModifierKey;
  value: number;
  /** Who it applies to. Default "self"; "foe" tweaks the opponent (spiky: foe Grapple -1). */
  target?: "self" | "foe";
}

export interface TraitEffect {
  effects: readonly ModifierEffect[];
  brain?: readonly BrainFlag[];
}

const foe = (key: ModifierKey, value: number): ModifierEffect => ({ key, value, target: "foe" });

/**
 * Small, legible, mostly two-sided effects; traitScore() keeps every trait
 * within a few points of neutral so no trait decides a fight on its own.
 */
export const TRAIT_EFFECTS: Readonly<Record<Trait, TraitEffect>> = {
  heavy: {
    effects: [
      { key: "staggerResist", value: 20 },
      { key: "knockbackTaken", value: -15 },
      { key: "speed", value: -20 },
    ],
  },
  slippery: { effects: [foe("grapplePower", -1), { key: "knockbackTaken", value: 10 }] },
  armed: {
    effects: [
      { key: "strikePower", value: 1 },
      { key: "grapplePower", value: -1 },
    ],
  },
  flammable: {
    effects: [
      { key: "damageDealt", value: 10 },
      { key: "damageTaken", value: 10 },
    ],
  },
  electric: {
    effects: [
      { key: "damageDealt", value: 8 },
      { key: "damageTaken", value: 5 },
    ],
  },
  aquatic: {
    effects: [
      { key: "knockbackTaken", value: -10 },
      { key: "speed", value: -5 },
    ],
  },
  tiny: {
    effects: [
      { key: "hurtbox", value: -15 },
      { key: "speed", value: 10 },
      { key: "knockbackTaken", value: 20 },
    ],
  },
  smug: { effects: [{ key: "trickPower", value: 1 }], brain: ["showboatsAfterHit"] },
  fragile: {
    effects: [
      { key: "damageTaken", value: 15 },
      { key: "damageDealt", value: 10 },
      { key: "speed", value: 10 },
    ],
  },
  sticky: {
    effects: [
      { key: "grapplePower", value: 1 },
      { key: "speed", value: -10 },
    ],
  },
  spiky: { effects: [foe("grapplePower", -1), { key: "speed", value: -10 }] },
  cowardly: { effects: [{ key: "speed", value: 10 }], brain: ["retreatsWhenLow"] },
  relentless: { effects: [{ key: "staggerResist", value: 10 }], brain: ["neverRetreats"] },
  armored: {
    effects: [
      { key: "damageTaken", value: -12 },
      { key: "speed", value: -15 },
    ],
  },
  bouncy: {
    effects: [
      { key: "trickPower", value: 1 },
      { key: "knockbackTaken", value: 15 },
    ],
  },
  fluffy: {
    effects: [
      { key: "damageTaken", value: -10 },
      { key: "hurtbox", value: 15 },
    ],
  },
  venomous: {
    effects: [
      { key: "damageDealt", value: 10 },
      { key: "knockbackDealt", value: -15 },
    ],
  },
  loud: { effects: [foe("trickPower", -1), { key: "trickPower", value: -1 }] },
  sneaky: {
    effects: [
      { key: "trickPower", value: 1 },
      { key: "strikePower", value: -1 },
    ],
  },
  clumsy: {
    effects: [
      { key: "damageDealt", value: 10 },
      { key: "staggerResist", value: -15 },
    ],
    brain: ["erratic"],
  },
  nimble: {
    effects: [
      { key: "speed", value: 15 },
      { key: "staggerResist", value: -15 },
    ],
  },
  huge: {
    effects: [
      { key: "reach", value: 1 },
      { key: "hurtbox", value: 15 },
      { key: "speed", value: -10 },
    ],
  },
  ancient: {
    effects: [
      { key: "trickPower", value: 1 },
      { key: "speed", value: -15 },
    ],
  },
  magnetic: {
    effects: [
      { key: "grapplePower", value: 1 },
      { key: "trickPower", value: -1 },
    ],
  },
  frosty: { effects: [foe("speed", -8), { key: "speed", value: -5 }] },
  explosive: {
    effects: [
      { key: "knockbackDealt", value: 20 },
      { key: "selfDamageOnHitTaken", value: 2 },
    ],
  },
  rubbery: {
    effects: [
      { key: "damageTaken", value: -10 },
      { key: "knockbackTaken", value: 15 },
    ],
  },
  stinky: { effects: [foe("speed", -10), { key: "trickPower", value: -1 }] },
  regal: {
    effects: [
      { key: "staggerResist", value: 20 },
      { key: "speed", value: -10 },
    ],
  },
  feral: {
    effects: [
      { key: "damageDealt", value: 8 },
      { key: "trickPower", value: -1 },
    ],
    brain: ["berserkWhenLow"],
  },
  caffeinated: {
    effects: [
      { key: "speed", value: 20 },
      { key: "trickPower", value: -1 },
    ],
    brain: ["erratic"],
  },
  haunted: { effects: [{ key: "hurtbox", value: -10 }], brain: ["erratic"] },
  metallic: {
    effects: [
      { key: "knockbackDealt", value: 15 },
      { key: "speed", value: -10 },
    ],
  },
  wooden: {
    effects: [
      { key: "staggerResist", value: 20 },
      { key: "trickPower", value: -1 },
    ],
  },
  lanky: {
    effects: [
      { key: "reach", value: 1 },
      { key: "staggerResist", value: -15 },
    ],
  },
  sleepy: { effects: [{ key: "damageTaken", value: -8 }], brain: ["slowStarter"] },
  dramatic: {
    effects: [
      { key: "damageDealt", value: 12 },
      { key: "knockbackTaken", value: 10 },
    ],
    brain: ["showboatsAfterHit"],
  },
  hungry: {
    effects: [
      { key: "grapplePower", value: 2 },
      { key: "speed", value: -10 },
      { key: "trickPower", value: -1 },
    ],
  },
  slimy: {
    effects: [
      { key: "knockbackTaken", value: -15 },
      { key: "speed", value: -10 },
    ],
  },
  stubborn: {
    effects: [
      { key: "pushImmune", value: 1 },
      { key: "speed", value: -10 },
    ],
  },
  buff: {
    effects: [
      { key: "strikePower", value: 1 },
      { key: "grapplePower", value: 1 },
      { key: "trickPower", value: -2 },
    ],
  },
};

/** Net advantage of one effect for the fighter that owns the trait. */
export function effectScore(effect: ModifierEffect): number {
  const spec = MODIFIER_SPECS[effect.key];
  const amount = spec.kind === "flag" ? (effect.value > 0 ? 1 : 0) : effect.value;
  const score = spec.weight * amount;
  return effect.target === "foe" ? -score : score;
}

/** A trait's net advantage, brain flags aside (a tuning aid and a test bound). */
export function traitScore(trait: Trait): number {
  return TRAIT_EFFECTS[trait].effects.reduce((sum, effect) => sum + effectScore(effect), 0);
}

/** "Strike +1", "Speed -10%", "Foe Grapple -1", "Can't be pushed". */
export function formatEffect(effect: ModifierEffect): string {
  const spec = MODIFIER_SPECS[effect.key];
  const sign = effect.value > 0 ? "+" : "";
  const amount = Math.round(effect.value * 100) / 100;
  const text =
    spec.kind === "flag"
      ? spec.label
      : spec.kind === "multiplier"
        ? `${spec.label} ${sign}${amount}%`
        : `${spec.label} ${sign}${amount}`;
  return effect.target === "foe" ? `Foe ${text[0]!.toLowerCase()}${text.slice(1)}` : text;
}

// ---------------------------------------------------------------------------
// Matchup Notes
// ---------------------------------------------------------------------------

export type Side = "A" | "B";

/** Model-facing: no numeric constraints (the decoder does not enforce them); code clamps. */
export const MatchupNoteSchema = z.object({
  side: z.enum(["A", "B"]),
  modifies: z.enum(MODIFIER_KEYS),
  value: z
    .number()
    .describe(
      "Power keys: points, -2 to 2. reach: -1 to 1. Multiplier keys (damageDealt, damageTaken, knockbackDealt, knockbackTaken, speed, staggerResist, hurtbox): percent change, -30 to 30. selfDamageOnHitTaken: HP per hit, -15 to 15. Immunity flags: 1",
    ),
  reason: z
    .string()
    .describe(`At most ${NOTE_REASON_MAX} characters, citing a trait, the item or the arena`),
});
export type MatchupNote = z.infer<typeof MatchupNoteSchema>;

/**
 * The most any one side can gain from the notes, in advantage-score points
 * (roughly percent of fighting strength). A note that helps A or hurts B
 * spends A's budget; past the cap a numeric note is scaled down and a flag is
 * dropped, so the notes tilt a fight and never decide it.
 */
export const NOTE_FAVOR_CAP = 15;

export interface AppliedNote {
  note: MatchupNote;
  /** The value actually applied, in note units (0 when dropped). */
  value: number;
  /** The side the note helps. */
  favors: Side;
  /** Advantage it gave `favors`, after clamping and capping. */
  score: number;
  capped: boolean;
  dropped: boolean;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type FighterModifiers = Record<NumericKey, number> &
  Record<FlagKey, boolean> & {
    brain: Record<BrainFlag, boolean>;
    /** Dynamic arena hazards the sim applies to this fighter. */
    hazards: DynamicHazardId[];
  };

export interface ResolvedModifiers {
  A: FighterModifiers;
  B: FighterModifiers;
  notes: AppliedNote[];
}

type Accumulator = Record<NumericKey, number> & Record<FlagKey, boolean>;

function neutral(): Accumulator {
  const acc = {} as Accumulator;
  for (const key of NUMERIC_KEYS) acc[key] = MODIFIER_SPECS[key].base;
  for (const key of FLAG_KEYS) acc[key] = false;
  return acc;
}

export function neutralModifiers(): FighterModifiers {
  return {
    ...neutral(),
    brain: Object.fromEntries(BRAIN_FLAGS.map((flag) => [flag, false])) as Record<
      BrainFlag,
      boolean
    >,
    hazards: [],
  };
}

const isFlag = (key: ModifierKey): key is FlagKey => MODIFIER_SPECS[key].kind === "flag";

function clampKey(key: NumericKey, value: number): number {
  const spec = MODIFIER_SPECS[key];
  return Math.min(spec.max, Math.max(spec.min, value));
}

/** The key's value after the effect, unclamped. */
function applied(acc: Accumulator, key: NumericKey, value: number): number {
  return MODIFIER_SPECS[key].kind === "multiplier" ? acc[key] * (1 + value / 100) : acc[key] + value;
}

function apply(acc: Accumulator, key: ModifierKey, value: number): void {
  if (isFlag(key)) {
    if (value > 0) acc[key] = true;
  } else {
    acc[key] = applied(acc, key, value);
  }
}

/** Advantage score of moving `key` from `from` to `to`, for the fighter that has it. */
function scoreChange(key: NumericKey, from: number, to: number): number {
  const spec = MODIFIER_SPECS[key];
  const units = spec.kind === "multiplier" ? (to - from) * 100 : to - from;
  return spec.weight * units;
}

const other = (side: Side): Side => (side === "A" ? "B" : "A");
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One clamped FighterModifiers per side from both sheets, the arena and the
 * matchup notes, in that order: trait effects (self and foe), arena hazard
 * rules, a clamp, then the notes under NOTE_FAVOR_CAP (at most the first
 * MATCHUP_NOTES_MAX, in the order given), a final clamp and rounding.
 */
export function resolveModifiers(
  a: Champion,
  b: Champion,
  arena: ArenaId | Arena,
  notes: readonly MatchupNote[],
): ResolvedModifiers {
  const stage = typeof arena === "string" ? ARENAS[arena] : arena;
  const sheets: Record<Side, Champion> = { A: a, B: b };
  const acc: Record<Side, Accumulator> = { A: neutral(), B: neutral() };
  const brains: Record<Side, Set<BrainFlag>> = { A: new Set(), B: new Set() };

  for (const side of ["A", "B"] as const) {
    for (const trait of sheets[side].traits) {
      const { effects, brain = [] } = TRAIT_EFFECTS[trait];
      for (const effect of effects) {
        apply(acc[effect.target === "foe" ? other(side) : side], effect.key, effect.value);
      }
      for (const flag of brain) brains[side].add(flag);
    }
  }
  for (const side of ["A", "B"] as const) {
    for (const hazard of stage.hazards) {
      for (const rule of hazard.rules) {
        if (!matchesCondition(rule.when, sheets[side])) continue;
        for (const effect of rule.effects) apply(acc[side], effect.key, effect.value);
      }
    }
    for (const key of NUMERIC_KEYS) acc[side][key] = clampKey(key, acc[side][key]);
  }

  const used: Record<Side, number> = { A: 0, B: 0 };
  const appliedNotes: AppliedNote[] = [];
  for (const raw of notes.slice(0, MATCHUP_NOTES_MAX)) {
    const spec = MODIFIER_SPECS[raw.modifies];
    if (!spec || (raw.side !== "A" && raw.side !== "B")) continue;
    const note: MatchupNote = {
      side: raw.side,
      modifies: raw.modifies,
      value: Number.isFinite(raw.value)
        ? Math.min(spec.noteMax, Math.max(spec.noteMin, raw.value))
        : 0,
      reason: cleanText(raw.reason, NOTE_REASON_MAX),
    };
    const target = acc[note.side];
    const key = note.modifies;

    if (isFlag(key)) {
      const gain = note.value > 0 && !target[key] ? Math.abs(spec.weight) : 0;
      const favors = spec.weight >= 0 ? note.side : other(note.side);
      const fits = gain <= NOTE_FAVOR_CAP - used[favors];
      if (fits && gain > 0) {
        target[key] = true;
        used[favors] += gain;
      }
      appliedNotes.push({
        note,
        value: fits && note.value > 0 ? 1 : 0,
        favors,
        score: fits ? gain : 0,
        capped: false,
        dropped: !fits || note.value <= 0,
      });
      continue;
    }

    // Work from the change that survives the clamp, so scaling it stays linear.
    const before = target[key];
    const after = clampKey(key, applied(target, key, note.value));
    const effective = spec.kind === "multiplier" ? (after / before - 1) * 100 : after - before;
    const full = scoreChange(key, before, after);
    const favors = full >= 0 ? note.side : other(note.side);
    const budget = Math.max(0, NOTE_FAVOR_CAP - used[favors]);
    const gain = Math.abs(full);
    const scale = gain <= budget ? 1 : budget / gain;
    const value = effective * scale;
    target[key] = clampKey(key, applied(target, key, value));
    const score = Math.abs(scoreChange(key, before, target[key]));
    used[favors] += score;
    appliedNotes.push({
      note,
      value: round3(value),
      favors,
      score: round3(score),
      capped: scale < 1 && scale > 0,
      dropped: scale === 0,
    });
  }

  const finish = (side: Side): FighterModifiers => {
    const result = neutralModifiers();
    for (const key of NUMERIC_KEYS) result[key] = round3(acc[side][key]);
    for (const key of FLAG_KEYS) result[key] = acc[side][key];
    for (const flag of brains[side]) result.brain[flag] = true;
    if (result.brain.neverRetreats) result.brain.retreatsWhenLow = false;
    result.hazards = stage.dynamic
      .filter((hazard) => matchesCondition(hazard.appliesTo, sheets[side]))
      .filter((hazard) => !(hazard.id === "wind" && result.pushImmune))
      .map((hazard) => hazard.id);
    return result;
  };
  return { A: finish("A"), B: finish("B"), notes: appliedNotes };
}

/** Net advantage of a fighter's modifiers over neutral (a tuning and test aid). */
export function modifierScore(modifiers: FighterModifiers): number {
  let score = 0;
  for (const key of NUMERIC_KEYS) {
    score += scoreChange(key, MODIFIER_SPECS[key].base, modifiers[key]);
  }
  for (const key of FLAG_KEYS) if (modifiers[key]) score += MODIFIER_SPECS[key].weight;
  return score;
}
