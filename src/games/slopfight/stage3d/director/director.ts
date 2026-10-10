// The camera director: a shot-based system that scenes drive with requests.
//
// Rules (spec section 10):
// - Hard cuts on events. A request cuts immediately unless the current shot
//   is younger than the minimum shot length (1.2 s), in which case it waits
//   (briefly, `ttl`) and cuts the moment the minimum passes. `force` skips the
//   wait (phase changes and transitions).
// - A transient shot (`hold` seconds) returns to the base shot when it ends.
//   While it holds, lower-priority requests are dropped.
// - Speed ramps only in slow motion: shots move in real time; the clock
//   slows the world, not the camera.
// - Nothing is ever static: every shot gets a slow drift, and shake (trauma,
//   scaled by damage) rides on top.
// - An impact that cannot cut (inside the minimum shot length) still gets a
//   10% punch-in on the current shot, so the beat lands without a strobe.
// - A hard cut hides a jump in time, so every cut made while the clock is
//   settled (no hit stop, slow motion or pause running) repays the clock's
//   debt: `clock.resync()`. That keeps FIGHT playback within a cut of the
//   server clock the phones follow. Match cuts are exempt (they promise
//   continuity), and a cut during slow motion leaves the debt for the next.

import { MathUtils, Matrix4, Object3D, Quaternion, Vector3, type PerspectiveCamera } from "three";
import type { ArenaNodes } from "../arena/nodes";
import type { PostFx } from "../look/post-fx";
import type { StageEvents } from "../events";
import type { StageClock } from "./clock";
import { fbm1 } from "./noise";
import {
  SHOTS,
  copyPose,
  createPose,
  createShotState,
  type ShotId,
  type ShotParams,
  type ShotPose,
  type ShotState,
} from "./shots";

export const MIN_SHOT_SECONDS = 1.2;
/** Seconds a waiting request stays valid after it becomes eligible to cut. */
const DEFAULT_GRACE = 0.4;

/** Anything a shot can follow: a fixed point, a live object, or a getter. */
export type TargetLike = Vector3 | Object3D | (() => Vector3 | null | undefined);

export interface ShotRequest extends ShotParams {
  targets?: readonly TargetLike[];
  /** Higher wins. Base shots are 0. */
  priority?: number;
  /** Seconds before returning to the base shot; omit for a shot that stays. */
  hold?: number;
  /** Cut now even inside the minimum shot length. */
  force?: boolean;
  /**
   * Seconds a waiting request stays valid. By default it waits for the
   * minimum shot length and then 0.4 s more; event shots (impact_pop) should
   * pass a short ttl so a late cut never lands on the wrong moment.
   */
  ttl?: number;
  /** Override the shot's letterbox (0..1). */
  letterbox?: number;
  /** Override the shot's depth-of-field strength (0..1). */
  dof?: number;
}

export type RequestResult = "cut" | "queued" | "refreshed" | "ignored";

interface ActiveShot {
  id: ShotId;
  request: ShotRequest;
  startedAt: number;
  /** Real time the transient hold ends, or null for a shot that stays. */
  holdUntil: number | null;
  state: ShotState;
  first: boolean;
}

interface PendingShot {
  id: ShotId;
  request: ShotRequest;
  expiresAt: number;
}

const tmpTarget = new Vector3();
const lookMatrix = new Matrix4();
const rollQuat = new Quaternion();
const Z_AXIS = new Vector3(0, 0, 1);
const UP = new Vector3(0, 1, 0);
const tmpRight = new Vector3();
const tmpUp = new Vector3();
const tmpForward = new Vector3();

function resolveTarget(target: TargetLike, out: Vector3): Vector3 | null {
  if (typeof target === "function") {
    const value = target();
    return value ? out.copy(value) : null;
  }
  if ((target as Object3D).isObject3D) return (target as Object3D).getWorldPosition(out);
  return out.copy(target as Vector3);
}

export interface DirectorOptions {
  events?: StageEvents;
  fx?: PostFx;
  /** The presentation clock whose debt the director's cuts repay. */
  clock?: StageClock;
  /** Scale on the always-on drift (0 freezes it, for screenshots). */
  drift?: number;
}

export class Director {
  nodes: ArenaNodes | null = null;
  aspect = 16 / 9;
  /** Drift scale: 1 = the house drift, 0 = locked off (dev screenshots). */
  driftScale: number;

  /** The pose solved this frame, before drift and shake. */
  readonly pose: ShotPose = createPose();
  /** The final camera pose this frame (after drift, shake, punch and match offset). */
  readonly output: ShotPose = createPose();

  private realTime = 0;
  private current: ActiveShot;
  private base: { id: ShotId; request: ShotRequest };
  private pending: PendingShot | null = null;
  private readonly prevPose: ShotPose = createPose();
  private trauma = 0;
  private punch = 0;
  private readonly matchOffset = new Vector3();
  private matchFrom: { uv: [number, number]; target: TargetLike; seconds: number; t: number } | null = null;
  private readonly targetBuffer: Vector3[] = [];
  private readonly events: StageEvents | undefined;
  private readonly fx: PostFx | undefined;
  private readonly clock: StageClock | undefined;

  constructor(options: DirectorOptions = {}) {
    this.events = options.events;
    this.fx = options.fx;
    this.clock = options.clock;
    this.driftScale = options.drift ?? 1;
    this.base = { id: "crane_establish", request: {} };
    this.current = this.makeShot("crane_establish", {});
  }

  get shot(): ShotId {
    return this.current.id;
  }

  /** Seconds the current shot has been up. */
  get shotAge(): number {
    return this.realTime - this.current.startedAt;
  }

  get baseShot(): ShotId {
    return this.base.id;
  }

  setNodes(nodes: ArenaNodes | null): void {
    this.nodes = nodes;
    // Anchors are cached per shot; re-solve from the new set.
    this.current.state.anchor = null;
    this.current.state.anchorEnd = null;
  }

  /**
   * The shot to return to when transient shots end (a phase scene's default:
   * fight_wide in FIGHT, easels in BUILD). Cuts to it now when `cut` is set or
   * nothing transient is holding.
   */
  setBase(id: ShotId, request: ShotRequest = {}, cut = true): void {
    this.base = { id, request: { ...request, hold: undefined } };
    if (cut || !this.holding) this.cutTo(id, this.base.request);
  }

  /** Ask for a shot. See the rules at the top of this file. */
  request(id: ShotId, request: ShotRequest = {}): RequestResult {
    const priority = request.priority ?? 0;
    const current = this.current;
    const currentPriority = current.request.priority ?? 0;

    if (id === current.id && !request.force) {
      // Same shot again: extend its hold and update its targets, no cut.
      current.request = { ...current.request, ...request };
      if (request.hold !== undefined) current.holdUntil = this.realTime + request.hold;
      return "refreshed";
    }
    if (this.holding && priority < currentPriority && !request.force) return "ignored";
    if (request.force || this.shotAge >= MIN_SHOT_SECONDS) {
      this.cutTo(id, request);
      return "cut";
    }
    // Inside the minimum shot length: an impact still punches in.
    if (id === "impact_pop") this.punchIn();
    if (!this.pending || priority >= (this.pending.request.priority ?? 0)) {
      const eligibleAt = this.current.startedAt + MIN_SHOT_SECONDS;
      const expiresAt =
        request.ttl !== undefined ? this.realTime + request.ttl : Math.max(eligibleAt, this.realTime) + DEFAULT_GRACE;
      this.pending = { id, request, expiresAt };
    }
    return "queued";
  }

  /** Camera shake, 0..1 (trauma). Scale by damage: a 30-damage hit on 120 HP is about 0.25-0.5. */
  shake(strength: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, strength));
  }

  /** A 10% punch-in on the current shot that eases out (used when a cut is not allowed). */
  punchIn(amount = 1): void {
    this.punch = Math.min(1, Math.max(this.punch, amount));
  }

  /**
   * Match cut: cut to `id` so that `target` lands where it sits on screen now,
   * then glide to the new shot's own framing over `seconds`.
   */
  matchCut(id: ShotId, request: ShotRequest, target: TargetLike, camera: PerspectiveCamera, seconds = 0.7): void {
    const point = resolveTarget(target, new Vector3());
    if (point) {
      const ndc = point.clone().project(camera);
      this.matchFrom = { uv: [ndc.x, ndc.y], target, seconds, t: 0 };
    }
    // No time jump here: the match cut's point is that the subject stays put.
    this.cutTo(id, { ...request, force: true }, false);
  }

  /** Solve this frame's camera pose. `realDelta` in seconds (shots move in real time). */
  update(realDelta: number): ShotPose {
    this.realTime += realDelta;
    const age = this.shotAge;

    if (this.pending) {
      if (this.realTime > this.pending.expiresAt) this.pending = null;
      else if (age >= MIN_SHOT_SECONDS) {
        const { id, request } = this.pending;
        this.pending = null;
        this.cutTo(id, request);
      }
    }
    const { holdUntil } = this.current;
    if (
      holdUntil !== null &&
      this.realTime >= holdUntil &&
      this.shotAge >= MIN_SHOT_SECONDS &&
      this.current.id !== this.base.id
    ) {
      this.cutTo(this.base.id, this.base.request);
    }

    const current = this.current;
    const targets = this.resolveTargets(current.request.targets);
    SHOTS[current.id].solve(
      {
        nodes: this.nodes,
        targets,
        t: this.shotAge,
        dt: current.first ? 0 : realDelta,
        aspect: this.aspect,
        prev: this.prevPose,
        params: current.request,
        first: current.first,
      },
      current.state,
      this.pose,
    );
    current.first = false;

    this.composeOutput(realDelta);
    this.driveFx(targets);
    return this.output;
  }

  /** Write the output pose into a camera. */
  apply(camera: PerspectiveCamera): void {
    const out = this.output;
    camera.position.copy(out.position);
    lookMatrix.lookAt(out.position, out.target, UP);
    camera.quaternion.setFromRotationMatrix(lookMatrix);
    if (out.roll !== 0) camera.quaternion.multiply(rollQuat.setFromAxisAngle(Z_AXIS, MathUtils.degToRad(out.roll)));
    if (Math.abs(camera.fov - out.fov) > 1e-3 || Math.abs(camera.aspect - this.aspect) > 1e-4) {
      camera.fov = out.fov;
      camera.aspect = this.aspect;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  // -------------------------------------------------------------------------

  /** A transient shot is still inside its hold. */
  private get holding(): boolean {
    return this.current.holdUntil !== null && this.realTime < this.current.holdUntil;
  }

  private makeShot(id: ShotId, request: ShotRequest): ActiveShot {
    return {
      id,
      request,
      startedAt: this.realTime,
      holdUntil: request.hold !== undefined ? this.realTime + request.hold : null,
      state: createShotState(),
      first: true,
    };
  }

  private cutTo(id: ShotId, request: ShotRequest, repayDebt = true): void {
    const from = this.current?.id;
    copyPose(this.prevPose, this.output);
    this.current = this.makeShot(id, request);
    this.pending = null;
    this.matchOffset.set(0, 0, 0);
    if (!this.matchFrom || this.matchFrom.t > 0) this.matchFrom = null;
    const shot = SHOTS[id];
    this.fx?.setLetterbox(request.letterbox ?? shot.letterbox);
    this.events?.emit("cut", { from: from ?? null, to: id });
    // The cut hides the jump: snap presentation time back to the server.
    const clock = this.clock;
    if (repayDebt && clock && clock.debtMs > 0 && clock.settled) clock.resync();
  }

  private resolveTargets(targets: readonly TargetLike[] | undefined): Vector3[] {
    const buffer = this.targetBuffer;
    let count = 0;
    for (const target of targets ?? []) {
      buffer[count] ??= new Vector3();
      if (resolveTarget(target, buffer[count]!)) count += 1;
    }
    buffer.length = count;
    return buffer;
  }

  private composeOutput(realDelta: number): void {
    const out = copyPose(this.output, this.pose);
    const t = this.realTime;

    // Drift: slow, small, always on.
    const drift = this.driftScale;
    if (drift > 0) {
      out.position.x += fbm1(t * 0.11, 11) * 0.07 * drift;
      out.position.y += fbm1(t * 0.09, 23) * 0.05 * drift;
      out.position.z += fbm1(t * 0.07, 37) * 0.06 * drift;
      out.target.x += fbm1(t * 0.13, 41) * 0.03 * drift;
      out.target.y += fbm1(t * 0.1, 53) * 0.02 * drift;
      out.fov += fbm1(t * 0.05, 61) * 0.25 * drift;
    }

    // Punch-in: 10% toward the target, easing out.
    if (this.punch > 0) {
      const amount = 0.1 * this.punch * this.punch;
      out.position.lerp(out.target, amount);
      out.fov *= 1 - amount * 0.5;
      this.punch = Math.max(0, this.punch - realDelta * 2.2);
    }

    // Match cut: truck/pedestal so the target sits where it sat in the old shot.
    if (this.matchFrom) {
      const match = this.matchFrom;
      const point = resolveTarget(match.target, tmpTarget);
      if (point) {
        tmpForward.subVectors(out.target, out.position).normalize();
        tmpRight.crossVectors(tmpForward, UP).normalize();
        tmpUp.crossVectors(tmpRight, tmpForward).normalize();
        if (out.roll !== 0) {
          // The Dutch roll turns the screen axes.
          const roll = MathUtils.degToRad(out.roll);
          const cos = Math.cos(roll);
          const sin = Math.sin(roll);
          const rx = tmpRight.x * cos + tmpUp.x * sin;
          const ry = tmpRight.y * cos + tmpUp.y * sin;
          const rz = tmpRight.z * cos + tmpUp.z * sin;
          tmpUp.set(tmpUp.x * cos - tmpRight.x * sin, tmpUp.y * cos - tmpRight.y * sin, tmpUp.z * cos - tmpRight.z * sin);
          tmpRight.set(rx, ry, rz);
        }
        const toPoint = tmpTarget.sub(out.position);
        const depth = Math.max(0.5, toPoint.dot(tmpForward));
        const halfH = Math.tan(MathUtils.degToRad(out.fov) / 2) * depth;
        const halfW = halfH * this.aspect;
        const ndcX = toPoint.dot(tmpRight) / halfW;
        const ndcY = toPoint.dot(tmpUp) / halfH;
        if (match.t === 0) {
          this.matchOffset
            .copy(tmpRight)
            .multiplyScalar((ndcX - match.uv[0]) * halfW)
            .addScaledVector(tmpUp, (ndcY - match.uv[1]) * halfH);
        }
        const fade = 1 - Math.min(1, match.t / match.seconds);
        const eased = fade * fade * (3 - 2 * fade);
        out.position.addScaledVector(this.matchOffset, eased);
        out.target.addScaledVector(this.matchOffset, eased);
        match.t += realDelta;
        if (match.t >= match.seconds) this.matchFrom = null;
      } else {
        this.matchFrom = null;
      }
    }

    // Shake: trauma squared, real time, decays.
    if (this.trauma > 0) {
      const amount = this.trauma * this.trauma;
      const f = t * 22;
      out.position.x += fbm1(f, 71) * 0.14 * amount;
      out.position.y += fbm1(f, 83) * 0.11 * amount;
      out.target.x += fbm1(f, 97) * 0.08 * amount;
      out.target.y += fbm1(f, 101) * 0.08 * amount;
      out.roll += fbm1(f, 113) * 3 * amount;
      this.trauma = Math.max(0, this.trauma - realDelta * 1.5);
    }
  }

  private driveFx(targets: readonly Vector3[]): void {
    if (!this.fx) return;
    const request = this.current.request;
    const strength = request.dof ?? SHOTS[this.current.id].dof;
    // Face-offs focus their side's fighter unless told otherwise.
    const defaultFocus = this.current.id === "face_off_low" && request.side === "B" ? 1 : 0;
    const focusIndex = Math.min(request.focus ?? defaultFocus, Math.max(0, targets.length - 1));
    const focus = targets[focusIndex] ?? this.pose.target;
    this.fx.setDof(strength, focus);
  }
}
