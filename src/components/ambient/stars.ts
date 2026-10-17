import type { AmbientWarp } from "@/lib/ambient-events";
import { WARP_FEATHER, WARP_REVEAL_MS, warpReach, warpWave } from "@/lib/warp-transition";
import {
  approach,
  clamp,
  pick,
  presence,
  rand,
  relax,
  shock,
  smoothstep,
  wrap,
  type Field,
  type FieldEnv,
  type FieldLayers,
  type FieldPulse,
  type Mote,
} from "./field";
import { nebula } from "./nebula";
import {
  glowDot,
  mix,
  rgba,
  sparkle,
  spikes,
  starDot,
  streak,
  type Rgb,
  type Sprite,
} from "./palette";

/**
 * "stars": the brand sky behind home, host, join, lobbies, and leaderboards.
 * Four parallax layers drift up and to the right over a faint nebula, so it
 * feels like rising rather than raining: dense faint dust, far and mid stars,
 * and a few bright hero stars with diffraction spikes. Rare shooting stars in
 * the dark theme; in the light theme the stars become four-point sparkles
 * printed on paper, with no dust or nebula.
 *
 * Between screens the sky warps (`src/lib/warp-transition.ts`): it spirals
 * into the control that was pressed, waits there as one bright point while
 * the next screen loads, then bursts back out behind a shockwave.
 */

type Layer = 0 | 1 | 2 | 3;

interface Star extends Mote {
  layer: Layer;
  /** Draw size multiplier. */
  size: number;
  a: number;
  tone: number;
  /** Two twinkle rates and a phase: scintillation rather than a metronome. */
  tw: number;
  tw2: number;
  ph: number;
  /** Where it is drawn this frame (before parallax), and how fast it got there, px/s. */
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  /** Warp: its own delay and length (s), its progress (0-1), and how far it has left the sky's calm (0-1). */
  wd: number;
  wl: number;
  wu: number;
  ww: number;
  /** Warp anchor: its landing spot inside the control, or where the burst throws it from. */
  wx: number;
  wy: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

interface Warp {
  kind: AmbientWarp["kind"];
  /** When the phase began: field time for the stars, wall time for the shockwave (the page's reveal keys off it too). */
  t: number;
  at: number;
  /** The control's centre and size, CSS px. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The vortex's turn over the fall, radians, signed. */
  spin: number;
  /** How far the shockwave travels. */
  reach: number;
}

/** Tones: ink, cool white, warm white, teal, gold, punch. */
const PUNCH = 5;

const LAYERS = [
  // Dust: faint and dense, it turns a scatter of dots into a sky with depth.
  {
    n: 240,
    drift: 0.6,
    parallax: 0,
    a: [0.1, 0.28],
    twinkle: 0.2,
    tones: [0.6, 0.22, 0.18, 0, 0, 0],
  },
  {
    n: 100,
    drift: 1,
    parallax: 0,
    a: [0.26, 0.5],
    twinkle: 0.45,
    tones: [0.62, 0.2, 0.18, 0, 0, 0],
  },
  {
    n: 34,
    drift: 2.5,
    parallax: 0.4,
    a: [0.42, 0.66],
    twinkle: 0.3,
    tones: [0.5, 0.17, 0.17, 0.08, 0.08, 0],
  },
  {
    n: 8,
    drift: 5,
    parallax: 1,
    a: [0.5, 0.72],
    twinkle: 0.18,
    tones: [0.4, 0.1, 0.05, 0.15, 0.15, 0.15],
  },
] as const;

/** How much of each layer's sprite stays white-hot. */
const CORE = [0.5, 0.34, 0.22, 0.12];

/** Base drift in px/s at 1080p: up and to the right. */
const DRIFT_X = 2;
const DRIFT_Y = -1.2;
/** A moving star trails this much of its path (s), up to STREAK_MAX px at 1080p. */
const STREAK_S = 0.035;
const STREAK_MAX = 150;
/** The nebula is painted near full strength; this is how much of it shows. */
const NEBULA_ALPHA = 0.3;
/** The burst's flash, before the shockwave carries on alone. */
const FLASH_MS = 380;

/** Fast out, long settle, landing exactly on 1. */
const expoOut = (t: number) => (1 - 2 ** (-10 * t)) / (1 - 2 ** -10);

interface Skin {
  version: number;
  w: number;
  h: number;
  /** [layer][tone] */
  stars: Sprite[][];
  streaks: Sprite[];
  /** Sprite radius per layer, CSS px. */
  radius: number[];
  /** Hero-star spikes per tone (dark theme only). */
  spikes: Sprite[] | null;
  meteor: Sprite | null;
  /** The warp's gathered light: a broad halo and a hot centre. */
  halo: Sprite;
  hot: Sprite;
  ring: Rgb;
  nebula: Sprite | null;
}

export class StarsField implements Field {
  readonly usesSoft = true;
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private nextMeteor = rand(6, 12);
  private tintUntil = 0;
  private chill = 0;
  private skin: Skin | null = null;
  private warping: Warp | null = null;
  /** 0-1, eased: how much of the sky has landed in the control. */
  private held = 0;
  /** The nebula sinks toward a gather and is thrown back past where it was by the burst. */
  private nebulaZoom = 1;
  private nebulaGlow = 1;
  private origin = { x: 0, y: 0 };

  count() {
    return this.stars.length + this.meteors.length;
  }

  seed(env: FieldEnv) {
    const wanted = LAYERS.map((layer) => Math.max(2, Math.round(layer.n * env.countScale)));
    const next: Star[] = [];
    LAYERS.forEach((layer, index) => {
      const kept = this.stars.filter((star) => star.layer === index).slice(0, wanted[index]);
      for (const star of kept) {
        star.x = wrap(star.x, env.w, 0);
        star.y = wrap(star.y, env.h, 0);
      }
      next.push(...kept);
      for (let i = kept.length; i < wanted[index]!; i++) {
        const x = Math.random() * env.w;
        const y = Math.random() * env.h;
        next.push({
          layer: index as Layer,
          x,
          y,
          kx: 0,
          ky: 0,
          lift: 0,
          rank: Math.random(),
          size: rand(0.8, 1.25),
          a: rand(layer.a[0], layer.a[1]),
          tone: index === 3 && i < 3 ? i + 3 : pick(layer.tones),
          tw: rand(0.4, 1.3),
          tw2: rand(1.6, 3.4),
          ph: rand(0, Math.PI * 2),
          dx: x,
          dy: y,
          vx: 0,
          vy: 0,
          wd: 0,
          wl: 1,
          wu: 0,
          ww: 0,
          wx: x,
          wy: y,
        });
      }
    });
    this.stars = next;
    if (!this.origin.x) this.origin = { x: env.w / 2, y: env.h / 2 };
  }

  private dress(env: FieldEnv): Skin {
    const cached = this.skin;
    if (cached?.version === env.version && cached.w === env.w && cached.h === env.h) return cached;
    const { palette, sprites, dpr } = env;
    const { dark, ink } = palette;
    const tones: Rgb[] = dark
      ? [
          ink,
          mix(ink, palette.teal, 0.3),
          mix(ink, palette.gold, 0.3),
          palette.teal,
          palette.gold,
          palette.punch,
        ]
      : [
          palette.inkDim,
          palette.inkDim,
          palette.inkDim,
          palette.inkDim,
          palette.gold,
          palette.punch,
        ];
    const k = clamp(env.h / 1080, 0.75, 1.5);
    const radius = dark
      ? [1.5 * k, 2.6 * k, 4.4 * k, 10 * k]
      : [0.9 * k, 1.2 * k, 3.4 * k, 6.5 * k];
    const stars = LAYERS.map((_, layer) =>
      tones.map((c) => {
        const r = radius[layer]!;
        if (dark) return starDot(sprites, mix(c, ink, 0.6), c, r, CORE[layer]!, dpr);
        return layer < 2 ? glowDot(sprites, c, r, 0.7, dpr) : sparkle(sprites, c, r, dpr);
      }),
    );
    const meteor = dark
      ? sprites.get(`meteor:${ink.join(",")}:${dpr}`, 220 * dpr, 8 * dpr, (g) => {
          const w = 220 * dpr;
          const h = 8 * dpr;
          const tail = g.createLinearGradient(0, 0, w, 0);
          tail.addColorStop(0, rgba(ink, 0));
          tail.addColorStop(0.75, rgba(ink, 0.35));
          tail.addColorStop(1, rgba(ink, 0.9));
          g.fillStyle = tail;
          g.beginPath();
          g.moveTo(0, h / 2);
          g.lineTo(w - h / 2, h / 2 - 1.2 * dpr);
          g.lineTo(w, h / 2);
          g.lineTo(w - h / 2, h / 2 + 1.2 * dpr);
          g.closePath();
          g.fill();
          g.drawImage(glowDot(sprites, ink, 4, 0.3, dpr), w - h, 0, h, h);
        })
      : null;
    const flame = mix(palette.punch, palette.gold, 0.3);
    this.skin = {
      version: env.version,
      w: env.w,
      h: env.h,
      stars,
      streaks: tones.map((c) => streak(sprites, dark ? mix(c, ink, 0.3) : c, dpr)),
      radius,
      spikes: dark
        ? tones.map((c) => spikes(sprites, mix(c, ink, 0.5), radius[3]! * 3.4, dpr))
        : null,
      meteor,
      halo: dark
        ? glowDot(sprites, flame, 110, 0.12, dpr)
        : glowDot(sprites, palette.punch, 80, 0.1, dpr),
      hot: dark
        ? starDot(sprites, ink, flame, 18, 0.3, dpr)
        : glowDot(sprites, palette.punch, 10, 0.5, dpr),
      ring: dark ? mix(ink, palette.punch, 0.45) : palette.punch,
      nebula: dark ? nebula(env) : null,
    };
    return this.skin;
  }

  private launch(env: FieldEnv, from?: { x: number; y: number }, heading?: number) {
    if (!env.palette.dark || env.phone || this.warping) return;
    const k = clamp(env.h / 1080, 0.75, 1.5);
    const x = from?.x ?? rand(0.1, 0.9) * env.w;
    const y = from?.y ?? rand(0.05, 0.3) * env.h;
    // Away from the centre column, slanting down.
    const leftward = x < env.w / 2;
    const angle = heading ?? (leftward ? Math.PI - rand(0.3, 0.55) : rand(0.3, 0.55));
    const speed = 820 * k;
    this.meteors.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      age: 0,
      life: 0.65,
    });
  }

  update(dt: number, env: FieldEnv) {
    this.chill *= Math.exp(-dt / 1.2);
    const k = clamp(env.h / 1080, 0.75, 1.5);
    const speed = env.speed * (1 - 0.65 * this.chill) * k;
    const margin = 12;
    const warp = this.warping;
    let landed = 0;
    let flying = false;
    for (const star of this.stars) {
      // The sky holds its drift while it warps, so nothing wraps mid-flight.
      if (!warp) {
        const drift = LAYERS[star.layer].drift * speed;
        star.x = wrap(star.x + (DRIFT_X * drift + star.kx) * dt, env.w, margin);
        star.y = wrap(star.y + (DRIFT_Y * drift + star.ky) * dt, env.h, margin);
      }
      relax(star, dt);
      let x = star.x;
      let y = star.y;
      if (warp) {
        const u = clamp((env.t - warp.t - star.wd) / star.wl, 0, 1);
        star.wu = u;
        if (warp.kind === "gather") {
          // Falls in faster and faster, turning with the vortex.
          const e = u ** 2.4;
          const turn = warp.spin * e;
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          const ox = (star.x - star.wx) * (1 - e);
          const oy = (star.y - star.wy) * (1 - e);
          x = star.wx + ox * cos - oy * sin;
          y = star.wy + ox * sin + oy * cos;
          star.ww = Math.min(1, u * 4);
          if (u >= 1) landed++;
        } else {
          // Thrown out hard, then easing into its new place in the sky.
          const e = expoOut(u);
          x = star.wx + (star.x - star.wx) * e;
          y = star.wy + (star.y - star.wy) * e;
          star.ww = 1 - smoothstep(0.35, 1, u);
          if (u < 1) flying = true;
        }
      } else {
        star.wu = 0;
        star.ww = 0;
      }
      if (dt > 0) {
        star.vx = (x - star.dx) / dt;
        star.vy = (y - star.dy) / dt;
      }
      star.dx = x;
      star.dy = y;
    }

    const gathering = warp?.kind === "gather";
    const share = gathering ? landed / Math.max(1, this.stars.length) : 0;
    this.held = approach(this.held, share, dt, gathering ? 0.06 : 0.1);
    this.nebulaZoom = approach(this.nebulaZoom, gathering ? 0.94 : 1, dt, gathering ? 0.25 : 0.45);
    this.nebulaGlow = approach(this.nebulaGlow, gathering ? 0.4 : 1, dt, gathering ? 0.25 : 0.5);
    if (warp?.kind === "burst" && !flying && performance.now() - warp.at > WARP_REVEAL_MS) {
      this.warping = null;
    }

    if (env.t >= this.nextMeteor) {
      this.nextMeteor = env.t + rand(14, 24);
      this.launch(env);
    }
    for (const meteor of this.meteors) {
      meteor.age += dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
    }
    this.meteors = this.meteors.filter((meteor) => meteor.age < meteor.life);
  }

  draw({ crisp: g, soft }: FieldLayers, env: FieldEnv, alpha: number) {
    const skin = this.dress(env);
    const { dark } = env.palette;
    const tinted = env.t < this.tintUntil;
    const fade = env.alpha * alpha * (1 - 0.3 * this.chill);
    const k = clamp(env.h / 1080, 0.75, 1.5);
    const d = env.dpr;
    const warp = this.warping;
    if (skin.nebula) this.drawNebula(soft, skin.nebula, env, fade);

    g.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const star of this.stars) {
      if (!dark && star.layer === 0) continue;
      const layer = LAYERS[star.layer];
      const parallax = layer.parallax * (1 - star.ww);
      const x = star.dx + env.px * parallax;
      const y = star.dy + env.py * parallax;
      const twinkle =
        1 +
        layer.twinkle *
          (0.65 * Math.sin(star.tw * env.t + star.ph) +
            0.35 * Math.sin(star.tw2 * env.t + 1.7 * star.ph));
      // A warping star leaves the calm zone behind: it has to be seen landing in the control.
      const calm = env.calm(x, y);
      let a =
        star.a *
        twinkle *
        (calm + (1 - calm) * star.ww) *
        presence(star, env) *
        fade *
        (dark ? 1 : 0.32);
      let r = skin.radius[star.layer]! * star.size;
      if (warp?.kind === "gather") {
        // Heats up as it falls, and is gone the moment it lands.
        const e = star.wu ** 2.4;
        a *= (1 + 1.5 * e) * (1 - smoothstep(0.88, 1, star.wu));
        r *= 1 - 0.4 * e;
      } else if (warp) {
        a *= 1 + 1.2 * (1 - star.wu);
      }
      if (a < 0.006) continue;
      const tone = tinted && star.layer > 1 ? PUNCH : star.tone;
      const speed = Math.hypot(star.vx, star.vy);
      const length = Math.min(speed * STREAK_S, STREAK_MAX * k);
      if (length > r) {
        const cos = star.vx / speed;
        const sin = star.vy / speed;
        const width = Math.max(1.2, r * 0.9);
        g.setTransform(d * cos, d * sin, -d * sin, d * cos, d * x, d * y);
        g.globalAlpha = Math.min(1, a * 0.8);
        g.drawImage(skin.streaks[tone]!, -length, -width / 2, length, width);
        g.setTransform(d, 0, 0, d, 0, 0);
      }
      g.globalAlpha = Math.min(1, a);
      g.drawImage(skin.stars[star.layer]![tone]!, x - r, y - r, r * 2, r * 2);
      if (skin.spikes && star.layer === 3) {
        const f = r * 3.4;
        g.globalAlpha = Math.min(1, a * 0.55 * twinkle * (1 - star.ww));
        g.drawImage(skin.spikes[tone]!, x - f, y - f, f * 2, f * 2);
      }
    }
    if (skin.meteor) {
      for (const meteor of this.meteors) {
        const life = Math.sin((Math.PI * meteor.age) / meteor.life);
        const angle = Math.atan2(meteor.vy, meteor.vx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        g.setTransform(d * cos, d * sin, -d * sin, d * cos, d * meteor.x, d * meteor.y);
        g.globalAlpha = Math.min(1, 0.85 * life * alpha * env.calm(meteor.x, meteor.y));
        g.drawImage(skin.meteor, -220 * k, -4 * k, 220 * k, 8 * k);
      }
      g.setTransform(d, 0, 0, d, 0, 0);
    }
    if (warp) this.drawWarp(g, skin, env, warp, alpha);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  private drawNebula(soft: CanvasRenderingContext2D, sprite: Sprite, env: FieldEnv, fade: number) {
    // A little oversized, so it can sway, follow the pointer and sink toward a
    // gather without showing an edge.
    const w = env.w * 1.16;
    const h = env.h * 1.16;
    const x = (env.w - w) / 2 + Math.sin(env.t * 0.021) * env.w * 0.012 + env.px * 0.3;
    const y = (env.h - h) / 2 + Math.cos(env.t * 0.017) * env.h * 0.012 + env.py * 0.3;
    const z = this.nebulaZoom;
    const { x: ox, y: oy } = this.origin;
    soft.imageSmoothingQuality = "high";
    soft.globalCompositeOperation = "lighter";
    soft.globalAlpha = Math.min(1, NEBULA_ALPHA * fade * this.nebulaGlow);
    soft.drawImage(sprite, ox + (x - ox) * z, oy + (y - oy) * z, w * z, h * z);
    soft.globalAlpha = 1;
    soft.globalCompositeOperation = "source-over";
  }

  private drawWarp(
    g: CanvasRenderingContext2D,
    skin: Skin,
    env: FieldEnv,
    warp: Warp,
    alpha: number,
  ) {
    const { dark } = env.palette;
    if (warp.kind === "gather") {
      // The light that has landed so far, breathing while it waits for the next screen.
      const held = this.held * (0.86 + 0.14 * Math.sin(env.t * 7));
      if (held < 0.01) return;
      const size = (Math.max(warp.w, warp.h) * 0.55 + 40) * (0.6 + 0.5 * held);
      g.globalAlpha = Math.min(1, held * alpha * (dark ? 0.85 : 0.35));
      g.drawImage(skin.halo, warp.x - size, warp.y - size, size * 2, size * 2);
      const hot = 18 * (0.5 + held);
      g.globalAlpha = Math.min(1, held * alpha);
      g.drawImage(skin.hot, warp.x - hot, warp.y - hot, hot * 2, hot * 2);
      return;
    }
    const elapsed = performance.now() - warp.at;
    const f = elapsed / FLASH_MS;
    if (f < 1) {
      const size = 80 + 340 * f;
      g.globalAlpha = Math.min(1, (1 - f) ** 2 * alpha * (dark ? 1 : 0.4));
      g.drawImage(skin.halo, warp.x - size, warp.y - size, size * 2, size * 2);
      const hot = 30 * (1 - f);
      g.globalAlpha = Math.min(1, (1 - f) * alpha);
      g.drawImage(skin.hot, warp.x - hot, warp.y - hot, hot * 2, hot * 2);
    }
    // The shockwave rides inside the soft leading edge of the page's reveal.
    const t = elapsed / WARP_REVEAL_MS;
    if (t >= 1) return;
    const radius = Math.max(0, warp.reach * warpWave(t) - WARP_FEATHER * 0.4);
    const fadeOut = (1 - t) ** 1.5 * alpha;
    g.strokeStyle = rgba(skin.ring, 1);
    g.beginPath();
    g.arc(warp.x, warp.y, radius, 0, Math.PI * 2);
    g.globalAlpha = fadeOut * (dark ? 0.1 : 0.06);
    g.lineWidth = 6 + 34 * (1 - t);
    g.stroke();
    g.globalAlpha = fadeOut * (dark ? 0.6 : 0.4);
    g.lineWidth = 1.5 + 2 * (1 - t);
    g.stroke();
    // A fainter echo behind it.
    g.beginPath();
    g.arc(warp.x, warp.y, radius * 0.72, 0, Math.PI * 2);
    g.globalAlpha = fadeOut * (dark ? 0.22 : 0.15);
    g.lineWidth = 1.2;
    g.stroke();
  }

  pulse(pulse: FieldPulse, env: FieldEnv) {
    switch (pulse.kind) {
      case "cheer":
        shock(this.stars, pulse, env, 220);
        for (const heading of [-2.4, -0.7]) this.launch(env, pulse, heading);
        break;
      case "gust":
        shock(this.stars, pulse, env, 280);
        for (let i = 0; i < 3; i++) this.launch(env);
        break;
      case "slop":
      case "heart":
        shock(this.stars, pulse, env, 160);
        this.tintUntil = env.t + 0.9;
        break;
      case "chill":
        this.chill = Math.max(this.chill, pulse.strength);
        break;
      case "swell":
        break;
    }
  }

  warp(warp: AmbientWarp, env: FieldEnv) {
    if (warp.kind === "gather") {
      const x = warp.x + warp.w / 2;
      const y = warp.y + warp.h / 2;
      for (const star of this.stars) {
        // Each lands somewhere inside the control, in an ellipse a little smaller than it.
        const angle = rand(0, Math.PI * 2);
        const r = Math.sqrt(Math.random()) * 0.4;
        star.wx = x + Math.cos(angle) * r * warp.w;
        star.wy = y + Math.sin(angle) * r * warp.h;
        star.wd = rand(0, 0.06);
        star.wl = rand(0.36, 0.54);
      }
      this.warping = {
        kind: "gather",
        t: env.t,
        at: performance.now(),
        x,
        y,
        w: warp.w,
        h: warp.h,
        spin: (Math.random() < 0.5 ? -1 : 1) * rand(0.8, 1.2),
        reach: 0,
      };
      this.origin = { x, y };
      this.meteors = [];
      return;
    }
    const from = this.warping;
    if (from?.kind !== "gather") return;
    const diagonal = Math.hypot(env.w, env.h);
    for (const star of this.stars) {
      // From the point the control collapsed into (or wherever it was still falling)
      // to a fresh place anywhere in the sky.
      const landed = star.wu >= 1;
      star.wx = landed ? from.x + rand(-4, 4) : star.dx;
      star.wy = landed ? from.y + rand(-4, 4) : star.dy;
      star.x = Math.random() * env.w;
      star.y = Math.random() * env.h;
      star.wd = rand(0, 0.05);
      star.wl =
        0.7 + 0.6 * (Math.hypot(star.x - star.wx, star.y - star.wy) / diagonal) + rand(0, 0.25);
    }
    this.warping = {
      ...from,
      kind: "burst",
      t: env.t,
      at: performance.now(),
      reach: warpReach(from.x, from.y, env.w, env.h),
    };
    this.nebulaZoom = 1.14;
    this.nebulaGlow = 0.5;
  }
}
