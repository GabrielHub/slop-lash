/**
 * The ambient background's control bus. One `<Ambient />` canvas sits behind
 * every page; screens describe what it should be doing and fire pulses at big
 * moments, without holding a reference to it.
 */

/** Which field the background draws. */
export type AmbientScene =
  /** Home, host, join, leaderboard: a calm parallax starfield. */
  | "stars"
  /** SlopLash: sparse columns of falling pixels, slop dripping off the machine. */
  | "pixels"
  /** MatchSlop: rising neon bokeh with a few hidden hearts; doubles as Nora's mood ring. */
  | "bubbles"
  /** QuizSlop: the calm tail of a studio confetti drop under stage lights. */
  | "confetti";

/**
 * How much the field moves. `focus` thins and slows it while people read or
 * type, `hype` lifts it for a few seconds around a big moment.
 */
export type AmbientEnergy = "calm" | "focus" | "hype";

/** A phone draws a whisper of the TV's field: fewer particles, lower frame rate. */
export type AmbientSurface = "stage" | "phone";

export interface AmbientState {
  scene: AmbientScene;
  energy: AmbientEnergy;
  surface: AmbientSurface;
  /** MatchSlop's persona mood, 0-100; tints and paces the bubbles. */
  mood: number | null;
  /** The last seconds of a countdown: the field leans warmer and a little faster. */
  urgent: boolean;
}

export type AmbientPulseKind =
  /** Applause: a bright, fast burst (wins, FLAWLESS, a correct answer). */
  | "cheer"
  /** Slop wins: the field turns punch-red and glitches once. */
  | "slop"
  /** Hearts: MatchSlop warmth (a good reply, a sealed date). */
  | "heart"
  /** Deflate: the field cools, slows and sinks (an unmatch, a bust). */
  | "chill"
  /** A gust from the origin outward (confetti flutters, stars streak). */
  | "gust"
  /** A colourless energy swell, for routine scene changes. */
  | "swell";

export interface AmbientPulse {
  kind: AmbientPulseKind;
  /** Where the moment happened, as a fraction of the viewport (0-1). Defaults to the centre. */
  origin?: { x: number; y: number };
  /** 0-1, default 1. */
  strength?: number;
}

/**
 * A screen-change warp (`src/lib/warp-transition.ts`), in CSS px of the viewport.
 * Unlike a pulse it is never rate-limited: a burst always follows its gather.
 */
export type AmbientWarp =
  /** Pull the whole field into this box: the control that was pressed. */
  | { kind: "gather"; x: number; y: number; w: number; h: number }
  /** Throw it back out from where it gathered. */
  | { kind: "burst" };

/** How long the stage stays "hype" after a phase (or step) starts before it settles. */
export const HYPE_HOLD_MS = 6_000;

/**
 * The energy a surface should draw `elapsedMs` into a phase. On the stage
 * "hype" is a moment, not a mood: it settles to calm after HYPE_HOLD_MS and
 * holds there, so the background quiets after each big moment. Phones keep
 * whatever the game asks for.
 */
export function heldEnergy(
  energy: AmbientEnergy,
  surface: AmbientSurface,
  elapsedMs: number,
): AmbientEnergy {
  return energy === "hype" && surface === "stage" && elapsedMs >= HYPE_HOLD_MS ? "calm" : energy;
}

export const DEFAULT_AMBIENT: AmbientState = {
  scene: "stars",
  energy: "calm",
  surface: "stage",
  mood: null,
  urgent: false,
};

type StateListener = (state: AmbientState) => void;
type PulseListener = (pulse: AmbientPulse) => void;
type WarpListener = (warp: AmbientWarp) => void;

let current: AmbientState = DEFAULT_AMBIENT;
const stateListeners = new Set<StateListener>();
const pulseListeners = new Set<PulseListener>();
const warpListeners = new Set<WarpListener>();

export function getAmbient(): AmbientState {
  return current;
}

/** Merges `patch` into the background's state. */
export function setAmbient(patch: Partial<AmbientState>) {
  const next = { ...current, ...patch };
  if (
    next.scene === current.scene &&
    next.energy === current.energy &&
    next.surface === current.surface &&
    next.mood === current.mood &&
    next.urgent === current.urgent
  ) {
    return;
  }
  current = next;
  stateListeners.forEach((listener) => listener(current));
}

/** Puts the background back to the brand starfield, e.g. when a room unmounts. */
export function resetAmbient() {
  setAmbient(DEFAULT_AMBIENT);
}

/** A one-off reaction to a big moment. The canvas rate-limits and ignores it under reduced motion. */
export function pulseAmbient(pulse: AmbientPulse) {
  pulseListeners.forEach((listener) => listener(pulse));
}

/** Gathers the field into a control, or bursts it back out. Ignored under reduced motion. */
export function warpAmbient(warp: AmbientWarp) {
  warpListeners.forEach((listener) => listener(warp));
}

export function subscribeAmbient(
  onState: StateListener,
  onPulse: PulseListener,
  onWarp?: WarpListener,
): () => void {
  stateListeners.add(onState);
  pulseListeners.add(onPulse);
  if (onWarp) warpListeners.add(onWarp);
  return () => {
    stateListeners.delete(onState);
    pulseListeners.delete(onPulse);
    if (onWarp) warpListeners.delete(onWarp);
  };
}

/** A pulse origin at the centre of an element, as a viewport fraction. */
export function originOf(element: Element | null | undefined): { x: number; y: number } {
  if (!element || typeof window === "undefined") return { x: 0.5, y: 0.5 };
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2) / Math.max(1, window.innerWidth),
    y: (rect.top + rect.height / 2) / Math.max(1, window.innerHeight),
  };
}
