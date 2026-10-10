import type { Bone } from "../../body/skeleton";
import type { Vec3 } from "../../body/vec";
import type { Part } from "../../sheet";
import type { BodyPlan, MarkingKind } from "../../vocab";
import type { RenderPrim } from "./sdf";

export type LayoutPart = Pick<Part, "id" | "anchor" | "elongation" | "size">;

/** A painted marking, as far as the layout cares (champion.markings rows fit). */
export interface LayoutMarking {
  part: string;
  kind: MarkingKind;
}

export interface LayoutFaceInput {
  /** The face bone (Skeleton.head ?? Skeleton.torso). */
  bone: string;
  /** Skeleton.face.normal and .scale. */
  normal: Vec3;
  scale: number;
}

export interface LayoutInput {
  bones: readonly Bone[];
  parts?: readonly LayoutPart[];
  bodyPlan?: BodyPlan;
  /** Bone ids left out of the field (items drawn as modelled props). */
  skip?: readonly string[];
  face?: LayoutFaceInput | null;
  /** Painted markings: the face makes room for a panel, belly or suit on the face part. */
  markings?: readonly LayoutMarking[];
}

/** A bone's rendered geometry, for paint frames and prop placement. */
export interface RenderBone {
  head: Vec3;
  tail: Vec3;
  centre: Vec3;
  /** Unit axis (head to tail; a sphere's squash normal, or up). */
  axis: Vec3;
  /** Half extent along `axis`, caps included. */
  half: number;
  /** Cross radius. */
  radius: number;
  /** Unit direction away from the parent (the root: up). */
  away: Vec3;
  sphere: boolean;
  /** A segment lying closer to horizontal than vertical. */
  level: boolean;
  skip: boolean;
  /** The torso (the skeleton's root). */
  root: boolean;
}

export interface LayoutFace {
  bone: number;
  centre: Vec3;
  normal: Vec3;
  /** Face radius (Skeleton.face.scale). */
  scale: number;
  /** Base eye radius. */
  eye: number;
  /** The face bone is a box: decals go on its front face, not round it. */
  box: boolean;
  /** A snout or beak is anchored on the face's front. */
  snout: boolean;
  /** Face-plane axes: `tangent` to the creature's left, `up`. */
  tangent: Vec3;
  up: Vec3;
  /** Where a pair of eyes sits on the rendered surface (the eye line's centre). */
  eyePoint: Vec3;
  /** The face bone and its ancestors, root first: the only parts the decals march. */
  chain: number[];
  /** The decal block's offset along `up` (world units; an angle times the face radius on a round face). */
  lift: number;
  /** Surface points at the top (brows) and bottom (the mouth's lower edge) of the decal block. */
  decalTop: Vec3;
  decalBottom: Vec3;
  /** Where the standard mouth sits on the surface. */
  mouthPoint: Vec3;
  /** Surface points of the standard pair of eyes (the creature's left, then right). */
  eyes: [Vec3, Vec3];
  /** The decal rectangle round `centre`: half width along `tangent`, top and bottom along `up` (world units). */
  rect: { half: number; top: number; bottom: number };
  /** The front-facing surface round `centre`: top and bottom along `up`, half width along `tangent`. */
  front: { top: number; bottom: number; half: number };
  /** Panel, belly or suit paint on the face part: on the front below `paintTop`, on a box's sides, or not at all. */
  paint: "front" | "sides" | "none";
  /** Face-part paint stays below this surface point (under the mouth, or under the eyes for a muzzle). */
  paintTop: Vec3;
  /** The lowest front-facing surface point. */
  paintBottom: Vec3;
  /** The front snout belongs to the mouth's surface, but never catches an eye ray. */
  snoutBone: number | null;
}

export interface RenderLayout {
  prims: RenderPrim[];
  /** One per skeleton bone, same order. */
  bones: RenderBone[];
  face: LayoutFace | null;
  /** The skeleton's height (its top above the ground). */
  height: number;
}
