import { MathUtils, Vector3 } from "three";
import { describe, expect, test } from "vite-plus/test";
import { FIGHT_SAFE, forwardOf, frameSubjects, type NdcBox, sideOnYaw, subjectsNdcBox, wrapAngle, yawOf } from "./framing";

const deg = MathUtils.degToRad;
const ASPECT = 16 / 9;

/** Where `point` falls across the frame (-1 left .. 1 right) for a camera looking along `forward`. */
function screenX(point: Vector3, position: Vector3, forward: Vector3): number {
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();
  return Math.sign(new Vector3().subVectors(point, position).dot(right));
}

describe("yaw helpers", () => {
  test("wrapAngle keeps angles in (-PI, PI]", () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(deg(-190))).toBeCloseTo(deg(170));
  });

  test("yawOf inverts forwardOf, and yaw 0 looks down -z", () => {
    const forward = forwardOf(0, 0, new Vector3());
    expect(forward.z).toBeCloseTo(-1);
    for (const yaw of [-2.5, -0.4, 0, 1.1, 3]) expect(yawOf(forwardOf(yaw, deg(-15), new Vector3()))).toBeCloseTo(yaw);
  });
});

describe("sideOnYaw", () => {
  const A = new Vector3(-1.6, 0.5, 0);
  const B = new Vector3(1.6, 0.5, 0);

  test("fighters across the set's front: the anchor's own view already is side-on, A on the left", () => {
    const side = sideOnYaw(A, B, 0, null, 1, Math.PI);
    expect(side.aLeft).toBe(true);
    expect(side.yaw).toBeCloseTo(0);
  });

  test("fighters lined up toward the camera: it turns a quarter, and A reads on the left", () => {
    const a = new Vector3(0, 0.5, 1);
    const b = new Vector3(0, 0.5, -1);
    const side = sideOnYaw(a, b, 0, null, 1, Math.PI);
    expect(Math.abs(side.yaw)).toBeCloseTo(Math.PI / 2);
    const forward = forwardOf(side.yaw, 0, new Vector3());
    const camera = new Vector3().addScaledVector(forward, -5);
    expect(screenX(a, camera, forward)).toBe(side.aLeft ? -1 : 1);
    expect(screenX(b, camera, forward)).toBe(side.aLeft ? 1 : -1);
  });

  test("bias and limit hold the turn back from the anchor", () => {
    const a = new Vector3(0, 0.5, 1);
    const b = new Vector3(0, 0.5, -1);
    expect(Math.abs(sideOnYaw(a, b, 0, null, 0.5, Math.PI).yaw)).toBeCloseTo(Math.PI / 4);
    expect(Math.abs(sideOnYaw(a, b, 0, null, 1, deg(30)).yaw)).toBeCloseTo(deg(30));
  });

  test("the screen order sticks unless the other side is clearly nearer the anchor", () => {
    // Swapped places, but only a little past square to the camera: keep A on the left (turn the long way).
    const a = new Vector3(0.2, 0.5, -1);
    const b = new Vector3(-0.2, 0.5, 1);
    const kept = sideOnYaw(a, b, 0, { yaw: 0, aLeft: true }, 1, Math.PI);
    expect(kept.aLeft).toBe(true);
    // Swapped all the way: B on the left now.
    const swapped = sideOnYaw(B, A, 0, { yaw: 0, aLeft: true }, 1, Math.PI);
    expect(swapped.aLeft).toBe(false);
    expect(swapped.yaw).toBeCloseTo(0);
  });

  test("fighters on top of each other hold the last choice", () => {
    const previous = { yaw: 0.7, aLeft: false };
    expect(sideOnYaw(A, A.clone().setX(-1.45), 0, previous, 1, Math.PI)).toEqual(previous);
  });
});

describe("frameSubjects", () => {
  const options = (forward: Vector3, fill: number, extra: Partial<Parameters<typeof frameSubjects>[2]> = {}) => ({
    forward,
    fov: 40,
    aspect: ASPECT,
    safe: FIGHT_SAFE,
    fill,
    minDistance: 1.5,
    maxDistance: 30,
    ...extra,
  });
  const safeW = FIGHT_SAFE.right - FIGHT_SAFE.left;
  const safeH = FIGHT_SAFE.top - FIGHT_SAFE.bottom;

  function framed(targets: Vector3[], forward: Vector3, fill: number, extra = {}) {
    const position = new Vector3();
    const aim = new Vector3();
    const distance = frameSubjects(targets, 1, options(forward, fill, extra), position, aim);
    const box: NdcBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    subjectsNdcBox(targets, 1, position, forward, 40, ASPECT, box);
    const share = Math.max((box.maxX - box.minX) / safeW, (box.maxY - box.minY) / safeH);
    return { position, aim, distance, box, share };
  }

  test("the pair's box takes its share of the safe area, centred in it", () => {
    const forward = forwardOf(0, deg(-18), new Vector3());
    for (const [a, b] of [
      [new Vector3(-1.6, 0.5, 0), new Vector3(1.6, 0.5, 0)],
      [new Vector3(-0.3, 0.5, 0.2), new Vector3(0.4, 0.6, -0.3)],
      [new Vector3(1.2, 0.4, 1.5), new Vector3(0.2, 0.5, 1.1)],
    ] as const) {
      const { box, share } = framed([a, b], forward, 0.7);
      expect(share).toBeCloseTo(0.7, 1);
      expect((box.minX + box.maxX) / 2).toBeCloseTo((FIGHT_SAFE.left + FIGHT_SAFE.right) / 2, 1);
      expect((box.minY + box.maxY) / 2).toBeCloseTo((FIGHT_SAFE.bottom + FIGHT_SAFE.top) / 2, 1);
    }
  });

  test("the camera keeps its view direction and aims along it", () => {
    const forward = forwardOf(deg(35), deg(-12), new Vector3());
    const { position, aim, distance } = framed([new Vector3(-1, 0.5, 0), new Vector3(1, 0.5, 0.5)], forward, 0.6);
    const looking = new Vector3().subVectors(aim, position);
    expect(looking.length()).toBeCloseTo(distance);
    expect(looking.normalize().dot(forward)).toBeCloseTo(1);
  });

  test("a far-apart pair still fits whatever the distance limits say", () => {
    const forward = forwardOf(0, deg(-18), new Vector3());
    const { box } = framed([new Vector3(-3, 0.5, 0), new Vector3(3, 0.5, 0)], forward, 0.7, { maxDistance: 4 });
    expect(box.minX).toBeGreaterThan(FIGHT_SAFE.left - 0.03);
    expect(box.maxX).toBeLessThan(FIGHT_SAFE.right + 0.03);
  });

  test("minSingle comes in on a far-apart pair until each fighter has its height share", () => {
    const forward = forwardOf(0, deg(-18), new Vector3());
    const targets = [new Vector3(-2, 0.5, 0), new Vector3(2, 0.5, 0)];
    const loose = framed(targets, forward, 0.4);
    const tight = framed(targets, forward, 0.4, { minSingle: 0.5 });
    expect(tight.distance).toBeLessThan(loose.distance);
  });
});
