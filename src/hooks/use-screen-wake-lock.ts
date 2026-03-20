"use client";

import { useEffect, useRef } from "react";

type WakeLockType = "screen";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (
    type: "release",
    listener: () => void,
    options?: AddEventListenerOptions,
  ) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: WakeLockType) => Promise<WakeLockSentinelLike>;
  };
};

export function useScreenWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!enabled || !wakeLock?.request) return;

    let disposed = false;

    async function releaseWakeLock() {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel) return;

      try {
        await sentinel.release();
      } catch {
        // Ignore release failures; the browser may have already released it.
      }
    }

    async function requestWakeLock() {
      if (disposed || document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;

      try {
        const sentinel = await wakeLock.request("screen");
        if (disposed || !enabled) {
          await sentinel.release().catch(() => undefined);
          return;
        }

        sentinelRef.current = sentinel;
        sentinel.addEventListener?.(
          "release",
          () => {
            if (sentinelRef.current === sentinel) {
              sentinelRef.current = null;
            }
          },
          { once: true },
        );
      } catch {
        // Unsupported environments, low battery mode, or browser policy can reject.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        return;
      }

      void releaseWakeLock();
    }

    void requestWakeLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [enabled]);
}
