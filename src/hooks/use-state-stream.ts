"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";

type StreamState = {
  status: string;
};

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
  const retriesRef = useRef(0);
  const stateRef = useRef<TState | null>(null);
  const fatalErrorRef = useRef(false);
  const sessionRef = useRef(0);
  const createUrlRef = useRef(createUrl);
  const shouldReconnectRef = useRef(shouldReconnect);

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

    const scheduleReconnect = () => {
      clearReconnectTimer();
      const delay = Math.min(500 * 2 ** retriesRef.current, 30_000);
      retriesRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (cancelled || sessionRef.current !== sessionId) return;

      clearReconnectTimer();
      closeSource();

      const source = new EventSource(createUrlRef.current(code));
      sourceRef.current = source;

      source.addEventListener("state", (event) => {
        if (cancelled || sessionRef.current !== sessionId || sourceRef.current !== source) return;

        try {
          applyState(JSON.parse(event.data) as TState);
        } catch {
          // Ignore malformed SSE payloads.
        }
      });

      source.addEventListener("server-error", (event) => {
        if (cancelled || sessionRef.current !== sessionId || sourceRef.current !== source) return;

        try {
          const payload = JSON.parse(event.data) as unknown;
          if (!isNotFoundError(payload)) return;

          fatalErrorRef.current = true;
          setError("Game not found");
          clearReconnectTimer();
          closeSource();
        } catch {
          // Ignore malformed SSE payloads.
        }
      });

      source.addEventListener("done", () => {
        if (cancelled || sessionRef.current !== sessionId || sourceRef.current !== source) return;
        clearReconnectTimer();
        closeSource();
      });

      source.onerror = () => {
        if (cancelled || sessionRef.current !== sessionId || sourceRef.current !== source) return;
        if (source.readyState !== EventSource.CLOSED) return;

        closeSource();
        if (fatalErrorRef.current || !shouldReconnectRef.current(stateRef.current)) return;
        scheduleReconnect();
      };
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearReconnectTimer();
        closeSource();
        return;
      }

      if (sourceRef.current || cancelled) return;
      if (fatalErrorRef.current || !shouldReconnectRef.current(stateRef.current)) return;
      retriesRef.current = 0;
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearReconnectTimer();
      closeSource();
    };
  }, [applyState, clearReconnectTimer, closeSource, code, refreshKey]);

  const refresh = useCallback(() => {
    clearReconnectTimer();
    closeSource();
    stateRef.current = null;
    fatalErrorRef.current = false;
    retriesRef.current = 0;
    setError(null);
    setRefreshKey((current) => current + 1);
  }, [clearReconnectTimer, closeSource]);

  return { state, error, refresh };
}
