// Held items as modelled props: the Prop_<tag> nodes of props.glb (built by
// scripts/slopfight/blender/build_props.py), loaded once, baked into creature
// rest space at the hand (in the mouth, or strapped on) and skinned rigidly to
// the item bone, so they swing with the hand and share the body's toon look,
// outline, wobble and shadow. An item part with a finish (a golden sword) is
// tinted and shaded in that finish, like the body.
//
// Prop space (from the GLB): the origin is the grip, +Y the long axis for
// `upright` props, the business end along +Z for `aim` props, the broad face
// along +Z. Vertex colours are COLOR_0, linear like the mesher's.

import { BufferAttribute, BufferGeometry, Color, Matrix3, Matrix4, Vector3, type Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Bone, Skeleton } from "../../body/skeleton";
import type { Anchor, Finish, PartRole, PartSize } from "../../vocab";
import { FINISH_ATTRIBUTE } from "../look/toon";
import { FINISH_ID, FINISH_WOBBLE, finishColor, luminance } from "./finish-look";
import type { Rgb } from "./paint";
import type { RenderBone, RenderLayout } from "./render-layout";

export const PROPS_URL = "/models/slopfight/props.glb";

export type PropHold = "upright" | "aim" | "hanging" | "worn" | "front";

export interface PropAsset {
  tag: string;
  /** Prop-space geometry: position, normal, color (linear RGB). */
  geometry: BufferGeometry;
  /** Normals averaged over coincident corners, for the outline hull (no cracks at hard edges). */
  smoothNormals: Float32Array;
  hold: PropHold;
  /** Multiply by the champion's accent (Prop_thing). */
  tint: "accent" | null;
  min: Vector3;
  max: Vector3;
}

/** Prop scale by the item part's size, times the creature's height. */
export const PROP_SIZE: Record<PartSize, number> = { S: 0.8, M: 1, L: 1.2, XL: 1.4 };

const HOLDS: ReadonlySet<string> = new Set(["upright", "aim", "hanging", "worn", "front"]);
const LIMB_LIKE: ReadonlySet<PartRole> = new Set(["leg", "arm", "tail", "wing", "horn", "ear", "fin", "spike"]);

let library: Promise<Map<string, PropAsset>> | null = null;
let loaded: Map<string, PropAsset> | null = null;
let failed = false;

/** Did props.glb fail to load? Creatures then keep the SDF item primitive. */
export function propsFailed(): boolean {
  return failed;
}

/** The prop library if it has loaded, else null. */
export function loadedProps(): Map<string, PropAsset> | null {
  return loaded;
}

/** The prop library (loaded once per page). */
export function loadProps(): Promise<Map<string, PropAsset>> {
  if (!library) {
    library = new GLTFLoader()
      .loadAsync(PROPS_URL)
      .then((gltf) => {
        const map = new Map<string, PropAsset>();
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((object) => {
          const mesh = object as Mesh;
          if (!mesh.isMesh || !object.name.startsWith("Prop_")) return;
          const tag = object.name.slice(5);
          const extras = object.userData as { hold?: string; tint?: string };
          map.set(tag, toAsset(tag, mesh, extras));
        });
        loaded = map;
        return map;
      })
      .catch((error: unknown) => {
        failed = true;
        throw error;
      });
  }
  return library;
}

function toAsset(tag: string, mesh: Mesh, extras: { hold?: string; tint?: string }): PropAsset {
  const source = mesh.geometry as BufferGeometry;
  const geometry = new BufferGeometry();
  const position = source.getAttribute("position");
  const count = position.count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3).fill(1);
  const normal = source.getAttribute("normal");
  const color = source.getAttribute("color");
  for (let i = 0; i < count; i += 1) {
    pos[i * 3] = position.getX(i);
    pos[i * 3 + 1] = position.getY(i);
    pos[i * 3 + 2] = position.getZ(i);
    if (normal) {
      nrm[i * 3] = normal.getX(i);
      nrm[i * 3 + 1] = normal.getY(i);
      nrm[i * 3 + 2] = normal.getZ(i);
    }
    if (color) {
      col[i * 3] = color.getX(i);
      col[i * 3 + 1] = color.getY(i);
      col[i * 3 + 2] = color.getZ(i);
    }
  }
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new BufferAttribute(nrm, 3));
  geometry.setAttribute("color", new BufferAttribute(col, 3));
  if (source.index) geometry.setIndex(new BufferAttribute(new Uint32Array(source.index.array), 1));
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return {
    tag,
    geometry,
    smoothNormals: smoothNormals(geometry),
    hold: extras.hold && HOLDS.has(extras.hold) ? (extras.hold as PropHold) : "upright",
    tint: extras.tint === "accent" ? "accent" : null,
    min: box.min.clone(),
    max: box.max.clone(),
  };
}

/** Normals averaged over vertices that share a position. */
function smoothNormals(geometry: BufferGeometry): Float32Array {
  const pos = geometry.getAttribute("position") as BufferAttribute;
  const nrm = geometry.getAttribute("normal") as BufferAttribute;
  const out = new Float32Array(pos.count * 3);
  const sums = new Map<string, [number, number, number]>();
  const keyOf = (i: number) =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i += 1) {
    const key = keyOf(i);
    const sum = sums.get(key) ?? [0, 0, 0];
    sum[0] += nrm.getX(i);
    sum[1] += nrm.getY(i);
    sum[2] += nrm.getZ(i);
    sums.set(key, sum);
  }
  for (let i = 0; i < pos.count; i += 1) {
    const [x, y, z] = sums.get(keyOf(i))!;
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l;
    out[i * 3 + 1] = y / l;
    out[i * 3 + 2] = z / l;
  }
  return out;
}

/**
 * The bones the champion's item tag draws: the part of Skeleton.item (and its
 * mirror copy). Other item parts (a jetpack beside a briefcase) stay SDF
 * primitives. `skip` leaves the field; each of `roots` gets one prop.
 */
export function heldItemBones(skeleton: Skeleton): { skip: string[]; roots: number[] } {
  const item = skeleton.item ? skeleton.bones.find((b) => b.id === skeleton.item) : undefined;
  if (!item) return { skip: [], roots: [] };
  const ids = new Set(skeleton.bones.filter((b) => b.partId === item.partId).map((b) => b.id));
  const roots: number[] = [];
  skeleton.bones.forEach((b, i) => {
    if (ids.has(b.id) && (b.parent === null || !ids.has(b.parent))) roots.push(i);
  });
  return { skip: [...ids], roots };
}

export interface PropPlacement {
  skeleton: Skeleton;
  layout: RenderLayout;
  /** Index of the item bone. */
  item: number;
  hold: PropHold;
  /** The item part's anchor and size. */
  anchor: Anchor | null;
  size: PartSize;
  /** The prop's bounds in prop space (centring in the mouth). */
  min: Vector3;
  max: Vector3;
}

const UP = new Vector3(0, 1, 0);
/** How far under the eye centres a carried prop's top stays, in eye radii. */
const EYE_CLEAR = 1.15;
const FORWARD = new Vector3(0, 0, 1);
const DEG = Math.PI / 180;
/** An upright prop leans out this far, more in steps up to the cap while its top half crowds the head. */
const UPRIGHT_LEAN = 25 * DEG;
const UPRIGHT_STEP = 5 * DEG;
const UPRIGHT_MAX = 50 * DEG;
/** The top half keeps this many head radii from the head's centre. */
const HEAD_CLEAR = 1.1;
/** An aimed prop dips 10 degrees and turns this far toward the holding side. */
const AIM_DIP = 10 * DEG;
const AIM_YAW = 35 * DEG;

/** Unit `v` with its component along unit `axis` removed (or `fallback`). */
function perp(v: Vector3, axis: Vector3, fallback: Vector3): Vector3 {
  const out = v.clone().addScaledVector(axis, -v.dot(axis));
  return out.lengthSq() > 1e-10 ? out.normalize() : fallback.clone();
}

/** The basis whose +Y is `y` and whose +Z is as close to `z` as possible. */
function basis(y: Vector3, z: Vector3): Matrix4 {
  const Y = y.clone().normalize();
  const Z = perp(z, Y, perp(FORWARD, Y, new Vector3(1, 0, 0)));
  const X = new Vector3().crossVectors(Y, Z);
  return new Matrix4().makeBasis(X, Y, Z);
}

/** Prop space to creature rest space for one held item (origin = the grip). */
export function propMatrix(p: PropPlacement): Matrix4 {
  const { skeleton, layout } = p;
  const bone = skeleton.bones[p.item]!;
  const rb = layout.bones[p.item]!;
  const parentIndex = bone.parent === null ? -1 : skeleton.bones.findIndex((b) => b.id === bone.parent);
  const parent = parentIndex >= 0 ? skeleton.bones[parentIndex]! : null;
  const rp = parentIndex >= 0 ? layout.bones[parentIndex]! : null;
  const s = Math.max(skeleton.height, 0.05) * PROP_SIZE[p.size];
  const head = new Vector3(...rb.head);
  let rot: Matrix4;
  let origin = head.clone();
  let centreAt: Vector3 | null = null;
  /**
   * A carried prop hangs from the mouth line so it never covers the eyes: its
   * top at most `above` over the mouth along `up`, and (seen from the side, as
   * the cameras do) no higher in world y than `eyeFloor`, just under the eyes.
   */
  let hangFrom: { up: Vector3; above: number; eyeFloor: number } | null = null;
  const lf = layout.face;
  // No arms and no head: an item on the body is carried in the mouth.
  const armless =
    !!parent &&
    parent.parent === null &&
    !skeleton.head &&
    !skeleton.bones.some((b) => b.role === "arm") &&
    p.anchor !== "back";
  const inMouth =
    !!parent && !!rp && (parent.role === "head" || (!!lf && lf.bone === parentIndex && p.anchor !== "back") || armless);

  if (parent && rp && LIMB_LIKE.has(parent.role)) {
    // In the hand: the grip where the resolver's held layout started (its
    // distal point), undone from the item bone's rendered head.
    origin = gripPoint(bone.shape, bone.radius, rb, rp);
    const side = bone.side !== 0 ? bone.side : rb.head[0] >= 0 ? 1 : -1;
    switch (p.hold) {
      case "aim": {
        // Pointed ahead, turned toward the holding side so it reads beside the body.
        const z = new Vector3(
          side * Math.sin(AIM_YAW) * Math.cos(AIM_DIP),
          -Math.sin(AIM_DIP),
          Math.cos(AIM_YAW) * Math.cos(AIM_DIP),
        );
        rot = basis(perp(UP, z, UP), z);
        break;
      }
      case "hanging":
        rot = basis(UP, FORWARD);
        break;
      case "worn": {
        origin = new Vector3(...rp.tail);
        const along = new Vector3(...rp.tail).sub(new Vector3(...rp.head));
        rot = basis(along.lengthSq() > 1e-10 ? along : new Vector3(...rp.away), FORWARD);
        break;
      }
      case "front":
        rot = basis(UP, new Vector3(side, 0, 1).normalize());
        break;
      default: {
        // Raised like a sword held aloft, leaning out from the body; further
        // out while its top half would cross the head.
        const lean = (a: number) => basis(new Vector3(side * Math.sin(a), Math.cos(a), 0), FORWARD);
        const headIndex = skeleton.head ? skeleton.bones.findIndex((b) => b.id === skeleton.head) : -1;
        const hb = headIndex >= 0 ? layout.bones[headIndex]! : null;
        let a = UPRIGHT_LEAN;
        rot = lean(a);
        if (hb) {
          const hc = new Vector3(...hb.centre);
          const reach = HEAD_CLEAR * hb.radius;
          const crowds = (r: Matrix4) => {
            const m = new Matrix4().copy(r).scale(new Vector3(s, s, s)).setPosition(origin);
            const cx = (p.min.x + p.max.x) / 2;
            const cz = (p.min.z + p.max.z) / 2;
            const mid = (p.min.y + p.max.y) / 2;
            for (let k = 0; k <= 4; k += 1) {
              const q = new Vector3(cx, mid + ((p.max.y - mid) * k) / 4, cz).applyMatrix4(m);
              if (q.distanceTo(hc) < reach) return true;
            }
            return false;
          };
          while (a < UPRIGHT_MAX - 1e-9 && crowds(rot)) {
            a = Math.min(UPRIGHT_MAX, a + UPRIGHT_STEP);
            rot = lean(a);
          }
        }
      }
    }
  } else if (inMouth) {
    // In the mouth: crosswise over the mouth decal, a little forward.
    let mouth: Vector3;
    let forward = FORWARD;
    if (lf && (lf.bone === parentIndex || armless)) {
      mouth = new Vector3(...lf.mouthPoint).addScaledVector(new Vector3(...lf.normal), 0.1 * lf.scale);
      forward = new Vector3(...lf.normal);
    } else {
      // A head without the face: below its front, a little forward.
      mouth = new Vector3(...rp!.centre)
        .addScaledVector(FORWARD, rp!.radius)
        .addScaledVector(UP, -0.35 * rp!.radius)
        .addScaledVector(FORWARD, 0.2 * rp!.radius);
    }
    if (p.hold === "hanging") {
      rot = basis(UP, forward);
      origin = mouth;
    } else {
      rot = basis(new Vector3(1, 0, 0), forward);
      centreAt = mouth;
      if (lf && (lf.bone === parentIndex || armless)) {
        const up = new Vector3(...lf.up);
        const eyeFloor =
          Math.min(lf.eyes[0][1], lf.eyes[1][1]) - EYE_CLEAR * lf.eye * Math.max(up.y, 0) - mouth.y;
        hangFrom = { up, above: 0, eyeFloor };
      }
    }
  } else if (p.anchor === "back") {
    // Strapped flat to the back, broad face out.
    rot = basis(new Vector3(0.35, 1, 0), new Vector3(0, 0, -1));
  } else {
    // At the side, upright, tilted 15 degrees outward.
    const side = rb.head[0] >= 0 ? 1 : -1;
    const a = (15 * Math.PI) / 180;
    rot = basis(new Vector3(side * Math.sin(a), Math.cos(a), 0), FORWARD);
  }

  const m = new Matrix4().copy(rot).scale(new Vector3(s, s, s));
  if (centreAt) {
    const mid = p.min.clone().add(p.max).multiplyScalar(0.5).applyMatrix4(m);
    origin = centreAt.clone().sub(mid);
    if (hangFrom) {
      // The prop's half extent along the face's up: anything above `above` drops below the mouth.
      let top = -Infinity;
      for (let k = 0; k < 8; k += 1) {
        const corner = new Vector3(k & 1 ? p.max.x : p.min.x, k & 2 ? p.max.y : p.min.y, k & 4 ? p.max.z : p.min.z);
        top = Math.max(top, corner.applyMatrix4(m).sub(mid).dot(hangFrom.up));
      }
      origin.addScaledVector(hangFrom.up, -Math.max(0, top - hangFrom.above));
      // A face tilted up sets the prop forward and so higher on screen: drop it
      // further until its top clears the eyes in world y.
      let topY = -Infinity;
      for (let k = 0; k < 8; k += 1) {
        const corner = new Vector3(k & 1 ? p.max.x : p.min.x, k & 2 ? p.max.y : p.min.y, k & 4 ? p.max.z : p.min.z);
        topY = Math.max(topY, corner.applyMatrix4(m).add(origin).y);
      }
      const over = topY - (centreAt.y + hangFrom.eyeFloor);
      if (over > 0) {
        const down = hangFrom.up.y > 0.3 ? hangFrom.up : UP;
        origin.addScaledVector(down, -over / down.y);
      }
    }
  }
  m.setPosition(origin);
  return m;
}

/**
 * The hand an item is held in: the skeleton's held layout puts the item's head
 * a little past the limb's distal point (0.85 r below it for a box, 0.4 r along
 * the limb for a sphere, 0.2 r along the item otherwise); this undoes that.
 */
export function gripPoint(shape: Bone["shape"], r: number, rb: RenderBone, rp: RenderBone): Vector3 {
  const head = new Vector3(...rb.head);
  if (shape === "box") return head.addScaledVector(new Vector3(...rb.axis), -0.85 * r);
  if (shape === "sphere") return head.addScaledVector(new Vector3(...rp.axis), -0.4 * r);
  return head.addScaledVector(new Vector3(...rb.axis), -0.2 * r);
}

export interface BakedProp {
  /** For the toon body. */
  geometry: BufferGeometry;
  /** Same vertices with smoothed normals, for the outline hull. */
  outline: BufferGeometry;
}

/** A prop baked into creature rest space, skinned with weight 1 to `bone`, in the item part's finish. */
export function bakeProp(
  asset: PropAsset,
  matrix: Matrix4,
  bone: number,
  accent: string | null,
  finish: Finish = "vinyl",
): BakedProp {
  const geometry = asset.geometry.clone();
  geometry.applyMatrix4(matrix);
  const col = geometry.getAttribute("color") as BufferAttribute;
  if (asset.tint === "accent" && accent) {
    const tint = new Color(accent);
    for (let i = 0; i < col.count; i += 1) col.setXYZ(i, col.getX(i) * tint.r, col.getY(i) * tint.g, col.getZ(i) * tint.b);
  }
  if (finish !== "vinyl") {
    // Keep the model's light and dark (a gold blade over a darker gold hilt).
    let mean = 0;
    for (let i = 0; i < col.count; i += 1) mean += luminance([col.getX(i), col.getY(i), col.getZ(i)]);
    mean = Math.max(1e-3, mean / Math.max(1, col.count));
    for (let i = 0; i < col.count; i += 1) {
      const c: Rgb = [col.getX(i), col.getY(i), col.getZ(i)];
      const shade = Math.min(1.5, Math.max(0.4, luminance(c) / mean));
      const out = finishColor(c, finish, shade);
      col.setXYZ(i, out[0], out[1], out[2]);
    }
  }
  const count = geometry.getAttribute("position").count;
  const look = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    look[i * 2] = FINISH_ID[finish];
    look[i * 2 + 1] = FINISH_WOBBLE[finish];
  }
  geometry.setAttribute(FINISH_ATTRIBUTE, new BufferAttribute(look, 2));
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    skinIndex[i * 4] = bone;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new BufferAttribute(skinWeight, 4));
  geometry.computeBoundingSphere();
  const outline = geometry.clone();
  const smooth = new BufferAttribute(asset.smoothNormals.slice(), 3);
  smooth.applyNormalMatrix(new Matrix3().getNormalMatrix(matrix));
  smooth.normalized = false;
  for (let i = 0; i < smooth.count; i += 1) {
    const l = Math.hypot(smooth.getX(i), smooth.getY(i), smooth.getZ(i)) || 1;
    smooth.setXYZ(i, smooth.getX(i) / l, smooth.getY(i) / l, smooth.getZ(i) / l);
  }
  outline.setAttribute("normal", smooth);
  return { geometry, outline };
}
