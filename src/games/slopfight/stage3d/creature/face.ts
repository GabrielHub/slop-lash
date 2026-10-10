// Eyes and mouth: flat decals on the head (or the torso's front when there is
// no head), big enough to read from a couch. They are what makes a blob a
// character, so most of the design lives here.
//
// - Placement: rays from the face bone's centre are marched through the same
//   blended field the mesher uses, so the decals sit on the real soft surface
//   (spheres, capsules and boxes alike) and face along its normal. Each decal
//   is a small plane bent to the head's curvature.
// - Eyes: one SDF shader draws every style (sclera, pupil, highlights, star
//   sparkles, upper and lower lids in the skin colour, brows, a visor band,
//   bead eyes with a light ring on dark skin). Lids animate blink, squint,
//   wide, smug, annoyed and closed; pupils wander; googly pupils hang on
//   springs and slosh when the head moves.
// - Mouths: small canvas textures per MOUTH_STYLE plus open variants, swapped
//   by expression and strikes. Beaks use the accent colour.
// - Growth: the face appears after the parts, eyes closed, then opens (eyes
//   open last).

import {
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import type { Skeleton } from "../../body/skeleton";
import type { Vec3 } from "../../body/vec";
import type { EyeStyle, MouthStyle } from "../../vocab";
import type { WobbleUniforms } from "../look/toon";
import type { Expression } from "./animator";
import { facePrims, faceSpot, renderLayout, type RenderLayout } from "./render-layout";

export { BOX_EYE_SPREAD, EYE_ANGLE_MAX } from "./render-layout";

export interface FaceSpec {
  eyes: EyeStyle;
  mouth: MouthStyle;
}

import { BASE, EYE_LOOKS, EyeKind, eyeMaterial, mouthShapeFor, mouthTexture, type EyeLook, type EyeSlot, type EyeUniforms, type MouthShape } from "./face-materials";

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** A plane of half extents (hw, hh) bent onto a sphere of radius `bend` (curving away along -z). */
function bentPlane(hw: number, hh: number, bend: number): BufferGeometry {
  const geometry = new PlaneGeometry(hw * 2, hh * 2, 8, 8);
  const pos = geometry.attributes.position!;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, -(x * x + y * y) / (2 * Math.max(bend, 1e-3)));
  }
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Lid and brow tilt uniforms for one eye. Positive tilt is angry: on each eye
 * the inner end (toward the nose) sits low. The eye on the creature's left
 * (+x, side 1) has its inner end at local -x.
 */
export function eyeTilts(tilt: number, browTilt: number, side: number): { uTilt: number; uBrowTilt: number } {
  return { uTilt: tilt * side, uBrowTilt: browTilt * side };
}

/** Brow end heights from the shader's segment (inner end toward the nose), for tests. */
export function browEnds(uBrowTilt: number, side: number, base = 0): { inner: number; outer: number } {
  const left = base - uBrowTilt * 0.95;
  const right = base + uBrowTilt * 0.95;
  return side >= 0 ? { inner: left, outer: right } : { inner: right, outer: left };
}

/** Mirrors slopWobble (look/toon.ts) for one point, so decals ride the jelly. */
function wobbleOffset(p: Vector3, n: Vector3, w: WobbleUniforms, out: Vector3): Vector3 {
  const hgt = Math.max(w.uHeight.value, 0.05);
  const h = Math.min(Math.max(p.y / hgt, 0), 1.4);
  const s = Math.min(Math.max((h - 0.04) / 0.36, 0), 1);
  const body = s * s * (3 - 2 * s);
  const time = w.uTime.value;
  const seed = w.uSeed.value;
  const breath = w.uBreath.value * Math.sin(time * 2.1 + seed) * body * (1.25 - h);
  const ripple = Math.sin(((p.x * 5.3 + p.y * 7.1 + p.z * 4.7) * w.uWobbleFreq.value) / hgt + time * 10 + seed);
  const jig = w.uJiggle.value * Math.sin(time * 36 + (p.y * 11) / hgt + seed);
  const k = (breath + ripple * w.uWobbleAmp.value + jig) * hgt * body;
  out.copy(n).multiplyScalar(k);
  out.addScaledVector(w.uLag.value, h * h * hgt);
  return out;
}

interface EyeDecal {
  mesh: Mesh<BufferGeometry, ShaderMaterial & { uniforms: EyeUniforms }>;
  rest: Vector3;
  normal: Vector3;
  basis: Quaternion;
  slot: EyeSlot;
  /** Side of the face (+1 on the creature's left), for lid and brow tilt. */
  side: number;
  pupil: Vector2;
  pupilV: Vector2;
}

interface MouthDecal {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  rest: Vector3;
  normal: Vector3;
  shape: MouthShape | null;
}

export interface FaceBuild {
  skeleton: Skeleton;
  face: FaceSpec;
  /** Hex of the accent colour (beaks, starry irises). */
  accent: string;
  /** Hex of the face part's own palette colour (lids until the mesh is sampled). */
  skin: string;
  /** The render layout the body was meshed with (decals sit on that surface). */
  layout?: RenderLayout;
  /** The bone the face goes on (default Skeleton.head, else the torso); an extra head passes its own, with a layout for it. */
  bone?: string;
}

const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();

const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export class CreatureFace {
  /** Rest creature space; its matrix is the face bone's skinning matrix (set every frame). */
  readonly group = new Group();
  boneId: string | null = null;
  private eyes: EyeDecal[] = [];
  private mouth: MouthDecal | null = null;
  private spec: FaceSpec | null = null;
  private accent = "#f5c94c";
  private lineHex = "#2a1c22";
  /** The mouth's line colour, from the skin actually under it (a pale muzzle on a dark head). */
  private mouthLineHex = "#2a1c22";
  private look: EyeLook = BASE;
  private eyeRadius = 0.08;
  /** Eyes-open progress for growth (0 closed .. 1 open) and the pop scale. */
  private reveal = 0;
  private revealV = 0;
  private revealing = false;
  private openT = 0;
  private lookTarget = new Vector2();
  private lookTimer = 0.5;
  private lastCentre = new Vector3();
  private lastVel = new Vector3();
  private hasLast = false;
  private seed = 1;

  constructor() {
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
  }

  /** (Re)place the decals for a skeleton. `reveal` starts the eyes-open animation. */
  build(input: FaceBuild, seed: number) {
    this.clear();
    const { skeleton, face } = input;
    this.spec = face;
    this.seed = seed;
    this.accent = input.accent;
    const boneId = input.bone ?? skeleton.head ?? (skeleton.torso || null);
    const bone = boneId ? skeleton.bones.find((b) => b.id === boneId) : undefined;
    this.boneId = bone ? bone.id : null;
    if (!bone) return;
    const look = EYE_LOOKS[face.eyes] ?? BASE;
    this.look = look;
    const H = Math.max(skeleton.height, 0.05);
    const layout =
      input.layout && input.layout.face && input.layout.face.bone === skeleton.bones.indexOf(bone)
        ? input.layout
        : renderLayout({
            bones: skeleton.bones,
            face: { bone: bone.id, normal: skeleton.face.normal as Vec3, scale: skeleton.face.scale },
          });
    const lf = layout.face!;
    const r = lf.scale;
    const E = lf.eye;
    this.eyeRadius = E;
    const t = new Vector3(...lf.tangent);
    // March only the face bone and its ancestors: snouts, beaks and horns in
    // front of the face must not catch the eyes.
    const sdf = facePrims(layout, r * 0.5);
    const mouthSdf = facePrims(layout, r * 0.5, true);
    const faceBone = layout.bones[lf.bone]!;
    // Decals curve with a round face; on a box face they stay flat, or the
    // brows and lid lines would bend back inside it.
    const bend = lf.box ? 1e3 : Math.max(r * 1.05, E * 1.6);
    const skin = new Color(input.skin);
    const darkSkin = luminance(skin) < 0.08;
    this.lineHex = darkSkin ? "#f4ead8" : "#2a1c22";
    this.mouthLineHex = this.lineHex;

    const place = (x: number, y: number, mouth = false) => {
      // The layout's own placement (a box face offsets straight out, a round
      // one goes round it), with the decal block lifted clear of face paint.
      const hit = faceSpot(lf, mouth ? mouthSdf : sdf, faceBone, x, y, E, lf.lift);
      const dir = new Vector3(...hit.dir);
      // Lean the decal toward the face direction so eyes near an edge still face out.
      const normal = new Vector3(...hit.normal).multiplyScalar(0.75).addScaledVector(dir, 0.25).normalize();
      const xAxis = t.clone().addScaledVector(normal, -t.dot(normal)).normalize();
      const yAxis = new Vector3().crossVectors(normal, xAxis);
      const basis = new Quaternion().setFromRotationMatrix(tmpM.makeBasis(xAxis, yAxis, normal));
      return { point: new Vector3(...hit.point), normal, basis };
    };

    for (const slot of look.slots) {
      const size = E * slot.size;
      const material = eyeMaterial();
      const u = material.uniforms;
      const half = look.kind === EyeKind.Visor ? new Vector2(2.7, 1.1) : new Vector2(1.4, look.brow ? 2.2 : 1.4);
      u.uHalf.value.copy(half);
      u.uKind.value = look.kind;
      u.uLine.value = look.line * (look.kind === EyeKind.Dot ? 0 : 1);
      u.uTall.value = look.tall;
      u.uStar.value = look.star;
      u.uLids.value = look.lids ? 1 : 0;
      u.uIris.value.set(input.accent);
      u.uLineCol.value.set(this.lineHex === "#f4ead8" ? "#1d1a20" : this.lineHex);
      u.uLid.value.copy(skin);
      if (look.kind === EyeKind.Dot) {
        u.uSclera.value.set("#1d1a20");
        u.uRing.value = darkSkin || luminance(skin) < 0.03 ? 0.22 : 0;
      }
      if (look.kind === EyeKind.Visor) {
        u.uSclera.value.set(input.accent).multiplyScalar(1.25);
        u.uLineCol.value.set("#1d1a20");
      }
      const geometry = bentPlane(half.x * size, half.y * size, bend);
      const mesh = new Mesh(geometry, material);
      const spot = place(slot.x, slot.y);
      mesh.quaternion.copy(spot.basis);
      mesh.position.copy(spot.point).addScaledVector(spot.normal, 0.012 * H);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.eyes.push({
        mesh,
        rest: mesh.position.clone(),
        normal: spot.normal,
        basis: spot.basis,
        slot,
        side: slot.x >= 0 ? 1 : -1,
        pupil: new Vector2(0, look.pupilY),
        pupilV: new Vector2(),
      });
    }

    // A beak mouth is the beak itself. Other mouths sit on the lower face,
    // including its muzzle. Forcing a ray below a muzzle can follow the blended
    // head into the torso and put the mouth on the chest.
    if (face.mouth !== "none" && !(face.mouth === "beak" && lf.snout)) {
      const mouthY = look.slots.reduce((m, s) => Math.min(m, s.y - s.size), 0) - 0.55;
      const w = E * (face.mouth === "grin" ? 1.55 : face.mouth === "beak" ? 0.95 : 1.15);
      const spot = place(0, Math.min(mouthY, -0.9), true);
      const material = new MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.02 });
      const mesh = new Mesh(bentPlane(w, w * 0.5, bend), material);
      mesh.quaternion.copy(spot.basis);
      mesh.position.copy(spot.point).addScaledVector(spot.normal, 0.014 * H);
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.mouth = { mesh, rest: mesh.position.clone(), normal: spot.normal, shape: null };
    }
    this.group.visible = true;
  }

  /**
   * Lids take the actual skin colour under each decal, and the mouth's line
   * the colour that reads on the skin under it (the mesh's vertex colours, linear).
   */
  sampleSkin(positions: Float32Array, colors: Float32Array) {
    const count = positions.length / 3;
    const stride = Math.max(1, Math.floor(count / 6000));
    const nearest = (p: Vector3) => {
      let best = Infinity;
      let bi = -1;
      for (let i = 0; i < count; i += stride) {
        const dx = positions[i * 3]! - p.x;
        const dy = positions[i * 3 + 1]! - p.y;
        const dz = positions[i * 3 + 2]! - p.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      return bi;
    };
    for (const eye of this.eyes) {
      const bi = nearest(eye.rest);
      if (bi >= 0) eye.mesh.material.uniforms.uLid.value.setRGB(colors[bi * 3]!, colors[bi * 3 + 1]!, colors[bi * 3 + 2]!);
    }
    if (this.mouth) {
      const bi = nearest(this.mouth.rest);
      if (bi < 0) return;
      const under = new Color().setRGB(colors[bi * 3]!, colors[bi * 3 + 1]!, colors[bi * 3 + 2]!);
      const line = luminance(under) < 0.08 ? "#f4ead8" : "#2a1c22";
      if (line !== this.mouthLineHex) {
        this.mouthLineHex = line;
        // Redrawn with the new line on the next update.
        this.mouth.shape = null;
      }
    }
  }

  /** Show the face closed and open the eyes (growth: eyes open last). */
  revealEyes(delay = 0.15) {
    this.reveal = 0;
    this.revealV = 0;
    this.revealing = true;
    this.openT = -delay;
  }

  /** Show the face fully open at once. */
  showOpen() {
    this.reveal = 1;
    this.revealV = 0;
    this.revealing = false;
    this.openT = 1;
  }

  get hasFace(): boolean {
    return this.eyes.length > 0 || this.mouth !== null;
  }

  update(
    dt: number,
    time: number,
    expression: Expression,
    blink: number,
    striking: boolean,
    boneMatrix: Matrix4,
    wobble: WobbleUniforms | null,
  ) {
    if (!this.spec || !this.hasFace) return;
    this.group.matrix.copy(boneMatrix);
    this.group.matrixWorldNeedsUpdate = true;

    // Growth: pop in (scale spring), then the lids open.
    if (this.revealing) {
      this.revealV += (-(this.reveal - 1) * 260 - this.revealV * 14) * dt;
      this.reveal += this.revealV * dt;
      this.openT += dt;
      if (this.openT > 1.2 && Math.abs(this.reveal - 1) < 0.003) {
        this.revealing = false;
        this.reveal = 1;
      }
    }
    const popScale = Math.max(0.001, this.reveal);
    const opening = Math.min(1, Math.max(0, (this.openT - 0.25) / 0.35));

    // Pupils: idle saccades, googly springs.
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      const r1 = Math.sin(time * 12.9898 + this.seed * 78.233) * 43758.5453;
      const r2 = Math.sin(time * 39.3468 + this.seed * 11.135) * 24634.6345;
      const fx = r1 - Math.floor(r1);
      const fy = r2 - Math.floor(r2);
      this.lookTarget.set((fx - 0.5) * 0.5, (fy - 0.5) * 0.3);
      this.lookTimer = 0.7 + fx * 1.8;
    }
    // Face acceleration in the face plane (for googly pupils).
    const centre = tmpV.setFromMatrixPosition(boneMatrix);
    const vel = tmpV2.copy(centre).sub(this.lastCentre).divideScalar(Math.max(dt, 1e-3));
    if (!this.hasLast) {
      vel.set(0, 0, 0);
      this.lastVel.set(0, 0, 0);
      this.hasLast = true;
    }
    const accel = vel.clone().sub(this.lastVel).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 40);
    this.lastVel.copy(vel);
    this.lastCentre.copy(centre);
    const boneRot = tmpQ.setFromRotationMatrix(boneMatrix);

    const look = this.look;
    let open = look.open;
    let lower = look.lower;
    let tilt = look.tilt;
    let browTilt = look.browTilt;
    let brow = look.brow;
    let pupilScale = 1;
    let curve = 0;
    let eyeScale = 1;
    switch (expression) {
      case "squint":
        open = Math.min(open, 0.42);
        lower = 0.32;
        browTilt = Math.max(browTilt, 0.3);
        brow = Math.max(brow, look.kind === EyeKind.Eye ? 0.9 : 0);
        break;
      case "wide":
        open = 1.08;
        lower = 0;
        tilt = 0;
        pupilScale = 0.7;
        eyeScale = 1.14;
        browTilt = -0.25;
        break;
      case "smug":
        open = Math.min(open, 0.56);
        lower = 0.18;
        tilt = -0.12;
        break;
      case "annoyed":
        open = Math.min(open, 0.5);
        tilt = 0;
        brow = look.kind === EyeKind.Eye ? 1 : 0;
        browTilt = 0.38;
        break;
      case "closed":
        open = 0;
        curve = 0.32;
        break;
      default:
        break;
    }
    const blinkAmount = Math.max(blink, 1 - opening);
    open *= 1 - blinkAmount;
    if (blinkAmount > 0.5) curve = Math.max(curve, 0.18);
    const E = this.eyeRadius;

    for (const eye of this.eyes) {
      const u = eye.mesh.material.uniforms;
      u.uTime.value = time;
      u.uOpen.value = look.kind === EyeKind.Visor ? Math.max(0.12, open) : open;
      u.uLower.value = lower * (1 - blinkAmount);
      const tilts = eyeTilts(tilt, browTilt, eye.side);
      u.uTilt.value = tilts.uTilt;
      u.uBrowTilt.value = tilts.uBrowTilt;
      u.uBrow.value = brow;
      u.uCurve.value = curve;
      u.uLids.value = look.lids || expression === "closed" || blinkAmount > 0.5 ? 1 : 0;
      const size = look.pupil * pupilScale;
      u.uPupilSize.value = size;
      if (look.googly) {
        // Gravity and the head's acceleration, in the decal's plane, in eye radii.
        const toLocal = boneRot.clone().multiply(eye.basis).invert();
        const g = new Vector3(0, -9.8, 0).sub(accel).applyQuaternion(toLocal);
        const scale = 1 / Math.max(E * eye.slot.size, 1e-3);
        eye.pupilV.x += (g.x * scale * 0.12 - eye.pupil.x * 18) * dt;
        eye.pupilV.y += (g.y * scale * 0.12 - eye.pupil.y * 18) * dt;
        eye.pupilV.multiplyScalar(Math.exp(-dt * 2.2));
        eye.pupil.addScaledVector(eye.pupilV, dt);
        const maxR = 1 - size - 0.04;
        if (eye.pupil.length() > maxR) {
          eye.pupil.setLength(maxR);
          // Bounce off the rim.
          const nrm = eye.pupil.clone().normalize();
          const vn = eye.pupilV.dot(nrm);
          if (vn > 0) eye.pupilV.addScaledVector(nrm, -1.6 * vn);
        }
      } else {
        const target = tmpV2.set(this.lookTarget.x, this.lookTarget.y + look.pupilY, 0);
        const k = 1 - Math.exp(-dt * 22);
        eye.pupil.x += (target.x - eye.pupil.x) * k;
        eye.pupil.y += (target.y - eye.pupil.y) * k;
        const maxR = Math.max(0, 1 - size - 0.12);
        if (eye.pupil.length() > maxR) eye.pupil.setLength(maxR);
      }
      u.uPupil.value.copy(eye.pupil);
      const s = popScale * eyeScale;
      eye.mesh.scale.set(s, s, s);
      if (wobble) eye.mesh.position.copy(eye.rest).add(wobbleOffset(eye.rest, eye.normal, wobble, tmpV2));
    }

    if (this.mouth && this.spec) {
      const shape = mouthShapeFor(this.spec.mouth, expression, striking);
      if (shape !== this.mouth.shape) {
        this.mouth.shape = shape;
        const texture = shape ? mouthTexture(shape, this.mouthLineHex, this.accent) : null;
        this.mouth.mesh.material.map = texture;
        this.mouth.mesh.material.needsUpdate = true;
        this.mouth.mesh.visible = !!texture;
      }
      const s = Math.max(0.001, Math.min(1, this.reveal * 1.1));
      this.mouth.mesh.scale.set(s, s, s);
      if (wobble) {
        this.mouth.mesh.position.copy(this.mouth.rest).add(wobbleOffset(this.mouth.rest, this.mouth.normal, wobble, tmpV2));
      }
    }
  }

  clear() {
    for (const eye of this.eyes) {
      eye.mesh.geometry.dispose();
      eye.mesh.material.dispose();
      this.group.remove(eye.mesh);
    }
    this.eyes = [];
    if (this.mouth) {
      this.mouth.mesh.geometry.dispose();
      this.mouth.mesh.material.dispose();
      this.group.remove(this.mouth.mesh);
      this.mouth = null;
    }
    this.group.visible = false;
    this.spec = null;
  }

  dispose() {
    this.clear();
  }
}
