import { describe, expect, it } from "vite-plus/test";
import {
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  nearestInDirection,
  padDirection,
  readPads,
  type PadSnapshot,
  type PadState,
  type Rect,
} from "./gamepad";

function pad({ buttons = [] as number[], axes = [0, 0] } = {}): PadSnapshot {
  return {
    buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: buttons.includes(index) })),
    axes,
  };
}

/** Feed snapshots at the given times, collecting every intent. */
function run(frames: [now: number, snapshot: PadSnapshot][], start: PadState | null = null) {
  let state = start;
  const intents: string[] = [];
  for (const [now, snapshot] of frames) {
    const next = readPads(state, [snapshot], now);
    state = next.state;
    intents.push(...next.intents);
  }
  return intents;
}

describe("readPads", () => {
  it("only primes on the first snapshot, so the waking press clicks nothing", () => {
    expect(readPads(null, [pad({ buttons: [0] })], 0).intents).toEqual([]);
    expect(run([[0, pad({ buttons: [0] })], [16, pad({ buttons: [0] })]])).toEqual([]);
  });

  it("fires a button on press, once per hold", () => {
    expect(
      run([
        [0, pad()],
        [16, pad({ buttons: [0] })],
        [32, pad({ buttons: [0] })],
        [48, pad()],
        [64, pad({ buttons: [0] })],
      ]),
    ).toEqual(["activate", "activate"]);
  });

  it("maps B, Menu, RB and View", () => {
    expect(run([[0, pad()], [16, pad({ buttons: [1] })]])).toEqual(["back"]);
    expect(run([[0, pad()], [16, pad({ buttons: [9] })]])).toEqual(["menu"]);
    expect(run([[0, pad()], [16, pad({ buttons: [5] })]])).toEqual(["skip"]);
    expect(run([[0, pad()], [16, pad({ buttons: [8] })]])).toEqual(["skip"]);
  });

  it("fires skip once when RB and View go down together", () => {
    expect(run([[0, pad()], [16, pad({ buttons: [5, 8] })]])).toEqual(["skip"]);
  });

  it("ignores buttons with no intent", () => {
    expect(run([[0, pad()], [16, pad({ buttons: [2, 3, 4, 6, 7, 16] })]])).toEqual([]);
  });

  it("repeats a held direction after the delay, then at the interval", () => {
    const down = pad({ buttons: [13] });
    const first = 16 + REPEAT_DELAY_MS;
    expect(
      run([
        [0, pad()],
        [16, down],
        [first - 1, down],
        [first, down],
        [first + REPEAT_INTERVAL_MS - 1, down],
        [first + REPEAT_INTERVAL_MS, down],
        [first + REPEAT_INTERVAL_MS * 2, down],
      ]),
    ).toEqual(["down", "down", "down", "down"]);
  });

  it("does not repeat before the delay", () => {
    expect(
      run([
        [0, pad()],
        [16, pad({ buttons: [12] })],
        [16 + REPEAT_DELAY_MS - 1, pad({ buttons: [12] })],
      ]),
    ).toEqual(["up"]);
  });

  it("fires at once when the held direction changes", () => {
    expect(
      run([
        [0, pad()],
        [16, pad({ buttons: [14] })],
        [32, pad({ buttons: [15] })],
      ]),
    ).toEqual(["left", "right"]);
  });

  it("never bursts after a stalled frame", () => {
    expect(
      run([
        [0, pad()],
        [16, pad({ buttons: [13] })],
        [5_000, pad({ buttons: [13] })],
        [5_016, pad({ buttons: [13] })],
      ]),
    ).toEqual(["down", "down"]);
  });

  it("merges every connected pad", () => {
    const { state } = readPads(null, [pad(), null, pad()], 0);
    expect(readPads(state, [pad(), null, pad({ buttons: [0] })], 16).intents).toEqual(["activate"]);
  });
});

describe("padDirection", () => {
  it("reads the D-pad", () => {
    expect(padDirection([pad({ buttons: [12] })])).toBe("up");
    expect(padDirection([pad({ buttons: [13] })])).toBe("down");
    expect(padDirection([pad({ buttons: [14] })])).toBe("left");
    expect(padDirection([pad({ buttons: [15] })])).toBe("right");
  });

  it("reads the left stick's stronger axis past the deadzone", () => {
    expect(padDirection([pad({ axes: [0.3, -0.2] })])).toBeNull();
    expect(padDirection([pad({ axes: [0.8, 0.6] })])).toBe("right");
    expect(padDirection([pad({ axes: [-0.9, 0.2] })])).toBe("left");
    expect(padDirection([pad({ axes: [0.2, -0.7] })])).toBe("up");
    expect(padDirection([pad({ axes: [0.1, 0.9] })])).toBe("down");
  });

  it("prefers the D-pad over the stick", () => {
    expect(padDirection([pad({ buttons: [12], axes: [0, 1] })])).toBe("up");
  });

  it("is null with no pads", () => {
    expect(padDirection([])).toBeNull();
    expect(padDirection([null])).toBeNull();
  });
});

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, right: left + width, bottom: top + height };
}

describe("nearestInDirection", () => {
  // A 2×2 grid of game cards, a full-width button under it.
  const cards = [rect(0, 0, 100, 50), rect(120, 0, 100, 50), rect(0, 70, 100, 50), rect(120, 70, 100, 50)];
  const create = rect(0, 140, 220, 40);
  const all = [...cards, create];

  it("moves across and down a grid", () => {
    expect(nearestInDirection(cards[0]!, all, "right")).toBe(1);
    expect(nearestInDirection(cards[0]!, all, "down")).toBe(2);
    expect(nearestInDirection(cards[1]!, all, "down")).toBe(3);
    expect(nearestInDirection(cards[3]!, all, "left")).toBe(2);
    expect(nearestInDirection(cards[3]!, all, "up")).toBe(1);
  });

  it("drops onto a wide target below from either column", () => {
    expect(nearestInDirection(cards[2]!, all, "down")).toBe(4);
    expect(nearestInDirection(cards[3]!, all, "down")).toBe(4);
  });

  it("goes up from a wide target to the card above its centre's side", () => {
    const left = rect(0, 0, 100, 50);
    const right = rect(150, 0, 100, 50);
    const wide = rect(0, 70, 120, 40);
    expect(nearestInDirection(wide, [left, right, wide], "up")).toBe(0);
  });

  it("prefers a lined-up target over a nearer one off to the side", () => {
    const from = rect(0, 0, 100, 40);
    const aside = rect(300, 50, 100, 40);
    const below = rect(0, 120, 100, 40);
    expect(nearestInDirection(from, [aside, below], "down")).toBe(1);
  });

  it("returns -1 when nothing lies that way", () => {
    expect(nearestInDirection(cards[0]!, all, "up")).toBe(-1);
    expect(nearestInDirection(cards[0]!, all, "left")).toBe(-1);
    expect(nearestInDirection(cards[0]!, [], "down")).toBe(-1);
  });

  it("falls back to centres for overlapping targets", () => {
    const from = rect(0, 0, 100, 100);
    const overlapping = rect(50, 60, 100, 100);
    expect(nearestInDirection(from, [overlapping], "down")).toBe(0);
    expect(nearestInDirection(from, [overlapping], "right")).toBe(0);
    expect(nearestInDirection(from, [overlapping], "up")).toBe(-1);
  });

  it("takes a slightly overlapping neighbour over a far clean one", () => {
    // The lobby's Start button overlaps the dev bar under it by 2px.
    const bar = rect(0, 1195, 30, 15);
    const start = rect(0, 1141, 220, 56);
    const far = rect(0, 643, 28, 28);
    expect(nearestInDirection(bar, [far, start], "up")).toBe(1);
  });

  it("tolerates a 1px overlap from shared borders", () => {
    const from = rect(0, 0, 100, 40);
    const touching = rect(0, 39.5, 100, 40);
    const further = rect(0, 100, 100, 40);
    expect(nearestInDirection(from, [further, touching], "down")).toBe(1);
  });
});
