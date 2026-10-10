import { DoubleSide, InstancedMesh, Mesh } from "three";
import { describe, expect, it, vi } from "vite-plus/test";
import { createProgramWarmup } from "./program-cache";

describe("stage program warmup", () => {
  it("owns persistent shader variants and releases each resource at stage disposal", () => {
    const warmup = createProgramWarmup();
    expect(warmup.root.visible).toBe(false);
    const meshes = warmup.root.children.filter((child) => child instanceof Mesh);
    expect(meshes.some((mesh) => mesh.type === "SkinnedMesh")).toBe(true);
    const instances = meshes.filter((mesh) => mesh instanceof InstancedMesh);
    expect(instances).toHaveLength(2);
    expect(instances.some((mesh) => !Array.isArray(mesh.material) && mesh.material.side === DoubleSide)).toBe(true);
    const materials = meshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
    expect(materials.filter((material) => !material.fog && material.transparent && !material.depthTest)).toHaveLength(2);
    const disposed = materials.map((material) => vi.spyOn(material, "dispose"));
    const instanceDisposals = instances.map((mesh) => vi.spyOn(mesh, "dispose"));
    const geometry = vi.spyOn(meshes[0]!.geometry, "dispose");
    warmup.dispose();
    expect(warmup.root.children).toHaveLength(0);
    expect(geometry).toHaveBeenCalledTimes(1);
    disposed.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    instanceDisposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
