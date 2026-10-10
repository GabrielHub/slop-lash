"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import { motion, useAnimate, useReducedMotion } from "motion/react";

export type ShakeKind = "soft" | "hard";
export type FlashTone = "win" | "fail" | "gold";

export interface StageFx {
  /** Shakes the stage scene once. Ignored on phones and under reduced motion. */
  shake(kind?: ShakeKind): void;
  /**
   * A brief full-stage colour flash: screened at 0.2 on dark, multiplied at
   * half that on light. Ignored under reduced motion.
   */
  flash(tone?: FlashTone): void;
}

const NOOP: StageFx = { shake: () => {}, flash: () => {} };
const StageFxContext = createContext<StageFx>(NOOP);

/** Effects for whatever is inside a `StageFxProvider`; a no-op anywhere else (e.g. phones). */
export function useStageFx(): StageFx {
  return useContext(StageFxContext);
}

const SHAKES: Record<ShakeKind, { x: number[]; duration: number }> = {
  soft: { x: [0, -5, 4, -2, 0], duration: 0.26 },
  hard: { x: [0, -12, 10, -6, 4, 0], duration: 0.36 },
};

const FLASH_COLOR: Record<FlashTone, string> = {
  win: "var(--win)",
  fail: "var(--fail)",
  gold: "var(--gold)",
};

/** Back-to-back cues (two stamps on one beat) shake or flash once. */
const MIN_GAP_MS = 400;

function lightTheme() {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) return theme === "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

/**
 * Wraps the stage scene so moments can shake it or flash it. The shell
 * provides one around the stage column.
 */
export function StageFxProvider({
  children,
  className = "relative flex-1 flex flex-col min-h-0",
}: {
  children: ReactNode;
  className?: string;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const flashRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const last = useRef({ shake: 0, flash: 0 });

  const shake = useCallback(
    (kind: ShakeKind = "soft") => {
      const now = performance.now();
      if (reduced || !scope.current || now - last.current.shake < MIN_GAP_MS) return;
      last.current.shake = now;
      const { x, duration } = SHAKES[kind];
      void animate(scope.current, { x }, { duration, ease: "easeOut" });
    },
    [animate, reduced, scope],
  );

  const flash = useCallback(
    (tone: FlashTone = "gold") => {
      const element = flashRef.current;
      const now = performance.now();
      if (reduced || !element || now - last.current.flash < MIN_GAP_MS) return;
      last.current.flash = now;
      // Screen does nothing on a light page; multiply tints it instead, gently.
      const light = lightTheme();
      element.style.background = FLASH_COLOR[tone];
      element.style.mixBlendMode = light ? "multiply" : "screen";
      const peak = light ? 0.1 : 0.2;
      void animate(element, { opacity: [0, peak, 0] }, { duration: 0.4, ease: "easeOut" });
    },
    [animate, reduced],
  );

  const value = useMemo(() => ({ shake, flash }), [shake, flash]);

  return (
    <StageFxContext value={value}>
      <motion.div ref={scope} className={className}>
        {children}
        <div
          ref={flashRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30 opacity-0"
        />
      </motion.div>
    </StageFxContext>
  );
}
