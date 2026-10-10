import { createHash } from "node:crypto";
import { beforeAll, expect, it } from "vite-plus/test";
import { ARENA_IDS } from "../arenas";
import { sampleById } from "../samples";
import { stableStringify } from "../sheet";
import { createFight, loadRapier, type Rapier } from "./index";

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

// Captured before decomposing fight.ts. Covers every body plan and arena,
// full event/health histories, poses during combat, and physics after the end.
// Deliberate tuning changes should review and update these golden recordings.
it("preserves the recorded outcomes and playback across simulation refactors", () => {
  const pairs = [
    ["raccoon-lawyer", "octopus"],
    ["potato-googly", "storm-cloud"],
    ["worm", "elephant"],
    ["cat", "crab"],
  ];
  const recordings = [];
  for (const [a, b] of pairs) {
    for (const arena of ARENA_IDS) {
      for (const seed of [1, 77]) {
        const sim = createFight(R, {
          a: sampleById(a!)!.champion,
          b: sampleById(b!)!.champion,
          arena,
          seed,
          limitMs: 20_000,
          notes:
            seed === 1
              ? []
              : [
                  { side: "A", modifies: "speed", value: 10, reason: "Quick feet" },
                  { side: "B", modifies: "grappleImmune", value: 1, reason: "Slippery" },
                ],
        });
        const playback = createHash("sha256");
        const record = () =>
          playback.update(
            stableStringify({
              t: sim.tMs,
              a: sim.pose("A"),
              b: sim.pose("B"),
              liveA: sim.live("A"),
              liveB: sim.live("B"),
            }),
          );
        try {
          for (let step = 0; !sim.done && step < 2400; step += 1) {
            sim.step();
            if (step % 17 === 0) record();
          }
          expect(sim.done).toBe(true);
          for (let step = 0; step < 30; step += 1) {
            sim.step();
            record();
          }
          recordings.push({
            fight: `${a}/${b}/${arena}/${seed}`,
            outcome: createHash("sha256").update(stableStringify(sim.outcome())).digest("hex"),
            playback: playback.digest("hex"),
          });
        } finally {
          sim.dispose();
        }
      }
    }
  }
  expect(recordings).toMatchSnapshot();
}, 15_000);
