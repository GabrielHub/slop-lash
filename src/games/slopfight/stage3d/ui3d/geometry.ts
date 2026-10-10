// Geometry for the in-scene UI, cached by shape so a dozen cards share one
// buffer: rounded slabs (cards, plates, chips), discs (avatar tokens), pips
// and the move-type glyphs (modelled meshes, never emoji). Everything is
// centred on the origin with its face toward +Z. Cached buffers live for the
// page; never dispose them.

import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MoveType } from "../../vocab";

const cache = new Map<string, BufferGeometry>();

function cached(key: string, build: () => BufferGeometry): BufferGeometry {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = build();
    geometry.computeBoundingSphere();
    cache.set(key, geometry);
  }
  return geometry;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function roundedRectShape(width: number, height: number, radius: number): Shape {
  const r = Math.min(radius, width / 2, height / 2);
  const x = -width / 2;
  const y = -height / 2;
  const shape = new Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/**
 * A rounded, slightly thick slab (a card, a plate, a chip): `depth` thick,
 * centred, face at z = +depth / 2. Group 0 is the faces, group 1 the sides.
 */
export function slabGeometry(width: number, height: number, depth: number, radius: number): BufferGeometry {
  const key = `slab:${round(width)}:${round(height)}:${round(depth)}:${round(radius)}`;
  return cached(key, () => {
    const bevel = Math.min(depth * 0.45, radius * 0.5, 0.025);
    const core = Math.max(0.001, depth - bevel * 2);
    const geometry = new ExtrudeGeometry(roundedRectShape(width - bevel * 2, height - bevel * 2, Math.max(0.001, radius - bevel)), {
      depth: core,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 6,
    });
    geometry.translate(0, 0, -core / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** A pill (a chip's body): a slab with fully round ends. */
export function pillGeometry(width: number, height: number, depth: number): BufferGeometry {
  return slabGeometry(width, height, depth, height / 2);
}

/**
 * A chunky token: a short disc with a rounded rim (lathe profile), axis
 * along Z so its face looks at +Z. `radius` is the outer radius.
 */
export function discGeometry(radius: number, thickness: number): BufferGeometry {
  const key = `disc:${round(radius)}:${round(thickness)}`;
  return cached(key, () => {
    const h = thickness / 2;
    const rim = Math.min(h, radius * 0.25);
    const points: Vector2[] = [new Vector2(0, -h)];
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps;
      points.push(new Vector2(radius - rim + Math.cos(a) * rim, Math.sin(a) * h));
    }
    points.push(new Vector2(0, h));
    const geometry = new LatheGeometry(points, 40);
    geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** A pip: a squat dome, face toward +Z. */
export function pipGeometry(radius: number): BufferGeometry {
  return cached(`pip:${round(radius)}`, () => {
    const geometry = new SphereGeometry(radius, 18, 10);
    geometry.scale(1, 1, 0.55);
    return geometry;
  });
}

/** A thin cylinder (the cable a dropped card hangs from), length 1 along +Y from the origin. */
export function cableGeometry(radius: number): BufferGeometry {
  return cached(`cable:${round(radius)}`, () => {
    const geometry = new CylinderGeometry(radius, radius, 1, 6, 1, true);
    geometry.translate(0, 0.5, 0);
    return geometry;
  });
}

function starShape(points: number, outer: number, inner: number, rotation = 0): Shape {
  const shape = new Shape();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (Math.PI * i) / points;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function extrude(shape: Shape, depth: number): BufferGeometry {
  const bevel = depth * 0.35;
  const geometry = new ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The move-type glyphs, about `size` across, face toward +Z:
 * - STRIKE: an impact burst (an eight-point star, slightly skewed).
 * - GRAPPLE: two linked chain links.
 * - TRICK: a spiral swirl.
 */
export function glyphGeometry(type: MoveType, size: number): BufferGeometry {
  return cached(`glyph:${type}:${round(size)}`, () => {
    const r = size / 2;
    if (type === "STRIKE") {
      const geometry = extrude(starShape(8, r, r * 0.52, 0.18), size * 0.28);
      geometry.scale(1.05, 0.95, 1);
      return geometry;
    }
    if (type === "GRAPPLE") {
      const tube = r * 0.17;
      const a = new TorusGeometry(r * 0.42, tube, 10, 28);
      a.scale(1, 1.35, 1);
      a.rotateZ(0.6);
      a.translate(-r * 0.3, r * 0.12, 0);
      const b = new TorusGeometry(r * 0.42, tube, 10, 28);
      b.scale(1, 1.35, 1);
      b.rotateY(Math.PI / 2);
      b.rotateZ(0.6);
      b.translate(r * 0.3, -r * 0.12, 0);
      const merged = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]);
      a.dispose();
      b.dispose();
      return merged ?? new SphereGeometry(r * 0.6, 12, 8);
    }
    // TRICK: an Archimedean swirl with a fat head.
    const points: Vector3[] = [];
    const turns = 1.85;
    const steps = 48;
    for (let i = 0; i <= steps; i += 1) {
      const p = i / steps;
      const angle = p * turns * Math.PI * 2;
      const radius = r * (0.12 + 0.8 * p);
      points.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
    }
    const curve = new CatmullRomCurve3(points);
    const tube = new TubeGeometry(curve, 64, r * 0.13, 8, false);
    const head = new SphereGeometry(r * 0.2, 12, 8);
    const end = points[points.length - 1]!;
    head.translate(end.x, end.y, end.z);
    const merged = mergeGeometries([tube.toNonIndexed(), head.toNonIndexed()]);
    tube.dispose();
    head.dispose();
    return merged ?? new SphereGeometry(r * 0.6, 12, 8);
  });
}

/** Seconds-ring ticks: a small rounded block, length along +Y. */
export function tickGeometry(width: number, length: number, depth: number): BufferGeometry {
  return slabGeometry(width, length, depth, width * 0.45);
}
