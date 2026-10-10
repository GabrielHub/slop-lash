"use client";

// The stage's running beds in a live room (the shell renders this only for a
// live stage): the music loop for the phase family (stage3d/scenes/beds.ts),
// the current arena's ambience loop, and the crowd's murmur in the lobby.
// The narrator ducks the beds while The Voice speaks. Every beat sound
// belongs to a scene.

import { useEffect } from "react";
import { useRoom } from "@/room/context";
import { sfx } from "../audio";
import { crowdMurmurs, PHASE_MUSIC } from "../stage3d/scenes/beds";
import { arenaFromModeView, toStagePhase } from "../stage3d/stage-input";

export function SlopfightStageEffects() {
  const { view } = useRoom();
  const { room } = view;
  const phase = toStagePhase(room.status, room.phase ?? "");
  const arena = arenaFromModeView(view.mode, room.round ?? 0).arena;
  const music = PHASE_MUSIC[phase];
  const murmur = crowdMurmurs(phase);

  useEffect(() => {
    sfx.music(music);
  }, [music]);

  useEffect(() => {
    sfx.ambience(arena);
  }, [arena]);

  useEffect(() => {
    if (!murmur) return;
    sfx.loop("crowdMurmur", { fadeIn: 1.5 });
    return () => sfx.stopLoop("crowdMurmur", 1.2);
  }, [murmur]);

  // Leaving the stage: every bed out (music(null) / ambience(null) also reset what is "current").
  useEffect(
    () => () => {
      sfx.music(null, 0.4);
      sfx.ambience(null, 0.4);
      sfx.stopAll(0.4);
    },
    [],
  );
  return null;
}
