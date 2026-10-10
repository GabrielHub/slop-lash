// Where RESULT points winner_pose (plain functions, unit-tested against the
// shot itself). winner_pose frames from a fixed distance, its camera half a
// metre above its target, and The Voice's caption covers the bottom of the
// letterboxed frame: a short champion framed off its chest sits behind the
// caption and a long one facing the camera (a corgi's head is 0.6 m in front
// of its feet) runs out of the top. So the target is lifted to place the
// champion between the caption and the top bar, and slid toward the camera
// (which moves the camera back with it) just far enough for the whole
// champion to fit; a tall champion that cannot fit keeps its head in and lets
// the caption cover its feet.

import { MathUtils } from "three";
import type { Champion } from "../../sheet";
import { buildProxyDef } from "../../sim/proxy";
import { clamp01, easeInOutCubic } from "../director/noise";

/** winner_pose (director/shots.ts): its camera and aim heights above the target, field of view and orbit. */
const POSE_CAMERA_RISE = 0.5;
const POSE_AIM_RISE = 0.55;
const POSE_FOV = 32;
/** The dolly eases 2.5 -> 2.15 m over 7 s; RESULT holds the shot for its first ~2.7 s. */
const POSE_DISTANCE = 2.3;
/** Letterbox 1 is full 2.39:1 bars on a 16:9 frame. */
const LETTERBOX_VISIBLE = 16 / 9 / 2.39;
/** Tangent of half the visible (letterboxed) frame's height. */
const TAN_V = Math.tan(MathUtils.degToRad(POSE_FOV / 2)) * LETTERBOX_VISIBLE;
/** The champion's top stays under this fraction of the visible half (headroom, the victory pump's reach). */
const TOP_ROOM = 0.8;
/** The caption's top edge, as a fraction of the visible half below the centre (measured: 0.585). */
const CAPTION_TOP = 0.55;
/** The furthest the camera backs off for a full-body frame, metres. */
export const MAX_PULL = 1.1;
/** The rig's mean hover for fliers, as a fraction of height (creature/animator). */
const FLIER_LIFT = 0.3;
/** Rendered tops run a little over the rig height (ears, wings). */
const TOP_OVER = 1.05;

/** The winner as winner_pose sees it, facing the camera: heights above its ground point, distances toward the camera. */
export interface WinnerShape {
  bottom: number;
  top: number;
  /** How far in front of the ground point the top is. */
  topForward: number;
  /** How far in front of the ground point the body reaches (the nearest feet or snout). */
  front: number;
}

export function winnerShape(champion: Champion): WinnerShape {
  const def = buildProxyDef(champion);
  const lift = champion.bodyPlan === "FLIER" ? FLIER_LIFT * def.height : 0;
  let front = 0;
  let topY = -Infinity;
  let topForward = 0;
  for (const body of def.bodies) {
    const [, hy, hz] = body.head;
    const ends: [number, number][] = [
      [hy, hz],
      [hy + body.tip[1], hz + body.tip[2]],
    ];
    for (const [y, z] of ends) {
      front = Math.max(front, z + body.radius);
      if (y + body.radius > topY) {
        topY = y + body.radius;
        topForward = z;
      }
    }
  }
  return { bottom: lift, top: lift + def.height * TOP_OVER, topForward, front };
}

export interface WinnerFraming {
  /** Metres to slide the target toward the camera (the camera backs off as far). */
  pull: number;
  /** The target's height above the winner's ground point. */
  lift: number;
}

export function winnerPoseFraming(shape: WinnerShape): WinnerFraming {
  // The view centre climbs `rise` per metre (the shot aims a little above its camera).
  const rise = (POSE_AIM_RISE - POSE_CAMERA_RISE) / POSE_DISTANCE;
  const up = TOP_ROOM * TAN_V + rise;
  const down = CAPTION_TOP * TAN_V - rise;
  const span = shape.top - shape.bottom;
  // The least distance that fits the top under the bar and the feet over the caption.
  const need = (span + up * shape.topForward + down * shape.front) / (up + down) - POSE_DISTANCE;
  const pull = MathUtils.clamp(need, 0, MAX_PULL);
  const toTop = POSE_DISTANCE + pull - shape.topForward;
  const toFeet = POSE_DISTANCE + pull - shape.front;
  const lowest = shape.top - up * toTop;
  const highest = shape.bottom + down * toFeet;
  // Centred in the room between the two when it fits, else the head wins.
  const camera = lowest <= highest ? (lowest + highest) / 2 : lowest;
  return { pull, lift: camera - POSE_CAMERA_RISE };
}

/** winner_pose's orbit angle at `t` seconds into the shot (director/shots.ts): the camera sits at (sin, cos) of it from the target. */
export function winnerPoseOrbit(t: number): number {
  return MathUtils.degToRad(10 - 14 * easeInOutCubic(clamp01(t / 7)));
}
