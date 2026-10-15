import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vite-plus/test";
import { ARENA_IDS, ARENAS, isOverFloor } from "../../arenas";
import { ContactShadowCasters, createContactShadowReceiver } from "./contact-shadow-geometry";

describe("contact-shadow receiver", () => {
  it.each(ARENA_IDS)("covers only the canonical floor in %s", (arena) => {
    const geometry = ARENAS[arena].geometry;
    const receiver = createContactShadowReceiver(geometry, 7.2);
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(receiver, material);
    const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
    // Includes the sink centre and both sides of its rims, plus all outside edges.
    for (const x of [-3.1, -2.9, -0.95, -0.85, 0, 0.85, 0.95, 2.9, 3.1]) {
      for (const z of [-3.1, -2.9, -2.65, -2.55, -2, -1.45, -1.35, 0, 2.9, 3.1]) {
        ray.ray.origin.set(x, 2, z);
        expect(ray.intersectObject(mesh).length > 0, `floor at ${x},${z}`).toBe(isOverFloor(geometry, x, z));
      }
    }
    const position = receiver.getAttribute("position");
    const uv = receiver.getAttribute("uv");
    for (let i = 0; i < position.count; i += 1) {
      expect(uv.getX(i)).toBeCloseTo(position.getX(i) / 7.2 + 0.5);
      expect(uv.getY(i)).toBeCloseTo(position.getZ(i) / 7.2 + 0.5);
    }
    receiver.dispose();
    material.dispose();
  });
});

describe("contact-shadow caster isolation", () => {
  it("excludes outlines, overlays and transparent effects while preserving nested casters", () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    const solid = new MeshBasicMaterial();
    const transparent = new MeshBasicMaterial({ transparent: true });
    const overlay = new MeshBasicMaterial({ depthTest: false });
    const outline = new Mesh(geometry, solid);
    const childCaster = new Mesh(geometry, solid);
    childCaster.castShadow = true;
    outline.add(childCaster);
    const fx = new Mesh(geometry, transparent);
    const ui = new Mesh(geometry, overlay);
    fx.castShadow = ui.castShadow = true;
    const hidden = new Mesh(geometry, solid);
    hidden.visible = false;
    root.add(outline, fx, ui, hidden);
    outline.layers.set(3);
    const casters = new ContactShadowCasters();
    casters.render(root, () => {
      expect(outline.visible).toBe(true);
      expect(outline.layers.mask).toBe(0);
      expect(childCaster.layers.mask).toBe(1);
      expect(fx.layers.mask).toBe(0);
      expect(ui.layers.mask).toBe(0);
      expect(hidden.visible).toBe(false);
    });
    expect(outline.layers.mask).toBe(8);
    expect(childCaster.layers.mask).toBe(1);
    expect(fx.layers.mask).toBe(1);
    expect(ui.layers.mask).toBe(1);
    geometry.dispose();
    [solid, transparent, overlay].forEach((material) => material.dispose());
  });

  it("restores layers after a failed capture and can render the next frame", () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.layers.set(2);
    const casters = new ContactShadowCasters();
    expect(() => casters.render(mesh, () => { throw new Error("capture failed"); })).toThrow("capture failed");
    expect(mesh.layers.mask).toBe(4);
    mesh.castShadow = true;
    casters.render(mesh, () => expect(mesh.layers.mask).toBe(4));
    expect(mesh.layers.mask).toBe(4);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
