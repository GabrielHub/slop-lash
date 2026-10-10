import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { atan, atan2, cos, exp, expBlend, PI, sin, smoothstep, TAU, wrapAngle } from "./dmath";
import { createRng, rngStream } from "./prng";

describe("dmath", () => {
  it("sin and cos match Math to 1e-9 over several turns", () => {
    let worst = 0;
    for (let index = -4000; index <= 4000; index += 1) {
      const angle = index * 0.00731 * PI;
      worst = Math.max(worst, Math.abs(sin(angle) - Math.sin(angle)), Math.abs(cos(angle) - Math.cos(angle)));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it("atan and atan2 match Math to 1e-9, including the axes and quadrants", () => {
    let worst = 0;
    for (let index = -2000; index <= 2000; index += 1) {
      const value = index * 0.0137;
      worst = Math.max(worst, Math.abs(atan(value) - Math.atan(value)));
    }
    for (let index = 0; index < 720; index += 1) {
      const angle = (index / 720) * TAU;
      for (const radius of [1e-6, 0.3, 1, 17]) {
        const y = radius * Math.sin(angle);
        const x = radius * Math.cos(angle);
        worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)));
      }
    }
    expect(worst).toBeLessThan(1e-9);
    expect(atan2(0, 1)).toBe(0);
    expect(atan2(1, 0)).toBeCloseTo(PI / 2, 12);
    expect(atan2(0, -1)).toBeCloseTo(PI, 12);
  });

  it("exp matches Math to 1e-12 relative error", () => {
    let worst = 0;
    for (let index = -400; index <= 400; index += 1) {
      const value = index * 0.05;
      worst = Math.max(worst, Math.abs(exp(value) - Math.exp(value)) / Math.exp(value));
    }
    expect(worst).toBeLessThan(1e-12);
    expect(expBlend(0, 1)).toBe(0);
    expect(expBlend(1e9, 1)).toBeCloseTo(1, 12);
  });

  it("wraps angles into one turn around zero and clamps smoothstep", () => {
    expect(Math.abs(wrapAngle(3 * PI))).toBeCloseTo(PI, 12);
    expect(wrapAngle(2 * PI + 0.25)).toBeCloseTo(0.25, 12);
    expect(wrapAngle(-3 * PI + 0.1)).toBeCloseTo(-PI + 0.1, 12);
    expect(wrapAngle(0.5)).toBe(0.5);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe("prng", () => {
  it("repeats exactly for a seed and differs across seeds and stream names", () => {
    const draw = (rng: ReturnType<typeof createRng>) => Array.from({ length: 64 }, () => rng.next());
    expect(draw(createRng(42))).toEqual(draw(createRng(42)));
    expect(draw(createRng(42))).not.toEqual(draw(createRng(43)));
    expect(draw(rngStream(42, "A:brain"))).toEqual(draw(rngStream(42, "A:brain")));
    expect(draw(rngStream(42, "A:brain"))).not.toEqual(draw(rngStream(42, "B:brain")));
  });

  it("keeps floats in [0, 1) and ints in range", () => {
    const rng = createRng(7);
    let sum = 0;
    for (let index = 0; index < 20_000; index += 1) {
      const value = rng.float();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      sum += value;
      const pick = rng.int(7);
      expect(Number.isInteger(pick)).toBe(true);
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(7);
      const signed = rng.signed();
      expect(Math.abs(signed)).toBeLessThanOrEqual(1);
    }
    expect(sum / 20_000).toBeGreaterThan(0.48);
    expect(sum / 20_000).toBeLessThan(0.52);
  });
});

describe("sim source purity", () => {
  // The outcome must be identical on every machine: no platform transcendental
  // functions, no wall clock and no ambient randomness inside the fight.
  it("uses no Math transcendentals, Math.random, clocks or ** in sim code", () => {
    const dir = path.resolve(__dirname);
    const files = readdirSync(dir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(5);
    const banned =
      /Math\.(sin|cos|tan|asin|acos|atan|atan2|exp|expm1|log|log2|log10|log1p|pow|cbrt|sinh|cosh|tanh|random|hypot)\b|Date\.now|new Date\(|performance\.now|\*\*/;
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(path.join(dir, file), "utf8")
        .split(/\r?\n/)
        .forEach((line, index) => {
          const code = line
            .replace(/\/\/.*$/, "")
            .replace(/^\s*(\/\*|\*).*$/, "")
            .replace(/\/\*.*?\*\//g, "");
          if (banned.test(code)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
