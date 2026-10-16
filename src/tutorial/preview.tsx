"use client";

import { useEffect, useRef, useState, type ComponentType, type RefObject } from "react";
import { useReducedMotion } from "motion/react";
import type { GameType } from "@/games/core/types";
import { GAME_META } from "@/games/meta";
import { Board } from "./board";
import { ClockProvider, TutorialClock } from "./clock";
import { PREVIEWS } from "./previews";

/**
 * A game's preview: a short, silent spot that loops on the host page, drawn
 * with the tutorial kit on the same 1920x1080 board. It is code, not video,
 * so it costs a script chunk instead of a media download.
 */
export interface PreviewSpot {
  /** Draws the frame for the current time (`useTime`, 0 to `duration`, then back to 0). */
  Scene: ComponentType;
  /** Seconds in one loop. Its last frame leads cleanly into its first. */
  duration: number;
  /** The key-art frame, held when motion is reduced. */
  poster: number;
}

/** Loads a preview's spot; the import is cached, so calling it again is free. */
export type PreviewLoader = () => Promise<PreviewSpot>;

/** Frames closer together than this are skipped, so a 120 Hz screen draws at 60. */
const MIN_FRAME_MS = 10;

function useSpot(load: PreviewLoader): PreviewSpot | null {
  const [loaded, setLoaded] = useState<{ load: PreviewLoader; spot: PreviewSpot } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void load().then((spot) => {
      if (!cancelled) setLoaded({ load, spot });
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  return loaded?.load === load ? loaded.spot : null;
}

/** Whether `element` is at least partly on screen. */
function useOnScreen(element: RefObject<HTMLElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);
  return onScreen;
}

/** The game's name on a plain board while its spot loads. */
function Loading({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <p className="font-display text-[200px] font-black tracking-tight text-punch opacity-40">
        {name}
      </p>
    </div>
  );
}

/**
 * Loops a game's preview spot in its own theme, scaled to fill its container
 * (which must have a size). It runs only while on screen, and holds the poster
 * frame when motion is reduced. `frozenAt` holds one frame, for review and capture.
 */
export function PreviewPlayer({
  game,
  frozenAt = null,
}: {
  game: GameType;
  frozenAt?: number | null;
}) {
  const meta = GAME_META[game];
  const spot = useSpot(PREVIEWS[game]);
  const box = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(box);
  const reduced = useReducedMotion();
  const [clock] = useState(() => new TutorialClock());
  const duration = spot?.duration ?? 0;

  const held = frozenAt ?? (reduced && spot ? spot.poster : null);
  const running = spot !== null && held === null && onScreen;

  useEffect(() => {
    if (held !== null) clock.set(held);
  }, [clock, held]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const gap = now - last;
      if (gap >= MIN_FRAME_MS) {
        // A hidden tab stops frames; don't count that gap as playback.
        clock.set((clock.t + Math.min(gap, 100) / 1000) % duration);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, duration, running]);

  return (
    <ClockProvider clock={clock}>
      <div
        ref={box}
        data-game={meta.theme}
        className="absolute inset-0 bg-canvas"
        data-tutorial-duration={duration * 1000}
        data-tutorial-ready={spot ? "" : undefined}
      >
        <Board>{spot ? <spot.Scene /> : <Loading name={meta.name} />}</Board>
      </div>
    </ClockProvider>
  );
}
