// The fight: two active ragdolls in one deterministic Rapier world, driven by
// two brains. One fixed 1/60 s step does, in order: read body states, run the
// referee checks (ring-out, edges, contact, hard landings), advance timers and
// brains, resolve both fighters' moves against the same snapshot, apply the
// hits, drive the servos, apply hazards and impulses, then step the world.
// Everything is iterated in fixed order and every random draw comes from a
// named stream, so the same FightInput always produces the same fight.

import { stableHash } from "../../../lib/hash";
import {
  ARENAS,
  dryHalfAt,
  finaleFor,
  finaleStrengthAt,
  floodedGeometry,
  isOverFloor,
  isRingOut,
  platformColliders,
  ringOutDistance,
  stormWindAt,
  windFor,
  type Box,
  type Wind,
} from "../arenas";
import { BELL_HOLD_MS, SUDDEN_DEATH_MS } from "../constants";
import { resolveModifiers, type Side } from "../modifiers";
import { stableStringify } from "../sheet";
import type { Finish } from "../vocab";
import { think, thinkDelay, aggressionAt } from "./brain";
import {
  aimedDir,
  com,
  coreShapes,
  edgeGradient,
  flatDir,
  minGap,
  readState,
  type Gap,
  shapesOf,
  surfaceReach,
  vAtPoint,
} from "./collision";
import { clamp } from "./dmath";
import {
  ARENA_GROUP,
  SIDE_GROUP,
  groups,
  createFighter,
  delivererFinish,
  delivererOf,
  effPowerOf,
  isActive,
  limbReach,
  moveChain,
  reachTiming,
  strikeWindupMs,
  type Fighter,
  type Mode,
} from "./fighter";
import { brainSituation, fighterLive, fighterPose } from "./fighter-view";
import { moveHit, throwHit, type HitRecord } from "./hits";
import { createMotion, type ArenaField } from "./motion";
import { rngStream } from "./prng";
import type { Rapier } from "./rapier";
import * as K from "./tuning";
import type {
  FightEvent,
  FightInput,
  FightMethod,
  FightOutcome,
  FightSim,
  MovePhase,
  StaggerCause,
} from "./types";
import { hLen, point3, qConj, qRotate, vAdd, vec, vLen, vScale, vSub, type V3 } from "./vec";

const round2 = (value: number) => Math.round(value * 100) / 100;

export function createFight(R: Rapier, input: FightInput): FightSim {
  const arena = ARENAS[input.arena] as (typeof ARENAS)[keyof typeof ARENAS] | undefined;
  if (!arena)
    throw new Error(
      `createFight: unknown arena ${JSON.stringify(input.arena)} (expected ${Object.keys(ARENAS).join(", ")})`,
    );
  const geometry = arena.geometry;
  const seed = input.seed >>> 0;
  const resolved = resolveModifiers(input.a, input.b, input.arena, input.notes);
  const world = new R.World({ x: 0, y: -K.GRAVITY, z: 0 });
  world.timestep = K.DT;
  world.numSolverIterations = K.SOLVER_ITERATIONS;
  world.integrationParameters.numInternalPgsIterations = K.PGS_ITERATIONS;

  /** The platform slab's tiles: the flood shrinks them to the dry floor. */
  const slabs: Array<{ box: Box; collider: ReturnType<typeof world.createCollider> }> = [];
  for (const box of platformColliders(geometry)) {
    const hx = (box.max[0] - box.min[0]) / 2;
    const hy = (box.max[1] - box.min[1]) / 2;
    const hz = (box.max[2] - box.min[2]) / 2;
    const collider = world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(box.min[0] + hx, box.min[1] + hy, box.min[2] + hz)
        .setFriction(K.ARENA_FRICTION)
        .setCollisionGroups(groups(ARENA_GROUP, SIDE_GROUP.A | SIDE_GROUP.B)),
    );
    if (box.max[1] === geometry.topY && box.min[1] === geometry.topY - geometry.thickness) {
      slabs.push({ box, collider });
    }
  }

  const A = createFighter(R, world, "A", input.a, resolved.A, input.b, resolved.B, arena, seed);
  const B = createFighter(R, world, "B", input.b, resolved.B, input.a, resolved.A, arena, seed);
  const fighters: [Fighter, Fighter] = [A, B];
  const foeOf = (f: Fighter) => (f === A ? B : A);
  const referee = rngStream(seed, "referee");
  const wind: Wind | null = arena.dynamic.some((hazard) => hazard.id === "wind")
    ? windFor(seed)
    : null;
  const finale = finaleFor(input.arena, seed, input.limitMs);
  const storm = finale.spec.id === "storm" ? finale.spec : null;
  const flood = finale.spec.id === "flood" ? finale.spec : null;
  const tilt = finale.spec.id === "tilt" ? finale.spec : null;
  let finaleStarted = false;
  /** Finale strength this step, 0..1. */
  let finaleNow = 0;
  /** The arena as the fighters feel it this step; `updateField` moves it on. */
  const field: ArenaField = { geometry, wind: [0, 0], slope: [0, 0] };
  let dryHalf = geometry.halfSize;

  const motion = createMotion(field, input.limitMs);

  let stepIndex = 0;
  let tMs = 0;
  let done = false;
  /** A KO, decision or sudden death waiting on its winner to land (see `decide`). */
  let held: { winner: Side; method: FightMethod; untilMs: number } | null = null;
  let disposed = false;
  let suddenDeath = false;
  let outcome: FightOutcome | null = null;
  const events: FightEvent[] = [];
  let stepEvents: FightEvent[] = [];
  const timeline: Array<[number, number, number]> = [[0, A.health, B.health]];
  let touching = false;
  let apartMs = Number.POSITIVE_INFINITY;
  let hitsThisStep: HitRecord[] = [];

  /** Records an event; nothing is recorded once the fight is decided (the outro is physics only). */
  const emit = (event: FightEvent) => {
    if (done) return;
    events.push(event);
    stepEvents.push(event);
  };

  emit({ t: 0, kind: "start", side: null });

  // --- state reads ---------------------------------------------------------

  const centerDist = () => {
    const a = com(A);
    const b = com(B);
    return hLen(b[0] - a[0], b[2] - a[2]);
  };

  /** Exact surface gap between the fighters this step, computed at most once per step. */
  let gapStep = -1;
  let gapNow: Gap = { gap: 0, point: [0, 0, 0], body: -1, shapeA: null, shapeB: null };
  function exactGap() {
    if (gapStep !== stepIndex) {
      gapStep = stepIndex;
      gapNow = minGap(A.shapes, B.shapes);
    }
    return gapNow;
  }
  /** Surface gap between the two fighters (0 = touching); a cheap estimate when far apart. */
  function bodyGap(): number {
    const d = centerDist();
    return d > A.def.extent + B.def.extent + 0.5 ? d - A.def.extent - B.def.extent : exactGap().gap;
  }

  // --- referee checks ------------------------------------------------------

  function fellIn(f: Fighter): boolean {
    const c = com(f);
    const live = field.geometry;
    if (isRingOut(live, c)) return true;
    // In the flood, a torso over deep water is swept away whatever its legs still stand on (a hovering flier stays up).
    if (live !== geometry && !(f.def.bodyPlan === "FLIER" && isActive(f))) {
      const sweep = live.halfSize + K.FLOOD_SWEEP;
      if (Math.abs(c[0]) > sweep || Math.abs(c[2]) > sweep) return true;
    }
    const half = live.halfSize;
    const inPit =
      Math.abs(c[0]) <= half && Math.abs(c[2]) <= half && !isOverFloor(live, c[0], c[2]);
    return inPit && c[1] < live.topY - K.PIT_DROP;
  }

  function refereeChecks() {
    // Ring-outs (both checked against the same state).
    const outA = A.mode !== "out" && fellIn(A);
    const outB = B.mode !== "out" && fellIn(B);
    if (outA || outB) {
      for (const f of fighters) {
        if ((f === A && outA) || (f === B && outB)) {
          emit({ t: tMs, kind: "ringout", side: f.side, point: point3(com(f)) });
          releaseHolds(f);
          setMode(f, "out", 0);
        }
      }
      const winner: Side = outA && outB ? (referee.chance(0.5) ? "A" : "B") : outA ? "B" : "A";
      finish(winner, "RINGOUT");
      return;
    }

    for (const f of fighters) {
      const c = com(f);
      f.edgeDist = ringOutDistance(field.geometry, c[0], c[2]);
      f.onEdge = f.edgeDist < K.EDGE_WARN;
      if (f.edgeDist > K.EDGE_REARM) {
        f.edgeArmed = true;
        f.edgeMs = 0;
      } else if (f.onEdge) {
        f.edgeMs += K.STEP_MS;
        if (f.edgeArmed && f.edgeMs > K.EDGE_WARN_MS && f.mode !== "out") {
          f.edgeArmed = false;
          emit({ t: tMs, kind: "edge", side: f.side, point: point3(c) });
        }
      } else {
        f.edgeMs = 0;
      }

      // Support, grounded and airborne.
      const plan = f.def.bodyPlan;
      const overFloor = f.edgeDist > -(K.SUPPORT_MARGIN + f.def.footprint * 0.3);
      const height = c[1] - f.restComY;
      f.supported = overFloor && height > -0.45 && height < 0.55;
      f.grounded = overFloor && height < 0.05 && height > -0.45;
      const flying = plan === "FLIER" && isActive(f);
      f.airborne = !flying && (height > 0.28 || (!overFloor && height < -0.05));
      const vy = f.st[0]!.v[1];
      if (plan === "HOPPER") {
        f.grounded = f.grounded && vy < 0.6;
        f.airborne = !f.grounded && height > 0.03;
      }

      // Hard landings: a big downward speed suddenly stopped over the floor.
      if (f.hazards.crack && f.mode !== "out" && f.mode !== "ko") {
        const limit = f.hazards.crack.minImpactSpeed;
        if (f.prevVy <= -limit && vy - f.prevVy >= 0.6 * -f.prevVy && overFloor) {
          stagger(f, f.hazards.crack.staggerMs, "counterCrack");
        }
      }
      f.prevVy = vy;
    }

    // Contact between the fighters (geometric, broadphase on the torso distance).
    const reach = A.def.extent + B.def.extent + 0.05;
    const ca = com(A);
    const cb = com(B);
    const d = vLen(vSub(cb, ca));
    let contact: { gap: number; point: V3 } | null = null;
    if (d <= reach) {
      const gap = exactGap();
      if (gap.gap <= 0.012) contact = gap;
    }
    if (contact) {
      if (!touching && apartMs >= K.CONTACT_GAP_MS) {
        emit({ t: tMs, kind: "contact", side: null, point: point3(contact.point) });
      }
      touching = true;
      apartMs = 0;
    } else {
      if (touching) apartMs = 0;
      touching = false;
      apartMs += K.STEP_MS;
    }
  }

  // --- modes ---------------------------------------------------------------

  function setMode(f: Fighter, mode: Mode, dur: number) {
    f.mode = mode;
    f.modeT = 0;
    f.modeDur = dur;
    if (mode !== "move") f.move = null;
    // A flier knocked out of the air floats down, but not in the finale's
    // weather: by full strength it drops like anything else.
    const gravity =
      f.def.bodyPlan === "FLIER" && (mode === "stagger" || mode === "held")
        ? K.FLIER_STAGGER_GRAVITY + (1 - K.FLIER_STAGGER_GRAVITY) * finaleNow
        : 1;
    if (gravity !== f.gravityScale) {
      f.gravityScale = gravity;
      for (const body of f.bodies) body.setGravityScale(gravity, true);
    }
  }

  function releaseHolds(f: Fighter) {
    if (f.holding) {
      const victim = f.holding;
      if (f.move?.joint) {
        world.removeImpulseJoint(f.move.joint, true);
        f.move.joint = null;
      }
      f.holding = null;
      victim.heldBy = null;
      if (victim.mode === "held") setMode(victim, "stagger", K.STAGGER_MIN_MS);
    }
    if (f.heldBy) {
      const holder = f.heldBy;
      if (holder.move?.joint) {
        world.removeImpulseJoint(holder.move.joint, true);
        holder.move.joint = null;
      }
      holder.holding = null;
      f.heldBy = null;
      if (holder.mode === "move" && holder.move)
        enterPhase(holder, "recover", K.GRAPPLE_THROW_RECOVER_MS);
    }
  }

  function stagger(f: Fighter, ms: number, cause: StaggerCause) {
    if (f.mode === "ko" || f.mode === "out") return;
    releaseHolds(f);
    const cap = f.def.bodyPlan === "FLIER" ? K.FLIER_STAGGER_MAX_MS : K.STAGGER_MAX_MS + 300;
    const dur = clamp(ms, Math.min(K.STAGGER_MIN_MS * 0.6, cap), cap);
    if (f.mode === "stagger") {
      f.modeDur = Math.max(f.modeDur, f.modeT + dur);
    } else {
      setMode(f, "stagger", dur);
    }
    f.showboatPending = false;
    emit({ t: tMs, kind: "stagger", side: f.side, ms: Math.round(dur), cause });
  }

  function enterPhase(f: Fighter, phase: MovePhase, dur: number) {
    const m = f.move!;
    m.phase = phase;
    m.t = 0;
    m.dur = dur;
  }

  function endMove(f: Fighter) {
    f.move = null;
    if (f.showboatPending && !done) {
      f.showboatPending = false;
      setMode(
        f,
        "showboat",
        K.SHOWBOAT_MS + K.SHOWBOAT_MS_PER * f.champion.temperament.showboating,
      );
      emit({ t: tMs, kind: "showboat", side: f.side });
      return;
    }
    setMode(f, "ready", 0);
    f.brain.nextThinkMs = tMs;
  }

  function startMove(f: Fighter, index: number) {
    const move = f.champion.moves[index]!;
    const effPower = effPowerOf(move.power, move.type, f.mods);
    const root = delivererOf(f.def, move.delivery, f.limbToggle, f.itemRoot);
    const finish = delivererFinish(f, root, move.delivery);
    f.limbToggle += 1;
    const jitter = 1 + 0.35 * f.profile.chaos * f.rng.signed();
    const windup =
      move.type === "STRIKE"
        ? strikeWindupMs(f, effPower, jitter, finish)
        : move.type === "GRAPPLE"
          ? K.GRAPPLE_APPROACH_MS
          : K.TRICK_SETUP_MS * jitter;
    const edge = edgeGradient(field.geometry, com(f)[0], com(f)[2]);
    const dir = flatDir(f, foeOf(f));
    // Dodge sideways, away from the nearest drop when there is one close.
    const perpDot = -dir[1] * edge[0] + dir[0] * edge[1];
    const dodgeDir: 1 | -1 =
      f.edgeDist < 1.6 ? (perpDot >= 0 ? 1 : -1) : f.rng.chance(0.5) ? 1 : -1;
    setMode(f, "move", 0);
    f.move = {
      index,
      type: move.type,
      effPower,
      phase: "windup",
      t: 0,
      dur: windup / f.speedMul,
      root,
      finish,
      // A body slam or body grab lands with whatever leads: the torso or the head in front of it.
      chain: moveChain(f.def, root, move.type, f.coreChain),
      resolved: false,
      peakRel: 0,
      aim: [0, 0, 0],
      dodgeDir,
      rear: move.type === "STRIKE" && root > 0 && limbReach(f.def, root).rear,
      counterArmed: false,
      joint: null,
      victimInRecovery: false,
      airborneSeen: false,
      wild: false,
      landed: false,
    };
    if (move.type === "GRAPPLE") aimMove(f, foeOf(f));
    f.cooldowns[index] = K.MOVE_COOLDOWN_MS + K.MOVE_COOLDOWN_PER_POWER * move.power;
    emit({ t: tMs, kind: "windup", side: f.side, move: index, type: move.type });
  }

  function advanceTimers(f: Fighter) {
    for (let index = 0; index < f.cooldowns.length; index += 1) f.cooldowns[index]! -= K.STEP_MS;
    f.modeT += K.STEP_MS;
    if (f.hopRecover > 0) f.hopRecover -= K.STEP_MS;
    if (f.wakeMs > 0) f.wakeMs -= K.STEP_MS;
    switch (f.mode) {
      case "stagger":
        if (f.modeT >= f.modeDur && (f.supported || f.def.bodyPlan === "FLIER") && !done) {
          setMode(f, "getup", K.GETUP_MS);
          emit({ t: tMs, kind: "getup", side: f.side });
        }
        break;
      case "getup":
        if (f.modeT >= f.modeDur) {
          setMode(f, "ready", 0);
          f.brain.nextThinkMs = tMs;
          f.wakeMs = K.WAKE_PROTECT_MS;
        }
        break;
      case "showboat":
        if (f.modeT >= f.modeDur) {
          setMode(f, "ready", 0);
          f.brain.nextThinkMs = tMs;
        }
        break;
      case "move":
        advanceMove(f);
        break;
      default:
        break;
    }
  }

  /**
   * Aims a strike or grab as an offset from the foe's centre: a little Chaos noise, and
   * now and then (more often the more chaotic) a fumble that flails wide and can't land.
   */
  function aimMove(f: Fighter, foe: Fighter) {
    const m = f.move!;
    const dir = flatDir(f, foe);
    const chaos = f.profile.chaos;
    m.wild = f.rng.chance(K.WILD_CHANCE * chaos);
    const wide = m.wild ? (f.rng.chance(0.5) ? K.WILD_AIM : -K.WILD_AIM) : 0;
    const lateral = K.AIM_ERROR * chaos * f.rng.signed() + wide;
    m.aim = [
      -dir[1] * lateral,
      0.05 * f.rng.signed() * chaos + (m.wild ? K.WILD_AIM * 0.4 : 0),
      dir[0] * lateral,
    ];
  }

  function advanceMove(f: Fighter) {
    const m = f.move;
    if (!m) return;
    m.t += K.STEP_MS;
    const foe = foeOf(f);
    if (m.type === "STRIKE") {
      if (m.phase === "windup" && m.t >= m.dur) {
        enterPhase(f, "active", K.STRIKE_ACTIVE_MS / f.speedMul);
        aimMove(f, foe);
        const dir = aimedDir(f, foe, m.aim);
        if (f.def.bodyPlan === "HOPPER") {
          m.dur = 900;
          // A pounce aimed at where the foe stands now, with Chaos in the aim and the distance.
          const gap =
            Math.max(0, centerDist() - f.def.footprint * 0.5) *
            (0.85 + 0.25 * f.rng.signed() * (0.4 + f.profile.chaos));
          const flight = (2 * K.HOP_VY * 1.15) / K.GRAVITY;
          const speed =
            clamp(gap / flight, 0.5, 3.2) * (f.hazards.water ? f.hazards.water.hopSpeedFactor : 1);
          const err = K.HOP_AIM_ERROR * (0.4 + f.profile.chaos) * f.rng.signed();
          const hx = dir[0] - dir[1] * err;
          const hz = dir[1] + dir[0] * err;
          const hl = Math.sqrt(hx * hx + hz * hz) || 1;
          f.hopLaunch = [
            (hx / hl) * speed,
            K.HOP_VY * 1.15 * Math.sqrt(f.def.scale),
            (hz / hl) * speed,
          ];
        }
      } else if (m.phase === "active") {
        if (f.def.bodyPlan === "HOPPER") {
          if (f.airborne) m.airborneSeen = true;
          if (m.airborneSeen && f.grounded) m.landed = true;
        }
        const over = m.t >= m.dur || (m.landed && m.t > 120);
        if (over) {
          if (!m.resolved) {
            m.resolved = true;
            emit({
              t: tMs,
              kind: "whiff",
              side: f.side,
              move: m.index,
              type: m.type,
              reason: "miss",
            });
          }
          enterPhase(
            f,
            "recover",
            ((K.STRIKE_RECOVER_MS + K.STRIKE_RECOVER_PER_POWER * m.effPower) * reachTiming(f)) /
              f.speedMul +
              hopExtra(f),
          );
        }
      } else if (m.phase === "recover" && m.t >= m.dur) {
        endMove(f);
      }
    } else if (m.type === "GRAPPLE") {
      if (m.phase === "windup" && m.t >= m.dur) {
        if (!m.resolved) {
          m.resolved = true;
          emit({
            t: tMs,
            kind: "whiff",
            side: f.side,
            move: m.index,
            type: m.type,
            reason: "miss",
          });
        }
        enterPhase(f, "recover", K.GRAPPLE_MISS_RECOVER_MS / f.speedMul);
      } else if (m.phase === "hold" && m.t >= m.dur) {
        throwFoe(f);
      } else if (m.phase === "recover" && m.t >= m.dur) {
        endMove(f);
      }
    } else {
      if (m.phase === "windup" && m.t >= m.dur) {
        enterPhase(f, "active", K.TRICK_ACTIVE_MS / f.speedMul);
        emit({ t: tMs, kind: "dodge", side: f.side, move: m.index });
      } else if (m.phase === "active" && m.t >= m.dur) {
        if (!m.resolved) poke(f);
        enterPhase(f, "recover", K.TRICK_RECOVER_MS / f.speedMul);
      } else if (m.phase === "recover" && m.t >= m.dur) {
        endMove(f);
      }
    }
  }

  const hopExtra = (f: Fighter) =>
    f.def.bodyPlan === "HOPPER" && f.hazards.water ? f.hazards.water.extraRecoveryMs : 0;

  // --- brains --------------------------------------------------------------

  function runBrain(f: Fighter) {
    if (f.mode !== "ready" || done) return;
    if (tMs < f.brain.nextThinkMs) return;
    const situation = brainSituation(f, foeOf(f), tMs, input.limitMs, bodyGap());
    const decision = think(f.profile, f.brain, situation, f.rng);
    f.brain.nextThinkMs = tMs + thinkDelay(f.profile, aggressionAt(f.profile, situation), f.rng);
    if (decision.kind === "move") {
      startMove(f, decision.index);
    } else {
      if (decision.intent !== f.intent) f.intentT = 0;
      f.intent = decision.intent;
      f.brain.circleDir = decision.circleDir;
    }
  }

  // --- combat ----------------------------------------------------------------

  function resolveMoves(f: Fighter) {
    const m = f.move;
    if (!m || f.mode !== "move" || done) return;
    const foe = foeOf(f);
    if (m.type === "STRIKE" && m.phase === "active" && !m.resolved) {
      const root = f.st[m.root]!;
      const body = f.def.bodies[m.root]!;
      const tip = m.root === 0 ? root.c : vAdd(root.p, qRotate(root.q, body.tip));
      const rel = vLen(vSub(vAtPoint(root, tip), foe.st[0]!.v));
      m.peakRel = Math.max(m.peakRel, rel);
      if (foe.mode === "out") return;
      if (m.wild) return;
      const effReach = f.profile.effReach;
      const margin = K.HIT_MARGIN + K.HIT_MARGIN_PER_REACH * effReach;
      const contact = minGap(shapesOf(f, m.chain), foe.shapes, foe.mods.hurtbox);
      if (contact.gap > margin) return;
      m.resolved = true;
      if (foe.move?.type === "TRICK" && foe.move.phase === "active") {
        emit({
          t: tMs,
          kind: "whiff",
          side: f.side,
          move: m.index,
          type: m.type,
          reason: "dodged",
        });
        foe.move.counterArmed = true;
        return;
      }
      const impact = clamp(
        K.IMPACT_MIN + ((1 - K.IMPACT_MIN) * m.peakRel) / K.IMPACT_REF_SPEED,
        K.IMPACT_MIN,
        K.IMPACT_MAX,
      );
      const [attackFinish, guardFinish] = contactFinishes(f, contact);
      hitsThisStep.push(
        moveHit(f, foe, "strike", impact, contact.point, attackFinish, guardFinish),
      );
    } else if (m.type === "GRAPPLE" && m.phase === "windup" && !m.resolved) {
      if (m.wild || !isActive(foe) || foe.heldBy || foe.wakeMs > 0) return;
      const recovering = foe.move?.type === "STRIKE" && foe.move.phase === "recover";
      const margin =
        (K.GRAB_MARGIN + K.GRAB_MARGIN_PER_REACH * f.profile.effReach) *
        (recovering ? K.RECOVERY_GRAB_RANGE : 1);
      // A grab has to get hold of the body (torso or head), not the tip of a flailing limb.
      const contact = minGap(shapesOf(f, m.chain), coreShapes(foe), foe.mods.hurtbox);
      if (contact.gap > margin) return;
      m.resolved = true;
      if (foe.mods.grappleImmune) {
        emit({
          t: tMs,
          kind: "whiff",
          side: f.side,
          move: m.index,
          type: m.type,
          reason: "immune",
        });
        enterPhase(f, "recover", K.GRAPPLE_MISS_RECOVER_MS / f.speedMul);
        return;
      }
      if (foe.def.bodyPlan === "SLITHER" && f.rng.chance(K.SLITHER_SLIP)) {
        emit({
          t: tMs,
          kind: "whiff",
          side: f.side,
          move: m.index,
          type: m.type,
          reason: "slipped",
        });
        enterPhase(f, "recover", K.GRAPPLE_MISS_RECOVER_MS / f.speedMul);
        return;
      }
      if (foe.move?.type === "TRICK" && foe.move.phase === "active") {
        emit({
          t: tMs,
          kind: "whiff",
          side: f.side,
          move: m.index,
          type: m.type,
          reason: "dodged",
        });
        foe.move.counterArmed = true;
        enterPhase(f, "recover", K.GRAPPLE_MISS_RECOVER_MS / f.speedMul);
        return;
      }
      grabs.push({ f, foe, point: contact.point, recovering: !!recovering });
    } else if (m.type === "TRICK" && m.phase === "active" && !m.resolved) {
      // A dodge counters a Strike only once it is thrown (a Trick started too early just pokes),
      // and a Grapple anywhere in its approach.
      const committed =
        foe.mode === "move" &&
        foe.move !== null &&
        ((foe.move.type === "STRIKE" && foe.move.phase === "active") ||
          (foe.move.type === "GRAPPLE" && foe.move.phase === "windup"));
      if (!committed && !m.counterArmed) return;
      if (foe.mode === "out" || foe.mode === "ko") return;
      if (f.reachGap > f.moves[m.index]!.range + K.COUNTER_RANGE) return;
      m.resolved = true;
      emit({ t: tMs, kind: "counter", side: f.side, move: m.index });
      const point = vScale(vAdd(com(f), com(foe)), 0.5);
      const [attackFinish, guardFinish] = closeFinishes(f, foe);
      hitsThisStep.push(moveHit(f, foe, "counter", 1, point, attackFinish, guardFinish));
      enterPhase(f, "recover", K.TRICK_RECOVER_MS / f.speedMul);
    }
  }

  /**
   * The finishes a blow meets with: the deliverer's (for a body move, whichever of the
   * torso and head made the contact) against the struck shape's part.
   */
  function contactFinishes(f: Fighter, contact: Gap): [Finish, Finish] {
    const m = f.move!;
    const attack = m.root === 0 ? (contact.shapeA?.finish ?? m.finish) : m.finish;
    return [attack, contact.shapeB?.finish ?? "vinyl"];
  }

  /** Counters and pokes land at close range: on the foe's part nearest the move's chain. */
  function closeFinishes(f: Fighter, foe: Fighter): [Finish, Finish] {
    return contactFinishes(f, minGap(shapesOf(f, f.move!.chain), foe.shapes, foe.mods.hurtbox));
  }

  function poke(f: Fighter) {
    const m = f.move!;
    const foe = foeOf(f);
    m.resolved = true;
    if (foe.mode !== "out" && foe.mode !== "ko" && f.reachGap <= f.moves[m.index]!.range) {
      const point = vScale(vAdd(com(f), com(foe)), 0.5);
      const [attackFinish, guardFinish] = closeFinishes(f, foe);
      hitsThisStep.push(moveHit(f, foe, "poke", 0.85, point, attackFinish, guardFinish));
    } else {
      emit({ t: tMs, kind: "whiff", side: f.side, move: m.index, type: "TRICK", reason: "miss" });
    }
  }

  const grabs: Array<{ f: Fighter; foe: Fighter; point: V3; recovering: boolean }> = [];

  function applyGrabs() {
    if (grabs.length === 0) return;
    // Both grabbing on the same step: the referee picks one.
    const list = grabs.length === 2 ? [grabs[referee.chance(0.5) ? 0 : 1]!] : grabs;
    for (const { f, foe, point, recovering } of list) {
      if (f.mode !== "move" || !f.move || foe.heldBy || f.heldBy) continue;
      const m = f.move;
      const grip = f.bodies[m.root]!;
      const gs = f.st[m.root]!;
      const vs = foe.st[0]!;
      const a1 = qRotate(qConj(gs.q), vSub(point, gs.p));
      const a2 = qRotate(qConj(vs.q), vSub(point, vs.p));
      const joint = world.createImpulseJoint(
        R.JointData.spherical(vec(a1), vec(a2)),
        grip,
        foe.bodies[0]!,
        true,
      );
      joint.setContactsEnabled(false);
      releaseHolds(foe);
      if (foe.move?.joint) {
        world.removeImpulseJoint(foe.move.joint, true);
      }
      setMode(foe, "held", 0);
      foe.heldBy = f;
      f.holding = foe;
      m.joint = joint;
      m.victimInRecovery = recovering;
      enterPhase(f, "hold", K.GRAPPLE_HOLD_MS / f.speedMul);
      emit({ t: tMs, kind: "grab", side: f.side, move: m.index, point: point3(point) });
    }
    grabs.length = 0;
  }

  function throwFoe(f: Fighter) {
    const m = f.move!;
    const foe = f.holding;
    if (m.joint) {
      world.removeImpulseJoint(m.joint, true);
      m.joint = null;
    }
    f.holding = null;
    if (!foe) {
      enterPhase(f, "recover", K.GRAPPLE_THROW_RECOVER_MS);
      return;
    }
    foe.heldBy = null;
    hitsThisStep.push(throwHit(f, foe, field.geometry));
    enterPhase(f, "recover", K.GRAPPLE_THROW_RECOVER_MS / f.speedMul);
  }

  function applyHits() {
    const list = hitsThisStep;
    hitsThisStep = [];
    if (list.length === 0) return;
    for (const hit of list) {
      const { att, def } = hit;
      if (def.mode === "out") continue;
      def.health = Math.max(0, def.health - hit.damage);
      def.beenHit = true;
      att.hitsLanded += 1;
      const throwing = hit.kind === "throw";
      const up = throwing ? K.THROW_UP : K.KB_UP;
      const impulseScale = Math.sqrt(K.KB_MASS_REF * def.def.totalMass);
      // In the finale a hurt fighter flies farther.
      const hurt = 1 + K.FINALE_HURT_KNOCKBACK * finaleNow * (1 - def.health / def.maxHealth);
      const dv = hit.dv * hurt;
      const j = dv * impulseScale;
      def.dragGraceMs = K.DRAG_GRACE_MS;
      if (throwing) {
        def.launch = [hit.dir[0] * dv, up * dv, hit.dir[2] * dv];
      } else {
        def.impulses.push({ j: [hit.dir[0] * j, up * j, hit.dir[2] * j] });
      }
      if (hit.dv > 0) att.impulses.push({ j: [-hit.dir[0] * j * 0.12, 0, -hit.dir[2] * j * 0.12] });

      // Stagger: above the threshold, or forced (throws, broken tricks).
      const heft = def.champion.stats.heft;
      let stateMul = hit.staggerMul;
      if (def.mode === "showboat") stateMul *= 0.6;
      if (def.def.bodyPlan === "HOPPER" && def.airborne) stateMul *= 0.5;
      if (def.mode === "move") stateMul *= 0.85;
      const threshold =
        (K.STAGGER_BASE + K.STAGGER_PER_HEFT * heft) * def.mods.staggerResist * stateMul;
      const over = hit.damage / threshold;
      const staggers = hit.forceStagger !== null || over >= 1;
      const big = staggers || hit.miracle || hit.damage >= K.BIG_HIT_DAMAGE;
      if (throwing) {
        emit({
          t: tMs,
          kind: "throw",
          side: att.side,
          move: hit.move,
          damage: hit.damage,
          knockback: round2(j),
          point: point3(hit.point),
          health: def.health,
        });
      } else {
        emit({
          t: tMs,
          kind: "hit",
          side: att.side,
          move: hit.move,
          type: hit.type,
          damage: hit.damage,
          knockback: round2(j),
          big,
          point: point3(hit.point),
          health: def.health,
          counter: hit.kind === "counter",
          miracle: hit.miracle,
          // Only when not vinyl, so an unfinished fight's log is unchanged.
          ...(hit.attackFinish !== "vinyl" ? { attackFinish: hit.attackFinish } : {}),
          ...(hit.guardFinish !== "vinyl" ? { guardFinish: hit.guardFinish } : {}),
        });
      }
      if (def.mods.selfDamageOnHitTaken > 0 && def.health > 0) {
        const self = Math.round(def.mods.selfDamageOnHitTaken);
        def.health = Math.max(0, def.health - self);
        emit({ t: tMs, kind: "selfDamage", side: def.side, damage: self, health: def.health });
      }
      // A Strike that lands in a Trick's setup breaks it: the Trick is spent.
      if (hit.forceStagger === "trickBroken" && def.move?.type === "TRICK") {
        emit({
          t: tMs,
          kind: "whiff",
          side: def.side,
          move: def.move.index,
          type: "TRICK",
          reason: "broken",
        });
      }
      const alreadyDown = def.mode === "stagger" || def.mode === "getup";
      if (staggers && def.health > 0 && !(alreadyDown && !throwing)) {
        const ms = hit.staggerMs || K.STAGGER_MIN_MS + 600 * clamp(over - 1, 0, 1.7);
        stagger(def, ms, hit.forceStagger ?? (hit.kind === "counter" ? "counter" : "hit"));
      }
      // The attacker might showboat after a clean hit.
      if (!throwing && hit.kind !== "counter" && att.mode === "move") {
        const flag = att.mods.brain.showboatsAfterHit;
        const sb = att.champion.temperament.showboating;
        if (att.rng.chance(flag ? 0.55 + 0.4 * sb : sb > 0.75 ? 0.15 : 0))
          att.showboatPending = true;
      }
    }

    // KOs, judged after every hit of the step lands.
    const koA = A.health <= 0 && A.mode !== "ko" && A.mode !== "out";
    const koB = B.health <= 0 && B.mode !== "ko" && B.mode !== "out";
    if (koA || koB) {
      for (const f of fighters) {
        if ((f === A && koA) || (f === B && koB)) {
          releaseHolds(f);
          setMode(f, "ko", 0);
          emit({ t: tMs, kind: "ko", side: f.side });
        }
      }
      const winner: Side = koA && koB ? (referee.chance(0.5) ? "A" : "B") : koA ? "B" : "A";
      decide(winner, "KO");
      return;
    }
    if (suddenDeath) {
      const scorers = list.filter((hit) => hit.damage > 0);
      if (scorers.length) {
        const bySide = (side: Side) =>
          scorers.filter((hit) => hit.att.side === side).reduce((sum, hit) => sum + hit.damage, 0);
        const a = bySide("A");
        const b = bySide("B");
        const winner: Side = a === b ? (referee.chance(0.5) ? "A" : "B") : a > b ? "A" : "B";
        decide(winner, "SUDDEN_DEATH");
      }
    }
  }

  // --- ending ----------------------------------------------------------------

  /** In the air, past the edge, or sliding toward it: it may still be going over. */
  function unsettled(f: Fighter): boolean {
    if (f.mode === "out") return false;
    if (f.airborne || f.edgeDist < 0) return true;
    if (f.edgeDist >= K.EDGE_WARN) return false;
    const c = com(f);
    const v = f.st[0]!.v;
    const outward = (f.edgeDist - ringOutDistance(field.geometry, c[0] + v[0] * 0.1, c[2] + v[2] * 0.1)) / 0.1;
    return outward > K.BELL_SLIDE_SPEED;
  }

  /**
   * Ends the fight for a KO, decision or sudden death, unless the winner is
   * in the air or past the edge: then the bell waits (up to BELL_HOLD_MS) and
   * a ring-out in that window decides it instead. Otherwise a winner already
   * falling would win, then drop off in the outro.
   */
  function decide(winner: Side, method: FightMethod) {
    if (done || held) return;
    if (!unsettled(winner === "A" ? A : B)) return finish(winner, method);
    held = { winner, method, untilMs: tMs + BELL_HOLD_MS };
    // Nobody acts while it waits: moves stop where they are (no late throw or
    // poke, no lunge carrying the winner off) and a hold lets go.
    for (const f of fighters) {
      letGo(f);
      if (f.mode === "move") setMode(f, "ready", 0);
    }
  }

  function letGo(f: Fighter) {
    releaseHolds(f);
    if (f.move?.joint) world.removeImpulseJoint(f.move.joint, true);
  }

  function finish(winner: Side, method: FightMethod) {
    if (done) return;
    emit({ t: tMs, kind: "end", side: winner, method });
    done = true;
    pushTimeline(true);
    const transforms = fighters
      .map((f) =>
        f.st
          .map(
            (s) =>
              `${s.p.map((x) => x.toFixed(4)).join(",")};${s.q.map((x) => x.toFixed(4)).join(",")}`,
          )
          .join("|"),
      )
      .join("#");
    const hash = stableHash(`${stableStringify(events)}#${transforms}`)
      .toString(16)
      .padStart(8, "0");
    outcome = {
      winner,
      method,
      endMs: tMs,
      health: { A: A.health, B: B.health },
      maxHealth: { A: A.maxHealth, B: B.maxHealth },
      events: events.slice(),
      healthTimeline: timeline.map((row) => [row[0], row[1], row[2]]),
      hash,
    };
    // The outro: the winner poses, a loser not knocked out stands down. A
    // staggered or held fighter stands too (nobody gets up once it is decided).
    for (const f of fighters) {
      if (f.mode === "out" || f.mode === "ko") continue;
      letGo(f);
      setMode(
        f,
        f.side === winner ? "showboat" : "ready",
        f.side === winner ? Number.POSITIVE_INFINITY : 0,
      );
    }
  }

  let lastHealth: [number, number] = [A.health, B.health];
  function pushTimeline(force = false) {
    const changed = A.health !== lastHealth[0] || B.health !== lastHealth[1];
    const last = timeline[timeline.length - 1]!;
    if (changed || force || stepIndex % Math.round(K.HEALTH_SAMPLE_MS / K.STEP_MS) === 0) {
      if (last[0] === tMs) {
        last[1] = A.health;
        last[2] = B.health;
      } else {
        timeline.push([tMs, A.health, B.health]);
      }
      lastHealth = [A.health, B.health];
    }
  }

  /**
   * Who has more of their health bar left (the bars are what the room sees), exactly:
   * cross-multiplied integers, no division. null on a dead heat.
   */
  function healthLeader(): Side | null {
    const a = A.health * B.maxHealth;
    const b = B.health * A.maxHealth;
    return a === b ? null : a > b ? "A" : "B";
  }

  function clock() {
    if (done) return;
    if (held) {
      const winner = held.winner === "A" ? A : B;
      if (tMs >= held.untilMs || !unsettled(winner)) finish(held.winner, held.method);
      return;
    }
    if (!suddenDeath && tMs >= input.limitMs) {
      emit({ t: tMs, kind: "timeout", side: null });
      const leader = healthLeader();
      if (leader) {
        decide(leader, "DECISION");
      } else {
        suddenDeath = true;
        emit({ t: tMs, kind: "suddenDeath", side: null });
      }
    } else if (suddenDeath && tMs >= input.limitMs + SUDDEN_DEATH_MS) {
      decide(healthLeader() ?? (referee.chance(0.5) ? "A" : "B"), "DECISION");
    }
  }

  // --- the arena field ---------------------------------------------------------

  /**
   * Moves the arena on to this step: the wind's gusts and the finale (the
   * counter's tilt, the flood's shrinking floor, the storm). The finale holds
   * where it was once the fight is decided.
   */
  function updateField() {
    const s = finaleStrengthAt(finale, outcome ? outcome.endMs : tMs);
    finaleNow = s;
    // Called once, and only while the fight is on: not after the bell.
    if (s > 0 && !finaleStarted && !done && !held) {
      finaleStarted = true;
      emit({ t: tMs, kind: "finale", side: null });
    }
    if (wind) {
      const w = stormWindAt(wind, storm, s, tMs);
      field.wind = [wind.direction[0] * wind.accel * w, wind.direction[1] * wind.accel * w];
    }
    if (tilt && finale.direction) {
      field.slope = [finale.direction[0] * tilt.accel * s, finale.direction[1] * tilt.accel * s];
    }
    if (flood) {
      const dry = dryHalfAt(geometry, flood, s);
      if (dry !== dryHalf) {
        dryHalf = dry;
        field.geometry = floodedGeometry(geometry, dry);
        for (const { box, collider } of slabs) {
          const x0 = Math.max(box.min[0], -dry);
          const x1 = Math.min(box.max[0], dry);
          const z0 = Math.max(box.min[2], -dry);
          const z1 = Math.min(box.max[2], dry);
          if (x1 <= x0 || z1 <= z0) {
            collider.setEnabled(false);
            continue;
          }
          collider.setHalfExtents({ x: (x1 - x0) / 2, y: (box.max[1] - box.min[1]) / 2, z: (z1 - z0) / 2 });
          collider.setTranslation({ x: (x0 + x1) / 2, y: (box.min[1] + box.max[1]) / 2, z: (z0 + z1) / 2 });
        }
      }
    }
  }

  // --- the step ----------------------------------------------------------------

  function step(): FightEvent[] {
    if (disposed) return [];
    // The first step also hands over the `start` event recorded at creation.
    if (stepIndex > 0) stepEvents = [];
    stepIndex += 1;
    tMs = Math.round(stepIndex * K.STEP_MS);
    updateField();
    readState(A);
    readState(B);
    A.reachGap = surfaceReach(A, B);
    B.reachGap = surfaceReach(B, A);
    if (!done) refereeChecks();
    for (const f of fighters) advanceTimers(f);
    if (!done && !held) {
      for (const f of fighters) runBrain(f);
      for (const f of fighters) resolveMoves(f);
      applyGrabs();
      applyHits();
    }
    clock();
    for (const f of fighters) {
      motion.strengths(f);
      motion.locomotion(f, foeOf(f), tMs, done || held !== null);
    }
    for (const f of fighters) motion.servo(f, foeOf(f), tMs);
    for (const f of fighters) motion.applyImpulses(f);
    world.step();
    if (!done) pushTimeline();
    return stepEvents;
  }

  // --- views -----------------------------------------------------------------

  const fighterOf = (side: Side) => (side === "A" ? A : B);

  return {
    get tMs() {
      return tMs;
    },
    get done() {
      return done;
    },
    step,
    pose(side: Side) {
      const f = fighterOf(side);
      return fighterPose(f, foeOf(f));
    },
    live(side: Side) {
      return fighterLive(fighterOf(side));
    },
    layout(side: Side) {
      return fighterOf(side).layout;
    },
    outcome() {
      return outcome;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.free();
    },
  };
}

/** Headless, to completion. */
export function runFight(R: Rapier, input: FightInput): FightOutcome {
  const sim = createFight(R, input);
  try {
    const maxSteps = Math.ceil(((input.limitMs + SUDDEN_DEATH_MS + BELL_HOLD_MS) / 1000) * K.STEP_HZ) + 10;
    for (let index = 0; index < maxSteps && !sim.done; index += 1) sim.step();
    const outcome = sim.outcome();
    if (!outcome) throw new Error("fight did not finish");
    return outcome;
  } finally {
    sim.dispose();
  }
}
