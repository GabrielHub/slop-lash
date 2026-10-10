// A clear camera for the shot at the bottom of a deep drop (the rooftop's
// alleys, the kitchen floor between the cabinets). fight_close frames from
// the fight anchor's fixed angle, which down there can put the lens inside a
// wall, or a wall right in front of it that hides the victim and the RING
// OUT! title (drawn about 2 m in front of the camera). This tries directions
// (and small sideways shifts) around the victim, ray casting the set, and
// keeps the clear one nearest the preferred angle. The work is time-boxed so
// it can spread over the frames of the fall.

import { Raycaster, Sphere, Vector3, type Mesh, type Object3D } from "three";

export interface ClearShotOptions {
  /** Horizontal camera distance from the target (fight_close on one target: about 3.6). */
  distance: number;
  /** Camera height above the target. */
  height: number;
  /** Aim height above the target. */
  aim: number;
  /** Preferred horizontal direction from the target to the camera (unit). */
  preferred: Vector3;
  /** Distance in front of the lens that must be clear (the title's depth plus a margin). */
  depth: number;
  /** Half width and half height of the clear zone at that depth (world units). */
  halfWidth: number;
  halfHeight: number;
}

export interface ClearShot {
  /** Horizontal direction from the target to the camera (x, z). */
  from: [number, number];
  /** Sideways shift of the target so the lens sits in the clear (world). */
  shift: Vector3;
  score: number;
}

const UP = new Vector3(0, 1, 0);
const YAW_STEPS = 16;
const SHIFTS = [0, 0.45, -0.45, 0.9, -0.9];
/** Score per metre of open view along the lens axis (up to OPEN_CAP). */
const OPEN_WEIGHT = 0.08;
const OPEN_CAP = 10;
/** Prior per radian away from the preferred direction, and per metre of shift. */
const ANGLE_COST = 1;
const SHIFT_COST = 0.6;

interface Candidate {
  dir: Vector3;
  shift: number;
  prior: number;
}

export class ClearShotSearch {
  /** The best clear shot so far (null: none found yet). */
  best: ClearShot | null = null;
  done = false;

  private readonly meshes: Object3D[] = [];
  private readonly raycaster = new Raycaster();
  private readonly candidates: Candidate[] = [];
  private index = 0;
  private readonly victim: Vector3;
  private readonly o: ClearShotOptions;
  private readonly target = new Vector3();
  private readonly camera = new Vector3();
  private readonly aim = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly side = new Vector3();
  private readonly point = new Vector3();
  private readonly from = new Vector3();
  private readonly direction = new Vector3();

  constructor(root: Object3D | null, victim: Vector3, options: ClearShotOptions) {
    this.victim = victim.clone();
    this.o = options;
    // Only what is near the victim can block the shot.
    const reach = options.distance + options.depth + options.height + 2;
    const sphere = new Sphere();
    root?.updateWorldMatrix(true, true);
    root?.traverseVisible((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      if (!mesh.geometry.boundingSphere) return;
      sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld);
      if (sphere.distanceToPoint(this.victim) <= reach) this.meshes.push(mesh);
    });
    const preferred = options.preferred.clone().setY(0);
    if (preferred.lengthSq() < 1e-6) preferred.set(0, 0, 1);
    preferred.normalize();
    for (let k = 0; k < YAW_STEPS; k += 1) {
      const angle = (k * 2 * Math.PI) / YAW_STEPS;
      const off = Math.min(angle, 2 * Math.PI - angle);
      const dir = preferred.clone().applyAxisAngle(UP, angle);
      for (const shift of SHIFTS) this.candidates.push({ dir, shift, prior: -off * ANGLE_COST - Math.abs(shift) * SHIFT_COST });
    }
    this.candidates.sort((a, b) => b.prior - a.prior);
    if (this.meshes.length === 0) {
      // Nothing near: the preferred shot is clear.
      this.best = { from: [preferred.x, preferred.z], shift: new Vector3(), score: 0 };
      this.done = true;
    }
  }

  /** Search for up to `budgetMs` of wall time; true when finished. */
  step(budgetMs: number): boolean {
    if (this.done) return true;
    const start = performance.now();
    while (this.index < this.candidates.length) {
      const candidate = this.candidates[this.index]!;
      // Nothing left can beat the best: priors only fall from here.
      if (this.best && this.best.score >= candidate.prior + OPEN_CAP * OPEN_WEIGHT) break;
      this.index += 1;
      const score = this.evaluate(candidate);
      if (score !== null && (!this.best || score > this.best.score)) {
        this.best = {
          from: [candidate.dir.x, candidate.dir.z],
          shift: new Vector3(-candidate.dir.z, 0, candidate.dir.x).multiplyScalar(candidate.shift),
          score,
        };
      }
      if (performance.now() - start >= budgetMs) return false;
    }
    this.done = true;
    return true;
  }

  /** Run to the end (tests, or when there is no frame left to spread over). */
  finish(): ClearShot | null {
    while (!this.step(Infinity)) {
      // keep going
    }
    return this.best;
  }

  private evaluate(candidate: Candidate): number | null {
    const { o } = this;
    const { dir } = candidate;
    this.side.set(-dir.z, 0, dir.x);
    const target = this.target.copy(this.victim).addScaledVector(this.side, candidate.shift);
    const camera = this.camera.copy(target).addScaledVector(dir, o.distance);
    camera.y = target.y + o.height;
    const aim = this.aim.copy(target);
    aim.y += o.aim;
    // The victim can be seen (and the lens is not behind a wall: a face seen from outside).
    this.from.copy(this.victim);
    this.from.y += 0.3;
    if (this.blocked(this.from, camera)) return null;
    // Room around the lens itself.
    const forward = this.forward.subVectors(aim, camera).normalize();
    const right = this.right.crossVectors(forward, UP).normalize();
    const up = this.up.crossVectors(right, forward).normalize();
    for (const sign of [1, -1]) {
      if (this.blocked(camera, this.point.copy(camera).addScaledVector(right, 0.45 * sign))) return null;
    }
    // The title's zone in front of the lens.
    for (const [sx, sy] of TITLE_RAYS) {
      this.point.copy(camera).addScaledVector(forward, o.depth).addScaledVector(right, sx * o.halfWidth).addScaledVector(up, sy * o.halfHeight);
      if (this.blocked(camera, this.point)) return null;
    }
    const open = this.firstHit(camera, forward, OPEN_CAP);
    return candidate.prior + Math.min(open, OPEN_CAP) * OPEN_WEIGHT;
  }

  private blocked(from: Vector3, to: Vector3): boolean {
    const direction = this.direction.subVectors(to, from);
    const length = direction.length();
    if (length < 1e-4) return false;
    this.raycaster.set(from, direction.divideScalar(length));
    this.raycaster.far = length;
    return this.raycaster.intersectObjects(this.meshes, false).length > 0;
  }

  private firstHit(from: Vector3, direction: Vector3, far: number): number {
    this.raycaster.set(from, direction);
    this.raycaster.far = far;
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    return hit ? hit.distance : far;
  }
}

/** Rays through the title's zone: its centre, its sides and its corners. */
const TITLE_RAYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];
