import type { Id, TableNames } from "../../../convex/_generated/dataModel";
import type { RoomPlayer, RoomView } from "@/room/context";

/** One screenshot-able moment of a game, rendered through the real stage and controller. */
export type Fixture = {
  id: string;
  label: string;
  view: RoomView;
};

export const FIXTURE_NOW = Date.parse("2026-10-09T20:00:00.000Z");

export function fixtureId<T extends TableNames>(table: T, key: string | number) {
  return `${table}_${key}` as Id<T>;
}

export function fixturePlayer(
  key: string,
  name: string,
  overrides: Partial<RoomPlayer> = {},
): RoomPlayer {
  return {
    id: fixtureId("players", key),
    name,
    type: "HUMAN",
    modelId: null,
    score: 0,
    online: true,
    joinedAt: FIXTURE_NOW - 60_000,
    ...overrides,
  };
}

/**
 * A room view seen by `players[0]`, who is also the host. Override `room`
 * for the phase and pass the mode view for the game.
 */
export function fixtureView(
  players: RoomPlayer[],
  room: Partial<RoomView["room"]> & Pick<RoomView["room"], "gameType">,
  mode: RoomView["mode"],
  options: { viewer?: RoomPlayer | null; usage?: RoomView["usage"] } = {},
): RoomView {
  const viewer = options.viewer === undefined ? players[0]! : options.viewer;
  const playing = room.status === "PLAYING";
  return {
    room: {
      id: fixtureId("games", "fixture"),
      // A real code: six characters from the room-code alphabet, so fixtures show the true layout.
      code: "SLPW42",
      gameNumber: 1,
      next: null,
      status: "LOBBY",
      phase: "LOBBY",
      step: 0,
      round: 0,
      totalRounds: 3,
      minPlayers: 2,
      maxPlayers: 8,
      phaseGeneration: 1,
      phaseStartedAt: FIXTURE_NOW - 10_000,
      phaseDeadline: playing ? FIXTURE_NOW + 50_000 : null,
      timersDisabled: false,
      awaitingAi: false,
      freePlay: false,
      ttsMode: "OFF",
      ttsVoice: "RANDOM",
      hostPlayerId: players[0]?.id ?? null,
      hasDisplayHost: false,
      ...room,
    },
    me: viewer
      ? {
          sessionId: fixtureId("playerSessions", viewer.id),
          playerId: viewer.id,
          name: viewer.name,
          isHost: viewer.id === players[0]?.id,
        }
      : null,
    players,
    usage: options.usage ?? null,
    mode,
  };
}
