/**
 * Theme colours for the ambient canvas, read from the CSS variables on <html>
 * (where the room shell puts `data-game`), plus the sprite cache the fields
 * draw with. Nothing here hard-codes a theme colour: every hue comes from a
 * token, so each game and theme gets its own field by construction.
 */

export type Rgb = readonly [number, number, number];

export interface AmbientPalette {
  dark: boolean;
  ink: Rgb;
  inkDim: Rgb;
  punch: Rgb;
  teal: Rgb;
  gold: Rgb;
  /** MatchSlop's neon trio; falls back to the base accents outside MatchSlop. */
  rose: Rgb;
  violet: Rgb;
  coral: Rgb;
  /** QuizSlop's studio colours; fall back to the base accents outside QuizSlop. */
  marquee: Rgb;
  signal: Rgb;
}

const NEUTRAL: Rgb = [128, 128, 128];

let probe: CanvasRenderingContext2D | null = null;

/** Parses any CSS colour to RGB: hex fast, anything else through a 1px canvas. */
export function parseColor(value: string): Rgb | null {
  const text = value.trim();
  if (!text) return null;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text)?.[1];
  if (hex && (hex.length === 3 || hex.length === 4)) {
    return [0, 1, 2].map((i) => parseInt(hex[i]! + hex[i]!, 16)) as unknown as Rgb;
  }
  if (hex && (hex.length === 6 || hex.length === 8)) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
  }
  if (typeof document === "undefined") return null;
  if (!probe) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgba(0,0,0,0)";
  probe.fillStyle = text;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return a ? [r!, g!, b!] : null;
}

/** Reads the palette from the computed style of <html>. */
export function readPalette(root: HTMLElement = document.documentElement): AmbientPalette {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: Rgb) =>
    parseColor(style.getPropertyValue(name)) ?? fallback;
  const ink = read("--ink", NEUTRAL);
  const inkDim = read("--ink-dim", ink);
  const punch = read("--punch", ink);
  const teal = read("--teal", ink);
  const gold = read("--gold", ink);
  const theme = root.dataset.theme;
  const dark = theme
    ? theme !== "light"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    dark,
    ink,
    inkDim,
    punch,
    teal,
    gold,
    rose: read("--ms-rose", punch),
    violet: read("--ms-violet", teal),
    coral: read("--ms-coral", gold),
    marquee: read("--qs-marquee", gold),
    signal: read("--qs-signal", teal),
  };
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function shade(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

export function rgba(c: Rgb, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}

/** A small offscreen canvas, drawn once and stamped with drawImage every frame. */
export type Sprite = HTMLCanvasElement;

/**
 * Pre-rendered sprites keyed by shape, colour, and size. Cleared whenever the
 * palette or the device pixel ratio changes.
 */
export class SpriteCache {
  private sprites = new Map<string, Sprite>();

  clear() {
    this.sprites.clear();
  }

  get(key: string, width: number, height: number, draw: (g: CanvasRenderingContext2D) => void) {
    let sprite = this.sprites.get(key);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = Math.max(1, Math.ceil(width));
      sprite.height = Math.max(1, Math.ceil(height));
      const g = sprite.getContext("2d");
      if (g) draw(g);
      this.sprites.set(key, sprite);
    }
    return sprite;
  }
}

/**
 * A soft glowing dot: a solid core fading to nothing at the edge. `core` is the
 * fraction of the radius that stays bright. Drawn at `scale` device pixels per
 * CSS pixel; stamp it at `radius * 2` CSS pixels.
 */
export function glowDot(
  cache: SpriteCache,
  c: Rgb,
  radius: number,
  core: number,
  scale: number,
): Sprite {
  const px = radius * scale;
  const key = `glow:${c.join(",")}:${radius}:${core}:${scale}`;
  return cache.get(key, px * 2, px * 2, (g) => {
    const gradient = g.createRadialGradient(px, px, 0, px, px, px);
    gradient.addColorStop(0, rgba(c, 1));
    gradient.addColorStop(core, rgba(c, 0.85));
    gradient.addColorStop(Math.min(0.95, core * 2.4), rgba(c, 0.22));
    gradient.addColorStop(1, rgba(c, 0));
    g.fillStyle = gradient;
    g.fillRect(0, 0, px * 2, px * 2);
  });
}

/**
 * A star: a white-hot centre inside a coloured halo that falls off like a point
 * of light rather than a disc. `core` is the fraction of the radius that stays
 * hot. Stamp it at `radius * 2` CSS pixels.
 */
export function starDot(
  cache: SpriteCache,
  hot: Rgb,
  halo: Rgb,
  radius: number,
  core: number,
  scale: number,
): Sprite {
  const px = radius * scale;
  const key = `star:${hot.join(",")}:${halo.join(",")}:${radius}:${core}:${scale}`;
  return cache.get(key, px * 2, px * 2, (g) => {
    const gradient = g.createRadialGradient(px, px, 0, px, px, px);
    gradient.addColorStop(0, rgba(hot, 1));
    gradient.addColorStop(core * 0.5, rgba(hot, 0.95));
    gradient.addColorStop(core, rgba(mix(hot, halo, 0.5), 0.7));
    gradient.addColorStop(Math.min(0.9, core * 2.2), rgba(halo, 0.24));
    gradient.addColorStop(Math.min(0.96, core * 4), rgba(halo, 0.07));
    gradient.addColorStop(1, rgba(halo, 0));
    g.fillStyle = gradient;
    g.fillRect(0, 0, px * 2, px * 2);
  });
}

/** Diffraction spikes for the brightest stars: a long thin cross over a short, faint diagonal one. */
export function spikes(cache: SpriteCache, c: Rgb, radius: number, scale: number): Sprite {
  const px = radius * scale;
  const key = `spikes:${c.join(",")}:${radius}:${scale}`;
  return cache.get(key, px * 2, px * 2, (g) => {
    g.translate(px, px);
    g.globalCompositeOperation = "lighter";
    const ray = (angle: number, length: number, width: number, alpha: number) => {
      g.save();
      g.rotate(angle);
      const gradient = g.createLinearGradient(0, 0, length, 0);
      gradient.addColorStop(0, rgba(c, alpha));
      gradient.addColorStop(0.2, rgba(c, alpha * 0.5));
      gradient.addColorStop(1, rgba(c, 0));
      g.fillStyle = gradient;
      g.beginPath();
      g.moveTo(0, -width / 2);
      g.lineTo(length, 0);
      g.lineTo(0, width / 2);
      g.closePath();
      g.fill();
      g.restore();
    };
    for (let i = 0; i < 4; i++) ray((i * Math.PI) / 2, px, 1.8 * scale, 0.9);
    for (let i = 0; i < 4; i++) ray(Math.PI / 4 + (i * Math.PI) / 2, px * 0.38, 1.2 * scale, 0.32);
  });
}

/**
 * A motion streak: a line of light that brightens toward its head at the right
 * edge. Stamp it stretched along the direction of travel.
 */
export function streak(cache: SpriteCache, c: Rgb, scale: number): Sprite {
  const w = 64 * scale;
  const h = 6 * scale;
  return cache.get(`streak:${c.join(",")}:${scale}`, w, h, (g) => {
    const tail = g.createLinearGradient(0, 0, w, 0);
    tail.addColorStop(0, rgba(c, 0));
    tail.addColorStop(0.7, rgba(c, 0.35));
    tail.addColorStop(1, rgba(c, 1));
    g.fillStyle = tail;
    g.fillRect(0, 0, w, h);
    // Feather it across its width, so it reads as light rather than a bar.
    g.globalCompositeOperation = "destination-in";
    const across = g.createLinearGradient(0, 0, 0, h);
    across.addColorStop(0, rgba(c, 0));
    across.addColorStop(0.5, rgba(c, 1));
    across.addColorStop(1, rgba(c, 0));
    g.fillStyle = across;
    g.fillRect(0, 0, w, h);
  });
}

/** A four-point sparkle, like a star printed on paper. */
export function sparkle(cache: SpriteCache, c: Rgb, radius: number, scale: number): Sprite {
  const px = radius * scale;
  const key = `sparkle:${c.join(",")}:${radius}:${scale}`;
  return cache.get(key, px * 2, px * 2, (g) => {
    g.fillStyle = rgba(c, 1);
    g.beginPath();
    const waist = px * 0.2;
    g.moveTo(px, 0);
    g.quadraticCurveTo(px + waist * 0.35, px - waist * 0.35, px * 2, px);
    g.quadraticCurveTo(px + waist * 0.35, px + waist * 0.35, px, px * 2);
    g.quadraticCurveTo(px - waist * 0.35, px + waist * 0.35, 0, px);
    g.quadraticCurveTo(px - waist * 0.35, px - waist * 0.35, px, 0);
    g.fill();
  });
}

/** The heart path in a 24x24 box, shared by bubbles and confetti hearts. */
export const HEART_PATH =
  "M12 21.6 10.6 20.3C5.4 15.6 2 12.5 2 8.7 2 5.6 4.4 3.2 7.5 3.2c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.6L12 21.6Z";

/** A small heart with a faint halo; stamp it at `size` CSS pixels square. */
export function heart(cache: SpriteCache, c: Rgb, size: number, scale: number, glow: boolean) {
  const pad = glow ? 0.5 : 0.1;
  const px = size * scale;
  const full = px * (1 + pad * 2);
  const key = `heart:${c.join(",")}:${size}:${scale}:${glow}`;
  return cache.get(key, full, full, (g) => {
    const path = new Path2D(HEART_PATH);
    const draw = (spread: number, alpha: number) => {
      g.save();
      const s = (px * (1 + spread)) / 24;
      g.translate(full / 2 - 12 * s, full / 2 - 12 * s);
      g.scale(s, s);
      g.globalAlpha = alpha;
      g.fillStyle = rgba(c, 1);
      g.fill(path);
      g.restore();
    };
    if (glow) {
      // A cheap pre-rendered halo: a few larger, fainter copies under the heart.
      draw(0.7, 0.06);
      draw(0.45, 0.1);
      draw(0.22, 0.16);
    }
    draw(0, 1);
  });
}
