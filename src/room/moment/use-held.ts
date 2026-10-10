"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps showing the previous `value` until `release` is true, so a change that
 * arrived early (new scores with the reveal) visibly lands on its beat.
 * Display only, and only where the component stays mounted across the change.
 * `value` may be built during render (an array, an object): only the last
 * released one is kept, and nothing re-renders to keep it.
 */
export function useHeld<T>(value: T, release: boolean): T {
  const released = useRef(value);
  useEffect(() => {
    if (release) released.current = value;
  });
  // Only ever the last released value, kept for display; reading it here is the point.
  // eslint-disable-next-line react-hooks/refs
  return release ? value : released.current;
}
