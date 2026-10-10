import { beforeAll, describe, expect, it } from "vite-plus/test";
import { ARENA_IDS, type ArenaId } from "../arenas";
import { SUDDEN_DEATH_MS } from "../constants";
import { SAMPLES, sampleById } from "../samples";
import type { Champion } from "../sheet";
import { maxHealth } from "../sheet";
import { createFight, FIGHT_EVENT_KINDS, loadRapier, runFight, type FightEvent, type FightInput, type Rapier } from "./index";

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

const champion = (id: string): Champion => {
  const sample = sampleById(id);
  if (!sample) throw new Error(`no sample ${id}`);
  return sample.champion;
};

const input = (a: string, b: string, arena: ArenaId, seed: number, limitMs = 30_000): FightInput => ({
  seed,
  arena,
  a: champion(a),
  b: champion(b),
  notes: [],
  limitMs,
});

// Different body plans, delivery types and sizes on purpose.
const PAIRS: [string, string][] = [
  ["raccoon-lawyer", "octopus"],
  ["potato-googly", "storm-cloud"],
  ["worm", "elephant"],
];

function expectWellFormed(events: FightEvent[], limitMs: number) {
  expect(events[0]).toEqual({ t: 0, kind: "start", side: null });
  let last = 0;
  for (const event of events) {
    expect(FIGHT_EVENT_KINDS).toContain(event.kind);
    expect(Number.isInteger(event.t)).toBe(true);
    expect(event.t).toBeGreaterThanOrEqual(last);
    last = event.t;
  }
  const end = events.at(-1)!;
  expect(end.kind).toBe("end");
  expect(end.t).toBeLessThanOrEqual(limitMs + SUDDEN_DEATH_MS);
  expect(events.filter((event) => event.kind === "end")).toHaveLength(1);
}

describe("runFight determinism", () => {
  it("returns deep-equal outcomes for the same input, across pairs and every arena", () => {
    for (const [a, b] of PAIRS) {
      for (const arena of ARENA_IDS) {
        // 20 s is the house-vs-house limit; it keeps this matrix cheap.
        const fight = input(a, b, arena, 20261010, 20_000);
        const first = runFight(R, fight);
        const second = runFight(R, fight);
        expect(second).toEqual(first);
        expect(first.hash).toMatch(/^[0-9a-z]+$/);
      }
    }
  });

  it("steps createFight to the same events, outcome and hash as runFight", () => {
    const fight = input("cat", "crab", "KITCHEN_COUNTER", 77);
    const reference = runFight(R, fight);
    const sim = createFight(R, fight);
    const events: FightEvent[] = [];
    let steps = 0;
    while (!sim.done && steps < 3000) {
      events.push(...sim.step());
      steps += 1;
      // The views must not disturb the simulation.
      if (steps % 7 === 0) {
        sim.pose("A");
        sim.live("B");
      }
    }
    expect(events).toEqual(reference.events);
    expect(sim.outcome()).toEqual(reference);
    // Stepping on after the end runs physics for the outro and records nothing.
    for (let index = 0; index < 30; index += 1) expect(sim.step()).toEqual([]);
    expect(sim.outcome()).toEqual(reference);
    sim.dispose();
  });

  it("rejects an unknown arena with a clear error", () => {
    const bad = { ...input("cat", "corgi", "ROOFTOP", 1), arena: "GARAGE" as ArenaId };
    expect(() => createFight(R, bad)).toThrow(/unknown arena "GARAGE"/);
  });

  it("changes with the seed", () => {
    const one = runFight(R, input("cat", "corgi", "ROOFTOP", 1));
    const two = runFight(R, input("cat", "corgi", "ROOFTOP", 2));
    expect(two.hash).not.toBe(one.hash);
  });
});

describe("runFight outcomes", () => {
  it("always terminates with a well-formed log, health and timeline", () => {
    let pick = 0;
    for (const arena of ARENA_IDS) {
      for (let index = 0; index < 4; index += 1) {
        const a = SAMPLES[(pick * 7) % SAMPLES.length]!;
        const b = SAMPLES[(pick * 11 + 3) % SAMPLES.length]!;
        pick += 1;
        if (a.id === b.id) continue;
        const outcome = runFight(R, input(a.id, b.id, arena, pick * 1013));
        expectWellFormed(outcome.events, 30_000);
        expect(["A", "B"]).toContain(outcome.winner);
        expect(["KO", "RINGOUT", "DECISION", "SUDDEN_DEATH"]).toContain(outcome.method);
        expect(outcome.maxHealth).toEqual({ A: maxHealth(a.champion), B: maxHealth(b.champion) });
        const end = outcome.events.at(-1)!;
        expect(end).toMatchObject({ kind: "end", side: outcome.winner, method: outcome.method, t: outcome.endMs });
        if (outcome.method === "KO") expect(outcome.events.some((event) => event.kind === "ko")).toBe(true);
        if (outcome.method === "RINGOUT") expect(outcome.events.some((event) => event.kind === "ringout")).toBe(true);
        if (outcome.method === "DECISION") {
          expect(outcome.events.some((event) => event.kind === "timeout")).toBe(true);
        }
        // Timeline: starts full, at least 4 Hz, ends at the final health.
        const timeline = outcome.healthTimeline;
        expect(timeline[0]).toEqual([0, outcome.maxHealth.A, outcome.maxHealth.B]);
        for (let index = 1; index < timeline.length; index += 1) {
          expect(timeline[index]![0] - timeline[index - 1]![0]).toBeLessThanOrEqual(251);
        }
        expect(timeline.at(-1)!.slice(1)).toEqual([outcome.health.A, outcome.health.B]);
      }
    }
  });

  it("goes to sudden death on a tie at the limit, then to a seeded decision", () => {
    // A mirror match with a limit too short for anyone to land a hit.
    const outcome = runFight(R, input("snail", "snail", "ROOFTOP", 5, 300));
    const kinds = outcome.events.map((event) => event.kind);
    expect(kinds).toContain("timeout");
    expect(kinds).toContain("suddenDeath");
    expect(["SUDDEN_DEATH", "DECISION", "KO", "RINGOUT"]).toContain(outcome.method);
    expect(outcome.endMs).toBeLessThanOrEqual(300 + SUDDEN_DEATH_MS);
    if (outcome.method === "DECISION") expect(outcome.endMs).toBeGreaterThanOrEqual(300 + SUDDEN_DEATH_MS - 20);
  });

  it("decides on health at the limit: more of the health bar left wins", () => {
    let decisions = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      // Different max health (Heft 4 v Heft 3), so the share, not the raw number, must decide.
      const outcome = runFight(R, input("horse", "giraffe", "ROOFTOP", seed, 4000));
      expect(outcome.endMs).toBeLessThanOrEqual(4000 + SUDDEN_DEATH_MS);
      if (outcome.method !== "DECISION" || outcome.endMs !== 4000) continue;
      decisions += 1;
      const shareA = outcome.health.A * outcome.maxHealth.B;
      const shareB = outcome.health.B * outcome.maxHealth.A;
      expect(shareA).not.toBe(shareB);
      expect(outcome.winner).toBe(shareA > shareB ? "A" : "B");
    }
    expect(decisions).toBeGreaterThan(0);
  });

  it("makes contact early, no later than the first hit", () => {
    const outcome = runFight(R, input("land-shark", "spider", "ROOFTOP", 31));
    const firstHit = outcome.events.find((event) => event.kind === "hit" || event.kind === "throw");
    const contact = outcome.events.find((event) => event.kind === "contact" || event.kind === "grab");
    expect(contact).toBeDefined();
    if (firstHit) expect(contact!.t).toBeLessThanOrEqual(firstHit.t);
    expect(contact!.t).toBeLessThan(5000);
  });

  it("finds slithers hard to grab: some grabs slip, and only slithers slip", () => {
    let slipped = 0;
    let grabbed = 0;
    for (const arena of ARENA_IDS) {
      for (const seed of [4, 5, 6]) {
        const events = runFight(R, input("crab", "worm", arena, seed)).events;
        slipped += events.filter((event) => event.kind === "whiff" && event.side === "A" && event.reason === "slipped").length;
        grabbed += events.filter((event) => event.kind === "grab" && event.side === "A").length;
        const other = runFight(R, input("crab", "horse", arena, seed)).events;
        expect(other.some((event) => event.kind === "whiff" && event.reason === "slipped")).toBe(false);
      }
    }
    expect(slipped).toBeGreaterThan(0);
    expect(grabbed).toBeGreaterThan(0);
  });

  it("never grabs a grappleImmune fighter", () => {
    const note = { side: "B" as const, modifies: "grappleImmune" as const, value: 1, reason: "Too slippery to hold" };
    for (const arena of ARENA_IDS) {
      const outcome = runFight(R, { ...input("crab", "horse", arena, 4), notes: [note] });
      expect(outcome.events.some((event) => event.kind === "grab" && event.side === "A")).toBe(false);
    }
  });
});

describe("runFight performance", () => {
  it("runs a full 30 s fight well inside the budget", () => {
    // Warm up the WASM and the JIT, then time a fight that goes the distance.
    runFight(R, input("horse", "octopus", "ROOFTOP", 3));
    let worst = 0;
    let fullLength = 0;
    for (const seed of [11, 12, 13]) {
      const started = performance.now();
      const outcome = runFight(R, input("octopus", "spider", "KITCHEN_COUNTER", seed, 30_000));
      const ms = performance.now() - started;
      worst = Math.max(worst, ms);
      fullLength = Math.max(fullLength, outcome.endMs);
    }
    console.info(`[sim perf] worst of 3 octopus v spider fights: ${worst.toFixed(0)} ms (longest ${fullLength} ms)`);
    // Budget is about 400 ms; the bound is loose so parallel test runs stay green.
    expect(worst).toBeLessThan(1500);
  });
});
