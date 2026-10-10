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
  /** The camera's walk-on track starts... */
  trackAt: number;
  /** ...and holds this long before returning to the roster wide. */
  trackHold: number;
  /** Its roster card starts rising. */
  cardAt: number;
  /** The Voice reads it. */
  sayAt: number;
}

/** The roster wide before the first walk-on (s). */
export const ROSTER_FIRST_S = 1.5;
/** Seconds on the roster wide between walk-ons (the card rises here). */
export const ROSTER_WIDE_S = 1.6;
/** The track starts once the walker is clear of its pedestal neighbours. */
export const ROSTER_TRACK_DELAY_S = HOP_DOWN_S * 0.6;
/** The track ends this long before the walker arrives (the wide shows the arrival). */
export const ROSTER_TRACK_LEAD_S = 0.8;
/** The director's minimum shot length, plus a margin. */
const MIN_TRACK_S = 1.3;

/** One walk-on after another: track the walker, cut wide for its arrival and card, then the next. */
export function rosterSchedule(durations: readonly number[]): RosterBeat[] {
  const beats: RosterBeat[] = [];
  let start = ROSTER_FIRST_S;
  for (const duration of durations) {
    const arrive = start + duration;
    const trackAt = start + ROSTER_TRACK_DELAY_S;
    const wideAt = Math.max(trackAt + MIN_TRACK_S, arrive - ROSTER_TRACK_LEAD_S);
    beats.push({ start, arrive, trackAt, trackHold: wideAt - trackAt, cardAt: Math.max(wideAt + 0.15, arrive - 0.45), sayAt: arrive });
    start = wideAt + ROSTER_WIDE_S - ROSTER_TRACK_DELAY_S;
  }
  return beats;
}
