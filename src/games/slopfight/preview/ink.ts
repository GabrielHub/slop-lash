import { clamp } from "@/tutorial/timeline";
import { inkWeight, type Ink } from "../tutorial/doodles";

// Where a pen tip is along a doodle stroke, so the marker can ride the ink
// as it draws on. Pure geometry over the stroke's `d` (M, L, C, A and Z, all
// absolute, as the tutorial doodles are written), measured by arc length the
// same way an SVG `pathLength` dash is.

export interface Point {
  x: number;
  y: number;
}

interface Sampler {
  start: Point;
  end: Point;
  /** The point `fraction` (0..1) of the way along the drawn length. */
  at(fraction: number): Point;
}

const STEPS = 20;

function cubic(a: number, b: number, c: number, d: number, s: number): number {
  const r = 1 - s;
  return r * r * r * a + 3 * r * r * s * b + 3 * r * s * s * c + s * s * s * d;
}

/** Points along an SVG arc (endpoint form), after its start. */
function arcPoints(from: Point, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, to: Point): Point[] {
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  let rxa = Math.abs(rx);
  let rya = Math.abs(ry);
  const lambda = (x1 * x1) / (rxa * rxa) + (y1 * y1) / (rya * rya);
  if (lambda > 1) {
    rxa *= Math.sqrt(lambda);
    rya *= Math.sqrt(lambda);
  }
  const numerator = rxa * rxa * rya * rya - rxa * rxa * y1 * y1 - rya * rya * x1 * x1;
  const denominator = rxa * rxa * y1 * y1 + rya * rya * x1 * x1;
  const coefficient = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (coefficient * rxa * y1) / rya;
  const cy1 = (-coefficient * rya * x1) / rxa;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (x1 - cx1) / rxa;
  const uy = (y1 - cy1) / rya;
  const theta = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, (-x1 - cx1) / rxa, (-y1 - cy1) / rya);
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  else if (sweep && delta < 0) delta += Math.PI * 2;
  return Array.from({ length: STEPS }, (_, index) => {
    const th = theta + (delta * (index + 1)) / STEPS;
    return {
      x: cx + rxa * Math.cos(th) * cos - rya * Math.sin(th) * sin,
      y: cy + rxa * Math.cos(th) * sin + rya * Math.sin(th) * cos,
    };
  });
}

function build(d: string): Sampler {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const points: Point[] = [];
  const lengths: number[] = [];
  let pen: Point = { x: 0, y: 0 };
  let first: Point = pen;
  let total = 0;
  const lineTo = (next: Point) => {
    if (points.length === 0) {
      points.push(pen);
      lengths.push(0);
    }
    total += Math.hypot(next.x - pen.x, next.y - pen.y);
    points.push(next);
    lengths.push(total);
    pen = next;
  };
  let index = 0;
  let command = "";
  const read = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[index])) command = tokens[index++];
    if (command === "M") {
      pen = { x: read(), y: read() };
      first = pen;
      // A jump: a vertex at the same drawn length, so nothing is drawn across it.
      points.push(pen);
      lengths.push(total);
      command = "L";
    } else if (command === "L") {
      lineTo({ x: read(), y: read() });
    } else if (command === "C") {
      const [x1, y1, x2, y2, x, y] = [read(), read(), read(), read(), read(), read()];
      const from = pen;
      for (let step = 1; step <= STEPS; step++) {
        const s = step / STEPS;
        lineTo({ x: cubic(from.x, x1, x2, x, s), y: cubic(from.y, y1, y2, y, s) });
      }
    } else if (command === "A") {
      const [rx, ry, rotation, large, sweep, x, y] = [read(), read(), read(), read(), read(), read(), read()];
      for (const point of arcPoints(pen, rx, ry, rotation, large === 1, sweep === 1, { x, y })) lineTo(point);
    } else if (command === "Z" || command === "z") {
      lineTo(first);
      command = "";
    } else {
      index++;
    }
  }
  const at = (fraction: number): Point => {
    if (points.length === 0) return pen;
    const target = clamp(fraction) * total;
    let low = 0;
    let high = lengths.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (lengths[middle] < target) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return points[0];
    const span = lengths[low] - lengths[low - 1];
    const s = span <= 0 ? 1 : (target - lengths[low - 1]) / span;
    const a = points[low - 1];
    const b = points[low];
    return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
  };
  return { start: points[0] ?? pen, end: pen, at };
}

const samplers = new Map<string, Sampler>();

function samplerFor(d: string): Sampler {
  let sampler = samplers.get(d);
  if (!sampler) {
    sampler = build(d);
    samplers.set(d, sampler);
  }
  return sampler;
}

/**
 * The strokes with an invisible pen-up move between each pair, so a pen
 * riding them glides from one stroke's end to the next stroke's start.
 */
export function withPenMoves(strokes: readonly Ink[], weight = 0.14): Ink[] {
  const out: Ink[] = [];
  strokes.forEach((stroke, index) => {
    if (index > 0) {
      const from = samplerFor(strokes[index - 1].d).end;
      const to = samplerFor(stroke.d).start;
      out.push({ d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, color: stroke.color, weight, opacity: 0 });
    }
    out.push(stroke);
  });
  return out;
}

/**
 * Where the pen is at `progress` (0..1 over all `strokes`, by weight, the way
 * `InkPaths` draws them), the colour it is laying down, and how far it is
 * lifted (0 on the paper, 1 at the top of a pen-up hop).
 */
export function penAt(strokes: readonly Ink[], progress: number): { point: Point; color: string; lift: number } {
  let left = clamp(progress) * inkWeight(strokes);
  for (const stroke of strokes) {
    const weight = stroke.weight ?? 1;
    if (left <= weight) {
      const fraction = left / weight;
      return {
        point: samplerFor(stroke.d).at(fraction),
        color: stroke.color,
        lift: stroke.opacity === 0 ? Math.sin(fraction * Math.PI) : 0,
      };
    }
    left -= weight;
  }
  const last = strokes[strokes.length - 1];
  return { point: samplerFor(last.d).end, color: last.color, lift: 0 };
}
