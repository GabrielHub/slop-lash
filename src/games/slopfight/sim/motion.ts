// Voluntary locomotion, active ragdoll servos, and external impulses. This
// layer changes velocities only; combat, timers, and outcome ownership stay
// in fight.ts. Per-fight closure state is limited to immutable arena inputs
// and a lazily derived gait cache.
import { windStrengthAt, type ArenaGeometry, type Wind } from "../arenas";
import { aggressionAt } from "./brain";
import { aimedDir, com, edgeGradient, flatDir } from "./collision";
import { atan2, clamp, cos, PI, sin, smoothstep, TAU, wrapAngle } from "./dmath";
import { isActive, type Fighter } from "./fighter";
import * as K from "./tuning";
import {
  hLen,
  qAxisAngle,
  qConj,
  qErrorVec,
  qFromTo,
  qMul,
  qRotate,
  qYaw,
  Q_IDENTITY,
  vAdd,
  vCross,
  vec,
  vLen,
  vNorm,
  vScale,
  vSub,
  type Q4,
  type V3,
} from "./vec";

const clampLen = (v: V3, max: number): V3 => {
  const len = vLen(v);
  return len > max ? vScale(v, max / len) : v;
};
const yawOf = (q: Q4): number => {
  const f = qRotate(q, [0, 0, 1]);
  return atan2(f[0], f[2]);
};

export function createMotion(geometry: ArenaGeometry, wind: Wind | null, limitMs: number) {
  function locomotion(f: Fighter, foe: Fighter, tMs: number, done: boolean) {
    const dir = flatDir(f, foe);
    const c = com(f);
    const edge = edgeGradient(geometry, c[0], c[2]);
    const aggression = aggressionAt(f.profile, {
      t: tMs,
      limitMs,
      health01: f.health / f.maxHealth,
    });
    const vmax = f.vmax * (0.8 + 0.2 * clamp(aggression, 0, 1));
    let vx = 0;
    let vz = 0;
    let face = atan2(dir[0], dir[1]);
    const reachGap = f.reachGap;

    if (f.mode === "ready") {
      f.intentT += K.STEP_MS;
      const desired = Math.max(0.05, Math.min(...f.moves.map((move) => move.range)) * 0.85);
      switch (f.intent) {
        case "approach":
          vx = dir[0] * vmax;
          vz = dir[1] * vmax;
          break;
        case "circle": {
          const radial = clamp(reachGap - desired, -1, 1) * 0.6;
          const s = f.brain.circleDir;
          vx = (-dir[1] * s * 0.75 + dir[0] * radial) * vmax;
          vz = (dir[0] * s * 0.75 + dir[1] * radial) * vmax;
          break;
        }
        case "feint": {
          const inward = f.intentT < 180 ? 1.15 : -0.9;
          vx = dir[0] * vmax * inward;
          vz = dir[1] * vmax * inward;
          break;
        }
        case "retreat": {
          const ax = -dir[0] + edge[0] * 1.6;
          const az = -dir[1] + edge[1] * 1.6;
          const len = Math.sqrt(ax * ax + az * az) || 1;
          vx = (ax / len) * vmax * 0.9;
          vz = (az / len) * vmax * 0.9;
          break;
        }
        default:
          break;
      }
    } else if (f.mode === "move" && f.move) {
      const m = f.move;
      const range = f.moves[m.index]!.range;
      if (m.type === "STRIKE") {
        if (m.phase === "windup") {
          const close = clamp(reachGap - range * 0.7, -0.4, 0.7);
          vx = dir[0] * close * vmax;
          vz = dir[1] * close * vmax;
        } else if (m.phase === "active" && f.def.bodyPlan !== "HOPPER" && !m.resolved) {
          const lunge =
            (m.root === 0 ? K.BODY_LUNGE : K.STRIKE_LUNGE) +
            K.STRIKE_LUNGE_PER_REACH * f.profile.effReach;
          const downed = !isActive(foe) ? 0.4 : 1;
          const speed = lunge * f.speedMul * (reachGap > 0.05 ? 1 : 0.3) * downed;
          const aimed = aimedDir(f, foe, m.aim);
          vx = aimed[0] * speed;
          vz = aimed[1] * speed;
        }
      } else if (m.type === "GRAPPLE") {
        if (m.phase === "windup") {
          const aimed = aimedDir(f, foe, m.aim);
          vx = aimed[0] * vmax * K.GRAPPLE_APPROACH_SPEED;
          vz = aimed[1] * vmax * K.GRAPPLE_APPROACH_SPEED;
        }
      } else if (m.phase === "windup") {
        vx = -dir[0] * 0.35;
        vz = -dir[1] * 0.35;
      } else if (m.phase === "active") {
        const s = m.dodgeDir;
        vx = (-dir[1] * s * K.DODGE_SPEED - dir[0] * 0.6) * f.speedMul;
        vz = (dir[0] * s * K.DODGE_SPEED - dir[1] * 0.6) * f.speedMul;
      }
    } else if (f.mode === "showboat" || done) {
      face = f.facing;
    }
    // Tail swings: turn the back to the foe through the windup and the swing.
    const rearSwing = f.mode === "move" && f.move?.rear && f.move.phase !== "recover";
    if (rearSwing) face = wrapAngle(face + PI);

    // Edge avoidance on top of anything voluntary (not mid-lunge).
    const lunging =
      f.mode === "move" && f.move && f.move.phase === "active" && f.move.type === "STRIKE";
    if (f.edgeDist < K.EDGE_AVOID && !lunging && isActive(f)) {
      const push = ((K.EDGE_AVOID - f.edgeDist) / K.EDGE_AVOID) * vmax * (0.8 + f.profile.caution);
      vx += edge[0] * push;
      vz += edge[1] * push;
    }
    if (wind && f.hazards.wind && isActive(f)) {
      const gust = windStrengthAt(wind, tMs);
      vx += wind.direction[0] * wind.accel * gust * 0.3;
      vz += wind.direction[1] * wind.accel * gust * 0.3;
    }
    if (done) {
      vx = 0;
      vz = 0;
    }
    f.vDes = [vx, vz];

    // Facing turns at a limited rate.
    if (isActive(f)) {
      const delta = wrapAngle(face - f.facing);
      const step = f.turnRate * K.DT * (rearSwing ? K.REAR_TURN_BOOST : 1);
      f.facing = wrapAngle(f.facing + clamp(delta, -step, step));
    } else {
      f.facing = yawOf(f.st[0]!.q);
    }
  }

  function strengths(f: Fighter) {
    switch (f.mode) {
      case "ready":
      case "move":
      case "showboat":
        f.strength = 1;
        f.limbStrength = 1;
        break;
      case "getup": {
        const k = smoothstep(0, 1, f.modeT / f.modeDur);
        f.strength = 0.12 + 0.88 * k;
        f.limbStrength = K.RAGDOLL_LIMB_STRENGTH + (1 - K.RAGDOLL_LIMB_STRENGTH) * k;
        break;
      }
      case "stagger":
        f.strength = K.STAGGER_STRENGTH;
        f.limbStrength = K.RAGDOLL_LIMB_STRENGTH;
        break;
      case "held":
        f.strength = 0;
        f.limbStrength = 0.1;
        break;
      default:
        f.strength = 0;
        f.limbStrength = 0.04;
    }
  }

  /** Relative target rotation of body `index` against its parent. */
  function limbTarget(
    f: Fighter,
    index: number,
    foe: Fighter,
    tMs: number,
  ): { q: Q4; strike: boolean } {
    const body = f.def.bodies[index]!;
    const m = f.move;
    const st = f.st;
    if (m && f.mode === "move" && index === m.root && index !== 0) {
      const parentQ = st[body.parent]!.q;
      const target = vAdd(com(foe), m.aim);
      const toward = vNorm(vSub(target, st[index]!.p));
      const local = qRotate(qConj(parentQ), toward);
      if (m.type === "STRIKE") {
        if (m.phase === "windup") {
          const pulled = vNorm(vAdd(vSub(body.restDir, vScale(local, 0.9)), [0, 0.35, 0]));
          return { q: qFromTo(body.restDir, pulled), strike: false };
        }
        if (m.phase === "active") return { q: qFromTo(body.restDir, local), strike: true };
      } else if (m.type === "GRAPPLE") {
        if (m.phase === "windup") return { q: qFromTo(body.restDir, local), strike: false };
        if (m.phase === "hold")
          return { q: qFromTo(body.restDir, vNorm([0, 0.85, 0.55])), strike: false };
      }
    }
    if (f.mode === "showboat" && body.role === "arm" && body.chainRoot === index) {
      return { q: qFromTo(body.restDir, vNorm([body.side * 0.45, 1, 0.1])), strike: false };
    }
    const plan = f.def.bodyPlan;
    const torso = st[0]!;
    switch (body.role) {
      case "leg": {
        if (body.chainRoot !== index || plan === "FLIER") {
          const dangle = plan === "FLIER" ? 0.18 * sin(TAU * (f.flap * 0.5) + body.side) : 0;
          return { q: qAxisAngle([1, 0, 0], dangle), strike: false };
        }
        const local = qRotate(qConj(torso.q), torso.v);
        const speed = hLen(local[0], local[2]);
        if (speed < 0.05) return { q: Q_IDENTITY, strike: false };
        const axis: V3 = [local[2] / speed, 0, -local[0] / speed];
        const amp = 0.5 * clamp(speed / (K.BASE_SPEED * 0.8), 0, 1);
        const offset = legOffset(f, index);
        return { q: qAxisAngle(axis, amp * sin(TAU * (f.gait + offset))), strike: false };
      }
      case "tail": {
        if (plan === "SLITHER") {
          const speed = hLen(torso.v[0], torso.v[2]);
          const amp = 0.25 + 0.35 * clamp(speed / K.BASE_SPEED, 0, 1);
          return {
            q: qAxisAngle([0, 1, 0], amp * sin(TAU * (f.gait - 0.18 * body.depth))),
            strike: false,
          };
        }
        return { q: qAxisAngle([0, 1, 0], 0.28 * sin(TAU * f.wag + body.depth)), strike: false };
      }
      case "wing": {
        const amp = plan === "FLIER" ? 0.65 : 0.2;
        return { q: qAxisAngle([0, 0, 1], body.side * amp * sin(TAU * f.flap)), strike: false };
      }
      case "arm":
        if (body.chainRoot === index) {
          return {
            q: qAxisAngle([1, 0, 0], 0.1 * sin(TAU * (tMs / 1300 + body.side * 0.25))),
            strike: false,
          };
        }
        return { q: Q_IDENTITY, strike: false };
      default:
        return { q: Q_IDENTITY, strike: false };
    }
  }

  const legOffsets = new WeakMap<Fighter, Map<number, number>>();
  function legOffset(f: Fighter, index: number): number {
    let map = legOffsets.get(f);
    if (!map) {
      map = new Map();
      const legs = f.def.bodies
        .map((body, i) => ({ body, i }))
        .filter(({ body, i }) => body.role === "leg" && body.chainRoot === i);
      const rankBySide = new Map<number, number>();
      legs
        .sort((x, y) => y.body.head[2] - x.body.head[2] || x.i - y.i)
        .forEach(({ body, i }) => {
          const rank = rankBySide.get(body.side) ?? 0;
          rankBySide.set(body.side, rank + 1);
          map!.set(i, ((rank + (body.side === 1 ? 0 : 1)) % 2) * 0.5);
        });
      legOffsets.set(f, map);
    }
    return map.get(index) ?? 0;
  }

  /**
   * A flier hovers, but dives to the foe's height to strike or grab: the delivering
   * limb's shoulder level with the foe's centre, never below its own standing height.
   */
  function swoopY(f: Fighter, foe: Fighter, hover: number): number {
    const m = f.move;
    if (!m || f.mode !== "move") return hover;
    const attacking =
      (m.type === "STRIKE" && (m.phase === "windup" || m.phase === "active")) ||
      (m.type === "GRAPPLE" && (m.phase === "windup" || m.phase === "hold"));
    if (!attacking) return hover;
    const shoulder = m.root === 0 ? 0 : f.def.bodies[m.root]!.head[1] - f.def.torsoCom[1];
    return clamp(
      com(foe)[1] - shoulder,
      f.restComY - K.FLIER_HOVER,
      hover + K.FLIER_SWOOP_MAX_RISE,
    );
  }

  function servo(f: Fighter, foe: Fighter, tMs: number) {
    const st = f.st;
    const def = f.def;
    const plan = def.bodyPlan;
    const s = f.strength;
    const torso = st[0]!;

    // Gait clocks.
    const speed = hLen(torso.v[0], torso.v[2]);
    f.gait = (f.gait + (speed * K.DT) / (2 * K.STRIDE * Math.max(def.height, 0.4))) % 1;
    f.wag = (f.wag + K.DT * (1.2 + speed)) % 1;
    f.flap = (f.flap + K.DT * (plan === "FLIER" ? 3.4 : 1)) % 1;

    // Torso orientation: face, lean into the motion.
    const forward = torso.v[0] * sin(f.facing) + torso.v[2] * cos(f.facing);
    const leanScale = plan === "BIPED" ? 1 : 0.35;
    let lean = clamp(forward * 0.06, -0.12, 0.18) * leanScale;
    if (f.move?.type === "STRIKE")
      lean +=
        (f.move.phase === "active" ? 0.22 : f.move.phase === "windup" ? -0.12 : 0) * leanScale;
    const target = qMul(qYaw(f.facing), qAxisAngle([1, 0, 0], lean));
    const err = qErrorVec(target, torso.q);
    const wDes = clampLen(vScale(err, K.KP_ROT), K.MAX_SERVO_ANGVEL);
    const aRot = K.A_ROT * s;
    const w: V3 = [
      torso.w[0] + (wDes[0] - torso.w[0]) * aRot,
      torso.w[1] + (wDes[1] - torso.w[1]) * aRot,
      torso.w[2] + (wDes[2] - torso.w[2]) * aRot,
    ];

    // Torso translation.
    const flying = plan === "FLIER" && isActive(f);
    const hopperAir = plan === "HOPPER" && !f.grounded;
    const ground = flying ? 1 : f.supported && !hopperAir ? 1 : 0.04;
    const aLin = (f.mods.pushImmune ? K.A_LIN_PUSH_IMMUNE : K.A_LIN) * s * ground;
    const v: V3 = [torso.v[0], torso.v[1], torso.v[2]];
    v[0] += (f.vDes[0] - v[0]) * aLin;
    v[2] += (f.vDes[1] - v[2]) * aLin;
    const heightOn = (flying || (f.supported && !hopperAir)) && s > 0.1;
    if (heightOn) {
      const bob = flying ? 0.04 * sin(TAU * f.flap * 0.5) : 0;
      const lift = f.mode === "move" && f.move?.phase === "hold" ? 0.08 : 0;
      const targetY = flying ? swoopY(f, foe, f.restComY + bob) : f.restComY + bob + lift;
      const vyDes = clamp(
        (targetY - torso.c[1]) * K.KP_HEIGHT,
        -K.MAX_LIFT_SPEED,
        K.MAX_LIFT_SPEED,
      );
      const ff = 1 + 0.5 * (def.totalMass / def.bodies[0]!.mass - 1);
      v[1] += (vyDes - v[1]) * K.A_HEIGHT * s + K.GRAVITY * K.DT * s * Math.min(ff, 2.2);
    }

    // Held: the thrower's lift carries the victim's weight.
    if (f.mode === "held" && f.heldBy) {
      const holder = f.heldBy;
      // Lifted a set height whoever holds it, so a big thrower doesn't throw farther for being tall.
      const targetY = f.restComY + Math.min(0.3 * holder.def.height, K.HELD_LIFT_MAX);
      const vyDes = clamp((targetY - torso.c[1]) * 5, -1.2, 1.4);
      v[1] += (vyDes - v[1]) * 0.3 + K.GRAVITY * K.DT;
      // Held bodies move with the holder, not with whatever the arm is doing.
      const hv = holder.st[0]!.v;
      v[0] += (hv[0] - v[0]) * 0.3;
      v[2] += (hv[2] - v[2]) * 0.3;
    }

    // Hopper locomotion: launch hops when it wants to move.
    if (plan === "HOPPER" && f.mode === "ready" && f.grounded && f.hopRecover <= 0) {
      const want = hLen(f.vDes[0], f.vDes[1]);
      if (want > 0.3) {
        const factor = f.hazards.water ? f.hazards.water.hopSpeedFactor : 1;
        const hs = Math.min(want, f.vmax) * K.HOP_SPEED * factor;
        f.hopLaunch = [
          (f.vDes[0] / want) * hs,
          K.HOP_VY * Math.sqrt(def.scale),
          (f.vDes[1] / want) * hs,
        ];
      }
    }
    if (plan === "HOPPER" && f.wasAirborneHop && f.grounded) {
      f.hopRecover = K.HOP_RECOVER_MS + (f.hazards.water ? f.hazards.water.extraRecoveryMs : 0);
    }
    f.wasAirborneHop = plan === "HOPPER" && !f.grounded;

    if (f.hopLaunch) {
      const launch = f.hopLaunch;
      f.hopLaunch = null;
      for (const body of f.bodies) body.setLinvel(vec(launch), true);
      f.bodies[0]!.setAngvel(vec(w), true);
      f.wasAirborneHop = true;
      return;
    }

    const floppy = f.mode === "stagger" || f.mode === "held" || f.mode === "ko" || f.mode === "out";
    // A ragdoll lying on the floor slows like a sack, not a puck, and doesn't bounce.
    if (f.dragGraceMs > 0) f.dragGraceMs -= K.STEP_MS;
    const floorDrag = floppy && f.mode !== "held" && f.grounded && f.dragGraceMs <= 0;
    // A staggered flier floats (low gravity), so it brakes in the air instead of drifting off the stage.
    const airDrag = !floorDrag && plan === "FLIER" && f.mode === "stagger" && f.dragGraceMs <= 0;
    const drag = floorDrag ? K.RAGDOLL_FLOOR_DRAG : airDrag ? K.FLIER_AIR_DRAG : 0;
    if (drag > 0) {
      v[0] *= 1 - drag;
      v[2] *= 1 - drag;
      if (floorDrag && v[1] > 0) v[1] *= 1 - K.RAGDOLL_BOUNCE_DAMP;
    }
    f.bodies[0]!.setLinvel(vec(v), true);
    f.bodies[0]!.setAngvel(vec(w), true);
    const newV: V3[] = [v];
    const newW: V3[] = [w];

    for (let index = 1; index < def.bodies.length; index += 1) {
      const body = def.bodies[index]!;
      const parent = body.parent;
      const ps = st[parent]!;
      const bs = st[index]!;
      const wParent = newW[parent]!;
      let wD: V3;
      let a: number;
      if (floppy) {
        // Ragdoll: joint friction only (damp motion relative to the parent), no pose drive,
        // so a body on the floor never paddles itself along.
        wD = wParent;
        a = K.RAGDOLL_JOINT_DAMPING;
      } else {
        const { q: rel, strike } = limbTarget(f, index, foe, tMs);
        const e = qErrorVec(qMul(ps.q, rel), bs.q);
        const kp = strike ? K.KP_STRIKE : K.KP_LIMB;
        a = (strike ? K.A_STRIKE : K.A_LIMB) * f.limbStrength;
        wD = vAdd(wParent, clampLen(vScale(e, kp), K.MAX_LIMB_ANGVEL));
      }
      const wi: V3 = [
        bs.w[0] + (wD[0] - bs.w[0]) * a,
        bs.w[1] + (wD[1] - bs.w[1]) * a,
        bs.w[2] + (wD[2] - bs.w[2]) * a,
      ];
      const anchor = bs.p;
      const vAnchor = vAdd(newV[parent]!, vCross(wParent, vSub(anchor, ps.c)));
      const vCons = vAdd(vAnchor, vCross(wi, vSub(bs.c, anchor)));
      const al = floppy ? K.RAGDOLL_LIMB_LIN : a;
      const vi: V3 = [
        bs.v[0] + (vCons[0] - bs.v[0]) * al,
        bs.v[1] + (vCons[1] - bs.v[1]) * al,
        bs.v[2] + (vCons[2] - bs.v[2]) * al,
      ];
      if (drag > 0) {
        vi[0] *= 1 - drag;
        vi[2] *= 1 - drag;
      }
      f.bodies[index]!.setLinvel(vec(vi), true);
      f.bodies[index]!.setAngvel(vec(wi), true);
      newV.push(vi);
      newW.push(wi);
    }
  }

  function applyImpulses(f: Fighter, tMs: number) {
    const total = f.def.totalMass;
    if (f.launch) {
      const launch = vec(f.launch);
      f.launch = null;
      for (const body of f.bodies) {
        body.setLinvel(launch, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
    if (f.impulses.length) {
      let jx = 0;
      let jy = 0;
      let jz = 0;
      for (const { j } of f.impulses) {
        jx += j[0];
        jy += j[1];
        jz += j[2];
      }
      f.impulses = [];
      f.def.bodies.forEach((body, index) => {
        const share = body.mass / total;
        f.bodies[index]!.applyImpulse({ x: jx * share, y: jy * share, z: jz * share }, true);
      });
    }
    if (wind && f.hazards.wind && !isActive(f) && f.mode !== "out") {
      const gust = windStrengthAt(wind, tMs);
      if (gust > 0) {
        f.def.bodies.forEach((body, index) => {
          const k = body.mass * wind.accel * gust * K.DT;
          f.bodies[index]!.applyImpulse(
            { x: wind.direction[0] * k, y: 0, z: wind.direction[1] * k },
            true,
          );
        });
      }
    }
  }

  return { locomotion, strengths, servo, applyImpulses };
}
