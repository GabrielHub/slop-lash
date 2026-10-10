// Public types of the fight sim (build plan contract 3.4). Pure data: the
// server stores FightOutcome on the fight row, the stage replays FightSim.

import type { ArenaId } from "../arenas";
import type { MatchupNote, Side } from "../modifiers";
import type { Champion } from "../sheet";
import type { BodyPlan, MoveType } from "../vocab";

export type { Side };
export type Vec3 = [x: number, y: number, z: number];
/** Unit quaternion [x, y, z, w]. */
export type Quat = [x: number, y: number, z: number, w: number];

export interface FightInput {
  /** uint32 */
  seed: number;
  arena: ArenaId;
  a: Champion;
  b: Champion;
  notes: MatchupNote[];
  /** 30000, or 20000 for house vs house. */
  limitMs: number;
}

export type FightMethod = "KO" | "RINGOUT" | "DECISION" | "SUDDEN_DEATH";

export const FIGHT_EVENT_KINDS = [
  "start",
  "contact",
  "windup",
  "hit",
  "whiff",
  "stagger",
  "getup",
  "grab",
  "throw",
  "dodge",
  "counter",
  "edge",
  "ringout",
  "ko",
  "selfDamage",
  "showboat",
  "suddenDeath",
  "timeout",
  "end",
] as const;
export type FightEventKind = (typeof FIGHT_EVENT_KINDS)[number];

/** Why a move missed: out of range, dodged by a Trick, or the target can't be grappled. */
/** miss: nothing there; dodged: a Trick's dodge; immune: grappleImmune; slipped: a slither wriggled out of a grab; broken: a Trick hit in its setup. */
export type WhiffReason = "miss" | "dodged" | "immune" | "slipped" | "broken";
/** What staggered a fighter. */
export type StaggerCause = "hit" | "throw" | "counter" | "counterCrack" | "trickBroken";

interface EventBase {
  /** Sim time in whole milliseconds. */
  t: number;
}

/** Every event names a side; null for fight-level beats. */
export type FightEvent =
  | (EventBase & { kind: "start"; side: null })
  | (EventBase & { kind: "contact"; side: null; point: Vec3 })
  | (EventBase & { kind: "windup"; side: Side; move: number; type: MoveType })
  | (EventBase & {
      kind: "hit";
      /** The attacker. */
      side: Side;
      move: number;
      type: MoveType;
      damage: number;
      /** Impulse magnitude actually applied (0 when the target is immune). */
      knockback: number;
      /** A big hit: staggered the target, or a Chaos miracle. Drives hit stop and slow motion. */
      big: boolean;
      point: Vec3;
      /** The target's health after the hit. */
      health: number;
      counter: boolean;
      miracle: boolean;
    })
  | (EventBase & { kind: "whiff"; side: Side; move: number; type: MoveType; reason: WhiffReason })
  | (EventBase & { kind: "stagger"; side: Side; ms: number; cause: StaggerCause })
  | (EventBase & { kind: "getup"; side: Side })
  | (EventBase & { kind: "grab"; side: Side; move: number; point: Vec3 })
  | (EventBase & {
      kind: "throw";
      side: Side;
      move: number;
      damage: number;
      knockback: number;
      point: Vec3;
      health: number;
    })
  | (EventBase & { kind: "dodge"; side: Side; move: number })
  | (EventBase & { kind: "counter"; side: Side; move: number })
  | (EventBase & { kind: "edge"; side: Side; point: Vec3 })
  | (EventBase & { kind: "ringout"; side: Side; point: Vec3 })
  | (EventBase & { kind: "ko"; side: Side })
  | (EventBase & { kind: "selfDamage"; side: Side; damage: number; health: number })
  | (EventBase & { kind: "showboat"; side: Side })
  | (EventBase & { kind: "suddenDeath"; side: null })
  | (EventBase & { kind: "timeout"; side: null })
  | (EventBase & { kind: "end"; side: Side; method: FightMethod });

export interface FightOutcome {
  winner: Side;
  method: FightMethod;
  endMs: number;
  health: { A: number; B: number };
  maxHealth: { A: number; B: number };
  events: FightEvent[];
  /** [ms, healthA, healthB] at 4 Hz plus every change. */
  healthTimeline: Array<[ms: number, a: number, b: number]>;
  hash: string;
}

/** What the brain is doing, for the renderer's face and pose and the stage's captions. */
export type Intent =
  | "idle"
  | "approach"
  | "circle"
  | "feint"
  | "retreat"
  | "commit"
  | "recover"
  | "showboat"
  | "grab"
  | "dodge"
  | "stagger"
  | "getup"
  | "ko"
  | "out";

export type Locomotion = "stand" | "walk" | "run" | "hop" | "slither" | "hover" | "airborne" | "ragdoll";

/** Where a move is in its timeline. */
export type MovePhase = "windup" | "active" | "hold" | "recover";

export interface ProxyBody {
  /** Bone id from resolveSkeleton (the part id, or `${partId}~m` for a mirror). */
  key: string;
  /** World position of the bone's head (its attachment point). */
  p: Vec3;
  /** World rotation. At rest it equals the fighter's facing yaw, so a vertex v in creature rest space maps to p + q * (v - bone.head). */
  q: Quat;
}

export interface FighterAnimHint {
  locomotion: Locomotion;
  /** Gait cycle 0..1. */
  phase: number;
  /** Horizontal speed, units/s. */
  speed: number;
  intent: Intent;
  /** Active move index 0..2, or null. */
  move: number | null;
  moveType: MoveType | null;
  movePhase: MovePhase | null;
  /** 0..1 through the current move phase. */
  progress: number;
  /** 0 = fully procedural, 1 = fully physical (blend the proxies by this). */
  ragdoll: number;
  /** Where the active move reaches for (the opponent's torso), world space. */
  reachTarget: Vec3 | null;
}

export interface FighterPose {
  bodies: ProxyBody[];
  /** The torso body's transform. */
  root: { p: Vec3; q: Quat };
  /** Yaw in radians (three.js convention: 0 faces +Z, PI/2 faces +X). */
  facing: number;
  velocity: Vec3;
  anim: FighterAnimHint;
}

export interface FighterLive {
  health: number;
  maxHealth: number;
  staggered: boolean;
  airborne: boolean;
  onEdge: boolean;
  intent: Intent;
  facing: number;
  /** Torso position. */
  position: Vec3;
}

export type ProxyShape =
  | { kind: "capsule"; a: Vec3; b: Vec3; radius: number }
  | { kind: "ball"; center: Vec3; radius: number };

/** Static description of one fighter's physics proxy, in each body's local frame. */
export interface FighterLayout {
  bodyPlan: BodyPlan;
  bodies: Array<{
    key: string;
    parent: string | null;
    /** Bones that ride on this body (itself first, then welded horns, ears, items...). */
    bones: string[];
    shapes: ProxyShape[];
    mass: number;
  }>;
  /** Every bone id → the body key it rides on. */
  boneBody: Record<string, string>;
  totalMass: number;
}

export interface FightSim {
  readonly tMs: number;
  readonly done: boolean;
  /** One fixed 1/60 s step; the events emitted this step. Keeps stepping physics after `done` for the outro. */
  step(): FightEvent[];
  pose(side: Side): FighterPose;
  live(side: Side): FighterLive;
  layout(side: Side): FighterLayout;
  outcome(): FightOutcome | null;
  dispose(): void;
}
