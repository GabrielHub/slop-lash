"use client";

import dynamic from "next/dynamic";
import { GAME_META } from "@/games/meta";
import { useRoom, type RoomView } from "@/room/context";
import type { GameUi } from "@/room/game-ui";
import {
  HostStartBar,
  JoinPanel,
  StageStart,
  WaitingForHost,
  usePlayerSounds,
} from "@/room/lobby";

// Foundation stub. The Stage and Controller workstreams replace the screens;
// keep this module light: the 3D layer is reachable only through the one
// `next/dynamic` import below, so phones and the lobby never fetch it.

const PHASE_LABELS: Record<string, string> = {
  BUILD: "Build",
  FOUNDRY: "The Foundry",
  ROSTER: "Roster",
  FACE_OFF: "Face-off",
  FIGHT: "Fight",
  RESULT: "Result",
  STANDINGS: "Standings",
  UPGRADE: "Upgrade",
};

const ADVANCE_LABELS: Record<string, string> = {
  BUILD: "Forge what we have",
  FOUNDRY: "Stop waiting",
  ROSTER: "To the face-off",
  FACE_OFF: "Close the bets",
  FIGHT: "Skip to the result",
  RESULT: "Next fight",
  STANDINGS: "To the upgrades",
  UPGRADE: "Forge the upgrades",
};

function phaseLabel(view: RoomView): string {
  if (view.room.status === "FINISHED") return "Results";
  return PHASE_LABELS[view.room.phase] ?? view.room.phase;
}

function advanceLabel(view: RoomView): string {
  return ADVANCE_LABELS[view.room.phase] ?? "Skip ahead";
}

function StageLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center portrait:min-h-svh">
      <p className="rounded-2xl border-2 border-edge bg-surface px-[1.5rem] py-[1rem] font-display text-[1.25rem] font-bold text-ink-dim">
        Setting up the arena...
      </p>
    </div>
  );
}

const StageRoot = dynamic(() => import("../stage3d/stage-root"), {
  ssr: false,
  loading: StageLoading,
});

/**
 * Until the arena draws its own marquee and Start, a plain card carries the
 * join code and the host's Start over the canvas in the lobby.
 */
function InterimLobby() {
  const { view } = useRoom();
  usePlayerSounds(view.players);
  return (
    <div className="@container absolute bottom-[1.5rem] left-[1.5rem] z-10 flex w-[min(28rem,calc(100%-3rem))] flex-col gap-[1rem] rounded-[1.5rem] border-2 border-edge bg-surface/90 p-[1.25rem]">
      <JoinPanel />
      {view.me?.isHost ? <StageStart keys /> : <WaitingForHost className="text-[1rem]" />}
    </div>
  );
}

function SlopfightStage() {
  const lobby = useRoom().view.room.status === "LOBBY";
  return (
    <div className="relative flex-1 overflow-hidden portrait:min-h-svh">
      <StageRoot />
      {lobby && <InterimLobby />}
    </div>
  );
}

function SlopfightController() {
  const { view } = useRoom();
  const { room, me } = view;
  if (room.status === "LOBBY") {
    return (
      <main className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="font-display text-sm font-extrabold uppercase tracking-[0.25em] text-punch">
            {GAME_META.SLOPFIGHT.name}
          </p>
          <p className="font-display text-3xl font-bold text-ink">You&apos;re in!</p>
          <p className="text-base text-ink-dim">Watch the TV.</p>
        </div>
        {me?.isHost ? (
          <HostStartBar />
        ) : (
          <div className="sticky bottom-0 bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <WaitingForHost className="text-sm" />
          </div>
        )}
      </main>
    );
  }
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-3xl font-bold text-ink">{phaseLabel(view)}</p>
    </main>
  );
}

export const slopfightUi: GameUi = {
  name: GAME_META.SLOPFIGHT.name,
  theme: GAME_META.SLOPFIGHT.theme,
  tagline: GAME_META.SLOPFIGHT.tagline,
  howTo: ["Draw or describe a champion", "Bet on every fight", "Add one thing, win it all"],
  ambient: "confetti",
  Stage: SlopfightStage,
  Controller: SlopfightController,
  phaseLabel,
  advanceLabel,
  // One canvas from the lobby to the podium; the scene draws the lobby, the clock and the header.
  ownsLobby: true,
  chrome: () => ({ stageRail: false, phoneBar: false }),
};
