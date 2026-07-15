export const DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS = 10_000;
export const MIN_PRESENCE_HEARTBEAT_INTERVAL_MS = 5_000;
export const MAX_PRESENCE_HEARTBEAT_INTERVAL_MS = 30_000;

const PRESENCE_DISCONNECT_PATH = "presence:disconnect";

export interface PresenceHeartbeatArguments {
  capability: string;
  interval: number;
  sessionId: string;
}

export interface PresenceHeartbeatResult {
  sessionToken: string;
}

export interface PresenceDisconnectArguments {
  sessionToken: string;
}

export type PresenceHeartbeatMutation = (
  args: PresenceHeartbeatArguments,
) => Promise<PresenceHeartbeatResult>;

export type PresenceDisconnectMutation = (args: PresenceDisconnectArguments) => Promise<unknown>;

export type PresenceBeaconSender = (url: string, data: Blob) => boolean;

export interface PresenceHeartbeatController {
  start(visible: boolean): void;
  setVisible(visible: boolean): void;
  sendBeacon(): boolean;
  teardownWithBeacon(): void;
  stop(): void;
}

export interface PresenceHeartbeatControllerOptions<IntervalHandle> {
  capability: string;
  sessionId: string;
  intervalMs?: number;
  heartbeat: PresenceHeartbeatMutation;
  disconnect: PresenceDisconnectMutation;
  sendBeacon: (sessionToken: string) => boolean;
  scheduleInterval: (callback: () => void, intervalMs: number) => IntervalHandle;
  cancelInterval: (handle: IntervalHandle) => void;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function getBoundedPresenceHeartbeatInterval(intervalMs?: number): number {
  if (intervalMs === undefined || !Number.isFinite(intervalMs)) {
    return DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS;
  }

  return Math.min(
    MAX_PRESENCE_HEARTBEAT_INTERVAL_MS,
    Math.max(MIN_PRESENCE_HEARTBEAT_INTERVAL_MS, Math.round(intervalMs)),
  );
}

/** Returns a fresh opaque session ID for one room-capability Presence lease. */
export function createPresenceSessionId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const nextSessionId = window.crypto.randomUUID();
    if (!isNonEmptyString(nextSessionId)) return null;
    return nextSessionId;
  } catch {
    return null;
  }
}

export function sendConvexPresenceDisconnectBeacon(
  convexUrl: string,
  sessionToken: string,
  sendBeacon: PresenceBeaconSender,
): boolean {
  if (!isNonEmptyString(convexUrl) || !isNonEmptyString(sessionToken)) {
    return false;
  }

  try {
    const body = new Blob(
      [
        JSON.stringify({
          path: PRESENCE_DISCONNECT_PATH,
          args: { sessionToken },
        }),
      ],
      { type: "application/json" },
    );
    const endpoint = `${convexUrl.replace(/\/+$/u, "")}/api/mutation`;
    return sendBeacon(endpoint, body);
  } catch {
    return false;
  }
}

export function createPresenceHeartbeatController<IntervalHandle>(
  options: PresenceHeartbeatControllerOptions<IntervalHandle>,
): PresenceHeartbeatController {
  const intervalMs = getBoundedPresenceHeartbeatInterval(options.intervalMs);
  const canHeartbeat = isNonEmptyString(options.capability) && isNonEmptyString(options.sessionId);

  let active = false;
  let visible = false;
  let heartbeatInFlight = false;
  let heartbeatQueued = false;
  let lifecycleEpoch = 0;
  let intervalHandle: IntervalHandle | undefined;
  let sessionToken: string | null = null;

  const disconnectSafely = async (token: string): Promise<void> => {
    if (!isNonEmptyString(token)) return;

    try {
      await options.disconnect({ sessionToken: token });
    } catch {
      // Presence expires server-side. A transient disconnect failure must not
      // escape an effect cleanup or stop future heartbeats.
    }
  };

  const stopInterval = (): void => {
    if (intervalHandle === undefined) return;

    try {
      options.cancelInterval(intervalHandle);
    } catch {
      // Timer cleanup is best-effort in non-browser test and teardown hosts.
    }
    intervalHandle = undefined;
  };

  const disconnectCurrentSession = (): void => {
    const token = sessionToken;
    sessionToken = null;
    if (token) void disconnectSafely(token);
  };

  const runHeartbeat = async (): Promise<void> => {
    if (!active || !visible || !canHeartbeat || heartbeatInFlight) return;

    heartbeatInFlight = true;
    heartbeatQueued = false;
    const requestEpoch = lifecycleEpoch;

    try {
      const result = await options.heartbeat({
        capability: options.capability,
        interval: intervalMs,
        sessionId: options.sessionId,
      });

      if (!isNonEmptyString(result.sessionToken)) return;
      if (!active || !visible || requestEpoch !== lifecycleEpoch) {
        await disconnectSafely(result.sessionToken);
        return;
      }

      sessionToken = result.sessionToken;
    } catch {
      // Network and authorization errors are retried by the next bounded tick.
    } finally {
      heartbeatInFlight = false;
      if (heartbeatQueued && active && visible) {
        heartbeatQueued = false;
        void runHeartbeat();
      }
    }
  };

  const requestHeartbeat = (): void => {
    if (!active || !visible || !canHeartbeat) return;
    if (heartbeatInFlight) {
      heartbeatQueued = true;
      return;
    }
    void runHeartbeat();
  };

  const startInterval = (): void => {
    if (intervalHandle !== undefined || !active || !visible || !canHeartbeat) {
      return;
    }

    try {
      intervalHandle = options.scheduleInterval(requestHeartbeat, intervalMs);
    } catch {
      intervalHandle = undefined;
    }
  };

  const sendCurrentSessionBeacon = (): boolean => {
    const token = sessionToken;
    if (!token) return false;

    try {
      const accepted = options.sendBeacon(token);
      if (accepted) sessionToken = null;
      return accepted;
    } catch {
      return false;
    }
  };

  const start = (nextVisible: boolean): void => {
    if (active) {
      if (nextVisible !== visible) setVisible(nextVisible);
      return;
    }

    active = true;
    visible = nextVisible;
    lifecycleEpoch += 1;
    if (!visible) return;

    requestHeartbeat();
    startInterval();
  };

  const setVisible = (nextVisible: boolean): void => {
    if (!active) {
      if (nextVisible) start(true);
      return;
    }
    if (nextVisible === visible) return;

    visible = nextVisible;
    lifecycleEpoch += 1;
    heartbeatQueued = false;
    if (!visible) {
      stopInterval();
      disconnectCurrentSession();
      return;
    }

    requestHeartbeat();
    startInterval();
  };

  const teardownWithBeacon = (): void => {
    if (!active && !sessionToken) return;

    active = false;
    visible = false;
    lifecycleEpoch += 1;
    heartbeatQueued = false;
    stopInterval();
    if (!sendCurrentSessionBeacon()) disconnectCurrentSession();
  };

  const stop = (): void => {
    if (!active && !sessionToken) return;

    active = false;
    visible = false;
    lifecycleEpoch += 1;
    heartbeatQueued = false;
    stopInterval();
    disconnectCurrentSession();
  };

  return {
    start,
    setVisible,
    sendBeacon: sendCurrentSessionBeacon,
    teardownWithBeacon,
    stop,
  };
}
