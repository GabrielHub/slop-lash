// The presentation clock. Everything time-based on the stage (animation, sim
// playback, shaders, camera drift) reads this instead of the wall clock, so a
// hit stop freezes the whole world, a slow-motion window slows all of it, and
// pausing stops it.
//
// It follows the server clock: `now` is the server's time (local wall clock +
// the room's `clockOffsetMs`) minus the "debt" that hit stops, slow motion and
// pauses ran up. The debt only grows inside those windows (speed ramps happen
// only in slow-motion windows; nothing ever runs faster than 1x), and it is
// dropped by `resync()` on a hard cut, where a jump in time cannot be seen:
// the director repays it on every cut made while the clock is `settled` (no
// hit stop, slow motion or pause running), and PhaseScene on every phase
// cover. `debtMs` tells a scene how far behind the server it is.

/** Hit stop length, in rendered frames (spec 6: four frozen frames). */
export const HIT_STOP_FRAMES = 4;

export interface SlowMoOptions {
  /** Time scale at the bottom of the window. */
  scale?: number;
  /** Real milliseconds held at `scale`, between the ramps. */
  durationMs?: number;
  /** Eased ramp from 1x down to `scale`, real milliseconds. */
  rampInMs?: number;
  /** Eased ramp from `scale` back to 1x, real milliseconds. */
  rampOutMs?: number;
}

export const DEFAULT_SLOW_MO: Required<SlowMoOptions> = {
  scale: 0.3,
  durationMs: 500,
  rampInMs: 70,
  rampOutMs: 180,
};

/** Longest frame step the animation delta accepts (a tab switch must not teleport things). */
const MAX_DELTA_SECONDS = 0.1;

interface SlowMoWindow extends Required<SlowMoOptions> {
  /** Real milliseconds spent in the window so far (hit-stopped frames do not count). */
  t: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Time scale of a slow-motion window `t` real ms after it started, or null once it is over. */
export function slowMoScaleAt(window: Required<SlowMoOptions>, t: number): number | null {
  const { scale, durationMs, rampInMs, rampOutMs } = window;
  if (t < 0) return 1;
  if (t < rampInMs) return 1 + (scale - 1) * smooth(t / rampInMs);
  if (t < rampInMs + durationMs) return scale;
  const out = t - rampInMs - durationMs;
  if (out < rampOutMs) return scale + (1 - scale) * smooth(out / rampOutMs);
  return null;
}

/** Real milliseconds a slow-motion window lasts, ramps included. */
export function slowMoLengthMs(options: SlowMoOptions = {}): number {
  const window = { ...DEFAULT_SLOW_MO, ...options };
  return window.rampInMs + window.durationMs + window.rampOutMs;
}

export interface StageClockOptions {
  /** How far the server clock is ahead of this device's (the room context's `clockOffsetMs`). */
  offsetMs?: number;
  /** Local wall clock in ms; injectable for tests. */
  wallNow?: () => number;
  /** Called when a resync drops a debt (with the milliseconds skipped). */
  onResync?: (droppedMs: number) => void;
}

export class StageClock {
  offsetMs: number;
  /** Scaled seconds this frame (0 while frozen or paused). Integrate animation with this. */
  delta = 0;
  /** Unscaled seconds this frame (camera shake, UI that must not slow down). */
  realDelta = 0;
  /** Scaled seconds since the clock started: monotonic, for shader time and idle loops. */
  elapsed = 0;
  /** Unscaled seconds since the clock started. */
  realElapsed = 0;
  /** The time scale applied this frame. */
  scale = 1;
  /** Frames ticked so far. */
  frame = 0;
  /** How far presentation time is behind the server, in ms. */
  debtMs = 0;

  private readonly wallNow: () => number;
  private readonly onResync: ((droppedMs: number) => void) | undefined;
  private presentationNow: number;
  private hitStopLeft = 0;
  private slowMoWindow: SlowMoWindow | null = null;
  private pausedFlag = false;

  constructor(options: StageClockOptions = {}) {
    this.offsetMs = options.offsetMs ?? 0;
    this.wallNow = options.wallNow ?? (() => Date.now());
    this.onResync = options.onResync;
    this.presentationNow = this.serverNow();
  }

  /** The server's clock right now, ignoring presentation effects. */
  serverNow(): number {
    return this.wallNow() + this.offsetMs;
  }

  /** Presentation time on the server clock, in ms, fixed for the current frame. */
  get now(): number {
    return this.presentationNow;
  }

  get frozen(): boolean {
    return this.hitStopLeft > 0;
  }

  get slowMotion(): boolean {
    return this.slowMoWindow !== null;
  }

  get paused(): boolean {
    return this.pausedFlag;
  }

  /** No hit stop, slow-motion window or pause is running, so a resync now would not cut one short. */
  get settled(): boolean {
    return this.hitStopLeft === 0 && this.slowMoWindow === null && !this.pausedFlag;
  }

  /** Freeze the world for `frames` rendered frames. Overlapping stops keep the longer one. */
  hitStop(frames: number = HIT_STOP_FRAMES): void {
    this.hitStopLeft = Math.max(this.hitStopLeft, Math.max(0, Math.round(frames)));
  }

  /**
   * Open a slow-motion window. A window requested during a hit stop starts
   * when the stop ends; a new window replaces the current one from its bottom
   * (no second ramp in).
   */
  slowMo(options: SlowMoOptions = {}): void {
    const window: SlowMoWindow = { ...DEFAULT_SLOW_MO, ...options, t: 0 };
    if (this.slowMoWindow && this.scale < 1) {
      // Already slow: continue at the held scale rather than ramping in again.
      window.t = window.rampInMs;
    }
    this.slowMoWindow = window;
  }

  pause(): void {
    this.pausedFlag = true;
  }

  resume(): void {
    this.pausedFlag = false;
  }

  /**
   * Drop the debt so presentation time snaps back to the server; returns the
   * milliseconds skipped. Only on a hard cut (or behind a covered transition):
   * everything driven by `now` jumps forward. The director already does this
   * on its cuts; see the file header.
   */
  resync(): number {
    const dropped = this.debtMs;
    this.debtMs = 0;
    this.presentationNow = this.serverNow();
    if (dropped > 0) this.onResync?.(dropped);
    return dropped;
  }

  /** Advance one rendered frame. `realDeltaSeconds` is the frame's real duration. */
  tick(realDeltaSeconds: number): void {
    // The wall step (bounded) runs the windows and the debt so presentation
    // time stays locked to the server; the clamped step drives animation.
    const wall = Math.min(Math.max(realDeltaSeconds, 0), 1);
    const real = Math.min(wall, MAX_DELTA_SECONDS);
    this.frame += 1;
    this.realDelta = real;
    this.realElapsed += real;

    let scale = 1;
    if (this.hitStopLeft > 0) {
      this.hitStopLeft -= 1;
      scale = 0;
    } else if (this.slowMoWindow) {
      // Sample the envelope halfway through this frame.
      const window = this.slowMoWindow;
      const current = slowMoScaleAt(window, window.t + wall * 500);
      window.t += wall * 1000;
      if (current !== null) scale = current;
      if (current === null || slowMoScaleAt(window, window.t) === null) this.slowMoWindow = null;
    }
    if (this.pausedFlag) scale = 0;

    this.scale = scale;
    this.delta = real * scale;
    this.elapsed += this.delta;
    this.debtMs += wall * 1000 * (1 - scale);
    this.presentationNow = this.serverNow() - this.debtMs;
  }
}
