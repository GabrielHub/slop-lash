import {
  approach,
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
import { rgba, shade, type Sprite } from "./palette";

/**
 * "confetti": QuizSlop's studio, the calm tail of a confetti drop. A few
 * flakes still tumble through the stage lights (the lights themselves are the
 * wrapper's CSS glow, painted once). Real bursts join it at big moments.
 */

interface Flake extends Mote {
  /** Drift centre; sway is added on top. */
  x0: number;
  vy: number;
  vt: number;
  amp: number;
  sw: number;
  ph: number;
  rot: number;
  spin: number;
  tw: number;
  tph: number;
  shape: 0 | 1;
  tone: number;
  a: number;
}

/** Tones: marquee, signal, punch, ink. */
const TONE_WEIGHTS = [0.45, 0.3, 0.15, 0.1] as const;

interface Skin {
  version: number;
  /** [tone][face][shape]: face 0 is the colour, 1 the darker back. */
  sprites: Sprite[][][];
  rect: { w: number; h: number };
  dot: number;
}

export class ConfettiField implements Field {
  readonly usesSoft = false;
  private flakes: Flake[] = [];
  private skin: Skin | null = null;
  private chill = 0;

  count() {
    return this.flakes.length;
  }

  private scale(env: FieldEnv) {
    return env.phone ? 0.9 : clamp(env.h / 1080, 0.7, 1.4) * 1.6;
  }

  seed(env: FieldEnv) {
    const wanted = Math.max(env.phone ? 12 : 8, Math.round(48 * env.countScale));
    const kept = this.flakes.slice(0, wanted);
    for (const flake of kept) flake.x0 = clamp(flake.x0, 0, env.w);
    while (kept.length < wanted) {
      const flake = this.spawn(env);
      flake.y = Math.random() * env.h;
      kept.push(flake);
    }
    this.flakes = kept;
  }

  private spawn(env: FieldEnv): Flake {
    const k = clamp(env.h / 1080, 0.7, 1.4);
    const vt = rand(10, 22) * k;
    const x0 = Math.random() * env.w;
    return {
      x: x0,
      x0,
      y: -rand(10, 80),
      vy: vt,
      vt,
      amp: rand(10, 24) * k,
      sw: (Math.PI * 2) / rand(4, 8),
      ph: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      spin: rand(0.2, 0.8) * (Math.random() < 0.5 ? -1 : 1),
      tw: rand(1.5, 3),
      tph: rand(0, Math.PI * 2),
      shape: Math.random() < 0.6 ? 0 : 1,
      tone: pick(TONE_WEIGHTS),
      a: rand(0.55, 0.8),
      kx: 0,
      ky: 0,
      lift: 0,
      rank: Math.random(),
    };
  }

  private dress(env: FieldEnv): Skin {
    if (this.skin?.version === env.version) return this.skin;
    const { palette, sprites, dpr } = env;
    const k = this.scale(env);
    const rect = { w: 10 * k, h: 5 * k };
    const dot = 5 * k;
    const tones = [palette.marquee, palette.signal, palette.punch, palette.ink];
    const sprite = (tone: number, face: number, shape: number) => {
      const c = face ? shade(tones[tone]!, 0.7) : tones[tone]!;
      const w = shape ? dot : rect.w;
      const h = shape ? dot : rect.h;
      return sprites.get(`flake:${c.join(",")}:${shape}:${k}:${dpr}`, w * dpr, h * dpr, (g) => {
        g.fillStyle = rgba(c, 1);
        if (shape) {
          g.beginPath();
          g.arc((w * dpr) / 2, (h * dpr) / 2, (w * dpr) / 2, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillRect(0, 0, w * dpr, h * dpr);
        }
      });
    };
    const all = tones.map((_, tone) =>
      [0, 1].map((face) => [0, 1].map((shape) => sprite(tone, face, shape))),
    );
    this.skin = { version: env.version, sprites: all, rect, dot };
    return this.skin;
  }

  update(dt: number, env: FieldEnv) {
    this.chill *= Math.exp(-dt / 1.2);
    const speed = env.speed * (1 - 0.6 * this.chill);
    for (let i = 0; i < this.flakes.length; i++) {
      const flake = this.flakes[i]!;
      relax(flake, dt);
      // Back to terminal velocity, like paper in air.
      flake.vy = approach(flake.vy, flake.vt * speed, dt, 0.5);
      flake.y += (flake.vy + flake.ky) * dt;
      flake.x0 += flake.kx * dt;
      flake.x = flake.x0 + flake.amp * Math.sin(flake.sw * env.t + flake.ph);
      flake.rot += flake.spin * dt * (1 + Math.abs(flake.vy - flake.vt) / 40);
      if (flake.y > env.h + 24) this.flakes[i] = this.spawn(env);
    }
  }

  draw({ crisp: g }: FieldLayers, env: FieldEnv, alpha: number) {
    const skin = this.dress(env);
    const dark = env.palette.dark;
    const d = env.dpr;
    const fade = env.alpha * alpha * (1 - 0.35 * this.chill) * (dark ? 1 : 0.72);
    for (const flake of this.flakes) {
      const a = flake.a * env.calm(flake.x, flake.y) * presence(flake, env) * fade;
      if (a < 0.006) continue;
      const turn = Math.cos(flake.tw * env.t + flake.tph);
      const face = turn >= 0 ? 0 : 1;
      const sy = Math.max(0.12, Math.abs(turn));
      const cos = Math.cos(flake.rot);
      const sin = Math.sin(flake.rot);
      g.setTransform(d * cos, d * sin, -d * sin * sy, d * cos * sy, d * flake.x, d * flake.y);
      g.globalAlpha = Math.min(1, a);
      const w = flake.shape ? skin.dot : skin.rect.w;
      const h = flake.shape ? skin.dot : skin.rect.h;
      g.drawImage(skin.sprites[flake.tone]![face]![flake.shape]!, -w / 2, -h / 2, w, h);
    }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalAlpha = 1;
  }

  pulse(pulse: FieldPulse, env: FieldEnv) {
    switch (pulse.kind) {
      case "gust":
      case "cheer":
      case "heart": {
        shock(this.flakes, pulse, env, pulse.kind === "gust" ? 160 : 120);
        // Flakes near the origin are thrown up, then flutter back down.
        const reach = env.w * 0.3;
        for (const flake of this.flakes) {
          const d = Math.hypot(flake.x - pulse.x, flake.y - pulse.y);
          if (d < reach) flake.vy -= 160 * (1 - d / reach) * pulse.strength;
        }
        break;
      }
      case "slop":
        // A thump: every flake jumps a few pixels down.
        for (const flake of this.flakes) {
          flake.ky += 14 * pulse.strength;
          flake.lift = Math.max(flake.lift, 0.4 * pulse.strength);
        }
        break;
      case "chill":
        this.chill = Math.max(this.chill, pulse.strength);
        break;
      case "swell":
        break;
    }
  }
}
