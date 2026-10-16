"use client";

import { createContext, useContext } from "react";

/** A seat in the room, for a tutorial that shows who is playing and what they answered. */
export interface LivePlayer {
  id: string;
  name: string;
  isAi: boolean;
  /** The index of their practice answer, once they lock one in (AI players never do). */
  pick: number | null;
}

/** The room a tutorial is playing in. */
export interface TutorialLive {
  players: readonly LivePlayer[];
}

export const TutorialLiveContext = createContext<TutorialLive | null>(null);

/**
 * The room's players while the tutorial plays in a lobby; null on the
 * standalone page, where a scene shows its own invented cast instead.
 */
export function useTutorialLive(): TutorialLive | null {
  return useContext(TutorialLiveContext);
}
