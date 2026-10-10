/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import {
  betAll,
  describeAll,
  fightRoom,
  fighters,
  fights,
  hostNext,
  kit,
  mock,
  phase,
  playFight,
  playRound,
  pump,
  scores,
  sf,
  start,
  throughBuild,
} from "./backend.test-harness";
import { describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { heartbeat, runFor, setup, view } from "../test.harness";
import { DRAWN_REVEAL_HOLD_MS, REVEAL_HOLD_MS } from "./data";

describe("start and Build", () => {
  test("a room starts in BUILD with arenas, four fighters and round-1 fights", async () => {
    const t = setup();
    await expect(
      t.action(api.rooms.create, {
        gameType: "SLOPFIGHT",
        hostSecret: "secret",
        hostName: "Host",
        aiModelIds: ["anthropic/claude-haiku-5.5"],
      }),
    ).rejects.toThrow(/does not have AI players/);

    const room = await fightRoom(t, 2, { timers: true });
    const lobbyView = await view(t, room.host);
    expect(lobbyView.room.minPlayers).toBe(2);
    expect(lobbyView.room.maxPlayers).toBe(4);
    const lobby = await sf(room);
    expect(lobby.fighters).toEqual([]);
    expect(lobby.arenas).toEqual([]);
    await start(room);
    const build = await view(t, room.host);
    expect(build.room.phase).toBe("BUILD");
    expect(build.room.phaseDeadline).not.toBeNull();
    const mode = await sf(room);
    expect(mode.arenas).toHaveLength(3);
    expect(new Set(mode.arenas).size).toBe(3);
    expect(mode.fighters.map((fighter) => fighter.ownerId === null)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(mode.myFighterId).toBe(mode.fighters[0]!.id);
    // Two humans: A-X and B-Y in round 1, in the first arena, at 30 s each.
    expect(mode.fights.map((fight) => [fight.a, fight.b])).toEqual([
      [mode.fighters[0]!.id, mode.fighters[2]!.id],
      [mode.fighters[1]!.id, mode.fighters[3]!.id],
    ]);
    expect(mode.fights.every((fight) => fight.arena === mode.arenas[0])).toBe(true);
    expect(mode.fights.every((fight) => fight.limitMs === 30_000)).toBe(true);
    // Bets close before seeds and outcomes go out.
    expect(mode.fights.every((fight) => fight.seed === null && fight.outcome === null)).toBe(true);
  });

  test("the house champions are invented and forged live during BUILD", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    const house = (await fighters(room)).filter((fighter) => fighter.ownerId === null);
    expect(house.map((fighter) => fighter.status)).toEqual(["READY", "READY"]);
    expect(house.map((fighter) => fighter.text)).toEqual(["House champion 1", "House champion 2"]);
    expect(mock.forges.filter((call) => call.mode === "house")).toHaveLength(2);
    expect((await phase(room)).phase).toBe("BUILD");
  });

  test("BUILD moves to ROSTER once every champion is forged, with the streamed parts cleared", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: room.host,
      kind: "DESCRIBE",
      text: "a raccoon <b>with</b> a jetpack",
    });
    // Before the action runs, the fighter is forging.
    expect((await fighters(room))[0]!.status).toBe("FORGING");
    await pump(room);
    const [mine] = await fighters(room);
    expect(mine!.status).toBe("READY");
    expect(mine!.text).toBe("a raccoon with a jetpack");
    expect(mine!.partial).toBeUndefined();
    expect((await phase(room)).phase).toBe("BUILD");
    await describeAll(room, [room.caps[1]!]);
    await pump(room);
    expect((await phase(room)).phase).toBe("ROSTER");
    const aiCalls = await room.t.run((ctx) =>
      ctx.db
        .query("aiCalls")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.gameId))
        .take(50),
    );
    // Four forges and the house call, each recorded.
    expect(aiCalls.filter((call) => call.task === "slopfight.forge")).toHaveLength(4);
    expect(aiCalls.some((call) => call.task === "slopfight.house")).toBe(true);
  });

  test("BUILD holds for the last champion's reveal (longer for a drawing), then moves on by itself", async () => {
    // E2E regression: BUILD settled the instant the last forge landed, so the
    // stage cut away before that champion's parts, name card and sketch dissolve played.
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.caps[1]!,
      layer: 0,
      seq: 0,
      strokes: [{ c: 1, w: 1, p: [100, 100, 800, 800] }],
    });
    await describeAll(room, [room.host]);
    await pump(room, 3_000);
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: room.caps[1]!,
      kind: "DRAW",
    });
    await pump(room, 1_000);
    const landed = await fighters(room);
    expect(landed.every((fighter) => fighter.status === "READY")).toBe(true);
    const drawn = landed[1]!;
    expect(drawn.readyAt).toBeTypeOf("number");
    // Past a described champion's hold, still inside the drawing's.
    await pump(room, REVEAL_HOLD_MS);
    expect((await phase(room)).phase).toBe("BUILD");
    await pump(room, DRAWN_REVEAL_HOLD_MS - REVEAL_HOLD_MS);
    expect((await phase(room)).phase).toBe("ROSTER");
    expect((await phase(room)).phaseStartedAt).toBeGreaterThanOrEqual(
      drawn.readyAt! + DRAWN_REVEAL_HOLD_MS,
    );
  });

  test("a drawing is rasterized from the stored strokes; a blank canvas is rejected without a call", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: room.host,
      kind: "DRAW",
    });
    let [mine] = await fighters(room);
    expect(mine!.status).toBe("REJECTED");
    expect(mock.forges.filter((call) => call.mode === "submit")).toHaveLength(0);

    const stroke = { c: 0, w: 1, p: [100, 100, 500, 500, 900, 120] };
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.host,
      layer: 0,
      seq: 0,
      strokes: [stroke, { ...stroke, p: [100, 900, 900, 900] }],
    });
    // A retried batch is a no-op.
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.host,
      layer: 0,
      seq: 0,
      strokes: [stroke],
    });
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.host,
      layer: 0,
      seq: 1,
      strokes: [{ ...stroke, c: 3 }],
    });
    await room.t.mutation(api.slopfight.play.undoStroke, { capability: room.host, layer: 0 });
    const easel = await room.t.query(api.slopfight.stage.strokes, { roomCode: room.code });
    expect(easel.map((row) => [row.seq, row.strokes.length])).toEqual([[0, 2]]);
    await expect(
      room.t.mutation(api.slopfight.play.addStrokes, {
        capability: room.host,
        layer: 0,
        seq: 2,
        strokes: [{ c: 9, w: 1, p: [1, 2] }],
      }),
    ).rejects.toThrow(/canvas/);

    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: room.host,
      kind: "DRAW",
    });
    await pump(room);
    [mine] = await fighters(room);
    expect(mine!.status).toBe("READY");
    const submit = mock.forges.find((call) => call.mode === "submit")!;
    expect(submit.png).toBeInstanceOf(Uint8Array);
    expect(submit.text).toBeUndefined();
    // The room view never carries strokes or streamed parts while playing.
    const mode = await sf(room);
    expect(mode.doodles).toBeNull();
    expect(JSON.stringify(mode)).not.toContain('"partial"');
  });

  test("a rejection shows only to its owner, and the retry forges", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    mock.forge = () => ({ ok: true, result: kit.rejectResult(), calls: [] });
    await describeAll(room, [room.host]);
    await pump(room);
    const mine = (await sf(room)).fighters[0]!;
    expect(mine.status).toBe("REJECTED");
    expect(mine.rejection?.reason).toBe("That looks like a real person.");
    expect((await sf(room, room.caps[1])).fighters[0]!.rejection).toBeNull();
    expect((await room.t.query(api.views.watch, { roomCode: room.code })).mode).toMatchObject({
      fighters: [{ rejection: null }, {}, {}, {}],
    });

    mock.forge = null;
    await describeAll(room, [room.host]);
    await pump(room);
    expect((await fighters(room))[0]!.status).toBe("READY");
  });

  test("a stale forge token is ignored when a newer submit supersedes it", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    let release: (() => void) | null = null;
    mock.forge = (options) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            ok: true,
            result: kit.forgeResult(kit.sampleChampion(`late ${options.text?.slice(0, 4)}`)),
            calls: [kit.aiCall("anthropic/claude-haiku-5.5")],
          });
      });
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: room.host,
      kind: "DESCRIBE",
      text: "first idea",
    });
    const first = (await fighters(room))[0]!;
    // Land a result for the first token after a newer submit took over.
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: room.host,
      kind: "DESCRIBE",
      text: "second idea",
    });
    await room.t.mutation(internal.slopfight.forgeData.applyForge, {
      fighterId: first._id,
      forgeToken: first.forgeToken,
      outcome: { kind: "FORGE", champion: kit.sampleChampion("Stale") },
      calls: [kit.aiCall("anthropic/claude-haiku-5.5")],
    });
    const after = (await fighters(room))[0]!;
    expect(after.status).toBe("FORGING");
    expect(after.champion).toBeUndefined();
    expect(after.forgeToken).not.toBe(first.forgeToken);
    // A partial for the old token is ignored too.
    await room.t.mutation(internal.slopfight.forgeData.patchPartial, {
      fighterId: first._id,
      forgeToken: first.forgeToken,
      parts: kit.sampleChampion().parts,
    });
    expect((await fighters(room))[0]!.partial).toBeUndefined();
    void release;
  });

  test("the BUILD deadline forges leniently, waits in FOUNDRY, then opens the roster", async () => {
    const room = await fightRoom(setup(), 2, { timers: true });
    await start(room);
    await pump(room);
    // Ana drew a little and never submitted; the host did nothing at all.
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.caps[1]!,
      layer: 0,
      seq: 0,
      strokes: [{ c: 1, w: 1, p: [100, 100, 800, 800] }],
    });
    await runFor(room.t, 80_000, 1_000);
    await heartbeat(room.t, room.caps);
    // Step until the deadline tick moves BUILD to the Foundry.
    for (let i = 0; i < 200 && (await phase(room)).phase === "BUILD"; i += 1) {
      await room.t.finishInProgressScheduledFunctions();
      vi.advanceTimersByTime(100);
    }
    const foundry = await view(room.t, room.host);
    expect(foundry.room.phase).toBe("FOUNDRY");
    // A watchdog: the deadline exists but no countdown shows.
    expect(foundry.room.phaseDeadline).toBeNull();
    const game = await room.t.run((ctx) => ctx.db.get("games", room.gameId));
    expect(game!.phaseDeadline).toBe(foundry.room.phaseStartedAt + 60_000);
    expect((await sf(room)).foundryParked).toBe(false);
    const forging = (await fighters(room)).slice(0, 2);
    expect(forging.map((fighter) => fighter.forge?.kind)).toEqual(["LENIENT", "LENIENT"]);
    await pump(room);
    expect((await phase(room)).phase).toBe("ROSTER");
    const lenient = mock.forges.filter((call) => call.mode === "lenient");
    expect(lenient).toHaveLength(2);
    // Ana's few strokes become the picture; the host's empty seat gets an invention.
    expect(lenient.filter((call) => call.png)).toHaveLength(1);
    expect(lenient.filter((call) => !call.png && !call.text)).toHaveLength(1);
  });

  test("a forge that fails on both models parks the Foundry until the host retries", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    mock.forge = () => ({ ok: false, failReason: "provider-error", calls: [] });
    await hostNext(room);
    await pump(room);
    expect((await phase(room)).phase).toBe("FOUNDRY");
    const parked = await view(room.t, room.host);
    expect(parked.room.phaseDeadline).toBeNull();
    expect(parked.room.awaitingAi).toBe(false);
    const mode = await sf(room);
    expect(mode.foundryParked).toBe(true);
    expect(mode.fighters.slice(0, 2).map((fighter) => fighter.failure)).toEqual([
      "provider-error",
      "provider-error",
    ]);
    // Only the host can retry.
    await expect(
      room.t.mutation(api.slopfight.play.retryForges, { capability: room.caps[1]! }),
    ).rejects.toThrow(/host/);
    mock.forge = null;
    expect(
      await room.t.mutation(api.slopfight.play.retryForges, { capability: room.host }),
    ).toEqual({ restarted: 2 });
    await pump(room);
    expect((await phase(room)).phase).toBe("ROSTER");
  });

  test("host Next in a parked Foundry is the retry", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    mock.forge = () => ({ ok: false, failReason: "timeout", calls: [] });
    await hostNext(room);
    await pump(room);
    expect((await sf(room)).foundryParked).toBe(true);
    mock.forge = null;
    await hostNext(room);
    expect((await phase(room)).phase).toBe("FOUNDRY");
    await pump(room);
    expect((await phase(room)).phase).toBe("ROSTER");
  });

  test("an absent player never blocks BUILD; their champion is forged leniently and fights", async () => {
    const room = await fightRoom(setup(), 3);
    await start(room);
    await pump(room);
    // Bo leaves; the others keep beating, then submit.
    room.caps = room.caps.slice(0, 2);
    await pump(room, 20_000);
    await pump(room, 20_000);
    expect((await phase(room)).phase).toBe("BUILD");
    await describeAll(room);
    // The last forge settles BUILD without Bo; his champion is forged leniently.
    await pump(room);
    expect((await phase(room)).phase).toBe("ROSTER");
    const bo = (await fighters(room))[2]!;
    expect(bo.status).toBe("READY");
    expect(bo.forge?.kind).toBe("LENIENT");
    expect(mock.forges.some((call) => call.mode === "lenient" && !call.text && !call.png)).toBe(
      true,
    );
    // Bo still fights in round 1 (C-X).
    const round1 = (await fights(room)).filter((fight) => fight.round === 1);
    expect(round1.some((fight) => fight.a === bo._id || fight.b === bo._id)).toBe(true);
  });
});

describe("fights", () => {
  test("FACE_OFF waits for bets, the outcome and its minimum, then FIGHT plays the stored fight", async () => {
    const room = await fightRoom(setup(), 2);
    await throughBuild(room);
    await pump(room);
    const queued = await fights(room);
    expect(
      queued.filter((fight) => fight.round === 1).every((fight) => fight.matchup === "READY"),
    ).toBe(true);
    // The invalid note was dropped, the valid one kept.
    expect(queued[0]!.notes).toEqual([
      { side: "A", modifies: "speed", value: 15, reason: "Sticky feet on a wet floor" },
    ]);
    expect(queued[0]!.walkOn).toEqual(["Here comes A", "Here comes B"]);
    expect(queued.filter((fight) => fight.round === 1).every((fight) => fight.outcome)).toBe(true);

    await hostNext(room);
    expect((await phase(room)).phase).toBe("FACE_OFF");
    const faceOff = await sf(room);
    expect(faceOff.currentFightId).toBe(faceOff.fights[0]!.id);
    // The outcome exists on the server but no client sees it before FIGHT.
    expect(faceOff.fights[0]!.outcome).toBeNull();
    expect(faceOff.fights[0]!.seed).toBeNull();
    expect(faceOff.fights[0]!.applied[0]).toMatchObject({ modifies: "speed", favors: "A" });

    await betAll(room, "B", [room.host]);
    // Changing a bet is allowed until the face-off closes; bets are public.
    await betAll(room, "A", [room.host]);
    const hostId = (await sf(room)).fighters[0]!.ownerId;
    expect((await sf(room, room.caps[1])).fights[0]).toMatchObject({
      bets: { A: [hostId], B: [] },
      mine: null,
    });
    expect((await sf(room)).fights[0]!.mine).toBe("A");
    await pump(room, 9_000);
    // Ana has not bet yet.
    expect((await phase(room)).phase).toBe("FACE_OFF");
    await betAll(room, "A", [room.caps[1]!]);
    expect((await phase(room)).phase).toBe("FIGHT");
    const fight = await sf(room);
    const live = fight.fights[0]!;
    expect(live.outcome?.winner).toBe("A");
    expect(live.seed).toBe(queued[0]!.seed);
    const { phaseStartedAt } = await phase(room);
    expect(live.startsAt).toBe(phaseStartedAt + 1_500);
    const game = await room.t.run((ctx) => ctx.db.get("games", room.gameId));
    expect(game!.phaseDeadline).toBe(phaseStartedAt + 1_500 + 12_000 + 3_500);

    // Non-owners hype; owners can't.
    await expect(
      room.t.mutation(api.slopfight.play.hype, { capability: room.host, count: 5 }),
    ).rejects.toThrow(/Owners/);
    await pump(room, 18_000);
    expect((await phase(room)).phase).toBe("RESULT");
    const result = (await sf(room)).fights[0]!;
    // Host owns A (won by KO): 200 + 100; both bet A: +100 each.
    expect(await scores(room)).toEqual({ Host: 400, Ana: 100 });
    expect(result.awards).toHaveLength(4);
    const recordA = (await fighters(room))[0]!.record;
    expect(recordA).toEqual({ wins: 1, losses: 0, healthLeft: 41 });
    await pump(room);
    expect((await sf(room)).fights[0]!.recapLine).toBe("A bonked B into next week.");
  });

  test("FIGHT waits for a late outcome, then starts over with the real length", async () => {
    const room = await fightRoom(setup(), 2);
    let fail = true;
    mock.sim = (input) => {
      if (fail) throw new Error("rapier exploded");
      return kit.sampleOutcome({ winner: input.seed % 2 === 0 ? "A" : "B", method: "DECISION" });
    };
    await throughBuild(room);
    await pump(room);
    // Both attempts failed: the seed decides fight 0 (and fight 1).
    const decided = await fights(room);
    expect(decided[0]!.outcome?.decidedBySeed).toBe(true);
    expect(decided[0]!.sim.attempt).toBe(2);

    // Fight 1: wipe its outcome to simulate a sim still running when FIGHT opens.
    fail = false;
    await room.t.run(async (ctx) => {
      await ctx.db.patch("slopFightFights", decided[1]!._id, {
        outcome: undefined,
        sim: { status: "RUNNING", attempt: 1 },
      });
    });
    await hostNext(room); // ROSTER → FACE_OFF 0
    await betAll(room);
    // A seed decision has nothing to show: the face-off goes straight to the result.
    await hostNext(room);
    expect((await phase(room)).phase).toBe("RESULT");
    expect((await sf(room)).fights[0]!.decidedBySeed).toBe(true);
    await hostNext(room); // → FACE_OFF 1
    await betAll(room);
    await hostNext(room); // close bets: FIGHT waits on the sim
    expect((await phase(room)).phase).toBe("FIGHT");
    const waiting = await sf(room);
    expect(waiting.fights[1]!.outcome).toBeNull();
    expect(waiting.fights[1]!.startsAt).toBeNull();
    // The sim lands mid-FIGHT.
    await room.t.mutation(internal.slopfight.fightData.storeOutcome, {
      fightId: decided[1]!._id,
      attempt: 1,
      outcome: kit.sampleOutcome({ endMs: 9_000 }),
    });
    const relaunched = await view(room.t, room.host);
    expect(relaunched.room.phase).toBe("FIGHT");
    const fight = (relaunched.mode as Awaited<ReturnType<typeof sf>>).fights[1]!;
    expect(fight.startsAt).toBe(relaunched.room.phaseStartedAt + 1_500);
    await pump(room, 15_000);
    expect((await phase(room)).phase).toBe("RESULT");
  });

  test("timers off: the host paces ROSTER, RESULT and STANDINGS; watchdogs still fire", async () => {
    const room = await fightRoom(setup(), 2);
    await throughBuild(room);
    await pump(room, 30_000);
    expect((await phase(room)).phase).toBe("ROSTER");
    await hostNext(room);
    // Nobody bets and timers are off: the face-off waits for the host.
    await pump(room, 20_000);
    expect((await phase(room)).phase).toBe("FACE_OFF");
    await hostNext(room);
    expect((await phase(room)).phase).toBe("FIGHT");
    // FIGHT is a watchdog: it ends on its own even with timers off.
    await pump(room, 18_000);
    expect((await phase(room)).phase).toBe("RESULT");
    await pump(room, 20_000);
    expect((await phase(room)).phase).toBe("RESULT");
  });
});

describe("a whole game", () => {
  test.each([2, 3, 4])(
    "%i humans: qualifiers, standings, upgrades, seeding, third place then the Final, podium",
    async (humans) => {
      const room = await fightRoom(setup(), humans);
      await throughBuild(room);
      const houseSlots = (await fighters(room)).filter((f) => f.ownerId === null).length;
      expect(houseSlots).toBe(4 - humans);
      await pump(room);

      await playRound(room);
      expect((await phase(room)).phase).toBe("STANDINGS");
      const afterRound1 = await sf(room);
      expect(afterRound1.fights.every((fight) => fight.sheets === null)).toBe(true);
      expect(afterRound1.standings).toHaveLength(4);
      expect(afterRound1.fights.filter((fight) => fight.round === 2)).toHaveLength(2);

      // UPGRADE belongs to round 2; the house upgrades at entry.
      await hostNext(room);
      expect(await phase(room)).toMatchObject({ phase: "UPGRADE", round: 2 });
      await pump(room);
      for (const capability of room.caps) {
        await room.t.mutation(api.slopfight.play.submitUpgrade, {
          capability,
          kind: "DESCRIBE",
          text: "add a jetpack",
        });
      }
      await pump(room);
      expect((await phase(room)).phase).toBe("ROSTER");
      const upgraded = await fighters(room);
      expect(upgraded.every((fighter) => fighter.version === 2)).toBe(true);
      expect(upgraded.every((fighter) => fighter.previous)).toBe(true);
      const upgrades = mock.forges.filter((call) => call.mode === "upgrade");
      expect(upgrades).toHaveLength(4);
      expect(upgrades.every((call) => call.previous)).toBe(true);
      expect(upgrades.filter((call) => call.addition === "add a jetpack")).toHaveLength(humans);
      // The house's additions are picked in code, no call.
      const houseAdditions = upgraded.filter((f) => f.ownerId === null).map((f) => f.addition);
      expect(
        houseAdditions.every((addition) => addition?.round === 2 && addition.text.length > 0),
      ).toBe(true);
      await pump(room);

      await playRound(room);
      expect((await phase(room)).phase).toBe("STANDINGS");
      const seeded = await sf(room);
      expect(seeded.seeding).toHaveLength(4);
      const round3 = seeded.fights.filter((fight) => fight.round === 3);
      expect(round3.map((fight) => [fight.isThirdPlace, fight.isFinal])).toEqual([
        [true, false],
        [false, true],
      ]);
      expect([round3[1]!.a, round3[1]!.b]).toEqual(seeded.seeding!.slice(0, 2));
      expect([round3[0]!.a, round3[0]!.b]).toEqual(seeded.seeding!.slice(2));
      expect(round3.every((fight) => fight.arena === seeded.arenas[2])).toBe(true);

      // Nobody submits this time. The host drew a little on the new layer, so
      // the deadline (host Next) forges that; the others keep their champions with no call.
      await hostNext(room);
      await pump(room);
      await room.t.mutation(api.slopfight.play.addStrokes, {
        capability: room.host,
        layer: 3,
        seq: 0,
        strokes: [{ c: 2, w: 1, p: [400, 100, 600, 100] }],
      });
      const callsBefore = mock.forges.length;
      await hostNext(room);
      expect((await phase(room)).phase).toBe("FOUNDRY");
      await pump(room);
      expect((await phase(room)).phase).toBe("ROSTER");
      const late = mock.forges.slice(callsBefore);
      expect(late).toHaveLength(1);
      expect(late[0]).toMatchObject({ mode: "upgrade" });
      expect(late[0]!.png).toBeInstanceOf(Uint8Array);
      const round3Fighters = await fighters(room);
      expect(
        round3Fighters.every((fighter) => fighter.version === 3 && fighter.status === "READY"),
      ).toBe(true);
      // A kept champion is the same sheet.
      if (humans > 1) {
        const kept = round3Fighters[1]!;
        expect(kept.champion).toEqual(upgraded[1]!.champion);
      }

      const before = await scores(room);
      await hostNext(room);
      await playFight(room);
      await hostNext(room);
      await playFight(room);
      // The Final pays double: owner win 400 (+100 KO) and correct bets 200.
      const finalFight = (await sf(room)).fights.find((fight) => fight.isFinal)!;
      const finalWin = finalFight.awards!.find((award) => award.reason === "WIN");
      if (finalWin) expect(finalWin.points).toBe(400);
      expect(
        finalFight.awards!.filter((award) => award.reason === "BET").every((a) => a.points === 200),
      ).toBe(true);
      await hostNext(room);
      const final = await view(room.t, room.host);
      expect(final.room.status).toBe("FINISHED");
      expect(final.room.phase).toBe("FINAL");
      const podium = (final.mode as Awaited<ReturnType<typeof sf>>).podium!;
      expect(podium).toHaveLength(4);
      expect(podium[0]).toBe(finalFight.a); // A always wins in the mock
      const after = await scores(room);
      expect(Object.values(after).reduce((sum, value) => sum + value, 0)).toBeGreaterThan(
        Object.values(before).reduce((sum, value) => sum + value, 0),
      );
      // The recap carries every fight with its outcome and the doodles.
      const recap = await room.t.query(api.views.recap, { roomCode: room.code });
      expect(recap.kind).toBe("READY");
      if (recap.kind === "READY" && recap.view.mode?.kind === "SLOPFIGHT") {
        expect(recap.view.mode.fights).toHaveLength(6);
        expect(recap.view.mode.fights.every((fight) => fight.outcome)).toBe(true);
        expect(recap.view.mode.doodles!.map((row) => row.layer)).toEqual([3]);
        // Each fight carries the sheets its sim ran: round 1 used the Build champions.
        expect(recap.view.mode.fights.every((fight) => fight.sheets)).toBe(true);
        expect(recap.view.mode.fights[0]!.sheets!.A.name).toBe("A very confident jel");
        expect(recap.view.mode.fights.at(-1)!.sheets!.A.name).not.toBe("A very confident jel");
      }
      // House fights are shorter.
      const all = await fights(room);
      for (const fight of all) {
        const [a, b] = [fight.a, fight.b].map((id) => upgraded.find((f) => f._id === id)!);
        expect(fight.limitMs).toBe(a!.ownerId === null && b!.ownerId === null ? 20_000 : 30_000);
      }
    },
    60_000,
  );

  test("Play again starts a fresh bracket with a new seed and fighters", async () => {
    const room = await fightRoom(setup(), 2);
    await throughBuild(room);
    const first = await room.t.run((ctx) =>
      ctx.db
        .query("slopFightState")
        .withIndex("by_gameId", (index) => index.eq("gameId", room.gameId))
        .unique(),
    );
    await room.t.mutation(api.engine.end, { capability: room.host });
    await room.t.mutation(api.rooms.playAgain, { capability: room.host, gameId: room.gameId });
    await heartbeat(room.t, room.caps);
    const lobby = await view(room.t, room.host);
    expect(lobby.room.gameNumber).toBe(2);
    expect((lobby.mode as Awaited<ReturnType<typeof sf>>).fighters).toEqual([]);
    const next = { ...room, gameId: lobby.room.id as Id<"games"> };
    await start(next);
    const mode = await sf(next);
    expect(mode.fighters).toHaveLength(4);
    expect(mode.fighters.every((fighter) => fighter.status === "EMPTY")).toBe(true);
    const second = await room.t.run((ctx) =>
      ctx.db
        .query("slopFightState")
        .withIndex("by_gameId", (index) => index.eq("gameId", next.gameId))
        .unique(),
    );
    expect(second!.seed).not.toBe(first!.seed);
  });

  test("Free Play can host SlopFight, without the narrator", async () => {
    const t = setup();
    await expect(
      t.action(api.rooms.create, { gameType: "SLOPFIGHT", hostName: "Host", ttsMode: "ON" }),
    ).rejects.toThrow(/narrator/);
    const room = await fightRoom(t, 2, { freePlay: true });
    const lobby = await view(t, room.host);
    expect(lobby.room.freePlay).toBe(true);
    expect(lobby.room.ttsMode).toBe("OFF");
    await throughBuild(room);
  });
});

describe("stage queries", () => {
  test("the Foundry query streams parts while forging and shows no secrets", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    mock.forge = () => ({
      ok: true,
      result: kit.forgeResult(kit.sampleChampion("Grown")),
      calls: [],
    });
    await describeAll(room, [room.host]);
    // The forge action has not run yet: stream two parts as it would.
    const mine = (await fighters(room))[0]!;
    await room.t.mutation(internal.slopfight.forgeData.patchPartial, {
      fighterId: mine._id,
      forgeToken: mine.forgeToken,
      parts: kit.sampleChampion().parts.slice(0, 2),
    });
    // Parts only grow: a shorter, older patch is ignored.
    await room.t.mutation(internal.slopfight.forgeData.patchPartial, {
      fighterId: mine._id,
      forgeToken: mine.forgeToken,
      parts: kit.sampleChampion().parts.slice(0, 1),
    });
    const growing = await room.t.query(api.slopfight.stage.foundry, { roomCode: room.code });
    expect(growing[0]).toMatchObject({ status: "FORGING", champion: null });
    expect(growing[0]!.partial.map((part) => part.id)).toEqual(["torso", "head"]);
    expect(JSON.stringify(growing)).not.toContain("jellyfish");
    await runFor(room.t, 1_000);
    const grown = await room.t.query(api.slopfight.stage.foundry, { roomCode: room.code });
    expect(grown[0]).toMatchObject({ status: "READY", partial: [] });
    expect(grown[0]!.champion?.name).toBe("Grown");
    expect(await room.t.query(api.slopfight.stage.foundry, { roomCode: "ZZZZ" })).toEqual([]);
  });
});
