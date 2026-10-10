// Checks a loaded set against the canonical play geometry in arenas.ts. The
// server sim never loads a GLB, so the set must match the code: the Floor's
// top at y = 0 and its footprint on the 6 x 6 platform. Mismatches are
// reported (dev route, console in development), never "fixed" at runtime.

import type { Box3 } from "three";
import type { ArenaGeometry } from "../../arenas";

export interface GeometryCheck {
  ok: boolean;
  /** Human-readable lines, one per finding. */
  findings: string[];
  floorTopY: number | null;
  halfX: number | null;
  halfZ: number | null;
}

/** Tolerance for "matches", in world units (1 unit = a standard fighter's height). */
export const GEOMETRY_TOLERANCE = 0.02;

export function checkFloor(geometry: ArenaGeometry, floor: Box3 | null): GeometryCheck {
  if (!floor || floor.isEmpty()) {
    return { ok: false, findings: ["no Floor node"], floorTopY: null, halfX: null, halfZ: null };
  }
  const findings: string[] = [];
  const top = floor.max.y;
  const halfX = Math.max(Math.abs(floor.min.x), Math.abs(floor.max.x));
  const halfZ = Math.max(Math.abs(floor.min.z), Math.abs(floor.max.z));
  const centreX = (floor.min.x + floor.max.x) / 2;
  const centreZ = (floor.min.z + floor.max.z) / 2;
  const fmt = (n: number) => n.toFixed(3);

  if (Math.abs(top - geometry.topY) > GEOMETRY_TOLERANCE) {
    findings.push(`Floor top is y=${fmt(top)}, arenas.ts says ${geometry.topY}`);
  }
  if (Math.abs(halfX - geometry.halfSize) > GEOMETRY_TOLERANCE) {
    findings.push(`Floor half-width x=${fmt(halfX)}, arenas.ts says ${geometry.halfSize}`);
  }
  if (Math.abs(halfZ - geometry.halfSize) > GEOMETRY_TOLERANCE) {
    findings.push(`Floor half-depth z=${fmt(halfZ)}, arenas.ts says ${geometry.halfSize}`);
  }
  if (Math.abs(centreX) > GEOMETRY_TOLERANCE || Math.abs(centreZ) > GEOMETRY_TOLERANCE) {
    findings.push(`Floor is centred at (${fmt(centreX)}, ${fmt(centreZ)}), not the origin`);
  }
  return { ok: findings.length === 0, findings, floorTopY: top, halfX, halfZ };
}
