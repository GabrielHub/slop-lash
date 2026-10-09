/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import presenceTest from "@convex-dev/presence/test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const { generateSpeechMock } = vi.hoisted(() => ({ generateSpeechMock: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateSpeech: generateSpeechMock };
});

const authorizeSpeech = makeFunctionReference<
  "query",
  { capability: string },
  { gameId: string; voice: string }
>("narratorData:authorizeSpeech");

function createTestBackend() {
  const backend = convexTest(schema, modules);
  presenceTest.register(backend);
  return backend;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("narrator speech authorization", () => {
  test("requires an active Slop-Lash game with narrator enabled and a host capability", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "SLOPLASH",
      hostName: "Host",
      hostSecret: "host-secret",
      timersDisabled: true,
      ttsMode: "ON",
      ttsVoice: "Sulafat",
    });
    const guestOne = await backend.action(api.rooms.join, {
      name: "Guest One",
      roomCode: host.roomCode,
    });
    await backend.action(api.rooms.join, {
      name: "Guest Two",
      roomCode: host.roomCode,
    });

    await expect(backend.query(authorizeSpeech, { capability: host.capability })).rejects.toThrow(
      "Narrator is not available in the current phase",
    );

    await backend.mutation(api.lobby.start, { capability: host.capability });
    await expect(
      backend.query(authorizeSpeech, { capability: guestOne.capability }),
    ).rejects.toThrow("Host capability required");
    await expect(backend.query(authorizeSpeech, { capability: host.capability })).resolves.toEqual({
      gameId: host.gameId,
      voice: "Sulafat",
    });

    vi.stubEnv("AI_GATEWAY_API_KEY", "test-api-key");
    generateSpeechMock.mockResolvedValue({ audio: { base64: "test-wav-audio" } });
    await expect(
      backend.action(api.narrator.generate, {
        capability: host.capability,
        eventType: "hurry_up",
        fallbackText: "Ten seconds left.",
      }),
    ).resolves.toEqual({ audioBase64: "test-wav-audio" });
    expect(generateSpeechMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "google/gemini-3.8-flash-lite-tts" }),
        voice: "Sulafat",
        outputFormat: "wav",
        text: "Ten seconds left.",
      }),
    );

    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "FINAL_RESULTS" });
    });
    await expect(backend.query(authorizeSpeech, { capability: host.capability })).rejects.toThrow(
      "Narrator is not available in the current phase",
    );
  });

  test("rejects unsupported game modes before making an external request", async () => {
    vi.stubEnv("HOST_SECRET", "host-secret");
    const backend = createTestBackend();
    const host = await backend.action(api.rooms.create, {
      gameType: "QUIZSLOP",
      hostName: "Host",
      hostSecret: "host-secret",
    });
    await backend.run(async (ctx) => {
      await ctx.db.patch("games", host.gameId, { status: "WRITING" });
    });

    await expect(backend.query(authorizeSpeech, { capability: host.capability })).rejects.toThrow(
      "This game mode does not support narrator",
    );
  });
});
