import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS,
  MAX_PRESENCE_HEARTBEAT_INTERVAL_MS,
  MIN_PRESENCE_HEARTBEAT_INTERVAL_MS,
  createPresenceHeartbeatController,
  createPresenceSessionId,
  getBoundedPresenceHeartbeatInterval,
  sendConvexPresenceDisconnectBeacon,
  type PresenceHeartbeatArguments,
  type PresenceHeartbeatResult,
} from "./convex-presence-session";

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolvePromise: (value: Value) => void = () => undefined;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeScheduler {
  private nextHandle = 1;
  private callbacks = new Map<number, () => void>();

  readonly scheduledIntervals: number[] = [];
  readonly canceledHandles: number[] = [];

  schedule = (callback: () => void, intervalMs: number): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    this.scheduledIntervals.push(intervalMs);
    return handle;
  };

  cancel = (handle: number): void => {
    this.callbacks.delete(handle);
    this.canceledHandles.push(handle);
  };

  tick(): void {
    for (const callback of this.callbacks.values()) callback();
  }
}

function installTestWindow(randomUUID: () => string): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { crypto: { randomUUID } },
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "window", originalDescriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "window");
  };
}

describe("Convex Presence session lifecycle", () => {
  it("clamps heartbeat intervals to a safe finite range", () => {
    expect(getBoundedPresenceHeartbeatInterval()).toBe(DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS);
    expect(getBoundedPresenceHeartbeatInterval(Number.NaN)).toBe(
      DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS,
    );
    expect(getBoundedPresenceHeartbeatInterval(1)).toBe(MIN_PRESENCE_HEARTBEAT_INTERVAL_MS);
    expect(getBoundedPresenceHeartbeatInterval(120_000)).toBe(MAX_PRESENCE_HEARTBEAT_INTERVAL_MS);
  });

  it("creates a fresh session ID per lease and stays SSR safe", () => {
    expect(createPresenceSessionId()).toBeNull();

    let uuidCalls = 0;
    const restoreWindow = installTestWindow(() => {
      uuidCalls += 1;
      return `opaque-lease-session-${uuidCalls}`;
    });
    try {
      expect(createPresenceSessionId()).toBe("opaque-lease-session-1");
      expect(createPresenceSessionId()).toBe("opaque-lease-session-2");
      expect(uuidCalls).toBe(2);
    } finally {
      restoreWindow();
    }
  });

  it("sends only capability, interval, and the tab session ID", async () => {
    const scheduler = new FakeScheduler();
    const heartbeatArguments: PresenceHeartbeatArguments[] = [];
    const disconnectArguments: Array<{ sessionToken: string }> = [];
    const controller = createPresenceHeartbeatController({
      capability: "player-capability",
      sessionId: "tab-session",
      intervalMs: 1,
      heartbeat: async (args) => {
        heartbeatArguments.push(args);
        return { sessionToken: "opaque-session-token" };
      },
      disconnect: async (args) => {
        disconnectArguments.push(args);
        return null;
      },
      sendBeacon: () => true,
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    await flushPromises();
    expect(heartbeatArguments).toEqual([
      {
        capability: "player-capability",
        interval: MIN_PRESENCE_HEARTBEAT_INTERVAL_MS,
        sessionId: "tab-session",
      },
    ]);
    expect(scheduler.scheduledIntervals).toEqual([MIN_PRESENCE_HEARTBEAT_INTERVAL_MS]);

    controller.stop();
    await flushPromises();
    expect(disconnectArguments).toEqual([{ sessionToken: "opaque-session-token" }]);
  });

  it("coalesces overlapping heartbeat requests into one follow-up flight", async () => {
    const scheduler = new FakeScheduler();
    const firstHeartbeat = deferred<PresenceHeartbeatResult>();
    let heartbeatCalls = 0;
    const controller = createPresenceHeartbeatController({
      capability: "player-capability",
      sessionId: "tab-session",
      heartbeat: () => {
        heartbeatCalls += 1;
        return heartbeatCalls === 1
          ? firstHeartbeat.promise
          : Promise.resolve({ sessionToken: "second-token" });
      },
      disconnect: async () => null,
      sendBeacon: () => true,
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    scheduler.tick();
    scheduler.tick();
    expect(heartbeatCalls).toBe(1);

    firstHeartbeat.resolve({ sessionToken: "first-token" });
    await flushPromises();
    expect(heartbeatCalls).toBe(2);
    controller.stop();
  });

  it("contains heartbeat errors and retries on the next interval", async () => {
    const scheduler = new FakeScheduler();
    let heartbeatCalls = 0;
    const controller = createPresenceHeartbeatController({
      capability: "player-capability",
      sessionId: "tab-session",
      heartbeat: () => {
        heartbeatCalls += 1;
        return heartbeatCalls === 1
          ? Promise.reject(new Error("Temporary network failure"))
          : Promise.resolve({ sessionToken: "recovered-token" });
      },
      disconnect: async () => null,
      sendBeacon: () => true,
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    await flushPromises();
    scheduler.tick();
    await flushPromises();
    expect(heartbeatCalls).toBe(2);
    controller.stop();
  });

  it("pauses while hidden, disconnects, and heartbeats immediately on return", async () => {
    const scheduler = new FakeScheduler();
    const disconnectTokens: string[] = [];
    let heartbeatCalls = 0;
    const controller = createPresenceHeartbeatController({
      capability: "player-capability",
      sessionId: "tab-session",
      heartbeat: async () => {
        heartbeatCalls += 1;
        return { sessionToken: `token-${heartbeatCalls}` };
      },
      disconnect: async ({ sessionToken }) => {
        disconnectTokens.push(sessionToken);
        return null;
      },
      sendBeacon: () => true,
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    await flushPromises();
    controller.setVisible(false);
    await flushPromises();
    expect(disconnectTokens).toEqual(["token-1"]);
    expect(scheduler.canceledHandles).toHaveLength(1);

    controller.setVisible(true);
    await flushPromises();
    expect(heartbeatCalls).toBe(2);
    expect(scheduler.scheduledIntervals).toHaveLength(2);
    controller.stop();
  });

  it("disconnects a heartbeat that resolves after cleanup", async () => {
    const scheduler = new FakeScheduler();
    const pendingHeartbeat = deferred<PresenceHeartbeatResult>();
    const disconnectTokens: string[] = [];
    const controller = createPresenceHeartbeatController({
      capability: "player-capability",
      sessionId: "tab-session",
      heartbeat: () => pendingHeartbeat.promise,
      disconnect: async ({ sessionToken }) => {
        disconnectTokens.push(sessionToken);
        return null;
      },
      sendBeacon: () => true,
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    controller.stop();
    pendingHeartbeat.resolve({ sessionToken: "late-token" });
    await flushPromises();
    expect(disconnectTokens).toEqual(["late-token"]);
  });

  it("uses the opaque session token for page teardown without a second disconnect", async () => {
    const scheduler = new FakeScheduler();
    const beaconTokens: string[] = [];
    const disconnectTokens: string[] = [];
    const controller = createPresenceHeartbeatController({
      capability: "player-capability",
      sessionId: "tab-session",
      heartbeat: async () => ({ sessionToken: "beacon-token" }),
      disconnect: async ({ sessionToken }) => {
        disconnectTokens.push(sessionToken);
        return null;
      },
      sendBeacon: (sessionToken) => {
        beaconTokens.push(sessionToken);
        return true;
      },
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    await flushPromises();
    controller.teardownWithBeacon();
    controller.stop();
    await flushPromises();
    expect(beaconTokens).toEqual(["beacon-token"]);
    expect(disconnectTokens).toEqual([]);
  });

  it("does not heartbeat without a player capability", () => {
    const scheduler = new FakeScheduler();
    let heartbeatCalls = 0;
    const controller = createPresenceHeartbeatController({
      capability: "",
      sessionId: "tab-session",
      heartbeat: async () => {
        heartbeatCalls += 1;
        return { sessionToken: "token" };
      },
      disconnect: async () => null,
      sendBeacon: () => true,
      scheduleInterval: scheduler.schedule,
      cancelInterval: scheduler.cancel,
    });

    controller.start(true);
    scheduler.tick();
    expect(heartbeatCalls).toBe(0);
    expect(scheduler.scheduledIntervals).toEqual([]);
  });

  it("builds the Convex disconnect beacon from only the opaque session token", async () => {
    const captured: { endpoint: string; body: Blob | null } = {
      endpoint: "",
      body: null,
    };
    const accepted = sendConvexPresenceDisconnectBeacon(
      "https://example.convex.cloud/",
      "opaque-session-token",
      (nextEndpoint, nextBody) => {
        captured.endpoint = nextEndpoint;
        captured.body = nextBody;
        return true;
      },
    );

    expect(accepted).toBe(true);
    expect(captured.endpoint).toBe("https://example.convex.cloud/api/mutation");
    expect(captured.body).not.toBeNull();
    if (!captured.body) throw new Error("Expected a beacon body");
    const payload: unknown = JSON.parse(await captured.body.text());
    expect(payload).toEqual({
      path: "presence:disconnect",
      args: { sessionToken: "opaque-session-token" },
    });
  });
});
