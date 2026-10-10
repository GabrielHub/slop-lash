import { describe, expect, test } from "vite-plus/test";
import { SAMPLES, sampleById } from "../samples";
import { championScale, parsePartialParts, type Part } from "../sheet";
import {
  GROWTH_UNIT,
  LONG_BODY_FACTOR,
  boneBounds,
  resolveChampionSkeleton,
  resolveSkeleton,
  type Skeleton,
} from "./skeleton";

const cases = SAMPLES.map((entry) => [entry.id, entry] as const);
const bone = (skeleton: Skeleton, id: string) => skeleton.bones.find((item) => item.id === id)!;
const footBottom = (skeleton: Skeleton) =>
  Math.min(...skeleton.feet.map((id) => boneBounds(bone(skeleton, id)).min[1]));

function expectedBoneCount(parts: readonly Part[]): number {
  // Each part once, plus a copy for mirrored parts (wings on centre anchors pair
  // automatically) and for every descendant of a mirrored part.
  const byId = new Map(parts.map((part) => [part.id, part]));
  const copied = (part: Part): boolean => {
    const parent = part.parent ? byId.get(part.parent) : undefined;
    if (parent && copied(parent)) return true;
    const centre = part.anchor !== null && ["top", "bottom", "front", "back"].includes(part.anchor);
    return part.mirror || (part.role === "wing" && centre);
  };
  return parts.reduce((count, part) => count + (copied(part) ? 2 : 1), 0);
}

describe("resolveSkeleton on every sample", () => {
  test.each(cases)("%s resolves with sane bounds and its feet on the ground", (_id, entry) => {
    const { champion } = entry;
    const skeleton = resolveChampionSkeleton(champion);
    const scale = championScale(champion);

    expect(skeleton.bones.length).toBe(expectedBoneCount(champion.parts));
    expect(skeleton.torso).toBe(champion.parts[0]!.id);
    expect(skeleton.bones[0]!.parent).toBeNull();

    // Lowest point on the ground; fitted to the standard size times the scale.
    expect(skeleton.bounds.min[1]).toBeCloseTo(0, 5);
    const width = skeleton.bounds.max[0] - skeleton.bounds.min[0];
    const depth = skeleton.bounds.max[2] - skeleton.bounds.min[2];
    const fitted = Math.max(skeleton.height, LONG_BODY_FACTOR * Math.max(width, depth));
    expect(fitted).toBeCloseTo(scale, 4);
    expect(skeleton.height).toBeGreaterThan(0.3 * scale);
    expect(Math.max(width, depth)).toBeLessThan(1.8 * scale);

    for (const item of skeleton.bones) {
      expect(item.radius).toBeGreaterThan(0);
      for (const value of [...item.head, ...item.tail]) expect(Number.isFinite(value)).toBe(true);
      if (item.shape === "sphere") expect(item.tail).toEqual(item.head);
      if (item.parent !== null) expect(skeleton.bones.some((other) => other.id === item.parent)).toBe(true);
    }

    if (["BIPED", "QUADRUPED", "MULTIPED"].includes(champion.bodyPlan)) {
      expect(skeleton.feet.length).toBeGreaterThan(0);
      expect(footBottom(skeleton)).toBeLessThan(0.03 * scale);
    }
    // Symmetric creatures stay centred.
    expect(Math.abs(skeleton.bounds.max[0] + skeleton.bounds.min[0])).toBeLessThan(0.35 * scale);
    // The face is on the front of the head (or torso), facing forward.
    expect(skeleton.face.normal[2]).toBeGreaterThan(0.8);
    expect(skeleton.face.scale).toBeGreaterThan(0);
  });

  test.each(cases)("%s resolves deterministically", (_id, entry) => {
    expect(resolveChampionSkeleton(entry.champion)).toEqual(resolveChampionSkeleton(entry.champion));
  });

  test.each(cases)("%s resolves every streamed prefix", (_id, entry) => {
    const { champion } = entry;
    for (let count = 0; count <= champion.parts.length; count += 1) {
      const prefix = parsePartialParts({ champion: { parts: champion.parts.slice(0, count) } });
      expect(prefix.length).toBe(count);
      const skeleton = resolveSkeleton(prefix, { bodyPlan: champion.bodyPlan, unit: GROWTH_UNIT });
      expect(skeleton.bones.length).toBe(expectedBoneCount(prefix));
      if (count > 0) {
        expect(skeleton.bounds.min[1]).toBeCloseTo(0, 5);
        expect(skeleton.height).toBeGreaterThan(0);
        expect(skeleton.height).toBeLessThan(3);
      }
    }
  });
});

describe("anchor rules", () => {
  test("mirrored copies are reflections across x = 0 with flipped sides", () => {
    for (const entry of SAMPLES) {
      const skeleton = resolveChampionSkeleton(entry.champion);
      for (const copy of skeleton.bones.filter((item) => item.id.endsWith("~m"))) {
        const original = bone(skeleton, copy.id.slice(0, -2));
        expect(copy.partId).toBe(original.partId);
        expect(copy.head).toEqual([-original.head[0] || 0, original.head[1], original.head[2]]);
        expect(copy.tail).toEqual([-original.tail[0] || 0, original.tail[1], original.tail[2]]);
        expect(copy.side).toBe(-original.side || 0);
        expect(copy.radius).toBe(original.radius);
        expect(original.head[0]).not.toBe(0);
      }
    }
  });

  test("raccoon: head on top, ears paired, briefcase in the right hand, tail behind", () => {
    const skeleton = resolveChampionSkeleton(sampleById("raccoon-lawyer")!.champion);
    const torso = bone(skeleton, "torso");
    const head = bone(skeleton, "head");
    expect(head.head[1]).toBeGreaterThan(torso.tail[1]);
    expect(bone(skeleton, "ear").head[0]).toBeGreaterThan(0);
    expect(bone(skeleton, "ear~m").head[0]).toBeLessThan(0);
    expect(bone(skeleton, "leg1").side).toBe(1);
    expect(bone(skeleton, "leg2").side).toBe(-1);
    expect(bone(skeleton, "leg1").head[0]).toBeGreaterThan(0);
    const arm2 = bone(skeleton, "arm2");
    const briefcase = bone(skeleton, "briefcase");
    expect(briefcase.side).toBe(-1);
    expect(briefcase.head[0]).toBeLessThan(0);
    expect(briefcase.head[1]).toBeLessThan(arm2.head[1]);
    expect(bone(skeleton, "tail").tail[2]).toBeLessThan(torso.head[2]);
    expect(skeleton.head).toBe("head");
    expect(skeleton.hands).toEqual(["arm1", "arm2"]);
    expect(skeleton.feet).toEqual(["leg1", "leg2"]);
    expect(skeleton.item).toBe("briefcase");
    expect(skeleton.face.pos[1]).toBeGreaterThan(torso.tail[1]);
  });

  test("a three-legged stool puts its odd leg on the midline at the back", () => {
    const skeleton = resolveChampionSkeleton(sampleById("stool-creature")!.champion);
    expect(bone(skeleton, "leg3").side).toBe(0);
    expect(bone(skeleton, "leg3").head[0]).toBeCloseTo(0, 6);
    expect(bone(skeleton, "leg3").head[2]).toBeLessThan(bone(skeleton, "leg1").head[2]);
    expect(skeleton.feet).toEqual(["leg1", "leg2", "leg3"]);
  });

  test("an eight-legged spider pairs its legs front to back and splays them", () => {
    const skeleton = resolveChampionSkeleton(sampleById("spider")!.champion);
    const z = (n: number) => bone(skeleton, `leg${n}`).head[2];
    expect(z(1)).toBeCloseTo(z(2), 6);
    expect(z(1)).toBeGreaterThan(z(3));
    expect(z(3)).toBeGreaterThan(z(5));
    expect(z(5)).toBeGreaterThan(z(7));
    for (let n = 1; n <= 8; n += 1) {
      const leg = bone(skeleton, `leg${n}`);
      expect(Math.sign(leg.tail[0] - leg.head[0])).toBe(n % 2 === 1 ? 1 : -1);
      expect(leg.tail[1]).toBeLessThan(leg.head[1]);
    }
    expect(skeleton.feet.length).toBe(8);
  });

  test("a headless creature wears its face on the torso", () => {
    const skeleton = resolveChampionSkeleton(sampleById("slime")!.champion);
    expect(skeleton.head).toBeNull();
    const goo = bone(skeleton, "goo");
    expect(skeleton.face.pos[2]).toBeGreaterThan(goo.head[2]);
  });

  test("a giraffe's neck chain climbs and the face lands on the last head", () => {
    const skeleton = resolveChampionSkeleton(sampleById("giraffe")!.champion);
    expect(skeleton.head).toBe("head");
    expect(bone(skeleton, "head").head[1]).toBeGreaterThan(bone(skeleton, "neckTop").head[1]);
    expect(bone(skeleton, "neckTop").head[1]).toBeGreaterThan(bone(skeleton, "neck").head[1]);
    expect(skeleton.height).toBeGreaterThan(0.95);
  });

  test("a worm's segments run straight back along the floor", () => {
    const skeleton = resolveChampionSkeleton(sampleById("worm")!.champion);
    const segs = ["body", "seg1", "seg2", "seg3"].map((id) => bone(skeleton, id));
    for (let i = 1; i < segs.length; i += 1) {
      expect(segs[i]!.tail[2]).toBeLessThan(segs[i - 1]!.tail[2]);
      expect(segs[i]!.load).toBe(true);
    }
    expect(skeleton.height).toBeLessThan(0.9);
  });

  test("fliers spread their wings; others fold them; single wings pair up", () => {
    const dragon = resolveChampionSkeleton(sampleById("dragon")!.champion);
    expect(dragon.wings).toEqual(["wing", "wing~m"]);
    const wing = bone(dragon, "wing");
    expect(wing.tail[0] - wing.head[0]).toBeGreaterThan(0.1);
    const pigeon = resolveChampionSkeleton(sampleById("pigeon-lawyer")!.champion);
    expect(pigeon.wings).toEqual(["wing1", "wing2"]);
    const folded = bone(pigeon, "wing1");
    expect(folded.tail[1]).toBeLessThan(folded.head[1]);
    // An item on a wing hangs from its tip.
    const briefcase = bone(pigeon, "briefcase");
    expect(briefcase.head[1]).toBeLessThan(bone(pigeon, "wing2").tail[1]);
  });

  test("a single unmirrored wing on the back grows its pair", () => {
    const parts: Part[] = [
      { id: "body", role: "torso", shape: "capsule", size: "M", elongation: "normal", parent: null, anchor: null, color: "primary", mirror: false },
      { id: "wing", role: "wing", shape: "capsule", size: "M", elongation: "normal", parent: "body", anchor: "back", color: "secondary", mirror: false },
    ];
    const skeleton = resolveSkeleton(parts, { bodyPlan: "FLIER" });
    expect(skeleton.wings).toEqual(["wing", "wing~m"]);
    expect(bone(skeleton, "wing~m").head[0]).toBeCloseTo(-bone(skeleton, "wing").head[0], 6);
  });

  test("a head bigger than its torso still sits on top", () => {
    const parts: Part[] = [
      { id: "torso", role: "torso", shape: "sphere", size: "S", elongation: "normal", parent: null, anchor: null, color: "primary", mirror: false },
      { id: "head", role: "head", shape: "sphere", size: "XL", elongation: "normal", parent: "torso", anchor: "top", color: "primary", mirror: false },
      { id: "leg1", role: "leg", shape: "capsule", size: "S", elongation: "normal", parent: "torso", anchor: "leg1", color: "secondary", mirror: false },
      { id: "leg2", role: "leg", shape: "capsule", size: "S", elongation: "normal", parent: "torso", anchor: "leg2", color: "secondary", mirror: false },
    ];
    const skeleton = resolveSkeleton(parts, { bodyPlan: "BIPED" });
    expect(bone(skeleton, "head").radius).toBeGreaterThan(bone(skeleton, "torso").radius);
    expect(bone(skeleton, "head").head[1]).toBeGreaterThan(bone(skeleton, "torso").head[1]);
    expect(skeleton.height).toBeCloseTo(1, 4);
    expect(footBottom(skeleton)).toBeLessThan(0.03);
  });

  test("orphans wait for their parent, extra torsos become tails, empty lists are empty", () => {
    const torso: Part = { id: "t", role: "torso", shape: "capsule", size: "M", elongation: "normal", parent: null, anchor: null, color: "primary", mirror: false };
    const orphan: Part = { ...torso, id: "o", role: "horn", parent: "missing", anchor: "top" };
    const extra: Part = { ...torso, id: "t2", parent: "t", anchor: "back" };
    const skeleton = resolveSkeleton([torso, orphan, extra], { bodyPlan: "SLITHER" });
    expect(skeleton.bones.map((item) => item.id)).toEqual(["t", "t2"]);
    expect(bone(skeleton, "t2").role).toBe("tail");
    expect(resolveSkeleton([]).bones).toEqual([]);
    expect(resolveSkeleton([]).torso).toBe("");
  });

  test("the scale option scales the fitted height", () => {
    const parts = sampleById("cat")!.champion.parts;
    expect(resolveSkeleton(parts, { scale: 1.3, bodyPlan: "BIPED" }).height).toBeCloseTo(1.3, 4);
    expect(resolveSkeleton(parts, { scale: 0.72, bodyPlan: "BIPED" }).height).toBeCloseTo(0.72, 4);
  });
});
