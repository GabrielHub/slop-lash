"use client";

import { GAME_META } from "@/games/meta";
import type { GameUi } from "@/room/game-ui";
import { modeOf, type RoomView } from "@/room/context";
import { roundMultiplier } from "../scoring";
import { Controller } from "./controller";
import { currentPrompt } from "./data";
import { SloplashStageEffects } from "./narrator";
import { Stage } from "./stage";
import { formatPoints } from "@/lib/format";

/** How many matchups this round shows (walkovers and votes). */
function matchupCount(view: RoomView) {
  return modeOf(view, "SLOPLASH")?.matchupCount ?? 0;
}

export const sloplashUi: GameUi = {
  name: GAME_META.SLOPLASH.name,
  theme: GAME_META.SLOPLASH.theme,
  tagline: GAME_META.SLOPLASH.tagline,
  howTo: [
    "Write funny answers on your phone",
    "Vote for the funnier one",
    "Every vote = 100 points",
  ],
  ambient: "pixels",
  Stage,
  Controller,
  StageEffects: SloplashStageEffects,

  phaseLabel: (view) => {
    const { phase, status, step } = view.room;
    if (status === "FINISHED") return "Final results";
    switch (phase) {
      case "WRITING":
        return "Writing";
      case "VOTING":
        return `Voting ${step + 1}/${matchupCount(view)}`;
      case "REVEAL":
        return `Reveal ${step + 1}/${matchupCount(view)}`;
      case "ROUND_RESULTS":
        return "Scores";
      default:
        return phase;
    }
  },

  advanceLabel: (view) => {
    const { phase, step, round, totalRounds } = view.room;
    switch (phase) {
      case "WRITING":
        // The order isn't known while writing, and an early end usually makes walkovers.
        return "Show matchups";
      case "VOTING":
        return "Reveal now";
      case "REVEAL":
        return step + 1 < matchupCount(view) ? "Next matchup" : "Show scores";
      case "ROUND_RESULTS":
        return round < totalRounds ? "Next round" : "Final results";
      default:
        return "Next";
    }
  },

  sceneKey: ({ room }) =>
    room.status === "FINISHED"
      ? "final"
      : room.phase === "WRITING"
        ? `writing:${room.round}`
        : room.phase === "VOTING" || room.phase === "REVEAL"
          ? `matchup:${room.round}:${room.step}`
          : room.phase === "ROUND_RESULTS"
            ? `results:${room.round}`
            : `${room.status}:${room.phase}`,

  titleCard: ({ room }) =>
    room.status !== "PLAYING" || room.phase !== "WRITING" || room.round < 2
      ? null
      : {
          id: `sloplash-round-${room.round}`,
          kicker: room.round === room.totalRounds ? "Final round" : `Round ${room.round}`,
          title: `×${formatPoints(roundMultiplier(room.round))} points`,
          tone: "gold",
        },

  ownsStageClock: ({ room }) => room.status === "PLAYING" && room.phase !== "VOTING",

  playsOwnPhaseCue: ({ room }) => room.phase === "VOTING" || room.phase === "REVEAL",

  ambientEnergy: (view) => {
    const { room } = view;
    if (room.status === "FINISHED") return "hype";
    if (room.phase === "WRITING" || room.phase === "VOTING") return "focus";
    if (room.phase === "REVEAL") {
      const mode = modeOf(view, "SLOPLASH");
      return mode && currentPrompt(mode)?.kind === "walkover" ? "calm" : "hype";
    }
    return "hype";
  },

  needsInput: (view) => {
    const { room, me } = view;
    const mode = modeOf(view, "SLOPLASH");
    if (!mode || room.status !== "PLAYING" || !me?.playerId) return false;
    if (room.phase === "WRITING") return mode.writing?.prompts.some((p) => !p.submitted) ?? false;
    if (room.phase !== "VOTING") return false;
    const prompt = currentPrompt(mode);
    return (
      !!prompt &&
      prompt.kind === "vote" &&
      !prompt.assigneeIds.includes(me.playerId) &&
      !prompt.votes.some((vote) => vote.voterId === me.playerId)
    );
  },
};
