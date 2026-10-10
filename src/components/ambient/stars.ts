import {
  clamp,
  pick,
  presence,
  rand,
  relax,
  shock,
  wrap,
  type Field,
  type FieldEnv,
  type FieldLayers,
  type FieldPulse,
  type Mote,
} from "./field";
import { glowDot, rgba, sparkle, type Rgb, type Sprite } from "./palette";

/**
 * "stars": the brand sky behind home, host, join, lobbies, and leaderboards.
 * Three parallax layers drift up and to the right, so it feels like rising
 * rather than raining. Rare shooting stars in the dark theme; in the light
 * theme the stars become four-point sparkles printed on paper.
 */

interface Star extends Mote {
  layer: 0 | 1 | 2;
  /** Draw size multiplier. */
  size: number;
  a: number;
  tone: number;
  tw: number;
  ph: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

/** Tones: ink, teal, gold, punch. */
const TONES = 4;

const LAYERS = [
  { n: 90, drift: 1, a: [0.26, 0.5], twinkle: 0.45, tones: [1, 0, 0, 0] },
  { n: 30, drift: 2.5, a: [0.42, 0.66], twinkle: 0.3, tones: [0.84, 0.08, 0.08, 0] },
  { n: 7, drift: 5, a: [0.5, 0.72], twinkle: 0.18, tones: [0.55, 0.15, 0.15, 0.15] },
] as const;

/** Base drift in px/s at 1080p: up and to the right. */
const DRIFT_X = 2;
const DRIFT_Y = -1.2;

interface Skin {
  version: number;
  /** [layer][tone] */
  stars: Sprite[][];
  /** Sprite radius per layer, CSS px. */
  radius: number[];
  flare: Sprite[];
  meteor: Sprite | null;
}

export class StarsField implements Field {
  readonly usesSoft = false;
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
  private nextMeteor = rand(6, 12);
  private tintUntil = 0;
  private chill = 0;
  private skin: Skin | null = null;

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
        next.push({
          layer: index as 0 | 1 | 2,
          x: Math.random() * env.w,
          y: Math.random() * env.h,
          kx: 0,
          ky: 0,
          lift: 0,
          rank: Math.random(),
          size: rand(0.8, 1.25),
          a: rand(layer.a[0], layer.a[1]),
          tone: index === 2 && i < 3 ? i + 1 : pick(layer.tones),
          tw: rand(0.4, 1.3),
          ph: rand(0, Math.PI * 2),
        });
      }
    });
    this.stars = next;
  }

  private dress(env: FieldEnv): Skin {
    if (this.skin?.version === env.version) return this.skin;
    const { palette, sprites, dpr } = env;
    const { dark } = palette;
    const tones: Rgb[] = dark
      ? [palette.ink, palette.teal, palette.gold, palette.punch]
      : [palette.inkDim, palette.inkDim, palette.gold, palette.punch];
    const k = clamp(env.h / 1080, 0.75, 1.5);
    const radius = dark ? [2.4 * k, 4.2 * k, 10 * k] : [1.2 * k, 3.4 * k, 6.5 * k];
    const stars = [0, 1, 2].map((layer) =>
      Array.from({ length: TONES }, (_, tone) => {
        const c = tones[tone]!;
        if (dark) return glowDot(sprites, c, radius[layer]!, [0.4, 0.3, 0.16][layer]!, dpr);
        return layer === 0
          ? glowDot(sprites, c, radius[0]!, 0.7, dpr)
          : sparkle(sprites, c, radius[layer]!, dpr);
      }),
    );
    const flare = tones.map((c) => sparkle(sprites, c, radius[2]! * 1.7, dpr));
    const meteor = dark
      ? sprites.get(`meteor:${palette.ink.join(",")}:${dpr}`, 220 * dpr, 8 * dpr, (g) => {
          const w = 220 * dpr;
          const h = 8 * dpr;
          const tail = g.createLinearGradient(0, 0, w, 0);
          tail.addColorStop(0, rgba(palette.ink, 0));
          tail.addColorStop(0.75, rgba(palette.ink, 0.35));
          tail.addColorStop(1, rgba(palette.ink, 0.9));
          g.fillStyle = tail;
          g.beginPath();
          g.moveTo(0, h / 2);
          g.lineTo(w - h / 2, h / 2 - 1.2 * dpr);
          g.lineTo(w, h / 2);
          g.lineTo(w - h / 2, h / 2 + 1.2 * dpr);
          g.closePath();
          g.fill();
          g.drawImage(glowDot(sprites, palette.ink, 4, 0.3, dpr), w - h, 0, h, h);
        })
      : null;
    this.skin = { version: env.version, stars, radius, flare, meteor };
    return this.skin;
  }

  private launch(env: FieldEnv, from?: { x: number; y: number }, heading?: number) {
    if (!env.palette.dark || env.phone) return;
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
    for (const star of this.stars) {
      const drift = LAYERS[star.layer].drift * speed;
      star.x = wrap(star.x + (DRIFT_X * drift + star.kx) * dt, env.w, margin);
      star.y = wrap(star.y + (DRIFT_Y * drift + star.ky) * dt, env.h, margin);
      relax(star, dt);
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

  draw({ crisp: g }: FieldLayers, env: FieldEnv, alpha: number) {
    const skin = this.dress(env);
    const { dark } = env.palette;
    const tinted = env.t < this.tintUntil;
    const fade = env.alpha * alpha * (1 - 0.3 * this.chill);
    g.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const star of this.stars) {
      const parallax = star.layer === 2 ? 1 : star.layer === 1 ? 0.4 : 0;
      const x = star.x + env.px * parallax;
      const y = star.y + env.py * parallax;
      const twinkle = 1 + LAYERS[star.layer].twinkle * Math.sin(star.tw * env.t + star.ph);
      const a = star.a * twinkle * env.calm(x, y) * presence(star, env) * fade * (dark ? 1 : 0.32);
      if (a < 0.006) continue;
      const tone = tinted && star.layer > 0 ? 3 : star.tone;
      const r = skin.radius[star.layer]! * star.size;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(skin.stars[star.layer]![tone]!, x - r, y - r, r * 2, r * 2);
      if (star.layer === 2 && dark) {
        const f = r * 1.7;
        g.globalAlpha = Math.min(1, a * 0.4);
        g.drawImage(skin.flare[tone]!, x - f, y - f, f * 2, f * 2);
      }
    }
    if (skin.meteor) {
      const k = clamp(env.h / 1080, 0.75, 1.5);
      for (const meteor of this.meteors) {
        const life = Math.sin((Math.PI * meteor.age) / meteor.life);
        const angle = Math.atan2(meteor.vy, meteor.vx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const d = env.dpr;
        g.setTransform(d * cos, d * sin, -d * sin, d * cos, d * meteor.x, d * meteor.y);
        g.globalAlpha = Math.min(1, 0.85 * life * alpha * env.calm(meteor.x, meteor.y));
        g.drawImage(skin.meteor, -220 * k, -4 * k, 220 * k, 8 * k);
      }
      g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
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
}
