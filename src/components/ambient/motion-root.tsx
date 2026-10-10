"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * App-wide motion defaults: motion/react follows the OS "reduce motion"
 * setting, so transforms and layout animations become instant while opacity
 * fades remain.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
