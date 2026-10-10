import { Matrix4, Quaternion, Sphere, Vector3 } from "three";
import { describe, expect, it } from "vite-plus/test";
import { updateSkinBounds } from "./bounds";

describe("animated skin bounds", () => {
  it("encloses translated, scaled ragdoll limbs and their blended vertices", () => {
    const rest = new Sphere(new Vector3(0, 1, 0), 2);
    const matrices = [
      new Matrix4().makeTranslation(-8, -15, 2),
      new Matrix4().compose(new Vector3(3, -9, -4), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1), new Vector3(2, 0.5, 1)),
    ];
    const bounds = new Sphere();
    updateSkinBounds(bounds, rest, matrices);
    for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
      for (const sign of [-1, 1]) {
        const vertex = rest.center.clone().addScaledVector(axis, rest.radius * sign);
        const a = vertex.clone().applyMatrix4(matrices[0]!);
        const b = vertex.clone().applyMatrix4(matrices[1]!);
        for (const weight of [0, 0.25, 0.5, 0.75, 1]) {
          expect(a.clone().lerp(b, weight).distanceTo(bounds.center)).toBeLessThanOrEqual(bounds.radius + 1e-9);
        }
      }
    }
    expect(rest).toEqual(new Sphere(new Vector3(0, 1, 0), 2));
  });

  it("replaces the previous frame's bounds instead of accumulating motion", () => {
    const rest = new Sphere(new Vector3(), 1);
    const bounds = new Sphere();
    updateSkinBounds(bounds, rest, [new Matrix4().makeTranslation(100, 0, 0)]);
    updateSkinBounds(bounds, rest, [new Matrix4()]);
    expect(bounds).toEqual(rest);
  });
});
