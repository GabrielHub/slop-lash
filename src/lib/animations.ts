import type { Transition, Variants } from "motion/react";

// ============================================================================
// Motion tokens
//
// Snappy on the phone, staged on the TV. Phones confirm a touch within 80ms and
// finish a state change within 200ms; they never make anyone wait to act. The
// stage is choreographed in beats, one focal motion at a time, with more travel
// so it reads from the couch. Weight matches the stakes: micro (taps, chips) has
// no bounce, meso (cards, panels) is smooth, macro (stamps, winners) slams.
// ============================================================================

/** Durations in seconds. */
export const DUR = {
  /** Touch feedback. */
  press: 0.08,
  /** Controller swaps, exits, chips. */
  fast: 0.16,
  /** Default enter. */
  base: 0.24,
  /** Stage panels, unmasking. */
  slow: 0.4,
  /** A stage scene entering. */
  scene: 0.55,
  /** How long a title card holds. */
  hold: 1.1,
} as const;

/** Cubic-bezier easings; `out` and `inOut` are mirrored in CSS as --ease-out and --ease-in-out. */
export const EASE = {
  /** Default decelerate. */
  out: [0.22, 1, 0.36, 1],
  /** Exits: accelerate away. */
  in: [0.4, 0, 1, 1],
  /** Bar fills, count-ups, morphs. */
  inOut: [0.65, 0, 0.35, 1],
  /** Big landings and wipes. */
  emphasized: [0.05, 0.7, 0.1, 1],
} as const satisfies Record<string, [number, number, number, number]>;

/**
 * Springs. `visualDuration` keeps choreography predictable, so a beat lands
 * when its sound plays.
 */
export const SPRING = {
  press: { type: "spring", visualDuration: 0.12, bounce: 0 },
  /** Chips and phone UI. */
  snappy: { type: "spring", visualDuration: 0.22, bounce: 0.1 },
  /** Cards, layout changes, re-ranking. */
  smooth: { type: "spring", visualDuration: 0.38, bounce: 0.08 },
  /** Stage scenes, podiums. */
  gentle: { type: "spring", visualDuration: 0.6, bounce: 0.04 },
  /** Badges, points, crowns. */
  pop: { type: "spring", visualDuration: 0.32, bounce: 0.4 },
  /** Stamps: the impact lands about STAMP_IMPACT_MS after the stamp appears. */
  slam: { type: "spring", visualDuration: 0.24, bounce: 0.28 },
} as const satisfies Record<string, Transition>;

/** Seconds between siblings. */
export const STAGGER = { tight: 0.03, list: 0.05, cards: 0.09, beats: 0.16 } as const;

/** Keeps a list's whole cascade under `budget` seconds, however long the list is. */
export function staggerFor(count: number, each: number = STAGGER.list, budget = 0.45) {
  return Math.min(each, budget / Math.max(1, count - 1));
}

/** Travel in px. The stage moves further so motion reads from across the room. */
export const TRAVEL = { nudge: 6, enter: 14, stage: 28 } as const;

/** Milliseconds from a stamp appearing to its impact frame, where its sound belongs. */
export const STAMP_IMPACT_MS = 170;

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DUR.base, ease: EASE.out } },
  exit: { opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } },
};

export const enter: Variants = {
  hidden: { opacity: 0, y: TRAVEL.enter },
  visible: { opacity: 1, y: 0, transition: SPRING.smooth },
  exit: { opacity: 0, y: -TRAVEL.nudge, transition: { duration: DUR.fast, ease: EASE.in } },
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: SPRING.pop },
  exit: { opacity: 0, scale: 0.92, transition: { duration: DUR.fast, ease: EASE.in } },
};

/**
 * A stage scene: rises in while its direct `sceneItem` children cascade.
 * Leaves fast. Opacity has its own short tween so the screen is never blank
 * between scenes; the spring only carries the movement.
 */
export const stageScene: Variants = {
  hidden: { opacity: 0, y: TRAVEL.stage, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      default: SPRING.gentle,
      opacity: { duration: DUR.base, ease: EASE.out },
      staggerChildren: STAGGER.beats,
    },
  },
  exit: {
    opacity: 0,
    y: -TRAVEL.enter,
    scale: 0.985,
    transition: { duration: 0.18, ease: EASE.in },
  },
};

/** A section inside a stage scene; it inherits the scene's cascade. */
export const sceneItem: Variants = {
  hidden: { opacity: 0, y: TRAVEL.enter },
  visible: { opacity: 1, y: 0, transition: SPRING.smooth },
};

/** A controller screen: no travel and nothing to wait for. */
export const phoneScreen: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DUR.fast, ease: EASE.out } },
};

/** The next card in a phone deck slides in from the right. */
export const deckCard: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: SPRING.snappy },
  exit: { opacity: 0, x: -24, transition: { duration: DUR.fast, ease: EASE.in } },
};

/** A list parent whose children cascade within a fixed time budget. */
export function listParent(count: number, each?: number): Variants {
  return { hidden: {}, visible: { transition: { staggerChildren: staggerFor(count, each) } } };
}

/** Rubber stamp: winds in big and over-tilted, then slams to its resting tilt. */
export function stamp(tilt = -3): Variants {
  return {
    hidden: { opacity: 0, scale: 2.4, rotate: tilt - 9 },
    visible: {
      opacity: 1,
      scale: 1,
      rotate: tilt,
      transition: { ...SPRING.slam, opacity: { duration: 0.06 } },
    },
    exit: { opacity: 0, transition: { duration: DUR.fast } },
  };
}

/** Unmasks in place: authors, names, the correct answer. */
export const unmask: Variants = {
  hidden: { opacity: 0, y: TRAVEL.nudge, clipPath: "inset(0 0 100% 0)" },
  visible: {
    opacity: 1,
    y: 0,
    clipPath: "inset(0 0 0% 0)",
    transition: { duration: DUR.slow, ease: EASE.emphasized },
  },
};

/** A podium block rising out of an overflow-hidden parent; text is never squashed. */
export const rise: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: SPRING.gentle },
};

/** A title-card wipe on the stage: in from the left, out to the right, so one edge moves at a time. */
export const wipe: Variants = {
  hidden: { clipPath: "inset(0 100% 0 0)" },
  visible: {
    clipPath: "inset(0 0% 0 0)",
    transition: { duration: 0.32, ease: EASE.emphasized },
  },
  exit: { clipPath: "inset(0 0 0 100%)", transition: { duration: 0.28, ease: EASE.in } },
};

export const collapse: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto", transition: { duration: DUR.base, ease: EASE.inOut } },
  exit: { opacity: 0, height: 0, transition: { duration: DUR.fast, ease: EASE.in } },
};

/** Spotlight: focus one element and dim its siblings. */
export function spot(state: "idle" | "focus" | "dim") {
  return {
    idle: { opacity: 1, scale: 1 },
    focus: { opacity: 1, scale: 1.03 },
    dim: { opacity: 0.45, scale: 0.98 },
  }[state];
}

/** Touch feedback. Phones and TVs have no hover. */
export const press = { whileTap: { scale: 0.96 }, transition: SPRING.press } as const;

/** Desktop-only pages (home, host): a small lift on hover. */
export const hoverLift = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97 },
  transition: SPRING.snappy,
} as const;

/** Per-game gesture accents on the same timings. */
export const ACCENT = {
  /** A rubber stamp: hard slams and a glitch. */
  sloplash: { stampTilt: -3, cardTilt: 0, shake: "hard" },
  /** A flirty float: soft springs and swipe-like card tilts. */
  matchslop: { stampTilt: -8, cardTilt: 3, shake: "soft" },
  /** A broadcast: clean wipes and precise stamps that settle without wobble. */
  quizslop: { stampTilt: -1.5, cardTilt: 0, shake: "none" },
} as const;

/** The OS reduced-motion setting, read now (false during server rendering). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
