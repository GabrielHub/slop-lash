import { describe, expect, it } from "vite-plus/test";
import { Vector3 } from "three";
import { findFixture } from "@/dev/fixtures";
import { STAGE_PHASES } from "../stage-input";
import { crowdMurmurs, PHASE_MUSIC } from "./beds";
import { BOARD_DONE_S, boardColumns, boardPoints, boardRowIndex, boardRows, recordText, shelfSpots, standingsLeader } from "./board";
import { visibleSpan } from "./board-visibility";
import { clearShift, overlapArea } from "./clearance";
import { doodleFromChampion, hashString, LAB_ROW_STROKES, revealStrokes, sampleFor, sampleStream, syntheticDoneAt, syntheticPartial, SYNTH_FIRST_PART_MS } from "./dev-feed";
import { pedestalCast, popInterval, POP_RATE, POP_RATE_BURST, SETTLED_AFTER_MS, settledForgeAtMount } from "./forge-plan";
import { buildSceneData, fighterLabel, fighterPoints, needsSynthetic, podiumFighters, standingsRows, type SceneData, type SceneFighter } from "./scene-data";
import { ROSTER_SECONDS } from "../../constants";
import { HOP_DOWN_S, pedestalWalk, rosterSchedule, walkDuration, walkPose } from "./walk";

function sceneData(fixture: string): SceneData {
  const view = findFixture(fixture)?.view;
  if (!view) throw new Error(`no fixture ${fixture}`);
  const data = buildSceneData(view, { strokes: null, foundry: null, synthetic: null });
  if (!data) throw new Error("not a SlopFight view");
  return data;
}

describe("dev feed", () => {
  it("is deterministic per key", () => {
    expect(hashString("fighter-1")).toBe(hashString("fighter-1"));
    expect(sampleFor("fighter-1").champion.name).toBe(sampleFor("fighter-1").champion.name);
  });

  it("grows a synthetic forge after the thinking pause, one part at a time, to the whole sheet", () => {
    const champion = sampleFor("x").champion;
    const start = 1_000_000;
    expect(syntheticPartial(champion, start, start + SYNTH_FIRST_PART_MS - 100)).toHaveLength(0);
    const early = syntheticPartial(champion, start, start + SYNTH_FIRST_PART_MS + 300).length;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(champion.parts.length);
    const done = syntheticDoneAt(champion, start);
    expect(syntheticPartial(champion, start, done + 10)).toHaveLength(champion.parts.length);
  });

  it("draws a doodle from a sheet and streams it in whole rows of whole strokes", () => {
    const strokes = doodleFromChampion(sampleFor("y").champion, 3);
    expect(strokes.length).toBeGreaterThan(LAB_ROW_STROKES * 2);
    expect(revealStrokes(strokes, 0)).toHaveLength(0);
    expect(revealStrokes(strokes, 1)).toHaveLength(strokes.length);
    const half = revealStrokes(strokes, 0.6);
    expect(half.length).toBeGreaterThan(0);
    expect(half.length).toBeLessThan(strokes.length);
    expect(half.length % LAB_ROW_STROKES).toBe(0);
    // Strokes are never cut part-way: a streamed row is final.
    half.forEach((stroke, index) => expect(stroke).toBe(strokes[index]));
  });
});

describe("scene data", () => {
  it("lists fighters in slot order with owner names and house champions", () => {
    const data = sceneData("slopfight-roster");
    expect(data.fighters.map((fighter) => fighter.slot)).toEqual(data.fighters.map((fighter) => fighter.slot).sort((a, b) => a - b));
    for (const fighter of data.fighters) {
      expect(fighter.house).toBe(fighter.ownerId === null);
      if (!fighter.house) expect(fighter.ownerName).toBeTruthy();
      expect(fighterLabel(fighter)).toBeTruthy();
    }
  });

  it("gives owners their room score as points and house champions none", () => {
    const data = sceneData("slopfight-standings");
    for (const fighter of data.fighters) {
      const points = fighterPoints(fighter, data.players);
      if (fighter.house) expect(points).toBeNull();
      else expect(points).toBe(data.players.find((player) => player.id === fighter.ownerId)?.score ?? 0);
    }
  });

  it("grows forging fighters from an injected synthetic stream only", () => {
    const view = findFixture("slopfight-build-forging")!.view;
    const forging = (data: SceneData | null) => data!.fighters.filter((fighter) => fighter.status === "FORGING");
    const without = buildSceneData(view, { strokes: null, foundry: null, synthetic: null });
    expect(forging(without).length).toBeGreaterThan(0);
    for (const fighter of forging(without)) {
      expect(fighter.partial).toHaveLength(0);
      expect(fighter.synthetic).toBe(false);
    }
    const late = buildSceneData(view, { strokes: null, foundry: null, synthetic: sampleStream(Date.now() + 3_600_000) });
    for (const fighter of forging(late)) {
      expect(fighter.synthetic).toBe(true);
      expect(fighter.partial).toEqual(sampleFor(fighter.id).champion.parts);
    }
  });

  it("only needs a synthetic stream while something forges without a feed", () => {
    const forging = findFixture("slopfight-build-forging")!.view;
    const roster = findFixture("slopfight-roster")!.view;
    expect(needsSynthetic(forging, null)).toBe(true);
    expect(needsSynthetic(forging, [])).toBe(false);
    expect(needsSynthetic(roster, null)).toBe(false);
  });

  it("reads the podium winner first", () => {
    const data = sceneData("slopfight-finished");
    const placed = podiumFighters(data);
    expect(placed.length).toBeGreaterThanOrEqual(3);
    expect(placed[0]?.id).toBe(data.mode.podium?.[0]);
  });
});

describe("the standings board", () => {
  it("ranks by the view's standings and starts each row where it stood before the round", () => {
    const data = sceneData("slopfight-standings");
    const rows = boardRows(data, data.round);
    expect(rows.map((row) => row.fighter.id)).toEqual(standingsRows(data).map((row) => row.fighter.id));
    // Every old place is used once.
    expect(rows.map((row) => row.from).sort((a, b) => a - b)).toEqual(rows.map((_, index) => index));
    for (const row of rows) {
      if (row.points === null) continue;
      expect(row.pointsBefore).not.toBeNull();
      expect(row.pointsBefore!).toBeLessThanOrEqual(row.points);
    }
  });

  it("slides and counts to the final state", () => {
    const data = sceneData("slopfight-standings");
    const rows = boardRows(data, data.round);
    rows.forEach((row, index) => {
      expect(boardRowIndex(row, index, 0)).toBe(row.from);
      expect(boardRowIndex(row, index, BOARD_DONE_S)).toBeCloseTo(index, 5);
      expect(boardPoints(row, index, 0)).toBe(row.pointsBefore);
      expect(boardPoints(row, index, BOARD_DONE_S)).toBe(row.points);
    });
  });

  it("keeps the columns and the figurines inside the part of the board the shot sees", () => {
    const xs = [-2, -1, 0, 1, 2];
    const full = { left: -2.5, right: 2.5 };
    expect(visibleSpan(xs, [true, true, true, true, true], full)).toEqual(full);
    // A prop over the right end: the span stops at the last column it can see.
    expect(visibleSpan(xs, [true, true, true, false, false], full)).toEqual({ left: -2.5, right: 0 });
    // The longest run wins; nothing visible leaves the caller the full board.
    expect(visibleSpan(xs, [true, false, true, true, false], full)).toEqual({ left: 0, right: 1 });
    expect(visibleSpan(xs, [false, false, false, false, false], full)).toBeNull();

    const W = 5;
    const wide = boardColumns(W, 0.1, full);
    expect(wide.left).toBe(-2.5);
    expect(wide.points).toBeCloseTo(2.5 - 0.16, 5);
    const cut = boardColumns(W, 0.1, { left: -2.5, right: 1 });
    expect(cut.points).toBeCloseTo(1 - 0.16, 5);
    expect(cut.record).toBeLessThan(cut.points);
    expect(cut.record).toBeGreaterThan(cut.left);

    const spots = shelfSpots({ left: -2.5, right: 1 }, 4);
    expect(spots).toHaveLength(4);
    expect(spots[0]!).toBeGreaterThan(-2.5);
    expect(spots[3]!).toBeLessThan(1);
    expect(shelfSpots(full, 4).reduce((sum, x) => sum + x, 0)).toBeCloseTo(0, 5);
  });

  it("names a clear leader and calls a tie", () => {
    const champion = (name: string) => ({ champion: { name } }) as unknown as SceneFighter;
    expect(standingsLeader([{ fighter: champion("A"), wins: 2, losses: 0 }, { fighter: champion("B"), wins: 1, losses: 1 }])).toBe("A");
    expect(standingsLeader([{ fighter: champion("A"), wins: 1, losses: 0 }, { fighter: champion("B"), wins: 1, losses: 0 }])).toBeNull();
    expect(recordText({ wins: 2, losses: 1 })).toBe("2-1");
  });
});

describe("podium cards", () => {
  const rect = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
  const frame = rect(-1, -1, 1, 1);

  it("measures overlap", () => {
    expect(overlapArea(rect(0, 0, 1, 1), rect(0.5, 0.5, 2, 2))).toBeCloseTo(0.25, 5);
    expect(overlapArea(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toBe(0);
  });

  it("slides a card outward just far enough to clear the marquee, staying in frame", () => {
    const marquee = rect(-0.4, 0.4, 0.4, 0.6);
    const card = (shift: number) => rect(-0.6 - shift, 0.3, -0.2 - shift, 0.5);
    const shifts = [0, 0.1, 0.2, 0.3];
    expect(clearShift(shifts, card, [marquee], frame)).toBe(0.2);
    expect(clearShift(shifts, card, [], frame)).toBe(0);
    // Nothing clears: the least overlap, never off the frame.
    const wide = rect(-1, 0.4, 1, 0.6);
    expect(clearShift(shifts, card, [wide], frame)).toBe(0);
  });
});

describe("walk-ons", () => {
  const path = pedestalWalk([7.5, 0.75, -2.75], [-2.25, 0, -0.4], 0.2);

  it("hops off the pedestal toward the mark, walks there and turns to the room", () => {
    const out = new Vector3();
    walkPose(path, 0, out);
    expect(out.toArray()).toEqual([7.5, 0.75, -2.75]);
    walkPose(path, HOP_DOWN_S / 2, out);
    expect(out.y).toBeGreaterThan(0.3);
    expect(out.x).toBeLessThan(7.5);
    const total = walkDuration(path);
    const end = walkPose(path, total + 2, out);
    expect(out.x).toBeCloseTo(-2.25, 5);
    expect(out.y).toBe(0);
    expect(end.arrived).toBe(true);
    expect(end.yaw).toBeCloseTo(0.2, 5);
  });

  it("walks all four out together, a step apart, with every card up well before the face-off", () => {
    const durations = [0, 1, 2, 3].map((slot) => walkDuration(pedestalWalk([7.5, 0.75, [-2.75, -0.92, 0.92, 2.75][slot]!], [-2.25 + 1.5 * slot, 0, -0.4], 0)));
    const beats = rosterSchedule(durations);
    expect(beats).toHaveLength(4);
    beats.forEach((beat, index) => {
      expect(beat.arrive - beat.start).toBeCloseTo(durations[index]!);
      expect(beat.cardAt).toBeLessThan(beat.arrive);
      // Together: each sets off before the one ahead arrives.
      if (index > 0) expect(beat.start).toBeLessThan(beats[index - 1]!.arrive);
    });
    // The whole line-up is on its marks with its cards up, with seconds left to read them.
    expect(Math.max(...beats.map((beat) => beat.arrive))).toBeLessThan(ROSTER_SECONDS - 3);
  });
});

describe("forge rules", () => {
  it("pops parts at the normal cadence, faster for a burst", () => {
    expect(popInterval(1)).toBeCloseTo(1 / POP_RATE);
    expect(popInterval(12)).toBeCloseTo(1 / POP_RATE_BURST);
  });

  it("shows the old champion beside the new one during an upgrade", () => {
    const data = sceneData("slopfight-upgrade-forging");
    const forging = data.fighters.find((fighter) => fighter.status === "FORGING");
    expect(forging).toBeTruthy();
    const cast = pedestalCast(forging!, "UPGRADE", data.round);
    expect(cast.forging).toBe(true);
    expect(cast.current).toBeNull();
    expect(cast.old).toBe(forging!.champion);
    const ready = sceneData("slopfight-roster").fighters[0]!;
    expect(pedestalCast(ready, "BUILD", 1)).toEqual({ forging: false, old: null, current: ready.champion });
  });

  it("settles only the forge that was done at mount, so an upgrade still plays its reveal", () => {
    // E2E regression: a pedestal mounted in UPGRADE with the round-1 champion
    // settled kept `settled` for the new forge, so the upgraded champion vanished
    // at READY and its name card never dropped.
    const now = 100_000;
    const oldForge = settledForgeAtMount("f1:1:1000", { hasChampion: true, celebrated: false, startedAt: 1_000, now });
    expect(oldForge).toBe("f1:1:1000");
    const upgradeKey = "f1:2:99000";
    expect(oldForge === upgradeKey).toBe(false);
    // A fresh forge, a celebrated one, and nothing finished yet.
    expect(settledForgeAtMount("k", { hasChampion: true, celebrated: false, startedAt: now - SETTLED_AFTER_MS + 1, now })).toBeNull();
    expect(settledForgeAtMount("k", { hasChampion: true, celebrated: true, startedAt: now, now })).toBe("k");
    expect(settledForgeAtMount("k", { hasChampion: false, celebrated: true, startedAt: 0, now })).toBeNull();
  });
});

describe("sound beds", () => {
  it("has a music family (or the crowd) for every phase", () => {
    for (const phase of STAGE_PHASES) {
      expect(PHASE_MUSIC[phase] !== null || crowdMurmurs(phase)).toBe(true);
    }
    expect(PHASE_MUSIC.FIGHT).toBe("fight");
    expect(PHASE_MUSIC.FINISHED).toBe("result");
  });
});
