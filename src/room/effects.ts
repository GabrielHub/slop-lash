"use client";

import { useEffect, useRef } from "react";
import { playSound, type SoundName } from "@/lib/sounds";
import { useRoom } from "./context";

/**
 * Plays `sound` whenever `key` changes after the first render and `when`
 * holds. Mounting never plays, so a reload or a recap stays quiet.
 */
export function useCue(key: string | number, sound: SoundName, when = true) {
  const { live } = useRoom();
  const previous = useRef(key);
  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    if (when && live) playSound(sound);
  }, [key, sound, when, live]);
}

/** Growth sounds closer together than this collapse into one. */
const GROWTH_GAP_MS = 250;

/**
 * Plays `sound` each time `count` grows within the same `key` (a phase, say)
 * while `when` holds and the room is live. Throttled, so a burst of arrivals
 * is one sound; a new key or mounting never plays.
 */
export function useGrowthCue(count: number, key: string | number, sound: SoundName, when = true) {
  const { live } = useRoom();
  const previous = useRef({ count, key });
  const lastAt = useRef(0);
  useEffect(() => {
    const before = previous.current;
    previous.current = { count, key };
    if (!when || !live || before.key !== key || count <= before.count) return;
    const now = performance.now();
    if (now - lastAt.current < GROWTH_GAP_MS) return;
    lastAt.current = now;
    playSound(sound);
  }, [count, key, sound, when, live]);
}
