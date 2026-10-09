"use client";

import type { GameUi } from "@/room/game-ui";
import { useRoom, type RoomView } from "@/room/context";
import {
  ControllerFinal,
  ControllerReveal,
  ControllerRoundResults,
  ControllerVoting,
  ControllerWriting,
} from "./controller";
import { SloplashStageEffects } from "./narrator";
import { StageFinal, StageRoundResults } from "./results";
import { StageMatchup, StageWriting } from "./stage";

function Stage() {
  const { room } = useRoom().view;
  if (room.status === "FINISHED") return <StageFinal />;
  switch (room.phase) {
    case "WRITING":
      return <StageWriting />;
    case "VOTING":
    case "REVEAL":
      return <StageMatchup />;
    case "ROUND_RESULTS":
      return <StageRoundResults />;
    default:
      return null;
  }
}

function Controller() {
  const { room } = useRoom().view;
  if (room.status === "FINISHED") return <ControllerFinal />;
  switch (room.phase) {
    case "WRITING":
      return <ControllerWriting />;
    case "VOTING":
      return <ControllerVoting />;
    case "REVEAL":
      return <ControllerReveal />;
    case "ROUND_RESULTS":
      return <ControllerRoundResults />;
    default:
      return null;
  }
}

const PHASE_LABELS: Record<string, string> = {
  WRITING: "Writing",
  VOTING: "Voting",
  REVEAL: "Reveal",
  ROUND_RESULTS: "Results",
};

/** How many matchups this round goes to a vote. */
function matchupCount({ mode }: RoomView) {
  return mode.kind === "SLOPLASH" ? mode.matchupCount : 0;
}

export const sloplashUi: GameUi = {
  name: "SlopLash",
  Stage,
  Controller,
  StageEffects: SloplashStageEffects,
  phaseLabel: (view) => {
    const { phase, status, step } = view.room;
    if (status === "FINISHED") return "Final results";
    const label = PHASE_LABELS[phase] ?? phase;
    return phase === "VOTING" || phase === "REVEAL"
      ? `${label} ${step + 1}/${matchupCount(view)}`
      : label;
  },
  advanceLabel: (view) => {
    const { phase, step, round, totalRounds } = view.room;
    switch (phase) {
      case "WRITING":
        return "End writing";
      case "VOTING":
        return "Close voting";
      case "REVEAL":
        return step + 1 >= matchupCount(view) ? "See results" : "Next matchup";
      case "ROUND_RESULTS":
        return round >= totalRounds ? "Final results" : "Next round";
      default:
        return "Next";
    }
  },
};
