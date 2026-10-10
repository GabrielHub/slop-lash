// The transitions catalog (spec 6). Every phase change uses one of these:
//
// - slam: a title plane fixed to the camera hits centre with shake, then
//   flicks off. It is a real 3D object (SlamTitle), so the rig lights it and
//   the post stack grades it.
// - wipe: a full-screen shader wipe in the arena's accent colour.
// - letterboxIn / letterboxOut: bars, done in the post pass.
// - iris: closes on a world point (the ring-out victim), in the post pass.
// - matchCut: cuts to a new shot keeping a target where it sits on screen.
// - cut: a plain hard cut (onCover runs at once).
//
// `play(kind, opts)` returns a promise that resolves when the transition has
// finished; `opts.onCover` runs at the covered moment (wipe fully across,
// iris closed, slam impact, the cut itself), which is where a scene swaps
// what is underneath. Each kind is its own channel: playing a kind again
// finishes the previous one at once. Nothing fades to black.

import { Color, Vector3, type Object3D, type PerspectiveCamera } from "three";
import type { StageEvents, TransitionKind } from "../events";
import type { PostFx } from "../look/post-fx";
import type { Director, ShotRequest, TargetLike } from "./director";
import { clamp01, easeInCubic, easeInOutCubic, easeOutCubic } from "./noise";
import type { ShotId } from "./shots";

export interface TransitionOptions {
  /** Runs at the covered moment; swap the scene underneath here. */
  onCover?: () => void;
  /** Dev screenshots: stop the timeline at this fraction (0..1) of its length. */
  freezeAt?: number;
}

export interface SlamOptions extends TransitionOptions {
  text: string;
  sub?: string;
  /** Face colour of the title (defaults to warm bone). */
  color?: string;
  /** Extrusion / outline colour (defaults to the arena accent's dark). */
  edgeColor?: string;
  holdMs?: number;
  /** Shake on impact, 0..1. */
  shake?: number;
}

export interface WipeOptions extends TransitionOptions {
  /** Defaults to the arena accent. */
  color?: string;
  /** Band angle in degrees from vertical. */
  angle?: number;
  coverMs?: number;
  holdMs?: number;
  revealMs?: number;
}

export interface LetterboxOptions extends TransitionOptions {
  ms?: number;
}

export interface IrisOptions extends TransitionOptions {
  /** World point to close on (null: screen centre). */
  target: TargetLike | null;
  closeMs?: number;
  holdMs?: number;
  /** Radius held on the target, as a fraction of screen height. */
  radius?: number;
  /** After the hold, close all the way (the cover), then open on the new scene. */
  full?: boolean;
  openMs?: number;
  color?: string;
}

export interface MatchCutOptions extends TransitionOptions {
  to: ShotId;
  request?: ShotRequest;
  /** The thing that stays put on screen across the cut. */
  target: TargetLike;
  seconds?: number;
}

export interface TransitionOptionMap {
  cut: TransitionOptions;
  slam: SlamOptions;
  wipe: WipeOptions;
  letterboxIn: LetterboxOptions;
  letterboxOut: LetterboxOptions;
  iris: IrisOptions;
  matchCut: MatchCutOptions;
}

/** What SlamTitle renders each frame. */
export interface SlamState {
  visible: boolean;
  /** Increments per slam so the title can rebuild its text. */
  seq: number;
  text: string;
  sub: string | null;
  color: string;
  edgeColor: string;
  scaleX: number;
  scaleY: number;
  rotation: number;
  offsetY: number;
}

export const SLAM_IMPACT_MS = 170;
const SLAM_SETTLE_MS = 160;
const SLAM_ANTICIPATE_MS = 90;
const SLAM_FLICK_MS = 150;
const IRIS_OPEN = 1.9;

interface Running {
  kind: TransitionKind;
  elapsed: number;
  duration: number;
  coverAt: number;
  covered: boolean;
  freezeAt: number | null;
  onCover?: () => void;
  resolve: () => void;
  step(t: number): void;
}

export interface TransitionContext {
  fx: PostFx;
  director: Director;
  events?: StageEvents;
  /** The camera, for match cuts. */
  camera: () => PerspectiveCamera | null;
}

export class TransitionController {
  /** The arena accent; wipes default to it. */
  readonly accent = new Color("#2a9d8f");
  readonly accentDark = new Color("#13544c");
  readonly slam: SlamState = {
    visible: false,
    seq: 0,
    text: "",
    sub: null,
    color: "#fff4dc",
    edgeColor: "#13544c",
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    offsetY: 0,
  };

  private readonly running = new Map<TransitionKind, Running>();
  private readonly context: TransitionContext;

  constructor(context: TransitionContext) {
    this.context = context;
  }

  setAccent(hex: string, darkHex: string): void {
    this.accent.set(hex);
    this.accentDark.set(darkHex);
  }

  /** Is a transition of this kind (or any, when omitted) playing? */
  isPlaying(kind?: TransitionKind): boolean {
    return kind ? this.running.has(kind) : this.running.size > 0;
  }

  play<K extends TransitionKind>(kind: K, options: TransitionOptionMap[K]): Promise<void> {
    this.finish(kind);
    return new Promise<void>((resolve) => {
      const run = this.build(kind, options as TransitionOptionMap[TransitionKind], resolve);
      this.running.set(kind, run);
      this.context.events?.emit("transition", { kind, phase: "start" });
      this.advance(run, 0);
    });
  }

  /** Advance every running transition by one frame of real time. */
  update(realDeltaSeconds: number): void {
    // A snapshot: a transition started from an onCover waits for the next frame.
    for (const run of Array.from(this.running.values())) this.advance(run, realDeltaSeconds * 1000);
  }

  /** Finish a channel at once (cover callback included). */
  finish(kind: TransitionKind): void {
    const run = this.running.get(kind);
    if (!run) return;
    run.freezeAt = null;
    this.advance(run, run.duration - run.elapsed + 1);
  }

  // -------------------------------------------------------------------------

  private advance(run: Running, ms: number): void {
    const limit = run.freezeAt !== null ? run.duration * clamp01(run.freezeAt) : Number.POSITIVE_INFINITY;
    run.elapsed = Math.min(run.elapsed + ms, limit);
    if (!run.covered && run.elapsed >= run.coverAt) {
      run.covered = true;
      run.onCover?.();
      this.context.events?.emit("transition", { kind: run.kind, phase: "cover" });
    }
    run.step(Math.min(run.elapsed, run.duration));
    if (run.elapsed >= run.duration && this.running.get(run.kind) === run) {
      this.running.delete(run.kind);
      this.context.events?.emit("transition", { kind: run.kind, phase: "end" });
      run.resolve();
    }
  }

  private build(kind: TransitionKind, options: TransitionOptionMap[TransitionKind], resolve: () => void): Running {
    const base = {
      kind,
      elapsed: 0,
      covered: false,
      freezeAt: options.freezeAt ?? null,
      onCover: options.onCover,
      resolve,
    };
    const { fx, director } = this.context;
    switch (kind) {
      case "cut":
        return { ...base, duration: 0, coverAt: 0, step: () => {} };

      case "slam": {
        const o = options as SlamOptions;
        const hold = o.holdMs ?? 950;
        const flickStart = SLAM_IMPACT_MS + SLAM_SETTLE_MS + hold;
        const slam = this.slam;
        slam.seq += 1;
        slam.text = o.text;
        slam.sub = o.sub ?? null;
        slam.color = o.color ?? "#fff4dc";
        slam.edgeColor = o.edgeColor ?? `#${this.accentDark.getHexString()}`;
        let shook = false;
        return {
          ...base,
          duration: flickStart + SLAM_ANTICIPATE_MS + SLAM_FLICK_MS,
          coverAt: SLAM_IMPACT_MS,
          step: (t) => {
            slam.visible = true;
            slam.rotation = 0;
            slam.offsetY = 0;
            if (t < SLAM_IMPACT_MS) {
              // Comes in big from the camera and hits the centre.
              const s = 2.8 + (1 - 2.8) * easeInCubic(t / SLAM_IMPACT_MS);
              slam.scaleX = s;
              slam.scaleY = s;
              slam.rotation = -0.12 * (1 - t / SLAM_IMPACT_MS);
            } else if (t < SLAM_IMPACT_MS + SLAM_SETTLE_MS) {
              if (!shook) {
                shook = true;
                director.shake(o.shake ?? 0.55);
                this.context.events?.emit("slam", { text: o.text });
              }
              // Squash on impact, overshoot, settle.
              const k = (t - SLAM_IMPACT_MS) / SLAM_SETTLE_MS;
              const wobble = Math.sin(k * Math.PI * 2) * (1 - k);
              slam.scaleX = 1 + 0.14 * wobble;
              slam.scaleY = 1 - 0.16 * wobble;
            } else if (t < flickStart) {
              slam.scaleX = 1;
              slam.scaleY = 1;
            } else if (t < flickStart + SLAM_ANTICIPATE_MS) {
              // Anticipate the exit.
              const k = easeOutCubic((t - flickStart) / SLAM_ANTICIPATE_MS);
              slam.scaleX = 1 + 0.08 * k;
              slam.scaleY = 1 + 0.08 * k;
            } else {
              const k = easeInCubic(clamp01((t - flickStart - SLAM_ANTICIPATE_MS) / SLAM_FLICK_MS));
              slam.scaleX = 1.08 * (1 - k);
              slam.scaleY = 1.08 * (1 - k) + 0.3 * k;
              slam.rotation = 0.5 * k;
              slam.offsetY = 0.6 * k;
              if (k >= 1) slam.visible = false;
            }
          },
        };
      }

      case "wipe": {
        const o = options as WipeOptions;
        const cover = o.coverMs ?? 380;
        const hold = o.holdMs ?? 140;
        const reveal = o.revealMs ?? 420;
        fx.wipe.color.set(o.color ?? this.accent);
        fx.wipe.angle = ((o.angle ?? 18) * Math.PI) / 180;
        return {
          ...base,
          duration: cover + hold + reveal,
          coverAt: cover,
          step: (t) => {
            if (t < cover) fx.wipe.progress = easeInOutCubic(t / cover);
            else if (t < cover + hold) fx.wipe.progress = 1;
            else fx.wipe.progress = 1 + easeInOutCubic(clamp01((t - cover - hold) / reveal));
            if (t >= cover + hold + reveal) fx.wipe.progress = 0;
          },
        };
      }

      case "letterboxIn":
      case "letterboxOut": {
        const o = options as LetterboxOptions;
        const ms = o.ms ?? 450;
        const from = fx.letterbox;
        const to = kind === "letterboxIn" ? 1 : 0;
        // Driven on the timeline (not eased by PostFx) so it holds under freezeAt.
        return {
          ...base,
          duration: ms,
          coverAt: 0,
          step: (t) => {
            const value = from + (to - from) * easeInOutCubic(clamp01(t / ms));
            fx.letterbox = value;
            fx.letterboxTarget = value;
          },
        };
      }

      case "iris": {
        const o = options as IrisOptions;
        const close = o.closeMs ?? 650;
        const hold = o.holdMs ?? 700;
        const open = o.openMs ?? 550;
        const shut = o.full ? 170 : 0;
        const radius = o.radius ?? 0.17;
        const target = o.target;
        fx.iris.color.set(o.color ?? this.accentDark).multiplyScalar(0.55);
        const track = () => {
          if (!target) {
            fx.iris.world = null;
            fx.iris.center.set(0.5, 0.5);
            return;
          }
          const world = (fx.iris.world ??= new Vector3());
          if (typeof target === "function") {
            const point = target();
            if (point) world.copy(point);
          } else if ((target as Object3D).isObject3D) {
            (target as Object3D).getWorldPosition(world);
          } else {
            world.copy(target as Vector3);
          }
        };
        return {
          ...base,
          duration: close + hold + shut + open,
          coverAt: o.full ? close + hold + shut : close,
          step: (t) => {
            if (t < close + hold + shut || !o.full) track();
            if (t < close) {
              fx.iris.radius = IRIS_OPEN + (radius - IRIS_OPEN) * easeInOutCubic(t / close);
            } else if (t < close + hold) {
              fx.iris.radius = radius * (1 + 0.04 * Math.sin((t - close) / 90));
            } else if (t < close + hold + shut) {
              fx.iris.radius = radius * (1 - easeInCubic((t - close - hold) / shut));
            } else {
              if (o.full) {
                fx.iris.world = null;
                fx.iris.center.set(0.5, 0.5);
              }
              const k = easeOutCubic(clamp01((t - close - hold - shut) / open));
              fx.iris.radius = (o.full ? 0 : radius) + (IRIS_OPEN - (o.full ? 0 : radius)) * k;
            }
            if (t >= close + hold + shut + open) {
              fx.iris.radius = IRIS_OPEN + 0.1;
              fx.iris.world = null;
            }
          },
        };
      }

      case "matchCut": {
        const o = options as MatchCutOptions;
        const seconds = o.seconds ?? 0.7;
        return {
          ...base,
          duration: seconds * 1000,
          coverAt: 0,
          onCover: () => {
            const camera = this.context.camera();
            if (camera) director.matchCut(o.to, o.request ?? {}, o.target, camera, seconds);
            else director.request(o.to, { ...o.request, force: true });
            o.onCover?.();
          },
          step: () => {},
        };
      }
    }
  }
}
