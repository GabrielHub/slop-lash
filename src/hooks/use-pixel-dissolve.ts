"use client";

import { useCallback } from "react";
import { emitDissolve } from "@/lib/dissolve-events";
import { prefersReducedMotion } from "@/lib/animations";

interface DissolveOptions {
  particleCount?: number;
  colors?: string[];
}

/** Controls stay visible while they dissolve: their request may still fail. */
const CONTROL = "button, a, input, select, textarea, [role='button']";

/**
 * Sends a burst of pixels flying up from an element. A control (Send, Vote,
 * Join) stays where it is, so a failed request never leaves an invisible
 * button; anything else (a decorative icon) dissolves away and re-forms.
 */
export function usePixelDissolve(options: DissolveOptions = {}) {
  const triggerElement = useCallback(
    (el: HTMLElement) => {
      if (prefersReducedMotion()) return;

      const rect = el.getBoundingClientRect();
      const hide = !el.closest(CONTROL);
      if (hide) el.style.visibility = "hidden";

      emitDissolve({
        sourceRect: rect,
        colors: options.colors,
        particleCount: options.particleCount,
        onSequenceComplete: hide
          ? () => {
              el.style.transition = "opacity 300ms ease-in";
              el.style.opacity = "0";
              el.style.visibility = "visible";
              requestAnimationFrame(() => {
                el.style.opacity = "1";
                window.setTimeout(() => {
                  el.style.removeProperty("transition");
                  el.style.removeProperty("opacity");
                  el.style.removeProperty("visibility");
                }, 300);
              });
            }
          : undefined,
      });

      // Safety net: restore the element even if the overlay never reports back.
      if (hide) {
        window.setTimeout(() => {
          if (el.style.visibility === "hidden") {
            el.style.removeProperty("visibility");
            el.style.removeProperty("transition");
            el.style.removeProperty("opacity");
          }
        }, 4000);
      }
    },
    [options.colors, options.particleCount],
  );

  return { triggerElement };
}
