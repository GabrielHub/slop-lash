import { describe, expect, it } from "vite-plus/test";
import { ConvexError } from "convex/values";
import {
  clearRoomShellCapability,
  getRoomShellErrorPresentation,
} from "./room-shell-error-boundary";
import {
  getConvexRoomSession,
  setConvexRoomSession,
  type RoomSessionStorage,
} from "../lib/convex-room-session";

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

describe("getRoomShellErrorPresentation", () => {
  it("turns revoked room capabilities into a safe rejoin message", () => {
    expect(
      getRoomShellErrorPresentation(new ConvexError("Invalid or expired room capability")),
    ).toEqual({
      detail: null,
      message: "You may have been removed from the room, or the room session has expired.",
      title: "Room access ended",
    });
  });

  it("keeps an actionable detail for unrelated live-query failures", () => {
    expect(getRoomShellErrorPresentation(new Error("Connection interrupted"))).toEqual({
      detail: "Connection interrupted",
      message: "The live room connection failed. You can retry without leaving this page.",
      title: "Room connection failed",
    });
  });

  it("forgets only the capability used by the failed shell query", () => {
    const storage = new MemoryStorage();
    expect(
      setConvexRoomSession(
        {
          roomCode: "ABC234",
          gameId: "game-id",
          gameType: "MATCHSLOP",
          playerCapability: "player-capability",
          hostCapability: "host-capability",
          playerId: "player-id",
          playerName: "Guest",
          playerType: "HUMAN",
        },
        storage,
      ),
    ).toBe(true);

    expect(clearRoomShellCapability("ABC234", "host-capability", storage)).toBe(true);
    expect(getConvexRoomSession("ABC234", storage)).toMatchObject({
      hostCapability: null,
      playerCapability: "player-capability",
      playerId: "player-id",
    });
  });

  it("does not erase a session when no failing capability is known", () => {
    const storage = new MemoryStorage();
    expect(
      setConvexRoomSession(
        {
          roomCode: "ABC234",
          gameId: "game-id",
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

    expect(clearRoomShellCapability("ABC234", null, storage)).toBe(false);
    expect(getConvexRoomSession("ABC234", storage)?.hostCapability).toBe("host-capability");
  });
});
