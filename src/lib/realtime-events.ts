import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { Client, Pool } from "pg";

export type RealtimeEventKind = "state" | "chat";

export interface ChatRealtimePayload {
  clientId: string | null;
  messageId: string;
  createdAt: string;
}

export interface GameRealtimeEvent {
  id: string;
  gameId: string;
  kind: RealtimeEventKind;
  createdAt: string;
  chat: ChatRealtimePayload | null;
}

export interface GameRealtimeEventFilter {
  gameId: string;
  kinds?: RealtimeEventKind[];
}

type RealtimeState = {
  emitter: EventEmitter;
  publishPool: Pool | null;
  listenerClient: Client | null;
  listenerStarted: boolean;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  seenEventIds: Map<string, number>;
};

const REALTIME_CHANNEL = "game_events";
const SEEN_EVENT_TTL_MS = 60_000;

const globalForRealtime = globalThis as typeof globalThis & {
  __slopLashRealtimeState?: RealtimeState;
};

const state =
  globalForRealtime.__slopLashRealtimeState ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    const nextState: RealtimeState = {
      emitter,
      publishPool: null,
      listenerClient: null,
      listenerStarted: false,
      reconnectAttempts: 0,
      reconnectTimer: null,
      seenEventIds: new Map(),
    };
    globalForRealtime.__slopLashRealtimeState = nextState;
    return nextState;
  })();

function getRealtimeDatabaseUrl(): string | null {
  return process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? null;
}

function getPublishPool(): Pool | null {
  const connectionString = getRealtimeDatabaseUrl();
  if (!connectionString) return null;
  if (state.publishPool) return state.publishPool;

  state.publishPool = new Pool({
    connectionString,
    max: 1,
  });

  return state.publishPool;
}

function rememberEvent(eventId: string) {
  const now = Date.now();
  state.seenEventIds.set(eventId, now);
  for (const [knownId, seenAt] of state.seenEventIds) {
    if (now - seenAt > SEEN_EVENT_TTL_MS) {
      state.seenEventIds.delete(knownId);
    }
  }
}

function emitEvent(event: GameRealtimeEvent) {
  if (state.seenEventIds.has(event.id)) return;
  rememberEvent(event.id);
  state.emitter.emit("event", event);
}

function parseRealtimeEvent(payload: string): GameRealtimeEvent | null {
  try {
    const parsed = JSON.parse(payload) as Partial<GameRealtimeEvent>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.gameId !== "string" ||
      (parsed.kind !== "state" && parsed.kind !== "chat") ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }

    if (parsed.kind === "chat") {
      const chat = parsed.chat;
      if (
        !chat ||
        typeof chat.messageId !== "string" ||
        typeof chat.createdAt !== "string" ||
        (chat.clientId !== null && typeof chat.clientId !== "string")
      ) {
        return null;
      }
    }

    return {
      id: parsed.id,
      gameId: parsed.gameId,
      kind: parsed.kind,
      createdAt: parsed.createdAt,
      chat: parsed.chat ?? null,
    };
  } catch {
    return null;
  }
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;

  const delay = Math.min(1_000 * 2 ** state.reconnectAttempts, 30_000);
  state.reconnectAttempts++;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void connectListener();
  }, delay);
}

function detachListenerClient(client: Client | null) {
  if (!client) return;
  if (state.listenerClient === client) {
    state.listenerClient = null;
  }
  client.removeAllListeners("notification");
  client.removeAllListeners("error");
  client.removeAllListeners("end");
}

async function connectListener() {
  const connectionString = getRealtimeDatabaseUrl();
  if (!connectionString || state.listenerClient) return;

  const client = new Client({ connectionString });
  state.listenerClient = client;

  client.on("notification", (message) => {
    if (!message.payload) return;
    const event = parseRealtimeEvent(message.payload);
    if (event) emitEvent(event);
  });

  client.on("error", () => {
    detachListenerClient(client);
    void client.end().catch(() => {});
    scheduleReconnect();
  });

  client.on("end", () => {
    detachListenerClient(client);
    scheduleReconnect();
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${REALTIME_CHANNEL}`);
    state.reconnectAttempts = 0;
  } catch {
    detachListenerClient(client);
    await client.end().catch(() => {});
    scheduleReconnect();
  }
}

function ensureListenerStarted() {
  if (state.listenerStarted) return;
  state.listenerStarted = true;
  void connectListener();
}

function matchesFilter(
  filter: GameRealtimeEventFilter,
  event: GameRealtimeEvent,
): boolean {
  if (filter.gameId !== event.gameId) return false;
  if (!filter.kinds || filter.kinds.length === 0) return true;
  return filter.kinds.includes(event.kind);
}

export async function publishGameStateEvent(gameId: string): Promise<void> {
  await publishRealtimeEvent({
    id: randomUUID(),
    gameId,
    kind: "state",
    createdAt: new Date().toISOString(),
    chat: null,
  });
}

export async function publishChatEvent(
  gameId: string,
  chat: ChatRealtimePayload,
): Promise<void> {
  await publishRealtimeEvent({
    id: randomUUID(),
    gameId,
    kind: "chat",
    createdAt: new Date().toISOString(),
    chat,
  });
}

async function publishRealtimeEvent(event: GameRealtimeEvent): Promise<void> {
  const payload = JSON.stringify(event);
  const pool = getPublishPool();

  if (!pool) {
    emitEvent(event);
    return;
  }

  try {
    await pool.query("select pg_notify($1, $2)", [REALTIME_CHANNEL, payload]);
    emitEvent(event);
  } catch {
    emitEvent(event);
  }
}

export function subscribeToRealtimeEvents(
  filter: GameRealtimeEventFilter,
  listener: (event: GameRealtimeEvent) => void,
): () => void {
  ensureListenerStarted();

  const wrapped = (event: GameRealtimeEvent) => {
    if (matchesFilter(filter, event)) {
      listener(event);
    }
  };

  state.emitter.on("event", wrapped);
  return () => {
    state.emitter.off("event", wrapped);
  };
}

export function waitForRealtimeEvent(
  filter: GameRealtimeEventFilter,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<GameRealtimeEvent | null> {
  return new Promise((resolve) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (event: GameRealtimeEvent | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      unsubscribe();
      signal.removeEventListener("abort", onAbort);
      resolve(event);
    };

    const onAbort = () => finish(null);
    const unsubscribe = subscribeToRealtimeEvents(filter, (event) => finish(event));

    signal.addEventListener("abort", onAbort, { once: true });
    timeout = setTimeout(() => finish(null), timeoutMs);
  });
}
