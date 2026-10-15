// One creature as plain three.js: resolves the skeleton, asks the mesher for
// a body (worker, cached), keeps a skinned toon mesh plus its outline hull on
// a detached skeleton, runs the procedural animator, places the face, and
// plays the growth beats. The <Creature> component wraps it; the Fight scene
// can use either.
//
// Space: `root` stays at identity in its parent. The driver's position and
// velocity are in that parent's space, and so are the bone matrices (they
// carry the creature's translation and facing), which is also the space of
// the sim's FighterPose proxy bodies.

import {
  Bone as ThreeBone,
  BufferGeometry,
  DetachedBindMode,
  Group,
  Matrix4,
  Skeleton as ThreeSkeleton,
  SkinnedMesh,
  Vector3,
} from "three";
import { GROWTH_UNIT, resolveSkeleton, type Skeleton } from "../../body/skeleton";
import type { Face, Marking, Palette, Part } from "../../sheet";
import { TOY_COLOR_VALUES, type BodyPlan, type Delivery, type PropTag } from "../../vocab";
import { createOutlineMaterial, type OutlineMaterial } from "../look/outline";
import { createToonMaterial, createWobbleUniforms, type ToonMaterial, type WobbleUniforms } from "../look/toon";
import { CreatureAnimator, type AnimEvent, type CreatureDriver } from "./animator";
import { updateSkinBounds } from "./bounds";
import { CreatureFace } from "./face";
import { geometryFromMesh, requestMesh, warmMesher } from "./mesh-client";
import { DEFAULT_GRADIENT, FINAL_RESOLUTION, GROWTH_RESOLUTION, meshKey, type MeshData, type MeshRequest } from "./mesher";
import { bakeProp, heldItemBones, loadProps, loadedProps, propMatrix, propsFailed, type PropAsset } from "./props";
import { PuffField } from "./puffs";
import { extraFaces, renderLayout, type LayoutInput, type RenderLayout } from "./render-layout";
import { buildRig, type Rig } from "./rig";

/** What to build: a finished champion's body, or a partial one while it streams in. */
export interface CreatureSource {
  parts: readonly Part[];
  bodyPlan?: BodyPlan;
  palette?: Palette | null;
  face?: Face | null;
  /** 1..5; drives timing (default 3). */
  heft?: number;
  /** Size relative to the standard fighter (championScale). Default 1. */
  scale?: number;
  /** The three moves' deliveries (which limb strikes). */
  deliveries?: readonly Delivery[];
  /**
   * The sheet is final: fit to the standard height, mesh at full resolution,
   * cache by `hash`. While false, parts keep a fixed size as they arrive.
   */
  complete?: boolean;
  /** Mesher grid selected by the stage quality ladder. Standalone views use the full grid. */
  resolution?: number;
  /** championHash, for the mesh cache. */
  hash?: string;
  /** The held item's tag (champion.item): drawn as a modelled prop once known. */
  item?: PropTag | null;
  /** Painted markings (champion.markings). */
  markings?: readonly Marking[];
}

export type CreatureEvent =
  | { kind: "partLanded"; part: Part; boneIds: string[]; position: Vector3 }
  | { kind: "reform"; parts: number }
  | { kind: "eyesOpen" }
  | { kind: "meshed"; ms: number; resolution: number; vertices: number }
  | AnimEvent;

export interface CreatureViewOptions {
  seed?: number;
  /** Outline width in pixels at 1080p. */
  outlineWidth?: number;
  castShadow?: boolean;
  /** Show growth beats (pop, puff, eyes opening) when parts arrive. Default true. */
  growth?: boolean;
  /**
   * Only lights brighter than this leave a vinyl highlight (see the toon
   * material's `specularMinLight`). Default 1.2, tuned for a key around 2.7
   * with fill and rim below 1.8; 0 lets every light leave one.
   */
  specularMinLight?: number;
}

const DEFAULT_PALETTE: Palette = { primary: "bone", secondary: "sand", accent: "tomato" };
/** Outline hull pushed back by this many outline widths, so creases (body meets claw) stay clean. */
const OUTLINE_DEPTH_BIAS = 4;
/** The vinyl highlight: dimmer and tighter than the toon default, a glint rather than a patch. */
const SPECULAR = 0.25;
const SPECULAR_SIZE = 0.9975;
const IDENTITY = new Matrix4();
const tmpV = new Vector3();

export class CreatureView {
  readonly root = new Group();
  skeleton: Skeleton | null = null;
  rig: Rig | null = null;
  private body: SkinnedMesh<BufferGeometry, ToonMaterial> | null = null;
  private outline: SkinnedMesh<BufferGeometry, OutlineMaterial> | null = null;
  /** Modelled held items: a toon mesh and an outline hull each, skinned to the item bone. */
  private props: SkinnedMesh[] = [];
  /** The render layout of the current body (face, prop placement, face position). */
  layout: RenderLayout | null = null;
  private bones: ThreeBone[] = [];
  private threeSkeleton: ThreeSkeleton | null = null;
  private material: ToonMaterial;
  private outlineMaterial: OutlineMaterial;
  readonly wobble: WobbleUniforms;
  readonly face = new CreatureFace();
  /** Faces on the other head chain ends (a head at each end). */
  private extras: CreatureFace[] = [];
  private layoutInput: LayoutInput | null = null;
  readonly puffs = new PuffField();
  private source: CreatureSource | null = null;
  private generation = 0;
  private faceKey = "";
  private paletteKey = "";
  private bodyKey = "";
  private appliedBodyKey = "";
  private seed: number;
  private growth: boolean;
  private time = 0;
  private events: CreatureEvent[] = [];
  private pendingEyes = false;
  private wobbleOut = { amp: 0, jiggle: 0, lag: new Vector3() };
  private anim: CreatureAnimator | null = null;
  private outlineWidth: number;
  private castShadow: boolean;
  /** Latest mesh timing for readouts. */
  lastMesh: { ms: number; resolution: number; vertices: number } | null = null;

  constructor(opts: CreatureViewOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.growth = opts.growth ?? true;
    this.outlineWidth = opts.outlineWidth ?? 2.6;
    this.castShadow = opts.castShadow ?? true;
    this.wobble = createWobbleUniforms(this.seed * 1.37, 1);
    this.material = createToonMaterial({
      wobble: this.wobble,
      specular: SPECULAR,
      specularSize: SPECULAR_SIZE,
      specularMinLight: opts.specularMinLight ?? 1.2,
    });
    this.outlineMaterial = createOutlineMaterial({
      color: "#1a191d",
      width: this.outlineWidth,
      wobble: this.wobble,
      depthBias: OUTLINE_DEPTH_BIAS,
    });
    this.root.add(this.face.group);
    this.root.add(this.puffs.mesh);
    warmMesher();
  }

  get animator(): CreatureAnimator | null {
    return this.anim;
  }

  /** Set or update what the creature is. Re-meshes when the body changed. */
  setSource(source: CreatureSource) {
    const prev = this.source;
    this.source = source;
    const palette = source.palette ?? DEFAULT_PALETTE;
    const paletteKey = `${palette.primary}|${palette.secondary}|${palette.accent}`;
    if (paletteKey !== this.paletteKey) {
      this.paletteKey = paletteKey;
      this.outlineMaterial.uniforms.uColor.value.set(TOY_COLOR_VALUES[palette.primary].dark);
    }
    // Compare by content so callers may rebuild arrays freely.
    const bodyKey = JSON.stringify([
      source.parts,
      !!source.complete,
      source.scale ?? 1,
      source.bodyPlan ?? null,
      paletteKey,
      source.item ?? null,
      source.markings ?? null,
    ]);
    const bodyChanged = !prev || bodyKey !== this.bodyKey;
    const resolutionChanged = prev?.resolution !== source.resolution;
    this.bodyKey = bodyKey;
    if (bodyChanged || resolutionChanged) {
      this.remesh(source);
    } else if (this.skeleton) {
      this.syncFace(source);
    }
  }

  private remesh(source: CreatureSource) {
    const generation = ++this.generation;
    const palette = source.palette ?? DEFAULT_PALETTE;
    const scale = source.scale ?? 1;
    const skeleton = resolveSkeleton(source.parts, {
      scale,
      bodyPlan: source.bodyPlan,
      unit: source.complete ? undefined : GROWTH_UNIT,
    });
    if (skeleton.bones.length === 0) {
      this.clearBody();
      this.skeleton = null;
      return;
    }
    const resolution = source.resolution ?? (source.complete ? FINAL_RESOLUTION : GROWTH_RESOLUTION);
    // A known item tag is drawn as a modelled prop, so its bones leave the
    // field; while the tag is unknown, or props.glb is missing, the item stays
    // an SDF primitive.
    const library = loadedProps();
    const propTag = source.item && !propsFailed() && (!library || library.has(source.item)) ? source.item : null;
    const skip = propTag ? heldItemBones(skeleton).skip : [];
    const faceBone = skeleton.head ?? skeleton.torso;
    const parts = source.parts.map((p) => ({ id: p.id, anchor: p.anchor, elongation: p.elongation, size: p.size }));
    const face = { bone: faceBone, normal: skeleton.face.normal, scale: skeleton.face.scale };
    const layoutInput: LayoutInput = {
      bones: skeleton.bones,
      parts,
      bodyPlan: source.bodyPlan,
      skip,
      face,
      markings: source.markings,
    };
    const layout = renderLayout(layoutInput);
    const request: MeshRequest = {
      bones: skeleton.bones,
      palette: {
        primary: TOY_COLOR_VALUES[palette.primary].hex,
        secondary: TOY_COLOR_VALUES[palette.secondary].hex,
        accent: TOY_COLOR_VALUES[palette.accent].hex,
        dark: {
          primary: TOY_COLOR_VALUES[palette.primary].dark,
          secondary: TOY_COLOR_VALUES[palette.secondary].dark,
          accent: TOY_COLOR_VALUES[palette.accent].dark,
        },
      },
      resolution,
      gradient: DEFAULT_GRADIENT,
      parts,
      bodyPlan: source.bodyPlan,
      markings: source.markings,
      skip,
      face,
    };
    const key =
      source.complete && source.hash
        ? `${source.hash}|${scale}|${resolution}|${skip.length > 0 ? "prop" : "sdf"}`
        : meshKey(request);
    const mesh = requestMesh(request, key);
    const prop = propTag ? loadProps().then((map) => map.get(propTag) ?? null) : Promise.resolve(null);
    Promise.all([mesh, prop.catch(() => null)])
      .then(([data, asset]) => {
        if (generation !== this.generation) return;
        if (propTag && !asset) {
          // props.glb failed (or lacks the tag): mesh the item as a primitive instead.
          this.remesh({ ...source, item: null });
          return;
        }
        this.applyMesh(source, skeleton, data, layoutInput, layout, asset);
      })
      .catch(() => {
        /* a failed mesh leaves the previous body in place */
      });
  }

  private applyMesh(
    source: CreatureSource,
    skeleton: Skeleton,
    mesh: MeshData,
    layoutInput: LayoutInput,
    layout: RenderLayout,
    asset: PropAsset | null,
  ) {
    const old = this.skeleton;
    const oldRig = this.rig;
    // A quality downgrade changes the surface density, not the creature.
    // Compare with the last applied body so a pending forge update still grows.
    const bodyChanged = this.appliedBodyKey !== this.bodyKey;
    this.appliedBodyKey = this.bodyKey;
    const plan = source.bodyPlan ?? "BIPED";
    const rig = buildRig(skeleton, plan);
    this.skeleton = skeleton;
    this.rig = rig;
    this.lastMesh = { ms: mesh.ms, resolution: mesh.resolution, vertices: mesh.vertexCount };
    this.events.push({ kind: "meshed", ms: mesh.ms, resolution: mesh.resolution, vertices: mesh.vertexCount });

    // Skeleton: detached bones whose world matrices the animator writes.
    const bones = skeleton.bones.map(() => {
      const bone = new ThreeBone();
      bone.matrixAutoUpdate = false;
      bone.matrixWorldAutoUpdate = false;
      return bone;
    });
    const inverses = skeleton.bones.map(() => new Matrix4());
    const threeSkeleton = new ThreeSkeleton(bones, inverses);
    const geometry = geometryFromMesh(mesh);
    this.wobble.uHeight.value = skeleton.height;

    if (!this.body || !this.outline) {
      this.body = new SkinnedMesh(geometry, this.material);
      this.outline = new SkinnedMesh(geometry, this.outlineMaterial);
      for (const m of [this.body, this.outline]) {
        m.bindMode = DetachedBindMode;
        m.frustumCulled = false;
        m.matrixAutoUpdate = false;
      }
      this.body.castShadow = this.castShadow;
      this.body.receiveShadow = true;
      this.outline.castShadow = false;
      this.root.add(this.body, this.outline);
    } else {
      const oldGeometry = this.body.geometry;
      this.body.geometry = geometry;
      this.outline.geometry = geometry;
      oldGeometry.dispose();
    }
    this.body.bind(threeSkeleton, IDENTITY);
    this.outline.bind(threeSkeleton, IDENTITY);
    // Three otherwise skins every body vertex twice on its first draw just
    // to find the sorting centre. The shared bound follows the bones below.
    this.body.boundingSphere = geometry.boundingSphere!.clone();
    this.outline.boundingSphere = this.body.boundingSphere;
    this.layout = layout;
    this.layoutInput = layoutInput;
    this.buildProps(source, skeleton, layout, asset, threeSkeleton);
    this.threeSkeleton?.dispose();
    this.threeSkeleton = threeSkeleton;
    this.bones = bones;

    // Animator: keep motion state across re-meshes.
    if (!this.anim) {
      this.anim = new CreatureAnimator(rig, {
        plan,
        heft: source.heft ?? 3,
        seed: this.seed,
        deliveries: source.deliveries,
      });
    } else {
      this.anim.setRig(rig);
      (this.anim.opts as { heft: number }).heft = source.heft ?? 3;
      (this.anim.opts as { deliveries?: readonly Delivery[] }).deliveries = source.deliveries;
    }

    // Growth: new parts pop on with a puff; the old body re-forms into the new one.
    const firstBody = !old;
    const newIds = skeleton.bones.filter((b) => !old || !old.bones.some((o) => o.id === b.id));
    if (this.growth && bodyChanged && old && oldRig) {
      const oldTorso = old.bones.find((b) => b.id === old.torso);
      const newTorso = skeleton.bones.find((b) => b.id === skeleton.torso);
      if (oldTorso && newTorso && newTorso.radius > 1e-6) {
        const k = oldTorso.radius / newTorso.radius;
        const oc = new Vector3(...oldTorso.head).add(new Vector3(...oldTorso.tail)).multiplyScalar(0.5);
        const nc = new Vector3(...newTorso.head).add(new Vector3(...newTorso.tail)).multiplyScalar(0.5);
        if (Math.abs(k - 1) > 0.02 || oc.distanceTo(nc) > 0.01) {
          this.anim.reform(oc.divideScalar(k).sub(nc), k);
        } else {
          this.anim.squash(0.12);
        }
      }
      this.events.push({ kind: "reform", parts: source.parts.length });
    }
    if (this.growth && bodyChanged && (!firstBody || !source.complete)) {
      // Group new bones by part (a mirrored pair lands together).
      const byPart = new Map<string, string[]>();
      for (const bone of newIds) {
        const list = byPart.get(bone.partId) ?? [];
        list.push(bone.id);
        byPart.set(bone.partId, list);
      }
      for (const [partId, ids] of byPart) {
        const part = source.parts.find((p) => p.id === partId);
        for (const id of ids) this.anim.pop(id);
        if (!part) continue;
        const bone = skeleton.bones.find((b) => b.id === ids[0])!;
        const centre = new Vector3(...bone.head).add(new Vector3(...bone.tail)).multiplyScalar(0.5);
        this.pendingPuffs.push({ centre, radius: bone.radius * 1.6 + skeleton.height * 0.05, boneId: bone.id });
        this.events.push({ kind: "partLanded", part, boneIds: ids, position: centre.clone() });
      }
    }
    this.meshData = mesh;
    const rebuilt = this.syncFace(source, firstBody && !!source.complete);
    // A repaint (a mask, say) re-tints the lids even when the face stays put.
    if (!rebuilt) {
      for (const face of [this.face, ...this.extras]) if (face.boneId) face.sampleSkin(mesh.positions, mesh.colors);
    }
  }

  /** Bake the held prop onto the item part's bone (a mirrored pair holds two). */
  private buildProps(
    source: CreatureSource,
    skeleton: Skeleton,
    layout: RenderLayout,
    asset: PropAsset | null,
    threeSkeleton: ThreeSkeleton,
  ) {
    this.clearProps();
    if (!asset) return;
    const palette = source.palette ?? DEFAULT_PALETTE;
    const accent = TOY_COLOR_VALUES[palette.accent].hex;
    for (const i of heldItemBones(skeleton).roots) {
      const bone = skeleton.bones[i]!;
      const part = source.parts.find((p) => p.id === bone.partId);
      const matrix = propMatrix({
        skeleton,
        layout,
        item: i,
        hold: asset.hold,
        anchor: part?.anchor ?? null,
        size: part?.size ?? "M",
        min: asset.min,
        max: asset.max,
      });
      const baked = bakeProp(asset, matrix, i, accent);
      const body = new SkinnedMesh(baked.geometry, this.material);
      const hull = new SkinnedMesh(baked.outline, this.outlineMaterial);
      for (const m of [body, hull]) {
        m.bindMode = DetachedBindMode;
        m.frustumCulled = false;
        m.matrixAutoUpdate = false;
        m.bind(threeSkeleton, IDENTITY);
      }
      body.castShadow = this.castShadow;
      body.receiveShadow = true;
      hull.castShadow = false;
      this.root.add(body, hull);
      this.props.push(body, hull);
    }
  }

  private clearProps() {
    for (const m of this.props) {
      this.root.remove(m);
      m.geometry.dispose();
    }
    this.props = [];
  }

  private pendingPuffs: { centre: Vector3; radius: number; boneId: string }[] = [];
  private meshData: MeshData | null = null;

  /** Rebuild the face decals when the face or the surface under it changed; true when rebuilt. */
  private syncFace(source: CreatureSource, instant = false): boolean {
    const skeleton = this.skeleton;
    if (!skeleton) return false;
    const palette = source.palette ?? DEFAULT_PALETTE;
    const face = source.face ?? null;
    const lf = this.layout?.face;
    const extraInputs = extraFaces(skeleton);
    const surface = lf
      ? `${lf.eyePoint.join(",")}|${lf.eye}|${lf.chain.length}|${extraInputs.map((f) => f.bone).join(",")}`
      : "";
    const key = face
      ? `${face.eyes}|${face.mouth}|${palette.accent}|${skeleton.face.pos.join(",")}|${skeleton.height}|${surface}`
      : "";
    if (key === this.faceKey) return false;
    const hadFace = this.faceKey !== "";
    this.faceKey = key;
    this.clearExtras();
    if (!face) {
      this.face.clear();
      return true;
    }
    const faceBone = skeleton.head ?? skeleton.torso;
    const bone = skeleton.bones.find((b) => b.id === faceBone);
    this.face.build(
      {
        skeleton,
        face,
        accent: TOY_COLOR_VALUES[palette.accent].hex,
        skin: TOY_COLOR_VALUES[bone ? palette[bone.color] : palette.primary].hex,
        layout: this.layout ?? undefined,
      },
      this.seed,
    );
    extraInputs.forEach((input, k) => {
      const extra = new CreatureFace();
      const head = skeleton.bones.find((b) => b.id === input.bone)!;
      const layout = this.layoutInput ? renderLayout({ ...this.layoutInput, face: input }) : undefined;
      extra.build(
        {
          skeleton,
          face,
          accent: TOY_COLOR_VALUES[palette.accent].hex,
          skin: TOY_COLOR_VALUES[palette[head.color]].hex,
          layout,
          bone: input.bone,
        },
        this.seed + 17 * (k + 1),
      );
      this.root.add(extra.group);
      this.extras.push(extra);
    });
    for (const f of [this.face, ...this.extras]) {
      if (this.meshData) f.sampleSkin(this.meshData.positions, this.meshData.colors);
      if (hadFace || instant || !this.growth) {
        f.showOpen();
      } else {
        f.revealEyes(0.2);
        this.pendingEyes = true;
      }
    }
    return true;
  }

  private clearExtras() {
    for (const extra of this.extras) {
      this.root.remove(extra.group);
      extra.dispose();
    }
    this.extras = [];
  }

  private clearBody() {
    if (this.body) {
      this.root.remove(this.body);
      this.body.geometry.dispose();
      this.body = null;
    }
    if (this.outline) {
      this.root.remove(this.outline);
      this.outline = null;
    }
    this.clearProps();
    this.clearExtras();
    this.layout = null;
    this.layoutInput = null;
    this.threeSkeleton?.dispose();
    this.threeSkeleton = null;
    this.bones = [];
    this.face.clear();
    this.faceKey = "";
    this.meshData = null;
  }

  /** A hit: the jelly jiggles for about half a second. */
  jiggle(strength = 1) {
    this.anim?.jiggle(strength);
  }

  squash(amount: number) {
    this.anim?.squash(amount);
  }

  /** A bone's current centre in parent space (for effects); false when unknown. */
  boneCentre(id: string, out: Vector3): boolean {
    const rig = this.rig;
    const anim = this.anim;
    if (!rig || !anim) return false;
    const index = rig.index.get(id);
    if (index === undefined) return false;
    const bone = rig.bones[index]!;
    out.copy(bone.head).lerp(bone.tail, 0.5).applyMatrix4(anim.matrices[index]!);
    return true;
  }

  /** The face's current position in parent space (camera targets, speech). */
  facePosition(out: Vector3): boolean {
    const skeleton = this.skeleton;
    const rig = this.rig;
    const anim = this.anim;
    if (!skeleton || !rig || !anim) return false;
    const id = skeleton.head ?? skeleton.torso;
    const index = rig.index.get(id);
    if (index === undefined) return false;
    // Where the eyes sit on the rendered surface (the layout may move the head).
    const lf = this.layout?.face;
    if (lf) out.set(...lf.eyePoint);
    else out.set(...skeleton.face.pos);
    out.applyMatrix4(anim.matrices[index]!);
    return true;
  }

  get height(): number {
    return this.skeleton?.height ?? 0;
  }

  /** Advance one frame. Returns the events since the last call (growth, steps, hops, flaps). */
  update(dt: number, driver: CreatureDriver): CreatureEvent[] {
    this.time += dt;
    const anim = this.anim;
    const out = this.events;
    this.events = [];
    if (anim && this.rig && this.bones.length === this.rig.bones.length) {
      const animEvents = anim.update(dt, driver);
      for (let i = 0; i < this.bones.length; i += 1) this.bones[i]!.matrixWorld.copy(anim.matrices[i]!);
      if (this.body?.boundingSphere && this.body.geometry.boundingSphere) {
        updateSkinBounds(this.body.boundingSphere, this.body.geometry.boundingSphere, anim.matrices);
      }
      anim.wobble(this.wobbleOut);
      this.wobble.uTime.value = this.time;
      this.wobble.uWobbleAmp.value = this.wobbleOut.amp;
      this.wobble.uJiggle.value = this.wobbleOut.jiggle;
      this.wobble.uLag.value.copy(this.wobbleOut.lag);
      for (const event of animEvents) {
        out.push(event);
        if (event.kind === "hopLand") this.puffs.emit(event.position, this.height * 0.35, "dust");
        // Only the heaviest fighters kick up dust when they walk (no particle spam).
        if (event.kind === "footstep" && (this.source?.heft ?? 3) >= 5) {
          this.puffs.emit(event.position, this.height * 0.18, "dust", 3);
        }
      }
      // Puffs for parts that landed (now that the bones have matrices).
      for (const puff of this.pendingPuffs) {
        const index = this.rig.index.get(puff.boneId) ?? this.rig.torso;
        tmpV.copy(puff.centre).applyMatrix4(anim.matrices[index]!);
        this.puffs.emit(tmpV.clone(), puff.radius, "puff");
      }
      this.pendingPuffs = [];
      const striking = driver.anim?.movePhase === "active" || driver.anim?.movePhase === "hold";
      for (const face of this.extras.length ? [this.face, ...this.extras] : [this.face]) {
        const faceIndex = face.boneId ? this.rig.index.get(face.boneId) : undefined;
        if (faceIndex !== undefined) {
          face.update(dt, this.time, anim.expression, anim.blink, striking, anim.matrices[faceIndex]!, this.wobble);
        }
      }
      if (this.pendingEyes) {
        this.pendingEyes = false;
        out.push({ kind: "eyesOpen" });
      }
    }
    this.puffs.update(dt);
    return out;
  }

  dispose() {
    this.generation += 1;
    // React StrictMode (dev) replays a mounted <Creature>'s effects on the same
    // view: dispose, then setSource again. Forget the source so that replay
    // re-meshes instead of keeping the mesh this dispose just cancelled.
    this.source = null;
    this.bodyKey = "";
    this.clearBody();
    this.material.dispose();
    this.outlineMaterial.dispose();
    this.face.dispose();
    this.puffs.dispose();
  }
}
