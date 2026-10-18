// A fight recorded for playback. The stage does not render the sim step by
// step: it runs the deterministic sim ahead of the presentation clock (a few
// milliseconds of stepping per frame, more when it has to catch up) and keeps
// every step's poses, animation hints and live state in typed arrays. Playback
// then samples the recording at any presentation time with interpolation, so
// slow motion at 0.3x stays smooth, a hit stop freezes on the exact contact
// frame, the recap can seek, and the run's hash is known (usually before the
// fight's t = 0) to compare with the stored outcome.
//
// Pure TypeScript (no three.js, no React): the same class runs in vitest.

import { BELL_HOLD_MS, SUDDEN_DEATH_MS } from "../../constants";
import {
  createFight,
  STEP_MS,
  type FightEvent,
  type FightInput,
  type FighterLayout,
  type FightOutcome,
  type FightSim,
  type Intent,
  type Locomotion,
  type MovePhase,
  type Rapier,
  type Side,
} from "../../sim";
import type { MoveType } from "../../vocab";

export const SIDES = ["A", "B"] as const satisfies readonly Side[];

const LOCOMOTIONS: readonly Locomotion[] = ["stand", "walk", "run", "hop", "slither", "hover", "airborne", "ragdoll"];
const INTENTS: readonly Intent[] = [
  "idle",
  "approach",
  "circle",
  "feint",
  "retreat",
  "commit",
  "recover",
  "showboat",
  "grab",
  "dodge",
  "stagger",
  "getup",
  "ko",
  "out",
];
const MOVE_TYPES: readonly MoveType[] = ["STRIKE", "GRAPPLE", "TRICK"];
const MOVE_PHASES: readonly MovePhase[] = ["windup", "active", "hold", "recover"];

// Per-side extras after the bodies (floats).
const X_FACING = 0;
const X_VEL = 1; // 3
const X_LOCO = 4;
const X_GAIT = 5;
const X_SPEED = 6;
const X_INTENT = 7;
const X_MOVE = 8;
const X_MOVE_TYPE = 9;
const X_MOVE_PHASE = 10;
const X_PROGRESS = 11;
const X_RAGDOLL = 12;
const X_REACH = 13; // 3
const X_HAS_REACH = 16;
const X_HEALTH = 17;
const X_STAGGERED = 18;
const X_AIRBORNE = 19;
const X_ON_EDGE = 20;
const X_POSITION = 21; // 3
const EXTRAS = 24;
const BODY_FLOATS = 7;

/** How long the recording runs past the decisive moment (the FIGHT outro plus a margin). */
export const RECORD_TAIL_MS = 4_200;

/** One fighter at one presentation time: shaped like the sim's FighterPose plus FighterLive. */
export interface SampledFighter {
  bodies: Array<{ key: string; p: [number, number, number]; q: [number, number, number, number] }>;
  root: { p: [number, number, number]; q: [number, number, number, number] };
  facing: number;
  velocity: [number, number, number];
  anim: {
    locomotion: Locomotion;
    phase: number;
    speed: number;
    intent: Intent;
    move: number | null;
    moveType: MoveType | null;
    movePhase: MovePhase | null;
    progress: number;
    ragdoll: number;
    reachTarget: [number, number, number] | null;
  };
  live: {
    health: number;
    maxHealth: number;
    staggered: boolean;
    airborne: boolean;
    onEdge: boolean;
    position: [number, number, number];
  };
}

export function createSample(keys: readonly string[], maxHealth: number): SampledFighter {
  const bodies = keys.map((key) => ({
    key,
    p: [0, 0, 0] as [number, number, number],
    q: [0, 0, 0, 1] as [number, number, number, number],
  }));
  return {
    bodies,
    root: bodies[0] ?? { p: [0, 0, 0], q: [0, 0, 0, 1] },
    facing: 0,
    velocity: [0, 0, 0],
    anim: {
      locomotion: "stand",
      phase: 0,
      speed: 0,
      intent: "idle",
      move: null,
      moveType: null,
      movePhase: null,
      progress: 0,
      ragdoll: 0,
      reachTarget: null,
    },
    live: { health: maxHealth, maxHealth, staggered: false, airborne: false, onEdge: false, position: [0, 0, 0] },
  };
}

const wrapAngle = (a: number) => {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

export interface RecordingOptions {
  /** Wall clock in ms for the stepping budget (injectable for tests). */
  now?: () => number;
  /** Ms past the decisive moment to keep recording. */
  tailMs?: number;
}

export class FightRecording {
  readonly input: FightInput;
  readonly layouts: Record<Side, FighterLayout>;
  readonly keys: Record<Side, string[]>;
  readonly maxHealth: Record<Side, number>;
  /** Every event the run emitted, in order. */
  readonly events: FightEvent[] = [];
  /** Recorded steps after frame 0 (frames = steps + 1). */
  steps = 0;
  outcome: FightOutcome | null = null;
  /** Wall ms spent stepping so far (diagnostics). */
  stepWallMs = 0;
  /** Steps that would hold a frozen pose for a side (a ring-out victim that landed). */
  readonly freezeStep: Record<Side, number> = { A: Infinity, B: Infinity };

  private sim: FightSim | null;
  private readonly stride: Record<Side, number>;
  private data: Record<Side, Float32Array>;
  private capacity: number;
  private readonly maxSteps: number;
  private readonly tailMs: number;
  private readonly now: () => number;

  constructor(R: Rapier, input: FightInput, options: RecordingOptions = {}) {
    this.input = input;
    this.now = options.now ?? (() => (typeof performance === "undefined" ? Date.now() : performance.now()));
    this.tailMs = options.tailMs ?? RECORD_TAIL_MS;
    const sim = createFight(R, input);
    this.sim = sim;
    this.layouts = { A: sim.layout("A"), B: sim.layout("B") };
    this.keys = { A: this.layouts.A.bodies.map((b) => b.key), B: this.layouts.B.bodies.map((b) => b.key) };
    this.maxHealth = { A: sim.live("A").maxHealth, B: sim.live("B").maxHealth };
    this.stride = {
      A: this.keys.A.length * BODY_FLOATS + EXTRAS,
      B: this.keys.B.length * BODY_FLOATS + EXTRAS,
    };
    this.maxSteps = Math.ceil((input.limitMs + SUDDEN_DEATH_MS + BELL_HOLD_MS + this.tailMs) / STEP_MS) + 4;
    this.capacity = Math.min(this.maxSteps + 1, 1024);
    this.data = {
      A: new Float32Array(this.capacity * this.stride.A),
      B: new Float32Array(this.capacity * this.stride.B),
    };
    this.writeFrame(0);
  }

  /** Sim time recorded so far, ms. */
  get recordedMs(): number {
    return this.steps * STEP_MS;
  }

  /** The run is finished and its tail recorded; the sim is released. */
  get complete(): boolean {
    return this.sim === null;
  }

  /** How long the recording will be once complete (known once the fight is decided). */
  get lengthMs(): number {
    return this.outcome ? this.outcome.endMs + this.tailMs : this.maxSteps * STEP_MS;
  }

  /**
   * Step the sim until `untilMs` of sim time is recorded or `budgetMs` of wall
   * time is spent (at least one step). Returns the events of those steps.
   */
  advance(untilMs: number, budgetMs: number): FightEvent[] {
    const sim = this.sim;
    if (!sim) return [];
    const fresh: FightEvent[] = [];
    const start = this.now();
    let first = true;
    while (this.sim && this.steps * STEP_MS < untilMs) {
      if (!first && this.now() - start >= budgetMs) break;
      first = false;
      const events = sim.step();
      this.steps += 1;
      for (const event of events) {
        this.events.push(event);
        fresh.push(event);
      }
      if (!this.outcome) this.outcome = sim.outcome();
      this.writeFrame(this.steps);
      const endMs = this.outcome ? this.outcome.endMs + this.tailMs : Infinity;
      if (this.steps >= this.maxSteps || this.steps * STEP_MS >= endMs) {
        sim.dispose();
        this.sim = null;
      }
    }
    this.stepWallMs += this.now() - start;
    return fresh;
  }

  /** Record to completion (headless use and tests). */
  finish(): FightOutcome | null {
    while (this.sim) this.advance(Infinity, Infinity);
    return this.outcome;
  }

  dispose(): void {
    this.sim?.dispose();
    this.sim = null;
  }

  /** Step index at sim time t (fractional), clamped to what is recorded. */
  stepAt(tMs: number): number {
    return Math.min(Math.max(tMs / STEP_MS, 0), this.steps);
  }

  /** The torso position of a side at a recorded step (for scans: landings, edges). */
  torsoAt(side: Side, step: number, out: [number, number, number]): [number, number, number] {
    const k = Math.min(Math.max(Math.round(step), 0), this.steps);
    const base = k * this.stride[side];
    const data = this.data[side];
    out[0] = data[base]!;
    out[1] = data[base + 1]!;
    out[2] = data[base + 2]!;
    return out;
  }

  /** Torso vertical velocity at a step (from the recorded linear velocity). */
  torsoVyAt(side: Side, step: number): number {
    const k = Math.min(Math.max(Math.round(step), 0), this.steps);
    return this.data[side][k * this.stride[side] + this.keys[side].length * BODY_FLOATS + X_VEL + 1]!;
  }

  /** Fill `out` with a side's state at sim time `tMs`, interpolated between steps. */
  sample(side: Side, tMs: number, out: SampledFighter): SampledFighter {
    const freeze = this.freezeStep[side];
    const f = Math.min(this.stepAt(tMs), freeze);
    const k0 = Math.floor(f);
    const k1 = Math.min(k0 + 1, this.steps, freeze);
    const a = k1 > k0 ? f - k0 : 0;
    const stride = this.stride[side];
    const data = this.data[side];
    const b0 = k0 * stride;
    const b1 = k1 * stride;
    const nb = this.keys[side].length;
    for (let i = 0; i < nb; i += 1) {
      const o0 = b0 + i * BODY_FLOATS;
      const o1 = b1 + i * BODY_FLOATS;
      const body = out.bodies[i];
      if (!body) continue;
      body.p[0] = data[o0]! + (data[o1]! - data[o0]!) * a;
      body.p[1] = data[o0 + 1]! + (data[o1 + 1]! - data[o0 + 1]!) * a;
      body.p[2] = data[o0 + 2]! + (data[o1 + 2]! - data[o0 + 2]!) * a;
      // Normalized lerp along the short arc.
      let qx1 = data[o1 + 3]!;
      let qy1 = data[o1 + 4]!;
      let qz1 = data[o1 + 5]!;
      let qw1 = data[o1 + 6]!;
      const qx0 = data[o0 + 3]!;
      const qy0 = data[o0 + 4]!;
      const qz0 = data[o0 + 5]!;
      const qw0 = data[o0 + 6]!;
      if (qx0 * qx1 + qy0 * qy1 + qz0 * qz1 + qw0 * qw1 < 0) {
        qx1 = -qx1;
        qy1 = -qy1;
        qz1 = -qz1;
        qw1 = -qw1;
      }
      const x = qx0 + (qx1 - qx0) * a;
      const y = qy0 + (qy1 - qy0) * a;
      const z = qz0 + (qz1 - qz0) * a;
      const w = qw0 + (qw1 - qw0) * a;
      const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
      body.q[0] = x / n;
      body.q[1] = y / n;
      body.q[2] = z / n;
      body.q[3] = w / n;
    }
    const x0 = b0 + nb * BODY_FLOATS;
    const x1 = b1 + nb * BODY_FLOATS;
    const lerp = (offset: number) => data[x0 + offset]! + (data[x1 + offset]! - data[x0 + offset]!) * a;
    // Discrete fields from the nearer step.
    const xd = a < 0.5 ? x0 : x1;
    out.facing = wrapAngle(data[x0 + X_FACING]! + wrapAngle(data[x1 + X_FACING]! - data[x0 + X_FACING]!) * a);
    const frozen = k1 === k0 && f >= freeze;
    out.velocity[0] = frozen ? 0 : lerp(X_VEL);
    out.velocity[1] = frozen ? 0 : lerp(X_VEL + 1);
    out.velocity[2] = frozen ? 0 : lerp(X_VEL + 2);
    const anim = out.anim;
    anim.locomotion = LOCOMOTIONS[data[xd + X_LOCO]!] ?? "stand";
    const gait0 = data[x0 + X_GAIT]!;
    let gait1 = data[x1 + X_GAIT]!;
    if (gait1 < gait0 - 0.5) gait1 += 1;
    anim.phase = (gait0 + (gait1 - gait0) * a) % 1;
    anim.speed = frozen ? 0 : lerp(X_SPEED);
    anim.intent = INTENTS[data[xd + X_INTENT]!] ?? "idle";
    const move = data[xd + X_MOVE]!;
    anim.move = move < 0 ? null : move;
    anim.moveType = MOVE_TYPES[data[xd + X_MOVE_TYPE]!] ?? null;
    anim.movePhase = MOVE_PHASES[data[xd + X_MOVE_PHASE]!] ?? null;
    // Progress restarts at each move phase: interpolate only inside one phase.
    const samePhase = data[x0 + X_MOVE_PHASE] === data[x1 + X_MOVE_PHASE] && data[x0 + X_MOVE] === data[x1 + X_MOVE];
    anim.progress = samePhase ? lerp(X_PROGRESS) : data[xd + X_PROGRESS]!;
    anim.ragdoll = lerp(X_RAGDOLL);
    if (data[xd + X_HAS_REACH]! > 0) {
      const reach = (anim.reachTarget ??= [0, 0, 0]);
      reach[0] = data[xd + X_REACH]!;
      reach[1] = data[xd + X_REACH + 1]!;
      reach[2] = data[xd + X_REACH + 2]!;
    } else {
      anim.reachTarget = null;
    }
    const live = out.live;
    live.health = data[xd + X_HEALTH]!;
    live.maxHealth = this.maxHealth[side];
    live.staggered = data[xd + X_STAGGERED]! > 0;
    live.airborne = data[xd + X_AIRBORNE]! > 0;
    live.onEdge = data[xd + X_ON_EDGE]! > 0;
    live.position[0] = lerp(X_POSITION);
    live.position[1] = lerp(X_POSITION + 1);
    live.position[2] = lerp(X_POSITION + 2);
    return out;
  }

  /** A fresh sample object for a side. */
  createSample(side: Side): SampledFighter {
    const sample = createSample(this.keys[side], this.maxHealth[side]);
    return this.sample(side, 0, sample);
  }

  private grow(minFrames: number): void {
    if (minFrames <= this.capacity) return;
    const capacity = Math.min(Math.max(minFrames, this.capacity * 2), this.maxSteps + 1);
    for (const side of SIDES) {
      const next = new Float32Array(capacity * this.stride[side]);
      next.set(this.data[side]);
      this.data[side] = next;
    }
    this.capacity = capacity;
  }

  private writeFrame(k: number): void {
    const sim = this.sim;
    if (!sim) return;
    this.grow(k + 1);
    for (const side of SIDES) {
      const pose = sim.pose(side);
      const live = sim.live(side);
      const data = this.data[side];
      const base = k * this.stride[side];
      const nb = this.keys[side].length;
      for (let i = 0; i < nb; i += 1) {
        const body = pose.bodies[i]!;
        const o = base + i * BODY_FLOATS;
        data[o] = body.p[0];
        data[o + 1] = body.p[1];
        data[o + 2] = body.p[2];
        data[o + 3] = body.q[0];
        data[o + 4] = body.q[1];
        data[o + 5] = body.q[2];
        data[o + 6] = body.q[3];
      }
      const x = base + nb * BODY_FLOATS;
      const anim = pose.anim;
      data[x + X_FACING] = pose.facing;
      data[x + X_VEL] = pose.velocity[0];
      data[x + X_VEL + 1] = pose.velocity[1];
      data[x + X_VEL + 2] = pose.velocity[2];
      data[x + X_LOCO] = LOCOMOTIONS.indexOf(anim.locomotion);
      data[x + X_GAIT] = anim.phase;
      data[x + X_SPEED] = anim.speed;
      data[x + X_INTENT] = INTENTS.indexOf(anim.intent);
      data[x + X_MOVE] = anim.move ?? -1;
      data[x + X_MOVE_TYPE] = anim.moveType ? MOVE_TYPES.indexOf(anim.moveType) : -1;
      data[x + X_MOVE_PHASE] = anim.movePhase ? MOVE_PHASES.indexOf(anim.movePhase) : -1;
      data[x + X_PROGRESS] = anim.progress;
      data[x + X_RAGDOLL] = anim.ragdoll;
      if (anim.reachTarget) {
        data[x + X_REACH] = anim.reachTarget[0];
        data[x + X_REACH + 1] = anim.reachTarget[1];
        data[x + X_REACH + 2] = anim.reachTarget[2];
        data[x + X_HAS_REACH] = 1;
      } else {
        data[x + X_HAS_REACH] = 0;
      }
      data[x + X_HEALTH] = live.health;
      data[x + X_STAGGERED] = live.staggered ? 1 : 0;
      data[x + X_AIRBORNE] = live.airborne ? 1 : 0;
      data[x + X_ON_EDGE] = live.onEdge ? 1 : 0;
      data[x + X_POSITION] = live.position[0];
      data[x + X_POSITION + 1] = live.position[1];
      data[x + X_POSITION + 2] = live.position[2];
    }
  }
}
