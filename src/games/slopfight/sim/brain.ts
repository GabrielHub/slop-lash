// The fighter brain: a small behaviour controller read from the sheet (spec
// section 8 "Brains"). It thinks every few hundred ms and picks an intent
// (approach, circle, feint, retreat, idle) or commits to one of its three
// moves by situation: Strike at mid range, Grapple close when the opponent is
// recovering, Trick when the opponent commits. Temperament, traits and Chaos
// weight every choice; aggression rises with fight time so nobody stalls.
// Pure decision logic over a Situation snapshot; the fight applies it.

import type { FighterModifiers } from "../modifiers";
import type { Champion } from "../sheet";
import type { MoveType } from "../vocab";
import { clamp } from "./dmath";
import type { Rng } from "./prng";
import {
  AGGRESSION_RAMP,
  LOW_HEALTH,
  SLOW_STARTER_MS,
  THINK_MS,
  THINK_MS_MIN,
  THINK_MS_PER_AGGRESSION,
} from "./tuning";

export interface BrainMove {
  type: MoveType;
  power: number;
  /** Power after the type modifier (strikePower etc.), 0.5..7. */
  effPower: number;
  /** Torso-centre distance (minus the foe's footprint) at which this move can start. */
  range: number;
}

export interface BrainProfile {
  aggression: number;
  caution: number;
  showboating: number;
  /** 0..1 from the Chaos stat, more when erratic. */
  chaos: number;
  effReach: number;
  moves: BrainMove[];
  retreatsWhenLow: boolean;
  neverRetreats: boolean;
  slowStarter: boolean;
  berserkWhenLow: boolean;
  /** How much this fighter likes grabbing the current opponent: 0 = it can't (grappleImmune), less vs a slither. */
  grabAppeal: number;
  /** Can this fighter grab the current opponent at all? */
  canGrabFoe: boolean;
}

/** What the opponent looks like from here. */
export type FoeState =
  | "ready"
  | "strikeWindup"
  | "strikeActive"
  | "strikeRecover"
  | "grappleApproach"
  | "grappleHold"
  | "trickSetup"
  | "dodging"
  | "recovering"
  | "showboat"
  | "staggered"
  | "getup"
  | "airborne";

export interface Situation {
  t: number;
  limitMs: number;
  /** Torso-centre distance minus the foe's footprint. */
  reachGap: number;
  /** Torso-centre distance minus both footprints (0 = touching). */
  gap: number;
  health01: number;
  foeHealth01: number;
  /** Floor distance to my nearest drop. */
  edge: number;
  foeEdge: number;
  foe: FoeState;
  /** The foe's reach for its quickest strike, in reachGap terms. */
  foeThreat: number;
  cooldowns: readonly number[];
  beenHit: boolean;
}

export type BrainIntent = "idle" | "approach" | "circle" | "feint" | "retreat";

export type BrainDecision =
  | { kind: "move"; index: number }
  | { kind: "go"; intent: BrainIntent; circleDir: 1 | -1; holdMs: number };

export interface BrainState {
  nextThinkMs: number;
  intent: BrainIntent;
  circleDir: 1 | -1;
  intentUntil: number;
}

export function createBrainState(): BrainState {
  return { nextThinkMs: 0, intent: "approach", circleDir: 1, intentUntil: 0 };
}

export function brainProfile(
  champion: Champion,
  mods: FighterModifiers,
  moves: BrainMove[],
  grabAppeal: number,
): BrainProfile {
  const chaos = (champion.stats.chaos - 1) / 4 + (mods.brain.erratic ? 0.3 : 0);
  return {
    aggression: champion.temperament.aggression,
    caution: champion.temperament.caution,
    showboating: champion.temperament.showboating,
    chaos: clamp(chaos, 0, 1.3),
    effReach: clamp(champion.stats.reach + mods.reach, 0, 6),
    moves,
    retreatsWhenLow: mods.brain.retreatsWhenLow,
    neverRetreats: mods.brain.neverRetreats,
    slowStarter: mods.brain.slowStarter,
    berserkWhenLow: mods.brain.berserkWhenLow,
    grabAppeal,
    canGrabFoe: grabAppeal > 0,
  };
}

/** Effective aggression now: temperament, plus a ramp with fight time, plus berserk. */
export function aggressionAt(profile: BrainProfile, situation: Pick<Situation, "t" | "limitMs" | "health01">): number {
  const ramp = AGGRESSION_RAMP * clamp(situation.t / situation.limitMs, 0, 1.3);
  const berserk = profile.berserkWhenLow && situation.health01 < LOW_HEALTH ? 0.5 : 0;
  return clamp(0.2 + profile.aggression * 0.8 + ramp + berserk - profile.caution * 0.2, 0.05, 1.6);
}

export function thinkDelay(profile: BrainProfile, aggression: number, rng: Rng): number {
  const base = THINK_MS - THINK_MS_PER_AGGRESSION * clamp(aggression, 0, 1);
  return Math.max(THINK_MS_MIN, base * (1 + profile.chaos * 0.6 * rng.signed()));
}

const isCommitted = (foe: FoeState) =>
  foe === "strikeWindup" || foe === "strikeActive" || foe === "grappleApproach";
/** Standing but defenceless: the window a Grapple (or a Strike) punishes. */
const isOpen = (foe: FoeState) =>
  foe === "strikeRecover" || foe === "recovering" || foe === "showboat";
/** Down or getting up: no grabs land; most brains wait at range instead of crowding. */
const isDown = (foe: FoeState) => foe === "staggered" || foe === "getup";

/** One think: commit to a move or choose how to move. Draws from `rng` in a fixed order. */
export function think(
  profile: BrainProfile,
  state: BrainState,
  situation: Situation,
  rng: Rng,
): BrainDecision {
  const aggression = aggressionAt(profile, situation);
  const noise = () => profile.chaos * rng.signed();
  const ready = (index: number) => situation.cooldowns[index]! <= 0;
  const inRange = (index: number) => situation.reachGap <= profile.moves[index]!.range;
  const movesOf = (type: MoveType) =>
    profile.moves
      .map((move, index) => ({ move, index }))
      .filter(({ move, index }) => move.type === type && ready(index));
  const best = (type: MoveType, needRange: boolean) => {
    const options = movesOf(type).filter(({ index }) => !needRange || inRange(index));
    let pick: { index: number; score: number } | null = null;
    for (const { move, index } of options) {
      const score = move.effPower * (1 + 0.8 * noise());
      if (!pick || score > pick.score) pick = { index, score };
    }
    return pick?.index ?? null;
  };

  const go = (intent: BrainIntent, holdMs = 0): BrainDecision => ({
    kind: "go",
    intent,
    circleDir: state.circleDir,
    holdMs,
  });

  // Dozing through the opening seconds.
  if (profile.slowStarter && situation.t < SLOW_STARTER_MS && !situation.beenHit) return go("idle");

  const low = situation.health01 < LOW_HEALTH;
  const fleeing = low && profile.retreatsWhenLow && !profile.neverRetreats && !profile.berserkWhenLow;

  // Reactions come first: they are the type cycle's timing windows.
  if (isCommitted(situation.foe) && situation.reachGap <= situation.foeThreat + 0.25) {
    const trick = best("TRICK", false);
    const wantsTrick = 0.45 + profile.caution * 0.35 + noise() * 0.4;
    if (trick !== null && rng.float() < wantsTrick) return { kind: "move", index: trick };
    // Trade instead: a Strike in range lands on a Grapple approach or a slow windup.
    const strike = best("STRIKE", true);
    if (strike !== null && rng.float() < 0.35 + aggression * 0.3) return { kind: "move", index: strike };
  }
  if (situation.foe === "trickSetup" && rng.float() < 0.2 + aggression * 0.35 - profile.caution * 0.25 + noise() * 0.3) {
    // Baited: a Strike thrown at a feint usually lands in the dodge.
    const strike = best("STRIKE", true);
    if (strike !== null) return { kind: "move", index: strike };
  }
  if (isOpen(situation.foe) && !fleeing) {
    const grapple = profile.canGrabFoe ? best("GRAPPLE", true) : null;
    if (grapple !== null && rng.float() < (0.45 + aggression * 0.3) * profile.grabAppeal) return { kind: "move", index: grapple };
    const strike = best("STRIKE", true);
    if (strike !== null && rng.float() < 0.5 + aggression * 0.4) return { kind: "move", index: strike };
  }

  if (isDown(situation.foe)) {
    // A swing at a fighter on the floor is allowed (it pushes less); crowding it is not.
    const strike = best("STRIKE", true);
    if (strike !== null && situation.foe === "staggered" && rng.float() < 0.04 + aggression * 0.06) {
      return { kind: "move", index: strike };
    }
    return go(situation.reachGap > 0.6 ? "approach" : "circle", 250);
  }

  if (fleeing) {
    // Cornered cowards still swing.
    if (situation.reachGap < 0.25) {
      const strike = best("STRIKE", true);
      if (strike !== null && rng.float() < 0.5) return { kind: "move", index: strike };
    }
    return go("retreat", 600);
  }

  // Near my own drop: get back toward the middle before anything else (unless the foe is open).
  const edgeMargin = 0.45 + profile.caution * 0.55;
  if (situation.edge < edgeMargin && !isOpen(situation.foe) && rng.float() < 0.55 + profile.caution * 0.4) {
    return go("retreat", 350);
  }

  // Offense: commit when something is in range.
  const commitChance = clamp(0.3 + aggression * 0.5 + noise() * 0.25, 0.05, 0.95);
  const strike = best("STRIKE", true);
  const grapple = profile.canGrabFoe ? best("GRAPPLE", true) : null;
  const trick = best("TRICK", false);
  if ((strike !== null || grapple !== null) && rng.float() < commitChance) {
    const close = situation.gap < 0.2;
    const strikeScore = strike === null ? -1 : profile.moves[strike]!.effPower * (close ? 0.9 : 1.2) * (1 + noise() * 0.6);
    const grappleScore =
      grapple === null
        ? -1
        : profile.moves[grapple]!.effPower *
          profile.grabAppeal *
          (close ? 1.0 : 0.5) *
          (situation.foeEdge < 1.2 ? 1.3 : 1) *
          (1 + noise() * 0.6);
    return { kind: "move", index: grappleScore > strikeScore ? grapple! : strike! };
  }
  // A Trick thrown out as bait when the foe is close and aggressive-looking.
  if (trick !== null && situation.reachGap < situation.foeThreat + 0.1 && rng.float() < 0.12 + profile.chaos * 0.15) {
    return { kind: "move", index: trick };
  }

  // Movement.
  const desired = Math.max(0.05, Math.min(...profile.moves.map((move) => move.range)) * 0.85);
  if (situation.reachGap > desired + 0.6 || situation.t > situation.limitMs * 0.6) {
    // Far, or late in the fight: close in (cautious fighters sometimes circle on the way).
    if (rng.float() < profile.caution * 0.35 - aggression * 0.15) return go("circle", 500);
    return go("approach", 300);
  }
  if (situation.reachGap > desired) {
    const roll = rng.float();
    if (roll < 0.12 + profile.chaos * 0.12) return go("feint", 350);
    if (roll < 0.25 + profile.caution * 0.35) {
      if (rng.float() < 0.3) state.circleDir = state.circleDir === 1 ? -1 : 1;
      return go("circle", 450);
    }
    return go("approach", 250);
  }
  // In my range but chose not to commit: circle or hold.
  if (rng.float() < 0.5 + profile.caution * 0.3) {
    if (rng.float() < 0.25) state.circleDir = state.circleDir === 1 ? -1 : 1;
    return go("circle", 300);
  }
  return go("approach", 200);
}
