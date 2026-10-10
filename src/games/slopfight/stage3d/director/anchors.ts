// Camera anchors per arena: the set's Cam_* empties when present, else these
// defaults (the Flooded Garage's anchors), so the director always has a
// known-good position even for a set still being authored.

import { Vector3 } from "three";
import type { ArenaNodes, CameraAnchorName } from "../arena/nodes";

export interface Anchor {
  position: Vector3;
  target: Vector3;
  fov: number;
  /** Dutch roll, degrees. */
  roll: number;
}

type AnchorSpec = readonly [pos: [number, number, number], target: [number, number, number], fov: number, roll?: number];

const DEFAULT_ANCHORS: Readonly<Record<CameraAnchorName, AnchorSpec>> = {
  Cam_Establish: [[-7, 7.6, 10.2], [0.5, 0.4, -2.2], 50],
  Cam_Establish_End: [[0, 2.8, 8.6], [0, 1.5, -2], 44],
  Cam_Build: [[-1.4, 2.6, 1.6], [-7.5, 1.15, -0.1], 42],
  Cam_Foundry: [[1.4, 2.5, 1.6], [7.5, 0.95, -0.1], 42],
  Cam_Roster: [[0, 1.9, 6.6], [0, 0.6, -0.4], 38],
  Cam_FaceOff_A: [[-3.2, 0.45, 3.4], [0.384, 0.55, 0], 34, -5],
  Cam_FaceOff_B: [[3.2, 0.45, 3.4], [-0.384, 0.55, 0], 34, 5],
  Cam_FightWide: [[0, 4, 8.9], [0, 0.75, -1.2], 40],
  Cam_Edge_N: [[-1.4, -0.45, -5.4], [0, 0.3, -2.7], 46],
  Cam_Edge_E: [[5.4, -0.45, -1.4], [2.7, 0.3, 0], 46],
  Cam_Edge_S: [[1.4, -0.45, 5.4], [0, 0.3, 2.7], 46],
  Cam_Edge_W: [[-5.4, -0.45, 1.4], [-2.7, 0.3, 0], 46],
  Cam_Podium: [[0, 1.7, 5.4], [0, 0.95, -0.4], 36],
  Cam_Scoreboard: [[0, 6, -3.2], [0, 6.3, -10.5], 42],
};

export function defaultAnchor(name: CameraAnchorName): Anchor {
  const [position, target, fov, roll = 0] = DEFAULT_ANCHORS[name];
  return { position: new Vector3(...position), target: new Vector3(...target), fov, roll };
}

/** The anchor from the set, or the default. Returns a fresh copy the caller may mutate. */
export function anchorFor(nodes: ArenaNodes | null, name: CameraAnchorName): Anchor {
  const fromSet = nodes?.cameras[name];
  if (!fromSet) return defaultAnchor(name);
  return {
    position: fromSet.position.clone(),
    target: fromSet.target.clone(),
    fov: fromSet.fov,
    roll: fromSet.roll,
  };
}
