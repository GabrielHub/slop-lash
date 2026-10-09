"use client";

import type { GameUi } from "@/room/game-ui";
import { useModeView, useRoom, type RoomView } from "@/room/context";
import { useCelebration, useCue } from "@/room/effects";
import { MatchslopController } from "./controller";
import { MatchslopStage, MatchslopStageLobby } from "./stage";

/** The dating app's sound cues on the big screen. */
function MatchslopSounds() {
  const { room, players } = useRoom().view;
  const mode = useModeView("MATCHSLOP");
  const round = mode.round;
  const writing = room.status === "PLAYING" && room.phase === "WRITING";
  const allIn =
    writing && players.length >= 2 && (round?.answeredPlayerIds.length ?? 0) >= players.length;

  useCue(`${room.round}:${writing}`, "round-start", writing && room.round > 1);
  useCue(`${room.round}:${allIn}`, "all-in", allIn);
  useCue(round?.votedPlayerIds.length ?? 0, "vote-cast", room.phase === "VOTING");
  useCue(`${room.round}:${room.phase}`, "winner-reveal", room.phase === "SENT");
  useCue(room.status, "game-over", room.status === "FINISHED");

  const last = mode.messages.at(-1);
  useCue(mode.messages.length, last?.speaker === "PERSONA" ? "chat-receive" : "chat-send");

  const sealed = room.status === "FINISHED" && mode.outcome === "DATE_SEALED";
  useCelebration(sealed, [], { followUp: { sound: "celebration", delayMs: 2000 } });

  return null;
}

function phaseLabel(view: RoomView): string {
  const { room, mode } = view;
  if (room.status === "FINISHED") return "Final";
  if (mode.kind === "MATCHSLOP" && mode.comeback) return "Comeback";
  switch (room.phase) {
    case "PROFILE":
      return "Profile";
    case "WRITING":
      return room.round === 1 ? "Opener" : "Writing";
    case "VOTING":
      return "Voting";
    case "SENT":
      return "Sent";
    case "REPLY":
      return "Reply";
    default:
      return room.phase;
  }
}

function advanceLabel(view: RoomView): string {
  const { room, mode } = view;
  switch (room.phase) {
    case "WRITING":
      return "End writing";
    case "VOTING":
      return "Close voting";
    case "REPLY":
      return mode.kind === "MATCHSLOP" && mode.outcome !== "IN_PROGRESS"
        ? "Show the ending"
        : "Next message";
    default:
      return "Skip ahead";
  }
}

export const matchslopUi: GameUi = {
  name: "MatchSlop",
  theme: "matchslop",
  Stage: MatchslopStage,
  Controller: MatchslopController,
  StageLobby: MatchslopStageLobby,
  StageEffects: MatchslopSounds,
  phaseLabel,
  advanceLabel,
};
