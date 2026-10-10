"use client";

import { GAME_META } from "@/games/meta";
import type { GameUi } from "@/room/game-ui";
import { SlopfightController, SlopfightHostExtras, SlopfightLobbyExtra } from "./controller";
import { advanceLabel, needsInput, phaseLabel } from "./labels";
import { SlopfightStage } from "./stage";
import { SlopfightStageEffects } from "./stage-effects";

// Keep this module light: the 3D layer is reachable only through the one
// `next/dynamic` import in ./stage, so phones and the lobby never fetch it.

export const slopfightUi: GameUi = {
  name: GAME_META.SLOPFIGHT.name,
  theme: GAME_META.SLOPFIGHT.theme,
  tagline: GAME_META.SLOPFIGHT.tagline,
  howTo: ["Draw or describe a champion", "Bet on every fight", "Add one thing, win it all"],
  ambient: "confetti",
  Stage: SlopfightStage,
  Controller: SlopfightController,
  ControllerLobby: SlopfightLobbyExtra,
  StageEffects: SlopfightStageEffects,
  HostExtras: SlopfightHostExtras,
  phaseLabel,
  advanceLabel,
  needsInput,
  // The scene slams its own titles and carries the clock.
  titleCard: () => null,
  ownsStageClock: () => true,
  // One canvas from the lobby to the podium; the scene draws the lobby, the clock and the header.
  ownsLobby: true,
  chrome: () => ({ stageRail: false, phoneBar: false }),
};
