"use client";

import { useCallback } from "react";
import { emitDissolve } from "@/lib/dissolve-events";

interface DissolveOptions {
  particleCount?: number;
  colors?: string[];
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function usePixelDissolve(options: DissolveOptions = {}) {
  const triggerElement = useCallback(
    (el: HTMLElement) => {
      if (prefersReducedMotion()) return;

      const rect = el.getBoundingClientRect();

      // Hide the source element
      el.style.visibility = "hidden";

      emitDissolve({
        sourceRect: rect,
        colors: options.colors,
        particleCount: options.particleCount,
        onSequenceComplete: () => {
          // Fade the element back in
          el.style.transition = "opacity 300ms ease-in";
          el.style.opacity = "0";
          el.style.visibility = "visible";
          requestAnimationFrame(() => {
            el.style.opacity = "1";
            // Clean up inline styles after transition
            setTimeout(() => {
              el.style.removeProperty("transition");
              el.style.removeProperty("opacity");
              el.style.removeProperty("visibility");
            }, 300);
          });
        },
      });

      // Safety fallback: restore element even if callbacks fail
      setTimeout(() => {
        if (el.style.visibility === "hidden") {
          el.style.removeProperty("visibility");
          el.style.removeProperty("transition");
          el.style.removeProperty("opacity");
        }
      }, 5000);
    },
    [options.colors, options.particleCount]
  );

  return { triggerElement };
}
