import {
  DEFAULT_AMBIENT,
  type AmbientEnergy,
  type AmbientPulse,
  type AmbientScene,
  type AmbientState,
} from "@/lib/ambient-events";
import { BubblesField } from "./bubbles";
import { ConfettiField } from "./confetti";
import { approach, clamp, type Field, type FieldEnv } from "./field";
import { readPalette, SpriteCache, type AmbientPalette } from "./palette";
import { PixelsField } from "./pixels";
import { StarsField } from "./stars";

/** What `window.__ambientStats` reports in development. */
export interface AmbientStats {
  /** Mean JS work per drawn frame (update + draw), over the last 120 frames. */
  avgFrameMs: number;
  /** Worst frame in the same window. */
  maxFrameMs: number;
  /** Frames drawn in the last second. */
  fps: number;
  particles: number;
  scene: AmbientScene;
  surface: "stage" | "phone";
  dpr: number;
  /** The adaptive drop to 30fps and half the particles has happened. */
  dropped: boolean;
  running: boolean;
}

declare global {
  interface Window {
    __ambientStats?: AmbientStats;
  }
}

const ENERGY: Record<AmbientEnergy, { speed: number; density: number; alpha: number }> = {
  calm: { speed: 1, density: 0.85, alpha: 1 },
  focus: { speed: 0.55, density: 0.5, alpha: 0.75 },
  hype: { speed: 1.6, density: 1, alpha: 1.45 },
};
/** Energy, urgency and mood ease with these time constants (seconds). */
const ENERGY_TAU = 0.8;
const MOOD_TAU = 0.7;
const CROSSFADE_S = 0.7;
const SWELL_S = 1.2;
const PULSE_GAP_MS = 1_500;
const MAX_DPR = 1.5;
const SOFT_SCALE = 0.5;
const WINDOW = 120;
/** How often the engine re-reads the `[data-ambient-calm]` boxes, and how far their edges feather. */
const CALM_RECT_MS = 500;
const CALM_FEATHER = 56;
/** What is left of a particle right on top of marked text. */
const CALM_RECT_MIN = 0.12;

let confettiUntil = 0;

/** Tells the background a confetti burst is on screen, so it halves its frame rate meanwhile. */
export function noteConfettiBurst(ms = 3_000) {
  if (typeof performance === "undefined") return;
  confettiUntil = Math.max(confettiUntil, performance.now() + ms);
}

function makeField(scene: AmbientScene): Field {
  switch (scene) {
    case "pixels":
      return new PixelsField();
    case "bubbles":
      return new BubblesField();
    case "confetti":
      return new ConfettiField();
    default:
      return new StarsField();
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * The ambient background's loop: one rAF for up to two fields (while a scene
 * crossfades), drawn on a full-resolution canvas and a half-resolution one.
 * It pauses when the tab is hidden or a phone keyboard is up, runs at 30fps
 * on phones, drops itself to 30fps and half the particles on slow devices,
 * and under reduced motion draws a single still frame. Particles stay off the
 * screen centre, the top band (the rail) and any element marked
 * `data-ambient-calm` (use it on blocks of text that sit off-centre).
 */
export class AmbientEngine {
  private crisp: CanvasRenderingContext2D;
  private soft: CanvasRenderingContext2D;
  private state: AmbientState = DEFAULT_AMBIENT;
  private fields = new Map<AmbientScene, Field>();
  private active: AmbientScene = DEFAULT_AMBIENT.scene;
  private outgoing: AmbientScene | null = null;
  private mix = 1;
  private sprites = new SpriteCache();
  private palette: AmbientPalette;
  private env: FieldEnv;
  private speed = ENERGY.calm.speed;
  private density = ENERGY.calm.density;
  private alpha = ENERGY.calm.alpha;
  private urgent = 0;
  private mood = 0.5;
  private swellAge = -1;
  private lastPulse = -Infinity;
  private pointer = { x: 0, y: 0 };
  private hover: MediaQueryList;
  private raf = 0;
  private lastDraw = 0;
  private reduced = false;
  private hidden = false;
  private typing = false;
  private destroyed = false;
  private dropped = false;
  private softDirty = false;
  private calmZone = {
    cx: 0,
    cy: 0,
    ix: 0,
    iy: 0,
    min: 0.3,
    a: 0.16,
    b: 0.72,
    ky: 1,
    top: 0,
    band: 1,
  };
  /** Boxes of marked text (`data-ambient-calm`), in CSS px, re-read every half second. */
  private calmRects: { l: number; t: number; r: number; b: number }[] = [];
  private calmRectsAt = -Infinity;
  private work: number[] = [];
  private intervals: number[] = [];
  private drawnTimes: number[] = [];
  private framesSinceStats = 0;

  constructor(
    private wrapper: HTMLElement,
    private crispCanvas: HTMLCanvasElement,
    private softCanvas: HTMLCanvasElement,
  ) {
    this.crisp = crispCanvas.getContext("2d")!;
    this.soft = softCanvas.getContext("2d")!;
    this.palette = readPalette();
    this.hover = window.matchMedia("(hover: hover) and (pointer: fine)");
    const zone = this.calmZone;
    this.env = {
      w: 1,
      h: 1,
      dpr: 1,
      softScale: SOFT_SCALE,
      phone: false,
      palette: this.palette,
      sprites: this.sprites,
      version: 0,
      t: 0,
      speed: 1,
      density: ENERGY.calm.density,
      alpha: 1,
      urgent: 0,
      mood: 0.5,
      countScale: 1,
      px: 0,
      py: 0,
      calm: (x, y) => {
        const dx = (x - zone.cx) * zone.ix;
        const dy = (y - zone.cy) * zone.iy * zone.ky;
        const t = clamp((Math.sqrt((dx * dx + dy * dy) / 2) - zone.a) / (zone.b - zone.a), 0, 1);
        // The top band holds the stage rail and the phone bar: nothing drifts behind them.
        const u = clamp((y - zone.top) / zone.band, 0, 1);
        let quiet = (zone.min + (1 - zone.min) * t * t * (3 - 2 * t)) * u * u * (3 - 2 * u);
        // Text the page marked (a lobby column, a phone hero) stays clear wherever it sits.
        for (const rect of this.calmRects) {
          const ox = Math.max(rect.l - x, 0, x - rect.r);
          const oy = Math.max(rect.t - y, 0, y - rect.b);
          const v = clamp(Math.sqrt(ox * ox + oy * oy) / CALM_FEATHER, 0, 1);
          quiet *= CALM_RECT_MIN + (1 - CALM_RECT_MIN) * v * v * (3 - 2 * v);
        }
        return quiet;
      },
    };
    this.resize();
  }

  private get phone() {
    if (this.state.surface === "phone") return true;
    return (
      window.matchMedia("(pointer: coarse)").matches &&
      Math.min(window.innerWidth, window.innerHeight) < 600
    );
  }

  private field(scene: AmbientScene) {
    let field = this.fields.get(scene);
    if (!field) {
      field = makeField(scene);
      field.seed(this.env);
      this.fields.set(scene, field);
    }
    return field;
  }

  /** Re-measures the viewport and reseeds every field for the new size. */
  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const phone = this.phone;
    const env = this.env;
    if (dpr !== env.dpr) {
      this.sprites.clear();
      env.version++;
    }
    Object.assign(env, {
      w,
      h,
      dpr,
      phone,
      countScale:
        (phone ? 0.4 : clamp(Math.sqrt((w * h) / (1920 * 1080)), 0.55, 1.3)) *
        (this.dropped ? 0.5 : 1),
    });
    Object.assign(this.calmZone, {
      cx: w / 2,
      cy: h / 2,
      ix: 2 / w,
      iy: 2 / h,
      min: phone ? 0.35 : 0.3,
      a: phone ? 0.1 : 0.16,
      b: phone ? 0.75 : 0.72,
      ky: phone ? 0.35 : 1,
      // Clear above ~6% of the height (the rail is 3.5rem = 7.8% at 16:9), full by ~14%.
      top: h * 0.06,
      band: h * 0.08,
    });
    this.crispCanvas.width = Math.round(w * dpr);
    this.crispCanvas.height = Math.round(h * dpr);
    this.softCanvas.width = Math.round(w * SOFT_SCALE);
    this.softCanvas.height = Math.round(h * SOFT_SCALE);
    for (const field of this.fields.values()) field.seed(env);
    this.field(this.active);
    this.redrawIfStill();
  }

  /** Re-reads the theme colours, e.g. after `data-theme` or `data-game` changed on <html>. */
  refreshPalette() {
    this.palette = readPalette();
    this.env.palette = this.palette;
    this.sprites.clear();
    this.env.version++;
    this.redrawIfStill();
  }

  setState(next: AmbientState) {
    const previous = this.state;
    this.state = next;
    this.wrapper.dataset.scene = next.scene;
    this.wrapper.dataset.urgent = String(next.urgent);
    if (next.surface !== previous.surface) this.resize();
    if (next.scene !== this.active) {
      if (this.reduced) {
        this.outgoing = null;
        this.mix = 1;
      } else {
        this.outgoing = this.active;
        this.mix = 0;
        this.swellAge = 0;
      }
      this.active = next.scene;
      this.field(next.scene);
    }
    this.redrawIfStill();
  }

  /** A one-off reaction. Rate-limited to one every 1.5s (a swell always passes). */
  pulse(pulse: AmbientPulse) {
    if (this.reduced || this.destroyed) return;
    if (pulse.kind === "swell") {
      this.swellAge = 0;
      return;
    }
    const now = performance.now();
    if (now - this.lastPulse < PULSE_GAP_MS) return;
    this.lastPulse = now;
    const origin = pulse.origin ?? { x: 0.5, y: 0.5 };
    const strength = clamp(pulse.strength ?? 1, 0, 1) * (this.env.phone ? 0.6 : 1);
    this.field(this.active).pulse(
      { kind: pulse.kind, x: origin.x * this.env.w, y: origin.y * this.env.h, strength },
      this.env,
    );
  }

  setPointer(clientX: number, clientY: number) {
    this.pointer.x = (0.5 - clientX / this.env.w) * 12;
    this.pointer.y = (0.5 - clientY / this.env.h) * 12;
  }

  setReduced(reduced: boolean) {
    this.reduced = reduced;
    if (reduced) {
      this.outgoing = null;
      this.mix = 1;
    }
    this.sync();
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.sync();
  }

  /** Phones pause while the keyboard is up. */
  setTyping(typing: boolean) {
    this.typing = typing && this.env.phone;
    this.sync();
  }

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (process.env.NODE_ENV !== "production") delete window.__ambientStats;
  }

  /** Starts, stops, or redraws the still frame to match the current flags. */
  sync() {
    const run = !this.reduced && !this.hidden && !this.typing && !this.destroyed;
    if (run && !this.raf) {
      this.lastDraw = 0;
      this.raf = requestAnimationFrame(this.frame);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.redrawIfStill();
    this.publish();
  }

  /** Re-reads the marked text boxes at most every `CALM_RECT_MS` (or now, with `force`). */
  private measureCalm(force = false) {
    const now = performance.now();
    if (!force && now - this.calmRectsAt < CALM_RECT_MS) return;
    this.calmRectsAt = now;
    const rects: { l: number; t: number; r: number; b: number }[] = [];
    for (const element of document.querySelectorAll("[data-ambient-calm]")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || box.bottom < 0 || box.top > this.env.h) continue;
      rects.push({ l: box.left, t: box.top, r: box.right, b: box.bottom });
      if (rects.length >= 8) break;
    }
    this.calmRects = rects;
  }

  private redrawIfStill() {
    if (!this.reduced || this.destroyed) return;
    this.measureCalm(true);
    // Snap eased values to their targets and draw one representative frame.
    const target = ENERGY[this.state.energy];
    this.speed = target.speed;
    this.density = target.density;
    this.alpha = target.alpha;
    this.urgent = this.state.urgent ? 1 : 0;
    this.mood = this.state.mood == null ? 0.5 : clamp(this.state.mood / 100, 0, 1);
    this.step(0);
    this.render();
  }

  private targetFps() {
    let fps = this.env.phone || this.dropped ? 30 : 60;
    if (performance.now() < confettiUntil) fps = Math.min(fps, 30);
    return fps;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const gap = 1000 / this.targetFps();
    if (this.lastDraw && now - this.lastDraw < gap - 2) return;
    const interval = this.lastDraw ? now - this.lastDraw : gap;
    this.lastDraw = now;
    const started = performance.now();
    this.measureCalm();
    this.step(Math.min(0.05, interval / 1000));
    this.render();
    this.record(performance.now() - started, interval, now);
  };

  private step(dt: number) {
    const env = this.env;
    env.t += dt;
    const target = ENERGY[this.state.energy];
    this.speed = approach(this.speed, target.speed, dt, ENERGY_TAU);
    this.density = approach(this.density, target.density, dt, ENERGY_TAU);
    this.alpha = approach(this.alpha, target.alpha, dt, ENERGY_TAU);
    this.urgent = approach(this.urgent, this.state.urgent ? 1 : 0, dt, ENERGY_TAU);
    const mood = this.state.mood == null ? 0.5 : clamp(this.state.mood / 100, 0, 1);
    this.mood = approach(this.mood, mood, dt, MOOD_TAU);
    let swell = 0;
    if (this.swellAge >= 0) {
      this.swellAge += dt;
      if (this.swellAge >= SWELL_S) this.swellAge = -1;
      else swell = 0.25 * Math.sin((Math.PI * this.swellAge) / SWELL_S);
    }
    const parallax = !env.phone && this.hover.matches;
    env.px = approach(env.px, parallax ? this.pointer.x : 0, dt, 0.4);
    env.py = approach(env.py, parallax ? this.pointer.y : 0, dt, 0.4);
    env.speed = this.speed * (1 + swell) * (1 + 0.2 * this.urgent);
    env.density = this.density;
    env.alpha = this.alpha * (1 + swell);
    env.urgent = this.urgent;
    env.mood = this.mood;
    if (this.outgoing) {
      this.mix = Math.min(1, this.mix + dt / CROSSFADE_S);
      this.field(this.outgoing).update(dt, env);
      if (this.mix >= 1) this.outgoing = null;
    }
    this.field(this.active).update(dt, env);
  }

  private render() {
    const env = this.env;
    const { crisp, soft } = this;
    crisp.setTransform(1, 0, 0, 1, 0, 0);
    crisp.clearRect(0, 0, this.crispCanvas.width, this.crispCanvas.height);
    const active = this.field(this.active);
    const outgoing = this.outgoing ? this.field(this.outgoing) : null;
    const usesSoft = active.usesSoft || !!outgoing?.usesSoft;
    if (usesSoft || this.softDirty) {
      soft.setTransform(1, 0, 0, 1, 0, 0);
      soft.clearRect(0, 0, this.softCanvas.width, this.softCanvas.height);
      this.softDirty = usesSoft;
    }
    const layers = { crisp, soft };
    const weight = easeInOut(this.mix);
    if (outgoing) {
      crisp.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      soft.setTransform(env.softScale, 0, 0, env.softScale, 0, 0);
      outgoing.draw(layers, env, 1 - weight);
    }
    crisp.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    soft.setTransform(env.softScale, 0, 0, env.softScale, 0, 0);
    active.draw(layers, env, outgoing ? weight : 1);
  }

  private record(work: number, interval: number, now: number) {
    this.work.push(work);
    this.intervals.push(interval);
    this.drawnTimes.push(now);
    if (this.work.length > WINDOW) this.work.shift();
    if (this.intervals.length > WINDOW) this.intervals.shift();
    while (this.drawnTimes.length && now - this.drawnTimes[0]! > 1000) this.drawnTimes.shift();
    // A device that can't keep up gets 30fps and half the particles, once.
    if (!this.dropped && this.work.length === WINDOW && this.targetFps() === 60) {
      const slow = this.intervals.filter((gap) => gap > 24).length;
      const average = this.work.reduce((sum, ms) => sum + ms, 0) / WINDOW;
      if (slow >= WINDOW * 0.9 || average > 4) {
        this.dropped = true;
        this.resize();
      }
    }
    if (++this.framesSinceStats >= 30) {
      this.framesSinceStats = 0;
      this.publish();
    }
  }

  private publish() {
    if (process.env.NODE_ENV === "production" || this.destroyed) return;
    const work = this.work;
    let particles = this.field(this.active).count();
    if (this.outgoing) particles += this.field(this.outgoing).count();
    window.__ambientStats = {
      avgFrameMs: work.length ? +(work.reduce((a, b) => a + b, 0) / work.length).toFixed(3) : 0,
      maxFrameMs: work.length ? +Math.max(...work).toFixed(3) : 0,
      fps: this.raf ? this.drawnTimes.length : 0,
      particles,
      scene: this.active,
      surface: this.env.phone ? "phone" : "stage",
      dpr: this.env.dpr,
      dropped: this.dropped,
      running: this.raf !== 0,
    };
  }
}
