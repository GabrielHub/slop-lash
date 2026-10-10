// Synthetic stage data for fixtures and the scene lab: a growing part stream
// for a forging fighter (timed like the measured forge: the first part about
// ten seconds after submit, then a quick stream), and hand-drawn-looking
// doodles derived from a champion's skeleton, revealed stroke by stroke.
// Pure, deterministic per key.

import { resolveSkeleton } from "../../body/skeleton";
import { SAMPLES, type Sample } from "../../samples";
import type { Champion, Part } from "../../sheet";
import type { Stroke, StrokeColor } from "../../strokes";
import { STROKE_GRID } from "../../constants";

/** When the first synthetic part arrives after a forge starts (the measured p50 is ~12 s). */
export const SYNTH_FIRST_PART_MS = 9_500;
/** Gap between synthetic parts (they arrive faster than the stage pops them). */
export const SYNTH_PART_MS = 240;
/** The synthetic forge finishes this long after its last part. */
export const SYNTH_FINISH_MS = 1_200;

/** A stable 32-bit hash of a string (FNV-1a). */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A deterministic sample champion for a key (a fighter id). */
export function sampleFor(key: string): Sample {
  return SAMPLES[hashString(key) % SAMPLES.length]!;
}

/** The parts a synthetic forge has streamed by `now`. */
export function syntheticPartial(champion: Champion, startedAt: number, now: number): Part[] {
  const elapsed = now - startedAt - SYNTH_FIRST_PART_MS;
  if (elapsed < 0) return [];
  const count = Math.min(champion.parts.length, 1 + Math.floor(elapsed / SYNTH_PART_MS));
  return champion.parts.slice(0, count);
}

/**
 * The fixtures' synthetic stream at `now` (scene-data's SyntheticParts): each
 * fighter grows into its deterministic sample champion.
 */
export function sampleStream(now: number): (fighterId: string, forgeStartedAt: number) => Part[] {
  return (fighterId, forgeStartedAt) => syntheticPartial(sampleFor(fighterId).champion, forgeStartedAt, now);
}

/** When a synthetic forge of this champion is done (READY). */
export function syntheticDoneAt(champion: Champion, startedAt: number): number {
  return startedAt + SYNTH_FIRST_PART_MS + champion.parts.length * SYNTH_PART_MS + SYNTH_FINISH_MS;
}

/** A small seeded PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK_BY_COLOR: Record<"primary" | "secondary" | "accent", StrokeColor> = { primary: 0, secondary: 4, accent: 1 };

/**
 * A doodle of a champion as a kid might draw it: each bone as a wobbly loop
 * (front view), eyes as dots, a mouth line. Strokes fit the 0..1000 grid.
 */
export function doodleFromChampion(champion: Champion, seed = 1): Stroke[] {
  const skeleton = resolveSkeleton(champion.parts, { bodyPlan: champion.bodyPlan });
  if (skeleton.bones.length === 0) return [];
  const random = seededRandom(seed);
  // Front view: creature +x is its left, drawn on the viewer's right.
  const project = (p: readonly number[]) => [-p[0]!, p[1]!] as const;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const bone of skeleton.bones) {
    for (const point of [bone.head, bone.tail]) {
      const [x, y] = project(point);
      minX = Math.min(minX, x - bone.radius);
      maxX = Math.max(maxX, x + bone.radius);
      minY = Math.min(minY, y - bone.radius);
      maxY = Math.max(maxY, y + bone.radius);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-3);
  const margin = 140;
  const scale = (STROKE_GRID - margin * 2) / span;
  const offsetX = (STROKE_GRID - (maxX - minX) * scale) / 2;
  const offsetY = (STROKE_GRID - (maxY - minY) * scale) / 2;
  const toGrid = (x: number, y: number): [number, number] => {
    const gx = offsetX + (x - minX) * scale;
    const gy = STROKE_GRID - (offsetY + (y - minY) * scale);
    return [Math.round(Math.max(0, Math.min(STROKE_GRID, gx))), Math.round(Math.max(0, Math.min(STROKE_GRID, gy)))];
  };
  const strokes: Stroke[] = [];
  // Torso first, then outward (the order a person draws).
  for (const bone of skeleton.bones) {
    const [hx, hy] = project(bone.head);
    const [tx, ty] = project(bone.tail);
    const cx = (hx + tx) / 2;
    const cy = (hy + ty) / 2;
    const length = Math.hypot(tx - hx, ty - hy);
    const major = length / 2 + bone.radius;
    const minor = Math.max(bone.radius * 0.9, span * 0.02);
    const angle = length > 1e-6 ? Math.atan2(ty - hy, tx - hx) : 0;
    const steps = 18;
    const start = random() * Math.PI * 2;
    const points: number[] = [];
    for (let index = 0; index <= steps + 1; index += 1) {
      const theta = start + (index / steps) * Math.PI * 2;
      const wobble = 1 + (random() - 0.5) * 0.12;
      const ex = Math.cos(theta) * major * wobble;
      const ey = Math.sin(theta) * minor * wobble;
      const x = cx + ex * Math.cos(angle) - ey * Math.sin(angle);
      const y = cy + ex * Math.sin(angle) + ey * Math.cos(angle);
      points.push(...toGrid(x, y));
    }
    strokes.push({ c: INK_BY_COLOR[bone.color], w: 1, p: points });
  }
  // Eyes and a mouth on the face.
  const face = skeleton.face;
  const [fx, fy] = project(face.pos);
  const eye = face.scale * 0.35;
  strokes.push({ c: 0, w: 1, p: toGrid(fx - eye, fy + eye * 0.3) });
  strokes.push({ c: 0, w: 1, p: toGrid(fx + eye, fy + eye * 0.3) });
  strokes.push({ c: 0, w: 1, p: [...toGrid(fx - eye * 0.7, fy - eye * 0.6), ...toGrid(fx, fy - eye * 0.85), ...toGrid(fx + eye * 0.7, fy - eye * 0.6)] });
  return strokes;
}

/** Strokes per streamed row in the lab (the phone batches a few strokes per write). */
export const LAB_ROW_STROKES = 3;

/**
 * The strokes a phone has streamed `fraction` of the way through a drawing:
 * whole strokes in complete rows. A streamed row never changes (the easel
 * paints each row once, by layer and seq), so the lab never re-sends a row
 * with more in it.
 */
export function revealStrokes(strokes: readonly Stroke[], fraction: number): Stroke[] {
  if (fraction >= 1) return [...strokes];
  if (fraction <= 0) return [];
  const rows = Math.floor((fraction * strokes.length) / LAB_ROW_STROKES);
  return strokes.slice(0, rows * LAB_ROW_STROKES);
}
