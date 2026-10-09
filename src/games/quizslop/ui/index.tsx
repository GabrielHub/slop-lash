"use client";

import { useRoom, type RoomView } from "@/room/context";
import { useCelebration, useCue } from "@/room/effects";
import type { GameUi } from "@/room/game-ui";
import { Controller, ControllerLobby } from "./controller";
import { Stage, StageLobby } from "./stage";

const PHASE_LABELS: Record<string, string> = {
  TOPIC: "Topic",
  CALL: "Call Slop",
  ANSWER: "Answering",
  REVEAL: "Reveal",
  ROUND_RESULTS: "Results",
  HOUSE_VOTE: "Final vote",
};

function phaseLabel({ room, mode }: RoomView): string {
  if (room.status === "FINISHED") return "Final";
  if (room.phase === "REVEAL" && mode.kind === "QUIZSLOP") {
    return `Reveal ${room.step + 1}/${mode.revealTotal}`;
  }
  return PHASE_LABELS[room.phase] ?? room.phase;
}

function advanceLabel({ room, mode }: RoomView): string {
  if (mode.kind !== "QUIZSLOP") return "Next";
  switch (room.phase) {
    case "TOPIC":
      return mode.callsNext ? "Start calls" : "Open answers";
    case "CALL":
      return "Close calls";
    case "ANSWER":
      return "Lock answers";
    case "REVEAL":
      return room.step + 1 < mode.revealTotal ? "Next question" : "Round results";
    case "ROUND_RESULTS":
      if (room.round >= room.totalRounds) return "Final results";
      return room.round + 1 === room.totalRounds ? "Final vote" : "Next round";
    case "HOUSE_VOTE":
      return "Close vote";
    default:
      return "Next";
  }
}

/** Game-show cues on top of the shell's phase sound: stamps, reveals, and the finale. */
function StageEffects() {
  const { room, mode } = useRoom().view;
  const key = `${room.round}:${room.phase}:${room.step}`;
  const stamped = mode.kind === "QUIZSLOP" && mode.calls.list.length > 0;
  useCue(key, "vote-reveal", room.phase === "REVEAL");
  useCue(key, "stamp-slam", room.phase === "ANSWER" && stamped);
  useCue(key, "winner-reveal", room.phase === "ROUND_RESULTS");
  useCelebration(room.status === "FINISHED", [], {
    sound: "game-over",
    followUp: { sound: "celebration", delayMs: 1_800 },
  });
  return null;
}

export const quizslopUi: GameUi = {
  name: "QuizSlop",
  theme: "quizslop",
  Stage,
  Controller,
  StageLobby,
  ControllerLobby,
  StageEffects,
  phaseLabel,
  advanceLabel,
};
