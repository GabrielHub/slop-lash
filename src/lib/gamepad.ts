/**
 * Turns `navigator.getGamepads()` snapshots into discrete intents, and picks
 * the nearest focus target in a direction. Pure, so the TV's couch controls
 * are testable without a pad; `useGamepadNav` wires it to the page.
 */

/** Fired on window for every pad intent, so `useAwake` wakes the auto-hiding dock. */
export const GAMEPAD_INPUT_EVENT = "gamepadinput";

export type Direction = "up" | "down" | "left" | "right";
export type Intent = Direction | "activate" | "back" | "menu" | "skip";

/** What we read from a `Gamepad`. */
export interface PadSnapshot {
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

/** Standard-mapping button indices (an Xbox pad in Chrome or Edge). */
const BUTTON = {
  a: 0,
  b: 1,
  rb: 5,
  view: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

const BUTTON_INTENTS: readonly (readonly [index: number, intent: Intent])[] = [
  [BUTTON.a, "activate"],
  [BUTTON.b, "back"],
  [BUTTON.menu, "menu"],
  [BUTTON.rb, "skip"],
  [BUTTON.view, "skip"],
];

/** The left stick must lean this far before it counts as a direction. */
export const STICK_DEADZONE = 0.5;
/** A held direction repeats after this long… */
export const REPEAT_DELAY_MS = 400;
/** …and then this often. */
export const REPEAT_INTERVAL_MS = 120;

export interface PadState {
  /** Intent buttons held in the last snapshot, so a hold fires once. */
  readonly held: ReadonlySet<number>;
  readonly direction: Direction | null;
  /** When the held direction fires again. */
  readonly nextRepeat: number;
}

function pressed(pads: readonly (PadSnapshot | null)[], index: number) {
  return pads.some((pad) => pad?.buttons[index]?.pressed === true);
}

/** The direction the pads point: the D-pad first, else the left stick's stronger axis past the deadzone. */
export function padDirection(pads: readonly (PadSnapshot | null)[]): Direction | null {
  if (pressed(pads, BUTTON.up)) return "up";
  if (pressed(pads, BUTTON.down)) return "down";
  if (pressed(pads, BUTTON.left)) return "left";
  if (pressed(pads, BUTTON.right)) return "right";
  for (const pad of pads) {
    const x = pad?.axes[0] ?? 0;
    const y = pad?.axes[1] ?? 0;
    if (Math.max(Math.abs(x), Math.abs(y)) < STICK_DEADZONE) continue;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }
  return null;
}

/**
 * The intents between the previous snapshot and this one: buttons fire on
 * press, not hold; a direction fires on press, then repeats while held. With
 * no previous state it only primes, so the press that woke the pad (the
 * browser reports a pad only after one) doesn't also click something.
 */
export function readPads(
  previous: PadState | null,
  pads: readonly (PadSnapshot | null)[],
  now: number,
): { state: PadState; intents: Intent[] } {
  const held = new Set(BUTTON_INTENTS.map(([index]) => index).filter((i) => pressed(pads, i)));
  const direction = padDirection(pads);
  if (!previous) {
    return { state: { held, direction, nextRepeat: now + REPEAT_DELAY_MS }, intents: [] };
  }

  const intents: Intent[] = [];
  let nextRepeat = previous.nextRepeat;
  if (direction && direction !== previous.direction) {
    intents.push(direction);
    nextRepeat = now + REPEAT_DELAY_MS;
  } else if (direction && now >= previous.nextRepeat) {
    intents.push(direction);
    // From now, not the last deadline, so a stalled frame never bursts.
    nextRepeat = now + REPEAT_INTERVAL_MS;
  }
  for (const [index, intent] of BUTTON_INTENTS) {
    if (held.has(index) && !previous.held.has(index) && !intents.includes(intent)) {
      intents.push(intent);
    }
  }
  return { state: { held, direction, nextRepeat }, intents };
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How far `to` is off-axis from `from`: the gap between their spans, 0 when they overlap. */
function spanGap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.max(aStart, bStart) - Math.min(aEnd, bEnd));
}

/** Score `to` as a move from `from` in `direction`; lower is better, null when it isn't that way. */
function score(from: Rect, to: Rect, direction: Direction): number | null {
  const vertical = direction === "up" || direction === "down";
  const forward = direction === "down" || direction === "right" ? 1 : -1;
  const along = (rect: Rect) => (vertical ? rect.top + rect.bottom : rect.left + rect.right) / 2;
  const across = (rect: Rect) => (vertical ? rect.left + rect.right : rect.top + rect.bottom) / 2;
  // That way means its centre is past ours, so overlapping and touching targets still count.
  if ((along(to) - along(from)) * forward <= 0) return null;
  const gap = vertical
    ? forward > 0
      ? to.top - from.bottom
      : from.top - to.bottom
    : forward > 0
      ? to.left - from.right
      : from.left - to.right;
  const off = vertical
    ? spanGap(from.left, from.right, to.left, to.right)
    : spanGap(from.top, from.bottom, to.top, to.bottom);
  // Lined-up targets win over nearer ones off to the side; centres break ties.
  return Math.max(0, gap) + off * 2 + Math.abs(across(to) - across(from)) * 0.1;
}

/** The index of the candidate to move focus to from `from` in `direction`, or -1. */
export function nearestInDirection(
  from: Rect,
  candidates: readonly Rect[],
  direction: Direction,
): number {
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((to, index) => {
    const value = score(from, to, direction);
    if (value !== null && value < bestScore) {
      best = index;
      bestScore = value;
    }
  });
  return best;
}
