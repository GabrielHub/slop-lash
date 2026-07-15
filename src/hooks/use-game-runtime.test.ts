import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { getMockScenario } from "@/dev/game-fixtures/scenarios";
import { CONVEX_ROOM_SESSION_VERSION } from "@/lib/convex-room-session";
import { useConvexRoomSession } from "./use-convex-room-session";
import { GameRuntimeProvider, useGameRuntime, type GameRuntime } from "./use-game-runtime";

function RuntimeProbe({ roomCode }: { roomCode: string }) {
  const runtime = useGameRuntime(roomCode);
  const session = useConvexRoomSession(roomCode);
  return createElement(
    "span",
    null,
    `${runtime?.gameState.status ?? "no-runtime"}:${session?.playerId ?? "no-session"}`,
  );
}

function makeRuntime(): GameRuntime {
  const scenario = getMockScenario("lobby-host-ready");
  if (!scenario) throw new Error("Missing Slop-Lash lobby fixture");
  const player = scenario.game.players.find((entry) => entry.id === scenario.playerId);
  return {
    gameState: scenario.game,
    roomCode: "mock-lobby-host-ready",
    session: {
      gameId: "mock-lobby-host-ready",
      gameType: "SLOPLASH",
      hostCapability: "fixture-host-capability",
      playerCapability: "fixture-player-capability",
      playerId: scenario.playerId,
      playerName: player?.name ?? null,
      playerType: player?.type ?? null,
      roomCode: "mock-lobby-host-ready",
      version: CONVEX_ROOM_SESSION_VERSION,
    },
  };
}

function renderProbe(runtime: GameRuntime, roomCode: string): string {
  const probe = createElement(RuntimeProbe, { roomCode });
  return renderToString(createElement(GameRuntimeProvider, { value: runtime }, probe));
}

describe("GameRuntimeProvider", () => {
  it("provides fixture state and room session without browser storage", () => {
    const runtime = makeRuntime();
    const html = renderProbe(runtime, "MOCK-LOBBY-HOST-READY");

    expect(html).toContain(`>LOBBY:${runtime.session.playerId}<`);
  });

  it("does not leak a fixture runtime into a different room", () => {
    const html = renderProbe(makeRuntime(), "ABCD");

    expect(html).toContain(">no-runtime:no-session<");
  });
});
