/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import {
  describeAll,
  fightRoom,
  fighters,
  fights,
  hostNext,
  kit,
  mock,
  phase,
  playRound,
  pump,
  sf,
  start,
  throughBuild,
  type Room,
} from "./backend.test-harness";
import { describe, expect, test, vi } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { runFor, setup, view } from "../test.harness";
import { fightSheets, MAX_FIGHTER_STROKE_ROWS, REVEAL_HOLD_MS } from "./data";
import { slopfightJobHandlers } from "./jobs";
import { forgeOptions, partialBodyPlan } from "./forge";
import { forgePartTarget } from "./view";

/** Stroke rows inserted straight into the table, one stroke each (the worst case for row counts). */
async function insertStrokeRows(
  room: Room,
  fighterId: Id<"slopFightFighters">,
  layer: number,
  count: number,
) {
  await room.t.run(async (ctx) => {
    for (let seq = 0; seq < count; seq += 1) {
      await ctx.db.insert("slopFightStrokes", {
        gameId: room.gameId,
        fighterId,
        layer,
        seq,
        strokes: [{ c: 0, w: 1, p: [seq % 1000, 500] }],
        total: seq + 1,
      });
    }
  });
}

const countBy = <T>(rows: readonly T[], key: (row: T) => string) => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
};

describe("review follow-ups", () => {
  test("the point cap rejects a whole overflowing batch, and undo restores capacity", async () => {
    const room = await fightRoom(setup(), 4);
    await start(room);
    const stroke = {
      c: 0,
      w: 1,
      p: Array.from({ length: 512 }, (_, index) => (index % 2 ? 1000 : 0)),
    };
    const add = (seq: number, count: number) =>
      room.t.mutation(api.slopfight.play.addStrokes, {
        capability: room.host,
        layer: 0,
        seq,
        strokes: Array.from({ length: count }, () => stroke),
      });
    for (let seq = 0; seq < 12; seq += 1) await add(seq, 8);
    await expect(add(12, 8)).rejects.toThrow(/canvas is full/);
    const saved = await room.t.query(api.slopfight.play.myStrokes, { capability: room.host });
    expect(saved.flatMap((row) => row.strokes)).toHaveLength(96);
    await add(12, 4);
    await expect(add(13, 1)).rejects.toThrow(/canvas is full/);
    await room.t.mutation(api.slopfight.play.undoStroke, { capability: room.host, layer: 0 });
    await add(13, 1);
    await room.t.mutation(api.slopfight.play.clearStrokes, { capability: room.host, layer: 0 });
    await add(14, 8);
    expect(
      (await room.t.query(api.slopfight.play.myStrokes, { capability: room.host })).flatMap(
        (row) => row.strokes,
      ),
    ).toHaveLength(8);
  });

  test("stroke sequences cannot bypass the layer cap, while exact retries remain idempotent", async () => {
    const room = await fightRoom(setup(), 4);
    await start(room);
    const add = (seq: number) =>
      room.t.mutation(api.slopfight.play.addStrokes, {
        capability: room.host,
        layer: 0,
        seq,
        strokes: [{ c: 0, w: 1, p: [100, 100, 900, 900] }],
      });
    await add(10);
    await add(10);
    await expect(add(9)).rejects.toThrow(/out of order/);
    await expect(add(Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow(/Bad stroke batch/);
    expect(
      await room.t.query(api.slopfight.play.myStrokes, { capability: room.host }),
    ).toHaveLength(1);
    await add(11);
    await room.t.mutation(api.slopfight.play.undoStroke, { capability: room.host, layer: 0 });
    await add(12);
    const rows = await room.t.query(api.slopfight.play.myStrokes, { capability: room.host });
    expect(rows.map((row) => row.seq)).toEqual([10, 12]);
  });

  test.each(["BUILD", "FOUNDRY"])(
    "the %s deadline preserves a champion reveal that just started",
    async (heldPhase) => {
      const room = await fightRoom(setup(), 4, { timers: true });
      await start(room);
      if (heldPhase === "FOUNDRY") await hostNext(room);
      const build = (await room.t.run((ctx) => ctx.db.get("games", room.gameId)))!;
      const deadline = build.phaseDeadline!;
      vi.setSystemTime(deadline - 100);
      await room.t.run(async (ctx) => {
        for (const fighter of await ctx.db.query("slopFightFighters").collect()) {
          await ctx.db.patch("slopFightFighters", fighter._id, {
            champion: kit.sampleChampion(),
            status: "READY",
            readyAt: Date.now(),
          });
        }
      });
      vi.setSystemTime(deadline);
      await room.t.mutation(internal.engine.tick, {
        gameId: room.gameId,
        phaseGeneration: build.phaseGeneration,
      });
      expect((await phase(room)).phase).toBe("FOUNDRY");
      expect((await sf(room)).foundryParked).toBe(false);
      await runFor(room.t, REVEAL_HOLD_MS);
      expect((await phase(room)).phase).toBe("ROSTER");
    },
  );

  test("a delayed recap and its applied notes use the original fight sheets after an upgrade", async () => {
    const room = await fightRoom(setup(), 4);
    await throughBuild(room);
    await pump(room);
    const fight = (await fights(room))[0]!;
    const original = (await sf(room)).fights[0]!;
    const recapInput = await room.t.run(async (ctx) => {
      const game = (await ctx.db.get("games", room.gameId))!;
      await ctx.db.patch("slopFightFighters", fight.a, {
        champion: {
          ...kit.sampleChampion("Different upgraded champion"),
          traits: ["tiny", "sleepy"],
        },
      });
      const jobId = await ctx.db.insert("generationJobs", {
        gameId: game._id,
        kind: "SLOPFIGHT_RECAP",
        key: "delayed-recap",
        phaseGeneration: game.phaseGeneration,
        phaseBound: false,
        status: "QUEUED",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        payload: { fightId: fight._id },
      });
      const job = (await ctx.db.get("generationJobs", jobId))!;
      return slopfightJobHandlers.SLOPFIGHT_RECAP.prepare(ctx, game, job);
    });
    // The sheets the sim froze live on the fight's replay row, not the fight row.
    const frozen = await room.t.run((ctx) => fightSheets(ctx, fight));
    expect(fight.sheets).toBeUndefined();
    expect(recapInput?.a.name).toBe(frozen!.A.name);
    expect(recapInput?.a.name).not.toBe("Different upgraded champion");
    expect((await sf(room)).fights[0]!.applied).toEqual(original.applied);
  });

  test("the host retry runs only in the Foundry; elsewhere it is a no-op", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    // A forge that fails on both models during BUILD: the player's to resubmit.
    mock.forge = () => ({ ok: false, failReason: "provider-error", calls: [] });
    await describeAll(room, [room.host]);
    await pump(room);
    expect((await fighters(room))[0]!.status).toBe("FAILED");
    const forgesBefore = mock.forges.length;
    await expect(
      room.t.mutation(api.slopfight.play.retryForges, { capability: room.caps[1]! }),
    ).rejects.toThrow(/host/);
    expect(
      await room.t.mutation(api.slopfight.play.retryForges, { capability: room.host }),
    ).toEqual({
      restarted: 0,
    });
    const [failed] = await fighters(room);
    expect(failed!.status).toBe("FAILED");
    expect(failed!.forge?.kind).toBe("SUBMIT");
    expect((await phase(room)).phase).toBe("BUILD");
    await pump(room);
    expect(mock.forges.length).toBe(forgesBefore);
    // The player's own resubmit is the way out in BUILD.
    mock.forge = null;
    await describeAll(room);
    await pump(room);
    expect((await phase(room)).phase).toBe("ROSTER");
    // Past the Foundry there is nothing to retry.
    expect(
      await room.t.mutation(api.slopfight.play.retryForges, { capability: room.host }),
    ).toEqual({
      restarted: 0,
    });
    expect((await phase(room)).phase).toBe("ROSTER");
  });

  test("strokes are read per fighter: a heavy doodler never pushes anyone else out", async () => {
    const room = await fightRoom(setup(), 3);
    await start(room);
    const [host, ana, bo] = await fighters(room);
    // Every layer full of single-stroke rows for the host, a full Build canvas for Ana,
    // and Bo's three strokes last. One capped read of the game used to drop Bo.
    await insertStrokeRows(room, host!._id, 0, 400);
    await insertStrokeRows(room, host!._id, 2, 400);
    await insertStrokeRows(room, host!._id, 3, 400);
    await insertStrokeRows(room, ana!._id, 0, 400);
    await insertStrokeRows(room, bo!._id, 0, 3);
    expect(MAX_FIGHTER_STROKE_ROWS).toBe(1_200);
    const expected = { [host!._id]: 1_200, [ana!._id]: 400, [bo!._id]: 3 };

    const easels = await Promise.all(
      [host!, ana!, bo!].map((fighter) =>
        room.t.query(api.slopfight.stage.strokes, { roomCode: room.code, fighterId: fighter._id }),
      ),
    );
    const easel = easels.flat();
    expect(countBy(easel, (row) => row.fighterId)).toEqual(expected);
    // Each subscription carries its own fighter only.
    expect(easels.map((rows) => new Set(rows.map((row) => row.fighterId)).size)).toEqual([1, 1, 1]);
    // Same shape as before: an id, the fighter, the layer, the seq and the strokes.
    expect(Object.keys(easel[0]!).toSorted()).toEqual([
      "fighterId",
      "id",
      "layer",
      "seq",
      "strokes",
    ]);
    // Each fighter's rows come in layer then seq order.
    const hostRows = easel.filter((row) => row.fighterId === host!._id);
    expect(hostRows.map((row) => row.layer * 1_000 + row.seq)).toEqual(
      hostRows.map((row) => row.layer * 1_000 + row.seq).toSorted((p, q) => p - q),
    );

    // The recap's doodles read the same way once the game is over.
    await room.t.mutation(api.engine.end, { capability: room.host });
    const recap = await room.t.query(api.views.recap, { roomCode: room.code });
    expect(recap.kind).toBe("READY");
    if (recap.kind !== "READY" || recap.view.mode?.kind !== "SLOPFIGHT")
      throw new Error("no recap");
    const doodles = recap.view.mode.doodles!;
    expect(countBy(doodles, (row) => row.fighterId)).toEqual(expected);
    expect(Object.keys(doodles[0]!).toSorted()).toEqual(["fighterId", "layer", "seq", "strokes"]);
    // The live room never carries them, finished or not.
    const live = (await view(room.t, room.host)).mode;
    expect(live?.kind === "SLOPFIGHT" ? live.doodles : "missing").toBeNull();
  });

  test("myStrokes returns only the caller's own strokes, up to a layer", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    const stroke = { c: 0, w: 1, p: [100, 100, 900, 900] };
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.host,
      layer: 0,
      seq: 5,
      strokes: [stroke, { ...stroke, c: 2 }],
    });
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: room.caps[1]!,
      layer: 0,
      seq: 9,
      strokes: [{ ...stroke, c: 4 }],
    });
    const [host, ana] = await fighters(room);
    await insertStrokeRows(room, host!._id, 2, 3);

    const mine = await room.t.query(api.slopfight.play.myStrokes, { capability: room.host });
    expect(mine.map((row) => [row.layer, row.seq, row.strokes.length])).toEqual([
      [0, 5, 2],
      [2, 0, 1],
      [2, 1, 1],
      [2, 2, 1],
    ]);
    expect(mine.every((row) => row.fighterId === host!._id)).toBe(true);
    const build = await room.t.query(api.slopfight.play.myStrokes, {
      capability: room.host,
      layer: 0,
    });
    expect(build.map((row) => row.seq)).toEqual([5]);
    const anas = await room.t.query(api.slopfight.play.myStrokes, { capability: room.caps[1]! });
    expect(anas).toEqual([
      { fighterId: ana!._id, layer: 0, seq: 9, strokes: [{ ...stroke, c: 4 }] },
    ]);
    await expect(
      room.t.query(api.slopfight.play.myStrokes, { capability: "nope" }),
    ).rejects.toThrow();
  });

  test("the owner's progress query tracks streamed parts without invalidating room documents", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await describeAll(room, [room.host]);
    // The forge action has not run yet: no parts, no plan.
    expect((await sf(room)).fighters[0]!.forgeParts).toEqual({ streamed: 0, target: 8 });
    const mine = (await fighters(room))[0]!;
    const beforeView = await sf(room);
    const progress = (capability = room.host) => room.t.query(api.slopfight.play.myForgeProgress, {
      capability,
      fighterId: mine._id,
    });
    expect(await progress()).toEqual({ streamed: 0, target: 8 });
    await room.t.mutation(internal.slopfight.forgeData.patchPartial, {
      fighterId: mine._id,
      forgeToken: mine.forgeToken,
      parts: kit.sampleChampion().parts.slice(0, 3),
      bodyPlan: "HOPPER",
    });
    expect(await progress()).toEqual({ streamed: 3, target: 4 });
    expect(await room.t.run((ctx) => ctx.db.get("slopFightFighters", mine._id))).toEqual(mine);
    expect(await sf(room)).toEqual(beforeView);
    expect(await progress(room.caps[1]!)).toBeNull();
    await expect(progress("invalid")).rejects.toThrow();
    // A later patch without the plan keeps it.
    await room.t.mutation(internal.slopfight.forgeData.patchPartial, {
      fighterId: mine._id,
      forgeToken: mine.forgeToken,
      parts: kit.sampleChampion().parts,
    });
    expect(await progress()).toEqual({ streamed: 4, target: 5 });
    expect((await sf(room, room.caps[1])).fighters[0]!.forgeParts).toBeNull();
    const watched = (await room.t.query(api.views.watch, { roomCode: room.code })).mode;
    if (watched?.kind !== "SLOPFIGHT") throw new Error("wrong mode");
    expect(watched.fighters[0]!.forgeParts).toBeNull();
    // The real forge path streams the plan too (the mock sends BIPED first), then READY clears it all.
    await pump(room);
    const ready = (await fighters(room))[0]!;
    expect(ready.status).toBe("READY");
    expect(ready.partialPlan).toBeUndefined();
    expect((await sf(room)).fighters[0]!.forgeParts).toBeNull();
    expect(await progress()).toBeNull();
  });

  test("forge part targets: the plan's typical count, the old sheet plus two, always past what arrived", () => {
    const old = kit.sampleChampion();
    expect(forgePartTarget(0, null, null)).toBe(8);
    expect(forgePartTarget(2, "HOPPER", null)).toBe(4);
    expect(forgePartTarget(6, "HOPPER", null)).toBe(7);
    expect(forgePartTarget(3, "MULTIPED", null)).toBe(11);
    expect(forgePartTarget(1, "BIPED", old.parts.length)).toBe(old.parts.length + 2);
    expect(forgePartTarget(60, "BIPED", null)).toBe(40);
    expect(partialBodyPlan({ champion: { bodyPlan: "SLITHER", parts: [] } })).toBe("SLITHER");
    expect(partialBodyPlan({ champion: { bodyPlan: "SLITH" } })).toBeNull();
    expect(partialBodyPlan({ bodyPlan: "FLIER" })).toBe("FLIER");
    expect(partialBodyPlan(null)).toBeNull();
  });

  test("the forge hears where the forged layer's material ink shows: the Build drawing, or the upgrade's new strokes", () => {
    const gold = { c: 7 as const, w: 1 as const, p: [310, 110, 690, 110] };
    const lava = { c: 10 as const, w: 1 as const, p: [410, 810, 590, 810] };
    const base = { kind: "SUBMIT" as const, text: null, layer: 0, previous: null, addition: null, arenas: [] };
    const inks = (input: Parameters<typeof forgeOptions>[0]) =>
      forgeOptions(input).inks?.map((patch) => patch.ink.finish);
    expect(inks({ ...base, batches: [{ layer: 0, seq: 0, strokes: [gold] }] })).toEqual(["gold"]);
    const layers = [
      { layer: 0, seq: 0, strokes: [gold] },
      { layer: 1, seq: 0, strokes: [lava] },
    ];
    expect(inks({ ...base, kind: "UPGRADE", layer: 1, batches: layers })).toEqual(["lava"]);
    expect(inks({ ...base, kind: "UPGRADE", layer: 2, batches: layers })).toEqual([]);
    expect(forgeOptions({ ...base, batches: null }).inks).toBeUndefined();
  });

  test("an identical resubmit while that forge runs is a no-op; a changed one supersedes it", async () => {
    const room = await fightRoom(setup(), 2);
    await start(room);
    await pump(room);
    const submit = (text: string) =>
      room.t.mutation(api.slopfight.play.submitChampion, {
        capability: room.host,
        kind: "DESCRIBE",
        text,
      });
    // Nothing is pumped: the forge stays in flight.
    await submit("a raccoon with a jetpack");
    const first = (await fighters(room))[0]!;
    expect(first.status).toBe("FORGING");
    await submit("a raccoon with a jetpack");
    // Sanitizes to the same text: still the same forge.
    await submit("  a raccoon <b>with</b> a jetpack ");
    expect((await fighters(room))[0]).toMatchObject({
      forgeToken: first.forgeToken,
      attempt: first.attempt,
    });
    await submit("a raccoon with two jetpacks");
    const second = (await fighters(room))[0]!;
    expect(second.forgeToken).not.toBe(first.forgeToken);
    expect(second.text).toBe("a raccoon with two jetpacks");

    // Ana draws: the same drawing again is a no-op; switching to a description supersedes.
    const ana = room.caps[1]!;
    await room.t.mutation(api.slopfight.play.addStrokes, {
      capability: ana,
      layer: 0,
      seq: 1,
      strokes: [{ c: 1, w: 1, p: [100, 100, 800, 800] }],
    });
    await room.t.mutation(api.slopfight.play.submitChampion, { capability: ana, kind: "DRAW" });
    const drawn = (await fighters(room))[1]!;
    expect(drawn.status).toBe("FORGING");
    await room.t.mutation(api.slopfight.play.submitChampion, { capability: ana, kind: "DRAW" });
    expect((await fighters(room))[1]!.forgeToken).toBe(drawn.forgeToken);
    await room.t.mutation(api.slopfight.play.submitChampion, {
      capability: ana,
      kind: "DESCRIBE",
      text: "a cat",
    });
    expect((await fighters(room))[1]!.forgeToken).not.toBe(drawn.forgeToken);

    // After a rejection the same text is a real retry, not a no-op.
    mock.forge = () => ({ ok: true, result: kit.rejectResult(), calls: [] });
    await pump(room);
    expect((await fighters(room))[0]!.status).toBe("REJECTED");
    mock.forge = null;
    const rejected = (await fighters(room))[0]!;
    await submit("a raccoon with two jetpacks");
    const retried = (await fighters(room))[0]!;
    expect(retried.status).toBe("FORGING");
    expect(retried.forgeToken).not.toBe(rejected.forgeToken);
  });

  test("an identical upgrade resubmit while it forges is a no-op; a changed one supersedes it", async () => {
    const room = await fightRoom(setup(), 2);
    await throughBuild(room);
    await pump(room);
    await playRound(room);
    await hostNext(room);
    expect(await phase(room)).toMatchObject({ phase: "UPGRADE", round: 2 });
    await pump(room);
    const upgrade = (text: string) =>
      room.t.mutation(api.slopfight.play.submitUpgrade, {
        capability: room.host,
        kind: "DESCRIBE",
        text,
      });
    await upgrade("add a jetpack");
    const first = (await fighters(room))[0]!;
    expect(first.forge).toMatchObject({ kind: "UPGRADE", version: 2 });
    await upgrade("add a jetpack");
    expect((await fighters(room))[0]!.forgeToken).toBe(first.forgeToken);
    await upgrade("add a cape");
    const second = (await fighters(room))[0]!;
    expect(second.forgeToken).not.toBe(first.forgeToken);
    expect(second.addition).toMatchObject({ round: 2, text: "add a cape" });
    await pump(room);
    expect((await fighters(room))[0]!.status).toBe("READY");
  }, 30_000);
});
