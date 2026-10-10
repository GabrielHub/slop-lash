"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";

const HEARTBEAT_INTERVAL_MS = 5_000;
/** A seatless screen samples the clock a few times quickly, then now and then. */
const SPECTATOR_FIRST_SAMPLES = 4;
const SPECTATOR_SAMPLE_GAP_MS = 400;
const SPECTATOR_INTERVAL_MS = 30_000;
/** Smaller corrections are noise, and each one re-renders the whole room. */
const CLOCK_OFFSET_THRESHOLD_MS = 50;

/** Posts the disconnect straight to Convex so it survives the page unloading. */
function sendDisconnectBeacon(convexUrl: string, sessionToken: string) {
  try {
    const body = new Blob(
      [JSON.stringify({ path: "presence:disconnect", args: { sessionToken } })],
      { type: "application/json" },
    );
    navigator.sendBeacon(`${convexUrl.replace(/\/+$/u, "")}/api/mutation`, body);
  } catch {
    // The server notices the missing heartbeats soon enough.
  }
}

/**
 * Keeps this tab's seat marked as here while it is mounted, and returns how far
 * the server clock is ahead of this device's, so countdowns match deadlines.
 * `roomId` is the game the capability currently opens: after "Play again" the
 * same capability opens a new game, and the tab beats into it at once.
 * Without a capability (a spectator screen) it only reads the server clock.
 */
export function useRoomPresence(capability: string | null, roomId: string | null): number {
  const convex = useConvex();
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const bestRoundTrip = useRef(Number.POSITIVE_INFINITY);

  /** Keeps the estimate from the fastest round trip seen so far. */
  const sample = useCallback((sentAt: number, receivedAt: number, serverNow: number) => {
    const roundTrip = receivedAt - sentAt;
    if (roundTrip >= bestRoundTrip.current) return;
    bestRoundTrip.current = roundTrip;
    const offset = serverNow - (sentAt + receivedAt) / 2;
    setClockOffsetMs((current) =>
      Math.abs(offset - current) < CLOCK_OFFSET_THRESHOLD_MS ? current : offset,
    );
  }, []);

  // A spectator (no seat) has no heartbeat; it reads the server clock alone.
  useEffect(() => {
    if (capability || !roomId) return;
    let stopped = false;
    const read = async () => {
      const sentAt = Date.now();
      try {
        const { serverNow } = await convex.mutation(api.presence.clock, {});
        if (!stopped) sample(sentAt, Date.now(), serverNow);
      } catch {
        // Offline: keep the last estimate.
      }
    };
    const timers: number[] = [];
    for (let index = 0; index < SPECTATOR_FIRST_SAMPLES; index += 1) {
      timers.push(window.setTimeout(() => void read(), index * SPECTATOR_SAMPLE_GAP_MS));
    }
    const interval = window.setInterval(() => void read(), SPECTATOR_INTERVAL_MS);
    return () => {
      stopped = true;
      for (const timer of timers) window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [capability, roomId, convex, sample]);

  useEffect(() => {
    if (!capability || !roomId) return;
    const tabId = crypto.randomUUID();
    let sessionToken: string | null = null;
    let stopped = false;

    const beat = async () => {
      const sentAt = Date.now();
      try {
        const result = await convex.mutation(api.presence.heartbeat, {
          capability,
          tabId,
          interval: HEARTBEAT_INTERVAL_MS,
        });
        if (stopped) return;
        sessionToken = result.sessionToken;
        // The fastest round trip gives the tightest estimate of the server clock.
        sample(sentAt, Date.now(), result.serverNow);
      } catch {
        // An expired seat surfaces through the room query instead.
      }
    };

    const leave = () => {
      if (sessionToken) sendDisconnectBeacon(convex.url, sessionToken);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };

    void beat();
    const interval = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", onVisible);
      if (sessionToken) void convex.mutation(api.presence.disconnect, { sessionToken });
    };
  }, [capability, roomId, convex, sample]);

  return clockOffsetMs;
}
