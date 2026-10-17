import { clamp, smoothstep, type FieldEnv } from "./field";
import { mix, type Sprite } from "./palette";

/**
 * The starfield's nebula: domain-warped noise in two clouds, warm low left and
 * cool high right (where the scene's CSS lighting sits, which they give
 * structure to), joined by a faint diagonal lane and kept clear of the centre
 * where the title and buttons live. Painted once per palette and aspect into a
 * small canvas; the half-resolution soft layer upscales it, which is all the
 * blur it needs.
 */

function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0-1. */
function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Four octaves of value noise, 0-1. */
function fbm(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += amp * noise(x, y);
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

/** Cloud centres as viewport fractions, radii in vmax. */
const WARM = { x: 0.1, y: 0.88, r: 0.52 };
const COOL = { x: 0.9, y: 0.12, r: 0.48 };
const LANE_WIDTH = 0.16;
const LANE_STRENGTH = 0.5;
/** Noise features per vmax. */
const GRAIN = 3.4;

export function nebula(env: FieldEnv): Sprite {
  const { palette, sprites, w: vw, h: vh } = env;
  const width = env.phone ? 160 : 320;
  const height = Math.round(clamp((width * vh) / vw, 48, 440));
  const key = `nebula:${width}x${height}:${[palette.punch, palette.gold, palette.teal, palette.ink].join(":")}`;
  return sprites.get(key, width, height, (g) => {
    const image = g.createImageData(width, height);
    const data = image.data;
    // Work in vmax units, so clouds stay round on a portrait phone.
    const span = Math.max(vw, vh);
    const sx = vw / span;
    const sy = vh / span;
    const ax = WARM.x * sx;
    const ay = WARM.y * sy;
    const bx = COOL.x * sx;
    const by = COOL.y * sy;
    const lane = (bx - ax) ** 2 + (by - ay) ** 2;
    for (let j = 0; j < height; j++) {
      const py = ((j + 0.5) / height) * sy;
      for (let i = 0; i < width; i++) {
        const px = ((i + 0.5) / width) * sx;
        const clear = smoothstep(0.12, 0.4, Math.hypot(px - sx / 2, py - sy / 2));
        if (clear <= 0) continue;
        let warm = 1 - smoothstep(0.1, 1, Math.hypot(px - ax, py - ay) / WARM.r);
        let cool = 1 - smoothstep(0.1, 1, Math.hypot(px - bx, py - by) / COOL.r);
        // The lane between them, warm at its lower end and cool at its upper one.
        const t = clamp(((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lane, 0, 1);
        const off = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
        const band = (1 - smoothstep(0, LANE_WIDTH, off)) * LANE_STRENGTH;
        warm = Math.max(warm, band * (1 - t));
        cool = Math.max(cool, band * t);
        if (warm + cool < 0.01) continue;
        const nx = px * GRAIN;
        const ny = py * GRAIN;
        const q = fbm(nx + 3.1, ny + 1.7);
        const n = fbm(nx + 2.4 * q, ny + 2.4 * q - 4.3);
        const fine = fbm(nx * 2.6 + 11.3, ny * 2.6 + 7.9);
        const body = smoothstep(0.36, 0.82, n) * (0.45 + 0.55 * fine) * clear;
        const a = Math.min(1, body * (warm + cool));
        if (a < 0.004) continue;
        // Gold only lights the densest filaments; mixed in wholesale it muddies the red.
        const c = mix(
          mix(palette.punch, palette.gold, 0.5 * smoothstep(0.3, 0.5, fine * n)),
          mix(palette.teal, palette.ink, 0.25 * fine),
          cool / (warm + cool),
        );
        const o = (j * width + i) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = a * 255;
      }
    }
    g.putImageData(image, 0, 0);
  });
}
