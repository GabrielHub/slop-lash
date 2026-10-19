// The shot catalog (spec section 10). A shot is a solver that writes a camera
// pose every frame from the arena's Cam_* anchors, the shot's targets and its
// age. Solvers are pure functions of their inputs plus a small per-shot state
// (springs), so the director can cut between them freely.

import { MathUtils, Vector3 } from "three";
import { ARENAS } from "../../arenas";
import type { ArenaNodes, CameraAnchorName } from "../arena/nodes";
import { anchorFor, type Anchor } from "./anchors";
import { clamp01, easeInOutCubic, easeOutCubic, springStep } from "./noise";

export const SHOT_IDS = [
  "crane_establish",
  "walk_on_track",
  "face_off_low",
  "fight_wide",
  "fight_close",
  "impact_pop",
  "ragdoll_follow",
  "edge_drama",
  "slowmo_orbit",
  "replay",
  "winner_pose",
  "podium",
  // Anchor holds for the non-fight phases.
  "easels",
  "foundry",
  "roster",
  "scoreboard",
  "anchor",
] as const;
export type ShotId = (typeof SHOT_IDS)[number];

export interface ShotPose {
  position: Vector3;
  target: Vector3;
  /** Vertical field of view, degrees. */
  fov: number;
  /** Dutch roll, degrees. */
  roll: number;
}

export function createPose(): ShotPose {
  return { position: new Vector3(0, 3, 9), target: new Vector3(0, 0.6, 0), fov: 40, roll: 0 };
}

export function copyPose(out: ShotPose, from: ShotPose): ShotPose {
  out.position.copy(from.position);
  out.target.copy(from.target);
  out.fov = from.fov;
  out.roll = from.roll;
  return out;
}

export interface ShotParams {
  /** face_off_low: which side's anchor. walk_on_track / slowmo_orbit: direction. */
  side?: "A" | "B";
  /** The `anchor` shot (and an override for the anchor holds). */
  anchor?: CameraAnchorName;
  /** Move length in seconds (crane, orbit, podium descent). */
  duration?: number;
  /** Which target the depth of field focuses (default 0). */
  focus?: number;
  /** fight_close and replay: horizontal direction (x, z) from the targets to the camera, in place of the fight anchor's angle. */
  from?: readonly [number, number];
  /** replay: camera height above the action (low for a hit, higher to show a ring-out's drop). */
  rise?: number;
}

export interface ShotInput {
  nodes: ArenaNodes | null;
  /** World positions of the shot's targets this frame. */
  targets: readonly Vector3[];
  /** Real seconds since the shot started. */
  t: number;
  /** Real seconds this frame. */
  dt: number;
  aspect: number;
  /** The camera pose at the moment of the cut. */
  prev: ShotPose;
  params: ShotParams;
  /** True on the shot's first frame (springs snap). */
  first: boolean;
}

/** Per-shot mutable state (springs and cached anchors), reset on every cut. */
export interface ShotState {
  anchor: Anchor | null;
  /** A second anchor (the crane's end). */
  anchorEnd: Anchor | null;
  pos: Vector3;
  posVel: Vector3;
  aim: Vector3;
  aimVel: Vector3;
  last: Vector3;
  velocity: Vector3;
  value: number;
}

export function createShotState(): ShotState {
  return {
    anchor: null,
    anchorEnd: null,
    pos: new Vector3(),
    posVel: new Vector3(),
    aim: new Vector3(),
    aimVel: new Vector3(),
    last: new Vector3(),
    velocity: new Vector3(),
    value: 0,
  };
}

export interface ShotDef {
  /** Letterbox 0..1 while this shot is up (face-offs and results). */
  letterbox: number;
  /** Depth-of-field strength (hero shots only). */
  dof: number;
  solve(input: ShotInput, state: ShotState, out: ShotPose): void;
}

// ---------------------------------------------------------------------------
// helpers

const UP = new Vector3(0, 1, 0);
const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpD = new Vector3();
const tmpE = new Vector3();
const CHEST = 0.45;
const FALLBACK_CENTRE = new Vector3(0, 0.3, 0);
/** edge_drama: a drop shallower than this (platform top to the surround) is shot from above the rim. */
const SHALLOW_DROP = 1.5;
/** edge_drama over a shallow drop: camera height above the platform top (about a fighter's chest). */
const OVER_RIM_HEIGHT = 0.95;
/** edge_drama over a shallow drop: aim height above the platform top, at the fighter. */
const OVER_RIM_AIM = 0.2;

function centroid(targets: readonly Vector3[], out: Vector3): Vector3 {
  if (targets.length === 0) return out.copy(FALLBACK_CENTRE);
  out.set(0, 0, 0);
  for (const target of targets) out.add(target);
  return out.divideScalar(targets.length);
}

function spread(targets: readonly Vector3[], centre: Vector3): number {
  let radius = 0;
  for (const target of targets) radius = Math.max(radius, target.distanceTo(centre));
  return radius;
}

function springVec(
  value: Vector3,
  velocity: Vector3,
  target: Vector3,
  dt: number,
  halfLife: number,
  snap: boolean,
): void {
  if (snap) {
    value.copy(target);
    velocity.set(0, 0, 0);
    return;
  }
  for (const axis of ["x", "y", "z"] as const) {
    const [v, vel] = springStep(value[axis], velocity[axis], target[axis], dt, halfLife);
    value[axis] = v;
    velocity[axis] = vel;
  }
}

function anchorOf(input: ShotInput, state: ShotState, name: CameraAnchorName): Anchor {
  if (!state.anchor) state.anchor = anchorFor(input.nodes, input.params.anchor ?? name);
  return state.anchor;
}

/** Distance at which a sphere of `radius` fills the frame with some margin. */
function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const v = MathUtils.degToRad(fovDeg) / 2;
  const h = Math.atan(Math.tan(v) * aspect);
  return radius / Math.sin(Math.min(v, h));
}

function horizontalForward(anchor: Anchor, out: Vector3): Vector3 {
  out.subVectors(anchor.target, anchor.position);
  out.y = 0;
  if (out.lengthSq() < 1e-6) out.set(0, 0, -1);
  return out.normalize();
}

/** A slow push along the view axis: `amount` units over `seconds`. */
function push(anchor: Anchor, t: number, amount: number, seconds: number, out: ShotPose): void {
  const s = easeOutCubic(clamp01(t / seconds)) * amount;
  tmpA.subVectors(anchor.target, anchor.position).normalize();
  out.position.copy(anchor.position).addScaledVector(tmpA, s);
  out.target.copy(anchor.target);
  out.fov = anchor.fov;
  out.roll = anchor.roll;
}

function anchorHold(name: CameraAnchorName): ShotDef {
  return {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      push(anchorOf(input, state, name), input.t, 0.45, 14, out);
    },
  };
}

// ---------------------------------------------------------------------------
// the catalog

export const SHOTS: Readonly<Record<ShotId, ShotDef>> = {
  /** Lobby and arena intro: a crane from high front-left down to the marquee framing. */
  crane_establish: {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      if (!state.anchor || !state.anchorEnd) {
        state.anchor = anchorFor(input.nodes, "Cam_Establish");
        state.anchorEnd = anchorFor(input.nodes, "Cam_Establish_End");
        if (input.targets.length > 0) centroid(input.targets, state.anchorEnd.target).y += CHEST;
      }
      const start = state.anchor;
      const end = state.anchorEnd;
      const duration = input.params.duration ?? 8;
      const s = easeInOutCubic(clamp01(input.t / duration));
      // A raised mid-point gives the move a crane's arc instead of a straight dolly.
      tmpA.lerpVectors(start.position, end.position, 0.5).y += 1.2;
      const a = (1 - s) * (1 - s);
      const b = 2 * (1 - s) * s;
      const c = s * s;
      out.position.set(
        start.position.x * a + tmpA.x * b + end.position.x * c,
        start.position.y * a + tmpA.y * b + end.position.y * c,
        start.position.z * a + tmpA.z * b + end.position.z * c,
      );
      out.target.lerpVectors(start.target, end.target, s);
      out.fov = MathUtils.lerp(start.fov, end.fov, s);
      out.roll = 0;
      // After arriving, a slow sway so the lobby is never a still frame.
      const after = Math.max(0, input.t - duration);
      const sway = Math.sin(after * 0.35) * Math.min(1, after / 3);
      tmpB.subVectors(end.target, end.position).cross(UP).normalize();
      out.position.addScaledVector(tmpB, sway * 0.6);
    },
  },

  /** Roster walk-on: a side-tracking dolly that follows one fighter with a little lag. */
  walk_on_track: {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      const anchor = anchorOf(input, state, "Cam_Roster");
      const target = input.targets[0] ?? FALLBACK_CENTRE;
      if (input.first) {
        state.last.copy(target);
        state.velocity.set(0, 0, 0);
      } else if (input.dt > 0) {
        tmpC.subVectors(target, state.last).divideScalar(input.dt);
        state.velocity.lerp(tmpC, Math.min(1, input.dt * 4));
        state.last.copy(target);
      }
      const forward = horizontalForward(anchor, tmpA);
      // Lead the subject slightly in the direction it walks.
      tmpB.copy(target).addScaledVector(state.velocity, 0.35);
      tmpC.copy(tmpB).addScaledVector(forward, -3.1);
      tmpC.y = target.y + 0.85;
      springVec(state.pos, state.posVel, tmpC, input.dt, 0.28, input.first);
      tmpB.y = target.y + CHEST;
      springVec(state.aim, state.aimVel, tmpB, input.dt, 0.12, input.first);
      out.position.copy(state.pos);
      out.target.copy(state.aim);
      out.fov = 34;
      out.roll = 0;
    },
  },

  /** Face-off: low angle, letterboxed, a Dutch tilt, a slow push. */
  face_off_low: {
    letterbox: 1,
    dof: 0.85,
    solve(input, state, out) {
      const side = input.params.side ?? "A";
      const anchor = anchorOf(input, state, side === "A" ? "Cam_FaceOff_A" : "Cam_FaceOff_B");
      push(anchor, input.t, 0.25, 8, out);
      // The anchor is authored for the fighters standing on their face-off
      // marks; follow the pair when they stand off them (targets [A, B]).
      const [a, b] = input.targets;
      if (a && b) {
        const marks = input.nodes?.marks.faceOff;
        tmpB.set(-1.6, 0, 0);
        tmpC.set(1.6, 0, 0);
        if (marks?.A) tmpB.copy(marks.A.position);
        if (marks?.B) tmpC.copy(marks.B.position);
        tmpA.addVectors(a, b).sub(tmpB).sub(tmpC).multiplyScalar(0.5);
        tmpA.y = 0;
        out.target.addScaledVector(tmpA, 0.85);
      }
      out.roll = anchor.roll * 1.4 + Math.sign(anchor.roll || (side === "A" ? -1 : 1)) * 1.5;
      out.fov = anchor.fov - 2 * easeOutCubic(clamp01(input.t / 8));
    },
  },

  /** The fight default: both fighters framed, drifting sideways. */
  fight_wide: {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      const anchor = anchorOf(input, state, "Cam_FightWide");
      const centre = centroid(input.targets, tmpA);
      const radius = Math.max(1.7, spread(input.targets, centre) + 1);
      const anchorDistance = anchor.position.distanceTo(anchor.target);
      const fov = anchor.fov;
      const distance = MathUtils.clamp(
        fitDistance(radius, fov, input.aspect),
        anchorDistance * 0.85,
        anchorDistance * 1.25,
      );
      tmpB.subVectors(anchor.target, anchor.position).normalize();
      tmpC.copy(centre);
      tmpC.y += CHEST * 0.6;
      // Keep the anchor's angle; slide with the action and drift.
      const drift = Math.sin(input.t * ((2 * Math.PI) / 13)) * 0.5;
      const right = tmpD.copy(tmpB).cross(UP).normalize();
      const desired = tmpE.copy(tmpC).addScaledVector(tmpB, -distance).addScaledVector(right, drift);
      springVec(state.pos, state.posVel, desired, input.dt, 0.4, input.first);
      tmpC.addScaledVector(right, drift * 0.35);
      springVec(state.aim, state.aimVel, tmpC, input.dt, 0.22, input.first);
      out.position.copy(state.pos);
      out.target.copy(state.aim);
      out.fov = fov;
      out.roll = 0;
    },
  },

  /** Fighters within reach: closer, lower, a three-quarter angle. */
  fight_close: {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      const anchor = anchorOf(input, state, "Cam_FightWide");
      const centre = centroid(input.targets, tmpA);
      const radius = Math.max(1.05, spread(input.targets, centre) + 0.7);
      const fov = 34;
      const distance = fitDistance(radius, fov, input.aspect);
      const from = input.params.from;
      const forward = horizontalForward(anchor, tmpB);
      if (from && from[0] * from[0] + from[1] * from[1] > 1e-6) {
        forward.set(-from[0], 0, -from[1]).normalize();
      } else {
        const [a, b] = input.targets;
        forward.applyAxisAngle(UP, MathUtils.degToRad(a && b && a.x > b.x ? -24 : 24));
      }
      const desired = tmpC.copy(centre).addScaledVector(forward, -distance);
      desired.y = centre.y + 1.05;
      springVec(state.pos, state.posVel, desired, input.dt, 0.3, input.first);
      const aim = tmpD.copy(centre);
      aim.y += CHEST;
      springVec(state.aim, state.aimVel, aim, input.dt, 0.16, input.first);
      out.position.copy(state.pos);
      out.target.copy(state.aim);
      out.fov = fov;
      out.roll = 0;
    },
  },

  /** A big hit: 10% punch in on the impact, then ease part of the way back. */
  impact_pop: {
    letterbox: 0,
    dof: 0,
    solve(input, _state, out) {
      const point = input.targets[0] ?? input.prev.target;
      const back = easeOutCubic(clamp01(input.t / 0.9)) * 0.35;
      const closer = 0.1 * (1 - back);
      out.position.copy(input.prev.position).lerp(point, closer);
      out.target.copy(input.prev.target).lerp(point, 0.5);
      out.fov = input.prev.fov * (0.94 + 0.06 * back);
      out.roll = input.prev.roll;
    },
  },

  /** Follows a tumbling torso with lag. */
  ragdoll_follow: {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      const target = input.targets[0] ?? input.prev.target;
      if (input.first) {
        // Keep the side of the action the previous shot was on.
        state.velocity.subVectors(input.prev.position, target);
        state.velocity.y = 0;
        if (state.velocity.lengthSq() < 1e-4) state.velocity.set(0, 0, 1);
        state.velocity.normalize();
      }
      const desired = tmpA.copy(target).addScaledVector(state.velocity, 3.6);
      // Deep ring-outs fall below the platform origin. Follow them down instead
      // of leaving the lens among rooftop walls and spectators at y=0.
      desired.y = target.y + 1.35;
      springVec(state.pos, state.posVel, desired, input.dt, 0.5, input.first);
      tmpB.copy(target);
      tmpB.y += 0.3;
      springVec(state.aim, state.aimVel, tmpB, input.dt, 0.16, input.first);
      out.position.copy(state.pos);
      out.target.copy(state.aim);
      out.fov = 42;
      out.roll = 0;
    },
  },

  /**
   * Someone on the edge: low, from outside that edge, showing the drop. Over
   * a shallow drop (the garage's water) it rises to chest height instead and
   * looks down over the rim.
   */
  edge_drama: {
    letterbox: 0,
    dof: 0,
    solve(input, state, out) {
      const target = input.targets[0] ?? tmpD.set(0, 0, 2.5);
      if (!state.anchor) {
        const name: CameraAnchorName =
          Math.abs(target.x) > Math.abs(target.z)
            ? target.x > 0
              ? "Cam_Edge_E"
              : "Cam_Edge_W"
            : target.z > 0
              ? "Cam_Edge_S"
              : "Cam_Edge_N";
        state.anchor = anchorFor(input.nodes, input.params.anchor ?? name);
      }
      const anchor = state.anchor;
      push(anchor, input.t, 0.3, 5, out);
      // Slide along the edge toward the fighter so they sit over the drop.
      const alongX = Math.abs(anchor.position.z) > Math.abs(anchor.position.x);
      if (alongX) out.position.x = MathUtils.lerp(out.position.x, target.x, 0.55);
      else out.position.z = MathUtils.lerp(out.position.z, target.z, 0.55);
      // Look at the fighter, but keep the anchor's low aim so the drop stays in frame.
      tmpA.copy(target);
      tmpA.y += 0.2;
      out.target.lerp(tmpA, 0.6);
      out.roll = 0;
      // A shallow drop (the garage's ankle-deep water, 0.35 down) is only a
      // thin pad face from the anchors' floor-height view, so the shot read
      // as a low floor shot. Over a shallow drop, rise to chest height and
      // look down over the rim instead: the hazard then lies right beside
      // the fighter's feet. Deep drops keep the spec's low angle.
      const geometry = input.nodes ? ARENAS[input.nodes.arena].geometry : null;
      if (geometry && geometry.topY - geometry.surround.y < SHALLOW_DROP) {
        out.position.y = geometry.topY + OVER_RIM_HEIGHT;
        out.target.set(target.x, geometry.topY + OVER_RIM_AIM, target.z);
      }
    },
  },

  /** The slow-motion window: a quarter orbit around the moment, in real time. */
  slowmo_orbit: {
    letterbox: 0,
    dof: 0.6,
    solve(input, state, out) {
      const point = input.targets[0] ?? input.prev.target;
      if (input.first) {
        tmpA.subVectors(input.prev.position, point);
        state.value = Math.atan2(tmpA.x, tmpA.z);
        state.pos.set(MathUtils.clamp(Math.hypot(tmpA.x, tmpA.z), 2.2, 5), tmpA.y, 0);
      }
      const duration = input.params.duration ?? 1.1;
      const direction = input.params.side === "B" ? -1 : 1;
      const s = easeInOutCubic(clamp01(input.t / duration));
      const angle = state.value + direction * (Math.PI / 2) * s;
      const radius = state.pos.x;
      const height = MathUtils.lerp(state.pos.y, 0.85, s);
      out.position.set(point.x + Math.sin(angle) * radius, point.y + height, point.z + Math.cos(angle) * radius);
      out.target.copy(point);
      out.target.y += 0.3;
      out.fov = input.prev.fov;
      out.roll = 0;
    },
  },

  /**
   * RESULT's instant replay: low and long-lensed from `from` (off the
   * attacker's shoulder), tracking slowly across the action over `duration`
   * and pushing in a touch. Targets: [attacker, victim]; it favours the victim.
   */
  replay: {
    letterbox: 0,
    dof: 0.35,
    solve(input, state, out) {
      const [a, b] = input.targets;
      const centre = a && b ? tmpA.copy(a).lerp(b, 0.55) : centroid(input.targets, tmpA);
      const radius = Math.max(0.9, (a && b ? a.distanceTo(b) / 2 : 0) + 0.6);
      const duration = input.params.duration ?? 3;
      const s = easeInOutCubic(clamp01(input.t / duration));
      const distance = MathUtils.clamp(fitDistance(radius, 30, input.aspect), 2.2, 6);
      const from = input.params.from ?? [0, 1];
      const forward = tmpB.set(from[0], 0, from[1]);
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
      forward.normalize().applyAxisAngle(UP, MathUtils.degToRad(16) * (s - 0.5));
      const desired = tmpC.copy(centre).addScaledVector(forward, distance);
      desired.y = centre.y + (input.params.rise ?? 0.15);
      springVec(state.pos, state.posVel, desired, input.dt, 0.35, input.first);
      const aim = tmpD.copy(centre);
      aim.y += 0.25;
      springVec(state.aim, state.aimVel, aim, input.dt, 0.15, input.first);
      out.position.copy(state.pos);
      out.target.copy(state.aim);
      out.fov = 30 - 2.5 * s;
      out.roll = 0;
    },
  },

  /** The winner, close and slightly low, pushing in. */
  winner_pose: {
    letterbox: 1,
    dof: 0.85,
    solve(input, _state, out) {
      const target = input.targets[0] ?? FALLBACK_CENTRE;
      const orbit = MathUtils.degToRad(10 - 14 * easeInOutCubic(clamp01(input.t / 7)));
      const distance = 2.5 - 0.35 * easeOutCubic(clamp01(input.t / 7));
      out.position.set(
        target.x + Math.sin(orbit) * distance,
        target.y + 0.5,
        target.z + Math.cos(orbit) * distance,
      );
      out.target.copy(target);
      out.target.y += 0.55;
      out.fov = 32;
      out.roll = 0;
    },
  },

  /** The podium: crane down onto the three champions. */
  podium: {
    letterbox: 0,
    dof: 0.55,
    solve(input, state, out) {
      const anchor = anchorOf(input, state, "Cam_Podium");
      const duration = input.params.duration ?? 4;
      const s = easeOutCubic(clamp01(input.t / duration));
      out.position.copy(anchor.position).add(tmpA.set(0, 2.6 * (1 - s), 1.6 * (1 - s)));
      out.target.copy(anchor.target).add(tmpB.set(0, 0.6 * (1 - s), 0));
      out.fov = anchor.fov + 4 * (1 - s);
      out.roll = 0;
    },
  },

  easels: anchorHold("Cam_Build"),
  foundry: anchorHold("Cam_Foundry"),
  roster: anchorHold("Cam_Roster"),
  scoreboard: anchorHold("Cam_Scoreboard"),
  anchor: anchorHold("Cam_FightWide"),
};
