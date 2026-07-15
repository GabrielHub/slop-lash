export const CONVEX_ROOM_SESSION_VERSION = 1 as const;

const ROOM_SESSION_KEY_PREFIX = "sloplash:convex-room-session:v1:";
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/u;
const LEGACY_ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}$/u;
const LEGACY_SESSION_KEYS = [
  "playerId",
  "playerName",
  "playerType",
  "rejoinToken",
  "hostControlToken",
] as const;

export type ConvexRoomGameType = "SLOPLASH" | "AI_CHAT_SHOWDOWN" | "MATCHSLOP";

export type ConvexRoomPlayerType = "HUMAN" | "AI" | "SPECTATOR";

export interface ConvexRoomSession {
  version: typeof CONVEX_ROOM_SESSION_VERSION;
  roomCode: string;
  gameId: string;
  gameType: ConvexRoomGameType;
  playerCapability: string | null;
  hostCapability: string | null;
  playerId: string | null;
  playerName: string | null;
  playerType: ConvexRoomPlayerType | null;
}

export interface ConvexRoomSessionInput {
  roomCode: string;
  gameId: string;
  gameType: ConvexRoomGameType;
  playerCapability: string | null;
  hostCapability?: string | null;
  playerId: string | null;
  playerName: string | null;
  playerType: ConvexRoomPlayerType | null;
}

export interface RoomSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ConvexRoomSessionListener = () => void;

interface CachedRoomSession {
  serialized: string | null;
  session: ConvexRoomSession | null;
}

const roomSessionCache = new WeakMap<RoomSessionStorage, Map<string, CachedRoomSession>>();
const listenersByStorageKey = new Map<string, Set<ConvexRoomSessionListener>>();
let storageEventWindow: Window | null = null;

const emptyUnsubscribe = () => undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isGameType(value: unknown): value is ConvexRoomGameType {
  return value === "SLOPLASH" || value === "AI_CHAT_SHOWDOWN" || value === "MATCHSLOP";
}

function isPlayerType(value: unknown): value is ConvexRoomPlayerType {
  return value === "HUMAN" || value === "AI" || value === "SPECTATOR";
}

function isSupportedRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value) || LEGACY_ROOM_CODE_PATTERN.test(value);
}

function hasValidPlayerIdentity(value: Record<string, unknown>): boolean {
  const hasCapability = isNonEmptyString(value.playerCapability);
  const hasId = isNonEmptyString(value.playerId);
  const hasName = isNonEmptyString(value.playerName);
  const hasType = isPlayerType(value.playerType);
  const hasCompleteIdentity = hasId && hasName && hasType;
  const hasNoIdentity =
    value.playerId === null && value.playerName === null && value.playerType === null;

  return hasCapability ? hasCompleteIdentity : hasNoIdentity;
}

function validateRoomSession(value: unknown, expectedRoomCode?: string): ConvexRoomSession | null {
  if (!isRecord(value)) return null;
  if (value.version !== CONVEX_ROOM_SESSION_VERSION) return null;
  if (typeof value.roomCode !== "string") return null;
  if (!isSupportedRoomCode(value.roomCode)) return null;
  if (expectedRoomCode && value.roomCode !== expectedRoomCode) return null;
  if (!isNonEmptyString(value.gameId)) return null;
  if (!isGameType(value.gameType)) return null;
  if (!isNullableNonEmptyString(value.playerCapability)) return null;
  if (!isNullableNonEmptyString(value.hostCapability)) return null;
  if (!isNullableNonEmptyString(value.playerId)) return null;
  if (!isNullableNonEmptyString(value.playerName)) return null;
  if (value.playerType !== null && !isPlayerType(value.playerType)) return null;
  if (!hasValidPlayerIdentity(value)) return null;
  if (value.playerCapability === null && value.hostCapability === null) {
    return null;
  }

  return {
    version: CONVEX_ROOM_SESSION_VERSION,
    roomCode: value.roomCode,
    gameId: value.gameId,
    gameType: value.gameType,
    playerCapability: value.playerCapability,
    hostCapability: value.hostCapability,
    playerId: value.playerId,
    playerName: value.playerName,
    playerType: value.playerType,
  };
}

function resolveStorage(storage: RoomSessionStorage | undefined): RoomSessionStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStorageCache(storage: RoomSessionStorage): Map<string, CachedRoomSession> {
  const existing = roomSessionCache.get(storage);
  if (existing) return existing;

  const cache = new Map<string, CachedRoomSession>();
  roomSessionCache.set(storage, cache);
  return cache;
}

function cacheRoomSession(
  storage: RoomSessionStorage,
  key: string,
  serialized: string | null,
  session: ConvexRoomSession | null,
): ConvexRoomSession | null {
  const cache = getStorageCache(storage);
  const existing = cache.get(key);
  if (existing?.serialized === serialized) return existing.session;

  cache.set(key, { serialized, session });
  return session;
}

function readRoomSession(
  storage: RoomSessionStorage,
  key: string,
  roomCode: string,
): ConvexRoomSession | null {
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return null;
  }

  const cached = getStorageCache(storage).get(key);
  if (cached?.serialized === serialized) return cached.session;

  const session = serialized ? parseConvexRoomSession(serialized, roomCode) : null;
  return cacheRoomSession(storage, key, serialized, session);
}

function notifyRoomSessionListeners(key: string): void {
  const listeners = listenersByStorageKey.get(key);
  if (!listeners) return;

  for (const listener of listeners) {
    listener();
  }
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.storageArea !== null) {
    try {
      if (storageEventWindow === null || event.storageArea !== storageEventWindow.localStorage) {
        return;
      }
    } catch {
      return;
    }
  }

  if (event.key === null) {
    for (const key of listenersByStorageKey.keys()) {
      notifyRoomSessionListeners(key);
    }
    return;
  }

  notifyRoomSessionListeners(event.key);
}

function ensureStorageEventListener(): void {
  if (storageEventWindow !== null || typeof window === "undefined") return;

  try {
    window.addEventListener("storage", handleStorageEvent);
    storageEventWindow = window;
  } catch {
    storageEventWindow = null;
  }
}

function removeStorageEventListenerWhenIdle(): void {
  if (listenersByStorageKey.size > 0 || storageEventWindow === null) return;

  try {
    storageEventWindow.removeEventListener("storage", handleStorageEvent);
  } finally {
    storageEventWindow = null;
  }
}

function clearLegacySessionKeys(storage: RoomSessionStorage): void {
  for (const key of LEGACY_SESSION_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // The room-scoped record is already authoritative. Legacy cleanup is
      // best-effort so a storage implementation cannot turn a successful write
      // into an apparent failure.
    }
  }
}

export function normalizeConvexRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function getConvexRoomSessionStorageKey(roomCode: string): string | null {
  const normalizedRoomCode = normalizeConvexRoomCode(roomCode);
  if (!isSupportedRoomCode(normalizedRoomCode)) return null;
  return `${ROOM_SESSION_KEY_PREFIX}${normalizedRoomCode}`;
}

export function parseConvexRoomSession(
  serialized: string,
  expectedRoomCode?: string,
): ConvexRoomSession | null {
  const normalizedExpectedRoomCode =
    expectedRoomCode === undefined ? undefined : normalizeConvexRoomCode(expectedRoomCode);

  if (
    normalizedExpectedRoomCode !== undefined &&
    !isSupportedRoomCode(normalizedExpectedRoomCode)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    return validateRoomSession(parsed, normalizedExpectedRoomCode);
  } catch {
    return null;
  }
}

export function getConvexRoomSession(
  roomCode: string,
  storage?: RoomSessionStorage,
): ConvexRoomSession | null {
  const key = getConvexRoomSessionStorageKey(roomCode);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return null;

  return readRoomSession(targetStorage, key, roomCode);
}

/**
 * Returns a referentially stable snapshot while the serialized room record is
 * unchanged. This is the snapshot contract required by useSyncExternalStore.
 */
export function getConvexRoomSessionSnapshot(
  roomCode: string,
  storage?: RoomSessionStorage,
): ConvexRoomSession | null {
  return getConvexRoomSession(roomCode, storage);
}

/**
 * Subscribes to successful writes in this tab and localStorage changes from
 * other tabs. All room subscriptions share one global storage event listener.
 */
export function subscribeConvexRoomSession(
  roomCode: string,
  listener: ConvexRoomSessionListener,
): () => void {
  const key = getConvexRoomSessionStorageKey(roomCode);
  if (!key) return emptyUnsubscribe;

  const subscription = () => listener();
  const listeners = listenersByStorageKey.get(key) ?? new Set();
  listeners.add(subscription);
  listenersByStorageKey.set(key, listeners);
  ensureStorageEventListener();

  let active = true;
  return () => {
    if (!active) return;
    active = false;

    const currentListeners = listenersByStorageKey.get(key);
    currentListeners?.delete(subscription);
    if (currentListeners?.size === 0) {
      listenersByStorageKey.delete(key);
    }
    removeStorageEventListenerWhenIdle();
  };
}

export function setConvexRoomSession(
  input: ConvexRoomSessionInput,
  storage?: RoomSessionStorage,
): boolean {
  const roomCode = normalizeConvexRoomCode(input.roomCode);
  const key = getConvexRoomSessionStorageKey(roomCode);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return false;

  const session = validateRoomSession(
    {
      version: CONVEX_ROOM_SESSION_VERSION,
      roomCode,
      gameId: input.gameId,
      gameType: input.gameType,
      playerCapability: input.playerCapability,
      hostCapability: input.hostCapability ?? null,
      playerId: input.playerId,
      playerName: input.playerName,
      playerType: input.playerType,
    },
    roomCode,
  );
  if (!session) return false;

  try {
    const serialized = JSON.stringify(session);
    targetStorage.setItem(key, serialized);
    cacheRoomSession(targetStorage, key, serialized, session);
  } catch {
    return false;
  }

  // The global legacy record has no room code, and its tokens are not Convex
  // capabilities. Never infer a migration while reading. Once an authoritative
  // Convex room session is stored, removing those superseded keys is unambiguous.
  clearLegacySessionKeys(targetStorage);
  notifyRoomSessionListeners(key);
  return true;
}

export function clearConvexRoomSessionCapability(
  roomCode: string,
  capability: string,
  storage?: RoomSessionStorage,
): boolean {
  if (capability.trim().length === 0) return false;

  const session = getConvexRoomSession(roomCode, storage);
  if (!session) return false;

  const clearsPlayer = session.playerCapability === capability;
  const clearsHost = session.hostCapability === capability;
  if (!clearsPlayer && !clearsHost) return false;

  const playerCapability = clearsPlayer ? null : session.playerCapability;
  const hostCapability = clearsHost ? null : session.hostCapability;
  if (playerCapability === null && hostCapability === null) {
    return clearConvexRoomSession(roomCode, storage);
  }

  return setConvexRoomSession(
    {
      roomCode: session.roomCode,
      gameId: session.gameId,
      gameType: session.gameType,
      playerCapability,
      hostCapability,
      playerId: clearsPlayer ? null : session.playerId,
      playerName: clearsPlayer ? null : session.playerName,
      playerType: clearsPlayer ? null : session.playerType,
    },
    storage,
  );
}

export function clearConvexRoomSession(roomCode: string, storage?: RoomSessionStorage): boolean {
  const key = getConvexRoomSessionStorageKey(roomCode);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return false;

  try {
    targetStorage.removeItem(key);
    cacheRoomSession(targetStorage, key, null, null);
    notifyRoomSessionListeners(key);
    return true;
  } catch {
    return false;
  }
}
