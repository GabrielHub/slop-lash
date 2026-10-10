// Which part of the scoreboard the scoreboard shot can actually see. The
// board hangs on the set's back wall, and a set can put a prop between it and
// Cam_Scoreboard (the rooftop's neighbouring parapet hides the board's lower
// right). The board lays its columns, and the shelf its figurines, inside the
// visible span, so no number or champion hides behind the set; the strips
// themselves still run behind the prop, as a real board would.
//
// The test runs segments from the shot's eye (its start and the end of its
// slow push) to sample points on the board, against the set's visible
// triangles inside the box that holds the eyes and the board (the scoreboard
// itself excluded). It runs once per set and board layout, in a few
// milliseconds, and is cached.

import { Box3, Mesh, Vector3, type BufferGeometry, type Object3D } from "three";
import type { ArenaNodes, PlaneNode } from "../arena/nodes";

/** A span of the board in plane x (metres from the plane's centre). */
export interface BoardSpan {
  left: number;
  right: number;
}

/**
 * The visible span from per-column visibility: the longest run of visible
 * columns. A run that reaches an end of the row keeps the full edge there;
 * elsewhere the edge is the last visible column (conservative). Null when
 * nothing is visible (the caller keeps the full width).
 */
export function visibleSpan(xs: readonly number[], visible: readonly boolean[], full: BoardSpan): BoardSpan | null {
  let best: [number, number] | null = null;
  let start = -1;
  for (let index = 0; index <= xs.length; index += 1) {
    const on = index < xs.length && visible[index] === true;
    if (on && start < 0) start = index;
    if (!on && start >= 0) {
      if (!best || index - 1 - start > best[1] - best[0]) best = [start, index - 1];
      start = -1;
    }
  }
  if (!best) return null;
  const [first, last] = best;
  return {
    left: first === 0 ? full.left : xs[first]!,
    right: last === xs.length - 1 ? full.right : xs[last]!,
  };
}

/** Sample bands on the board, in the board group's space (OnPlane: plane centre + normal * offset). */
export interface VisibilityBand {
  /** Heights to sample in each column. */
  ys: readonly number[];
  /** Depth off the plane. */
  z: number;
}

export interface BoardVisibility {
  rows: BoardSpan;
  shelf: BoardSpan;
}

/** Columns sampled across the board. */
const COLUMNS = 25;
/** Cam_Scoreboard's slow push (director anchor hold: 0.45 m along the view). */
const PUSH = 0.45;

const cache = new WeakMap<Object3D, Map<string, BoardVisibility>>();

/**
 * The spans of the board's rows band and of the shelf that Cam_Scoreboard
 * sees. Full width when the set has no Cam_Scoreboard (no set geometry to
 * test against).
 */
export function boardVisibility(nodes: ArenaNodes, plane: PlaneNode, offset: number, bands: { rows: VisibilityBand; shelf: VisibilityBand }): BoardVisibility {
  const full: BoardSpan = { left: -plane.width / 2, right: plane.width / 2 };
  const anchor = nodes.cameras.Cam_Scoreboard;
  if (!anchor) return { rows: full, shelf: full };
  const key = `${plane.width}|${plane.height}|${offset}|${bands.rows.ys.join(",")}|${bands.rows.z}|${bands.shelf.ys.join(",")}|${bands.shelf.z}`;
  let perRoot = cache.get(nodes.root);
  const hit = perRoot?.get(key);
  if (hit) return hit;

  const eyes = [anchor.position.clone(), anchor.position.clone().addScaledVector(anchor.target.clone().sub(anchor.position).normalize(), PUSH)];
  const origin = plane.position.clone().addScaledVector(plane.normal, offset);
  const toWorld = (x: number, y: number, z: number, out = new Vector3()) => out.set(x, y, z).applyQuaternion(plane.quaternion).add(origin);
  // The box every test segment lies in: the eyes and the sampled board.
  const box = new Box3().setFromPoints(eyes);
  for (const band of [bands.rows, bands.shelf]) {
    for (const y of band.ys) {
      box.expandByPoint(toWorld(full.left, y, band.z));
      box.expandByPoint(toWorld(full.right, y, band.z));
    }
  }
  box.expandByScalar(0.05);
  nodes.root.updateWorldMatrix(true, true);
  const triangles = setTriangles(nodes, box);

  const point = new Vector3();
  const seen = (x: number, y: number, z: number): boolean => {
    toWorld(x, y, z, point);
    return eyes.every((eye) => !segmentHits(triangles, eye, point));
  };
  const xs = Array.from({ length: COLUMNS }, (_, index) => full.left + (index / (COLUMNS - 1)) * plane.width);
  const spanOf = (band: VisibilityBand) => {
    const visible = xs.map((x) => band.ys.every((y) => seen(x, y, band.z)));
    return visibleSpan(xs, visible, full) ?? full;
  };
  const result: BoardVisibility = { rows: spanOf(bands.rows), shelf: spanOf(bands.shelf) };
  if (!perRoot) {
    perRoot = new Map();
    cache.set(nodes.root, perRoot);
  }
  perRoot.set(key, result);
  return result;
}

/**
 * The set's visible triangles (world space, 9 floats each) that touch `box`,
 * minus the scoreboard's own (its face and frame sit at the sample points).
 */
function setTriangles(nodes: ArenaNodes, box: Box3): Float32Array {
  const board = nodes.scoreboard?.object ?? null;
  const out: number[] = [];
  const bounds = new Box3();
  const tri = new Box3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  nodes.root.traverseVisible((object) => {
    if (!(object instanceof Mesh) || (board && isInside(object, board))) return;
    // Instanced and skinned meshes would need their per-instance or bone transforms: sets do not use them for walls.
    if ((object as { isInstancedMesh?: boolean }).isInstancedMesh || (object as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
    const geometry = object.geometry as BufferGeometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    bounds.copy(geometry.boundingBox!).applyMatrix4(object.matrixWorld);
    if (!bounds.intersectsBox(box)) return;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld);
      tri.makeEmpty().expandByPoint(a).expandByPoint(b).expandByPoint(c);
      if (!tri.intersectsBox(box)) continue;
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  });
  return new Float32Array(out);
}

/** Does the segment from `from` to `to` (stopping 3 cm short of it) cross any triangle? (Möller-Trumbore, both faces.) */
function segmentHits(triangles: Float32Array, from: Vector3, to: Vector3): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 0.1) return false;
  const near = 0.05 / length;
  const far = (length - 0.03) / length;
  for (let i = 0; i < triangles.length; i += 9) {
    const ax = triangles[i]!;
    const ay = triangles[i + 1]!;
    const az = triangles[i + 2]!;
    const e1x = triangles[i + 3]! - ax;
    const e1y = triangles[i + 4]! - ay;
    const e1z = triangles[i + 5]! - az;
    const e2x = triangles[i + 6]! - ax;
    const e2y = triangles[i + 7]! - ay;
    const e2z = triangles[i + 8]! - az;
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = from.x - ax;
    const ty = from.y - ay;
    const tz = from.z - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > near && t < far) return true;
  }
  return false;
}

function isInside(object: Object3D, ancestor: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) if (node === ancestor) return true;
  return false;
}
