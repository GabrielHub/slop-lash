import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { ARENA_IDS, getArena } from "./arenas";
import {
  HYPE_STACK_MAX,
  SFX_CUES,
  SFX_LOOPS,
  SLOPFIGHT_FILES,
  intensityShape,
  nextHypeStack,
  pickVariant,
  repeatOffset,
} from "./audio";

interface ManifestEntry {
  name: string;
  file: string;
  bytes: number;
  loop: { start: number; end: number } | null;
}

const manifest = JSON.parse(
  readFileSync(new URL("../../../public/sfx/slopfight/manifest.json", import.meta.url), "utf8"),
) as { sounds: ManifestEntry[] };
const byName = new Map(manifest.sounds.map((entry) => [entry.name, entry]));

describe("SlopFight sound set", () => {
  test("every rendered file is registered and every registered file was rendered", () => {
    expect(Object.keys(SLOPFIGHT_FILES).sort()).toEqual([...byName.keys()].sort());
    for (const [name, asset] of Object.entries(SLOPFIGHT_FILES)) {
      expect(asset.src).toBe(`/sfx/slopfight/${byName.get(name)!.file}`);
    }
  });

  test("loop points match the synth's manifest", () => {
    for (const [name, asset] of Object.entries(SLOPFIGHT_FILES)) {
      const entry = byName.get(name)!;
      const loop = "loop" in asset ? asset.loop : null;
      if (!entry.loop) {
        expect(loop).toBeNull();
        continue;
      }
      expect(loop?.start).toBeCloseTo(entry.loop.start, 5);
      expect(loop?.end).toBeCloseTo(entry.loop.end, 5);
    }
  });

  test("the whole set stays under 1.5 MB", () => {
    const total = manifest.sounds.reduce((sum, entry) => sum + entry.bytes, 0);
    expect(total).toBeLessThan(1.5 * 1024 * 1024);
  });

  test("cues and loops point at real files, and every arena has a landing", () => {
    for (const cue of Object.values(SFX_CUES)) {
      for (const file of cue.files) expect(SLOPFIGHT_FILES).toHaveProperty(file);
    }
    for (const { file } of Object.values(SFX_LOOPS)) {
      expect(SLOPFIGHT_FILES[file]).toHaveProperty("loop");
    }
    const landings = { splash: "land-splash", clang: "land-clang", thud: "land-thud" } as const;
    for (const id of ARENA_IDS) expect(byName.has(landings[getArena(id).ringOutLanding])).toBe(true);
  });
});

describe("repeat variation", () => {
  test("consecutive repeats land far apart in pitch and inside the spread", () => {
    for (let count = 0; count < 60; count += 1) {
      const here = repeatOffset(count, 1.5);
      const next = repeatOffset(count + 1, 1.5);
      expect(Math.abs(here)).toBeLessThanOrEqual(1.5);
      expect(Math.abs(next - here)).toBeGreaterThan(0.7 * 1.5);
    }
    expect(repeatOffset(5, 0)).toBe(0);
  });

  test("variants rotate without an immediate repeat and big hits get the heavy one", () => {
    const cue = SFX_CUES.strikeThwack;
    const picks = Array.from({ length: 12 }, (_, count) => pickVariant(cue, count, 0.4));
    for (let index = 1; index < picks.length; index += 1) {
      expect(picks[index]).not.toBe(picks[index - 1]);
    }
    expect(pickVariant(cue, 3, 0.9)).toBe("fight-strike-3");
    const pops = new Set(Array.from({ length: 3 }, (_, count) => pickVariant(SFX_CUES.partPop, count)));
    expect(pops.size).toBe(3);
  });

  test("intensity makes big moments louder and lower", () => {
    const small = intensityShape(0.1, 2);
    const big = intensityShape(1, 2);
    expect(big.gain).toBeGreaterThan(small.gain);
    expect(big.semitones).toBeLessThan(small.semitones);
    expect(intensityShape(0.5, 2).semitones).toBeCloseTo(0);
  });

  test("hype taps stack while rapid and reset after a pause", () => {
    let stack = 0;
    let last = -Infinity;
    for (const at of [0, 300, 600, 900, 1_200]) {
      stack = nextHypeStack(stack, last, at);
      last = at;
    }
    expect(stack).toBe(4);
    expect(nextHypeStack(stack, last, last + 2_000)).toBe(0);
    expect(nextHypeStack(HYPE_STACK_MAX, 0, 100)).toBe(HYPE_STACK_MAX);
  });
});
