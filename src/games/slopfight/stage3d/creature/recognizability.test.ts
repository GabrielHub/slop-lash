import { Vector3 } from "three";
import { describe, expect, test } from "vite-plus/test";
import { resolveChampionSkeleton, type Skeleton } from "../../body/skeleton";
import { cross, dot, normalize, sub, type Vec3 } from "../../body/vec";
import { sampleById } from "../../samples";
import type { Marking } from "../../sheet";
import type { BodyPlan } from "../../vocab";
import { CreatureFace } from "./face";
import { GROWTH_RESOLUTION, hexToLinear, meshCreature, type MeshData } from "./mesher";
import { markingField } from "./paint";
import { heldItemBones, propMatrix } from "./props";
import { facePrims, faceSpot, renderLayout, type RenderLayout, type RenderBone } from "./render-layout";
import { PRIM, fieldAt, marchSurface, preparePrims, primBounds } from "./sdf";
import { fullRequest, layoutFace, synthetic, PALETTE, type Row } from "./test-fixtures";

// ---------------------------------------------------------------------------
// Recognizability (render r3): crisp paint, markings, nothing hidden
// ---------------------------------------------------------------------------

type Rgb3 = [number, number, number];

function synthLayout(rows: Row[], bodyPlan: BodyPlan, markings: Marking[] = [], skip: string[] = []) {
  const s = synthetic(rows, bodyPlan);
  const layout = renderLayout({
    bones: s.skeleton.bones,
    parts: s.parts,
    bodyPlan,
    markings,
    skip,
    face: layoutFace(s.skeleton),
  });
  return { ...s, layout };
}

function synthMesh(rows: Row[], bodyPlan: BodyPlan, markings: Marking[] = [], resolution = 48) {
  const s = synthLayout(rows, bodyPlan, markings);
  const mesh = meshCreature({
    bones: s.skeleton.bones,
    palette: PALETTE,
    resolution,
    gradient: 0,
    parts: s.parts,
    bodyPlan,
    markings,
    face: layoutFace(s.skeleton),
  });
  return { ...s, mesh };
}

function sampleLayout(id: string): { layout: RenderLayout; skeleton: Skeleton; champion: ReturnType<typeof sampleById> & {} } {
  const entry = sampleById(id)!;
  const champion = entry.champion;
  const skeleton = resolveChampionSkeleton(champion);
  const layout = renderLayout({
    bones: skeleton.bones,
    parts: champion.parts,
    bodyPlan: champion.bodyPlan,
    markings: champion.markings,
    skip: heldItemBones(skeleton).skip,
    face: layoutFace(skeleton),
  });
  return { layout, skeleton, champion: entry };
}

const colourOf = (mesh: MeshData, v: number): Rgb3 => [mesh.colors[v * 3]!, mesh.colors[v * 3 + 1]!, mesh.colors[v * 3 + 2]!];
const posOf = (mesh: MeshData, v: number): Vec3 => [mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!];
const same = (a: Rgb3, b: Rgb3) => Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5 && Math.abs(a[2] - b[2]) < 1e-5;

/** The mesh's grid cell, from its extent. */
function cellOf(mesh: MeshData): number {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < mesh.vertexCount; v += 1) {
    for (let k = 0; k < 3; k += 1) {
      lo[k] = Math.min(lo[k]!, mesh.positions[v * 3 + k]!);
      hi[k] = Math.max(hi[k]!, mesh.positions[v * 3 + k]!);
    }
  }
  return (1.1 * Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!)) / mesh.resolution;
}

/** The share of vertices within `radius` of `p` that carry `colour` (NaN when none are that close). */
function paintedNear(mesh: MeshData, p: Vec3, colour: Rgb3, radius: number): number {
  let n = 0;
  let hit = 0;
  for (let v = 0; v < mesh.vertexCount; v += 1) {
    const q = posOf(mesh, v);
    if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > radius) continue;
    n += 1;
    if (same(colourOf(mesh, v), colour)) hit += 1;
  }
  return n ? hit / n : Number.NaN;
}

/** A point on one bone's rendered surface, marching out from `from` along `dir`. */
function onBone(layout: RenderLayout, bone: number, from: Vec3, dir: Vec3): Vec3 {
  const prims = preparePrims(
    layout.prims.filter((p) => p.bone === bone),
    0,
  );
  return marchSurface(prims, from, normalize(dir), 5).point;
}

const madd3 = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

const MARGARET: Row[] = [
  ["torso", "torso capsule L normal", null],
  ["head", "head sphere M normal", "torso.top"],
  ["shell", "fin sphere XL stubby", "torso.back", "secondary"],
  ["leg1", "leg capsule M stubby", "torso.leg1", "secondary"],
  ["leg2", "leg capsule M stubby", "torso.leg2", "secondary"],
  ["arm1", "arm capsule M normal", "torso.arm1"],
  ["arm2", "arm capsule M normal", "torso.arm2"],
  ["sword", "item capsule M long", "arm2.bottom", "accent"],
];

describe("paint (r3)", () => {
  test("colour edges are crisp: a band on a sphere is split along its edge, never blended", () => {
    const { mesh, layout } = synthMesh([["torso", "torso sphere L normal", null]], "HOPPER", [
      { part: "torso", kind: "band", color: "accent" },
    ]);
    const accent = hexToLinear(PALETTE.accent);
    const primary = hexToLinear(PALETTE.primary);
    // Every triangle is one colour.
    for (let k = 0; k < mesh.index.length; k += 3) {
      const a = colourOf(mesh, mesh.index[k]!);
      expect(same(a, colourOf(mesh, mesh.index[k + 1]!)) && same(a, colourOf(mesh, mesh.index[k + 2]!))).toBe(true);
    }
    // Painted exactly where the band is, to within a cell.
    const rb = layout.bones[0]!;
    const cell = cellOf(mesh);
    let painted = 0;
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      const c = colourOf(mesh, v);
      const ya = Math.abs(dot(sub(posOf(mesh, v), rb.centre), rb.axis));
      expect(same(c, accent) || same(c, primary)).toBe(true);
      if (same(c, accent)) {
        painted += 1;
        expect(ya).toBeLessThanOrEqual(0.22 * rb.half + cell);
      } else {
        expect(ya).toBeGreaterThanOrEqual(0.22 * rb.half - cell);
      }
    }
    expect(painted).toBeGreaterThan(50);
  });

  test("seams between parts take only palette colours", () => {
    const req = { ...fullRequest("corgi", 48), gradient: 0 };
    const mesh = meshCreature(req);
    const slots = [req.palette.primary, req.palette.secondary, req.palette.accent].map(hexToLinear);
    for (let v = 0; v < mesh.vertexCount; v += 1) {
      const c = colourOf(mesh, v);
      expect(slots.some((s) => same(c, s))).toBe(true);
    }
  });

  test("a marking's tip is the last part of a limb, a small cap on a torso", () => {
    const bone = (root: boolean): RenderBone => ({
      head: [0, -0.5, 0],
      tail: [0, 0.5, 0],
      centre: [0, 0, 0],
      axis: [0, 1, 0],
      half: 0.6,
      radius: 0.1,
      away: [0, 1, 0],
      sphere: false,
      level: false,
      skip: false,
      root,
    });
    const ctx = { face: null, cell: 0.01, seed: 1, torsoRadius: 0.3, surface: (from: Vec3) => from };
    const limb = markingField("tip", bone(false), ctx)!;
    const torso = markingField("tip", bone(true), ctx)!;
    const at = (t: number): Vec3 => [0.1, -0.6 + 1.2 * t, 0];
    expect(limb(at(0.9), [1, 0, 0])).toBeLessThan(0);
    expect(limb(at(0.84), [1, 0, 0])).toBeGreaterThan(0);
    expect(torso(at(0.9), [1, 0, 0])).toBeLessThan(0);
    expect(torso(at(0.87), [1, 0, 0])).toBeGreaterThan(0);
  });

  test("paint never covers the face: a box's decal block lifts above its panel", () => {
    const rows: Row[] = [
      ["torso", "torso box L normal", null],
      ["leg1", "leg capsule M stubby", "torso.leg1", "secondary"],
    ];
    const { mesh, layout } = synthMesh(rows, "HOPPER", [{ part: "torso", kind: "panel", color: "accent" }]);
    const lf = layout.face!;
    expect(lf.box).toBe(true);
    expect(lf.lift).toBeGreaterThan(0);
    expect(lf.paint).toBe("front");
    const v = (p: Vec3) => dot(sub(p, lf.centre), lf.up);
    // Paint starts half an eye radius under the mouth's lower edge.
    expect(v(lf.paintTop)).toBeLessThanOrEqual(v(lf.decalBottom) - 0.5 * lf.eye + 1e-6);
    expect(v(lf.mouthPoint)).toBeGreaterThan(v(lf.decalBottom));
    const accent = hexToLinear(PALETTE.accent);
    const cell = cellOf(mesh);
    let painted = 0;
    for (let i = 0; i < mesh.vertexCount; i += 1) {
      if (!same(colourOf(mesh, i), accent)) continue;
      painted += 1;
      expect(v(posOf(mesh, i))).toBeLessThanOrEqual(v(lf.paintTop) + cell);
    }
    expect(painted).toBeGreaterThan(30);
  });

  test("a mask is two eye patches with a bridge, on the front only", () => {
    const rows: Row[] = [
      ["torso", "torso capsule L normal", null],
      ["head", "head sphere L normal", "torso.top"],
      ["leg1", "leg capsule M stubby", "torso.leg1"],
      ["leg2", "leg capsule M stubby", "torso.leg2"],
    ];
    const { mesh, layout } = synthMesh(rows, "BIPED", [{ part: "head", kind: "mask", color: "secondary" }], 64);
    const lf = layout.face!;
    const dark = hexToLinear(PALETTE.secondary);
    const r = 0.6 * lf.eye;
    for (const eye of lf.eyes) expect(paintedNear(mesh, eye, dark, r)).toBeGreaterThan(0.9);
    expect(paintedNear(mesh, lf.eyePoint, dark, r)).toBeGreaterThan(0.9);
    const sdf = facePrims(layout, lf.scale * 0.5);
    const back = marchSurface(sdf, lf.centre, [-lf.normal[0], -lf.normal[1], -lf.normal[2]], lf.scale * 3).point;
    expect(paintedNear(mesh, back, dark, r)).toBe(0);
    const chin = faceSpot(lf, sdf, layout.bones[lf.bone]!, 0, -2.6, lf.eye, lf.lift).point;
    expect(paintedNear(mesh, chin, dark, r)).toBe(0);
  });

  test("spots: nine to eleven small ones on a big part, three or four big ones on a limb, kept apart", () => {
    /** Paint a field over sample points and count the separate spots. */
    const spots = (field: (p: Vec3, n: Vec3) => number, points: { p: Vec3; n: Vec3 }[], link: number) => {
      const painted = points.filter(({ p, n }) => field(p, n) < 0).map(({ p }) => p);
      const root = painted.map((_, i) => i);
      const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i]!)));
      for (let a = 0; a < painted.length; a += 1) {
        for (let b = a + 1; b < painted.length; b += 1) {
          const d = Math.hypot(painted[a]![0] - painted[b]![0], painted[a]![1] - painted[b]![1], painted[a]![2] - painted[b]![2]);
          if (d < link) root[find(a)] = find(b);
        }
      }
      let gap = Infinity;
      for (let a = 0; a < painted.length; a += 1) {
        for (let b = a + 1; b < painted.length; b += 1) {
          if (find(a) === find(b)) continue;
          gap = Math.min(gap, Math.hypot(painted[a]![0] - painted[b]![0], painted[a]![1] - painted[b]![1], painted[a]![2] - painted[b]![2]));
        }
      }
      return { count: new Set(painted.map((_, i) => find(i))).size, gap };
    };
    const R = 0.5;
    const ball: RenderBone = {
      head: [0, 0, 0],
      tail: [0, 0, 0],
      centre: [0, 0, 0],
      axis: [0, 1, 0],
      half: R,
      radius: R,
      away: [0, 1, 0],
      sphere: true,
      level: false,
      skip: false,
      root: true,
    };
    const sphere: { p: Vec3; n: Vec3 }[] = [];
    const N = 9000;
    for (let i = 0; i < N; i += 1) {
      const y = 1 - (2 * (i + 0.5)) / N;
      const rho = Math.sqrt(1 - y * y);
      const phi = i * 2.399963;
      const n: Vec3 = [Math.cos(phi) * rho, y, Math.sin(phi) * rho];
      sphere.push({ p: [n[0] * R, n[1] * R, n[2] * R], n });
    }
    for (const seed of [1, 7, 42, 1234]) {
      const field = markingField("spots", ball, {
        face: null,
        cell: 0.005,
        seed,
        torsoRadius: R,
        surface: (from, dir) => madd3(from, normalize(dir), R),
      })!;
      const { count, gap } = spots(field, sphere, 0.07 * R);
      expect(count).toBeGreaterThanOrEqual(9);
      expect(count).toBeLessThanOrEqual(11);
      // At least 1.6 spot radii of bare skin between spots (less the sampling).
      expect(gap).toBeGreaterThan(1.6 * 0.17 * R - 0.08 * R);
    }
    const r = 0.1;
    const limb: RenderBone = { ...ball, head: [0, -0.3, 0], tail: [0, 0.3, 0], half: 0.4, radius: r, sphere: false, root: false };
    const tube: { p: Vec3; n: Vec3 }[] = [];
    for (let i = 0; i < 120; i += 1) {
      for (let j = 0; j < 60; j += 1) {
        const a = (j / 60) * Math.PI * 2;
        const n: Vec3 = [Math.sin(a), 0, Math.cos(a)];
        tube.push({ p: [n[0] * r, -0.3 + (0.6 * i) / 119, n[2] * r], n });
      }
    }
    for (const seed of [3, 99]) {
      const field = markingField("spots", limb, {
        face: null,
        cell: 0.005,
        seed,
        torsoRadius: R,
        surface: (from, dir) => madd3(from, normalize(dir), r),
      })!;
      const { count } = spots(field, tube, 0.04);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  test("a suit: jacket all round, a V of shirt at the chest with a tie down it", () => {
    const req = { ...fullRequest("frog-suit", 64), gradient: 0 };
    const mesh = meshCreature(req);
    const { layout } = sampleLayout("frog-suit");
    const rb = layout.bones[0]!;
    const a = rb.axis;
    const f = normalize(sub([0, 0, 1], [a[0] * a[2], a[1] * a[2], a[2] * a[2]]));
    const s = cross(a, f);
    const at = (t: number, x: number, dir: Vec3) =>
      onBone(layout, 0, madd3(madd3(rb.centre, a, (2 * t - 1) * rb.half), s, x * rb.radius), dir);
    const jacket = hexToLinear(req.palette.secondary);
    const shirt = hexToLinear(req.palette.primary);
    const near = 0.25 * rb.radius;
    expect(paintedNear(mesh, at(0.8, 0.2, f), shirt, 0.06 * rb.radius)).toBeGreaterThan(0.8);
    expect(paintedNear(mesh, at(0.66, 0, f), jacket, 0.04 * rb.radius)).toBeGreaterThan(0.8);
    expect(paintedNear(mesh, at(0.3, 0, f), jacket, near)).toBeGreaterThan(0.8);
    expect(paintedNear(mesh, at(0.7, 0, [-f[0], -f[1], -f[2]]), jacket, near)).toBeGreaterThan(0.8);
  });

  test("a streak runs along a level body's top, over a face head's crown, and not down its sides", () => {
    const req = { ...fullRequest("skunk", 64), gradient: 0 };
    const mesh = meshCreature(req);
    const { layout, skeleton } = sampleLayout("skunk");
    const stripe = hexToLinear(req.palette.secondary);
    const torso = layout.bones[0]!;
    const near = 0.2 * torso.radius;
    expect(paintedNear(mesh, onBone(layout, 0, torso.centre, [0, 1, 0]), stripe, near)).toBeGreaterThan(0.8);
    expect(paintedNear(mesh, onBone(layout, 0, torso.centre, [1, 0, 0]), stripe, near)).toBe(0);
    const head = skeleton.bones.findIndex((b) => b.id === "head");
    const hb = layout.bones[head]!;
    const crown = onBone(layout, head, hb.centre, [0, 1, -0.3]);
    expect(paintedNear(mesh, crown, stripe, 0.2 * hb.radius)).toBeGreaterThan(0.8);
    expect(paintedNear(mesh, layout.face!.eyePoint, stripe, 0.2 * hb.radius)).toBe(0);
  });
});

describe("render layout (r3)", () => {
  test("no hidden parts: arms, tails, horns, ears and fins on the body show", () => {
    for (const id of ["crab", "raccoon-lawyer", "cat", "corgi", "dragon", "robot", "mouse", "elephant", "horse", "skunk"]) {
      const { layout, skeleton, champion } = sampleLayout(id);
      const faceBone = layout.face?.bone ?? -1;
      skeleton.bones.forEach((bone, i) => {
        if (!["arm", "tail", "horn", "ear", "fin"].includes(bone.role)) return;
        const p = skeleton.bones.findIndex((b) => b.id === bone.parent);
        if (p < 0 || (skeleton.bones[p]!.parent !== null && skeleton.bones[p]!.role !== "head")) return;
        const anchor = champion.champion.parts.find((part) => part.id === bone.partId)?.anchor;
        if (p === faceBone && anchor === "front") return;
        const parent = preparePrims(
          layout.prims.filter((q) => q.bone === p),
          0,
        );
        const rb = layout.bones[i]!;
        if (rb.sphere) {
          expect(fieldAt(parent, ...rb.centre), `${id} ${bone.id}`).toBeGreaterThanOrEqual(0.45 * Math.min(rb.half, rb.radius) - 1e-3);
        } else {
          let outside = 0;
          for (let k = 0; k <= 8; k += 1) {
            const q = madd3(rb.head, sub(rb.tail, rb.head), k / 8);
            if (fieldAt(parent, q[0], q[1], q[2]) > 0) outside += 1;
          }
          expect(outside / 9, `${id} ${bone.id}`).toBeGreaterThanOrEqual(0.55);
        }
      });
    }
  });

  test("legs show below the body, more under a box's front edge; feet stay put", () => {
    const kevin = synthLayout(
      [
        ["torso", "torso box L normal", null],
        ["leg1", "leg capsule M stubby", "torso.leg1", "secondary"],
      ],
      "HOPPER",
    );
    for (const { layout, skeleton } of [kevin, sampleLayout("robot")]) {
      let bottom = Infinity;
      for (const prim of layout.prims.filter((q) => q.bone === 0)) bottom = Math.min(bottom, primBounds(prim).min[1]);
      skeleton.bones.forEach((bone, i) => {
        if (bone.role !== "leg") return;
        const rb = layout.bones[i]!;
        expect(rb.tail[1]).toBeCloseTo(bone.tail[1], 9);
        const foot = rb.tail[1] - rb.radius;
        expect(bottom - foot).toBeGreaterThan(1.5 * rb.radius);
      });
      expect(layout.bones[0]!.head[1]).toBeGreaterThan(skeleton.bones[0]!.head[1]);
    }
  });

  test("ears come out from under a hat on the same anchor; the hat keeps it", () => {
    const { layout, skeleton } = synthLayout(
      [
        ["torso", "torso capsule M normal", null],
        ["head", "head sphere M normal", "torso.top"],
        ["brim", "fin sphere L stubby", "head.top", "secondary"],
        ["ear", "ear cone S normal", "head.top", "primary", true],
        ["leg1", "leg capsule M stubby", "torso.leg1"],
        ["leg2", "leg capsule M stubby", "torso.leg2"],
      ],
      "BIPED",
    );
    const head = layout.bones[1]!;
    const angle = (i: number) => Math.acos(dot(normalize(sub(layout.bones[i]!.head, head.centre)), [0, 1, 0]));
    skeleton.bones.forEach((bone, i) => {
      if (bone.role === "ear") {
        expect(angle(i)).toBeGreaterThanOrEqual(0.35 - 1e-6);
        expect(Math.sign(layout.bones[i]!.head[0])).toBe(bone.side);
      }
      if (bone.id === "brim") expect(angle(i)).toBeLessThan(0.1);
    });
  });

  test("a back tail rises and curls up; a big one plumes", () => {
    const { layout, skeleton } = synthLayout(
      [
        ["torso", "torso capsule L normal", null],
        ["head", "head sphere M normal", "torso.front"],
        ["leg1", "leg capsule M normal", "torso.leg1"],
        ["leg2", "leg capsule M normal", "torso.leg2"],
        ["leg3", "leg capsule M normal", "torso.leg3"],
        ["leg4", "leg capsule M normal", "torso.leg4"],
        ["tail", "tail capsule L long", "torso.back"],
      ],
      "QUADRUPED",
    );
    const i = skeleton.bones.findIndex((b) => b.id === "tail");
    const prims = layout.prims.filter((p) => p.bone === i);
    expect(prims.length).toBeGreaterThanOrEqual(3);
    const rise = (p: (typeof prims)[number]) => Math.asin(normalize(sub(p.tail, p.head))[1]);
    expect(rise(prims[0]!)).toBeGreaterThan(0.75);
    expect(rise(prims[prims.length - 1]!)).toBeGreaterThan(rise(prims[0]!) + 0.4);
    expect(Math.max(...prims.map((p) => Math.max(p.r0, p.r1)))).toBeGreaterThan(1.2 * prims[0]!.r0);
  });

  test("a chained tail rises whole; a short one low on a round back rises less; a level winged body keeps it low", () => {
    const elevation = (layout: RenderLayout, i: number) => {
      const b = layout.bones[i]!;
      const d = sub(b.tail, b.head);
      return Math.atan2(d[1], Math.hypot(d[0], d[2]));
    };
    const quad = (extra: Row[], plan: BodyPlan = "QUADRUPED") =>
      synthLayout(
        [
          ["torso", "torso capsule L normal", null],
          ["head", "head sphere M normal", "torso.front"],
          ["leg1", "leg capsule M normal", "torso.leg1"],
          ["leg2", "leg capsule M normal", "torso.leg2"],
          ["leg3", "leg capsule M normal", "torso.leg3"],
          ["leg4", "leg capsule M normal", "torso.leg4"],
          ...extra,
        ],
        plan,
      );
    // A spike on the tail's end rides the risen tail.
    const spiked = quad([
      ["tail", "tail capsule M long", "torso.back"],
      ["spike", "tail cone S normal", "tail.back"],
    ]);
    const t = spiked.skeleton.bones.findIndex((b) => b.id === "tail");
    const spike = spiked.skeleton.bones.findIndex((b) => b.id === "spike");
    expect(elevation(spiked.layout, t)).toBeGreaterThan(0.75);
    const tailEnd = new Vector3(...spiked.layout.bones[t]!.tail);
    expect(new Vector3(...spiked.layout.bones[spike]!.head).distanceTo(tailEnd)).toBeLessThan(2 * spiked.layout.bones[t]!.radius);
    expect(spiked.layout.bones[spike]!.head[1]).toBeGreaterThan(spiked.skeleton.bones[spike]!.head[1] + 0.05);

    // The pigeon's short tail sits low on a fat upright body: less than the full 55 degrees, and it clears the body.
    const pigeon = sampleLayout("pigeon-lawyer");
    const pt = pigeon.skeleton.bones.findIndex((b) => b.role === "tail");
    const rise = elevation(pigeon.layout, pt);
    expect(rise).toBeLessThan((50 * Math.PI) / 180);
    expect(rise).toBeGreaterThan(0);
    const body = preparePrims(pigeon.layout.prims.filter((p) => p.bone === 0), 0);
    const tb = pigeon.layout.bones[pt]!;
    let clear = 0;
    for (let k = 0; k <= 8; k += 1) {
      const q = [0, 1, 2].map((j) => tb.head[j]! + ((tb.tail[j]! - tb.head[j]!) * k) / 8);
      if (fieldAt(body, q[0]!, q[1]!, q[2]!) > 0.5 * tb.radius) clear += 1;
    }
    expect(clear / 9).toBeGreaterThanOrEqual(0.5);

    // Wings on a level body sweep back over where a risen tail would go.
    const winged = quad([
      ["wing", "wing capsule L long", "torso.left", "secondary", true],
      ["tail", "tail capsule M long", "torso.back"],
    ]);
    const wt = winged.skeleton.bones.findIndex((b) => b.id === "tail");
    const sk = winged.skeleton.bones[wt]!;
    const skelRise = Math.atan2(sk.tail[1] - sk.head[1], Math.hypot(sk.tail[0] - sk.head[0], sk.tail[2] - sk.head[2]));
    const root = winged.layout.prims.find((p) => p.bone === wt)!;
    expect(Math.asin(normalize(sub(root.tail, root.head))[1])).toBeLessThan(skelRise + 0.2);
  });

  test("big add-ons scale with their parent: a snowman's middle ball, a car's cabin, a tortoise's shell", () => {
    const snowman = synthLayout(
      [
        ["torso", "torso sphere XL normal", null],
        ["chest", "fin sphere L normal", "torso.top"],
        ["head", "head sphere M normal", "chest.top"],
        ["nose", "horn cone L normal", "head.front", "accent"],
        ["arm1", "arm capsule S long", "torso.arm1", "secondary"],
        ["arm2", "arm capsule S long", "torso.arm2", "secondary"],
      ],
      "HOPPER",
    );
    const [torso, chest, head] = snowman.layout.bones;
    expect(chest!.radius).toBeGreaterThanOrEqual(0.7 * torso!.radius - 1e-9);
    // The head rides the grown ball.
    expect(head!.centre[1]).toBeGreaterThan(chest!.centre[1] + 0.9 * chest!.radius);

    const car = synthLayout(
      [
        ["torso", "torso box L normal", null],
        ["cabin", "fin box L normal", "torso.top"],
        ["leg1", "leg capsule M long", "torso.leg1", "secondary"],
        ["leg2", "leg capsule M long", "torso.leg2", "secondary"],
        ["leg3", "leg capsule M long", "torso.leg3", "secondary"],
        ["leg4", "leg capsule M long", "torso.leg4", "secondary"],
      ],
      "QUADRUPED",
    );
    expect(car.layout.bones[1]!.radius).toBeGreaterThanOrEqual(0.7 * car.layout.bones[0]!.radius - 1e-9);

    const margaret = synthLayout(MARGARET, "BIPED");
    const t = margaret.layout.bones[0]!;
    const shell = margaret.layout.bones[2]!;
    expect(shell.radius).toBeGreaterThanOrEqual(0.9 * t.radius);
    expect(shell.centre[2]).toBeLessThanOrEqual(t.centre[2] - t.radius - 0.3 * t.radius);
    const lift = t.head[1] - margaret.skeleton.bones[0]!.head[1];
    expect(shell.centre[1] - margaret.skeleton.bones[2]!.head[1] - lift).toBeGreaterThan(0.1 * t.radius);
  });

  test("long limbs render thin and keep their feet on the ground", () => {
    const { layout, skeleton } = synthLayout(
      [
        ["torso", "torso capsule L long", null],
        ["head", "head sphere M normal", "torso.front"],
        ["leg1", "leg capsule M long", "torso.leg1", "secondary"],
        ["leg2", "leg capsule M long", "torso.leg2", "secondary"],
        ["leg3", "leg capsule M long", "torso.leg3", "secondary"],
        ["leg4", "leg capsule M long", "torso.leg4", "secondary"],
        ["tail", "tail capsule M long", "torso.back", "secondary"],
      ],
      "QUADRUPED",
    );
    skeleton.bones.forEach((bone, i) => {
      const rb = layout.bones[i]!;
      if (bone.role === "leg") {
        expect(rb.radius).toBeLessThanOrEqual(0.65 * bone.radius + 1e-9);
        expect(rb.tail[1] - rb.radius).toBeCloseTo(bone.tail[1] - bone.radius, 3);
      }
      if (bone.role === "tail") expect(rb.radius).toBeCloseTo(0.85 * bone.radius, 9);
    });
  });

  test("tentacles under a body curl out; a fin cone on a level body's back is a flat fan", () => {
    const jelly = synthLayout(
      [
        ["dome", "torso sphere XL stubby", null],
        ["tent1", "tail cone M long", "dome.bottom", "secondary"],
        ["tent2", "tail cone M long", "dome.bottom", "secondary"],
        ["tent3", "tail cone M long", "dome.bottom", "secondary"],
        ["tent4", "tail cone M long", "dome.bottom", "secondary"],
        ["tent5", "tail cone M long", "dome.bottom", "secondary"],
      ],
      "SLITHER",
    );
    const centre = jelly.layout.bones[0]!.centre;
    for (let i = 1; i < jelly.skeleton.bones.length; i += 1) {
      const prims = jelly.layout.prims.filter((p) => p.bone === i);
      expect(prims.length).toBeGreaterThanOrEqual(2);
      const first = prims[0]!;
      const last = prims[prims.length - 1]!;
      const outward = normalize([first.head[0] - centre[0], 0, first.head[2] - centre[2]]);
      const d = normalize(sub(last.tail, last.head));
      expect(d[0] * outward[0] + d[2] * outward[2]).toBeGreaterThan(0.2);
      // Thinner than the bone, tapering.
      expect(first.r0).toBeLessThan(jelly.skeleton.bones[i]!.radius);
      expect(last.r1).toBeLessThan(first.r0);
    }

    // A lone tail under a body is a wisp or a stinger: it hangs straight.
    const ghost = sampleLayout("ghost");
    const wisp = ghost.skeleton.bones.findIndex((b) => b.role === "tail" && b.parent === ghost.skeleton.bones[0]!.id);
    expect(wisp).toBeGreaterThan(0);
    expect(ghost.layout.prims.filter((p) => p.bone === wisp)).toHaveLength(1);

    const fish = synthLayout(
      [
        ["torso", "torso capsule L normal", null],
        ["fan", "fin cone M normal", "torso.back"],
      ],
      "SLITHER",
    );
    const fan = fish.layout.prims.find((p) => p.bone === 1)!;
    expect(fan.kind).toBe(PRIM.CappedCone);
    expect(fan.r1).toBeGreaterThan(fan.r0);
    expect(fan.flat).toBeCloseTo(0.35, 9);
    expect(Math.abs(fan.flatAxis[0])).toBeGreaterThan(0.9);
  });

  test("snouts stay short and sit low: a dog's muzzle, a dragon's snout", () => {
    const dragon = synthLayout(
      [
        ["torso", "torso capsule L normal", null],
        ["head", "head sphere M normal", "torso.top"],
        ["snout", "horn cone L normal", "head.front"],
        ["horn1", "horn cone L normal", "head.top", "accent", true],
        ["wing", "wing capsule L long", "torso.left", "secondary", true],
        ["tail", "tail cone M long", "torso.back"],
        ["leg1", "leg capsule M stubby", "torso.leg1"],
        ["leg2", "leg capsule M stubby", "torso.leg2"],
        ["arm1", "arm capsule M normal", "torso.arm1", "secondary"],
        ["arm2", "arm capsule M normal", "torso.arm2", "secondary"],
      ],
      "BIPED",
    );
    const cases = [
      { id: "corgi", ...sampleLayout("corgi"), list: sampleById("corgi")!.champion.parts },
      { id: "horse", ...sampleLayout("horse"), list: sampleById("horse")!.champion.parts },
      { id: "dragon", ...dragon, list: dragon.parts },
    ];
    for (const { id, layout, skeleton, list } of cases) {
      const lf = layout.face!;
      const snout = skeleton.bones.findIndex(
        (b) =>
          b.role === "horn" &&
          skeleton.bones.findIndex((p) => p.id === b.parent) === lf.bone &&
          list.find((p) => p.id === b.partId)?.anchor === "front",
      );
      expect(snout).toBeGreaterThan(0);
      const rb = layout.bones[snout]!;
      // Rooted below the eye line.
      expect(dot(sub(rb.head, lf.eyePoint), lf.up)).toBeLessThan(0);
      // Reaching at most 0.55 (muzzles) or 0.75 (beaks) of the face radius past the face.
      const front = marchSurface(facePrims(layout, 0), lf.centre, lf.normal, lf.scale * 3).point;
      let reach = -Infinity;
      for (const prim of layout.prims.filter((p) => p.bone === snout)) {
        const d = normalize(sub(prim.tail, prim.head), lf.normal);
        reach = Math.max(reach, dot(sub(madd3(prim.tail, d, prim.r1), front), lf.normal));
      }
      const cap = skeleton.bones[snout]!.shape === "cone" ? 0.75 : 0.55;
      expect(reach, id).toBeLessThanOrEqual(cap * lf.scale + 1e-6);
    }
  });

  test("a panda's grin stays on its muzzle instead of marching down onto the chest", () => {
    const { skeleton, layout } = synthLayout([
      ["torso", "torso capsule L normal", null],
      ["head", "head sphere M normal", "torso.top"],
      ["muzzle", "horn sphere M normal", "head.front"],
      ["ear", "ear sphere M normal", "head.left", "secondary", true],
      ["leg1", "leg capsule M normal", "torso.leg1", "secondary"],
      ["leg2", "leg capsule M normal", "torso.leg2", "secondary"],
      ["arm1", "arm capsule M normal", "torso.arm1", "secondary"],
      ["arm2", "arm capsule M normal", "torso.arm2", "secondary"],
    ], "BIPED");
    const face = new CreatureFace();
    face.build({ skeleton, layout, face: { eyes: "round", mouth: "grin" }, skin: "#fff4dc", accent: "#1d1a20" }, 1);
    const mouth = face.group.children.at(-1)!;
    const frame = layout.face!;
    const point = mouth.position.toArray() as Vec3;
    // A real forged panda previously placed its grin more than two head radii
    // below its face. Keep it on the lower head and on the existing muzzle.
    expect(dot(sub(point, frame.centre), frame.up)).toBeGreaterThan(-frame.scale);
    expect(dot(sub(point, frame.centre), frame.up)).toBeLessThan(0);
    const muzzle = preparePrims(layout.prims.filter((prim) => prim.bone === frame.snoutBone), 0);
    expect(Math.abs(fieldAt(muzzle, ...point))).toBeLessThan(0.18 * skeleton.height);
    face.dispose();
  });

  test("eyes stay on the front of a narrow face", () => {
    const cone = synthLayout(
      [
        ["torso", "torso cone L normal", null],
        ["base", "fin box XL stubby", "torso.bottom", "secondary"],
      ],
      "HOPPER",
    );
    const cat = synthLayout(
      [
        ["torso", "torso capsule L long", null],
        ["head", "head sphere M normal", "torso.front"],
        ["ear", "ear cone M normal", "head.top", "secondary", true],
        ["leg1", "leg capsule M long", "torso.leg1"],
        ["leg2", "leg capsule M long", "torso.leg2"],
        ["leg3", "leg capsule M long", "torso.leg3"],
        ["leg4", "leg capsule M long", "torso.leg4"],
      ],
      "QUADRUPED",
    );
    for (const { layout } of [cone, cat]) {
      const lf = layout.face!;
      const sdf = facePrims(layout, lf.scale * 0.5);
      for (const x of [1.18, -1.18]) {
        for (const dx of [1.4, -1.4]) {
          for (const dy of [1.4, -1.4]) {
            const hit = faceSpot(lf, sdf, layout.bones[lf.bone]!, x + dx, 0.25 + dy, lf.eye, lf.lift);
            expect(dot(hit.normal, lf.normal)).toBeGreaterThanOrEqual(0.4 - 1e-6);
          }
        }
      }
    }
  });

  test("an armless body carries its item in its mouth, under the eyes", () => {
    const s = synthetic(
      [
        ["torso", "torso cone L normal", null],
        ["baton", "item capsule M normal", "torso.left", "accent"],
      ],
      "HOPPER",
    );
    const held = heldItemBones(s.skeleton);
    const layout = renderLayout({ bones: s.skeleton.bones, parts: s.parts, bodyPlan: "HOPPER", skip: held.skip, face: layoutFace(s.skeleton) });
    const bounds = { min: new Vector3(-0.05, -0.1, -0.05), max: new Vector3(0.05, 0.6, 0.05) };
    const m = propMatrix({ skeleton: s.skeleton, layout, item: held.roots[0]!, hold: "upright", anchor: "left", size: "M", ...bounds });
    const lf = layout.face!;
    const centre = bounds.min.clone().add(bounds.max).multiplyScalar(0.5).applyMatrix4(m);
    const rel = centre.clone().sub(new Vector3(...lf.mouthPoint));
    expect(Math.abs(rel.dot(new Vector3(...lf.tangent)))).toBeLessThan(1e-6);
    expect(rel.dot(new Vector3(...lf.up))).toBeLessThanOrEqual(1e-6);
    // Crosswise, like a stick in a dog's mouth.
    expect(Math.abs(new Vector3(0, 1, 0).transformDirection(m).x)).toBeGreaterThan(0.99);
    // Seen from the side its top stays under the eyes, even on a face tilted up.
    const eyeFloor = Math.min(lf.eyes[0][1], lf.eyes[1][1]) - lf.eye * Math.max(lf.up[1], 0);
    for (let k = 0; k < 8; k += 1) {
      const c = new Vector3(k & 1 ? bounds.max.x : bounds.min.x, k & 2 ? bounds.max.y : bounds.min.y, k & 4 ? bounds.max.z : bounds.min.z);
      expect(c.applyMatrix4(m).y).toBeLessThanOrEqual(eyeFloor + 1e-6);
    }
  });

  test("a raised sword leans clear of the head; an aimed prop turns to its side", () => {
    const s = synthetic(MARGARET, "BIPED");
    const held = heldItemBones(s.skeleton);
    const layout = renderLayout({ bones: s.skeleton.bones, parts: s.parts, bodyPlan: "BIPED", skip: held.skip, face: layoutFace(s.skeleton) });
    const item = held.roots[0]!;
    const bounds = { min: new Vector3(-0.08, -0.15, -0.02), max: new Vector3(0.08, 0.85, 0.02) };
    const m = propMatrix({ skeleton: s.skeleton, layout, item, hold: "upright", anchor: "bottom", size: "M", ...bounds });
    const head = layout.bones[1]!;
    const hc = new Vector3(...head.centre);
    for (let k = 0; k <= 4; k += 1) {
      const y = 0.35 + (0.5 * k) / 4;
      expect(new Vector3(0, y, 0).applyMatrix4(m).distanceTo(hc)).toBeGreaterThanOrEqual(1.1 * head.radius - 1e-6);
    }
    const side = s.skeleton.bones[item]!.side || (layout.bones[item]!.head[0] >= 0 ? 1 : -1);
    const aim = propMatrix({ skeleton: s.skeleton, layout, item, hold: "aim", anchor: "bottom", size: "M", ...bounds });
    const z = new Vector3(0, 0, 1).transformDirection(aim);
    expect(Math.sign(z.x)).toBe(side);
    expect(Math.abs(Math.atan2(z.x, z.z))).toBeCloseTo((35 * Math.PI) / 180, 2);
  });

  test("a snake's tail curls to the side: its sideways reach is at least half its length", () => {
    const { layout, skeleton } = synthLayout(
      [
        ["torso", "torso capsule M normal", null],
        ["head", "head sphere M normal", "torso.front"],
        ["tongue", "horn cone M long", "head.front", "accent"],
        ["seg1", "tail capsule S normal", "torso.back"],
        ["seg2", "tail capsule S normal", "seg1.back"],
        ["seg3", "tail capsule S normal", "seg2.back"],
        ["seg4", "tail capsule S normal", "seg3.back"],
        ["seg5", "tail capsule S normal", "seg4.back"],
        ["seg6", "tail capsule S normal", "seg5.back"],
      ],
      "SLITHER",
    );
    let length = 0;
    let lateral = 0;
    skeleton.bones.forEach((bone, i) => {
      if (bone.role !== "tail") return;
      length += Math.hypot(...sub(bone.tail, bone.head));
      lateral = Math.max(lateral, Math.abs(layout.bones[i]!.tail[0]));
    });
    expect(lateral).toBeGreaterThanOrEqual(0.5 * length);
  });

  test("growth meshes still work at the growth resolution with every marking kind", () => {
    const rows: Row[] = [
      ["torso", "torso capsule L normal", null],
      ["head", "head sphere M normal", "torso.top"],
      ["leg1", "leg capsule M normal", "torso.leg1"],
      ["leg2", "leg capsule M normal", "torso.leg2"],
      ["arm1", "arm capsule M normal", "torso.arm1"],
      ["tail", "tail capsule M long", "torso.back"],
    ];
    for (const kind of ["stripes", "spots", "band", "belly", "mask", "tip", "panel", "suit", "streak"] as const) {
      const markings: Marking[] = [
        { part: "torso", kind, color: "secondary" },
        { part: "head", kind, color: "accent" },
        { part: "tail", kind, color: "accent" },
      ];
      const mesh = synthMesh(rows, "BIPED", markings, GROWTH_RESOLUTION).mesh;
      expect(mesh.vertexCount, kind).toBeGreaterThan(200);
      for (const index of mesh.index) expect(index).toBeLessThan(mesh.vertexCount);
    }
  });

  test("a big fin on a limb anchor lays out and meshes (no anchor axis to push along)", () => {
    for (const rows of [
      [
        ["torso", "torso capsule M normal", null],
        ["fin", "fin sphere L normal", "torso.leg3"],
      ],
      [
        ["torso", "torso capsule S stubby", null],
        ["fin", "fin capsule XL long", "torso.leg8"],
      ],
      [
        ["torso", "torso box M normal", null],
        ["fin", "fin cone L normal", "torso.arm2"],
      ],
    ] as Row[][]) {
      const { layout } = synthLayout(rows, "BIPED");
      for (const b of layout.bones) for (const v of [...b.head, ...b.tail, b.radius]) expect(Number.isFinite(v)).toBe(true);
      const mesh = synthMesh(rows, "BIPED", [], 24).mesh;
      expect(mesh.vertexCount).toBeGreaterThan(50);
      for (const index of mesh.index) expect(index).toBeLessThan(mesh.vertexCount);
    }
  });

  test("sphere legs beside stretched capsule legs drop back toward their feet but stay on the torso", () => {
    const cap = (n: number): Row => [`leg${n}`, "leg capsule S stubby", `torso.leg${n}`];
    const ball = (n: number): Row => [`leg${n}`, "leg sphere S normal", `torso.leg${n}`];
    for (const [plan, torso, legs] of [
      ["BIPED", "L", [cap(1), cap(2), ball(3), ball(4)]],
      ["QUADRUPED", "M", [ball(1), ball(2), cap(3), cap(4)]],
      ["HOPPER", "M", [cap(1), ball(2)]],
    ] as [BodyPlan, string, Row[]][]) {
      const { layout, skeleton } = synthLayout([["torso", `torso box ${torso} normal`, null], ...legs], plan);
      const t = skeleton.bones[0]!;
      const lift = layout.bones[0]!.centre[1] - (t.head[1] + t.tail[1]) / 2;
      expect(lift, plan).toBeGreaterThan(0.01);
      const torsoPrims = preparePrims(
        layout.prims.filter((q) => q.bone === 0),
        1,
      );
      skeleton.bones.forEach((bone, i) => {
        if (bone.role !== "leg") return;
        const rb = layout.bones[i]!;
        if (bone.shape === "sphere") {
          // The drawn ball goes back to its foot (never below it); these torsos leave room for that...
          const ball = layout.prims.filter((q) => q.bone === i);
          const bottom = Math.min(...ball.map((q) => primBounds(q).min[1]));
          const top = Math.max(...ball.map((q) => primBounds(q).max[1]));
          const y = (bottom + top) / 2;
          expect(y, `${plan} ${bone.id}`).toBeGreaterThanOrEqual(bone.head[1] - 1e-4);
          expect(y, `${plan} ${bone.id}`).toBeLessThan(bone.head[1] + 0.1 * lift);
          expect(top - bottom, `${plan} ${bone.id}`).toBeLessThan(2 * rb.radius + 1e-3);
          // ...but stays on the torso.
          expect(fieldAt(torsoPrims, ...rb.centre), `${plan} ${bone.id}`).toBeLessThan(0.6 * rb.radius + 1e-3);
        } else {
          expect(Math.min(rb.head[1], rb.tail[1]), `${plan} ${bone.id}`).toBeCloseTo(Math.min(bone.head[1], bone.tail[1]), 4);
        }
      });
    }
  });
});
