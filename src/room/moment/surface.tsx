"use client";

import { createContext, useContext } from "react";

/**
 * Which screen a component is drawn on. The stage is the shared TV, choreographed
 * and loud; a phone is one player's controller, snappy and quiet (haptics, no
 * shake, flash or confetti). The shell provides it around each column.
 */
export type Surface = "stage" | "phone";

const SurfaceContext = createContext<Surface>("stage");

export const SurfaceProvider = SurfaceContext.Provider;

export function useSurface(): Surface {
  return useContext(SurfaceContext);
}
