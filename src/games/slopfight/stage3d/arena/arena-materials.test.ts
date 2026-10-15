import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, type ShaderMaterial } from "three";
import { describe, expect, it } from "vite-plus/test";
import { ARENA_MOODS } from "../look/moods";
import type { ToonMaterial } from "../look/toon";
import { prepareSet } from "./arena";

describe("authored arena finishes", () => {
  it("does not reflect inactive station lights in the garage water", () => {
    const geometry = new BoxGeometry();
    const original = new MeshBasicMaterial();
    const root = new Group();
    const water = new Mesh(geometry, original);
    water.name = "Hazard_Water";
    root.add(water);
    for (const [name, phases] of [["Light_Tube", undefined], ["Light_Work_Build", ["BUILD", "UPGRADE"]]] as const) {
      const light = new Object3D();
      light.name = name;
      light.position.set(name === "Light_Tube" ? 0 : -7.5, 5, 0);
      light.userData = { light_kind: "spot", light_intensity: 20, light_color: "#ffffff", light_phases: phases };
      root.add(light);
    }
    const prepared = prepareSet("FLOODED_GARAGE", root, ARENA_MOODS.FLOODED_GARAGE);
    try {
      const material = (prepared.root.getObjectByName("Hazard_Water") as Mesh).material as ShaderMaterial;
      expect(material.uniforms.uLightCount!.value).toBe(1);
      expect(material.uniforms.uLightPos!.value[0].toArray()).toEqual([0, 5, 0]);
    } finally {
      prepared.materials.forEach((material) => material.dispose());
      geometry.dispose();
      original.dispose();
    }
  });

  it("shares a finish within each dressed set, preserves source assets, and isolates different finish uniforms", () => {
    const geometry = new BoxGeometry();
    const original = new MeshBasicMaterial();
    const source = new Group();
    for (const [name, surface] of [
      ["Floor", "matte"],
      ["Concrete", "matte"],
      ["Trim", "satin"],
      ["Ceramic", "gloss"],
      ["Toy", "toy"],
      ["Unmarked", undefined],
      ["Unknown", "invalid-finish"],
    ] as const) {
      const mesh = new Mesh(geometry, original);
      mesh.name = name;
      if (surface !== undefined) mesh.userData.sf_surface = surface;
      source.add(mesh);
    }

    const first = prepareSet("FLOODED_GARAGE", source, ARENA_MOODS.FLOODED_GARAGE);
    const second = prepareSet("FLOODED_GARAGE", source, ARENA_MOODS.FLOODED_GARAGE);
    const finish = (name: string) => (first.root.getObjectByName(name) as Mesh).material as ToonMaterial;
    try {
      expect(finish("Floor")).toBe(finish("Concrete"));
      expect(finish("Unmarked")).toBe(finish("Toy"));
      expect(finish("Unknown")).toBe(finish("Toy"));
      const materials = [finish("Floor"), finish("Trim"), finish("Ceramic"), finish("Toy")];
      expect(new Set(materials).size).toBe(4);
      expect(new Set(first.materials)).toEqual(new Set(materials));
      expect(new Set(materials.map((material) => material.customProgramCacheKey())).size).toBe(1);
      expect(finish("Floor").userData.toon.uSpec.value).toBeLessThan(finish("Trim").userData.toon.uSpec.value);
      expect(finish("Trim").userData.toon.uSpec.value).toBeLessThan(finish("Ceramic").userData.toon.uSpec.value);

      const satinSpecular = finish("Trim").userData.toon.uSpec.value;
      const secondMatte = (second.root.getObjectByName("Floor") as Mesh).material as ToonMaterial;
      const otherSetSpecular = secondMatte.userData.toon.uSpec.value;
      finish("Floor").userData.toon.uSpec.value = 0.9;
      expect(finish("Trim").userData.toon.uSpec.value).toBe(satinSpecular);
      expect(secondMatte.userData.toon.uSpec.value).toBe(otherSetSpecular);
      for (const mesh of source.children as Mesh[]) expect(mesh.material).toBe(original);
    } finally {
      [...first.materials, ...second.materials].forEach((material) => material.dispose());
      geometry.dispose();
      original.dispose();
    }
  });
});
