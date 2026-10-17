"use client";

import { useCallback, useLayoutEffect, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { warpAmbient } from "@/lib/ambient-events";
import { prefersReducedMotion } from "@/lib/animations";
import {
  WARP_FEATHER,
  WARP_GATHER_MS,
  WARP_GIVE_UP_MS,
  WARP_REVEAL_MS,
  warpReach,
  warpWave,
} from "@/lib/warp-transition";

/**
 * The page half of the warp between screens (`src/lib/warp-transition.ts`).
 * A link whose onClick is `useWarpLink()` pulls the starfield into itself:
 * whatever is marked `data-warp-fade` leaves, whatever is marked
 * `data-warp-pull` falls in with the stars, and the link charges up and
 * collapses to a point. `<WarpArrival />` (in the root layout) bursts the sky
 * back out once the next route renders, and reveals its `data-warp-root` from
 * that point behind the shockwave.
 */

interface PendingWarp {
  pathname: string;
  x: number;
  y: number;
  /** Puts the screen back, should the next one never come. */
  restore: () => void;
  timers: number[];
}

let pending: PendingWarp | null = null;

const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Gravity: a slow start that keeps accelerating. */
const EASE_FALL = "cubic-bezier(0.55, 0, 0.85, 0.3)";

/** Plays the screen's exit around the pressed link; returns how to undo it. */
function exit(link: HTMLElement, x: number, y: number) {
  const animations: Animation[] = [];
  const glow =
    getComputedStyle(document.documentElement).getPropertyValue("--punch").trim() || "currentColor";

  // Everything else gives the sky the stage, shrinking toward the link: what
  // sits nearest goes first, like a ripple from it.
  const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
  document.querySelectorAll<HTMLElement>("[data-warp-fade]").forEach((element) => {
    if (element.contains(link)) return;
    const box = element.getBoundingClientRect();
    if (!box.width) return;
    const gap = Math.hypot(
      x - Math.min(Math.max(x, box.left), box.right),
      y - Math.min(Math.max(y, box.top), box.bottom),
    );
    const transformOrigin = `${x - box.left}px ${y - box.top}px`;
    animations.push(
      element.animate(
        [
          { opacity: 1, filter: "blur(0px)", transform: "scale(1)", transformOrigin },
          { opacity: 0, filter: "blur(6px)", transform: "scale(0.92)", transformOrigin },
        ],
        {
          duration: 280,
          delay: 240 * Math.min(1, gap / diagonal),
          easing: EASE_IN,
          fill: "forwards",
        },
      ),
    );
  });

  // Anything marked to be pulled in falls with the stars: the nearest lands first.
  document.querySelectorAll<HTMLElement>("[data-warp-pull]").forEach((element) => {
    const box = element.getBoundingClientRect();
    if (!box.width) return;
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    const timing = {
      duration: Math.min(560, 300 + 0.28 * Math.hypot(dx, dy)),
      delay: Math.random() * 60,
      easing: EASE_FALL,
      fill: "forwards" as const,
    };
    // Added on top of its own float, so it leaves from exactly where it was.
    animations.push(
      element.animate(
        { transform: ["translate(0, 0) scale(1)", `translate(${dx}px, ${dy}px) scale(0.1)`] },
        { ...timing, composite: "add" },
      ),
      element.animate({ opacity: [1, 1, 0], offset: [0, 0.7, 1] }, timing),
    );
  });

  // The link charges as the light lands in it, then collapses to a point.
  animations.push(
    link.animate(
      [
        {
          transform: "scale(1)",
          filter: `brightness(1) drop-shadow(0 0 0px ${glow})`,
          easing: EASE_OUT,
        },
        {
          transform: "scale(1.06)",
          filter: `brightness(1.3) drop-shadow(0 0 22px ${glow})`,
          opacity: 1,
          offset: 0.72,
          easing: EASE_IN,
        },
        {
          transform: "scale(0)",
          filter: `brightness(2.6) drop-shadow(0 0 4px ${glow})`,
          opacity: 0,
        },
      ],
      { duration: WARP_GATHER_MS, fill: "forwards" },
    ),
  );

  return () => animations.forEach((animation) => animation.cancel());
}

/** Reveals the screen's `data-warp-root` from (x, y), on the shockwave's schedule. */
function reveal(x: number, y: number) {
  const root = document.querySelector<HTMLElement>("[data-warp-root]");
  if (!root) return;
  const reach = warpReach(x, y, window.innerWidth, window.innerHeight);
  const box = root.getBoundingClientRect();
  const cx = x - box.left;
  const cy = y - box.top;
  const start = performance.now();
  const paint = (now: number) => {
    const t = Math.max(0, (now - start) / WARP_REVEAL_MS);
    if (t >= 1) {
      root.style.removeProperty("mask-image");
      root.style.removeProperty("-webkit-mask-image");
      return;
    }
    const r = reach * warpWave(t);
    const mask = `radial-gradient(circle at ${cx}px ${cy}px, #000 ${Math.max(0, r - WARP_FEATHER)}px, transparent ${r}px)`;
    root.style.setProperty("mask-image", mask);
    root.style.setProperty("-webkit-mask-image", mask);
    requestAnimationFrame(paint);
  };
  paint(start);
}

/** Bursts the sky back out and reveals whatever screen is up now. */
function land(warp: PendingWarp) {
  warp.timers.forEach((timer) => window.clearTimeout(timer));
  warpAmbient({ kind: "burst" });
  reveal(warp.x, warp.y);
}

/**
 * An onClick for a `<Link>` that warps to its href. A plain left click only:
 * modified clicks (a new tab) and reduced motion navigate as usual.
 */
export function useWarpLink() {
  const router = useRouter();
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (prefersReducedMotion()) return;
      const link = event.currentTarget;
      const href = link.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      if (pending) return;
      router.prefetch(href);
      const box = link.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      warpAmbient({ kind: "gather", x: box.left, y: box.top, w: box.width, h: box.height });
      const warp: PendingWarp = {
        pathname: new URL(href, window.location.href).pathname,
        x,
        y,
        restore: exit(link, x, y),
        timers: [],
      };
      pending = warp;
      warp.timers.push(
        window.setTimeout(() => router.push(href), WARP_GATHER_MS),
        // The next screen never came: burst back out over this one.
        window.setTimeout(() => {
          if (pending !== warp) return;
          pending = null;
          warp.restore();
          land(warp);
        }, WARP_GATHER_MS + WARP_GIVE_UP_MS),
      );
    },
    [router],
  );
}

/** Lands a warp when its route renders. Mount once, in the root layout. */
export function WarpArrival() {
  const pathname = usePathname();
  // Before paint, so the new screen never shows a frame ahead of its reveal.
  useLayoutEffect(() => {
    const warp = pending;
    if (!warp || warp.pathname !== pathname) return;
    pending = null;
    land(warp);
  }, [pathname]);
  return null;
}
