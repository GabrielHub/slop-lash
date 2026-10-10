"use client";

import { modeOf, useRoom, type RoomView } from "@/room/context";
import { useGrowthCue } from "@/room/effects";
import { GAME_META } from "@/games/meta";
import type { GameUi } from "@/room/game-ui";
import { Controller, ControllerLobby } from "./controller";
import { Stage, StageLobby } from "./stage";

const PHASE_LABELS: Record<string, string> = {
  CALL: "Bets",
  ANSWER: "Answer",
  ROUND_RESULTS: "Scores",
  HOUSE_VOTE: "Final vote",
};

function phaseLabel(view: RoomView): string {
  const { room } = view;
  if (room.status === "FINISHED") return "Final";
  if (room.phase === "REVEAL")
    return `Reveal ${room.step + 1}/${modeOf(view, "QUIZSLOP")?.revealTotal ?? 1}`;
  return PHASE_LABELS[room.phase] ?? room.phase;
}

function advanceLabel(view: RoomView): string {
  const { room } = view;
  const mode = modeOf(view, "QUIZSLOP");
  if (!mode) return "Next";
  switch (room.phase) {
    case "CALL":
      return "Skip to answers";
    case "ANSWER":
      return "Reveal now";
    case "REVEAL":
      if (room.step + 1 < mode.revealTotal) return "Next question";
      return room.round >= room.totalRounds ? "Final scores" : "Show scores";
    case "ROUND_RESULTS":
      if (room.round >= room.totalRounds) return "Final scores";
      return room.round + 1 === room.totalRounds ? "Final vote" : "Next round";
    case "HOUSE_VOTE":
      return "Start last round";
    default:
      return "Next";
  }
}

function needsInput(view: RoomView): boolean {
  const me = view.me?.playerId;
  const mode = modeOf(view, "QUIZSLOP");
  if (!me || !mode || view.room.status !== "PLAYING") return false;
  switch (view.room.phase) {
    case "CALL":
      return (
        (mode.seats.find((seat) => seat.playerId === me)?.callTokens ?? 0) > 0 &&
        mode.calls.myCall === null
      );
    case "ANSWER":
      return !!mode.answer?.mine && !mode.answer.mine.locked;
    case "HOUSE_VOTE":
      return !!mode.houseVote && mode.houseVote.myVoteTopicId === null;
    default:
      return false;
  }
}

/** The stage's count cues: a sound as each bet, answer or vote comes in. */
function StageEffects() {
  const { view } = useRoom();
  const { room } = view;
  const mode = modeOf(view, "QUIZSLOP");
  const phase = room.status === "PLAYING" ? room.phase : "";
  useGrowthCue(
    phase === "CALL" ? (mode?.calls.decidedPlayerIds.length ?? 0) : 0,
    room.phaseGeneration,
    "vote-cast",
  );
  useGrowthCue(
    phase === "ANSWER" ? (mode?.answer?.lockedPlayerIds.length ?? 0) : 0,
    room.phaseGeneration,
    "submitted",
  );
  useGrowthCue(
    phase === "HOUSE_VOTE" ? (mode?.houseVote?.votedPlayerIds.length ?? 0) : 0,
    room.phaseGeneration,
    "vote-cast",
  );
  return null;
}

export const quizslopUi: GameUi = {
  name: GAME_META.QUIZSLOP.name,
  theme: GAME_META.QUIZSLOP.theme,
  tagline: GAME_META.QUIZSLOP.tagline,
  howTo: ["Pick a topic you know", "Bet a friend will miss", "Tap once to lock your answer"],
  ambient: "confetti",
  Stage,
  Controller,
  StageLobby,
  ControllerLobby,
  StageEffects,
  phaseLabel,
  advanceLabel,
  sceneKey: (view) => (view.room.status === "FINISHED" ? "final" : `round:${view.room.round}`),
  titleCard: (view) =>
    view.room.status === "FINISHED"
      ? { id: "quizslop-final", title: "Final scores", tone: "gold" }
      : view.room.status === "PLAYING" && view.room.phase === "HOUSE_VOTE"
        ? { id: "quizslop-last-round", kicker: "Last round", title: "Double points", tone: "gold" }
        : null,
  ownsStageClock: () => false,
  ambientEnergy: (view) =>
    view.room.status === "FINISHED"
      ? "hype"
      : view.room.status === "PLAYING" && view.room.phase === "ANSWER"
        ? "focus"
        : "calm",
  needsInput,
};
