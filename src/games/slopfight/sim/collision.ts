// Geometry against the fixed snapshot read at the start of a step. Both
// fighters resolve moves before physics advances, so neither gets first hit bias.
import { ringOutDistance, type ArenaGeometry } from "../arenas";
import { clamp } from "./dmath";
import type { BodyState, Fighter, WorldShape } from "./fighter";
import { hLen, qRotate, segmentSegment, vAdd, vCross, vSub, type Q4, type V3 } from "./vec";

const tuple = (v: { x: number; y: number; z: number }): V3 => [v.x, v.y, v.z];
const qTuple = (q: { x: number; y: number; z: number; w: number }): Q4 => [q.x, q.y, q.z, q.w];
export const vAtPoint = (s: BodyState, point: V3): V3 => vAdd(s.v, vCross(s.w, vSub(point, s.c)));
export function readState(f: Fighter) {
  const st: BodyState[] = [];
  for (const body of f.bodies) {
    st.push({
      p: tuple(body.translation()),
      q: qTuple(body.rotation()),
      v: tuple(body.linvel()),
      w: tuple(body.angvel()),
      c: tuple(body.worldCom()),
    });
  }
  f.st = st;
  const shapes: WorldShape[] = [];
  f.def.bodies.forEach((body, index) => {
    const s = st[index]!;
    for (const shape of body.shapes) {
      if (shape.kind === "ball") {
        const c = vAdd(s.p, qRotate(s.q, shape.center));
        shapes.push({ body: index, a: c, b: c, r: shape.radius });
      } else {
        shapes.push({
          body: index,
          a: vAdd(s.p, qRotate(s.q, shape.a)),
          b: vAdd(s.p, qRotate(s.q, shape.b)),
          r: shape.radius,
        });
      }
    }
  });
  f.shapes = shapes;
}

export const com = (f: Fighter) => f.st[0]!.c;
export const flatDir = (from: Fighter, to: Fighter): [number, number] => {
  const a = com(from);
  const b = com(to);
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  return len > 1e-6 ? [dx / len, dz / len] : [from.side === "A" ? 1 : -1, 0];
};
/** Horizontal distance from f's torso centre to the foe's nearest shape surface. */
export function surfaceReach(f: Fighter, foe: Fighter): number {
  const c = com(f);
  let best = Number.POSITIVE_INFINITY;
  for (const shape of foe.shapes) {
    const ax = shape.a[0];
    const az = shape.a[2];
    const dx = shape.b[0] - ax;
    const dz = shape.b[2] - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 1e-9 ? clamp(((c[0] - ax) * dx + (c[2] - az) * dz) / len2, 0, 1) : 0;
    const d = hLen(c[0] - (ax + dx * t), c[2] - (az + dz * t)) - shape.r;
    if (d < best) best = d;
  }
  return best;
}

/** Smallest surface gap between two shape lists, with the contact point. `rb` scales the second list's radii. */
export function minGap(
  listA: WorldShape[],
  listB: WorldShape[],
  rb = 1,
): { gap: number; point: V3; body: number } {
  let best = { gap: Number.POSITIVE_INFINITY, point: [0, 0, 0] as V3, body: -1 };
  for (const sa of listA) {
    for (const sb of listB) {
      const r2 = sb.r * rb;
      const result = segmentSegment(sa.a, sa.b, sb.a, sb.b);
      const dist = Math.sqrt(result.dist2);
      const gap = dist - sa.r - r2;
      if (gap < best.gap) {
        const t = sa.r + r2 > 0 ? sa.r / (sa.r + r2) : 0.5;
        best = {
          gap,
          point: [
            result.c1[0] + (result.c2[0] - result.c1[0]) * t,
            result.c1[1] + (result.c2[1] - result.c1[1]) * t,
            result.c1[2] + (result.c2[2] - result.c1[2]) * t,
          ],
          body: sb.body,
        };
      }
    }
  }
  return best;
}

export const shapesOf = (f: Fighter, chain: number[]) =>
  f.shapes.filter((shape) => chain.includes(shape.body));
export const coreShapes = (f: Fighter) =>
  f.shapes.filter((shape) => shape.body === 0 || f.def.bodies[shape.body]!.role === "head");

export function edgeGradient(geometry: ArenaGeometry, x: number, z: number): [number, number] {
  const e = 0.05;
  const gx = ringOutDistance(geometry, x + e, z) - ringOutDistance(geometry, x - e, z);
  const gz = ringOutDistance(geometry, x, z + e) - ringOutDistance(geometry, x, z - e);
  const len = Math.sqrt(gx * gx + gz * gz);
  if (len < 1e-9) {
    const l2 = Math.sqrt(x * x + z * z);
    return l2 > 1e-6 ? [-x / l2, -z / l2] : [0, 0];
  }
  return [gx / len, gz / len];
}

/** Horizontal unit direction from f toward the foe's centre plus an aim offset. */
export function aimedDir(f: Fighter, foe: Fighter, aim: V3): [number, number] {
  const a = com(f);
  const b = com(foe);
  const dx = b[0] + aim[0] - a[0];
  const dz = b[2] + aim[2] - a[2];
  const len = Math.sqrt(dx * dx + dz * dz);
  return len > 1e-6 ? [dx / len, dz / len] : flatDir(f, foe);
}
