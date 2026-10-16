// Module worker: meshes creatures off the main thread. One request in, one
// mesh out, with the typed arrays transferred (not copied).

import { resolveSkeleton } from "../../body/skeleton";
import type { Part } from "../../sheet";
import { meshCreature, type MeshData, type MeshRequest } from "./mesher";

export interface WorkerRequest {
  id: number;
  request: MeshRequest;
}

export type WorkerResponse = { id: number; mesh: MeshData } | { id: number; error: string };

// A fresh worker's first few meshes run 3-6x slower than warm ones while the
// JIT collects type feedback, which is exactly when a forge is growing its
// first parts. Mesh a throwaway body that touches every primitive kind
// (sphere, capsule, cone, box, flattened wing/fin/ear, mirrored legs) before
// taking requests.
function warmUp() {
  const p = (
    id: string,
    role: Part["role"],
    shape: Part["shape"],
    parent: string | null,
    anchor: Part["anchor"],
    mirror = false,
  ): Part => ({ id, role, shape, size: "M", elongation: "normal", parent, anchor, color: "primary", mirror });
  const parts: Part[] = [
    p("t", "torso", "capsule", null, null),
    p("h", "head", "sphere", "t", "top"),
    p("e", "ear", "cone", "h", "left", true),
    p("w", "wing", "capsule", "t", "back", true),
    p("l1", "leg", "capsule", "t", "leg1"),
    p("l2", "leg", "capsule", "t", "leg2"),
    p("a", "arm", "cone", "t", "arm1"),
    p("i", "item", "box", "a", "bottom"),
    p("f", "fin", "cone", "t", "top"),
  ];
  const bones = resolveSkeleton(parts, { bodyPlan: "BIPED" }).bones;
  const palette = { primary: "#E8553D", secondary: "#F5C94C", accent: "#2F6FB0" };
  for (const resolution of [32, 48, 48, 48, 48, 48]) meshCreature({ bones, palette, resolution });
}

try {
  warmUp();
} catch {
  // Warm-up is an optimisation only.
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const mesh = meshCreature(request);
    const transfer = [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.colors.buffer,
      mesh.finish.buffer,
      mesh.skinIndex.buffer,
      mesh.skinWeight.buffer,
      mesh.index.buffer,
    ];
    (self as unknown as Worker).postMessage({ id, mesh } satisfies WorkerResponse, transfer);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: String(error) } satisfies WorkerResponse);
  }
};
