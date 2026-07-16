import { describe, expect, test } from "vite-plus/test";
import { NARRATOR_VOICES, pickVoiceForSeed } from "./voices";

describe("narrator voice selection", () => {
  test("keeps the Random option stable for a game", () => {
    const gameId = "game-123";
    expect(pickVoiceForSeed(gameId)).toBe(pickVoiceForSeed(gameId));
  });

  test("distributes different games across the available voices", () => {
    const selected = new Set(
      Array.from({ length: 24 }, (_, index) => pickVoiceForSeed(`game-${index}`)),
    );
    expect(selected.size).toBeGreaterThan(1);
    expect([...selected].every((voice) => NARRATOR_VOICES.some(({ id }) => id === voice))).toBe(
      true,
    );
  });
});
