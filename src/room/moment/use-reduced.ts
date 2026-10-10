"use client";

import { useReducedMotion } from "motion/react";
import { useHydrated } from "@/hooks/use-hydrated";

/**
 * The OS "reduce motion" setting, read only once hydration is over. The
 * server can't know it, so a component that renders differently under it
 * must render the server's tree first; on a client-only mount (anything that
 * appears after the first paint) this is the real setting from the first
 * frame.
 */
export function useReducedAfterMount(): boolean {
  const reduced = useReducedMotion();
  return useHydrated() && reduced === true;
}
