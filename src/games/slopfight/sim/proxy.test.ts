import { describe, expect, it } from "vite-plus/test";
import { resolveChampionSkeleton } from "../body/skeleton";
import { SAMPLES } from "../samples";
import { buildProxyDef, layoutOf } from "./proxy";
import { MAX_BODIES } from "./tuning";

describe("buildProxyDef", () => {
  it("builds a valid physics proxy for every sample champion", () => {
    for (const { id, champion } of SAMPLES) {
      const def = buildProxyDef(champion);
      const skeleton = resolveChampionSkeleton(champion);
      const boneIds = new Set(skeleton.bones.map((bone) => bone.id));
      expect(def.bodies.length, id).toBeGreaterThan(0);
      expect(def.bodies.length, id).toBeLessThanOrEqual(MAX_BODIES);
      expect(def.bodies[0]!.role, id).toBe("torso");
      def.bodies.forEach((body, index) => {
        // Body keys are bone ids, so the renderer can drive its bones from them.
        expect(boneIds.has(body.key), `${id}:${body.key}`).toBe(true);
        expect(body.bones[0], id).toBe(body.key);
        expect(body.mass, id).toBeGreaterThan(0);
        expect(body.shapes.length, id).toBe(body.shapeMass.length);
        if (index > 0) expect(body.parent, id).toBeLessThan(index);
      });
      // Every bone belongs to exactly one body.
      const mapped = def.bodies.flatMap((body) => body.bones);
      expect(new Set(mapped).size, id).toBe(mapped.length);
      expect([...def.boneBody.keys()].sort(), id).toEqual([...boneIds].sort());
      const total = def.bodies.reduce((sum, body) => sum + body.mass, 0);
      expect(total, id).toBeCloseTo(def.totalMass, 6);
      expect(def.footprint, id).toBeGreaterThan(0);
      expect(def.extent, id).toBeGreaterThanOrEqual(def.footprint);
    }
  });

  it("is pure and exposes a renderer layout keyed like the bodies", () => {
    const champion = SAMPLES[0]!.champion;
    expect(buildProxyDef(champion)).toEqual(buildProxyDef(champion));
    const layout = layoutOf(buildProxyDef(champion));
    expect(layout.bodies.map((body) => body.key)).toEqual(buildProxyDef(champion).bodies.map((body) => body.key));
    expect(layout.bodyPlan).toBe(champion.bodyPlan);
  });

  it("gives heavier fighters more mass", () => {
    const light = SAMPLES.find((sample) => sample.id === "mouse")!.champion;
    const heavy = SAMPLES.find((sample) => sample.id === "elephant")!.champion;
    expect(buildProxyDef(heavy).totalMass).toBeGreaterThan(buildProxyDef(light).totalMass * 2);
  });
});
