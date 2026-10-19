// Framing for the fight's two-shots, as plain functions (unit-tested):
//
// - the frame's UI bands: the fight HUD along the top, The Voice's caption
//   along the bottom, and the safe area between them where the fight shots
//   keep the fighters;
// - the camera's yaw: side-on to the line between the fighters (so both
//   faces read), on the anchor's side of the set, keeping the screen order
//   (A on the left, as they spawn) across cuts unless the other side is
//   clearly better;
// - the distance and aim that put the pair's box at a set share of the safe
//   area, centred in it.
//
// A fighter is framed as a box around its torso target, sized by the shot's
// `subjectHeight` (the taller fighter's standing height).

import { MathUtils, Vector3 } from "three";

/** NDC y of the fight HUD's lower edge (the bars sit above it). */
export const HUD_BOTTOM_NDC = 0.68;

export interface SafeArea {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

/** Where the fight shots keep the fighters (NDC): under the HUD, over the caption, clear of the sides. */
export const FIGHT_SAFE: Readonly<SafeArea> = { left: -0.86, right: 0.86, bottom: -0.56, top: 0.6 };

/** A fighter's box around its torso target, in fractions of its height. */
const BOX_DOWN = 0.55;
const BOX_UP = 0.62;
const BOX_HALF = 0.42;

const UP = new Vector3(0, 1, 0);

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** A horizontal view direction as a yaw: forward = (sin yaw, 0, -cos yaw), so 0 looks down -z (the sets' front view). */
export function yawOf(forward: Vector3): number {
  return Math.atan2(forward.x, -forward.z);
}

/** A view direction from a yaw and a pitch (negative looks down). */
export function forwardOf(yaw: number, pitch: number, out: Vector3): Vector3 {
  const c = Math.cos(pitch);
  return out.set(Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c);
}

export interface SideOn {
  yaw: number;
  /** A is on the left of the frame. */
  aLeft: boolean;
}

/** Below this separation (m) the line between the fighters is noise: the last choice holds. */
const SIDE_ON_MIN_SEPARATION = 0.4;
/** The other side of the line must be this much nearer the anchor's angle (rad) to swap the screen order. */
const SIDE_SWAP_MARGIN = MathUtils.degToRad(24);

/**
 * The yaw that looks across the line from A to B. Of the two side-on angles
 * (A on the left, or B), it takes the one nearer the anchor's yaw, keeping
 * `previous.aLeft` unless the other is clearly nearer, then turns from the
 * anchor toward it by `bias` (0..1), at most `limit` radians.
 */
export function sideOnYaw(a: Vector3, b: Vector3, anchorYaw: number, previous: Readonly<SideOn> | null, bias: number, limit: number): SideOn {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.hypot(dx, dz) < SIDE_ON_MIN_SEPARATION) {
    return previous ? { ...previous } : { yaw: anchorYaw, aLeft: a.x <= b.x };
  }
  // Looking along (sin y, 0, -cos y), the frame's right is (cos y, 0, sin y): A is on the left when that points from A to B.
  const yawALeft = Math.atan2(dz, dx);
  const yawBLeft = wrapAngle(yawALeft + Math.PI);
  const offA = Math.abs(wrapAngle(yawALeft - anchorYaw));
  const offB = Math.abs(wrapAngle(yawBLeft - anchorYaw));
  let aLeft = offA <= offB;
  if (previous && previous.aLeft !== aLeft && Math.abs(offA - offB) < SIDE_SWAP_MARGIN) aLeft = previous.aLeft;
  const delta = wrapAngle((aLeft ? yawALeft : yawBLeft) - anchorYaw);
  return { yaw: anchorYaw + MathUtils.clamp(delta * bias, -limit, limit), aLeft };
}

export interface FrameOptions {
  /** Unit view direction. */
  forward: Vector3;
  /** Vertical field of view, degrees. */
  fov: number;
  aspect: number;
  safe: Readonly<SafeArea>;
  /** The pair's box fills this share of the safe area (its larger side)... */
  fill: number;
  /** ...but comes in until each fighter is at least this share of the safe area's height. */
  minSingle?: number;
  /** The pair's box never takes more than this share (it always fits). */
  fit?: number;
  minDistance: number;
  maxDistance: number;
}

export interface NdcBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const tmpCentre = new Vector3();
const tmpRight = new Vector3();
const tmpUp = new Vector3();
const tmpRel = new Vector3();
const corners: Vector3[] = Array.from({ length: 16 }, () => new Vector3());

function boxCorners(targets: readonly Vector3[], height: number): Vector3[] {
  const out: Vector3[] = [];
  const half = BOX_HALF * height;
  for (const target of targets.slice(0, 2)) {
    for (const dy of [-BOX_DOWN * height, BOX_UP * height]) {
      for (const [dx, dz] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ] as const) {
        const corner = corners[out.length]!;
        out.push(corner.set(target.x + dx, target.y + dy, target.z + dz));
      }
    }
  }
  return out;
}

/** The NDC box of `points` seen from `position` along `forward` (no roll). */
export function ndcBoxOf(points: readonly Vector3[], position: Vector3, forward: Vector3, fov: number, aspect: number, out: NdcBox): NdcBox {
  const tanV = Math.tan(MathUtils.degToRad(fov) / 2);
  tmpRight.crossVectors(forward, UP).normalize();
  tmpUp.crossVectors(tmpRight, forward).normalize();
  out.minX = Infinity;
  out.maxX = -Infinity;
  out.minY = Infinity;
  out.maxY = -Infinity;
  for (const point of points) {
    tmpRel.subVectors(point, position);
    const depth = Math.max(0.2, tmpRel.dot(forward));
    const x = tmpRel.dot(tmpRight) / (depth * tanV * aspect);
    const y = tmpRel.dot(tmpUp) / (depth * tanV);
    out.minX = Math.min(out.minX, x);
    out.maxX = Math.max(out.maxX, x);
    out.minY = Math.min(out.minY, y);
    out.maxY = Math.max(out.maxY, y);
  }
  return out;
}

/** The NDC box of the fighters' boxes (targets are torsos) for a camera. */
export function subjectsNdcBox(targets: readonly Vector3[], height: number, position: Vector3, forward: Vector3, fov: number, aspect: number, out: NdcBox): NdcBox {
  return ndcBoxOf(boxCorners(targets, height), position, forward, fov, aspect, out);
}

const box: NdcBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

/**
 * The camera for two fighters (torso targets) along `forward`: the distance
 * that gives the pair's box its share of the safe area (closer when a
 * fighter would be too small, never so close the pair spills out), and the
 * position that centres the box in the safe area. Writes the camera's
 * position and aim point; returns the distance.
 */
export function frameSubjects(targets: readonly Vector3[], height: number, o: FrameOptions, outPosition: Vector3, outAim: Vector3): number {
  const points = boxCorners(targets, height);
  const tanV = Math.tan(MathUtils.degToRad(o.fov) / 2);
  const safeW = (o.safe.right - o.safe.left) * tanV * o.aspect;
  const safeH = (o.safe.top - o.safe.bottom) * tanV;
  tmpRight.crossVectors(o.forward, UP).normalize();
  tmpUp.crossVectors(tmpRight, o.forward).normalize();
  // The pair's extent across the view, around the middle of its box.
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  tmpCentre.set(0, 0, 0);
  for (const point of points) tmpCentre.add(point);
  tmpCentre.divideScalar(Math.max(1, points.length));
  for (const point of points) {
    tmpRel.subVectors(point, tmpCentre);
    minR = Math.min(minR, tmpRel.dot(tmpRight));
    maxR = Math.max(maxR, tmpRel.dot(tmpRight));
    minU = Math.min(minU, tmpRel.dot(tmpUp));
    maxU = Math.max(maxU, tmpRel.dot(tmpUp));
  }
  // The box's larger share of the safe area is k / distance.
  const k = Math.max((maxR - minR) / safeW, (maxU - minU) / safeH);
  const single = ((BOX_UP + BOX_DOWN) * height) / safeH;
  let distance = k / o.fill;
  if (o.minSingle) distance = Math.min(distance, single / o.minSingle);
  distance = MathUtils.clamp(distance, o.minDistance, o.maxDistance);
  distance = Math.max(distance, k / (o.fit ?? 0.94));
  const share = k / distance;

  const safeX = (o.safe.left + o.safe.right) / 2;
  const safeY = (o.safe.bottom + o.safe.top) / 2;
  outPosition.copy(tmpCentre).addScaledVector(o.forward, -distance);
  // Perspective: the nearer fighter takes more of the frame than the flat
  // estimate says. Correct the distance, then centre the box (twice: the
  // shift changes the perspective a little).
  for (let pass = 0; pass < 3; pass += 1) {
    ndcBoxOf(points, outPosition, o.forward, o.fov, o.aspect, box);
    if (pass === 0) {
      const actual = Math.max((box.maxX - box.minX) / (o.safe.right - o.safe.left), (box.maxY - box.minY) / (o.safe.top - o.safe.bottom));
      const corrected = distance * (actual / Math.max(1e-4, share));
      outPosition.addScaledVector(o.forward, distance - corrected);
      distance = corrected;
      continue;
    }
    const cx = (box.minX + box.maxX) / 2 - safeX;
    const cy = (box.minY + box.maxY) / 2 - safeY;
    outPosition.addScaledVector(tmpRight, cx * distance * tanV * o.aspect).addScaledVector(tmpUp, cy * distance * tanV);
  }
  outAim.copy(outPosition).addScaledVector(o.forward, distance);
  return distance;
}
