"use client";

import { GAME_META } from "@/games/meta";
import type { GameUi } from "@/room/game-ui";
import { modeOf, type RoomView } from "@/room/context";
import { MatchslopController } from "./controller";
import { MatchslopStageEffects } from "./effects";
import { MatchslopStageLobby } from "./lobby";
import { isLastMessageRound, personaName } from "./primitives";
import { MatchslopStage, titleCardOf } from "./stage";

function phaseLabel(view: RoomView): string {
  const { room } = view;
  const mode = modeOf(view, "MATCHSLOP");
  const name = mode ? personaName(mode.persona) : "Your match";
  if (room.status === "FINISHED") return "Results";
  switch (room.phase) {
    case "PROFILE":
      return "Finding a match";
    case "WRITING":
      if (mode?.comeback) return "One last shot";
      if (isLastMessageRound(room)) return "Last message";
      return room.round === 1 ? "Openers" : "Replies";
    case "VOTING":
      return "Voting";
    case "SENT":
      return `${name} is typing`;
    case "REPLY":
      return `${name} replied`;
    default:
      return room.phase;
  }
}

function advanceLabel(view: RoomView): string {
  const { room } = view;
  const mode = modeOf(view, "MATCHSLOP");
  const name = mode ? personaName(mode.persona) : "Your match";
  switch (room.phase) {
    case "PROFILE":
      return "Use a ready-made match";
    case "WRITING": {
      const round = mode?.round;
      const real = round ? round.answeredPlayerIds.length - round.forfeitedPlayerIds.length : 0;
      if (real === 0) return "End the date";
      return real === 1 ? "Send the only text" : "Skip to voting";
    }
    case "VOTING":
      return "Send the top text";
    case "SENT":
      return `Skip ${name}'s reply`;
    case "REPLY":
      return mode && mode.outcome !== "IN_PROGRESS" ? "Show the ending" : "Next message";
    default:
      return "Skip ahead";
  }
}

function needsInput(view: RoomView): boolean {
  const mode = modeOf(view, "MATCHSLOP");
  const me = view.me?.playerId;
  if (!mode?.round || !me || view.room.status !== "PLAYING") return false;
  if (view.room.phase === "WRITING") {
    return mode.round.writerIds.includes(me) && mode.round.myResponseId === null;
  }
  if (view.room.phase === "VOTING") {
    return (
      !mode.round.votedPlayerIds.includes(me) &&
      mode.round.answers.some((answer) => answer.playerId !== me)
    );
  }
  return false;
}

export const matchslopUi: GameUi = {
  name: GAME_META.MATCHSLOP.name,
  theme: GAME_META.MATCHSLOP.theme,
  tagline: GAME_META.MATCHSLOP.tagline,
  howTo: ["Write a text on your phone", "Vote one to send", "Get the date"],
  ambient: "bubbles",
  Stage: MatchslopStage,
  Controller: MatchslopController,
  StageLobby: MatchslopStageLobby,
  StageEffects: MatchslopStageEffects,
  phaseLabel,
  advanceLabel,
  // One persistent scene for the whole date; the lobby belongs to the shell.
  sceneKey: (view) => (view.room.status === "LOBBY" ? "lobby" : "date"),
  titleCard: titleCardOf,
  ownsStageClock: (view) => view.room.status === "PLAYING" && view.room.phase === "REPLY",
  playsOwnPhaseCue: () => true,
  needsInput,
  ambientEnergy(view) {
    const { status, phase } = view.room;
    if (status === "FINISHED") {
      return modeOf(view, "MATCHSLOP")?.outcome === "DATE_SEALED" ? "hype" : "calm";
    }
    if (status !== "PLAYING") return "calm";
    if (phase === "WRITING" || phase === "VOTING" || phase === "SENT") return "focus";
    return "calm";
  },
};
