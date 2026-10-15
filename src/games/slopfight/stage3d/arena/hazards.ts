// Small idle animations for set pieces, found by contract name, so the set is
// never still: laundry swaying in gusts (Hazard_Wind_Laundry_*), toast popping
// (Hazard_Toaster_Toast_*), the sink dripping (Hazard_Sink_Drip), junk bobbing
// in the flood (Floater_*). Missing nodes are simply skipped. Everything runs
// on presentation time, so it freezes in a hit stop with the world.

import { Euler, Vector3, type Object3D } from "three";
import { fbm1, hash01, seedOf } from "../director/noise";

export interface HazardAnimator {
  update(t: number, wind: WindState): void;
  reset(): void;
}

/** Wind for the laundry: direction on the floor plane and gust strength 0..1. */
export interface WindState {
  x: number;
  z: number;
  strength: number;
}

interface Rest {
  object: Object3D;
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
  seed: number;
  /** Toast: pop height. Drip: fall distance. */
  travel: number;
}

const extraNumber = (object: Object3D, key: string): number | null => {
  const value = (object.userData as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const rest = (object: Object3D, travel = 0): Rest => ({
  object,
  position: object.position.clone(),
  rotation: object.rotation.clone(),
  scale: object.scale.clone(),
  seed: seedOf(object.name) % 1000,
  travel,
});

const worldY = (object: Object3D) => object.getWorldPosition(new Vector3()).y;

const restore = (r: Rest) => {
  r.object.position.copy(r.position);
  r.object.rotation.copy(r.rotation);
  r.object.scale.copy(r.scale);
};

export function createHazardAnimators(root: Object3D): HazardAnimator {
  const laundry: Rest[] = [];
  const toast: Rest[] = [];
  const drips: Rest[] = [];
  const floaters: Rest[] = [];
  const socks: Rest[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    // Outline hulls are children of these nodes and already inherit the sway.
    // Matching their suffix too rotates them twice, through the fabric.
    if (/^Hazard_Wind_Laundry_\d+$/.test(object.name)) laundry.push(rest(object));
    else if (/^Hazard_Toaster_Toast_\d+$/.test(object.name)) toast.push(rest(object, extraNumber(object, "pop_height") ?? 0.55));
    else if (object.name === "Hazard_Sink_Drip") {
      // fall_to is a world height (the bottom of the basin).
      const fallTo = extraNumber(object, "fall_to");
      drips.push(rest(object, fallTo === null ? 1.1 : Math.max(0.2, worldY(object) - fallTo)));
    } else if (/^Floater_\d+$/.test(object.name)) floaters.push(rest(object));
    else if (object.name === "Hazard_Wind_Sock") socks.push(rest(object));
  });
  const all = [...laundry, ...toast, ...drips, ...floaters, ...socks];

  return {
    update(t, wind) {
      for (const piece of laundry) {
        // Sway around the line, harder in gusts, with a flutter on top.
        const gust = wind.strength * 0.18;
        const flutter = fbm1(t * 1.2 + piece.seed, piece.seed) * 0.025;
        const swing = Math.sin(t * 1.35 + piece.seed) * 0.035 + flutter;
        piece.object.rotation.set(
          piece.rotation.x + (swing + wind.z * gust) * 0.9,
          piece.rotation.y,
          // Two pegs constrain sideways roll; most movement is about the line.
          piece.rotation.z - (swing * 0.15 + wind.x * gust * 0.08),
        );
      }
      toast.forEach((piece, index) => {
        // Every ~7 s the toast pops: up, a hang, back down.
        const period = 7;
        const phase = (t + index * 0.12) % period;
        const pop = phase < 0.9 ? Math.sin((phase / 0.9) * Math.PI) : 0;
        piece.object.position.set(piece.position.x, piece.position.y + pop * piece.travel, piece.position.z);
        piece.object.rotation.set(piece.rotation.x + pop * 0.15 * (index ? -1 : 1), piece.rotation.y, piece.rotation.z);
      });
      for (const piece of drips) {
        // A drop forms, falls a unit, and splashes; then again.
        const period = 1.6 + hash01(piece.seed) * 0.6;
        const phase = (t % period) / period;
        const grow = Math.min(1, phase * 3);
        const fall = Math.max(0, phase - 0.4) / 0.6;
        piece.object.position.set(piece.position.x, piece.position.y - fall * fall * piece.travel, piece.position.z);
        const s = fall > 0.95 ? 0 : grow;
        piece.object.scale.set(piece.scale.x * s, piece.scale.y * s * (1 + fall * 0.4), piece.scale.z * s);
      }
      for (const piece of floaters) {
        piece.object.position.y = piece.position.y + Math.sin(t * 1.1 + piece.seed) * 0.025;
        piece.object.rotation.set(
          piece.rotation.x + Math.sin(t * 0.9 + piece.seed) * 0.05,
          piece.rotation.y + Math.sin(t * 0.21 + piece.seed) * 0.08,
          piece.rotation.z + Math.cos(t * 0.8 + piece.seed) * 0.05,
        );
      }
      for (const piece of socks) {
        // The sock points along its local +X: yaw it toward the wind (a slow
        // turn) and let it droop when the gust dies.
        const target = Math.atan2(-wind.z, wind.x);
        const wobble = fbm1(t * 1.4 + piece.seed, piece.seed) * 0.25 * (0.3 + wind.strength);
        const droop = (1 - wind.strength) * 0.9;
        piece.object.rotation.set(piece.rotation.x, target + wobble, piece.rotation.z - droop);
      }
    },
    reset() {
      all.forEach(restore);
    },
  };
}
