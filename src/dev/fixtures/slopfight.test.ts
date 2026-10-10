import { describe, expect, it } from "vite-plus/test";
import { betPoints, isFinish, scoreFight, winPoints } from "@/games/slopfight/scoring";
import { finalRound, qualifierPairings } from "@/games/slopfight/tournament";
import type { RoomView } from "@/room/context";
import { slopfightFixtureData, slopfightFixtures } from "./slopfight";

const fixture = (id: string) => {
  const found = slopfightFixtures.find((candidate) => candidate.id === `slopfight-${id}`);
  if (!found) throw new Error(`No fixture slopfight-${id}`);
  return found.view;
};

function mode(view: RoomView) {
  if (view.mode.kind !== "SLOPFIGHT") throw new Error("Not a SlopFight view");
  return view.mode;
}

const scores = (view: RoomView) =>
  Object.fromEntries(view.players.map((player) => [player.name, player.score]));

const { night, players } = slopfightFixtureData;

describe("SlopFight fixtures", () => {
  it("ids are unique and every phase is covered", () => {
    const ids = slopfightFixtures.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const phases = new Set(slopfightFixtures.map((entry) => entry.view.room.phase));
    for (const phase of ["LOBBY", "BUILD", "FOUNDRY", "ROSTER", "FACE_OFF", "FIGHT", "RESULT", "STANDINGS", "UPGRADE", "FINISHED"]) {
      expect(phases, phase).toContain(phase);
    }
  });

  it("the night's bracket follows the tournament module", () => {
    const [round1, round2] = qualifierPairings(2);
    const pairs = (round: number) =>
      night.bouts.filter((bout) => bout.round === round).map((bout) => ({ a: bout.a, b: bout.b }));
    expect(pairs(1)).toEqual(round1);
    expect(pairs(2)).toEqual(round2);
    // Round 3 comes from the seeding after the qualifiers: third place, then the Final.
    const after = slopfightFixtureData.playNight({ phase: "STANDINGS", round: 2 });
    const seeded = finalRound(
      after.mode.fighters.map((fighter) => ({ id: fighter.slot, slot: fighter.slot, record: fighter.record })),
      0x51a7f19,
    );
    expect(pairs(3)).toEqual([seeded.thirdPlace, seeded.final]);
  });

  it("every scored fight pays what scoring.ts says", () => {
    const { scored } = slopfightFixtureData.playNight({ phase: "FINISHED" });
    expect(scored).toHaveLength(6);
    for (const { fight, bout } of scored) {
      const owners = { A: night.owners[bout.a]?.id ?? null, B: night.owners[bout.b]?.id ?? null };
      expect(fight.awards).toEqual(
        scoreFight({
          isFinal: fight.isFinal,
          winner: fight.outcome!.winner,
          method: fight.outcome!.method,
          owners,
          bets: bout.bets.map(([player, side]) => ({ playerId: player.id, side })),
        }),
      );
    }
  });

  it("results pay what their labels say", () => {
    // KO, Jo's own champion, and Jo bet on it: win + finish + bet.
    const ko = mode(fixture("result-ko")).fights.find((fight) => fight.round === 1 && fight.step === 0)!;
    expect(ko.outcome?.method).toBe("KO");
    expect(ko.awards?.filter((award) => award.playerId === players.jo.id).map((award) => award.points)).toEqual([
      winPoints(false),
      100,
      betPoints(false),
    ]);
    const ringout = mode(fixture("result-ringout")).fights.find((fight) => fight.round === 1 && fight.step === 1)!;
    expect(ringout.outcome?.method).toBe("RINGOUT");
    expect(isFinish(ringout.outcome!.method)).toBe(true);
    expect(ringout.awards?.some((award) => award.playerId === players.priya.id)).toBe(false);
    expect(mode(fixture("result-decision")).fights.find((fight) => fight.round === 2 && fight.step === 0)?.outcome?.method).toBe(
      "DECISION",
    );
    expect(mode(fixture("result-seed")).fights.find((fight) => fight.round === 2 && fight.step === 0)?.decidedBySeed).toBe(true);
  });

  it("scores: 500/0 after round 1, 1,400/700 at the end", () => {
    expect(scores(fixture("standings"))).toEqual({ Jo: 500, Priya: 0 });
    expect(scores(fixture("final-result"))).toEqual({ Jo: 1400, Priya: 700 });
    expect(scores(fixture("finished"))).toEqual({ Jo: 1400, Priya: 700 });
  });

  it("the podium puts Larry first and the house shark second", () => {
    const view = mode(fixture("finished"));
    const names = view.podium?.map((id) => view.fighters.find((fighter) => fighter.id === id)?.champion?.name);
    expect(names).toEqual(["Larry Unbound", "Gary the Land Shark", "Jelly Supreme", "Sir Toastington"]);
  });

  it("health timelines end on the outcome's health", () => {
    for (const { fight } of slopfightFixtureData.playNight({ phase: "FINISHED" }).scored) {
      const outcome = fight.outcome!;
      const last = outcome.healthTimeline.at(-1)!;
      expect(last).toEqual([outcome.endMs, outcome.health.A, outcome.health.B]);
      const loser = outcome.winner === "A" ? "B" : "A";
      if (outcome.method === "KO") expect(outcome.health[loser]).toBe(0);
      const times = outcome.healthTimeline.map((sample) => sample[0]!);
      expect(times).toEqual(times.toSorted((a, b) => a - b));
    }
  });

  it("a fight's outcome is hidden until FIGHT and bets are hidden until its face-off", () => {
    const faceOff = mode(fixture("face-off-my-bet"));
    const current = faceOff.fights.find((fight) => fight.id === faceOff.currentFightId)!;
    expect(current.outcome).toBeNull();
    expect(current.mine).toBe("B");
    const later = faceOff.fights.filter((fight) => fight.round === 1 && fight.step > current.step);
    expect(later).toEqual([]);
    expect(mode(fixture("fight")).fights.find((fight) => fight.id === mode(fixture("fight")).currentFightId)?.outcome).not.toBeNull();
  });
});
