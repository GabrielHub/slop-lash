import { Vector3 } from "three";
import { describe, expect, test } from "vite-plus/test";
import { GROWTH_UNIT, resolveChampionSkeleton, resolveSkeleton, tipRadius } from "../../body/skeleton";
import { sampleById } from "../../samples";
import { parsePartialParts } from "../../sheet";
import { CreatureAnimator, createDriver, type AnimEvent } from "./animator";
import { EYE_ANGLE_MAX, browEnds, eyeTilts } from "./face";
import { FINAL_RESOLUTION, hexToLinear, meshCreature, meshKey } from "./mesher";
import { heldItemBones, propMatrix } from "./props";
import { extraFaces, renderLayout } from "./render-layout";
import { buildRig } from "./rig";
import { request, fullRequest, layoutFace, synthetic, PALETTE } from "./test-fixtures";

describe("mesher", () => {
  test.each(["raccoon-lawyer", "spider", "robot", "dragon", "worm", "slime"])("%s meshes into a skinned surface", (id) => {
    const req = request(id);
    const mesh = meshCreature(req);
    expect(mesh.vertexCount).toBeGreaterThan(200);
    expect(mesh.triangleCount).toBeGreaterThan(200);
    const bones = req.bones.length;
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      const n = Math.hypot(mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!);
      expect(Math.abs(n - 1)).toBeLessThan(1e-3);
      expect(Number.isFinite(mesh.positions[i * 3]!)).toBe(true);
      const w = mesh.skinWeight[i * 4]! + mesh.skinWeight[i * 4 + 1]! + mesh.skinWeight[i * 4 + 2]! + mesh.skinWeight[i * 4 + 3]!;
      expect(Math.abs(w - 1)).toBeLessThan(1e-4);
      expect(mesh.skinIndex[i * 4]!).toBeLessThan(bones);
      expect(mesh.skinIndex[i * 4 + 1]!).toBeLessThan(bones);
    }
    for (const index of mesh.index) expect(index).toBeLessThan(mesh.vertexCount);
  });

  test("the surface sits on the ground and inside the skeleton's reach", () => {
    const req = request("cat", 40);
    const mesh = meshCreature(req);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      minY = Math.min(minY, mesh.positions[i * 3 + 1]!);
      maxY = Math.max(maxY, mesh.positions[i * 3 + 1]!);
    }
    // Blending swells the body a little past the bones, never by much.
    expect(minY).toBeGreaterThan(-0.08);
    expect(minY).toBeLessThan(0.05);
    expect(maxY).toBeGreaterThan(0.85);
    expect(maxY).toBeLessThan(1.15);
  });

  test("meshing is deterministic and keyed by content", () => {
    const a = meshCreature(request("frog"));
    const b = meshCreature(request("frog"));
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(meshKey(request("frog"))).toBe(meshKey(request("frog")));
    expect(meshKey(request("frog"))).not.toBe(meshKey(request("slime")));
  });

  test("meshing with layout, markings and a skipped item is deterministic", () => {
    const a = meshCreature(fullRequest("raccoon-lawyer", 32, true));
    const b = meshCreature(fullRequest("raccoon-lawyer", 32, true));
    expect(a.vertexCount).toBeGreaterThan(200);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.colors)).toEqual(Array.from(b.colors));
    expect(meshKey(fullRequest("raccoon-lawyer", 32, true))).not.toBe(meshKey(fullRequest("raccoon-lawyer", 32, false)));
  });

  test.each([
    ["confident-jellyfish", "glow"],
    ["raccoon-lawyer", "snout"],
  ])("colour seams stay narrow: %s's small %s sphere keeps its own colour", (id, partId) => {
    const req = fullRequest(id, FINAL_RESOLUTION);
    const mesh = meshCreature(req);
    const index = req.bones.findIndex((b) => b.id === partId);
    const bone = req.bones[index]!;
    const parent = req.bones.find((b) => b.id === bone.parent)!;
    const own = hexToLinear(req.palette[bone.color]);
    const other = hexToLinear(req.palette[parent.color]);
    const span = Math.hypot(own[0] - other[0], own[1] - other[1], own[2] - other[2]);
    // Boundary crossings come as two copies at one position, one per colour: count surface vertices only.
    const seen = new Map<string, number>();
    const key = (v: number) => `${mesh.positions[v * 3]},${mesh.positions[v * 3 + 1]},${mesh.positions[v * 3 + 2]}`;
    for (let v = 0; v < mesh.vertexCount; v += 1) seen.set(key(v), (seen.get(key(v)) ?? 0) + 1);
    let total = 0;
    let kept = 0;
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      if (mesh.skinIndex[v * 4] !== index || seen.get(key(v))! > 1) continue;
      total += 1;
      const d = Math.hypot(mesh.colors[v * 3]! - own[0], mesh.colors[v * 3 + 1]! - own[1], mesh.colors[v * 3 + 2]! - own[2]);
      // Less than a quarter of the way to the neighbour's colour reads as its own.
      if (d < 0.25 * span) kept += 1;
    }
    expect(total).toBeGreaterThan(20);
    expect(kept / total).toBeGreaterThanOrEqual(0.85);
  });

  test("a cone torso stands on a flat base", () => {
    const { parts: list, skeleton } = synthetic([["torso", "torso cone L normal", null]], "HOPPER");
    const torso = skeleton.bones[0]!;
    const mesh = meshCreature({ bones: skeleton.bones, palette: PALETTE, resolution: 48, parts: list, bodyPlan: "HOPPER" });
    let minY = Infinity;
    for (let v = 0; v < mesh.vertexCount; v += 1) minY = Math.min(minY, mesh.positions[v * 3 + 1]!);
    expect(minY).toBeGreaterThan(-0.08);
    // Vertices on the bottom plane reach most of the way to the rim.
    const cx = torso.head[0];
    const cz = torso.head[2];
    let reach = 0;
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      if (mesh.positions[v * 3 + 1]! > minY + 0.01 * skeleton.height) continue;
      reach = Math.max(reach, Math.hypot(mesh.positions[v * 3]! - cx, mesh.positions[v * 3 + 2]! - cz));
    }
    expect(reach).toBeGreaterThan(0.6 * torso.radius);
  });

  test("a fin on the face's front lies flat out of the way: below the mouth on a torso, on the brow on a head", () => {
    const cone = synthetic(
      [
        ["torso", "torso cone L normal", null],
        ["stripe", "fin capsule S normal", "torso.front", "secondary"],
      ],
      "HOPPER",
    );
    const coneFace = layoutFace(cone.skeleton);
    const coneLayout = renderLayout({ bones: cone.skeleton.bones, parts: cone.parts, bodyPlan: "HOPPER", face: coneFace });
    const stripe = coneLayout.bones[1]!;
    expect(stripe.centre[1]).toBeLessThan(coneLayout.face!.eyePoint[1] - 2 * coneLayout.face!.eye);
    // Lying across the body, not sticking out of it.
    expect(Math.abs(stripe.axis[0])).toBeGreaterThan(0.9);
    // Not counted as a snout (the eyes keep their size).
    expect(coneLayout.face!.snout).toBe(false);

    const head = synthetic(
      [
        ["torso", "torso capsule M normal", null],
        ["head", "head sphere M normal", "torso.top"],
        ["visor", "fin box S normal", "head.front", "accent"],
      ],
      "BIPED",
    );
    const headLayout = renderLayout({ bones: head.skeleton.bones, parts: head.parts, bodyPlan: "BIPED", face: layoutFace(head.skeleton) });
    expect(headLayout.bones[2]!.centre[1]).toBeGreaterThan(headLayout.face!.eyePoint[1] + headLayout.face!.eye);
  });

  test("a slitherer's tail chain curls off to one side so its length shows; its torso and head stay put", () => {
    const worm = sampleById("worm")!.champion;
    const skeleton = resolveChampionSkeleton(worm);
    const layout = renderLayout({ bones: skeleton.bones, parts: worm.parts, bodyPlan: worm.bodyPlan });
    const x = (id: string) => layout.bones[skeleton.bones.findIndex((b) => b.id === id)]!.tail[0];
    expect(Math.abs(x("seg1"))).toBeGreaterThan(0.02);
    // The second segment carries on to the same side, the third swings back a little.
    expect(Math.sign(x("seg2") - x("seg1"))).toBe(Math.sign(x("seg1")));
    expect(layout.bones[0]!.head).toEqual(skeleton.bones[0]!.head);
  });

  test("every head chain end gets a face; a head on the back looks back", () => {
    const { skeleton } = synthetic(
      [
        ["torso", "torso capsule L normal", null],
        ["head", "head sphere M normal", "torso.front"],
        ["head2", "head sphere M normal", "torso.back", "secondary"],
        ["leg1", "leg capsule M normal", "torso.leg1"],
        ["leg2", "leg capsule M normal", "torso.leg2"],
      ],
      "QUADRUPED",
    );
    const extras = extraFaces(skeleton);
    expect(extras.map((f) => f.bone)).toEqual(["head2"]);
    // Up and back, so it reads over the body from the front.
    const n = extras[0]!.normal;
    expect(n[0]).toBeCloseTo(0, 6);
    expect(n[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(n[2]).toBeCloseTo(-Math.SQRT1_2, 6);
    // A neck (a head with a head on it) is not a chain end.
    expect(extraFaces(resolveChampionSkeleton(sampleById("dragon")!.champion))).toEqual([]);
  });

  test("stacked parts on one anchor fan out; other parts keep their pivots", () => {
    const { parts: list, skeleton } = synthetic(
      [
        ["torso", "torso sphere L normal", null],
        ["drip1", "spike cone S long", "torso.bottom", "secondary"],
        ["drip2", "spike cone S long", "torso.bottom", "secondary"],
        ["drip3", "spike cone S long", "torso.bottom", "secondary"],
        ["drip4", "spike cone S long", "torso.bottom", "secondary"],
      ],
      "FLIER",
    );
    const layout = renderLayout({ bones: skeleton.bones, parts: list, bodyPlan: "FLIER" });
    const torso = skeleton.bones[0]!;
    const heads = layout.bones.slice(1).map((b) => new Vector3(...b.head));
    for (let a = 0; a < heads.length; a += 1) {
      for (let b = a + 1; b < heads.length; b += 1) {
        expect(heads[a]!.distanceTo(heads[b]!)).toBeGreaterThan(0.3 * torso.radius);
      }
    }
    // Still hanging off the cloud, under it.
    for (const head of heads) expect(head.y).toBeLessThan(torso.head[1]);

    // The skeleton is never touched, and feet stay where the skeleton puts them.
    const cat = sampleById("cat")!.champion;
    const catSkeleton = resolveChampionSkeleton(cat);
    const before = JSON.stringify(catSkeleton.bones);
    const catLayout = renderLayout({ bones: catSkeleton.bones, parts: cat.parts, bodyPlan: cat.bodyPlan });
    expect(JSON.stringify(catSkeleton.bones)).toBe(before);
    catSkeleton.bones.forEach((bone, i) => {
      if (bone.role !== "leg") return;
      expect(catLayout.bones[i]!.tail[1]).toBeCloseTo(bone.tail[1], 6);
    });
  });

  test("every growth prefix meshes", () => {
    const champion = sampleById("giraffe")!.champion;
    for (let n = 1; n <= champion.parts.length; n += 1) {
      const parts = parsePartialParts({ parts: champion.parts.slice(0, n) });
      const skeleton = resolveSkeleton(parts, { bodyPlan: champion.bodyPlan, unit: GROWTH_UNIT });
      const mesh = meshCreature({ bones: skeleton.bones, palette: { primary: "#E8553D", secondary: "#F5C94C", accent: "#2F6FB0" }, resolution: 24 });
      expect(mesh.vertexCount).toBeGreaterThan(50);
    }
  });
});

describe("rig", () => {
  test("gait groups alternate legs: two, trot four, tripod six", () => {
    const groups = (id: string) => {
      const champion = sampleById(id)!.champion;
      return buildRig(resolveChampionSkeleton(champion), champion.bodyPlan).legs;
    };
    const biped = groups("cat");
    expect(biped).toHaveLength(2);
    expect(new Set(biped.map((leg) => leg.group)).size).toBe(2);
    // Trot: diagonal pairs share a group.
    const quad = groups("corgi");
    const front = quad.filter((leg) => leg.home.z > 0);
    const back = quad.filter((leg) => leg.home.z <= 0);
    for (const leg of front) {
      const diagonal = back.find((other) => other.side === -leg.side)!;
      expect(diagonal.group).toBe(leg.group);
    }
    // Tripod: each group has legs on both sides, three per group.
    const crab = groups("crab");
    for (const group of [0, 1]) {
      const legs = crab.filter((leg) => leg.group === group);
      expect(legs).toHaveLength(3);
      expect(new Set(legs.map((leg) => leg.side)).size).toBe(2);
    }
  });

  test("slitherers get a spine chain; secondary parts exclude load bearers", () => {
    const worm = sampleById("worm")!.champion;
    const rig = buildRig(resolveChampionSkeleton(worm), worm.bodyPlan);
    expect(rig.spine.length).toBeGreaterThan(2);
    for (const index of rig.secondary) expect(rig.bones[index]!.load).toBe(false);
  });
});

describe("animator", () => {
  function run(id: string, seconds: number, speed: number) {
    const champion = sampleById(id)!.champion;
    const rig = buildRig(resolveChampionSkeleton(champion), champion.bodyPlan);
    const animator = new CreatureAnimator(rig, {
      plan: champion.bodyPlan,
      heft: champion.stats.heft,
      seed: 3,
      deliveries: champion.moves.map((m) => m.delivery),
    });
    const driver = createDriver();
    const events: AnimEvent[] = [];
    const dt = 1 / 60;
    for (let t = 0; t < seconds; t += dt) {
      driver.position[2] += speed * dt;
      driver.velocity[2] = speed;
      events.push(...animator.update(dt, driver));
    }
    return { animator, events, rig, driver };
  }

  test("walkers step with their feet and follow the driver", () => {
    const { animator, events, rig, driver } = run("corgi", 2, 1.2);
    const steps = events.filter((e) => e.kind === "footstep");
    expect(steps.length).toBeGreaterThan(6);
    for (const m of animator.matrices) for (const v of m.elements) expect(Number.isFinite(v)).toBe(true);
    // The torso has travelled with the driver.
    const torso = rig.bones[rig.torso]!;
    const centre = torso.head.clone().lerp(torso.tail, 0.5).applyMatrix4(animator.matrices[rig.torso]!);
    expect(Math.abs(centre.z - driver.position[2])).toBeLessThan(0.4);
    // Planted feet stay near the ground.
    for (const step of steps) expect(step.position.y).toBeLessThan(0.3);
  });

  test("hoppers hop and land; fliers flap", () => {
    const hop = run("frog", 3, 1);
    expect(hop.events.some((e) => e.kind === "hopLand")).toBe(true);
    const fly = run("dragon", 2, 1);
    expect(fly.events.some((e) => e.kind === "flap")).toBe(true);
  });

  test("standing still settles: no steps, a blink now and then", () => {
    const { events, animator } = run("cat", 6, 0);
    expect(events.filter((e) => e.kind === "footstep").length).toBeLessThan(3);
    expect(animator.expression).toBe("neutral");
  });

  test("ragdoll weight 1 follows the proxy bodies exactly", () => {
    const champion = sampleById("cat")!.champion;
    const rig = buildRig(resolveChampionSkeleton(champion), champion.bodyPlan);
    const animator = new CreatureAnimator(rig, { plan: champion.bodyPlan, heft: 3, seed: 1 });
    const driver = createDriver();
    const torso = rig.bones[rig.torso]!;
    driver.anim = { ragdoll: 1 };
    driver.pose = { bodies: [{ key: torso.id, p: [1, 2, 3], q: [0, 0, 0, 1] }] };
    animator.update(1 / 60, driver);
    const head = torso.head.clone().applyMatrix4(animator.matrices[rig.torso]!);
    expect(head.x).toBeCloseTo(1, 5);
    expect(head.y).toBeCloseTo(2, 5);
    expect(head.z).toBeCloseTo(3, 5);
  });

  test("expressions follow the intent", () => {
    const champion = sampleById("cat")!.champion;
    const rig = buildRig(resolveChampionSkeleton(champion), champion.bodyPlan);
    const animator = new CreatureAnimator(rig, { plan: champion.bodyPlan, heft: 3, seed: 1 });
    const driver = createDriver();
    driver.anim = { movePhase: "windup", move: 0, progress: 0.5 };
    animator.update(1 / 60, driver);
    expect(animator.expression).toBe("squint");
    driver.anim = { intent: "stagger" };
    animator.update(1 / 60, driver);
    expect(animator.expression).toBe("wide");
    driver.anim = { intent: "showboat" };
    animator.update(1 / 60, driver);
    expect(animator.expression).toBe("smug");
  });
});


describe("face", () => {
  test("angry brows and lids make a V: the inner ends sit low on both eyes", () => {
    for (const side of [1, -1]) {
      const { uTilt, uBrowTilt } = eyeTilts(0.42, 0.42, side);
      const brow = browEnds(uBrowTilt, side);
      expect(brow.inner).toBeLessThan(brow.outer);
      // The lid line is uTilt * x; the inner end is toward the midline (local -side).
      expect(uTilt * -side).toBeLessThan(uTilt * side);
    }
    expect(EYE_ANGLE_MAX).toBeLessThanOrEqual(0.8);
  });
});

describe("props", () => {
  test("only the champion's item part becomes a prop (a jetpack stays a primitive)", () => {
    const skeleton = resolveChampionSkeleton(sampleById("raccoon-jetpack")!.champion);
    const held = heldItemBones(skeleton);
    expect(held.skip).toEqual(["briefcase"]);
    expect(held.roots.map((i) => skeleton.bones[i]!.id)).toEqual(["briefcase"]);
  });

  test("a held prop's grip sits in the hand and it scales with the creature", () => {
    const champion = sampleById("stick-figure")!.champion;
    const skeleton = resolveChampionSkeleton(champion);
    const held = heldItemBones(skeleton);
    const layout = renderLayout({
      bones: skeleton.bones,
      parts: champion.parts,
      bodyPlan: champion.bodyPlan,
      skip: held.skip,
      face: layoutFace(skeleton),
    });
    const item = held.roots[0]!;
    const arm = skeleton.bones.find((b) => b.id === skeleton.bones[item]!.parent)!;
    const dir = new Vector3(...arm.tail).sub(new Vector3(...arm.head)).normalize();
    const hand = new Vector3(...arm.tail).addScaledVector(dir, tipRadius(arm) * 0.35);
    const bounds = { min: new Vector3(-0.05, -0.1, -0.05), max: new Vector3(0.05, 0.6, 0.05) };
    for (const hold of ["upright", "aim", "hanging", "front"] as const) {
      const m = propMatrix({ skeleton, layout, item, hold, anchor: "bottom", size: "M", ...bounds });
      expect(new Vector3().setFromMatrixPosition(m).distanceTo(hand)).toBeLessThan(1e-3);
      expect(new Vector3().setFromMatrixScale(m).x).toBeCloseTo(skeleton.height, 5);
    }
    // Upright props point up from the hand.
    const up = propMatrix({ skeleton, layout, item, hold: "upright", anchor: "bottom", size: "M", ...bounds });
    expect(new Vector3(0, 1, 0).transformDirection(up).y).toBeGreaterThan(0.5);
    // The mesh leaves the item bone out of the field.
    const mesh = meshCreature(fullRequest("stick-figure", 32, true));
    for (let v = 0; v < mesh.vertexCount; v += 1) expect(mesh.skinIndex[v * 4]).not.toBe(item);
  });
});
