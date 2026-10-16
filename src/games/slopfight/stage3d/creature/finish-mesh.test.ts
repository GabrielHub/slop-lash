import { describe, expect, test } from "vite-plus/test";
import { stableHash } from "../../../../lib/hash";
import { resolveChampionSkeleton } from "../../body/skeleton";
import { sampleById } from "../../samples";
import type { Champion } from "../../sheet";
import { FINISHES, type Finish } from "../../vocab";
import { FINISH_ID, FINISH_WOBBLE, finishColor, finishOfId, hitFinishLayers, luminance } from "./finish-look";
import { FINISH_FRAGMENT_PARS } from "../look/finish-glsl";
import { meshCreature, meshKey, type MeshData, type MeshRequest } from "./mesher";
import { heldItemBones } from "./props";
import { fullRequest, layoutFace } from "./test-fixtures";

const digest = (a: ArrayLike<number>) =>
  stableHash(Array.from(a, (v) => (Number.isInteger(v) ? v : Math.round(v * 1e6))).join(",")).toString(16);

/** fullRequest for a sample with some of its parts finished. */
function finished(id: string, finishOf: (partId: string, role: string) => Finish | undefined, resolution = 32): MeshRequest {
  const sample = sampleById(id)!.champion;
  const champion: Champion = {
    ...sample,
    parts: sample.parts.map((part) => {
      const finish = finishOf(part.id, part.role);
      return finish ? { ...part, finish } : part;
    }),
  };
  const skeleton = resolveChampionSkeleton(champion);
  const base = fullRequest(id, resolution);
  return {
    ...base,
    bones: skeleton.bones,
    parts: champion.parts,
    skip: base.skip?.length ? heldItemBones(skeleton).skip : [],
    face: layoutFace(skeleton),
  };
}

/** Vertices grouped by exact position (crossing and centroid copies share one). */
function byPosition(mesh: MeshData): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (let v = 0; v < mesh.vertexCount; v += 1) {
    const key = `${mesh.positions[v * 3]},${mesh.positions[v * 3 + 1]},${mesh.positions[v * 3 + 2]}`;
    const list = groups.get(key);
    if (list) list.push(v);
    else groups.set(key, [v]);
  }
  return groups;
}

describe("finished meshes", () => {
  // Digests of the mesher's output before finishes existed (positions,
  // normals, colours, skin index and weight, triangles): an all-vinyl body
  // must come out exactly the same.
  test.each([
    ["raccoon-lawyer", 4046, "477c5e60 ee6f40f4 dabbf04c 1a730f1f 4a419999 1a976135"],
    ["robot", 2622, "76d2e794 1ca70345 a144c620 ec1d9897 e5a295c6 78b6ca9a"],
    ["confident-jellyfish", 4686, "37d343f8 2ec8caa9 1f05a5ed 1d034546 890326ec 6b792c82"],
    ["dragon", 2463, "82a95465 93a93aad 361a4738 18e69061 72fc7e8a 7fd8b946"],
  ] as const)("an all-vinyl %s meshes exactly as before", (id, vertices, digests) => {
    const mesh = meshCreature(fullRequest(id, 40, id === "raccoon-lawyer"));
    expect(mesh.vertexCount).toBe(vertices);
    const got = [mesh.positions, mesh.normals, mesh.colors, mesh.skinIndex, mesh.skinWeight, mesh.index].map(digest).join(" ");
    expect(got).toBe(digests);
    expect(mesh.finish.length).toBe(mesh.vertexCount * 2);
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      expect(mesh.finish[v * 2]).toBe(0);
      expect(mesh.finish[v * 2 + 1]).toBe(1);
    }
  });

  test("labels split at finish boundaries: one finish per triangle, a seam where they meet", () => {
    const mesh = meshCreature(finished("robot", (id) => (id.startsWith("arm") || id.startsWith("hand") ? "metal" : undefined)));
    const metal = FINISH_ID.metal;
    let metalTris = 0;
    for (let t = 0; t < mesh.triangleCount; t += 1) {
      const ids = [0, 1, 2].map((k) => mesh.finish[mesh.index[t * 3 + k]! * 2]!);
      expect(new Set(ids).size).toBe(1);
      expect([0, metal]).toContain(ids[0]);
      if (ids[0] === metal) metalTris += 1;
    }
    expect(metalTris).toBeGreaterThan(50);
    expect(metalTris).toBeLessThan(mesh.triangleCount - 50);
    // The seam: positions carried by a vinyl copy and a metal copy.
    let seam = 0;
    for (const group of byPosition(mesh).values()) {
      const ids = new Set(group.map((v) => mesh.finish[v * 2]));
      if (ids.has(0) && ids.has(metal)) seam += 1;
    }
    expect(seam).toBeGreaterThan(10);
  });

  test("the wobble scale is equal on every copy of a seam vertex and smooth across edges", () => {
    for (const req of [
      finished("robot", (id) => (id.startsWith("arm") || id.startsWith("hand") ? "metal" : id === "head" ? "slime" : undefined)),
      finished("raccoon-lawyer", (id, role) => (role === "torso" ? "crystal" : role === "tail" ? "slime" : undefined)),
    ]) {
      const mesh = meshCreature(req);
      let seams = 0;
      for (const group of byPosition(mesh).values()) {
        if (group.length < 2) continue;
        const ids = new Set(group.map((v) => mesh.finish[v * 2]));
        if (ids.size > 1) seams += 1;
        const w = mesh.finish[group[0]! * 2 + 1]!;
        for (const v of group) expect(mesh.finish[v * 2 + 1]).toBe(w);
      }
      expect(seams).toBeGreaterThan(10);
      let jump = 0;
      for (let t = 0; t < mesh.triangleCount; t += 1) {
        for (let k = 0; k < 3; k += 1) {
          const a = mesh.index[t * 3 + k]!;
          const b = mesh.index[t * 3 + ((k + 1) % 3)]!;
          jump = Math.max(jump, Math.abs(mesh.finish[a * 2 + 1]! - mesh.finish[b * 2 + 1]!));
        }
      }
      // Rigid (0.25) to slime (2) blends over a few cells, never in one step.
      expect(jump).toBeLessThan(0.75);
      for (let v = 0; v < mesh.vertexCount; v += 1) {
        expect(mesh.finish[v * 2 + 1]).toBeGreaterThanOrEqual(0.25 - 1e-6);
        expect(mesh.finish[v * 2 + 1]).toBeLessThanOrEqual(2 + 1e-6);
      }
    }
  });

  test("a finished body is tinted but keeps its shape", () => {
    const vinyl = meshCreature(fullRequest("robot", 32));
    const gold = meshCreature(finished("robot", () => "gold"));
    expect(gold.vertexCount).toBeGreaterThan(vinyl.vertexCount * 0.9);
    expect(gold.vertexCount).toBeLessThan(vinyl.vertexCount * 1.1);
    for (let v = 0; v < gold.vertexCount; v += 1) {
      expect(gold.finish[v * 2]).toBe(FINISH_ID.gold);
      expect(gold.finish[v * 2 + 1]).toBeCloseTo(FINISH_WOBBLE.gold, 6);
      // Gold whatever the palette: red over green over blue.
      expect(gold.colors[v * 3]!).toBeGreaterThan(gold.colors[v * 3 + 1]!);
      expect(gold.colors[v * 3 + 1]!).toBeGreaterThan(gold.colors[v * 3 + 2]!);
    }
  });

  test("the mesh key follows each bone's finish", () => {
    const plain = fullRequest("robot", 32);
    const metal = finished("robot", (id) => (id === "arm1" ? "metal" : undefined));
    const gold = finished("robot", (id) => (id === "arm1" ? "gold" : undefined));
    expect(meshKey(metal)).not.toBe(meshKey(plain));
    expect(meshKey(gold)).not.toBe(meshKey(metal));
    // "vinyl" written out is the same body as no finish at all.
    expect(meshKey(finished("robot", () => "vinyl"))).toBe(meshKey(plain));
  });
});

describe("finish looks", () => {
  test("ids round-trip and vinyl is 0", () => {
    expect(FINISH_ID.vinyl).toBe(0);
    for (const finish of FINISHES) expect(finishOfId(FINISH_ID[finish])).toBe(finish);
  });

  test("the shader names finish ids from FINISH_ID rather than hard-coding them", () => {
    for (const finish of FINISHES) expect(FINISH_FRAGMENT_PARS).toContain(`#define FINISH_${finish.toUpperCase()} ${FINISH_ID[finish]}`);
    expect(FINISH_FRAGMENT_PARS).not.toMatch(/slopKind\s*(==|!=|<=|>=|<|>)\s*\d/);
  });

  test("tints: vinyl and glow keep the paint, gold is gold, crystal lightens, lava darkens", () => {
    const red: [number, number, number] = [0.8, 0.07, 0.05];
    expect(finishColor(red, "vinyl")).toEqual(red);
    expect(finishColor(red, "glow")).toEqual(red);
    const gold = finishColor([0.05, 0.3, 0.8], "gold");
    expect(gold[0]).toBeGreaterThan(gold[1]);
    expect(gold[1]).toBeGreaterThan(gold[2]);
    const ruby = finishColor(red, "crystal");
    expect(ruby[0]).toBeGreaterThan(ruby[1]);
    expect(ruby[0] + ruby[1] + ruby[2]).toBeGreaterThan(red[0] + red[1] + red[2]);
    const lava = finishColor(red, "lava");
    expect(lava[0] + lava[1] + lava[2]).toBeLessThan(0.3);
    // Never pure black, even the lava crust.
    for (const finish of FINISHES) expect(luminance(finishColor(red, finish))).toBeGreaterThan(0.015);
  });

  test("hit layers: none for vinyl, the guard's first, each finish once", () => {
    expect(hitFinishLayers({})).toEqual([]);
    expect(hitFinishLayers({ attackFinish: "vinyl", guardFinish: "vinyl" })).toEqual([]);
    const layers = hitFinishLayers({ attackFinish: "wood", guardFinish: "metal" });
    expect(layers.map((l) => [l.finish, l.from])).toEqual([
      ["metal", "guard"],
      ["wood", "attack"],
    ]);
    expect(layers[1]!.sound.gain).toBeLessThan(layers[0]!.sound.gain);
    expect(hitFinishLayers({ attackFinish: "gold", guardFinish: "gold" })).toHaveLength(1);
  });
});
