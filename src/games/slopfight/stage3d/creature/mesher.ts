// The creature mesher: a resolved skeleton becomes one soft, skinned, vertex-
// coloured mesh. The render layout (render-layout.ts) turns the bones into SDF
// primitives, blended with a smooth minimum (a lot between load-bearing parts
// so the body reads as one shape, a little for horns, fins and items so they
// stay crisp); naive surface nets extract the surface, one Newton step snaps
// vertices onto it, normals come from the field gradient, and each vertex is
// skinned to its nearest bone plus that bone's nearest neighbour in the tree.
// Colour is decoupled from skinning: a vertex takes one hard label, its nearest
// bone's palette slot (or that bone's marking colour inside a painted
// marking), and every triangle whose corners disagree is split along the
// boundary, so part seams and markings are crisp toon edges. Pure TS: it runs
// in a module worker (mesher.worker.ts) or on the main thread as a fallback.

import type { Bone } from "../../body/skeleton";
import type { Vec3 } from "../../body/vec";
import type { Marking } from "../../sheet";
import type { BodyPlan, PartColor } from "../../vocab";
import { stableHash } from "../../../../lib/hash";
import { CLOSE_COLORS, FLOOR_SHADE, floorWeight, markingField, oklabDistance, type MarkingField, type Rgb } from "./paint";
import { renderLayout, type LayoutFaceInput, type LayoutPart } from "./render-layout";
import { FAR, boneDistance, marchSurface, preparePrims, primBounds, smin } from "./sdf";

export interface MeshPalette {
  /** sRGB hex colours, like "#E8553D". */
  primary: string;
  secondary: string;
  accent: string;
  /** The slots' outline (dark) hexes, for the floor shade; derived when absent. */
  dark?: { primary: string; secondary: string; accent: string };
}

export interface MeshRequest {
  bones: Bone[];
  palette: MeshPalette;
  /** Grid cells along the creature's longest side (48 while growing, 64 final). */
  resolution: number;
  /** How far primary-coloured parts fade toward the secondary at the feet (0..1). */
  gradient?: number;
  /** Render layout inputs: each part's anchor and elongation (render-layout.ts). */
  parts?: readonly LayoutPart[];
  bodyPlan?: BodyPlan;
  /** Painted markings (champion.markings). */
  markings?: readonly Marking[];
  /** Bone ids left out of the field (an item drawn as a modelled prop). */
  skip?: readonly string[];
  /** The face bone and its rest face (masks follow the eyes). */
  face?: LayoutFaceInput | null;
}

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB. */
  colors: Float32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  index: Uint32Array;
  vertexCount: number;
  triangleCount: number;
  resolution: number;
  /** Wall time of the mesh, milliseconds. */
  ms: number;
}

export const GROWTH_RESOLUTION = 48;
export const FINAL_RESOLUTION = 64;
export const DEFAULT_GRADIENT = 0.4;
/** Cells per side of a field block that may be skipped as a whole. */
const BLOCK = 4;

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** sRGB hex to linear RGB. */
export function hexToLinear(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [channel((value >> 16) & 255), channel((value >> 8) & 255), channel(value & 255)];
}

/** Bumped when the renderer's output changes for the same request. */
const RENDER_VERSION = "r3";

/** A stable cache key for a mesh request. */
export function meshKey(req: MeshRequest): string {
  const bones = req.bones
    .map(
      (b) =>
        `${b.id}|${b.role}|${b.shape}|${b.parent ?? ""}|${b.color}|${b.load ? 1 : 0}|${b.radius}|${b.head.join(",")}|${b.tail.join(",")}`,
    )
    .join(";");
  const extra = JSON.stringify([
    req.parts?.map((p) => [p.id, p.anchor, p.elongation, p.size]) ?? null,
    req.bodyPlan ?? null,
    req.markings ?? null,
    req.skip ?? null,
    req.face ?? null,
    req.palette.dark ?? null,
  ]);
  return `${RENDER_VERSION}|${req.resolution}|${req.gradient ?? DEFAULT_GRADIENT}|${req.palette.primary}${req.palette.secondary}${req.palette.accent}|${extra}|${bones}`;
}

function emptyMesh(resolution: number, ms: number): MeshData {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    colors: new Float32Array(0),
    skinIndex: new Uint16Array(0),
    skinWeight: new Float32Array(0),
    index: new Uint32Array(0),
    vertexCount: 0,
    triangleCount: 0,
    resolution,
    ms,
  };
}

/** Cube corner offsets (bit 0 = x, bit 1 = y, bit 2 = z) and the 12 cube edges. */
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export function meshCreature(req: MeshRequest): MeshData {
  const started = now();
  const res = Math.max(8, Math.round(req.resolution));
  if (req.bones.length === 0) return emptyMesh(res, 0);
  const layout = renderLayout({
    bones: req.bones,
    parts: req.parts,
    bodyPlan: req.bodyPlan,
    skip: req.skip,
    face: req.face,
    markings: req.markings,
  });
  if (layout.prims.length === 0) return emptyMesh(res, now() - started);

  // Grid: the creature's bounds plus the widest blend and a margin, cubic cells.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of layout.prims) {
    const pb = primBounds(prim);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i]!, pb.min[i]!);
      max[i] = Math.max(max[i]!, pb.max[i]!);
    }
  }
  const longest = Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  const cell = longest / res;
  const bones = preparePrims(layout.prims, cell * 2.5);
  let maxK = 0;
  for (const b of bones) maxK = Math.max(maxK, b.k);
  const pad = maxK + cell * 2.5;
  for (let i = 0; i < 3; i += 1) {
    min[i] = min[i]! - pad;
    max[i] = max[i]! + pad;
  }
  const nx = Math.ceil((max[0]! - min[0]!) / cell) + 1;
  const ny = Math.ceil((max[1]! - min[1]!) / cell) + 1;
  const nz = Math.ceil((max[2]! - min[2]!) / cell) + 1;
  const ox = min[0]!;
  const oy = min[1]!;
  const oz = min[2]!;

  // 1. Sample the blended field. Blocks of BLOCK^3 cells whose centre is
  //    further from the surface than the block's half-diagonal cannot hold
  //    any surface (the field is 1-Lipschitz), so they are filled with a
  //    same-sign bound; the rest are sampled exactly with per-bone culling.
  const field = new Float32Array(nx * ny * nz);
  const exact: number[] = [];
  const near = new Int32Array(bones.length);
  const halfDiagonal = BLOCK * cell * 0.8660254 + cell * 0.01;
  for (let bz = 0; bz * BLOCK < nz - 1; bz += 1) {
    const z0 = bz * BLOCK;
    const z1 = Math.min(z0 + BLOCK, nz - 1);
    for (let by = 0; by * BLOCK < ny - 1; by += 1) {
      const y0 = by * BLOCK;
      const y1 = Math.min(y0 + BLOCK, ny - 1);
      for (let bx = 0; bx * BLOCK < nx - 1; bx += 1) {
        const x0 = bx * BLOCK;
        const x1 = Math.min(x0 + BLOCK, nx - 1);
        const lox = ox + x0 * cell;
        const hix = ox + x1 * cell;
        const loy = oy + y0 * cell;
        const hiy = oy + y1 * cell;
        const loz = oz + z0 * cell;
        const hiz = oz + z1 * cell;
        let nearCount = 0;
        for (let i = 0; i < bones.length; i += 1) {
          const b = bones[i]!;
          if (b.max[0] < lox || b.min[0] > hix || b.max[1] < loy || b.min[1] > hiy || b.max[2] < loz || b.min[2] > hiz) continue;
          near[nearCount++] = i;
        }
        const ccx = (lox + hix) / 2;
        const ccy = (loy + hiy) / 2;
        const ccz = (loz + hiz) / 2;
        let fc = FAR;
        for (let n = 0; n < nearCount; n += 1) {
          const b = bones[near[n]!]!;
          const d = boneDistance(ccx, ccy, ccz, b);
          fc = n === 0 ? d : smin(fc, d, b.k);
        }
        if (nearCount > 0 && Math.abs(fc) <= halfDiagonal) {
          exact.push(x0, x1, y0, y1, z0, z1);
          continue;
        }
        const sign = fc < 0 ? -1 : 1;
        for (let z = z0; z <= z1; z += 1) {
          const dz = oz + z * cell - ccz;
          for (let y = y0; y <= y1; y += 1) {
            const dy = oy + y * cell - ccy;
            const base = nx * (y + ny * z);
            for (let x = x0; x <= x1; x += 1) {
              const dx = ox + x * cell - ccx;
              field[base + x] = fc - sign * Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
          }
        }
      }
    }
  }
  for (let e = 0; e < exact.length; e += 6) {
    const x0 = exact[e]!;
    const x1 = exact[e + 1]!;
    const y0 = exact[e + 2]!;
    const y1 = exact[e + 3]!;
    const z0 = exact[e + 4]!;
    const z1 = exact[e + 5]!;
    let nearCount = 0;
    const lox = ox + x0 * cell;
    const hix = ox + x1 * cell;
    const loy = oy + y0 * cell;
    const hiy = oy + y1 * cell;
    const loz = oz + z0 * cell;
    const hiz = oz + z1 * cell;
    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i]!;
      if (b.max[0] < lox || b.min[0] > hix || b.max[1] < loy || b.min[1] > hiy || b.max[2] < loz || b.min[2] > hiz) continue;
      near[nearCount++] = i;
    }
    for (let z = z0; z <= z1; z += 1) {
      const wz = oz + z * cell;
      for (let y = y0; y <= y1; y += 1) {
        const wy = oy + y * cell;
        const base = nx * (y + ny * z);
        for (let x = x0; x <= x1; x += 1) {
          const wx = ox + x * cell;
          let acc = FAR;
          let any = false;
          for (let n = 0; n < nearCount; n += 1) {
            const b = bones[near[n]!]!;
            if (wx < b.min[0] || wx > b.max[0] || wy < b.min[1] || wy > b.max[1] || wz < b.min[2] || wz > b.max[2]) continue;
            const d = boneDistance(wx, wy, wz, b);
            acc = any ? smin(acc, d, b.k) : d;
            any = true;
          }
          field[base + x] = acc;
        }
      }
    }
  }

  // 2. Surface nets: one vertex per cell the surface crosses, at the mean edge crossing.
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellVertex = new Int32Array(cx * cy * cz).fill(-1);
  const pos: number[] = [];
  const corner = new Float64Array(8);
  for (let z = 0; z < cz; z += 1) {
    for (let y = 0; y < cy; y += 1) {
      for (let x = 0; x < cx; x += 1) {
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const v = field[x + (c & 1) + nx * (y + ((c >> 1) & 1) + ny * (z + ((c >> 2) & 1)))]!;
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a]!;
          const vb = corner[b]!;
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          count += 1;
        }
        cellVertex[x + cx * (y + cy * z)] = pos.length / 3;
        pos.push(ox + (x + sx / count) * cell, oy + (y + sy / count) * cell, oz + (z + sz / count) * cell);
      }
    }
  }
  const vertexCount = pos.length / 3;
  if (vertexCount === 0) return emptyMesh(res, now() - started);

  // 3. Quads across every grid edge with a sign change, split on the shorter diagonal.
  const tris: number[] = [];
  const cellAt = (x: number, y: number, z: number) => cellVertex[x + cx * (y + cy * z)]!;
  const dist2 = (a: number, b: number) => {
    const dx = pos[a * 3]! - pos[b * 3]!;
    const dy = pos[a * 3 + 1]! - pos[b * 3 + 1]!;
    const dz = pos[a * 3 + 2]! - pos[b * 3 + 2]!;
    return dx * dx + dy * dy + dz * dz;
  };
  const quad = (v00: number, v10: number, v11: number, v01: number, outward: boolean) => {
    if (v00 < 0 || v10 < 0 || v11 < 0 || v01 < 0) return;
    const splitMain = dist2(v00, v11) <= dist2(v10, v01);
    if (outward) {
      if (splitMain) tris.push(v00, v10, v11, v00, v11, v01);
      else tris.push(v00, v10, v01, v10, v11, v01);
    } else if (splitMain) {
      tris.push(v00, v11, v10, v00, v01, v11);
    } else {
      tris.push(v00, v01, v10, v10, v01, v11);
    }
  };
  for (let z = 1; z < cz; z += 1) {
    for (let y = 1; y < cy; y += 1) {
      for (let x = 1; x < cx; x += 1) {
        const inside = field[x + nx * (y + ny * z)]! < 0;
        // Edge along x to (x+1, y, z): b = y, c = z.
        if (x < cx && inside !== field[x + 1 + nx * (y + ny * z)]! < 0) {
          quad(cellAt(x, y - 1, z - 1), cellAt(x, y, z - 1), cellAt(x, y, z), cellAt(x, y - 1, z), inside);
        }
        // Edge along y to (x, y+1, z): b = z, c = x.
        if (inside !== field[x + nx * (y + 1 + ny * z)]! < 0) {
          quad(cellAt(x - 1, y, z - 1), cellAt(x - 1, y, z), cellAt(x, y, z), cellAt(x, y, z - 1), inside);
        }
        // Edge along z to (x, y, z+1): b = x, c = y.
        if (inside !== field[x + nx * (y + ny * (z + 1))]! < 0) {
          quad(cellAt(x - 1, y - 1, z), cellAt(x, y - 1, z), cellAt(x, y, z), cellAt(x - 1, y, z), inside);
        }
      }
    }
  }

  // 4. Snap onto the surface, smooth normals from the gradient, skin weights and colour labels.
  const boneCount = req.bones.length;
  // Prepared primitives per skeleton bone, and the tree among the bones that have any.
  const primsOf: number[][] = Array.from({ length: boneCount }, () => []);
  for (const b of bones) primsOf[b.bone]!.push(b.index);
  const boneIndex = new Map(req.bones.map((bone, i) => [bone.id, i]));
  const treeParent = req.bones.map((bone) => {
    const p = bone.parent === null ? -1 : (boneIndex.get(bone.parent) ?? -1);
    return p >= 0 && primsOf[p]!.length > 0 ? p : -1;
  });
  const treeChildren: number[][] = Array.from({ length: boneCount }, () => []);
  treeParent.forEach((p, i) => {
    if (p >= 0 && primsOf[i]!.length > 0) treeChildren[p]!.push(i);
  });
  const boneK = req.bones.map((_, i) => (primsOf[i]!.length ? bones[primsOf[i]![0]!]!.k : 0));
  const distTo = (bone: number, x: number, y: number, z: number): number => {
    let d = Infinity;
    for (const pi of primsOf[bone]!) d = Math.min(d, boneDistance(x, y, z, bones[pi]!));
    return d;
  };
  // Per vertex, only the primitives whose influence box reaches it take part.
  const cand = new Int32Array(bones.length);
  let candCount = 0;
  const gather = (x: number, y: number, z: number, grow: number) => {
    candCount = 0;
    for (let i = 0; i < bones.length; i += 1) {
      const b = bones[i]!;
      if (
        x < b.min[0] - grow ||
        x > b.max[0] + grow ||
        y < b.min[1] - grow ||
        y > b.max[1] + grow ||
        z < b.min[2] - grow ||
        z > b.max[2] + grow
      ) {
        continue;
      }
      cand[candCount++] = i;
    }
  };
  const evalField = (x: number, y: number, z: number): number => {
    let acc = FAR;
    for (let c = 0; c < candCount; c += 1) {
      const b = bones[cand[c]!]!;
      const d = boneDistance(x, y, z, b);
      acc = c === 0 ? d : smin(acc, d, b.k);
    }
    return acc;
  };
  let nearestD = Infinity;
  /** The bone of the nearest gathered primitive (colour and skin both follow it); sets nearestD. */
  const nearestBone = (x: number, y: number, z: number): number => {
    let b1 = candCount > 0 ? bones[cand[0]!]!.bone : bones[0]!.bone;
    let d1 = Infinity;
    for (let c = 0; c < candCount; c += 1) {
      const prim = bones[cand[c]!]!;
      const d = boneDistance(x, y, z, prim);
      if (d < d1) {
        d1 = d;
        b1 = prim.bone;
      }
    }
    nearestD = d1;
    return b1;
  };

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const skinIndex = new Uint16Array(vertexCount * 4);
  const skinWeight = new Float32Array(vertexCount * 4);

  // Paint: every vertex takes one hard label (its nearest bone's palette slot,
  // or that bone's marking colour inside the marking), and triangles whose
  // corners disagree are split along the boundary below, so colour edges stay
  // crisp toon edges at any resolution. The floor shade is the only blend.
  const slotOrder: readonly PartColor[] = ["primary", "secondary", "accent"];
  const slot: Rgb[] = slotOrder.map((name) => hexToLinear(req.palette[name]));
  const darkHex = req.palette.dark;
  const dark: Rgb[] = darkHex ? slotOrder.map((name) => hexToLinear(darkHex[name])) : slot.map((c) => scaleRgb(c, 0.3));
  const gradient = req.gradient ?? DEFAULT_GRADIENT;
  const close = oklabDistance(slot[0]!, slot[1]!) < CLOSE_COLORS;
  const height = layout.height;
  const boneSlot = req.bones.map((bone) => slotOrder.indexOf(bone.color));
  const markSlot = req.bones.map(() => -1);
  const markField: (MarkingField | null)[] = req.bones.map(() => null);
  if (req.markings?.length) {
    const byPart = new Map(req.markings.map((m) => [m.part, m]));
    const torsoRadius = layout.bones[0]?.radius ?? 0;
    req.bones.forEach((bone, i) => {
      const m = byPart.get(bone.partId);
      if (!m || !slotOrder.includes(m.color) || primsOf[i]!.length === 0) return;
      const own = primsOf[i]!.map((pi) => bones[pi]!);
      const rb = layout.bones[i]!;
      const reach = rb.radius * 3 + rb.half * 2;
      const field = markingField(m.kind, rb, {
        face: layout.face && layout.face.bone === i ? layout.face : null,
        cell,
        seed: stableHash(bone.id),
        torsoRadius,
        surface: (from, dir) => marchSurface(own, from, dir, reach).point,
      });
      if (!field) return;
      markField[i] = field;
      markSlot[i] = slotOrder.indexOf(m.color);
    });
  }
  /** Linear RGB of a label at height y: the slot colour, the primary darkened toward the floor. */
  const colourOf = (label: number, y: number): Rgb => {
    const c = slot[label]!;
    if (label !== 0 || gradient <= 0) return c;
    const f = floorWeight(y, height);
    if (f <= 0) return c;
    return close
      ? mixRgb(c, slot[1]!, gradient * f)
      : mixRgb(c, dark[0]!, FLOOR_SHADE * (gradient / DEFAULT_GRADIENT) * f);
  };
  const tmpP: Vec3 = [0, 0, 0];
  const tmpN: Vec3 = [0, 0, 0];
  /** The label at any point near the surface (gathers its own candidates). */
  const labelAt = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    gather(x, y, z, cell * 1.5);
    const b = nearestBone(x, y, z);
    const field = markField[b];
    if (!field) return boneSlot[b]!;
    tmpP[0] = x;
    tmpP[1] = y;
    tmpP[2] = z;
    tmpN[0] = nx;
    tmpN[1] = ny;
    tmpN[2] = nz;
    return field(tmpP, tmpN) < 0 ? markSlot[b]! : boneSlot[b]!;
  };
  const vLabel = new Uint8Array(vertexCount);
  const vBone = new Int32Array(vertexCount);
  const vMark = new Float64Array(vertexCount);

  const h = cell * 0.5;
  for (let v = 0; v < vertexCount; v += 1) {
    let x = pos[v * 3]!;
    let y = pos[v * 3 + 1]!;
    let z = pos[v * 3 + 2]!;
    gather(x, y, z, cell * 1.5);
    // One Newton step toward the zero set (bounded to a cell).
    {
      const f = evalField(x, y, z);
      const gx = (evalField(x + h, y, z) - evalField(x - h, y, z)) / (2 * h);
      const gy = (evalField(x, y + h, z) - evalField(x, y - h, z)) / (2 * h);
      const gz = (evalField(x, y, z + h) - evalField(x, y, z - h)) / (2 * h);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 > 1e-12) {
        let step = f / g2;
        const len = Math.abs(step) * Math.sqrt(g2);
        if (len > cell) step *= cell / len;
        x -= gx * step;
        y -= gy * step;
        z -= gz * step;
      }
    }
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    let nxv = evalField(x + h, y, z) - evalField(x - h, y, z);
    let nyv = evalField(x, y + h, z) - evalField(x, y - h, z);
    let nzv = evalField(x, y, z + h) - evalField(x, y, z - h);
    const nl = Math.sqrt(nxv * nxv + nyv * nyv + nzv * nzv) || 1;
    nxv /= nl;
    nyv /= nl;
    nzv /= nl;
    normals[v * 3] = nxv;
    normals[v * 3 + 1] = nyv;
    normals[v * 3 + 2] = nzv;

    // Skin: nearest bone, then its nearest tree neighbour within the blend.
    const b1 = nearestBone(x, y, z);
    const d1 = nearestD;
    const firstRole = req.bones[b1]!.role;
    let b2 = -1;
    let d2 = Infinity;
    const consider = (i: number) => {
      const d = distTo(i, x, y, z);
      if (d < d2) {
        d2 = d;
        b2 = i;
      }
    };
    if (treeParent[b1]! >= 0) consider(treeParent[b1]!);
    for (const child of treeChildren[b1]!) consider(child);
    let w2 = 0;
    if (b2 >= 0 && firstRole !== "item" && req.bones[b2]!.role !== "item") {
      const width = Math.max(boneK[b1]!, boneK[b2]!, cell * 1.5);
      w2 = 0.5 * Math.min(1, Math.max(0, 1 - (d2 - d1) / width));
    }
    skinIndex[v * 4] = b1;
    skinIndex[v * 4 + 1] = b2 >= 0 ? b2 : b1;
    skinWeight[v * 4] = 1 - w2;
    skinWeight[v * 4 + 1] = w2;

    // Label: the nearest bone's slot, or its marking's inside the marking.
    vBone[v] = b1;
    const field = markField[b1];
    if (field) {
      tmpP[0] = x;
      tmpP[1] = y;
      tmpP[2] = z;
      tmpN[0] = nxv;
      tmpN[1] = nyv;
      tmpN[2] = nzv;
      const sd = field(tmpP, tmpN);
      vMark[v] = sd;
      vLabel[v] = sd < 0 ? markSlot[b1]! : boneSlot[b1]!;
    } else {
      vMark[v] = Number.NaN;
      vLabel[v] = boneSlot[b1]!;
    }
  }

  // 5. Split every triangle whose corners carry different labels along the
  //    boundary. Each label-changing edge gets one crossing point (shared by
  //    both triangles on that edge, so nothing cracks), emitted twice: same
  //    position, normal and skin, one colour per side.
  const extraPos: number[] = [];
  const extraNrm: number[] = [];
  const extraSkin: number[] = [];
  const extraLabel: number[] = [];
  let next = vertexCount;
  const addVertex = (p: Vec3, n: Vec3, skinFrom: number, label: number): number => {
    extraPos.push(p[0], p[1], p[2]);
    extraNrm.push(n[0], n[1], n[2]);
    extraSkin.push(skinFrom);
    extraLabel.push(label);
    return next++;
  };
  type Crossing = [labelA: number, indexA: number, labelB: number, indexB: number];
  const crossings = new Map<number, Crossing>();
  const crossP: Vec3 = [0, 0, 0];
  const crossN: Vec3 = [0, 0, 0];
  /** The two coloured copies of edge (a, b)'s boundary crossing. */
  const crossing = (a: number, b: number): Crossing => {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    const key = lo * vertexCount + hi;
    const hit = crossings.get(key);
    if (hit) return hit;
    const la = vLabel[lo]!;
    const lb = vLabel[hi]!;
    const sa = vMark[lo]!;
    const sb = vMark[hi]!;
    const lerpAt = (t: number) => {
      for (let k = 0; k < 3; k += 1) {
        crossP[k] = positions[lo * 3 + k]! + (positions[hi * 3 + k]! - positions[lo * 3 + k]!) * t;
        crossN[k] = normals[lo * 3 + k]! + (normals[hi * 3 + k]! - normals[lo * 3 + k]!) * t;
      }
    };
    let t: number;
    if (vBone[lo] === vBone[hi] && sa === sa && sb === sb && sa < 0 !== sb < 0) {
      // One bone, the marking's edge: its signed distance is close to linear across a cell.
      t = sa / (sa - sb);
    } else {
      let t0 = 0;
      let t1 = 1;
      for (let step = 0; step < 4; step += 1) {
        const m = (t0 + t1) / 2;
        lerpAt(m);
        if (labelAt(crossP[0], crossP[1], crossP[2], crossN[0], crossN[1], crossN[2]) === la) t0 = m;
        else t1 = m;
      }
      t = (t0 + t1) / 2;
    }
    t = Math.min(0.98, Math.max(0.02, t));
    lerpAt(t);
    const nl = Math.hypot(crossN[0], crossN[1], crossN[2]) || 1;
    const n: Vec3 = [crossN[0] / nl, crossN[1] / nl, crossN[2] / nl];
    const p: Vec3 = [crossP[0], crossP[1], crossP[2]];
    const skinFrom = t < 0.5 ? lo : hi;
    const record: Crossing = [la, addVertex(p, n, skinFrom, la), lb, addVertex(p, n, skinFrom, lb)];
    crossings.set(key, record);
    return record;
  };
  const side = (c: Crossing, label: number) => (c[0] === label ? c[1] : c[3]);
  const out: number[] = [];
  for (let k = 0; k < tris.length; k += 3) {
    const v0 = tris[k]!;
    const v1 = tris[k + 1]!;
    const v2 = tris[k + 2]!;
    const l0 = vLabel[v0]!;
    const l1 = vLabel[v1]!;
    const l2 = vLabel[v2]!;
    if (l0 === l1 && l1 === l2) {
      out.push(v0, v1, v2);
      continue;
    }
    if (l0 !== l1 && l1 !== l2 && l0 !== l2) {
      // Three labels: each corner keeps the quad up to the centroid.
      const c01 = crossing(v0, v1);
      const c12 = crossing(v1, v2);
      const c20 = crossing(v2, v0);
      const g: Vec3 = [0, 0, 0];
      const gn: Vec3 = [0, 0, 0];
      for (let j = 0; j < 3; j += 1) {
        g[j] = (positions[v0 * 3 + j]! + positions[v1 * 3 + j]! + positions[v2 * 3 + j]!) / 3;
        gn[j] = normals[v0 * 3 + j]! + normals[v1 * 3 + j]! + normals[v2 * 3 + j]!;
      }
      const gl = Math.hypot(gn[0], gn[1], gn[2]) || 1;
      gn[0] /= gl;
      gn[1] /= gl;
      gn[2] /= gl;
      const lg = labelAt(g[0], g[1], g[2], gn[0], gn[1], gn[2]);
      const skinFrom = lg === l1 ? v1 : lg === l2 ? v2 : v0;
      const g0 = addVertex(g, gn, skinFrom, l0);
      const g1 = addVertex(g, gn, skinFrom, l1);
      const g2 = addVertex(g, gn, skinFrom, l2);
      out.push(v0, side(c01, l0), g0, v0, g0, side(c20, l0));
      out.push(v1, side(c12, l1), g1, v1, g1, side(c01, l1));
      out.push(v2, side(c20, l2), g2, v2, g2, side(c12, l2));
      continue;
    }
    // Two labels: rotate so the odd corner comes first (the winding is kept).
    let a = v0;
    let b = v1;
    let c = v2;
    if (l1 !== l0 && l1 !== l2) {
      a = v1;
      b = v2;
      c = v0;
    } else if (l2 !== l0 && l2 !== l1) {
      a = v2;
      b = v0;
      c = v1;
    }
    const la = vLabel[a]!;
    const lb = vLabel[b]!;
    const ab = crossing(a, b);
    const ac = crossing(a, c);
    out.push(a, side(ab, la), side(ac, la));
    out.push(side(ab, lb), b, c, side(ab, lb), c, side(ac, lb));
  }

  // 6. Final buffers: the surface vertices, then the crossing copies.
  const total = next;
  const allPos = new Float32Array(total * 3);
  allPos.set(positions);
  allPos.set(extraPos, vertexCount * 3);
  const allNrm = new Float32Array(total * 3);
  allNrm.set(normals);
  allNrm.set(extraNrm, vertexCount * 3);
  const allSkinIndex = new Uint16Array(total * 4);
  allSkinIndex.set(skinIndex);
  const allSkinWeight = new Float32Array(total * 4);
  allSkinWeight.set(skinWeight);
  const colors = new Float32Array(total * 3);
  for (let v = 0; v < total; v += 1) {
    let label: number;
    if (v < vertexCount) {
      label = vLabel[v]!;
    } else {
      const e = v - vertexCount;
      label = extraLabel[e]!;
      const from = extraSkin[e]!;
      for (let k = 0; k < 4; k += 1) {
        allSkinIndex[v * 4 + k] = skinIndex[from * 4 + k]!;
        allSkinWeight[v * 4 + k] = skinWeight[from * 4 + k]!;
      }
    }
    const c = colourOf(label, allPos[v * 3 + 1]!);
    colors[v * 3] = c[0];
    colors[v * 3 + 1] = c[1];
    colors[v * 3 + 2] = c[2];
  }

  const index = new Uint32Array(out);
  return {
    positions: allPos,
    normals: allNrm,
    colors,
    skinIndex: allSkinIndex,
    skinWeight: allSkinWeight,
    index,
    vertexCount: total,
    triangleCount: index.length / 3,
    resolution: res,
    ms: now() - started,
  };
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scaleRgb = (a: Rgb, s: number): Rgb => [a[0] * s, a[1] * s, a[2] * s];
