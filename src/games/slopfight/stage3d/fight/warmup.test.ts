import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { sampleById } from "../../samples";
import { loadRapier, runFight, type FightInput, type Rapier } from "../../sim";
import { warmSolver } from "./warmup";

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

describe("playback physics warmup", () => {
  it("leaves subsequent deterministic fights unchanged", () => {
    const input: FightInput = {
      a: sampleById("raccoon-lawyer")!.champion,
      b: sampleById("land-shark")!.champion,
      arena: "ROOFTOP",
      seed: 7,
      notes: [],
      limitMs: 1_000,
    };
    const before = runFight(R, input);
    warmSolver(R);
    expect(runFight(R, input)).toEqual(before);
  });

  it("releases its world even when the cold solver fails", () => {
    const free = vi.spyOn(R.World.prototype, "free");
    const step = vi.spyOn(R.World.prototype, "step").mockImplementationOnce(() => {
      throw new Error("solver failed");
    });
    try {
      expect(() => warmSolver(R)).toThrow("solver failed");
      expect(free).toHaveBeenCalledOnce();
    } finally {
      step.mockRestore();
      free.mockRestore();
    }
  });
});
