// Pure timing for champions moving around the set outside the fight: a walk
// from a pedestal to a mark (hop down, walk, turn to the room), the roster's
// walk-on schedule (who walks when, when the camera tracks them, when their
// card rises and the Voice reads them).

import { Vector3 } from "three";
import { clamp01, easeInOutCubic } from "../ui3d/motion";

export interface WalkPath {
  /** The pedestal top it starts on. */
  from: [number, number, number];
  /** Where it hops down to. */
  down: [number, number, number];
  /** Its mark. */
  to: [number, number, number];
  /** Facing once it arrives (0 faces +z). */
  endYaw: number;
}

/** Walk speed (m/s) and the hop down from the pedestal (s). */
export const WALK_SPEED = 3;
export const HOP_DOWN_S = 0.55;
/** How high the hop off the pedestal arcs (m above the straight line). */
export const HOP_DOWN_ARC = 0.35;
/** Seconds to turn and face the room after arriving. */
export const ARRIVE_TURN_S = 0.5;

/** Seconds a walk takes (hop down + the walk; the turn comes after). */
export function walkDuration(path: WalkPath): number {
  const distance = Math.hypot(path.to[0] - path.down[0], path.to[2] - path.down[2]);
  return HOP_DOWN_S + distance / WALK_SPEED;
}

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The ground point and heading `t` seconds into a walk (t <= 0: on the pedestal; past the end: on the mark, turning to the room). */
export function walkPose(path: WalkPath, t: number, out: Vector3): { yaw: number; arrived: boolean } {
  const total = walkDuration(path);
  const walkYaw = Math.atan2(path.to[0] - path.down[0], path.to[2] - path.down[2]);
  if (t <= 0) {
    out.set(path.from[0], path.from[1], path.from[2]);
    return { yaw: path.endYaw, arrived: false };
  }
  if (t < HOP_DOWN_S) {
    const s = t / HOP_DOWN_S;
    // Turn toward the walk while hopping off.
    const yaw = path.endYaw + wrapAngle(walkYaw - path.endYaw) * easeInOutCubic(s * 1.6);
    out.set(
      path.from[0] + (path.down[0] - path.from[0]) * s,
      path.from[1] + (path.down[1] - path.from[1]) * s + 4 * HOP_DOWN_ARC * s * (1 - s),
      path.from[2] + (path.down[2] - path.from[2]) * s,
    );
    return { yaw, arrived: false };
  }
  const k = clamp01((t - HOP_DOWN_S) / Math.max(0.01, total - HOP_DOWN_S));
  // Mostly constant speed, easing into the mark.
  const e = k < 1 ? Math.min(1, k * 0.7 + easeInOutCubic(k) * 0.3) : 1;
  out.set(path.down[0] + (path.to[0] - path.down[0]) * e, path.down[1] + (path.to[1] - path.down[1]) * e, path.down[2] + (path.to[2] - path.down[2]) * e);
  if (k >= 1) {
    const turn = clamp01((t - total) / ARRIVE_TURN_S);
    return { yaw: walkYaw + wrapAngle(path.endYaw - walkYaw) * easeInOutCubic(turn), arrived: true };
  }
  return { yaw: walkYaw, arrived: false };
}

/** A walk from a pedestal top to a mark, hopping off toward the mark's side of the set. */
export function pedestalWalk(from: readonly number[], to: readonly number[], endYaw: number): WalkPath {
  const toward = Math.sign((to[0] ?? 0) - (from[0] ?? 0)) || -1;
  return {
    from: [from[0]!, from[1]!, from[2]!],
    down: [from[0]! + toward * 0.95, 0, from[2]!],
    to: [to[0]!, 0, to[2]!],
    endYaw,
  };
}

export interface RosterBeat {
  /** Scene seconds the walker leaves its pedestal. */
  start: number;
  /** Scene seconds it reaches its mark. */
  arrive: number;
  /** Its roster card starts rising. */
  cardAt: number;
}

/** Scene seconds the first walker sets off (the entry wipe is opening). */
export const ROSTER_FIRST_S = 0.4;
/** Seconds between walkers setting off: they walk out together, a step apart. */
export const ROSTER_STAGGER_S = 0.3;
/** The Voice's one line for the round, once the walk-out is under way. */
export const ROSTER_LINE_S = 0.8;
/** A card starts rising this long before its champion reaches the mark. */
const CARD_LEAD_S = 0.45;

/** All four walk out together on the roster wide, a step apart; each card rises as its champion arrives. */
export function rosterSchedule(durations: readonly number[]): RosterBeat[] {
  return durations.map((duration, index) => {
    const start = ROSTER_FIRST_S + index * ROSTER_STAGGER_S;
    const arrive = start + duration;
    return { start, arrive, cardAt: arrive - CARD_LEAD_S };
  });
}
