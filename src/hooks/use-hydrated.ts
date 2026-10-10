import { useSyncExternalStore } from "react";

/** For values that never change after mount: there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * `read()` once hydrated, `serverValue` during server rendering and the
 * hydrating render, so both build the same tree. `read` must return a stable
 * value (a primitive, or the same object) between calls.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeToNothing, read, () => serverValue);
}

/** False during server rendering and hydration, true after. */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}
