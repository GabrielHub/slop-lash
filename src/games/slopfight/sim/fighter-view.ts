// Read-only projections for the renderer, controller, and brain. Reading these never
// advances a timer, consumes randomness, or changes the physics world.
import type { FoeState, Situation } from "./brain";
import { clamp } from "./dmath";
import type { Fighter } from "./fighter";
import type { FighterAnimHint, FighterLive, FighterPose, Intent, Locomotion, Vec3 } from "./types";
import { hLen, point3 } from "./vec";

function intentOf(f: Fighter): Intent {
  switch (f.mode) {
    case "ready":
      return f.intent;
    case "move": {
      const m = f.move!;
      if (m.phase === "recover") return "recover";
      if (m.type === "TRICK") return m.phase === "windup" ? "feint" : "dodge";
      if (m.type === "GRAPPLE" && m.phase === "hold") return "grab";
      return "commit";
    }
    case "held":
      return "stagger";
    default:
      return f.mode;
  }
}

function locomotionOf(f: Fighter, speed: number): Locomotion {
  if (f.strength < 0.5) return "ragdoll";
  const plan = f.def.bodyPlan;
  if (plan === "FLIER") return "hover";
  if (plan === "HOPPER") return f.grounded ? "stand" : "hop";
  if (f.airborne) return "airborne";
  if (plan === "SLITHER") return speed > 0.1 ? "slither" : "stand";
  if (speed < 0.12) return "stand";
  return speed > f.vmax * 1.15 ? "run" : "walk";
}

export function fighterPose(f: Fighter, foe: Fighter): FighterPose {
  const bodies = f.def.bodies.map((body, index) => {
    const rigid = f.bodies[index]!;
    const t = rigid.translation();
    const r = rigid.rotation();
    return {
      key: body.key,
      p: [t.x, t.y, t.z] as Vec3,
      q: [r.x, r.y, r.z, r.w] as [number, number, number, number],
    };
  });
  const v = f.bodies[0]!.linvel();
  const speed = hLen(v.x, v.z);
  const m = f.move;
  const anim: FighterAnimHint = {
    locomotion: locomotionOf(f, speed),
    phase: f.gait,
    speed,
    intent: intentOf(f),
    move: m ? m.index : null,
    moveType: m ? m.type : null,
    movePhase: m ? m.phase : null,
    progress: m ? clamp(m.t / Math.max(m.dur, 1), 0, 1) : 0,
    ragdoll: clamp(1 - f.strength, 0, 1),
    reachTarget: m ? point3(foe.st[0]?.c ?? [0, 0, 0]) : null,
  };
  return {
    bodies,
    root: { p: bodies[0]!.p, q: bodies[0]!.q },
    facing: f.facing,
    velocity: [v.x, v.y, v.z],
    anim,
  };
}

export function fighterLive(f: Fighter): FighterLive {
  const c = f.bodies[0]!.worldCom();
  return {
    health: f.health,
    maxHealth: f.maxHealth,
    staggered: f.mode === "stagger" || f.mode === "held" || f.mode === "getup",
    airborne: f.airborne,
    onEdge: f.onEdge,
    intent: intentOf(f),
    facing: f.facing,
    position: [c.x, c.y, c.z],
  };
}

function foeState(f: Fighter): FoeState {
  switch (f.mode) {
    case "stagger":
    case "held":
    case "ko":
    case "out":
      return "staggered";
    case "getup":
      return "getup";
    case "showboat":
      return "showboat";
    case "move": {
      const m = f.move!;
      if (m.type === "STRIKE")
        return m.phase === "windup"
          ? "strikeWindup"
          : m.phase === "active"
            ? "strikeActive"
            : "strikeRecover";
      if (m.type === "GRAPPLE")
        return m.phase === "windup"
          ? "grappleApproach"
          : m.phase === "hold"
            ? "grappleHold"
            : "recovering";
      return m.phase === "windup" ? "trickSetup" : m.phase === "active" ? "dodging" : "recovering";
    }
    default:
      return f.airborne ? "airborne" : "ready";
  }
}

export function brainSituation(
  f: Fighter,
  foe: Fighter,
  tMs: number,
  limitMs: number,
  gap: number,
): Situation {
  const foeStrikes = foe.moves.filter((move) => move.type === "STRIKE").map((move) => move.range);
  return {
    t: tMs,
    limitMs,
    reachGap: f.reachGap,
    gap,
    health01: f.health / f.maxHealth,
    foeHealth01: foe.health / foe.maxHealth,
    edge: f.edgeDist,
    foeEdge: foe.edgeDist,
    foe: foeState(foe),
    foeThreat: foeStrikes.length ? Math.max(...foeStrikes) : foe.def.footprint,
    cooldowns: f.cooldowns,
    beenHit: f.beenHit,
  };
}
