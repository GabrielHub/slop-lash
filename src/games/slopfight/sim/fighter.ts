// Internal fighter state and construction. The fight owns transitions; motion
// owns the servos. Neither has to know how a champion becomes Rapier bodies.
import type { ImpulseJoint, RigidBody, World } from "@dimforge/rapier3d-deterministic-compat";
import type { Arena, CounterCrackHazard, WaterLandingHazard } from "../arenas";
import type { FighterModifiers, Side } from "../modifiers";
import { FINISH_EFFECTS, partFinish } from "../finishes";
import { championHash, maxHealth, type Champion, type Delivery } from "../sheet";
import type { Finish, MoveType } from "../vocab";
import {
  brainProfile,
  createBrainState,
  type BrainIntent,
  type BrainMove,
  type BrainProfile,
  type BrainState,
} from "./brain";
import { clamp, HALF_PI } from "./dmath";
import { rngStream, type Rng } from "./prng";
import { buildProxyDef, chainOf, layoutOf, type ProxyDef } from "./proxy";
import type { Rapier } from "./rapier";
import * as K from "./tuning";
import type { FighterLayout, MovePhase } from "./types";
import {
  qFromTo,
  qRotate,
  qYaw,
  vAdd,
  vec,
  vLen,
  vNorm,
  vScale,
  vSub,
  type Q4,
  type V3,
} from "./vec";

export interface BodyState {
  p: V3;
  q: Q4;
  v: V3;
  w: V3;
  c: V3;
}

export interface WorldShape {
  body: number;
  a: V3;
  b: V3;
  r: number;
  /** What the shape's part is made of. */
  finish: Finish;
}

export type Mode = "ready" | "move" | "showboat" | "stagger" | "getup" | "held" | "ko" | "out";

interface MoveRun {
  index: number;
  type: MoveType;
  effPower: number;
  phase: MovePhase;
  t: number;
  dur: number;
  /** Chain root body index (0 = the torso). */
  root: number;
  /** What the deliverer is made of: the root body's part, or the item for item moves. */
  finish: Finish;
  chain: number[];
  resolved: boolean;
  peakRel: number;
  aim: V3;
  dodgeDir: 1 | -1;
  /** A limb behind the torso (a tail): the fighter turns its back to swing it. */
  rear: boolean;
  counterArmed: boolean;
  joint: ImpulseJoint | null;
  victimInRecovery: boolean;
  airborneSeen: boolean;
  /** A Chaos fumble: the swing or grab flails well off target and cannot connect. */
  wild: boolean;
  landed: boolean;
}

export interface Fighter {
  side: Side;
  champion: Champion;
  mods: FighterModifiers;
  def: ProxyDef;
  layout: FighterLayout;
  profile: BrainProfile;
  brain: BrainState;
  rng: Rng;
  moves: BrainMove[];
  itemRoot: number;
  /** What the held item is made of (null without one). */
  itemFinish: Finish | null;
  /** Bodies a body-delivered move hits or grabs with: the torso plus the head chain. */
  coreChain: number[];
  bodies: RigidBody[];
  st: BodyState[];
  shapes: WorldShape[];
  /** Horizontal distance from this torso's centre to the foe's nearest surface. */
  reachGap: number;
  restComY: number;
  health: number;
  maxHealth: number;
  mode: Mode;
  modeT: number;
  modeDur: number;
  strength: number;
  limbStrength: number;
  move: MoveRun | null;
  cooldowns: number[];
  facing: number;
  intent: BrainIntent;
  intentT: number;
  vDes: [number, number];
  gait: number;
  wag: number;
  flap: number;
  vmax: number;
  speedMul: number;
  turnRate: number;
  supported: boolean;
  airborne: boolean;
  grounded: boolean;
  onEdge: boolean;
  edgeDist: number;
  edgeMs: number;
  edgeArmed: boolean;
  prevVy: number;
  hopRecover: number;
  hopLaunch: V3 | null;
  wasAirborneHop: boolean;
  beenHit: boolean;
  showboatPending: boolean;
  limbToggle: number;
  heldBy: Fighter | null;
  holding: Fighter | null;
  impulses: Array<{ j: V3 }>;
  /** A velocity every body takes this step (throws). */
  launch: V3 | null;
  hazards: { wind: boolean; water: WaterLandingHazard | null; crack: CounterCrackHazard | null };
  gravityScale: number;
  hitsLanded: number;
  /** After a get-up, grabs can't land for a moment (no throw loops). */
  wakeMs: number;
  /** Floor drag is off while this runs (just launched or knocked back). */
  dragGraceMs: number;
}

export const ARENA_GROUP = 0x0001;
export const SIDE_GROUP: Record<Side, number> = { A: 0x0002, B: 0x0004 };
export const groups = (membership: number, filter: number) => ((membership << 16) | filter) >>> 0;
const other = (side: Side): Side => (side === "A" ? "B" : "A");
export function effPowerOf(power: number, type: MoveType, mods: FighterModifiers): number {
  const add =
    type === "STRIKE" ? mods.strikePower : type === "GRAPPLE" ? mods.grapplePower : mods.trickPower;
  // Trait and note bonuses stack, so power past the soft cap counts for less.
  const raw = power + add;
  const soft =
    raw > K.POWER_SOFT_CAP ? K.POWER_SOFT_CAP + (raw - K.POWER_SOFT_CAP) * K.POWER_OVER_CAP : raw;
  return clamp(soft, 0.5, 7);
}

/**
 * The limb chain that holds the item (0 when it is welded to the torso, -1 without one)
 * and what the item is made of.
 */
function itemOf(def: ProxyDef, champion: Champion): { root: number; finish: Finish | null } {
  for (const part of champion.parts) {
    if (part.role !== "item") continue;
    for (const bone of [part.id, `${part.id}~m`]) {
      const index = def.boneBody.get(bone);
      if (index !== undefined)
        return { root: index === 0 ? 0 : def.bodies[index]!.chainRoot, finish: partFinish(part) };
    }
  }
  return { root: -1, finish: null };
}

/**
 * What a move's deliverer is made of: the item for an item move that has one, else the
 * chain root's own part (the torso for body moves; a body slam's contact refines that).
 */
export function delivererFinish(f: Fighter, root: number, delivery: Delivery): Finish {
  if (delivery === "item" && f.itemFinish !== null && root === f.itemRoot) return f.itemFinish;
  return f.def.bodies[root]!.finishes[0]!;
}

/** Chain root for a move's delivery, with fallbacks to what the body actually has. */
export function delivererOf(
  def: ProxyDef,
  delivery: Delivery,
  toggle: number,
  itemRoot: number,
): number {
  const roots = (role: string) =>
    def.bodies
      .map((body, index) => ({ body, index }))
      .filter(({ body, index }) => index > 0 && body.chainRoot === index && body.role === role);
  const pick = (list: { index: number }[]) =>
    list.length ? list[toggle % list.length]!.index : -1;
  const arms = roots("arm");
  const legs = roots("leg")
    .sort((x, y) => y.body.head[2] - x.body.head[2] || x.index - y.index)
    .slice(0, 2);
  const headIndex = def.bodies.findIndex((body, index) => index > 0 && body.role === "head");
  const head = headIndex > 0 ? def.bodies[headIndex]!.chainRoot : -1;
  const order: Record<Delivery, number[]> = {
    arm: [pick(arms), itemRoot, head, 0],
    item: [itemRoot, pick(arms), head, 0],
    leg: [pick(legs), 0],
    head: [head, 0],
    tail: [pick(roots("tail")), 0],
    body: [0],
  };
  return order[delivery].find((index) => index >= 0) ?? 0;
}

/** How far forward (or, for a rear limb, backward) a limb chain reaches from the torso centre. */
export function limbReach(def: ProxyDef, root: number): { reach: number; rear: boolean } {
  const chain = chainOf(def, root);
  const base = def.bodies[root]!.head;
  let farthest = 0;
  let tipZ = Number.NEGATIVE_INFINITY;
  for (const index of chain) {
    const body = def.bodies[index]!;
    const end = vAdd(body.head, body.tip);
    farthest = Math.max(farthest, vLen(vSub(end, base)) + body.radius);
    tipZ = Math.max(tipZ, end[2] + body.radius);
  }
  // Creature space faces +Z. A limb rooted behind the centre that never reaches forward is a rear limb.
  const baseZ = base[2] - def.torsoCom[2];
  const rear = baseZ < -0.04 && tipZ - def.torsoCom[2] < 0.02;
  return { reach: (rear ? -baseZ : Math.max(0, baseZ)) + farthest * 0.92, rear };
}

/** How far the torso's own surface reaches forward of its centre of mass, at rest. */
function torsoFront(def: ProxyDef): number {
  const torso = def.bodies[0]!;
  let front = torso.radius;
  for (const shape of torso.shapes) {
    const points = shape.kind === "ball" ? [shape.center] : [shape.a, shape.b];
    for (const point of points)
      front = Math.max(front, torso.head[2] + point[2] + shape.radius - def.torsoCom[2]);
  }
  return front;
}

/** The bodies a move connects with: the limb chain, plus the core for body moves and for limbs too short to clear the torso. */
export function moveChain(
  def: ProxyDef,
  root: number,
  type: MoveType,
  coreChain: number[],
): number[] {
  if (root === 0) return coreChain;
  const chain = chainOf(def, root);
  if (type === "TRICK") return chain;
  const { reach, rear } = limbReach(def, root);
  // A limb that barely clears the torso (a ghost's stubby arm, a cat's paw) can't touch anything
  // the body isn't already touching, so the lunge carries the body into the blow.
  return !rear && reach < torsoFront(def) + K.BURIED_LIMB ? [...coreChain, ...chain] : chain;
}

/** Reach-gap (see Fighter.reachGap) at which a move can start. */
function moveRange(def: ProxyDef, root: number, effReach: number, type: MoveType): number {
  const lunge = K.LUNGE_REACH + K.LUNGE_REACH_PER_REACH * effReach;
  if (type === "GRAPPLE") return def.footprint + K.GRAB_START_RANGE + 0.06 * effReach;
  if (root === 0) return def.footprint + lunge + K.HIT_MARGIN;
  const { reach } = limbReach(def, root);
  return (
    Math.max(def.footprint * 0.6, reach) + lunge + K.HIT_MARGIN + K.HIT_MARGIN_PER_REACH * effReach
  );
}

export function createFighter(
  R: Rapier,
  world: World,
  side: Side,
  champion: Champion,
  mods: FighterModifiers,
  foe: Champion,
  foeMods: FighterModifiers,
  arena: Arena,
  seed: number,
): Fighter {
  const geometry = arena.geometry;
  const def = buildProxyDef(champion);
  const item = itemOf(def, champion);
  const itemRoot = item.root;
  const yaw = side === "A" ? HALF_PI : -HALF_PI;
  const q = qYaw(yaw);
  const spawn = geometry.spawns[side];
  const plan = champion.bodyPlan;
  const lift =
    plan === "FLIER"
      ? K.FLIER_HOVER
      : plan === "HOPPER" || plan === "SLITHER"
        ? 0.004
        : K.STANCE_CLEARANCE;
  const membership = SIDE_GROUP[side];
  const filter = ARENA_GROUP | SIDE_GROUP[other(side)];
  const friction = plan === "SLITHER" ? K.SLITHER_FRICTION : K.FIGHTER_FRICTION;

  const bodies: RigidBody[] = [];
  for (const [index, body] of def.bodies.entries()) {
    const origin = vAdd(spawn as V3, qRotate(q, [body.head[0], body.head[1] + lift, body.head[2]]));
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(origin[0], origin[1], origin[2])
      .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
      .setLinearDamping(K.LINEAR_DAMPING)
      .setAngularDamping(K.ANGULAR_DAMPING)
      .setCanSleep(false)
      .setCcdEnabled(index === 0);
    const rigid = world.createRigidBody(desc);
    body.shapes.forEach((shape, shapeIndex) => {
      let collider;
      if (shape.kind === "ball") {
        collider = R.ColliderDesc.ball(shape.radius).setTranslation(
          shape.center[0],
          shape.center[1],
          shape.center[2],
        );
      } else {
        const axis = vSub(shape.b, shape.a);
        const half = vLen(axis) / 2;
        const mid = vScale(vAdd(shape.a, shape.b), 0.5);
        const rot = qFromTo([0, 1, 0], vNorm(axis));
        collider = R.ColliderDesc.capsule(half, shape.radius)
          .setTranslation(mid[0], mid[1], mid[2])
          .setRotation({ x: rot[0], y: rot[1], z: rot[2], w: rot[3] });
      }
      collider
        .setMass(Math.max(body.shapeMass[shapeIndex]!, 0.01))
        .setFriction(friction)
        .setRestitution(K.FIGHTER_RESTITUTION)
        .setCollisionGroups(groups(membership, filter));
      world.createCollider(collider, rigid);
    });
    bodies.push(rigid);
  }
  for (const [index, body] of def.bodies.entries()) {
    if (index === 0) continue;
    const parent = def.bodies[body.parent]!;
    const data = R.JointData.spherical(vec(vSub(body.head, parent.head)), { x: 0, y: 0, z: 0 });
    const joint = world.createImpulseJoint(data, bodies[body.parent]!, bodies[index]!, true);
    joint.setContactsEnabled(false);
  }

  const effReach = clamp(champion.stats.reach + mods.reach, 0, 6);
  const moves: BrainMove[] = champion.moves.map((move) => {
    const root = delivererOf(def, move.delivery, 0, itemRoot);
    return {
      type: move.type,
      power: move.power,
      effPower: effPowerOf(move.power, move.type, mods),
      range: moveRange(def, root, effReach, move.type),
    };
  });
  // Slithers are low and slippery: grabbable, but brains like the odds less (and grabs slip).
  const grabAppeal = foeMods.grappleImmune
    ? 0
    : foe.bodyPlan === "SLITHER"
      ? K.SLITHER_GRAB_APPEAL
      : 1;
  const sizeFactor = clamp(Math.sqrt(1 / def.scale), 0.85, 1.2);
  // Heavy fighters are slow (spec): Heft trades speed for mass, health and stagger resistance.
  const heftFactor = 1 - K.HEFT_SLOW * (champion.stats.heft - 3);
  const speedMul = clamp(mods.speed * sizeFactor * heftFactor, K.SPEED_MIN, K.SPEED_MAX);
  const water = arena.dynamic.find((hazard) => hazard.id === "waterLanding");
  const crack = arena.dynamic.find((hazard) => hazard.id === "counterCrack");

  const headIndex = def.bodies.findIndex((body, index) => index > 0 && body.role === "head");
  const coreChain = headIndex > 0 ? [0, ...chainOf(def, def.bodies[headIndex]!.chainRoot)] : [0];

  const fighter: Fighter = {
    side,
    champion,
    mods,
    def,
    layout: layoutOf(def),
    profile: brainProfile(champion, mods, moves, grabAppeal),
    brain: createBrainState(),
    rng: rngStream(seed, `brain:${side}:${championHash(champion)}`),
    moves,
    itemRoot,
    itemFinish: item.finish,
    coreChain,
    bodies,
    st: [],
    shapes: [],
    restComY: 0,
    health: maxHealth(champion),
    maxHealth: maxHealth(champion),
    mode: "ready",
    modeT: 0,
    modeDur: 0,
    strength: 1,
    limbStrength: 1,
    move: null,
    cooldowns: [0, 0, 0],
    facing: yaw,
    intent: "approach",
    intentT: 0,
    vDes: [0, 0],
    gait: 0,
    wag: 0,
    flap: 0,
    vmax: K.BASE_SPEED * K.PLAN_SPEED[plan] * speedMul,
    speedMul,
    turnRate: K.PLAN_TURN[plan] * clamp(mods.speed, 0.7, 1.3),
    supported: true,
    airborne: false,
    grounded: true,
    onEdge: false,
    edgeDist: 3,
    edgeMs: 0,
    edgeArmed: true,
    prevVy: 0,
    hopRecover: 0,
    hopLaunch: null,
    wasAirborneHop: false,
    beenHit: false,
    showboatPending: false,
    limbToggle: 0,
    heldBy: null,
    holding: null,
    impulses: [],
    launch: null,
    hazards: {
      // pushImmune: "ignores non-hit pushes: wind gusts and body shoves".
      wind: mods.hazards.includes("wind") && !mods.pushImmune,
      water: water && mods.hazards.includes("waterLanding") ? water : null,
      crack: crack && mods.hazards.includes("counterCrack") ? crack : null,
    },
    gravityScale: 1,
    hitsLanded: 0,
    reachGap: 0,
    wakeMs: 0,
    dragGraceMs: 0,
  };
  fighter.restComY = bodies[0]!.worldCom().y;
  return fighter;
}

/** Long limbs swing slower: Reach costs time on a Strike's windup and recovery. */
export const reachTiming = (f: Fighter) => 1 + K.REACH_TIMING * (f.profile.effReach - 3);

/**
 * A Strike's windup before speed: power, Chaos jitter and Reach, then the deliverer's
 * finish (heavy ones swing slower, light ones quicker; exactly 1 for vinyl).
 */
export function strikeWindupMs(f: Fighter, effPower: number, jitter: number, finish: Finish): number {
  return (
    (K.STRIKE_WINDUP_MS + K.STRIKE_WINDUP_PER_POWER * effPower) *
    jitter *
    reachTiming(f) *
    FINISH_EFFECTS[finish].swing
  );
}

export const isActive = (f: Fighter) =>
  f.mode === "ready" || f.mode === "move" || f.mode === "showboat";
