import type { RoomView } from "@/room/context";
import { fixtureId, type Fixture } from "./base";

/** The same view as seen by another seat, or by a TV with no seat. */
function seenBy(view: RoomView, playerIndex: number | null, isHost: boolean): RoomView {
  const player = playerIndex === null ? null : (view.players[playerIndex] ?? null);
  return {
    ...view,
    me: {
      sessionId: fixtureId("playerSessions", player?.id ?? "tv"),
      playerId: player?.id ?? null,
      name: player?.name ?? null,
      isHost,
    },
  };
}

function withRoom(view: RoomView, room: Partial<RoomView["room"]>): RoomView {
  return { ...view, room: { ...view.room, ...room } };
}

/**
 * "Play again" moments for one game, derived from its own final and lobby
 * fixtures so they follow that game's screens: the end as a guest, as a seat
 * that was left behind, as the TV that hosts, and the rematch lobby.
 */
export function rematchFixtures(prefix: string, fixtures: Fixture[]): Fixture[] {
  const final = fixtures.find(
    (fixture) => fixture.view.room.status === "FINISHED" && fixture.view.me?.playerId,
  );
  const lobby = fixtures.find((fixture) => fixture.view.room.status === "LOBBY");
  const out: Fixture[] = [];
  if (final) {
    const view = final.view;
    out.push(
      {
        id: `${prefix}-final-tv-host`,
        label: "Final results: the TV hosts (Play again on the stage)",
        view: withRoom(seenBy(view, null, true), { hasDisplayHost: true, hostPlayerId: null }),
      },
      {
        id: `${prefix}-final-guest`,
        label: "Final results: a guest's phone",
        view: seenBy(view, 1, false),
      },
      {
        id: `${prefix}-final-left-behind`,
        label: "Final results: left behind while the room plays again",
        view: withRoom(seenBy(view, 1, false), { next: { gameNumber: 2, status: "LOBBY" } }),
      },
      {
        id: `${prefix}-final-next-started`,
        label: "Final results: left behind, the next game already started",
        view: withRoom(seenBy(view, 1, false), { next: { gameNumber: 2, status: "PLAYING" } }),
      },
    );
  }
  // A game without a lobby fixture gets one made from its final: same seats, scores at 0.
  const base =
    lobby?.view ??
    (final && {
      ...final.view,
      players: final.view.players.map((player) => ({ ...player, score: 0 })),
      usage: null,
    });
  if (base) {
    out.push({
      id: `${prefix}-rematch-lobby`,
      label: "Lobby after Play again (game 2)",
      view: withRoom(base, {
        id: fixtureId("games", "rematch"),
        gameNumber: 2,
        next: null,
        status: "LOBBY",
        phase: "LOBBY",
        step: 0,
        round: 0,
        phaseDeadline: null,
      }),
    });
  }
  return out;
}
