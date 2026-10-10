import {
  clamp,
  pick,
  presence,
  rand,
  relax,
  shock,
  type Field,
  type FieldEnv,
  type FieldLayers,
  type FieldPulse,
  type Mote,
} from "./field";
import { glowDot, mix, rgba, type Sprite } from "./palette";

/**
 * "pixels": SlopLash's digital rain in the house pixel style. Sparse columns
 * of square pixels fall on a grid, stepping cell by cell like an LED panel,
 * each with a fading trail. Now and then one head drips: it stretches near the
 * bottom of the screen, then falls on.
 */

interface Column extends Mote {
  /** Grid column index. */
  gx: number;
  /** Head position in CSS px (continuous; drawn snapped to the grid). */
  head: number;
  v: number;
  tone: number;
  /** Seconds left before this column falls again; 0 while falling. */
  wait: number;
  /** Rank for urgency tinting. */
  warm: number;
  /** Horizontal offset after a shockwave, springing back to the grid. */
  ox: number;
  /** 0 none, otherwise drip stretch progress (seconds since it began). */
  drip: number;
}

/** Tones: ink-dim, teal, punch, gold. */
const TONE_WEIGHTS = [0.55, 0.22, 0.13, 0.1] as const;
const PUNCH = 2;
const TEAL = 1;
const GOLD = 3;
/** Trail cells behind the head, relative to the head's alpha. */
const TRAIL = [1, 0.62, 0.46, 0.33, 0.23, 0.15, 0.09, 0.04] as const;
const DRIP_FORM = 0.4;

interface Grid {
  /** Pixel size, gap pitch and column spacing in CSS px. */
  unit: number;
  pitch: number;
  colW: number;
  cols: number;
}

interface Skin {
  version: number;
  key: string;
  trails: Sprite[];
  fills: string[];
  pad: number;
}

export class PixelsField implements Field {
  readonly usesSoft = false;
  private columns: Column[] = [];
  private grid: Grid = { unit: 6, pitch: 8, colW: 24, cols: 1 };
  private skin: Skin | null = null;
  private nextDrip = rand(3, 6);
  private overrideTone = -1;
  private overrideUntil = 0;
  private cheerUntil = 0;
  private burst = 0;
  private chill = 0;
  private glitchUntil = 0;
  private bands: { y: number; h: number; dx: number }[] = [];
  private scratch: HTMLCanvasElement | null = null;

  count() {
    return this.columns.length;
  }

  seed(env: FieldEnv) {
    const unit = env.phone ? 4 : clamp(Math.round(env.h / 180), 4, 8);
    const pitch = unit + Math.max(2, Math.round(unit / 3));
    const colW = env.phone ? 20 : Math.max(16, Math.round(env.h / 45));
    const cols = Math.max(1, Math.floor(env.w / colW));
    const rescale = this.grid.pitch ? pitch / this.grid.pitch : 1;
    this.grid = { unit, pitch, colW, cols };
    const wanted = clamp(Math.round(28 * env.countScale), 4, cols);
    const kept = this.columns.slice(0, wanted).filter((column) => column.gx < cols);
    for (const column of kept) column.head *= rescale;
    const taken = new Set(kept.map((column) => column.gx));
    const free = Array.from({ length: cols }, (_, i) => i).filter((i) => !taken.has(i));
    while (kept.length < wanted && free.length) {
      const gx = free.splice(Math.floor(Math.random() * free.length), 1)[0]!;
      const column: Column = {
        gx,
        x: 0,
        y: 0,
        head: rand(-0.2, 1) * env.h,
        v: 0,
        tone: 0,
        wait: 0,
        warm: Math.random(),
        ox: 0,
        drip: 0,
        kx: 0,
        ky: 0,
        lift: 0,
        rank: Math.random(),
      };
      this.respawn(column, env, false);
      kept.push(column);
    }
    this.columns = kept;
  }

  private respawn(column: Column, env: FieldEnv, fromTop: boolean) {
    column.v = rand(18, 42) * clamp(env.h / 1080, 0.6, 1.4);
    column.tone = pick(TONE_WEIGHTS);
    column.drip = 0;
    column.wait = fromTop ? rand(0, 6) : 0;
    if (fromTop) column.head = -rand(0, 0.15) * env.h;
    column.x = this.columnX(column);
  }

  private columnX(column: Column) {
    const { colW, unit } = this.grid;
    return column.gx * colW + (colW - unit) / 2;
  }

  private dress(env: FieldEnv): Skin {
    const { unit, pitch } = this.grid;
    const key = `${unit}:${pitch}`;
    if (this.skin?.version === env.version && this.skin.key === key) return this.skin;
    const { palette, sprites, dpr } = env;
    const tones = [palette.inkDim, palette.teal, palette.punch, palette.gold];
    const dark = palette.dark;
    // In the dark the head burns brighter than its trail, like a fresh pixel.
    const heads = tones.map((c) => (dark ? mix(c, palette.ink, 0.55) : c));
    const pad = dark ? Math.ceil(unit * 1.4) : 0;
    const width = unit + pad * 2;
    const height = (TRAIL.length - 1) * pitch + unit + pad * 2;
    const trails = tones.map((c, tone) =>
      sprites.get(`trail:${c.join(",")}:${key}:${dark}:${dpr}`, width * dpr, height * dpr, (g) => {
        g.scale(dpr, dpr);
        const headY = pad + (TRAIL.length - 1) * pitch;
        if (dark) {
          // A faint halo around the head only.
          const halo = glowDot(sprites, c, unit * 1.6, 0.25, dpr);
          g.globalAlpha = tone === 0 ? 0.35 : 0.5;
          g.drawImage(
            halo,
            pad + unit / 2 - unit * 1.6,
            headY + unit / 2 - unit * 1.6,
            unit * 3.2,
            unit * 3.2,
          );
        }
        TRAIL.forEach((a, i) => {
          g.fillStyle = rgba(i ? c : heads[tone]!, 1);
          g.globalAlpha = a;
          g.fillRect(pad, headY - i * pitch, unit, unit);
        });
      }),
    );
    this.skin = { version: env.version, key, trails, fills: tones.map((c) => rgba(c, 1)), pad };
    return this.skin;
  }

  update(dt: number, env: FieldEnv) {
    this.burst *= Math.exp(-dt / 0.35);
    this.chill *= Math.exp(-dt / 1.2);
    const cheering = env.t < this.cheerUntil;
    const base = env.speed * (1 + this.burst) * (1 - 0.6 * this.chill) * (1 + 0.15 * env.urgent);
    if (env.t >= this.nextDrip) {
      this.nextDrip = env.t + rand(6, 10);
      const candidates = this.columns.filter(
        (column) => !column.wait && !column.drip && column.head < env.h * 0.55 && column.head > 0,
      );
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      if (chosen) chosen.drip = -1; // armed: starts forming in the bottom third
    }
    for (const column of this.columns) {
      relax(column, dt);
      column.ox = (column.ox + column.kx * dt) * Math.exp(-dt / 0.5);
      if (column.wait > 0) {
        column.wait -= dt;
        if (column.wait <= 0) {
          column.wait = 0;
          // Pick a fresh grid column so the screen never settles into a pattern.
          const used = new Set(this.columns.map((other) => other.gx));
          const free = Array.from({ length: this.grid.cols }, (_, i) => i).filter(
            (i) => !used.has(i),
          );
          if (free.length) column.gx = free[Math.floor(Math.random() * free.length)]!;
          column.x = this.columnX(column);
        }
        continue;
      }
      let v = column.v * base * (cheering ? 1.4 : 1);
      if (column.drip === -1 && column.head > env.h * 0.66) column.drip = 0.0001;
      if (column.drip > 0) {
        column.drip += dt;
        if (column.drip < DRIP_FORM) v *= 0.2;
        else v *= 1.7;
      }
      column.head += v * dt + column.ky * dt;
      column.y = column.head - (TRAIL.length * this.grid.pitch) / 2;
      const tail = TRAIL.length * this.grid.pitch * (column.drip > 0 ? 2 : 1);
      if (column.head - tail > env.h) this.respawn(column, env, true);
    }
  }

  draw({ crisp: g }: FieldLayers, env: FieldEnv, alpha: number) {
    const skin = this.dress(env);
    const { unit, pitch } = this.grid;
    const dark = env.palette.dark;
    const span = (TRAIL.length - 1) * pitch;
    const overriding = env.t < this.overrideUntil;
    const cheering = env.t < this.cheerUntil;
    const fade = env.alpha * alpha * (1 - 0.4 * this.chill);
    for (const column of this.columns) {
      if (column.wait > 0) continue;
      const row = Math.floor(column.head / pitch) * pitch;
      const x = column.x + column.ox;
      let tone = column.tone;
      if (cheering) tone = column.gx % 2 ? GOLD : TEAL;
      else if (overriding) tone = this.overrideTone;
      else if (column.warm < 0.3 * env.urgent) tone = PUNCH;
      const headAlpha = dark ? (tone === 0 ? 0.5 : 0.62) : tone === 0 ? 0.13 : 0.17;
      // The quieter end of the trail sets the column's alpha, so no trail pokes into the calm zone.
      const a =
        headAlpha *
        Math.min(env.calm(x, row), env.calm(x, Math.max(0, row - span))) *
        presence(column, env) *
        fade *
        (cheering ? 1.4 : 1);
      if (a < 0.006) continue;
      g.globalAlpha = Math.min(1, a);
      const sprite = skin.trails[tone]!;
      const top = row - span - skin.pad;
      g.drawImage(sprite, x - skin.pad, top, sprite.width / env.dpr, sprite.height / env.dpr);
      if (column.drip > 0) {
        const stretch = Math.min(1, column.drip / DRIP_FORM);
        const eased = 1 - (1 - stretch) * (1 - stretch);
        g.fillStyle = skin.fills[tone]!;
        g.fillRect(x, row + unit, unit, unit * eased);
      }
    }
    g.globalAlpha = 1;
    if (env.t < this.glitchUntil) this.glitch(g, env);
  }

  /** Three horizontal bands of the canvas slip sideways for an instant. */
  private glitch(g: CanvasRenderingContext2D, env: FieldEnv) {
    const canvas = g.canvas;
    this.scratch ??= document.createElement("canvas");
    const scratch = this.scratch;
    const sg = scratch.getContext("2d");
    if (!sg) return;
    for (const band of this.bands) {
      const sy = Math.round(band.y * env.dpr);
      const sh = Math.max(1, Math.round(band.h * env.dpr));
      if (scratch.width !== canvas.width || scratch.height < sh) {
        scratch.width = canvas.width;
        scratch.height = Math.max(sh, scratch.height);
      }
      sg.clearRect(0, 0, scratch.width, sh);
      sg.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
      g.clearRect(0, band.y, env.w, band.h);
      g.drawImage(scratch, 0, 0, canvas.width, sh, band.dx, band.y, env.w, band.h);
    }
  }

  pulse(pulse: FieldPulse, env: FieldEnv) {
    shock(this.columns, pulse, env, pulse.kind === "chill" ? 60 : 180);
    switch (pulse.kind) {
      case "cheer":
        this.cheerUntil = env.t + 0.6;
        this.burst = Math.max(this.burst, 2 * pulse.strength);
        break;
      case "gust":
        this.burst = Math.max(this.burst, 1.5 * pulse.strength);
        break;
      case "slop":
        this.overrideTone = PUNCH;
        this.overrideUntil = env.t + 0.9;
        if (!env.phone) {
          this.glitchUntil = env.t + 0.12;
          this.bands = [0, 1, 2].map(() => ({
            y: rand(0.1, 0.85) * env.h,
            h: rand(0.03, 0.08) * env.h,
            dx: (Math.random() < 0.5 ? -1 : 1) * 8,
          }));
        }
        break;
      case "heart":
        this.overrideTone = GOLD;
        this.overrideUntil = env.t + 0.8;
        break;
      case "chill":
        this.chill = Math.max(this.chill, pulse.strength);
        break;
      case "swell":
        break;
    }
  }
}
