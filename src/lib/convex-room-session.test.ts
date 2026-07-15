import { describe, expect, it } from "vite-plus/test";
import {
  CONVEX_ROOM_SESSION_VERSION,
  clearConvexRoomSession,
  clearConvexRoomSessionCapability,
  getConvexRoomSession,
  getConvexRoomSessionSnapshot,
  getConvexRoomSessionStorageKey,
  normalizeConvexRoomCode,
  parseConvexRoomSession,
  setConvexRoomSession,
  subscribeConvexRoomSession,
  type RoomSessionStorage,
} from "./convex-room-session";

class MemoryStorage implements RoomSessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class CrossTabStorageEvent extends Event {
  readonly storageArea = null;

  constructor(readonly key: string | null) {
    super("storage");
  }
}

function installTestWindow(target: EventTarget): () => void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: target,
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "window", originalDescriptor);
      return;
    }
    Reflect.deleteProperty(globalThis, "window");
  };
}

function playerSession(roomCode: string) {
  return {
    roomCode,
    gameId: "game-id",
    gameType: "SLOPLASH" as const,
    playerCapability: "player-capability",
    playerId: "player-id",
    playerName: "Riley",
    playerType: "HUMAN" as const,
  };
}

describe("Convex room sessions", () => {
  it("normalizes room codes and round-trips a player session", () => {
    const storage = new MemoryStorage();

    expect(normalizeConvexRoomCode(" abcd ")).toBe("ABCD");
    expect(normalizeConvexRoomCode(" abc234 ")).toBe("ABC234");
    expect(setConvexRoomSession(playerSession(" abcd "), storage)).toBe(true);
    expect(getConvexRoomSession("ABCD", storage)).toEqual({
      version: CONVEX_ROOM_SESSION_VERSION,
      roomCode: "ABCD",
      gameId: "game-id",
      gameType: "SLOPLASH",
      playerCapability: "player-capability",
      hostCapability: null,
      playerId: "player-id",
      playerName: "Riley",
      playerType: "HUMAN",
    });
  });

  it("isolates sessions by room and clears only the requested room", () => {
    const storage = new MemoryStorage();
    setConvexRoomSession(playerSession("ABCD"), storage);
    setConvexRoomSession(
      {
        ...playerSession("WXYZ"),
        playerCapability: "second-capability",
        playerId: "second-player",
      },
      storage,
    );

    expect(clearConvexRoomSession("abcd", storage)).toBe(true);
    expect(getConvexRoomSession("ABCD", storage)).toBeNull();
    expect(getConvexRoomSession("WXYZ", storage)?.playerId).toBe("second-player");
  });

  it("returns the same snapshot object while serialized state is unchanged", () => {
    const storage = new MemoryStorage();
    expect(setConvexRoomSession(playerSession("ABCD"), storage)).toBe(true);

    const firstSnapshot = getConvexRoomSessionSnapshot("ABCD", storage);
    expect(getConvexRoomSessionSnapshot("ABCD", storage)).toBe(firstSnapshot);

    expect(setConvexRoomSession(playerSession("ABCD"), storage)).toBe(true);
    expect(getConvexRoomSessionSnapshot("ABCD", storage)).toBe(firstSnapshot);

    expect(setConvexRoomSession({ ...playerSession("ABCD"), playerName: "Morgan" }, storage)).toBe(
      true,
    );
    expect(getConvexRoomSessionSnapshot("ABCD", storage)).not.toBe(firstSnapshot);
  });

  it("notifies only same-room subscribers after successful same-tab changes", () => {
    const storage = new MemoryStorage();
    let notifications = 0;
    const unsubscribe = subscribeConvexRoomSession(" abcd ", () => {
      notifications += 1;
    });

    expect(setConvexRoomSession(playerSession("WXYZ"), storage)).toBe(true);
    expect(notifications).toBe(0);
    expect(setConvexRoomSession(playerSession("ABCD"), storage)).toBe(true);
    expect(notifications).toBe(1);
    expect(clearConvexRoomSession("ABCD", storage)).toBe(true);
    expect(notifications).toBe(2);

    unsubscribe();
    expect(setConvexRoomSession(playerSession("ABCD"), storage)).toBe(true);
    expect(notifications).toBe(2);
  });

  it("routes cross-tab storage events by room and handles storage-wide clears", () => {
    const testWindow = new EventTarget();
    const restoreWindow = installTestWindow(testWindow);
    let firstRoomNotifications = 0;
    let secondRoomNotifications = 0;
    let unsubscribeFirst: () => void = () => undefined;
    let unsubscribeSecond: () => void = () => undefined;

    try {
      unsubscribeFirst = subscribeConvexRoomSession("ABCD", () => {
        firstRoomNotifications += 1;
      });
      unsubscribeSecond = subscribeConvexRoomSession("WXYZ", () => {
        secondRoomNotifications += 1;
      });

      const firstRoomKey = getConvexRoomSessionStorageKey("ABCD");
      if (!firstRoomKey) throw new Error("Expected a valid room storage key");
      testWindow.dispatchEvent(new CrossTabStorageEvent(firstRoomKey));
      expect(firstRoomNotifications).toBe(1);
      expect(secondRoomNotifications).toBe(0);

      testWindow.dispatchEvent(new CrossTabStorageEvent("unrelated-key"));
      expect(firstRoomNotifications).toBe(1);
      expect(secondRoomNotifications).toBe(0);

      testWindow.dispatchEvent(new CrossTabStorageEvent(null));
      expect(firstRoomNotifications).toBe(2);
      expect(secondRoomNotifications).toBe(1);
    } finally {
      unsubscribeFirst();
      unsubscribeSecond();
      restoreWindow();
    }
  });

  it("supports a display-only host without inventing a player identity", () => {
    const storage = new MemoryStorage();

    expect(
      setConvexRoomSession(
        {
          roomCode: "JKLM",
          gameId: "match-game-id",
          gameType: "MATCHSLOP",
          playerCapability: null,
          hostCapability: "host-capability",
          playerId: null,
          playerName: null,
          playerType: null,
        },
        storage,
      ),
    ).toBe(true);
    expect(getConvexRoomSession("JKLM", storage)).toMatchObject({
      playerCapability: null,
      hostCapability: "host-capability",
      playerId: null,
      playerName: null,
      playerType: null,
    });
  });

  it("clears one distinct authority without deleting the other", () => {
    const storage = new MemoryStorage();
    expect(
      setConvexRoomSession(
        {
          ...playerSession("ABC234"),
          hostCapability: "host-capability",
        },
        storage,
      ),
    ).toBe(true);

    expect(clearConvexRoomSessionCapability("ABC234", "player-capability", storage)).toBe(true);
    expect(getConvexRoomSession("ABC234", storage)).toEqual({
      version: CONVEX_ROOM_SESSION_VERSION,
      roomCode: "ABC234",
      gameId: "game-id",
      gameType: "SLOPLASH",
      playerCapability: null,
      hostCapability: "host-capability",
      playerId: null,
      playerName: null,
      playerType: null,
    });
  });

  it("clears both authorities when they share the failing capability", () => {
    const storage = new MemoryStorage();
    expect(
      setConvexRoomSession(
        {
          ...playerSession("ABC234"),
          playerCapability: "shared-capability",
          hostCapability: "shared-capability",
        },
        storage,
      ),
    ).toBe(true);

    expect(clearConvexRoomSessionCapability("ABC234", "shared-capability", storage)).toBe(true);
    expect(getConvexRoomSession("ABC234", storage)).toBeNull();
  });

  it("rejects malformed, unsupported, mismatched, and inconsistent records", () => {
    expect(parseConvexRoomSession("not json")).toBeNull();
    expect(
      parseConvexRoomSession(
        JSON.stringify({
          version: 2,
          roomCode: "ABCD",
        }),
      ),
    ).toBeNull();
    expect(
      parseConvexRoomSession(
        JSON.stringify({
          version: CONVEX_ROOM_SESSION_VERSION,
          roomCode: "ABCD",
          gameId: "game-id",
          gameType: "SLOPLASH",
          playerCapability: "capability",
          hostCapability: null,
          playerId: "player-id",
          playerName: null,
          playerType: "HUMAN",
        }),
      ),
    ).toBeNull();

    const valid = JSON.stringify({
      version: CONVEX_ROOM_SESSION_VERSION,
      roomCode: "ABCD",
      gameId: "game-id",
      gameType: "SLOPLASH",
      playerCapability: "capability",
      hostCapability: null,
      playerId: "player-id",
      playerName: "Riley",
      playerType: "HUMAN",
    });
    expect(parseConvexRoomSession(valid, "WXYZ")).toBeNull();
  });

  it("does not guess a room for legacy global keys", () => {
    const storage = new MemoryStorage();
    storage.setItem("playerId", "legacy-player");
    storage.setItem("playerName", "Legacy Riley");
    storage.setItem("playerType", "HUMAN");
    storage.setItem("rejoinToken", "legacy-player-token");
    storage.setItem("hostControlToken", "legacy-host-token");

    expect(getConvexRoomSession("ABCD", storage)).toBeNull();
    expect(storage.getItem("rejoinToken")).toBe("legacy-player-token");
    expect(storage.getItem("hostControlToken")).toBe("legacy-host-token");
  });

  it("cleans legacy keys only after an authoritative scoped write succeeds", () => {
    const storage = new MemoryStorage();
    storage.setItem("playerId", "legacy-player");
    storage.setItem("playerName", "Legacy Riley");
    storage.setItem("playerType", "HUMAN");
    storage.setItem("rejoinToken", "legacy-player-token");
    storage.setItem("hostControlToken", "legacy-host-token");
    storage.setItem("theme", "dark");

    expect(setConvexRoomSession(playerSession("ABCD"), storage)).toBe(true);
    for (const key of ["playerId", "playerName", "playerType", "rejoinToken", "hostControlToken"]) {
      expect(storage.getItem(key)).toBeNull();
    }
    expect(storage.getItem("theme")).toBe("dark");
  });

  it("preserves legacy keys when the scoped write fails", () => {
    const values = new Map<string, string>([["rejoinToken", "legacy-player-token"]]);
    const storage: RoomSessionStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: () => {
        throw new Error("Storage is unavailable");
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };

    expect(setConvexRoomSession(playerSession("ABCD"), storage)).toBe(false);
    expect(storage.getItem("rejoinToken")).toBe("legacy-player-token");
  });

  it("is safe when rendered without a browser storage implementation", () => {
    expect(getConvexRoomSession("ABCD")).toBeNull();
    expect(setConvexRoomSession(playerSession("ABCD"))).toBe(false);
    expect(clearConvexRoomSession("ABCD")).toBe(false);
  });

  it("rejects invalid room codes before touching storage", () => {
    const storage = new MemoryStorage();

    expect(getConvexRoomSessionStorageKey("I000")).toBeNull();
    expect(setConvexRoomSession(playerSession("I000"), storage)).toBe(false);
    expect(getConvexRoomSession("I000", storage)).toBeNull();
    expect(parseConvexRoomSession(JSON.stringify(playerSession("ABCD")), "")).toBeNull();
  });
});
