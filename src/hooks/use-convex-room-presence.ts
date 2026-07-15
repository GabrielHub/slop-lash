"use client";

import { useEffect, useRef } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  createPresenceHeartbeatController,
  createPresenceSessionId,
  getBoundedPresenceHeartbeatInterval,
  sendConvexPresenceDisconnectBeacon,
  type PresenceDisconnectMutation,
  type PresenceHeartbeatController,
  type PresenceHeartbeatMutation,
} from "../lib/convex-presence-session";

export interface UseConvexRoomPresenceOptions {
  capability: string | null;
  heartbeatIntervalMs?: number;
}

interface PresenceEffectLease {
  capability: string;
  intervalMs: number;
  convexUrl: string;
  controller: PresenceHeartbeatController;
  cleanupTimer: number | null;
  dispose(): void;
}

export function useConvexRoomPresence({
  capability,
  heartbeatIntervalMs,
}: UseConvexRoomPresenceOptions): void {
  const convex = useConvex();
  const heartbeat = useMutation(api.presence.heartbeat);
  const disconnect = useMutation(api.presence.disconnect);
  const heartbeatRef = useRef<PresenceHeartbeatMutation>(heartbeat);
  const disconnectRef = useRef<PresenceDisconnectMutation>(disconnect);
  const leaseRef = useRef<PresenceEffectLease | null>(null);

  heartbeatRef.current = heartbeat;
  disconnectRef.current = disconnect;

  const intervalMs = getBoundedPresenceHeartbeatInterval(heartbeatIntervalMs);
  useEffect(() => {
    if (!capability || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const existingLease = leaseRef.current;
    const canReuseLease =
      existingLease?.capability === capability &&
      existingLease.intervalMs === intervalMs &&
      existingLease.convexUrl === convex.url;

    if (canReuseLease) {
      if (existingLease.cleanupTimer !== null) {
        window.clearTimeout(existingLease.cleanupTimer);
        existingLease.cleanupTimer = null;
      }
      existingLease.controller.start(!document.hidden);

      return () => {
        existingLease.cleanupTimer = window.setTimeout(() => {
          if (leaseRef.current !== existingLease) return;
          existingLease.dispose();
          leaseRef.current = null;
        }, 0);
      };
    }

    if (existingLease) {
      if (existingLease.cleanupTimer !== null) {
        window.clearTimeout(existingLease.cleanupTimer);
      }
      existingLease.dispose();
      leaseRef.current = null;
    }

    const sessionId = createPresenceSessionId();
    if (!sessionId) return;

    const controller = createPresenceHeartbeatController({
      capability,
      sessionId,
      intervalMs,
      heartbeat: (args) => heartbeatRef.current(args),
      disconnect: (args) => disconnectRef.current(args),
      sendBeacon: (sessionToken) =>
        sendConvexPresenceDisconnectBeacon(convex.url, sessionToken, (url, data) =>
          navigator.sendBeacon(url, data),
        ),
      scheduleInterval: (callback, delay) => window.setInterval(callback, delay),
      cancelInterval: (handle) => window.clearInterval(handle),
    });

    const handleVisibilityChange = () => {
      controller.setVisible(!document.hidden);
    };
    const handleBeforeUnload = () => {
      controller.sendBeacon();
    };
    const handlePageHide = () => {
      controller.teardownWithBeacon();
    };
    const handlePageShow = () => {
      controller.start(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    let disposed = false;
    const lease: PresenceEffectLease = {
      capability,
      intervalMs,
      convexUrl: convex.url,
      controller,
      cleanupTimer: null,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("pagehide", handlePageHide);
        window.removeEventListener("pageshow", handlePageShow);
        controller.stop();
      },
    };
    leaseRef.current = lease;
    controller.start(!document.hidden);

    return () => {
      lease.cleanupTimer = window.setTimeout(() => {
        if (leaseRef.current !== lease) return;
        lease.dispose();
        leaseRef.current = null;
      }, 0);
    };
  }, [capability, convex.url, intervalMs]);
}
