"use client";

// Glue between the stage's Voice service and the host's TTS: renders
// <SlopfightNarrator> (ui/narrator.tsx) once, outside the canvas, fed with
// every timed line the service has released or scheduled and its prefetches.
// The narrator self-gates (host stage, TTS on, not Free Play, playing, not
// muted). Outside a room (dev labs without a room) it renders nothing.
//
// It also keys the service's Voice to the game: one Voice per game, a fresh
// one on a rematch (the room's game id changes).

import { useEffect, useSyncExternalStore } from "react";
import { SlopfightNarrator } from "../../ui/narrator";
import { useRoomOrNull } from "./room";
import type { VoiceService } from "./voice";

export { useRoomOrNull };

/** One Voice per game: the room's game id seeds it (captions and TTS agree on every stage). */
export function useVoiceGame(voice: VoiceService): void {
  const room = useRoomOrNull();
  const seed = room ? `${room.view.room.id}:${room.view.room.gameNumber}` : null;
  // Set during render too, so scenes mounting in the same commit already see this game's Voice.
  if (seed && voice.gameSeed !== seed) voice.setGame(seed);
  useEffect(() => {
    if (seed) voice.setGame(seed);
  }, [voice, seed]);
}

function Narrator({ voice }: { voice: VoiceService }) {
  const feed = useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getSnapshot);
  return <SlopfightNarrator lines={feed.lines} prefetch={feed.prefetch} />;
}

/** Render once beside the canvas (DOM): keys the Voice to the game and voices its lines on the host. */
export function VoiceNarration({ voice }: { voice: VoiceService }) {
  const room = useRoomOrNull();
  useVoiceGame(voice);
  if (!room) return null;
  return <Narrator voice={voice} />;
}
