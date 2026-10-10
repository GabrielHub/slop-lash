import { PerspectiveCamera, Vector3 } from "three";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { compactOutcome } from "../../../../../convex/slopfight/outcome";
import { ARENAS } from "../../arenas";
import { sampleById } from "../../samples";
import type { Champion } from "../../sheet";
import { loadRapier, runFight, type FightEvent, type FightInput, type Rapier } from "../../sim";
import { createPose, createShotState, SHOTS } from "../director/shots";
import { formatFightTime, readableEventLog } from "./event-log";
import { cardBodySize, cardGap, cardGrid, faceOffPlan, HAZARD_H, HAZARD_W, NOTE_H, NOTE_W, noteLine, notesOf, relevantHazard, walkAt, type WalkPath } from "./faceoff-plan";
import { checkHash, EventCursor, fightInputOf, healthAt } from "./playback";
import { FightPlayer, inputKey } from "./player";
import { FightRecording } from "./recording";
import { winnerPoseFraming, winnerPoseOrbit, winnerShape } from "./winner-frame";

const champion = (id: string): Champion => {
  const sample = sampleById(id);
  if (!sample) throw new Error(`no sample ${id}`);
  return sample.champion;
};

const LARRY = champion("raccoon-lawyer");
const SHARK = champion("land-shark");

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

const input = (seed: number, arena: FightInput["arena"] = "FLOODED_GARAGE"): FightInput => ({
  seed,
  arena,
  a: LARRY,
  b: SHARK,
  notes: [{ side: "A", modifies: "strikePower", value: -1, reason: "Briefcase is useless underwater" }],
  limitMs: 30_000,
});

describe("local replay", () => {
  it("does not reuse a recording after a same-name champion is upgraded", () => {
    const original = input(7);
    const upgraded = { ...original, a: { ...original.a, stats: { ...original.a.stats, heft: 5 as const } } };
    expect(inputKey(upgraded)).not.toBe(inputKey(original));
    expect(inputKey({ ...original, notes: [...original.notes] })).toBe(inputKey(original));
  });

  it("records the same fight the server ran (hash, events, outcome)", () => {
    for (const [seed, arena] of [
      [7, "FLOODED_GARAGE"],
      [6, "KITCHEN_COUNTER"],
      [4, "ROOFTOP"],
    ] as const) {
      const server = runFight(R, input(seed, arena));
      const recording = new FightRecording(R, input(seed, arena));
      while (!recording.complete) recording.advance(Infinity, 1_000);
      expect(recording.outcome?.hash).toBe(server.hash);
      expect(recording.outcome?.winner).toBe(server.winner);
      expect(recording.outcome?.method).toBe(server.method);
      expect(recording.events.map((event) => `${event.t}:${event.kind}`)).toEqual(server.events.map((event) => `${event.t}:${event.kind}`));
      expect(checkHash(recording, compactOutcome(server))).toBe("match");
      recording.dispose();
    }
  });

  it("warns with both hashes and keeps the stored outcome on a mismatch", () => {
    const server = runFight(R, input(7));
    const stored = { ...compactOutcome(server), hash: "00000000" };
    const player = new FightPlayer(input(7), stored, { label: "test" });
    player.start(R);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Present the whole fight; the health on screen follows the stored timeline.
    for (let t = 0; t <= server.endMs + 1_000; t += 250) player.update(t, 0.25);
    expect(player.hash).toBe("mismatch");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${server.hash} != stored 00000000`));
    expect(player.health).toEqual(healthAt(stored.healthTimeline, server.endMs + 1_000, stored.maxHealth));
    warn.mockRestore();
    player.recording?.dispose();
  });

  it("never shows sim time ahead of the presented clock", () => {
    const server = runFight(R, input(13));
    const player = new FightPlayer(input(13), compactOutcome(server));
    player.start(R);
    for (const t of [0, 16, 400, 3_000, 2_000, 9_000]) {
      player.update(t, 0.016);
      expect(player.t).toBeLessThanOrEqual(t);
    }
    player.recording?.dispose();
  });

  it("builds the sim input from a revealed fight row only", () => {
    const row = { seed: null, arena: "ROOFTOP" as const, notes: [], limitMs: 30_000, startsAt: null, outcome: null };
    expect(fightInputOf(row, { A: LARRY, B: SHARK })).toBeNull();
    expect(fightInputOf({ ...row, seed: -1 }, { A: LARRY, B: SHARK })?.seed).toBe(4294967295);
    expect(fightInputOf({ ...row, seed: 3 }, { A: LARRY, B: null })).toBeNull();
  });
});

describe("EventCursor", () => {
  const events = [
    { t: 0, kind: "start", side: null },
    { t: 100, kind: "contact", side: null, point: [0, 0, 0] },
    { t: 100, kind: "edge", side: "A", point: [0, 0, 0] },
    { t: 250, kind: "ko", side: "B" },
  ] as FightEvent[];

  it("hands out each event once as time crosses it", () => {
    const cursor = new EventCursor(events);
    expect(cursor.advance(0).map((event) => event.kind)).toEqual(["start"]);
    expect(cursor.advance(99)).toEqual([]);
    expect(cursor.advance(100).map((event) => event.kind)).toEqual(["contact", "edge"]);
    expect(cursor.advance(300).map((event) => event.kind)).toEqual(["ko"]);
    expect(cursor.advance(400)).toEqual([]);
  });

  it("rewinds silently and replays forward from there", () => {
    const cursor = new EventCursor(events);
    cursor.advance(300);
    expect(cursor.advance(50)).toEqual([]);
    expect(cursor.advance(260).map((event) => event.kind)).toEqual(["contact", "edge", "ko"]);
  });
});

describe("healthAt", () => {
  const timeline = [
    [0, 100, 90],
    [1_000, 80, 90],
    [2_500, 80, 40],
  ];
  it("steps at each sample and falls back before the first", () => {
    expect(healthAt(timeline, -5, { A: 1, B: 2 })).toEqual({ A: 1, B: 2 });
    expect(healthAt(timeline, 999, { A: 1, B: 2 })).toEqual({ A: 100, B: 90 });
    expect(healthAt(timeline, 1_000, { A: 1, B: 2 })).toEqual({ A: 80, B: 90 });
    expect(healthAt(timeline, 9_999, { A: 1, B: 2 })).toEqual({ A: 80, B: 40 });
    expect(healthAt([], 10, { A: 7, B: 8 })).toEqual({ A: 7, B: 8 });
  });
});

describe("face-off plan", () => {
  it("sizes each walk-on to its line, within bounds", () => {
    const plain = faceOffPlan(null);
    expect(plain.walk.A).toEqual([0, 1.7]);
    expect(plain.walk.B).toEqual([1.7, 3.4]);
    expect(plain.standAt).toBeCloseTo(3.4);
    expect(plain.cardsAt).toBeCloseTo(3.85);
    const long = faceOffPlan(["word ".repeat(80), "short"]);
    expect(long.walk.A[1]).toBeLessThanOrEqual(2.6);
    expect(long.walk.B[0]).toBe(long.walk.A[1]);
    // The whole entrance fits before the face-off can close (8 s minimum).
    expect(long.standAt).toBeLessThan(5.5);
  });

  it("walks the arc from the mark to the spawn, still at both ends", () => {
    const walk: WalkPath = { from: [-2.25, 0, 0.4], control: [-1.9, 0, 1.3], to: [-1.6, 0, 0], window: [1, 3], restYaw: Math.PI / 2 };
    const p = new Vector3();
    const v = new Vector3();
    expect(walkAt(walk, 0, p, v)).toBe(0);
    expect(p.toArray()).toEqual([-2.25, 0, 0.4]);
    expect(v.length()).toBe(0);
    expect(walkAt(walk, 2, p, v)).toBeCloseTo(0.5);
    expect(v.length()).toBeGreaterThan(0);
    expect(p.z).toBeGreaterThan(0.4); // bows downstage toward the camera
    expect(walkAt(walk, 5, p, v)).toBe(1);
    expect(p.x).toBeCloseTo(-1.6);
    expect(p.z).toBeCloseTo(0);
    expect(v.length()).toBe(0);
  });

  it("reads a note as its card does", () => {
    expect(noteLine({ reason: "Leaf blower is useless underwater", modifies: "strikePower", value: -1 })).toBe("Leaf blower is useless underwater: Strike -1");
    expect(noteLine({ reason: "Loves a wet floor", modifies: "speed", value: 15 })).toMatch(/^Loves a wet floor: Speed \+15%$/);
  });

  it("rounds a capped note's value for its card, never down to zero", () => {
    expect(noteLine({ reason: "Greasy", modifies: "speed", value: 14.83 })).toBe("Greasy: Speed +15%");
    expect(noteLine({ reason: "Light", modifies: "knockbackTaken", value: 0.17 })).toBe("Light: Knockback taken +1%");
    expect(noteLine({ reason: "Heavy", modifies: "speed", value: -0.4 })).toBe("Heavy: Speed -1%");
    expect(noteLine({ reason: "Sticky", modifies: "strikePower", value: 0.37 })).toBe("Sticky: Strike +0.4");
    expect(noteLine({ reason: "Bonk", modifies: "strikePower", value: -1 })).toBe("Bonk: Strike -1");
    expect(noteLine({ reason: "Spiky", modifies: "selfDamageOnHitTaken", value: 4.6 })).toBe("Spiky: Self-damage per hit taken +5");
    expect(noteLine({ reason: "Rooted", modifies: "pushImmune", value: 0.5 })).toBe("Rooted: Can't be pushed");
  });

  it("shows the applied notes minus the dropped ones, else the raw notes", () => {
    const applied = [
      { side: "A" as const, modifies: "speed" as const, reason: "kept", value: 10, favors: "A" as const, capped: false, dropped: false },
      { side: "B" as const, modifies: "speed" as const, reason: "dropped", value: 10, favors: "B" as const, capped: true, dropped: true },
    ];
    expect(notesOf({ applied, notes: [] }).map((note) => note.line)).toEqual(["kept: Speed +10%"]);
    expect(notesOf({ applied: [], notes: [{ side: "B", modifies: "reach", value: 1, reason: "raw" }] })[0]?.side).toBe("B");
  });

  it("hangs one of the arena's own hazards", () => {
    for (const arena of ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as const) {
      const hazard = relevantHazard(arena, LARRY, SHARK);
      expect(hazard).not.toBeNull();
      expect(ARENAS[arena].hazards).toContain(hazard);
    }
  });
});

describe("matchup cards", () => {
  it("stacks the notes in rows of two above the hazard card, never overlapping", () => {
    const grid = cardGrid(3);
    expect(grid.notes).toHaveLength(3);
    const [first, second, third] = [grid.notes[0]!, grid.notes[1]!, grid.notes[2]!];
    expect(first[1]).toBe(second[1]);
    expect(first[1] - third[1]).toBeGreaterThanOrEqual(NOTE_H);
    expect(second[0] - first[0]).toBeGreaterThanOrEqual(NOTE_W);
    // A lone last note is centred, and clears the hazard card under it.
    expect(third[0]).toBe(0);
    expect(third[1] - grid.hazard[1]).toBeGreaterThanOrEqual((NOTE_H + HAZARD_H) / 2);
    expect(grid.thinking[1]).toBe(third[1]);
    expect(grid.width).toBeCloseTo(2 * NOTE_W + 0.14);
    expect(grid.height).toBeGreaterThan(2 * NOTE_H + HAZARD_H);
    expect(cardGrid(0).width).toBeCloseTo(HAZARD_W);
  });

  it("sizes a card's body to fit under its title band", () => {
    // Every arena hazard fits its card at full size; a long note shrinks, a short one does not.
    for (const arena of ["FLOODED_GARAGE", "KITCHEN_COUNTER", "ROOFTOP"] as const) {
      for (const hazard of ARENAS[arena].hazards) expect(cardBodySize(hazard.card, HAZARD_W, HAZARD_H, 0.056), hazard.id).toBe(0.056);
    }
    expect(cardBodySize("Greasy: Speed +15%", NOTE_W, NOTE_H, 0.058)).toBe(0.058);
    const long = "Doctor Octavia's eight sticky suckers grip the wet tiles like a dream: Speed +15%";
    const size = cardBodySize(long, NOTE_W, NOTE_H, 0.058);
    expect(size).toBeLessThan(0.058);
    expect(size).toBeGreaterThan(0.058 * 0.55);
  });

  it("hangs between the fighters when it fits, else beyond the far one, never over the near one", () => {
    const near = { minX: -0.9, maxX: -0.3, depth: 3 };
    const roomy = cardGap(near, { minX: 0.5, maxX: 0.7, depth: 5 }, 0.6);
    expect(roomy.from).toBeCloseTo(-0.26);
    expect(roomy.to).toBeCloseTo(0.46);
    const beyond = cardGap(near, { minX: 0, maxX: 0.3, depth: 5 }, 0.6);
    expect(beyond.from).toBeCloseTo(0.34);
    expect(beyond.to).toBeCloseTo(0.96);
    // Mirrored: the near fighter on the right keeps the cards on its left.
    const mirrored = cardGap({ minX: 0.3, maxX: 0.9, depth: 3 }, { minX: -0.7, maxX: -0.5, depth: 6 }, 0.6);
    expect(mirrored.from).toBeCloseTo(-0.46);
    expect(mirrored.to).toBeCloseTo(0.26);
    // Too narrow for a comfortable fit either side: shrink into the roomier gap rather than cover the far fighter.
    const tight = cardGap(near, { minX: 0.2, maxX: 0.35, depth: 5 }, 1.0, 0.45);
    expect(tight.from).toBeCloseTo(0.39);
    expect(tight.to).toBeCloseTo(0.96);
    // Short of that: reach over the near (blurred foreground) fighter's inner edge, at most 45% of it.
    const over = cardGap(near, { minX: 0.2, maxX: 0.35, depth: 5 }, 1.0, 0.6);
    expect(over.kind).toBe("widened");
    expect(over.from).toBeCloseTo(-0.44);
    expect(over.to).toBeCloseTo(0.16);
    // The choice on screen holds at a threshold, both ways (no flicker across the far fighter).
    const far = { minX: 0.2, maxX: 0.35, depth: 5 };
    expect(cardGap(near, far, 1.0, 0.75).kind).toBe("side");
    expect(cardGap(near, far, 1.0, 0.75, "widened").kind).toBe("widened");
    expect(cardGap(near, far, 1.0, 0.66, "side").kind).toBe("side");
    // A shrunk grid keeps its side while it still fits there.
    expect(cardGap(near, far, 1.0, 0.45).kind).toBe("tightBeyond");
    expect(cardGap(near, far, 1.0, 0.45, "tightBetween").kind).toBe("tightBetween");
    // Not even that: the whole side.
    const none = cardGap(near, { minX: 0.2, maxX: 0.35, depth: 5 }, 1.0, 0.8);
    expect(none.from).toBeCloseTo(-0.26);
    expect(none.to).toBeCloseTo(0.96);
  });

  it("settles: fed its own choice back, the gap never flips frame to frame", () => {
    for (let nearMax = -0.6; nearMax <= 0.2; nearMax += 0.0137) {
      for (let farMin = nearMax + 0.05; farMin <= 0.7; farMin += 0.0191) {
        for (const minimum of [0.4, 0.4771, 0.52, 0.6]) {
          const near = { minX: nearMax - 0.8, maxX: nearMax, depth: 2 };
          const far = { minX: farMin, maxX: farMin + 0.25, depth: 5 };
          const first = cardGap(near, far, minimum * 1.5, minimum);
          let kept = cardGap(near, far, minimum * 1.5, minimum, first.kind).kind;
          for (let frame = 0; frame < 4; frame += 1) {
            const next = cardGap(near, far, minimum * 1.5, minimum, kept).kind;
            expect(next).toBe(kept);
            kept = next;
          }
        }
      }
    }
  });
});

describe("winner framing", () => {
  /** Letterbox 1 (2.39:1 bars) leaves this fraction of a 16:9 frame's height. */
  const VISIBLE = 16 / 9 / 2.39;
  /** The Voice's caption's top edge, as a fraction of the visible half below the centre. */
  const CAPTION = 0.585;
  // Solve the real winner_pose at `t` and say where the winner's top, middle and feet land (fractions of the visible half).
  const frame = (id: string, t: number) => {
    const shape = winnerShape(champion(id));
    const { pull, lift } = winnerPoseFraming(shape);
    const orbit = winnerPoseOrbit(t);
    const target = new Vector3(Math.sin(orbit) * pull, lift, Math.cos(orbit) * pull);
    const pose = createPose();
    SHOTS.winner_pose.solve({ nodes: null, targets: [target], t, dt: 1 / 60, aspect: 16 / 9, prev: createPose(), params: {}, first: false }, createShotState(), pose);
    const camera = new PerspectiveCamera(pose.fov, 16 / 9, 0.05, 100);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();
    const at = (y: number, forward: number) => new Vector3(0, y, forward).project(camera).y / VISIBLE;
    return {
      pull,
      top: at(shape.top, shape.topForward),
      middle: at((shape.top + shape.bottom) / 2, (shape.topForward + shape.front) / 2),
      feet: at(shape.bottom, shape.front),
    };
  };

  it("fits a short winner whole between the caption and the top bar, through the push-in", () => {
    for (const id of ["corgi", "mouse", "worm", "spider", "cat"]) {
      for (const t of [0.5, 1.5, 2.7]) {
        const { top, feet } = frame(id, t);
        expect(top, `${id} top at ${t}s`).toBeLessThan(0.9);
        expect(feet, `${id} feet at ${t}s`).toBeGreaterThan(-CAPTION);
      }
    }
  });

  it("keeps a tall winner's head in and its middle above the caption", () => {
    for (const id of ["snail", "elephant", "robot", "dragon", "storm-cloud", "horse"]) {
      for (const t of [0.5, 1.5, 2.7]) {
        const { top, middle, pull } = frame(id, t);
        expect(top, `${id} top at ${t}s`).toBeLessThan(0.92);
        expect(middle, `${id} middle at ${t}s`).toBeGreaterThan(-CAPTION + 0.25);
        expect(pull).toBeLessThanOrEqual(1.1);
      }
    }
  });
});

describe("event log", () => {
  it("formats sim time as m:ss.t", () => {
    expect(formatFightTime(0)).toBe("0:00.0");
    expect(formatFightTime(3_250)).toBe("0:03.2");
    expect(formatFightTime(63_450)).toBe("1:03.4");
  });

  it("reads the story beats of a real fight and ends on the winner", () => {
    const server = runFight(R, input(2));
    const lines = readableEventLog(server.events, { A: LARRY, B: SHARK });
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line, index) => index === 0 || line.t >= lines[index - 1]!.t)).toBe(true);
    const last = lines.at(-1)!;
    expect(last.tone).toBe("end");
    expect(last.text).toContain(server.winner === "A" ? LARRY.name : SHARK.name);
    // No windups or whiffs in the readable log.
    expect(lines.some((line) => /winds up|whiff/i.test(line.text))).toBe(false);
  });

  it("names the move, the damage and big hits", () => {
    const events = [
      { t: 1_200, kind: "hit", side: "A", move: 0, type: "STRIKE", damage: 12.4, knockback: 3, big: true, point: [0, 0.5, 0], health: 80, counter: false, miracle: false },
      { t: 1_300, kind: "windup", side: "B", move: 1, type: "TRICK" },
      { t: 2_000, kind: "edge", side: "B", point: [3, 0, 0] },
      { t: 2_600, kind: "ringout", side: "B", point: [3.4, 0, 0] },
    ] as FightEvent[];
    const lines = readableEventLog(events, { A: LARRY, B: SHARK });
    expect(lines.map((line) => line.tone)).toEqual(["big", "edge", "ringout"]);
    expect(lines[0]!.text).toBe(`${LARRY.name} hits ${SHARK.name} with ${LARRY.moves[0]!.name} for 12 (big hit)`);
    expect(lines[0]!.time).toBe("0:01.2");
  });
});
