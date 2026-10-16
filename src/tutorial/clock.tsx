"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  cuesFor,
  localCues,
  type Cues,
  type LocalCues,
  type TutorialScript,
  type TutorialTiming,
} from "./timeline";

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
  script: TutorialScript;
  timing: TutorialTiming;
  cues: Cues;
}

const ClockContext = createContext<TutorialClock | null>(null);
const TutorialContext = createContext<TutorialContextValue | null>(null);
/** The global time a `Sequence` starts at, so its children read local time. */
const OriginContext = createContext(0);

/** A playhead with no voice track: enough for `useTime` and `Sequence`, as in a silent preview. */
export function ClockProvider({ clock, children }: { clock: TutorialClock; children: ReactNode }) {
  return <ClockContext.Provider value={clock}>{children}</ClockContext.Provider>;
}

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
  const value = useMemo(() => ({ script, timing, cues: cuesFor(timing) }), [script, timing]);
  return (
    <ClockProvider clock={clock}>
      <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
    </ClockProvider>
  );
}

function useTutorialContext(): TutorialContextValue {
  const value = useContext(TutorialContext);
  if (!value) throw new Error("Tutorial components need a TutorialProvider");
  return value;
}

/** The global playhead in seconds. Re-renders every frame. */
export function useTime(): number {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("Tutorial components need a ClockProvider or TutorialProvider");
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

/**
 * The cues in the nearest enclosing `Sequence`'s local seconds, plus its local
 * time `t`, so a shot keys its beats on what is said.
 */
export function useLocalCues(): LocalCues & { t: number } {
  const { cues } = useTutorialContext();
  const origin = useContext(OriginContext);
  const t = useLocalTime();
  const local = useMemo(() => localCues(cues, origin), [cues, origin]);
  return { ...local, t };
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
