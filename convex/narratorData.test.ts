/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const authorizeToken = makeFunctionReference<"query", { capability: string }, { voice: string }>(
  "narratorData:authorizeToken",
);

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("narrator token authorization", () => {
  test("requires an active Slop-Lash game with narrator enabled and a host capability", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
      timersDisabled: true,
      ttsMode: "ON",
      ttsVoice: "Puck",
    });
    const guestOne = await backend.action(api.rooms.join, {
      name: "Guest One",
      roomCode: host.roomCode,
    });
    await backend.action(api.rooms.join, {
      name: "Guest Two",
      roomCode: host.roomCode,
    });

    await expect(backend.query(authorizeToken, { capability: host.capability })).rejects.toThrow(
      "Narrator is not available in the current phase",
    );

    await backend.mutation(api.lobby.start, { capability: host.capability });
    await expect(
      backend.query(authorizeToken, { capability: guestOne.capability }),
    ).rejects.toThrow("Host capability required");
    await expect(backend.query(authorizeToken, { capability: host.capability })).resolves.toEqual({
      voice: "Puck",
    });

    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "FINAL_RESULTS" });
    });
    await expect(backend.query(authorizeToken, { capability: host.capability })).rejects.toThrow(
      "Narrator is not available in the current phase",
    );
  });

  test("rejects unsupported game modes before making an external request", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "AI_CHAT_SHOWDOWN",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "WRITING" });
    });

    await expect(backend.query(authorizeToken, { capability: host.capability })).rejects.toThrow(
      "This game mode does not support narrator",
    );
  });
});
