import { EASE } from "../lib/animations";

/**
 * A tutorial plays like a video: everything on screen is a pure function of
 * `t`, the seconds since it began, so it can seek, freeze for a screenshot, or
 * join late and land on the right frame. This module is that math, plus the
 * script and timing shapes the voice-over pipeline reads and writes.
 */

// ---------------------------------------------------------------------------
// Script and timing
// ---------------------------------------------------------------------------

/** One line of the host's voice-over. */
export interface ScriptLine {
  /** Stable id the scene keys its beats on, e.g. "vote". */
  id: string;
  /**
   * What the host says. [Bracketed] ElevenLabs delivery tags such as
   * "[excited]" are voiced, never captioned.
   */
  say: string;
  /** Seconds of air after the line, for a beat that plays without words. */
  pause?: number;
  /** Starts a chapter: its title shows in the chapter chip and on phones. */
  chapter?: string;
}

export interface TutorialScript {
  /** Seconds of title sting before the first line. */
  lead: number;
  lines: readonly ScriptLine[];
  /** Seconds the last frame holds after the last line. */
  tail: number;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface LineTiming {
  id: string;
  /** The caption: the spoken text without delivery tags. */
  text: string;
  start: number;
  end: number;
  words: WordTiming[];
}

/** Written by the voice pipeline (`timing.ts` beside each script). Times in seconds. */
export interface TutorialTiming {
  durationMs: number;
  /** The voice-over under `public/`, or null before one is recorded. */
  audio: string | null;
  lines: LineTiming[];
}

/** Matches one ElevenLabs delivery tag, e.g. "[excited]" or "[laughs softly]". */
const TAG = /\[[^\]]*\]/g;

/** The caption for a line: its text without delivery tags, whitespace collapsed. */
export function captionOf(say: string): string {
  return say.replace(TAG, " ").replace(/\s+/g, " ").trim();
}

/** A word as a cue matches it: lowercase, no punctuation around it. */
export function normalWord(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Looks up when things are said, so a scene keys its beats on the voice, not on hand-typed seconds. */
export interface Cues {
  readonly duration: number;
  line(id: string): LineTiming;
  /** When line `id` starts, plus `offset` seconds. */
  at(id: string, offset?: number): number;
  /** When line `id` ends, plus `offset` seconds. */
  end(id: string, offset?: number): number;
  /**
   * When the `nth` (0-based) word of line `id` matching `word` starts. Matching
   * ignores case and surrounding punctuation; a missing word throws, so a
   * rewritten line can't silently drift a beat.
   */
  word(id: string, word: string, nth?: number): number;
  /** When that word ends. */
  wordEnd(id: string, word: string, nth?: number): number;
  /** The line being said (or the last one said) at `t`. */
  lineAt(t: number): LineTiming | null;
}

export function cuesFor(timing: TutorialTiming): Cues {
  const byId = new Map(timing.lines.map((line) => [line.id, line]));
  const line = (id: string) => {
    const found = byId.get(id);
    if (!found) throw new Error(`Tutorial line "${id}" is not in the timing`);
    return found;
  };
  // Scenes look words up every frame, so each lookup is worked out once.
  const words = new Map<string, WordTiming>();
  const findWord = (id: string, word: string, nth = 0) => {
    const key = `${id}|${word}|${nth}`;
    let found = words.get(key);
    if (!found) {
      const target = normalWord(word);
      found = line(id).words.filter((candidate) => normalWord(candidate.text) === target)[nth];
      if (!found) throw new Error(`Tutorial line "${id}" has no word "${word}" #${nth}`);
      words.set(key, found);
    }
    return found;
  };
  return {
    duration: timing.durationMs / 1000,
    line,
    at: (id, offset = 0) => line(id).start + offset,
    end: (id, offset = 0) => line(id).end + offset,
    word: (id, word, nth) => findWord(id, word, nth).start,
    wordEnd: (id, word, nth) => findWord(id, word, nth).end,
    lineAt: (t) => {
      let current: LineTiming | null = null;
      for (const candidate of timing.lines) {
        if (candidate.start > t) break;
        current = candidate;
      }
      return current;
    },
  };
}

/** The chapters of a script, each starting where its first line starts. */
export function chaptersOf(
  script: TutorialScript,
  timing: TutorialTiming,
): { title: string; start: number }[] {
  const cues = cuesFor(timing);
  return script.lines.flatMap((line) =>
    line.chapter ? [{ title: line.chapter, start: cues.at(line.id) }] : [],
  );
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

export type Easing = (x: number) => number;

/** A CSS cubic-bezier as a function of progress, solved with Newton's method and a bisection fallback. */
export function bezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const solve = (x: number) => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-6) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
    }
    let low = 0;
    let high = 1;
    s = x;
    for (let i = 0; i < 30; i++) {
      const value = sampleX(s);
      if (Math.abs(value - x) < 1e-6) return s;
      if (value < x) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return s;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solve(x)));
}

const backOut =
  (overshoot = 1.7): Easing =>
  (x) => {
    const c = overshoot + 1;
    return 1 + c * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
  };

/** The app's motion easings (`EASE`), plus the ones only a choreographed video wants. */
export const ease = {
  linear: ((x) => x) as Easing,
  out: bezier(...EASE.out),
  in: bezier(...EASE.in),
  inOut: bezier(...EASE.inOut),
  emphasized: bezier(...EASE.emphasized),
  outExpo: ((x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x))) as Easing,
  inExpo: ((x) => (x <= 0 ? 0 : 2 ** (10 * x - 10))) as Easing,
  outQuint: ((x) => 1 - (1 - x) ** 5) as Easing,
  inOutSine: ((x) => -(Math.cos(Math.PI * x) - 1) / 2) as Easing,
  outBack: backOut(),
  backOut,
} as const;

// ---------------------------------------------------------------------------
// Interpolation and springs
// ---------------------------------------------------------------------------

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

/** 0 before `start`, 1 after `start + duration`, eased in between. */
export function progress(t: number, start: number, duration: number, easing = ease.linear) {
  if (duration <= 0) return t >= start ? 1 : 0;
  return easing(clamp((t - start) / duration));
}

/**
 * Piecewise interpolation: `input` times map to `output` values, clamped at
 * both ends. `easing` shapes every segment, or one per segment.
 */
export function interpolate(
  t: number,
  input: readonly number[],
  output: readonly number[],
  easing: Easing | readonly Easing[] = ease.linear,
): number {
  if (input.length !== output.length || input.length < 2) {
    throw new Error("interpolate needs matching input and output of 2+ points");
  }
  if (t <= input[0]) return output[0];
  const last = input.length - 1;
  if (t >= input[last]) return output[last];
  let segment = 0;
  while (segment < last - 1 && t >= input[segment + 1]) segment++;
  const span = input[segment + 1] - input[segment];
  const local = span <= 0 ? 1 : (t - input[segment]) / span;
  const shaped = (Array.isArray(easing) ? easing[segment] : (easing as Easing))(local);
  return output[segment] + (output[segment + 1] - output[segment]) * shaped;
}

/** Linear mix of two numbers. */
export function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

/** Spring feels in the app's vocabulary (see `SPRING` in `src/lib/animations.ts`). */
export const SPRINGS = {
  /** Badges, points, chips: a lively overshoot. */
  pop: { stiffness: 420, damping: 18, mass: 1 },
  /** Stamps and slams: fast, one firm bounce. */
  slam: { stiffness: 700, damping: 26, mass: 1 },
  /** Cards and panels. */
  smooth: { stiffness: 220, damping: 26, mass: 1 },
  /** Big, slow scene moves. */
  gentle: { stiffness: 120, damping: 22, mass: 1 },
  /** Wobbly, cartoon jelly. */
  jelly: { stiffness: 300, damping: 9, mass: 1 },
} as const satisfies Record<string, SpringConfig>;

/**
 * A damped spring released at `time` 0 from 0 toward 1: its position at
 * `time` seconds, in closed form, so any frame can be computed directly.
 */
export function spring(time: number, config: SpringConfig = SPRINGS.smooth): number {
  if (time <= 0) return 0;
  const { stiffness = 220, damping = 26, mass = 1 } = config;
  const omega = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * time);
    return (
      1 - decay * (Math.cos(omegaD * time) + ((zeta * omega) / omegaD) * Math.sin(omegaD * time))
    );
  }
  if (zeta === 1) return 1 - Math.exp(-omega * time) * (1 + omega * time);
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega * (zeta - root);
  const r2 = -omega * (zeta + root);
  const c2 = r1 / (r2 - r1);
  const c1 = -1 - c2;
  return 1 + c1 * Math.exp(r1 * time) + c2 * Math.exp(r2 * time);
}

/** A spring starting at `start`, mapped from `from` to `to`. */
export function springTo(
  t: number,
  start: number,
  from: number,
  to: number,
  config: SpringConfig = SPRINGS.smooth,
): number {
  return mix(from, to, spring(t - start, config));
}

/** A smooth, repeatable wobble in [-1, 1]: a few sines, so idle things never sit dead still. */
export function wobble(t: number, seed = 0): number {
  return (
    Math.sin(t * 1.3 + seed * 1.7) * 0.5 +
    Math.sin(t * 2.1 + seed * 3.1) * 0.3 +
    Math.sin(t * 0.7 + seed * 5.3) * 0.2
  );
}

/** A repeatable pseudo-random number in [0, 1) for `seed`, for scattering confetti, stars and so on. */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
