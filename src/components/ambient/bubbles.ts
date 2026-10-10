import {
  approach,
  clamp,
  lerp,
  presence,
  rand,
  relax,
  shock,
  smoothstep,
  type Field,
  type FieldEnv,
  type FieldLayers,
  type FieldPulse,
  type Mote,
} from "./field";
import { heart, mix, rgba, type Rgb, type Sprite } from "./palette";

/**
 * "bubbles": MatchSlop's neon bokeh, like bar lights and champagne bubbles,
 * with a few hidden hearts. It doubles as the persona's mood ring: a good date
 * warms it toward rose and fills it with hearts; a bad one cools it toward
 * ash-violet, slows it, and finally lets it sink.
 */

interface Orb extends Mote {
  /** Sway centre. */
  x0: number;
  r: number;
  v: number;
  amp: number;
  sw: number;
  ph: number;
  /** Position on the colour ramp, 0 (ash) to 5 (coral). */
  base: number;
  heartRank: number;
  /** 0-1, eased: how much of the orb has condensed into a heart. */
  heart: number;
  heartUntil: number;
  boost: number;
  boostUntil: number;
  a: number;
  /** -1, or 0-1 while popping. */
  pop: number;
}

/** Ramp stops: ash, violet, rose, coral, at positions 0, 1, 3, 5. */
const RAMP_MAX = 5;
const RAMP_STEPS = 11;
/** Where orbs start on the ramp: rose 45%, violet 35%, coral 20%. */
const BASES = [
  [0.45, 3],
  [0.35, 1],
  [0.2, 5],
] as const;
/** The orb sprite's radius in CSS px; drawn scaled to each orb. */
const ORB_R = 48;
const HEART_SIZE = 18;

interface Skin {
  version: number;
  orbs: Sprite[];
  hearts: Sprite[];
}

function rampColor(stops: { ash: Rgb; violet: Rgb; rose: Rgb; coral: Rgb }, p: number): Rgb {
  if (p <= 1) return mix(stops.ash, stops.violet, p);
  if (p <= 3) return mix(stops.violet, stops.rose, (p - 1) / 2);
  return mix(stops.rose, stops.coral, (p - 3) / 2);
}

function pickBase() {
  let roll = Math.random();
  for (const [weight, base] of BASES) {
    roll -= weight;
    if (roll <= 0) return base + rand(-0.35, 0.35);
  }
  return 3;
}

export class BubblesField implements Field {
  readonly usesSoft = true;
  private orbs: Orb[] = [];
  private skin: Skin | null = null;
  private dip = 0;

  count() {
    return this.orbs.length;
  }

  private scale(env: FieldEnv) {
    return env.phone ? 0.5 : clamp(env.h / 1080, 0.6, 1.4);
  }

  seed(env: FieldEnv) {
    const wanted = Math.max(env.phone ? 8 : 6, Math.round(20 * env.countScale));
    const kept = this.orbs.slice(0, wanted);
    for (const orb of kept) {
      orb.x0 = clamp(orb.x0, 0, env.w);
      orb.y = clamp(orb.y, -orb.r, env.h + orb.r);
    }
    while (kept.length < wanted) {
      const orb = this.spawn(env);
      orb.y = Math.random() * env.h;
      kept.push(orb);
    }
    this.orbs = kept;
  }

  private spawn(env: FieldEnv, below = true): Orb {
    const k = this.scale(env);
    const r = (Math.random() < 0.3 ? rand(40, 62) : rand(14, 36)) * k;
    const x0 = Math.random() * env.w;
    return {
      x: x0,
      x0,
      y: below ? env.h + r * 2 + rand(0, 80) : -r * 2 - rand(0, 80),
      r,
      v: rand(6, 14) * k,
      amp: rand(12, 28) * k,
      sw: (Math.PI * 2) / rand(7, 13),
      ph: rand(0, Math.PI * 2),
      base: pickBase(),
      heartRank: Math.random(),
      heart: 0,
      heartUntil: 0,
      boost: 1,
      boostUntil: 0,
      a: rand(0.55, 1),
      pop: -1,
      kx: 0,
      ky: 0,
      lift: 0,
      rank: Math.random(),
    };
  }

  private dress(env: FieldEnv): Skin {
    if (this.skin?.version === env.version) return this.skin;
    const { palette, sprites, softScale, dpr } = env;
    const stops = {
      ash: mix(palette.violet, palette.inkDim, 0.65),
      violet: palette.violet,
      rose: palette.rose,
      coral: palette.coral,
    };
    const dark = palette.dark;
    const colors = Array.from({ length: RAMP_STEPS }, (_, i) =>
      rampColor(stops, (i / (RAMP_STEPS - 1)) * RAMP_MAX),
    );
    const px = ORB_R * softScale;
    const orbs = colors.map((c) =>
      sprites.get(`orb:${c.join(",")}:${softScale}:${dark}`, px * 2, px * 2, (g) => {
        // Bokeh: a nearly flat disc with a slightly brighter rim and a soft edge.
        const gradient = g.createRadialGradient(px, px, 0, px, px, px);
        gradient.addColorStop(0, rgba(c, dark ? 0.42 : 0.7));
        gradient.addColorStop(0.6, rgba(c, dark ? 0.55 : 0.78));
        gradient.addColorStop(0.86, rgba(c, dark ? 0.85 : 0.9));
        gradient.addColorStop(0.95, rgba(c, 0.32));
        gradient.addColorStop(1, rgba(c, 0));
        g.fillStyle = gradient;
        g.fillRect(0, 0, px * 2, px * 2);
      }),
    );
    const hearts = colors.map((c) => heart(sprites, c, HEART_SIZE, dpr, dark));
    this.skin = { version: env.version, orbs, hearts };
    return this.skin;
  }

  update(dt: number, env: FieldEnv) {
    this.dip = approach(this.dip, 0, dt, 2);
    const m = clamp(env.mood + this.dip, 0, 1);
    const cool = clamp((0.45 - m) / 0.3, 0, 1);
    const warm = clamp((m - 0.6) / 0.35, 0, 1);
    const speed = env.speed * lerp(1, 0.6, cool) * lerp(1, 1.2, warm);
    const rise = lerp(1, -0.4, smoothstep(0.5, 1, cool));
    const heartShare = clamp(0.2 + 0.3 * warm - 0.15 * cool, 0, 1);
    for (let i = 0; i < this.orbs.length; i++) {
      const orb = this.orbs[i]!;
      relax(orb, dt);
      const wantsHeart = orb.heartRank < heartShare || env.t < orb.heartUntil;
      orb.heart = approach(orb.heart, wantsHeart ? 1 : 0, dt, 0.25);
      const boost = env.t < orb.boostUntil ? orb.boost : 1;
      orb.x0 += orb.kx * dt;
      orb.y += (-orb.v * speed * rise * boost + orb.ky) * dt;
      orb.x = orb.x0 + orb.amp * Math.sin(orb.sw * env.t + orb.ph);
      if (orb.pop >= 0) orb.pop += dt / 0.2;
      const gone = orb.pop >= 1 || (rise > 0 ? orb.y < -orb.r * 2 : orb.y > env.h + orb.r * 2);
      if (gone) this.orbs[i] = this.spawn(env, rise > 0 || orb.pop >= 1);
    }
  }

  draw({ soft, crisp }: FieldLayers, env: FieldEnv, alpha: number) {
    const skin = this.dress(env);
    const dark = env.palette.dark;
    const m = clamp(env.mood + this.dip, 0, 1);
    const cool = clamp((0.45 - m) / 0.3, 0, 1);
    const warm = clamp((m - 0.6) / 0.35, 0, 1);
    const fade = env.alpha * alpha * lerp(1, 0.6, cool) * (dark ? 0.42 : 0.13);
    const k = this.scale(env);
    soft.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (const orb of this.orbs) {
      let p = lerp(orb.base, 0.2, cool * 0.9);
      p = lerp(p, 3, warm * 0.55);
      const index = clamp(Math.round((p / RAMP_MAX) * (RAMP_STEPS - 1)), 0, RAMP_STEPS - 1);
      // Calm is read at the orb's edge nearest the centre, so a big orb never bleeds into the text.
      const toX = env.w / 2 - orb.x;
      const toY = env.h / 2 - orb.y;
      const away = Math.hypot(toX, toY) || 1;
      const reach = Math.min(orb.r, away) / away;
      const a =
        orb.a * env.calm(orb.x + toX * reach, orb.y + toY * reach) * presence(orb, env) * fade;
      if (a < 0.004) continue;
      const popScale = orb.pop >= 0 ? 1 - orb.pop : 1;
      const r = orb.r * popScale * (1 - 0.45 * orb.heart);
      if (orb.heart < 0.99 && r > 0.5) {
        soft.globalAlpha = Math.min(1, a * (1 - orb.heart));
        soft.drawImage(skin.orbs[index]!, orb.x - r, orb.y - r, r * 2, r * 2);
      }
      if (orb.heart > 0.01) {
        const size = clamp(orb.r * 0.55, 10, 22) * k * popScale * (dark ? 1.9 : 1.2);
        crisp.globalAlpha = Math.min(1, a * orb.heart * (dark ? 1.3 : 2.6));
        crisp.drawImage(skin.hearts[index]!, orb.x - size / 2, orb.y - size / 2, size, size);
      }
    }
    soft.globalAlpha = 1;
    soft.globalCompositeOperation = "source-over";
    crisp.globalAlpha = 1;
  }

  private nearest(x: number, y: number, n: number) {
    return [...this.orbs]
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
      .slice(0, n);
  }

  pulse(pulse: FieldPulse, env: FieldEnv) {
    switch (pulse.kind) {
      case "heart": {
        shock(this.orbs, pulse, env, 140);
        const sealed = pulse.strength >= 0.9;
        const chosen = sealed ? this.orbs : this.nearest(pulse.x, pulse.y, 3);
        for (const orb of chosen) {
          orb.heartUntil = env.t + (sealed ? 2 : 1.5);
          orb.boost = sealed ? 2.5 : 2;
          orb.boostUntil = orb.heartUntil;
        }
        break;
      }
      case "cheer":
        shock(this.orbs, pulse, env, 180);
        for (const orb of this.orbs) {
          if (Math.random() < 0.3) orb.heartUntil = env.t + 1.2;
        }
        break;
      case "gust":
        shock(this.orbs, pulse, env, 200);
        for (const orb of this.orbs) orb.ky -= 120 * orb.lift;
        break;
      case "chill":
      case "slop":
        shock(this.orbs, pulse, env, 80);
        for (const orb of this.nearest(pulse.x, pulse.y, 2)) orb.pop = 0;
        this.dip = Math.min(this.dip, -0.3 * pulse.strength);
        break;
      case "swell":
        break;
    }
  }
}
