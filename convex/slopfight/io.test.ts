/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from "vite-plus/test";
import { api, internal } from "../_generated/api";
import { runFor, setup } from "../test.harness";
import {
  betAll,
  describeAll,
  fightRoom,
  fighters,
  fights,
  hostNext,
  kit,
  phase,
  pump,
  sf,
  start,
  throughBuild,
} from "./backend.test-harness";

test.each(["result", "early end"])("hype preserves room documents and freezes totals on %s", async (endMode) => {
  const room = await fightRoom(setup(), 4);
  await throughBuild(room);
  await pump(room);
  expect(await room.t.query(api.slopfight.stage.hype, { roomCode: room.code })).toBeNull();
  await hostNext(room);
  await betAll(room, "B");
  await pump(room, 9_000);
  expect((await phase(room)).phase).toBe("FIGHT");

  const beforeFights = await fights(room);
  const beforeFighters = await fighters(room);
  const beforeView = await sf(room);
  const fight = beforeFights.find((entry) => entry._id === beforeView.currentFightId)!;
  const spectatorIndex = beforeFighters.findIndex(
    (fighter) => fighter._id !== fight.a && fighter._id !== fight.b,
  );
  const ownerIndex = beforeFighters.findIndex((fighter) => fighter._id === fight.a);
  const capability = room.caps[spectatorIndex]!;

  await expect(
    room.t.mutation(api.slopfight.play.hype, {
      capability: room.caps[ownerIndex]!,
      count: 1,
    }),
  ).rejects.toThrow(/Owners/);
  await expect(
    room.t.mutation(api.slopfight.play.hype, { capability: "invalid", count: 1 }),
  ).rejects.toThrow();

  await room.t.mutation(api.slopfight.play.hype, { capability, count: 5 });
  await room.t.mutation(api.slopfight.play.hype, { capability, count: 100, side: "A" });
  await room.t.mutation(api.slopfight.play.hype, { capability, count: 0 });
  const crowd = await room.t.query(api.slopfight.stage.hype, { roomCode: room.code });
  expect(crowd).toEqual({ fightId: fight._id, hype: { A: 20, B: 5 } });
  expect(await fights(room)).toEqual(beforeFights);
  expect(await fighters(room)).toEqual(beforeFighters);
  expect(await sf(room)).toEqual(beforeView);

  if (endMode === "result") {
    await pump(room, 18_000);
    expect((await phase(room)).phase).toBe("RESULT");
  } else {
    await room.t.mutation(api.engine.end, { capability: room.host });
    expect((await phase(room)).phase).toBe("FINAL");
    expect((await fights(room)).find((entry) => entry._id === fight._id)?.scoredAt).toBeUndefined();
    expect(await fighters(room)).toEqual(beforeFighters);
  }
  expect((await sf(room)).fights.find((entry) => entry.id === fight._id)?.hype).toEqual({ A: 20, B: 5 });
  expect(await room.t.query(api.slopfight.stage.hype, { roomCode: room.code })).toBeNull();
  if (endMode === "result") {
    await room.t.mutation(api.slopfight.play.hype, { capability, count: 10 });
  }
  expect((await sf(room)).fights.find((entry) => entry.id === fight._id)?.hype).toEqual({ A: 20, B: 5 });

  // The new per-game rows participate in the same bounded cleanup as the replay.
  await room.t.mutation(internal.cleanup.deleteGame, { gameId: room.gameId });
  await runFor(room.t, 2_000);
  expect(await room.t.run((ctx) => ctx.db.query("slopFightHype").collect())).toEqual([]);
});

test("a replaced or ended forge cannot revive its isolated stream", async () => {
  const room = await fightRoom(setup(), 4);
  await start(room);
  await describeAll(room, [room.host]);
  const first = (await fighters(room))[0]!;
  const parts = kit.sampleChampion().parts;
  const patch = (forgeToken: string, count: number, restart = false) =>
    room.t.mutation(internal.slopfight.forgeData.patchPartial, {
      fighterId: first._id,
      forgeToken,
      parts: parts.slice(0, count),
      bodyPlan: "HOPPER",
      restart,
    });
  const progress = () => room.t.query(api.slopfight.play.myForgeProgress, {
    capability: room.host,
    fighterId: first._id,
  });
  await patch(first.forgeToken, 3);
  expect(await progress()).toEqual({ streamed: 3, target: 4 });

  await room.t.mutation(api.slopfight.play.submitChampion, {
    capability: room.host,
    kind: "DESCRIBE",
    text: "A different champion with a giant sock for a hat",
  });
  const second = (await fighters(room))[0]!;
  expect(second.forgeToken).not.toBe(first.forgeToken);
  await patch(first.forgeToken, 4);
  expect(await progress()).toEqual({ streamed: 0, target: 8 });
  await patch(second.forgeToken, 4);
  await patch(second.forgeToken, 1);
  expect(await progress()).toEqual({ streamed: 4, target: 5 });
  await patch(second.forgeToken, 1, true);
  expect(await progress()).toEqual({ streamed: 1, target: 4 });
  const foundry = await room.t.query(api.slopfight.stage.foundry, { roomCode: room.code });
  expect(foundry.find((entry) => entry.id === first._id)?.partial).toEqual(parts.slice(0, 1));
  expect((await fighters(room))[0]).toEqual(second);

  await room.t.mutation(api.engine.end, { capability: room.host });
  await patch(second.forgeToken, 4);
  expect(await progress()).toBeNull();
  expect(await room.t.run((ctx) => ctx.db.query("slopFightForgeStreams").collect())).toEqual([]);
});

test("a blank drawing that supersedes a description forge clears its stream", async () => {
  const room = await fightRoom(setup(), 4);
  await start(room);
  await describeAll(room, [room.host]);
  const fighter = (await fighters(room))[0]!;
  await room.t.mutation(api.slopfight.play.submitChampion, {
    capability: room.host,
    kind: "DRAW",
  });
  expect((await fighters(room))[0]!.status).toBe("REJECTED");
  await room.t.mutation(internal.slopfight.forgeData.patchPartial, {
    fighterId: fighter._id,
    forgeToken: fighter.forgeToken,
    parts: kit.sampleChampion().parts,
  });
  await room.t.mutation(internal.slopfight.forgeData.applyForge, {
    fighterId: fighter._id,
    forgeToken: fighter.forgeToken,
    outcome: { kind: "FORGE", champion: kit.sampleChampion() },
    calls: [],
  });
  expect((await fighters(room))[0]!.status).toBe("REJECTED");
  expect(await room.t.query(api.slopfight.play.myForgeProgress, {
    capability: room.host,
    fighterId: fighter._id,
  })).toBeNull();
  expect(await room.t.run((ctx) => ctx.db.query("slopFightForgeStreams").collect())).toEqual([]);
});
