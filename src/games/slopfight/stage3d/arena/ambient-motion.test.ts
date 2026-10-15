import { Group, Object3D } from "three";
import { describe, expect, it } from "vite-plus/test";
import { flickerAt, hash01 } from "../director/noise";
import { CrowdController } from "./crowd";
import { createHazardAnimators } from "./hazards";

describe("clothesline motion", () => {
  it("moves each garment once without rotating its outline through the fabric", () => {
    const root = new Group();
    const cloth = new Object3D();
    cloth.name = "Hazard_Wind_Laundry_5";
    cloth.position.set(2, 3, -8);
    const hull = new Object3D();
    hull.name = `${cloth.name}__outline`;
    cloth.add(hull);
    root.add(cloth);
    const motion = createHazardAnimators(root);
    for (let t = 0; t < 12; t += 1 / 60) {
      motion.update(t, { x: 0.6, z: 0.8, strength: 1 });
      expect(hull.rotation.toArray()).toEqual([0, 0, 0, "XYZ"]);
      expect(hull.position.toArray()).toEqual([0, 0, 0]);
      expect(Math.abs(cloth.rotation.z)).toBeLessThan(0.04);
    }
    expect(cloth.rotation.x).not.toBe(0);
    motion.reset();
    expect(cloth.rotation.toArray()).toEqual([0, 0, 0, "XYZ"]);
    expect(cloth.position.toArray()).toEqual([2, 3, -8]);
  });
});

function crowd() {
  const objects = Array.from({ length: 20 }, (_, i) => {
    const object = new Object3D();
    object.position.set(i, 2, -8);
    object.rotation.set(0.1, i * 0.3, 0.04);
    object.scale.set(0.9, 1.1, 0.95);
    return object;
  });
  const controller = new CrowdController();
  controller.bind(objects);
  return { controller, objects };
}

describe("crowd choreography", () => {
  it("keeps idle spectators grounded, with small independent breathing and turns", () => {
    const { controller, objects } = crowd();
    const initial = objects.map((o) => o.quaternion.clone());
    for (let frame = 0; frame < 600; frame++) {
      controller.update(1 / 60);
      for (const [i, object] of objects.entries()) {
        expect(object.position.toArray()).toEqual([i, 2, -8]);
        expect(object.scale.y).toBeGreaterThan(1.08);
        expect(object.scale.y).toBeLessThan(1.12);
        expect(object.quaternion.angleTo(initial[i]!)).toBeLessThan(0.065);
      }
    }
    expect(new Set(objects.map((o) => o.scale.y)).size).toBe(20);
  });

  it("anticipates, jumps in a wave, lands continuously, and settles", () => {
    const { controller, objects } = crowd();
    controller.cheer(1);
    const launchFrames = new Map<number, number>();
    const compressed = new Set<number>();
    let previous = objects.map((o) => o.scale.y);
    for (let frame = 0; frame < 360; frame++) {
      controller.update(1 / 120);
      objects.forEach((object, i) => {
        if (object.position.y === 2 && object.scale.y < 1.065) compressed.add(i);
        if (object.position.y > 2.001 && !launchFrames.has(i)) {
          expect(compressed.has(i)).toBe(true);
          launchFrames.set(i, frame);
        }
        expect(object.position.y).toBeGreaterThanOrEqual(2);
        expect(object.position.y).toBeLessThan(2.43);
        expect(Math.abs(object.scale.y - previous[i]!)).toBeLessThan(0.025);
      });
      previous = objects.map((o) => o.scale.y);
    }
    expect(launchFrames.size).toBe(20);
    expect(new Set(launchFrames.values()).size).toBeGreaterThan(8);
    for (const object of objects) expect(object.position.y).toBe(2);
  });

  it("has the same cheer poses at different frame rates, including after a long frame", () => {
    const a = crowd(), b = crowd(), c = crowd();
    for (const fixture of [a, b, c]) fixture.controller.cheer(1);
    for (let sample = 0; sample < 20; sample++) {
      for (let i = 0; i < 3; i++) a.controller.update(1 / 30);
      for (let i = 0; i < 12; i++) b.controller.update(1 / 120);
      c.controller.update(0.1);
      for (let i = 0; i < 20; i++) {
        expect(a.objects[i]!.position.distanceTo(b.objects[i]!.position)).toBeLessThan(1e-10);
        expect(a.objects[i]!.scale.distanceTo(c.objects[i]!.scale)).toBeLessThan(1e-10);
      }
    }
  });

  it("freezes in hit stop and restores complete authored transforms when unbound", () => {
    const { controller, objects } = crowd();
    const rest = objects.map((o) => ({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
    controller.cheer();
    controller.update(0.4);
    const pose = objects.map((o) => [o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()]);
    controller.update(0);
    expect(objects.map((o) => [o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()])).toEqual(pose);
    controller.reset();
    expect(controller.energy).toBe(0);
    expect(controller.size).toBe(0);
    objects.forEach((o, i) => {
      expect(o.position).toEqual(rest[i]!.p);
      expect(o.quaternion.toArray()).toEqual(rest[i]!.q.toArray());
      expect(o.scale).toEqual(rest[i]!.s);
    });
  });
});

it("keeps presentation random values in their promised unsigned range", () => {
  const samples = Array.from({ length: 1024 }, (_, i) => hash01(i, 21));
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...samples)).toBeLessThan(1);
  expect(Math.max(...samples)).toBeGreaterThan(0.9);
});

it("keeps emissive variation slow and bounded even at the highest authored flicker", () => {
  for (const amount of [0, 0.05, 0.3, 1]) {
    let last = flickerAt(amount, 0, 300);
    for (let frame = 1; frame < 60 * 120; frame++) {
      const value = flickerAt(amount, frame / 60, 300);
      expect(value).toBeGreaterThanOrEqual(1 - amount * 0.1);
      expect(value).toBeLessThanOrEqual(1);
      expect(Math.abs(value - last)).toBeLessThan(0.003);
      last = value;
    }
  }
});
