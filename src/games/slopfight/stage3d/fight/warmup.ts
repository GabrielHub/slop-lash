// Initializing Rapier loads the WASM but does not execute its cold contact and
// joint solvers. Exercise those paths while the stage initially loads, before
// a real fight's first physics step shares a frame with its title and meshes.

import { loadRapier, type Rapier } from "../../sim";

let warming: Promise<void> | null = null;

export function warmFightPhysics(): Promise<void> {
  warming ??= loadRapier().then(warmSolver);
  return warming;
}

/** A disposable contact + spherical joint; no champion, seed or gameplay state. */
export function warmSolver(R: Rapier): void {
  const world = new R.World({ x: 0, y: -12, z: 0 });
  try {
    world.createCollider(R.ColliderDesc.cuboid(2, 0.1, 2).setTranslation(0, -0.1, 0));
    const torso = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.2, 0));
    const limb = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.6, 0));
    world.createCollider(R.ColliderDesc.ball(0.25), torso);
    world.createCollider(R.ColliderDesc.capsule(0.15, 0.1), limb);
    world.createImpulseJoint(
      R.JointData.spherical({ x: 0, y: 0.2, z: 0 }, { x: 0, y: -0.2, z: 0 }),
      torso,
      limb,
      true,
    );
    world.step();
    world.step();
  } finally {
    world.free();
  }
}
