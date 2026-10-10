// The render layout: every render-only override of a creature's body, in one
// step. It turns a resolved skeleton (plus the parts' anchors and elongations,
// the body plan and the markings) into the SDF primitives the mesher blends and
// the face marches, so decals and paint sit on the surface that is actually
// drawn. Pure TS (no three.js); the mesher worker runs it, and so do the face
// and the prop placement on the main thread, from the same inputs.
//
// The skeleton itself never changes: the sim builds physics from it and the
// animator's bone matrices map its rest space to the world. Overrides move
// only render geometry, and each bone's geometry stays rigidly skinned to that
// bone, so a moved part still animates with it. Everything is keyed by
// structure (role, shape, anchor, parent, body plan), never by subject.
//
// Overrides, in the order they apply (parents first, children inherit):
// - Spheres honour elongation: stubby squashes to 0.6 along the attachment
//   normal and widens 1.12 (cushions, shells, brims, flush spots), long
//   stretches 1.35 and narrows 0.9. A legless torso squashes about its lowest
//   point. Children ride the reshaped surface. Ear spheres keep their flatten;
//   fin spheres are round unless stubby.
// - Big add-ons scale with their parent: an unpaired fin of size L or XL on a
//   torso or head (not a face plate), or an L/XL horn cone on top, renders at
//   least 0.7 (L) or 0.95 (XL) of its parent's radius (a snowman's middle
//   ball, a car's cabin, a tortoise's shell, a house's roof). Boxes widen but
//   keep their extent along their axis.
// - Long limbs render thin (legs and arms 0.65, S 0.6, necks 0.8, tails 0.85
//   of the bone radius) and keep their far end where it was.
// - Same-anchor fan: stacked siblings (same parent, anchor and role) spread on
//   a ring (top and bottom anchors) or across the face (the other four).
// - Same-anchor siblings of different roles: the biggest unpaired part keeps
//   the anchor; pairs slide toward their own side, others toward a default
//   (ears come out from under a hat brim or a visor).
// - No hidden parts: arms, tails, horns, ears and fins on the torso or a head
//   are pushed out along the surface normal until a sphere's centre sits 0.45
//   of its radius outside the parent, or 60% of a segment's length shows.
// - Legs show: the torso and everything on it except its legs are lifted (at
//   most 0.15 of the height) and the legs stretched from the lifted hip to the
//   unchanged foot, so each leg shows below the torso (stubby: its radius,
//   normal: 0.14 of the height, long: 0.22; plus what a box's front edge hides).
// - Back tails read from the front: a leaf tail on the torso's back rises (45
//   degrees on a level torso, 55 on an upright one) and curls its last 35%
//   another 30 degrees up; L and XL capsule tails get a plume. A sphere tail
//   sits on the upper back.
// - Wings are tapered membranes whatever their shape (box: square tip, cone:
//   pointed, sphere: round paddle); a non-flier's folded wings are half raised;
//   rendered wing length is capped at 0.85 of the creature's height.
// - Floppy ears: a long ear on a side anchor hangs down along the head.
// - Arms lying along the body swing out about the shoulder until a gap shows.
// - Cones are capped (flat base disc at the head, straight sides); a cone torso
//   puts its base where the old round bottom was, so it stands.
// - Boxes have crisp corners and crisp joins.
// - Leaf tails taper to a round tip; bottom-anchored ones (tentacles, drips)
//   hang, kink in and curl out (an S). A fin cone on a level torso's back is a
//   flat tail fan. Multiped legs get a raised knee. A slitherer's tail chain
//   curls to one side so its length shows from the front.
// - Snouts, beaks and tongues (horns on the face's front) root on the lower
//   face, stay short (muzzles bulge at most 0.55 of the face radius, beaks
//   reach 0.75) and point a little down; a small cone (or a small long
//   capsule) is a thin drooping tongue, a small sphere a button nose.
// - Items drawn as modelled props are left out of the field (`skip`).
// - Face plates: a fin on the front of the face bone would cover the face.
//   Its root slides along the surface out of the way and it lies flat across
//   it: up onto the forehead on a head (a visor, a headband), down below the
//   mouth on a torso that carries the face (a stripe, a belt, a tuxedo).
// - The face: eyes shrink to stay on the front of a narrow part, and the decal
//   block moves up (on a box) or the paint makes room so a panel, belly or suit
//   on the face part never sits under the eyes or mouth.


import type { Vec3 } from "../../body/vec";
import type { Part } from "../../sheet";
import type { Anchor, MarkingKind, PartRole } from "../../vocab";

/** Wings render with a wide chord tapering to the tip (the sim keeps the skeleton radius). */
export const WING_CHORD = 1.8;
export const WING_TIP: Record<"capsule" | "cone" | "box", number> = { capsule: 0.38, cone: 0.2, box: 0.6 };
/** Rendered wing length cap, times the creature's height. */
export const WING_MAX_LENGTH = 0.85;
/** A wing's root segment: this fraction of its length, starting at this fraction of the chord. */
export const WING_ROOT = 0.28;
export const WING_ROOT_RADIUS = 0.45;
export const FLATTEN: Partial<Record<PartRole, number>> = { wing: 0.4, fin: 0.42, ear: 0.55 };
/** A fin cone on a level torso's back is a flat tail fan this thin. */
export const FAN_FLATTEN = 0.35;
/** Legs on a side with three or more legs blend less, so neighbours never web together. */
export const CROWDED_LEG_BLEND = 0.42;
export const SPHERE_STUBBY = { along: 0.6, across: 1.12 };
export const SPHERE_LONG = { along: 1.35, across: 0.9 };
/** A leaf tail's tip radius, times its base radius. */
export const TAIL_TIP = 0.5;
/** Tentacles and drips: straight to 30% of their length, kink round the ring (a swirl, so neighbours never cross), then curl out from 60%. */
export const WAVE_AT = 0.3;
export const WAVE_ANGLE = -0.6;
export const CURL_START = 0.6;
export const CURL_ANGLE = 0.9;
/** A tentacle cone renders this much thinner, tapering to this fraction. */
export const TENTACLE_CONE = 0.7;
export const TENTACLE_CONE_TIP = 0.3;
export const FAN_RING = 0.45;
export const FAN_SIDE = 0.35;
export const FAN_TILT_RING = (30 * Math.PI) / 180;
export const FAN_TILT_SIDE = (20 * Math.PI) / 180;
/** Eye radius cap with a snout or beak in front of the face, times the face radius. */
export const SNOUT_EYE = 0.38;
/** Arms swing out (about the shoulder, in steps, up to a cap) until this gap, times their radius, shows this far down them. */
export const ARM_GAP = 0.15;
export const ARM_GAP_AT = 0.6;
export const ARM_SPLAY_STEP = 0.05;
export const ARM_SPLAY_MAX = 0.45;
/** A slitherer's tail chain: the first segment turns this far (radians) to one side, the second as far again by the second value, then each turns back and forth by it. */
export const SLITHER_FIRST = 0.7;
export const SLITHER_TURN = 0.5;
/** A face plate sits this far (radians) from the face direction: above the brows or below the mouth. */
export const PLATE_ANGLE = 0.95;
/** On a box face, the plate sits this many eye radii above or below the centre (capped inside the face). */
export const PLATE_BOX_OFFSET = 2.8;
/** Big add-ons: at least this fraction of the parent's render radius. */
export const ADD_ON_SCALE: Partial<Record<Part["size"], number>> = { L: 0.7, XL: 0.95 };
/** Long limbs render thinner: legs and arms, S legs and arms, necks, tails. */
export const THIN_LIMB = 0.65;
export const THIN_LIMB_S = 0.6;
export const THIN_NECK = 0.8;
export const THIN_TAIL = 0.85;
/** Thin limbs never drop below this many cells at the final mesh resolution. */
export const THIN_FLOOR_CELLS = 1.2;
export const FINAL_CELLS = 64;
/** Protrusion floor: a sphere's centre this far (times its radius) outside its parent, or this much of a segment outside. */
export const PROTRUDE_SPHERE = 0.45;
export const PROTRUDE_SEGMENT = 0.6;
export const PROTRUDE_ROLES: ReadonlySet<PartRole> = new Set(["arm", "tail", "horn", "ear", "fin"]);
/** Visible leg below the torso: stubby (times the leg radius), normal and long (times the height); the lift cap. */
export const LEG_SHOW_STUBBY = 1;
export const LEG_SHOW_NORMAL = 0.14;
export const LEG_SHOW_LONG = 0.22;
export const LEG_LIFT_MAX = 0.15;
/** A sphere leg under a lifted torso drops back toward its foot until its centre is this many radii outside the torso. */
export const SPHERE_LEG_ATTACH = 0.6;
/** How much of a leg a box's front edge hides from the stage camera, per unit of overhang. */
export const BOX_OVERHANG_HIDE = Math.tan((32 * Math.PI) / 180);
/** Back tails: elevation on a level and an upright torso, the curl of their last part, plumes. */
export const TAIL_RISE_LEVEL = (45 * Math.PI) / 180;
export const TAIL_RISE_UPRIGHT = (55 * Math.PI) / 180;
export const TAIL_CURL_AT = 0.65;
export const TAIL_CURL = (30 * Math.PI) / 180;
export const PLUME_MID = 1.25;
export const PLUME_TIP = 0.55;
/** A sphere tail sits this high (radians above straight back) on the back. */
export const SPHERE_TAIL_RISE = (40 * Math.PI) / 180;
/** A risen tail backs off in these steps until most of it clears the body by this many of its radii. */
export const TAIL_RISE_STEP = (5 * Math.PI) / 180;
export const TAIL_SHOW = 0.5;
/** Same-anchor siblings of different roles: slide angle bounds (radians). */
export const SLIDE_MIN = 0.35;
export const SLIDE_MAX = 1;
/** Snouts: the root this far (times the face radius) under the eye line; muzzle reach, beak length, droops. */
export const SNOUT_DROP = 0.4;
export const MUZZLE_REACH = 0.55;
export const MUZZLE_TIP = 0.8;
export const MUZZLE_BLEND = 0.6;
export const MUZZLE_MIN = 0.42;
export const BEAK_LENGTH = 0.75;
export const MUZZLE_DOWN = (5 * Math.PI) / 180;
export const BEAK_DOWN = (10 * Math.PI) / 180;
export const TONGUE_DOWN = (15 * Math.PI) / 180;
export const TONGUE_THIN = 0.5;
/** Eyes stay where the surface faces the front at least this much (n . face normal). */
export const EYE_FACING = 0.4;
export const EYE_SHRINK_FLOOR = 0.6;
/** The decal block in eye radii (face.ts's standard pair): eyes, mouth, the block's top and bottom, a decal's half size. */
export const STD_EYE_X = 1.18;
export const STD_EYE_Y = 0.25;
export const STD_MOUTH_Y = -1.3;
export const DECAL_TOP = 1.8;
export const DECAL_BOTTOM = -1.9;
export const DECAL_HALF = 1.4;
/** Face-part paint starts this far (eye radii) under the mouth's lower edge; a muzzle under the eyes. */
export const PAINT_GAP = 0.5;
export const MUZZLE_TOP = STD_EYE_Y - 1.1 - 0.3;
/** On a box face carrying paint, the eye line sits this far (times the front half height) above the centre. */
export const BOX_EYE_LINE = 0.45;
/** Face-part paint needs this fraction of the front's height, else the eyes shrink to this, else it moves or goes. */
export const PAINT_ROOM = 0.3;
export const PAINT_SHRINK = 0.8;

/** Widest eye placement angle round the face, either side (keeps both eyes on the visible front at 70 degrees yaw). */
export const EYE_ANGLE_MAX = 0.8;
/** On a box face, eyes stay within this fraction of the face's half width. */
export const BOX_EYE_SPREAD = 0.6;

export const LIMB_LIKE: ReadonlySet<PartRole> = new Set(["leg", "arm", "tail", "wing", "horn", "ear", "fin", "spike"]);
export const FACE_PAINT: ReadonlySet<MarkingKind> = new Set(["panel", "belly", "suit"]);
export const AXIS: Partial<Record<Anchor, Vec3>> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [1, 0, 0],
  right: [-1, 0, 0],
};
/** Where a centred part slides when a bigger part of another role holds its anchor. */
export const SLIDE_DEFAULT: Partial<Record<Anchor, Vec3>> = {
  top: [0, 0, -1],
  front: [0, -1, 0],
  back: [0, -1, 0],
  bottom: [0, 0, -1],
  left: [0, -1, 0],
  right: [0, -1, 0],
};
export const UP: Vec3 = [0, 1, 0];
