"use client";

// Clicking things in the set: pointer handlers for a mesh or group, and a
// pointer cursor while it is hovered (drei's useCursor puts the cursor back
// when the hover ends or the thing unmounts).

import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";

/** Pointer handlers for a clickable mesh or group; `onPress: null` turns it off. */
export function usePress(onPress: (() => void) | null) {
  const [hover, setHover] = useState(false);
  const hovered = hover && !!onPress;
  useCursor(hovered);
  return {
    hover: hovered,
    handlers: {
      onClick: (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onPress?.();
      },
      onPointerOver: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHover(true);
      },
      onPointerOut: () => setHover(false),
    },
  };
}
