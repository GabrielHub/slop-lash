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

    expect(normalizeConvexRoomCode(" abc234 ")).toBe("ABC234");
    expect(setConvexRoomSession(playerSession(" abcdef "), storage)).toBe(true);
    expect(getConvexRoomSession("ABCDEF", storage)).toEqual({
      version: CONVEX_ROOM_SESSION_VERSION,
      roomCode: "ABCDEF",
      gameId: "game-id",
      gameType: "SLOPLASH",
      playerCapability: "player-capability",
      hostCapability: null,
      playerId: "player-id",
      playerName: "Riley",
      playerType: "HUMAN",
    });
  });

  it("round-trips the QuizSlop game type through the canonical game-type list", () => {
    const storage = new MemoryStorage();

    expect(
      setConvexRoomSession({ ...playerSession("ABC234"), gameType: "QUIZSLOP" }, storage),
    ).toBe(true);
    expect(getConvexRoomSession("ABC234", storage)?.gameType).toBe("QUIZSLOP");
  });

  it("isolates sessions by room and clears only the requested room", () => {
    const storage = new MemoryStorage();
    setConvexRoomSession(playerSession("ABCDEF"), storage);
    setConvexRoomSession(
      {
        ...playerSession("WXYZ23"),
        playerCapability: "second-capability",
        playerId: "second-player",
      },
      storage,
    );

    expect(clearConvexRoomSession("abcdef", storage)).toBe(true);
    expect(getConvexRoomSession("ABCDEF", storage)).toBeNull();
    expect(getConvexRoomSession("WXYZ23", storage)?.playerId).toBe("second-player");
  });

  it("returns the same snapshot object while serialized state is unchanged", () => {
    const storage = new MemoryStorage();
    expect(setConvexRoomSession(playerSession("ABCDEF"), storage)).toBe(true);

    const firstSnapshot = getConvexRoomSessionSnapshot("ABCDEF", storage);
    expect(getConvexRoomSessionSnapshot("ABCDEF", storage)).toBe(firstSnapshot);

    expect(setConvexRoomSession(playerSession("ABCDEF"), storage)).toBe(true);
    expect(getConvexRoomSessionSnapshot("ABCDEF", storage)).toBe(firstSnapshot);

    expect(
      setConvexRoomSession({ ...playerSession("ABCDEF"), playerName: "Morgan" }, storage),
    ).toBe(true);
    expect(getConvexRoomSessionSnapshot("ABCDEF", storage)).not.toBe(firstSnapshot);
  });

  it("notifies only same-room subscribers after successful same-tab changes", () => {
    const storage = new MemoryStorage();
    let notifications = 0;
    const unsubscribe = subscribeConvexRoomSession(" abcdef ", () => {
      notifications += 1;
    });

    expect(setConvexRoomSession(playerSession("WXYZ23"), storage)).toBe(true);
    expect(notifications).toBe(0);
    expect(setConvexRoomSession(playerSession("ABCDEF"), storage)).toBe(true);
    expect(notifications).toBe(1);
    expect(clearConvexRoomSession("ABCDEF", storage)).toBe(true);
    expect(notifications).toBe(2);

    unsubscribe();
    expect(setConvexRoomSession(playerSession("ABCDEF"), storage)).toBe(true);
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
      unsubscribeFirst = subscribeConvexRoomSession("ABCDEF", () => {
        firstRoomNotifications += 1;
      });
      unsubscribeSecond = subscribeConvexRoomSession("WXYZ23", () => {
        secondRoomNotifications += 1;
      });

      const firstRoomKey = getConvexRoomSessionStorageKey("ABCDEF");
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
          roomCode: "JKLMNP",
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
    expect(getConvexRoomSession("JKLMNP", storage)).toMatchObject({
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
          roomCode: "ABCDEF",
        }),
      ),
    ).toBeNull();
    expect(
      parseConvexRoomSession(
        JSON.stringify({
          version: CONVEX_ROOM_SESSION_VERSION,
          roomCode: "ABCDEF",
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
      roomCode: "ABCDEF",
      gameId: "game-id",
      gameType: "SLOPLASH",
      playerCapability: "capability",
      hostCapability: null,
      playerId: "player-id",
      playerName: "Riley",
      playerType: "HUMAN",
    });
    expect(parseConvexRoomSession(valid, "WXYZ23")).toBeNull();
  });

  it("is safe when rendered without a browser storage implementation", () => {
    expect(getConvexRoomSession("ABCDEF")).toBeNull();
    expect(setConvexRoomSession(playerSession("ABCDEF"))).toBe(false);
    expect(clearConvexRoomSession("ABCDEF")).toBe(false);
  });

  it("rejects invalid room codes before touching storage", () => {
    const storage = new MemoryStorage();

    expect(getConvexRoomSessionStorageKey("I00000")).toBeNull();
    expect(setConvexRoomSession(playerSession("I00000"), storage)).toBe(false);
    expect(getConvexRoomSession("I00000", storage)).toBeNull();
    expect(parseConvexRoomSession(JSON.stringify(playerSession("ABCDEF")), "")).toBeNull();
  });
});
