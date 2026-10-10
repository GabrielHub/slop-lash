// Procedural animation for one creature (spec section 9). Every frame it turns
// the driver (position, facing, velocity, the sim's animation hint, optional
// physics proxies) into one matrix per bone, mapping rest creature space to
// the creature's parent space; the renderer feeds them to the skinned mesh.
//
// - Legged plans step with foot IK: each foot has a home under the body; when
//   the body moves far enough away, a gait group lifts its feet in an arc to a
//   predicted landing (alternating for two legs, trot for four, tripod for six
//   and eight). Legs are single rubber-hose bones: they aim at the foot target
//   and stretch. The body bobs with the steps and leans into its velocity.
// - Hoppers crouch, launch, tilt in the air and land with a squash.
// - Slitherers run a sine along the spine chain, amplitude by speed, head
//   steady. Fliers hover and bob, flap at a rate set by size, bank into turns,
//   and their legs dangle with lag.
// - Arms sway with noise, swing with the gait, and reach toward the target
//   for a move (wind-up, strike with stretch, recover).
// - Every non-load-bearing part (tails, horns, ears, fins, items) follows its
//   parent through a damped spring: most of the charm.
// - Timing comes from Heft and size: small is fast and twitchy, big is slow.
// - With physics proxies and `ragdoll` > 0, bones blend toward the proxy
//   bodies' transforms.

import { Matrix4, Quaternion, Vector3 } from "three";
import type { BodyPlan, Delivery } from "../../vocab";
import type { Rig } from "./rig";

export type Expression = "neutral" | "blink" | "squint" | "wide" | "smug" | "annoyed" | "closed";

type Tuple3 = [number, number, number];

/** Structurally a FighterPose's `bodies` (sim/types.ts): proxy bodies keyed by bone id. */
export interface DriverPose {
  bodies: ReadonlyArray<{ key: string; p: readonly number[]; q: readonly number[] }>;
}

/** Structurally the sim's FighterAnimHint; every field optional. */
export interface DriverAnim {
  locomotion?: string;
  phase?: number;
  speed?: number;
  intent?: string;
  move?: number | null;
  moveType?: string | null;
  movePhase?: "windup" | "active" | "hold" | "recover" | null;
  progress?: number;
  ragdoll?: number;
  reachTarget?: readonly number[] | null;
}

/**
 * What moves a creature, updated by its owner every frame (a plain mutable
 * object). Positions are in the creature's parent space; `position` is the
 * ground point under the creature's origin.
 */
export interface CreatureDriver {
  position: Tuple3;
  /** Facing yaw (three.js convention: 0 faces +z, PI/2 faces +x). */
  yaw: number;
  velocity: Tuple3;
  anim?: DriverAnim | null;
  /** Physics proxy bodies; blended in by `anim.ragdoll`. */
  pose?: DriverPose | null;
  /** Forces a face state (otherwise derived from the intent). */
  expression?: Expression | null;
}

export function createDriver(position: Tuple3 = [0, 0, 0], yaw = 0): CreatureDriver {
  return { position: [...position], yaw, velocity: [0, 0, 0], anim: null, pose: null, expression: null };
}

export type AnimEvent =
  | { kind: "footstep"; position: Vector3; strength: number }
  | { kind: "hopLaunch"; position: Vector3 }
  | { kind: "hopLand"; position: Vector3; strength: number }
  | { kind: "flap" };

export interface AnimatorOptions {
  plan: BodyPlan;
  /** 1..5 */
  heft: number;
  /** Per-creature phase seed. */
  seed: number;
  /** The three moves' deliveries, to pick the striking limb. */
  deliveries?: readonly Delivery[];
}

interface FootState {
  plant: Vector3;
  from: Vector3;
  current: Vector3;
  t: number;
  duration: number;
  stepping: boolean;
}

interface Spring {
  o: Vector3;
  v: Vector3;
  prev: Vector3;
  prev2: Vector3;
  init: boolean;
}

interface Pop {
  u: number;
  v: number;
}

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrapAngle = (a: number) => {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
};

/** A deterministic 0..1 sequence for blinks and idle twitches. */
function lcg(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Scratch objects (the animator is single-threaded and re-entrant per call).
const tmpM = new Matrix4();
const tmpM2 = new Matrix4();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpV3 = new Vector3();
const tmpS = new Vector3();

/** Scale by `s` along unit axis `d`: I + (s - 1) d d^T. */
function axisScale(out: Matrix4, d: Vector3, s: number): Matrix4 {
  const k = s - 1;
  return out.set(
    1 + k * d.x * d.x, k * d.x * d.y, k * d.x * d.z, 0,
    k * d.y * d.x, 1 + k * d.y * d.y, k * d.y * d.z, 0,
    k * d.z * d.x, k * d.z * d.y, 1 + k * d.z * d.z, 0,
    0, 0, 0, 1,
  );
}

export class CreatureAnimator {
  rig: Rig;
  readonly opts: AnimatorOptions;
  /** Per bone: rest creature space -> parent space. */
  matrices: Matrix4[] = [];
  /** Creature-space part (without the root transform). */
  private local: Matrix4[] = [];
  private worldRot: Quaternion[] = [];
  private localRot: Quaternion[] = [];
  private stretch: number[] = [];
  private root = new Matrix4();
  private rootInv = new Matrix4();
  private flat = new Matrix4();
  private feet: FootState[] = [];
  /** Keyed by bone id so a re-meshed body keeps its lag and growth pops. */
  private springs = new Map<string, Spring>();
  private pops = new Map<string, Pop>();
  private random: () => number;

  // Smoothed motion state.
  private time = 0;
  private speed = 0;
  private prevYaw = 0;
  private yawRate = 0;
  private prevVel = new Vector3();
  private vel = new Vector3();
  private accel = new Vector3();
  private distance = 0;
  private hopPhase = 0;
  private hopping = false;
  private slitherPhase = 0;
  private flapPhase = 0;
  private squashV = 0;
  private squashX = 0;
  private jiggleAmp = 0;
  private lag = new Vector3();
  private lagV = new Vector3();
  private rootOffset = new Vector3();
  private rootOffsetV = new Vector3();
  private rootScale = 1;
  private rootScaleV = 0;
  private initialized = false;

  // Face.
  expression: Expression = "neutral";
  /** 0 open .. 1 closed, from blinks. */
  blink = 0;
  private nextBlink = 1.5;
  private blinkT = -1;

  constructor(rig: Rig, opts: AnimatorOptions) {
    this.rig = rig;
    this.opts = opts;
    this.random = lcg(opts.seed * 7919 + 17);
    this.setRig(rig);
  }

  /** Small is fast and twitchy, big is slow and heavy. */
  get tempo(): number {
    const size = Math.max(this.rig.height, 0.3);
    return clamp((1.25 - 0.08 * this.opts.heft) / Math.sqrt(size), 0.6, 1.8);
  }

  /** Swap in a new rig (a re-meshed body); keeps motion state, re-homes the feet. */
  setRig(rig: Rig) {
    const oldFeet = this.feet;
    this.rig = rig;
    const n = rig.bones.length;
    this.matrices = Array.from({ length: n }, (_, i) => this.matrices[i] ?? new Matrix4());
    this.local = Array.from({ length: n }, () => new Matrix4());
    this.worldRot = Array.from({ length: n }, () => new Quaternion());
    this.localRot = Array.from({ length: n }, () => new Quaternion());
    this.stretch = Array.from({ length: n }, () => 1);
    this.feet = rig.legs.map((_, i) => {
      const old = oldFeet[i];
      return old
        ? { ...old, stepping: false, t: 1 }
        : {
            plant: new Vector3(),
            from: new Vector3(),
            current: new Vector3(),
            t: 1,
            duration: 0.2,
            stepping: false,
          };
    });
    this.footsInitialized = false;
    const keep = new Map<string, Spring>();
    for (const index of rig.secondary) {
      const id = rig.bones[index]!.id;
      const old = this.springs.get(id);
      keep.set(id, old ?? { o: new Vector3(), v: new Vector3(), prev: new Vector3(), prev2: new Vector3(), init: false });
    }
    this.springs = keep;
    for (const id of this.pops.keys()) if (!rig.index.has(id)) this.pops.delete(id);
  }

  private footsInitialized = false;

  /** A part just landed: its bone scales up from nothing with an overshoot. */
  pop(boneId: string) {
    this.pops.set(boneId, { u: 0.02, v: 0 });
  }

  /** True while any part is still popping in. */
  get popping(): boolean {
    return this.pops.size > 0;
  }

  /** A hit: the body jiggles for about half a second. */
  jiggle(strength = 1) {
    this.jiggleAmp = Math.min(0.08, this.jiggleAmp + 0.035 * strength);
    this.squashV -= 2.5 * strength;
  }

  /** A quick squash (landing, inflating). Negative values stretch. */
  squash(amount: number) {
    this.squashV -= amount * 8;
  }

  /** Re-forming growth: start the body offset (creature space) and scale from where the old body was. */
  reform(offset: Vector3, scaleFrom: number) {
    this.rootOffset.copy(offset);
    this.rootOffsetV.set(0, 0, 0);
    this.rootScale = scaleFrom;
    this.rootScaleV = 0;
    this.squashV -= 1.6;
  }

  /** Wobble uniforms for the material: ripple, jiggle and lag, in creature heights. */
  wobble(out: { amp: number; jiggle: number; lag: Vector3 }) {
    out.amp = clamp(this.speed / Math.max(this.rig.height, 0.2), 0, 3) * 0.006 + 0.0015;
    out.jiggle = this.jiggleAmp;
    out.lag.copy(this.lag);
    return out;
  }

  update(dtRaw: number, driver: CreatureDriver): AnimEvent[] {
    const dt = clamp(dtRaw, 1 / 240, 1 / 20);
    const events: AnimEvent[] = [];
    const rig = this.rig;
    const H = rig.height;
    const tempo = this.tempo;
    this.time += dt;
    const t = this.time;
    const anim = driver.anim ?? null;

    // --- Motion state ---------------------------------------------------
    const vel = this.vel.set(driver.velocity[0], driver.velocity[1], driver.velocity[2]);
    const horizontal = Math.hypot(vel.x, vel.z);
    this.speed += (horizontal - this.speed) * (1 - Math.exp(-dt * 10));
    if (!this.initialized) {
      this.prevYaw = driver.yaw;
      this.prevVel.copy(vel);
    }
    this.yawRate += (wrapAngle(driver.yaw - this.prevYaw) / dt - this.yawRate) * (1 - Math.exp(-dt * 6));
    this.prevYaw = driver.yaw;
    tmpV2.subVectors(vel, this.prevVel).divideScalar(dt);
    this.accel.lerp(tmpV2, 1 - Math.exp(-dt * 12));
    this.prevVel.copy(vel);
    this.distance += horizontal * dt;
    const speed = this.speed;
    const moving = speed > 0.04 * H;

    // Jelly lag: the top trails behind velocity, with overshoot when it stops.
    const cosY = Math.cos(driver.yaw);
    const sinY = Math.sin(driver.yaw);
    const localVx = vel.x * cosY - vel.z * sinY;
    const localVz = vel.x * sinY + vel.z * cosY;
    const lagTarget = tmpV2.set(-localVx, 0, -localVz).multiplyScalar(0.05 / Math.max(H, 0.2));
    const kLag = (2 * Math.PI * 1.6 * tempo) ** 2;
    this.lagV.addScaledVector(tmpV3.subVectors(lagTarget, this.lag), kLag * dt).multiplyScalar(Math.exp(-dt * 5));
    this.lag.addScaledVector(this.lagV, dt);
    this.lag.clampLength(0, 0.12);
    this.jiggleAmp *= Math.exp(-dt * 7);

    // Squash spring (1 - squashX is the vertical scale).
    this.squashV += (-this.squashX * 260 - this.squashV * 16) * dt;
    this.squashX += this.squashV * dt;
    this.squashX = clamp(this.squashX, -0.3, 0.35);

    // Growth springs: body offset and scale settle back to rest.
    this.rootOffsetV.addScaledVector(this.rootOffset, -90 * dt).multiplyScalar(Math.exp(-dt * 11));
    this.rootOffset.addScaledVector(this.rootOffsetV, dt);
    this.rootScaleV += (-(this.rootScale - 1) * 120 - this.rootScaleV * 14) * dt;
    this.rootScale += this.rootScaleV * dt;
    for (const [id, pop] of this.pops) {
      pop.v += (-(pop.u - 1) * 320 - pop.v * 13) * dt;
      pop.u += pop.v * dt;
      if (Math.abs(pop.u - 1) < 0.002 && Math.abs(pop.v) < 0.01) this.pops.delete(id);
    }

    // --- Root motion by body plan ---------------------------------------
    let lift = 0;
    let bob = 0;
    let pitch = clamp(speed / Math.max(H * 2.5, 0.3), 0, 1) * 0.16;
    let roll = clamp(-this.yawRate * speed * 0.18, -0.3, 0.3);
    let sy = 1 - this.squashX;
    const plan = rig.plan;
    const walker = rig.legs.length > 0 && plan !== "FLIER" && plan !== "HOPPER";

    if (plan === "HOPPER") {
      const period = clamp(0.5 + 0.07 * this.opts.heft, 0.5, 0.95) * Math.sqrt(Math.max(H, 0.4));
      const wantHop = moving || anim?.locomotion === "hop";
      if (wantHop) this.hopping = true;
      if (this.hopping) {
        const before = this.hopPhase;
        this.hopPhase += dt / period;
        if (before < 0.2 && this.hopPhase >= 0.2) events.push({ kind: "hopLaunch", position: new Vector3(...driver.position) });
        if (before < 0.84 && this.hopPhase >= 0.84) {
          events.push({ kind: "hopLand", position: new Vector3(...driver.position), strength: 0.6 + 0.1 * this.opts.heft });
        }
        if (this.hopPhase >= 1) {
          this.hopPhase -= 1;
          if (!wantHop) {
            this.hopping = false;
            this.hopPhase = 0;
          }
        }
      }
      const p = this.hopping ? this.hopPhase : 0;
      const hopHeight = 0.32 * H * (1.25 - 0.08 * this.opts.heft);
      if (p < 0.2) {
        sy *= 1 - 0.22 * smooth(p / 0.2);
      } else if (p < 0.3) {
        const u = (p - 0.2) / 0.1;
        sy *= 0.78 + 0.42 * smooth(u);
        lift = hopHeight * 0.15 * u;
      } else if (p < 0.84) {
        const u = (p - 0.3) / 0.54;
        lift = Math.max(0, hopHeight * 4 * u * (1 - u) + hopHeight * 0.15 * (1 - u));
        sy *= 1.2 - 0.2 * smooth(Math.min(1, u * 2));
        pitch += 0.22 * Math.sin(Math.PI * u) - 0.1 * u;
      } else {
        const u = (p - 0.84) / 0.16;
        sy *= 1 - 0.26 * Math.sin(Math.PI * u);
      }
      if (!this.hopping) sy *= 1 + 0.015 * Math.sin(t * 1.6 * tempo);
    } else if (plan === "FLIER") {
      lift = 0.3 * H + 0.05 * H * Math.sin(t * 2.3 * tempo + this.opts.seed);
      roll *= 2;
      pitch = clamp(speed / Math.max(H * 2, 0.3), 0, 1) * 0.28;
    }

    // --- Root transform --------------------------------------------------
    // flat: position and facing only (feet homes); root: plus lift, bob, tilt, squash.
    const sxz = 1 / Math.sqrt(Math.max(sy, 0.4));
    const pos = tmpV3.set(driver.position[0], driver.position[1], driver.position[2]);
    tmpQ.setFromAxisAngle(Y, driver.yaw);
    this.flat.compose(pos, tmpQ, tmpS.set(1, 1, 1));

    // Legged stepping (needs the flat transform; produces bob).
    if (walker) bob = this.stepFeet(dt, vel, events);

    const tilt = tmpQ2.setFromAxisAngle(X, pitch);
    tmpQ.multiply(tilt);
    tilt.setFromAxisAngle(Z, roll);
    tmpQ.multiply(tilt);
    const rootPos = tmpV2.copy(pos);
    rootPos.y += lift + bob;
    this.root.compose(rootPos, tmpQ, tmpS.set(sxz * this.rootScale, sy * this.rootScale, sxz * this.rootScale));
    // Growth offset in creature space.
    this.root.multiply(tmpM.makeTranslation(this.rootOffset.x, this.rootOffset.y, this.rootOffset.z));
    this.rootInv.copy(this.root).invert();
    if (!this.initialized) this.initialized = true;

    // --- Local rotations -------------------------------------------------
    this.solve(dt, driver, events, tempo);

    // --- Face --------------------------------------------------------------
    this.updateFace(dt, driver);
    return events;
  }

  /** Gait planner: feet planted in parent space, stepping in groups. Returns the body bob. */
  private stepFeet(dt: number, vel: Vector3, events: AnimEvent[]): number {
    const rig = this.rig;
    const H = rig.height;
    const tempo = this.tempo;
    const speed = this.speed;
    if (!this.footsInitialized) {
      rig.legs.forEach((leg, i) => {
        const foot = this.feet[i]!;
        foot.plant.copy(leg.home).applyMatrix4(this.flat);
        foot.current.copy(foot.plant);
        foot.from.copy(foot.plant);
        foot.stepping = false;
        foot.t = 1;
      });
      this.footsInitialized = true;
    }
    let bob = 0;
    const anyStepping = this.feet.some((f) => f.stepping);
    const legLen = rig.legs.reduce((m, leg) => Math.max(m, leg.reach), 0);
    const baseDuration = clamp(0.15 + 0.45 * legLen, 0.13, 0.4) / tempo;
    const stride = clamp(0.45 * legLen + 0.07 * H, 0.04, 0.5);
    const duration = speed > 1e-3 ? Math.min(baseDuration, (0.85 * stride) / speed + 0.06) : baseDuration;
    const predicted = (i: number, out: Vector3) =>
      out.copy(rig.legs[i]!.home).applyMatrix4(this.flat).addScaledVector(vel, duration * 0.55);

    if (!anyStepping) {
      const err = [0, 0];
      const errs: number[] = [];
      rig.legs.forEach((leg, i) => {
        predicted(i, tmpV);
        const e = Math.hypot(this.feet[i]!.plant.x - tmpV.x, this.feet[i]!.plant.z - tmpV.z);
        errs.push(e);
        err[leg.group] = Math.max(err[leg.group]!, e);
      });
      const threshold = speed < 0.03 * H ? stride * 0.3 : stride;
      const group = err[0]! >= err[1]! ? 0 : 1;
      if (err[group]! > threshold) {
        rig.legs.forEach((leg, i) => {
          if (leg.group !== group || errs[i]! < threshold * 0.25) return;
          const foot = this.feet[i]!;
          foot.stepping = true;
          foot.t = 0;
          foot.duration = duration;
          foot.from.copy(foot.plant);
        });
      }
    }
    rig.legs.forEach((leg, i) => {
      const foot = this.feet[i]!;
      if (!foot.stepping) {
        foot.current.copy(foot.plant);
        return;
      }
      foot.t = Math.min(1, foot.t + dt / foot.duration);
      predicted(i, tmpV);
      const e = smooth(foot.t);
      foot.current.lerpVectors(foot.from, tmpV, e);
      const liftHeight = clamp(0.35 * leg.reach + 0.03 * H, 0.02, 0.25);
      foot.current.y += liftHeight * Math.sin(Math.PI * foot.t);
      bob = Math.max(bob, 0.035 * H * Math.min(1, speed / Math.max(0.4 * H, 0.1)) * Math.sin(Math.PI * foot.t));
      if (foot.t >= 1) {
        foot.stepping = false;
        foot.plant.copy(tmpV);
        foot.current.copy(foot.plant);
        events.push({ kind: "footstep", position: foot.plant.clone(), strength: 0.4 + 0.12 * this.opts.heft });
      }
    });
    return bob;
  }

  private strikeBone(driver: CreatureDriver): number {
    const rig = this.rig;
    const move = driver.anim?.move;
    if (move === null || move === undefined) return -1;
    const delivery = this.opts.deliveries?.[move] ?? "body";
    switch (delivery) {
      case "arm":
        return rig.arms.length ? rig.arms[move % rig.arms.length]! : rig.head;
      case "item": {
        if (rig.item >= 0) {
          let current = rig.item;
          while (current >= 0 && !rig.arms.includes(current)) current = rig.bones[current]!.parent;
          if (current >= 0) return current;
        }
        return rig.arms[0] ?? rig.head;
      }
      case "leg":
        return rig.legs[0]?.root ?? -1;
      case "head":
        return rig.head;
      case "tail": {
        const tail = rig.bones.find((b) => b.role === "tail" && b.parent === rig.torso);
        return tail ? tail.index : -1;
      }
      default:
        return -1;
    }
  }

  private solve(dt: number, driver: CreatureDriver, events: AnimEvent[], tempo: number) {
    const rig = this.rig;
    const bones = rig.bones;
    const H = rig.height;
    const t = this.time;
    const seed = this.opts.seed;
    const speed = this.speed;
    const walkFactor = clamp(speed / Math.max(0.5 * H, 0.1), 0, 1);
    const anim = driver.anim ?? null;
    const gait = this.distance / Math.max(0.6 * H, 0.1);

    // Strike state.
    const strike = this.strikeBone(driver);
    const phase = anim?.movePhase ?? null;
    const progress = clamp(anim?.progress ?? 0, 0, 1);
    let strikeAim: Vector3 | null = null;
    if (strike >= 0 && phase && anim?.reachTarget) {
      strikeAim = new Vector3(anim.reachTarget[0], anim.reachTarget[1], anim.reachTarget[2]).applyMatrix4(this.rootInv);
    }

    // Slither phase and flap phase.
    if (rig.plan === "SLITHER") this.slitherPhase += dt * (0.5 + speed / Math.max(0.3 * H, 0.08)) * tempo;
    if (rig.wings.length && rig.plan === "FLIER") {
      const f = clamp(3 / Math.sqrt(Math.max(H, 0.3)), 1.6, 6) * (1 + 0.4 * walkFactor) * tempo * 0.8;
      const before = this.flapPhase;
      this.flapPhase += dt * f;
      if (Math.floor(before) !== Math.floor(this.flapPhase)) events.push({ kind: "flap" });
    }

    const legIndex = new Map(rig.legs.map((leg, i) => [leg.root, i]));
    const legBehaviour = rig.plan !== "FLIER" && rig.plan !== "HOPPER";

    for (let i = 0; i < bones.length; i += 1) {
      const bone = bones[i]!;
      const q = this.localRot[i]!.identity();
      let s = 1;
      const parentRot = bone.parent >= 0 ? this.worldRot[bone.parent]! : null;
      const parentLocal = bone.parent >= 0 ? this.local[bone.parent]! : null;
      let worldSet = false;

      // Legs: IK toward the planted foot (ball feet just slide and lift).
      const li = legIndex.get(i);
      let footShift: Vector3 | null = null;
      if (li !== undefined && legBehaviour && parentLocal) {
        const foot = this.feet[li]!;
        const target = tmpV.copy(foot.current).applyMatrix4(this.rootInv);
        const hip = tmpV2.copy(bone.head).applyMatrix4(parentLocal);
        if (bone.length < 0.5 * bone.radius) {
          footShift = new Vector3().subVectors(target, tmpV3.copy(bone.tail).applyMatrix4(parentLocal));
          footShift.clampLength(0, 1.2 * bone.radius + 0.1 * this.rig.height);
        }
        const v = target.sub(hip);
        const len = v.length();
        if (!footShift && len > 1e-5) {
          s = clamp(len / Math.max(bone.length, 1e-4), 0.55, 1.5);
          this.worldRot[i]!.setFromUnitVectors(bone.dir, v.divideScalar(len));
          q.copy(parentRot!).invert().multiply(this.worldRot[i]!);
          worldSet = true;
        }
      }

      // Slither spine.
      const spineAt = rig.spine.indexOf(i);
      if (spineAt >= 0) {
        const amp = 0.08 + 0.3 * walkFactor;
        q.setFromAxisAngle(Y, amp * Math.sin(2 * Math.PI * this.slitherPhase - spineAt * 1.15));
      }
      if (i === rig.head && rig.plan === "SLITHER" && rig.spine.length > 1) {
        const amp = 0.08 + 0.3 * walkFactor;
        q.setFromAxisAngle(Y, -0.85 * amp * Math.sin(2 * Math.PI * this.slitherPhase));
      }

      // Arms: idle sway plus gait swing.
      if (bone.role === "arm" && rig.arms.includes(i)) {
        const ph = seed * 1.7 + i * 2.3;
        const swing = 0.11 * Math.sin(t * 1.2 * tempo + ph) + 0.5 * walkFactor * Math.sin(Math.PI * gait + (bone.side > 0 ? 0 : Math.PI));
        const out = bone.side * (0.06 * Math.sin(t * 0.8 * tempo + ph * 1.3) + 0.04);
        q.setFromAxisAngle(X, -swing);
        tmpQ.setFromAxisAngle(Z, out);
        q.multiply(tmpQ);
      }

      // Wings: flap (fliers) or a lazy flutter.
      if (bone.role === "wing" && rig.wings.includes(i)) {
        if (rig.plan === "FLIER") {
          // A V-shaped (dihedral) beat reads from the front as well as from above.
          const a = 0.55 * Math.sin(2 * Math.PI * this.flapPhase) + 0.3;
          q.setFromAxisAngle(Z, bone.side * a);
        } else {
          q.setFromAxisAngle(Z, bone.side * 0.05 * Math.sin(t * 2.5 * tempo + i));
        }
      }

      // Secondary: spring lag on the attachment point's acceleration.
      const spring = this.springs.get(bone.id);
      if (spring && bone.parent >= 0) {
        this.applySpring(i, spring, dt, tempo, q);
      }

      // Tails wag a little even at rest; heads look around.
      if (bone.role === "tail" && bone.parent === rig.torso && spineAt < 0) {
        tmpQ.setFromAxisAngle(Y, 0.22 * Math.sin(t * 2.6 * tempo + seed) * (1 + walkFactor));
        q.premultiply(tmpQ);
      }
      if (i === rig.head && rig.plan !== "SLITHER") {
        tmpQ.setFromAxisAngle(Y, 0.12 * Math.sin(t * 0.45 * tempo + seed * 3.1) + 0.05 * Math.sin(t * 1.3 + seed));
        q.multiply(tmpQ);
        tmpQ.setFromAxisAngle(X, 0.05 * Math.sin(t * 0.7 * tempo + seed));
        q.multiply(tmpQ);
      }

      // Strike: wind up, reach with stretch, recover.
      if (i === strike && phase) {
        if (phase === "windup") {
          tmpQ.setFromAxisAngle(X, 0.7 * smooth(progress));
          q.multiply(tmpQ);
          s *= 1 - 0.12 * progress;
        } else if (strikeAim && parentLocal) {
          const joint = tmpV.copy(bone.head).applyMatrix4(parentLocal);
          const toTarget = tmpV2.subVectors(strikeAim, joint);
          const dist = toTarget.length();
          if (dist > 1e-4) {
            const weight = phase === "recover" ? 1 - smooth(progress) : phase === "active" ? smooth(Math.min(1, progress * 2)) : 1;
            tmpQ.setFromUnitVectors(bone.dir, toTarget.divideScalar(dist));
            const desiredLocal = tmpQ2.copy(parentRot!).invert().multiply(tmpQ);
            q.slerp(desiredLocal, weight);
            const reach = Math.max(bone.length, bone.radius * 2);
            s *= 1 + (clamp(dist / reach, 1, 1.7) - 1) * weight;
          }
        }
      }

      // Growth pop: uniform scale about the joint.
      const pop = this.pops.get(bone.id);
      const u = pop ? Math.max(0.001, pop.u) : 1;

      if (!worldSet) {
        if (parentRot) this.worldRot[i]!.copy(parentRot).multiply(q);
        else this.worldRot[i]!.copy(q);
      }
      this.stretch[i] = s;

      // local = parentLocal * T(head) * R(q) * S_axis(s) * U(u) * T(-head)
      const m = this.local[i]!;
      if (parentLocal) m.copy(parentLocal);
      else m.identity();
      m.multiply(tmpM.makeTranslation(bone.head.x, bone.head.y, bone.head.z));
      m.multiply(tmpM.makeRotationFromQuaternion(q));
      if (s !== 1) m.multiply(axisScale(tmpM, bone.dir, s));
      if (u !== 1) m.multiply(tmpM.makeScale(u, u, u));
      m.multiply(tmpM.makeTranslation(-bone.head.x, -bone.head.y, -bone.head.z));
      if (footShift) m.premultiply(tmpM.makeTranslation(footShift.x, footShift.y, footShift.z));
      this.matrices[i]!.multiplyMatrices(this.root, m);
    }

    // Ragdoll: blend toward the proxy bodies.
    const ragdoll = clamp(anim?.ragdoll ?? 0, 0, 1);
    if (ragdoll > 0 && driver.pose && driver.pose.bodies.length) {
      this.blendProxies(driver.pose, ragdoll);
    }
  }

  private applySpring(i: number, spring: Spring, dt: number, tempo: number, q: Quaternion) {
    const bone = this.rig.bones[i]!;
    const parentM = this.matrices[bone.parent]!;
    // Attachment point in parent space this frame (from the parent's final matrix).
    const p = tmpV.copy(bone.head).applyMatrix4(parentM);
    if (!spring.init) {
      spring.prev.copy(p);
      spring.prev2.copy(p);
      spring.init = true;
    }
    // Finite-difference acceleration of the attachment point.
    const acc = tmpV2.copy(p).sub(spring.prev).sub(tmpV3.subVectors(spring.prev, spring.prev2)).divideScalar(dt * dt);
    spring.prev2.copy(spring.prev);
    spring.prev.copy(p);
    // Into creature space (rotation only).
    acc.applyQuaternion(tmpQ2.setFromRotationMatrix(this.root).invert());
    acc.clampLength(0, 60);
    const len = Math.max(bone.length, bone.radius * 1.5);
    const freq = clamp(1.6 / Math.sqrt(Math.max(len, 0.03)), 1.8, 7) * tempo;
    const k = (2 * Math.PI * freq) ** 2;
    const c = 2 * 0.28 * Math.sqrt(k);
    const gain = bone.role === "item" ? 0.25 : bone.role === "leg" ? 0.9 : 0.6;
    // Dangling legs also feel gravity along their rest direction (they hang).
    spring.v.addScaledVector(spring.o, -k * dt);
    spring.v.addScaledVector(spring.v, -c * dt);
    spring.v.addScaledVector(acc, -gain * len * dt);
    spring.o.addScaledVector(spring.v, dt);
    // Keep the offset perpendicular to the bone and bounded.
    spring.o.addScaledVector(bone.dir, -spring.o.dot(bone.dir));
    spring.o.clampLength(0, 0.6 * len);
    const bent = tmpV3.copy(bone.dir).multiplyScalar(len).add(spring.o).normalize();
    tmpQ.setFromUnitVectors(bone.dir, bent);
    q.premultiply(tmpQ);
  }

  private blendProxies(pose: DriverPose, weight: number) {
    const rig = this.rig;
    const byKey = new Map<string, { p: readonly number[]; q: readonly number[] }>();
    for (const body of pose.bodies) byKey.set(body.key, body);
    const procPos = new Vector3();
    const procQuat = new Quaternion();
    const procScale = new Vector3();
    const proxQuat = new Quaternion();
    for (let i = 0; i < rig.bones.length; i += 1) {
      // The bone's own body, or the nearest ancestor's (welded parts ride along).
      let owner = i;
      let body = byKey.get(rig.bones[i]!.id);
      while (!body && rig.bones[owner]!.parent >= 0) {
        owner = rig.bones[owner]!.parent;
        body = byKey.get(rig.bones[owner]!.id);
      }
      if (!body) continue;
      const ownerHead = rig.bones[owner]!.head;
      proxQuat.set(body.q[0]!, body.q[1]!, body.q[2]!, body.q[3]!);
      // Proxy: v -> p + q (v - head_owner).
      tmpM2.compose(tmpV.set(body.p[0]!, body.p[1]!, body.p[2]!), proxQuat, tmpS.set(1, 1, 1));
      tmpM2.multiply(tmpM.makeTranslation(-ownerHead.x, -ownerHead.y, -ownerHead.z));
      const m = this.matrices[i]!;
      if (weight >= 0.999) {
        m.copy(tmpM2);
        continue;
      }
      m.decompose(procPos, procQuat, procScale);
      const head = rig.bones[i]!.head;
      const a = tmpV.copy(head).applyMatrix4(m);
      const b = tmpV2.copy(head).applyMatrix4(tmpM2);
      a.lerp(b, weight);
      procQuat.slerp(proxQuat, weight);
      procScale.lerp(tmpV3.set(1, 1, 1), weight);
      m.compose(new Vector3(), procQuat, procScale);
      // Place the head at the blended position.
      const placed = tmpV3.copy(head).applyMatrix4(m);
      m.setPosition(a.x - placed.x, a.y - placed.y, a.z - placed.z);
    }
  }

  private updateFace(dt: number, driver: CreatureDriver) {
    const anim = driver.anim ?? null;
    let expression: Expression = "neutral";
    const intent = anim?.intent;
    if (anim?.movePhase === "windup") expression = "squint";
    if (intent === "stagger" || (anim?.ragdoll ?? 0) > 0.5) expression = "wide";
    if (intent === "getup") expression = "annoyed";
    if (intent === "showboat") expression = "smug";
    if (intent === "ko" || intent === "out") expression = "closed";
    if (driver.expression) expression = driver.expression;
    this.expression = expression;

    // Blinks every few seconds (faster when small).
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.nextBlink = (1.8 + this.random() * 3.4) / Math.sqrt(this.tempo);
      if (this.random() < 0.18) this.nextBlink = 0.25; // a double blink now and then
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const d = 0.14;
      this.blink = this.blinkT < d ? Math.sin((Math.PI * this.blinkT) / d) : 0;
      if (this.blinkT >= d) this.blinkT = -1;
    } else {
      this.blink = 0;
    }
    if (expression === "blink") this.blink = 1;
  }
}

/** Fill a driver from a moving position (velocity by finite difference). */
export function setDriverFromMotion(
  driver: CreatureDriver,
  position: Vector3,
  previous: Vector3,
  dt: number,
  yaw?: number,
) {
  driver.position[0] = position.x;
  driver.position[1] = position.y;
  driver.position[2] = position.z;
  const inv = dt > 0 ? 1 / dt : 0;
  driver.velocity[0] = (position.x - previous.x) * inv;
  driver.velocity[1] = (position.y - previous.y) * inv;
  driver.velocity[2] = (position.z - previous.z) * inv;
  if (yaw !== undefined) driver.yaw = yaw;
}
