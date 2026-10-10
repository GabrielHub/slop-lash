"use client";

import { useModeView, useRoom } from "@/room/context";
import { useGrowthCue } from "@/room/effects";

/**
 * The stage's running sounds outside the scene's beats: a tick per text in
 * while writing, and per vote while voting. Every bigger sound belongs to a
 * beat in the date scene.
 */
export function MatchslopStageEffects() {
  const { room } = useRoom().view;
  const mode = useModeView("MATCHSLOP");
  const playing = room.status === "PLAYING";
  const key = `${room.round}:${room.phase}`;
  useGrowthCue(
    mode.round?.answeredPlayerIds.length ?? 0,
    key,
    "submitted",
    playing && room.phase === "WRITING",
  );
  useGrowthCue(
    mode.round?.votedPlayerIds.length ?? 0,
    key,
    "vote-cast",
    playing && room.phase === "VOTING",
  );
  return null;
}
