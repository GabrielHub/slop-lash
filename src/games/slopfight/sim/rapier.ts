// The deterministic Rapier build (decision 1 in the build plan): one memoized
// init per JS realm. The compat package inlines its WASM, so this works the
// same in a Convex Node action, the browser stage and vitest.

import type RAPIER_NS from "@dimforge/rapier3d-deterministic-compat";

export type Rapier = typeof RAPIER_NS;

let loading: Promise<Rapier> | null = null;

/** Memoized init of `@dimforge/rapier3d-deterministic-compat`. */
export function loadRapier(): Promise<Rapier> {
  loading ??= import("@dimforge/rapier3d-deterministic-compat").then(async (module) => {
    const rapier = (module.default ?? module) as Rapier;
    await rapier.init();
    return rapier;
  });
  return loading;
}
