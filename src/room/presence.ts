"use client";

import { useEffect, useRef, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";

const HEARTBEAT_INTERVAL_MS = 5_000;
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
 */
export function useRoomPresence(capability: string | null): number {
  const convex = useConvex();
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const bestRoundTrip = useRef(Number.POSITIVE_INFINITY);

  useEffect(() => {
    if (!capability) return;
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
        const receivedAt = Date.now();
        const roundTrip = receivedAt - sentAt;
        // The fastest round trip gives the tightest estimate of the server clock.
        if (roundTrip < bestRoundTrip.current) {
          bestRoundTrip.current = roundTrip;
          const offset = result.serverNow - (sentAt + receivedAt) / 2;
          setClockOffsetMs((current) =>
            Math.abs(offset - current) < CLOCK_OFFSET_THRESHOLD_MS ? current : offset,
          );
        }
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
  }, [capability, convex]);

  return clockOffsetMs;
}
