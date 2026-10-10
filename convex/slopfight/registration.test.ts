/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { api } from "../_generated/api";
import { setup, heartbeat, view } from "../test.harness";

// Foundation smoke test: SlopFight is registered end to end. The Backend
// workstream replaces it with the real mode tests.

beforeEach(() => {
  vi.stubEnv("HOST_SECRET", "secret");
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("a SlopFight room starts in BUILD with its own view and no AI seats", async () => {
  const t = setup();
  await expect(
    t.action(api.rooms.create, {
      gameType: "SLOPFIGHT",
      hostSecret: "secret",
      hostName: "Host",
      aiModelIds: ["anthropic/claude-haiku-5.5"],
    }),
  ).rejects.toThrow(/does not have AI players/);

  const host = await t.action(api.rooms.create, {
    gameType: "SLOPFIGHT",
    hostSecret: "secret",
    hostName: "Host",
    ttsMode: "ON",
  });
  const ana = await t.action(api.rooms.join, { roomCode: host.roomCode, name: "Ana" });
  await heartbeat(t, [host.capability, ana.capability]);

  const lobby = await view(t, host.capability);
  expect(lobby.mode).toEqual({ kind: "SLOPFIGHT" });
  expect(lobby.room.minPlayers).toBe(2);
  expect(lobby.room.maxPlayers).toBe(4);

  await t.mutation(api.engine.start, { capability: host.capability });
  const build = await view(t, host.capability);
  expect(build.room.phase).toBe("BUILD");
  expect(build.room.phaseDeadline).not.toBeNull();
  await t.run(async (ctx) => {
    const game = await ctx.db.get("games", build.room.id);
    expect(game?.ttsMode).toBe("ON");
  });
});
