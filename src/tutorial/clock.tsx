"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { cuesFor, type Cues, type TutorialScript, type TutorialTiming } from "./timeline";

/**
 * The tutorial's playhead. The player writes `t` once per animation frame;
 * every component that reads it re-renders for that frame, like a video
 * renderer drawing a frame from its time.
 */
export class TutorialClock {
  private time = 0;
  private readonly listeners = new Set<() => void>();

  get t(): number {
    return this.time;
  }

  set(t: number): void {
    if (t === this.time) return;
    this.time = t;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  read = (): number => this.time;
}

interface TutorialContextValue {
  clock: TutorialClock;
  script: TutorialScript;
  timing: TutorialTiming;
  cues: Cues;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);
/** The global time a `Sequence` starts at, so its children read local time. */
const OriginContext = createContext(0);

export function TutorialProvider({
  clock,
  script,
  timing,
  children,
}: {
  clock: TutorialClock;
  script: TutorialScript;
  timing: TutorialTiming;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ clock, script, timing, cues: cuesFor(timing) }),
    [clock, script, timing],
  );
  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

function useTutorialContext(): TutorialContextValue {
  const value = useContext(TutorialContext);
  if (!value) throw new Error("Tutorial components need a TutorialProvider");
  return value;
}

/** The global playhead in seconds. Re-renders every frame. */
export function useTime(): number {
  const { clock } = useTutorialContext();
  return useSyncExternalStore(clock.subscribe, clock.read, clock.read);
}

/** Seconds since the nearest enclosing `Sequence` began (global time outside one). */
export function useLocalTime(): number {
  return useTime() - useContext(OriginContext);
}

/** When each line and word is said. */
export function useCues(): Cues {
  return useTutorialContext().cues;
}

export function useTutorial(): Pick<TutorialContextValue, "script" | "timing" | "cues"> {
  const { script, timing, cues } = useTutorialContext();
  return { script, timing, cues };
}

/**
 * Mounts `children` only while the playhead is inside `[from - pre, to + post]`
 * and gives them local time from `from`. A function child gets that local time
 * directly. Use one per shot, so off-screen shots cost nothing.
 */
export function Sequence({
  from,
  to = Infinity,
  pre = 0,
  post = 0,
  children,
}: {
  /** Global seconds this shot starts at; its local time 0. */
  from: number;
  /** Global seconds it ends at. */
  to?: number;
  /** Seconds to mount before `from`, for an entrance that starts early. */
  pre?: number;
  /** Seconds to stay mounted after `to`, for an exit. */
  post?: number;
  children: ReactNode | ((local: number) => ReactNode);
}) {
  const t = useTime();
  if (t < from - pre || t > to + post) return null;
  return (
    <OriginContext.Provider value={from}>
      {typeof children === "function" ? children(t - from) : children}
    </OriginContext.Provider>
  );
}
