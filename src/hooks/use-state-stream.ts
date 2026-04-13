"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";

type StreamState = {
  status: string;
};

const STALE_STREAM_TIMEOUT_MS = 45_000;

type UseStateStreamOptions<TState extends StreamState> = {
  code: string;
  createUrl: (code: string) => string;
  transitionUpdates?: boolean;
  shouldReconnect?: (state: TState | null) => boolean;
};

type ServerErrorPayload = {
  code: string;
  message: string;
};

function defaultShouldReconnect(state: StreamState | null): boolean {
  return state?.status !== "FINAL_RESULTS";
}

function isNotFoundError(payload: unknown): payload is ServerErrorPayload {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  return record.code === "NOT_FOUND" && typeof record.message === "string";
}

export function useStateStream<TState extends StreamState>({
  code,
  createUrl,
  transitionUpdates = false,
  shouldReconnect = defaultShouldReconnect,
}: UseStateStreamOptions<TState>) {
  const [state, setState] = useState<TState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const stateRef = useRef<TState | null>(null);
  const fatalErrorRef = useRef(false);
  const sessionRef = useRef(0);
  const createUrlRef = useRef(createUrl);
  const shouldReconnectRef = useRef(shouldReconnect);
  const lastActivityAtRef = useRef(0);

  useEffect(() => {
    createUrlRef.current = createUrl;
  }, [createUrl]);

  useEffect(() => {
    shouldReconnectRef.current = shouldReconnect;
  }, [shouldReconnect]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearStaleTimer = useCallback(() => {
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
  }, []);

  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const applyState = useCallback(
    (nextState: TState) => {
      stateRef.current = nextState;
      retriesRef.current = 0;
      fatalErrorRef.current = false;
      setError(null);

      if (transitionUpdates) {
        startTransition(() => {
          setState(nextState);
        });
        return;
      }

      setState(nextState);
    },
    [transitionUpdates],
  );

  useEffect(() => {
    if (!code) return;

    let cancelled = false;
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;
    stateRef.current = null;
    fatalErrorRef.current = false;
    retriesRef.current = 0;
    lastActivityAtRef.current = Date.now();

    const scheduleReconnect = () => {
      clearReconnectTimer();
      const delay = Math.min(500 * 2 ** retriesRef.current, 30_000);
      retriesRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
      clearStaleTimer();
      staleTimerRef.current = setTimeout(() => {
        staleTimerRef.current = null;
        if (cancelled || sessionRef.current !== sessionId) return;
        if (document.visibilityState === "hidden") return;
        if (!sourceRef.current) return;

        closeSource();
        if (fatalErrorRef.current || !shouldReconnectRef.current(stateRef.current)) return;
        retriesRef.current = 0;
        connect();
      }, STALE_STREAM_TIMEOUT_MS);
    };

    const connect = () => {
      if (cancelled || sessionRef.current !== sessionId) return;

      clearReconnectTimer();
      clearStaleTimer();
      closeSource();

      const source = new EventSource(createUrlRef.current(code));
      sourceRef.current = source;
      markActivity();

      const isActive = () =>
        !cancelled && sessionRef.current === sessionId && sourceRef.current === source;

      source.onopen = () => {
        if (!isActive()) return;
        markActivity();
      };

      source.addEventListener("state", (event) => {
        if (!isActive()) return;

        try {
          markActivity();
          applyState(JSON.parse(event.data) as TState);
        } catch {
          // Ignore malformed SSE payloads.
        }
      });

      source.addEventListener("heartbeat", () => {
        if (!isActive()) return;
        markActivity();
      });

      source.addEventListener("server-error", (event) => {
        if (!isActive()) return;

        try {
          markActivity();
          const payload = JSON.parse(event.data) as unknown;
          if (!isNotFoundError(payload)) return;

          fatalErrorRef.current = true;
          setError("Game not found");
          clearReconnectTimer();
          clearStaleTimer();
          closeSource();
        } catch {
          // Ignore malformed SSE payloads.
        }
      });

      source.addEventListener("done", () => {
        if (!isActive()) return;
        clearReconnectTimer();
        clearStaleTimer();
        closeSource();
      });

      source.onerror = () => {
        if (!isActive()) return;
        if (source.readyState !== EventSource.CLOSED) return;

        clearStaleTimer();
        closeSource();
        if (fatalErrorRef.current || !shouldReconnectRef.current(stateRef.current)) return;
        scheduleReconnect();
      };
    };

    const recoverConnection = () => {
      if (document.visibilityState === "hidden") return;

      const streamIsStale = Date.now() - lastActivityAtRef.current >= STALE_STREAM_TIMEOUT_MS;
      if (sourceRef.current && !streamIsStale) return;
      if (fatalErrorRef.current || !shouldReconnectRef.current(stateRef.current)) return;

      clearReconnectTimer();
      retriesRef.current = 0;
      connect();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearReconnectTimer();
        clearStaleTimer();
        closeSource();
        return;
      }

      if (cancelled) return;
      recoverConnection();
    };

    const onFocus = () => {
      if (cancelled) return;
      recoverConnection();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("online", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("online", onFocus);
      clearReconnectTimer();
      clearStaleTimer();
      closeSource();
    };
  }, [applyState, clearReconnectTimer, clearStaleTimer, closeSource, code, refreshKey]);

  const refresh = useCallback(() => {
    clearReconnectTimer();
    clearStaleTimer();
    closeSource();
    stateRef.current = null;
    fatalErrorRef.current = false;
    retriesRef.current = 0;
    lastActivityAtRef.current = Date.now();
    setError(null);
    setRefreshKey((current) => current + 1);
  }, [clearReconnectTimer, clearStaleTimer, closeSource]);

  return { state, error, refresh };
}
