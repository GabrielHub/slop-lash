import { describe, expect, it } from "vite-plus/test";
import type { FightEvent, Side } from "../../sim";
import { planReplay, REPLAY_MAX_REAL_MS, REPLAY_RATES, replayFrom, replayRateAt, replaySimAt, type ReplayPlan } from "./replay-plan";

const hit = (t: number, side: Side, damage: number, big = false): FightEvent => ({
  t,
  kind: "hit",
  side,
  move: 0,
  type: "STRIKE",
  damage,
  knockback: 4,
  big,
  point: [0, 0.6, 0],
  health: 50,
  counter: false,
  miracle: false,
});
const thrown = (t: number, side: Side, damage: number): FightEvent => ({ t, kind: "throw", side, move: 1, damage, knockback: 6, point: [0, 0.5, 0], health: 40 });
const ko = (t: number, side: Side): FightEvent => ({ t, kind: "ko", side });
const ringout = (t: number, side: Side): FightEvent => ({ t, kind: "ringout", side, point: [2, -0.6, 0] });

/** Real ms into the replay at which sim time `simMs` is shown. */
function realAt(plan: ReplayPlan, simMs: number): number {
  let lo = 0;
  let hi = plan.realMs;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (replaySimAt(plan, mid) < simMs) lo = mid;
    else hi = mid;
  }
  return hi;
}

describe("instant replay plan", () => {
  it("a KO replays the finishing blow, not a bigger hit from earlier or from the loser", () => {
    const events = [hit(5_000, "A", 28, true), hit(7_000, "B", 30, true), hit(9_000, "A", 12), ko(9_000, "B")];
    const plan = planReplay(events, { winner: "A", method: "KO", endMs: 9_000 })!;
    expect(plan.kind).toBe("KO");
    expect(plan.label).toBe("THE KNOCKOUT");
    expect([plan.attacker, plan.victim]).toEqual(["A", "B"]);
    expect(plan.impact?.t).toBe(9_000);
    expect(plan.momentMs).toBe(9_000);
    expect(replayRateAt(plan, plan.momentMs)).toBeCloseTo(REPLAY_RATES.core);
  });

  it("a KO with no blow just before it replays the fall itself", () => {
    const events = [hit(3_000, "A", 20), ko(9_000, "B")];
    const plan = planReplay(events, { winner: "A", method: "KO", endMs: 9_000 })!;
    expect(plan.impact).toBeNull();
    expect(plan.momentMs).toBe(9_000);
  });

  it("a ring-out centres on the victim going over, with a push just before it in the slow motion", () => {
    const events = [hit(11_700, "B", 9), ringout(12_600, "A")];
    const plan = planReplay(events, { winner: "B", method: "RINGOUT", endMs: 12_600 }, { overEdgeMs: 12_000, landingMs: 12_450 })!;
    expect(plan.kind).toBe("RINGOUT");
    expect([plan.attacker, plan.victim]).toEqual(["B", "A"]);
    expect(plan.momentMs).toBe(12_000);
    expect(plan.impact?.t).toBe(11_700);
    expect(plan.coreFromMs).toBe(11_600);
    expect(replayRateAt(plan, 11_700)).toBeCloseTo(REPLAY_RATES.core);
    // The splash is in the window (the cap may trim what follows it).
    expect(plan.landingMs).toBe(12_450);
    expect(plan.toMs).toBeGreaterThanOrEqual(12_550);
  });

  it("a ring-out with the push long before keeps its slow motion on the fall", () => {
    const events = [hit(11_000, "B", 9), ringout(12_600, "A")];
    const plan = planReplay(events, { winner: "B", method: "RINGOUT", endMs: 12_600 }, { overEdgeMs: 12_000 })!;
    expect(plan.coreFromMs).toBe(11_850);
    expect(replayRateAt(plan, 11_000)).toBe(REPLAY_RATES.lead);
  });

  it("a ring-out without a scan goes back from the ring-out call", () => {
    const plan = planReplay([ringout(12_600, "A")], { winner: "B", method: "RINGOUT", endMs: 12_600 })!;
    expect(plan.momentMs).toBe(12_350);
    expect(plan.impact).toBeNull();
  });

  it("a decision replays the winner's biggest hit (a big one wins a tie)", () => {
    const events = [hit(2_000, "A", 18), hit(4_000, "B", 40, true), thrown(6_000, "A", 22), hit(8_000, "A", 22, true), hit(10_000, "A", 10)];
    const plan = planReplay(events, { winner: "A", method: "DECISION", endMs: 30_000 })!;
    expect(plan.kind).toBe("HIT");
    expect(plan.label).toBe("BIGGEST HIT");
    expect(plan.impact?.t).toBe(8_000);
    expect(plan.attacker).toBe("A");
  });

  it("a decision the winner never landed a hit in replays the loser's biggest", () => {
    const plan = planReplay([hit(4_000, "B", 12), hit(5_000, "B", 16)], { winner: "A", method: "DECISION", endMs: 30_000 })!;
    expect(plan.impact?.t).toBe(5_000);
    expect([plan.attacker, plan.victim]).toEqual(["B", "A"]);
  });

  it("sudden death replays the winning hit", () => {
    const events = [hit(8_000, "A", 30, true), hit(31_200, "A", 6)];
    const plan = planReplay(events, { winner: "A", method: "SUDDEN_DEATH", endMs: 31_200 })!;
    expect(plan.label).toBe("THE WINNING HIT");
    expect(plan.impact?.t).toBe(31_200);
  });

  it("nothing to replay without a single hit", () => {
    expect(planReplay([], { winner: "A", method: "DECISION", endMs: 30_000 })).toBeNull();
  });

  it("plays from full speed into 0.3x and back, smoothly, in about three seconds", () => {
    const plan = planReplay([hit(9_000, "A", 12), ko(9_000, "B")], { winner: "A", method: "KO", endMs: 9_000 })!;
    expect(plan.realMs).toBeGreaterThan(2_300);
    expect(plan.realMs).toBeLessThan(3_400);
    expect(replaySimAt(plan, 0)).toBe(plan.fromMs);
    expect(replaySimAt(plan, plan.realMs)).toBeCloseTo(plan.toMs, 3);
    let previous = -Infinity;
    for (let real = 0; real <= plan.realMs; real += 10) {
      const sim = replaySimAt(plan, real);
      expect(sim).toBeGreaterThanOrEqual(previous);
      // The shown rate matches the plan's: no jumps at the segment joins.
      if (previous > -Infinity) expect((sim - previous) / 10).toBeLessThan(replayRateAt(plan, sim) + 0.02);
      previous = sim;
    }
    // The slow part takes the most screen time: 380 sim ms at 0.3x.
    expect(realAt(plan, plan.coreToMs) - realAt(plan, plan.coreFromMs)).toBeCloseTo(380 / REPLAY_RATES.core, 0);
  });

  it("never runs longer than its cap, however long the fall", () => {
    const events = [hit(11_650, "B", 9), ringout(12_600, "A")];
    const plan = planReplay(events, { winner: "B", method: "RINGOUT", endMs: 12_600 }, { overEdgeMs: 12_000, landingMs: 12_900 })!;
    expect(plan.realMs).toBeLessThanOrEqual(REPLAY_MAX_REAL_MS + 1);
    expect(plan.coreFromMs - plan.fromMs).toBeGreaterThanOrEqual(250 + 150);
  });

  it("films from the room's side, off the attacker's back for a hit and nearly side-on for a ring-out", () => {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const victim: [number, number] = [Math.cos(angle), Math.sin(angle)];
      for (const kind of ["HIT", "RINGOUT"] as const) {
        const [x, z] = replayFrom([0, 0], victim, kind);
        expect(Math.hypot(x, z)).toBeCloseTo(1);
        expect(z).toBeGreaterThan(-0.21);
      }
    }
    // A attacks along +x: side-on is +z; a hit swings toward A's back (-x).
    const [hx, hz] = replayFrom([0, 0], [1, 0], "HIT");
    expect(hx).toBeLessThan(-0.5);
    expect(hz).toBeGreaterThan(0.5);
    const [rx, rz] = replayFrom([0, 0], [1, 0], "RINGOUT");
    expect(Math.abs(rx)).toBeLessThan(0.4);
    expect(rz).toBeGreaterThan(0.9);
  });
});
