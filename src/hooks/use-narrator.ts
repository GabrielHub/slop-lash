"use client";

import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NarratorPlaybackQueue } from "@/games/sloplash/narrator-audio";
import type { NarrationCue } from "@/games/sloplash/narrator-events";
import { BoundedSerialQueue } from "@/games/sloplash/narrator-request-queue";
import type { GameStatus } from "@/lib/types";
import { setNarratorDucking } from "@/lib/sounds";
import { api } from "../../convex/_generated/api";

const MAX_PENDING_NARRATIONS = 4;

interface UseNarratorOptions {
  roomCapability?: string | null;
  isHost: boolean;
  ttsMode: string;
  gameStatus: GameStatus | undefined;
}

interface UseNarratorReturn {
  narrate: (cue: NarrationCue) => void;
  isReady: boolean;
  isSpeaking: boolean;
}

interface NarrationTask {
  capability: string;
  cue: NarrationCue;
  lifecycleGeneration: number;
}

export function useNarrator({
  roomCapability = null,
  isHost,
  ttsMode,
  gameStatus,
}: UseNarratorOptions): UseNarratorReturn {
  const generateNarration = useAction(api.narrator.generate);
  const generateNarrationRef = useRef(generateNarration);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const playbackQueueRef = useRef<NarratorPlaybackQueue | null>(null);
  const requestQueueRef = useRef<BoundedSerialQueue<NarrationTask> | null>(null);
  const lifecycleGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    generateNarrationRef.current = generateNarration;
  }, [generateNarration]);

  const handleActiveChange = useCallback((active: boolean) => {
    setNarratorDucking(active);
    if (mountedRef.current) setIsSpeaking(active);
  }, []);

  const getRequestQueue = useCallback((): BoundedSerialQueue<NarrationTask> => {
    if (requestQueueRef.current) return requestQueueRef.current;
    requestQueueRef.current = new BoundedSerialQueue<NarrationTask>(
      MAX_PENDING_NARRATIONS,
      async ({ capability, cue, lifecycleGeneration }) => {
        if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) return;
        const result = await generateNarrationRef.current({
          capability,
          eventType: cue.eventType,
          fallbackText: cue.fallbackText,
          ...(cue.generationContext ? { generationContext: cue.generationContext } : {}),
        });
        if (!mountedRef.current || lifecycleGeneration !== lifecycleGenerationRef.current) return;
        const playbackQueue =
          playbackQueueRef.current ?? new NarratorPlaybackQueue(handleActiveChange);
        playbackQueueRef.current = playbackQueue;
        await playbackQueue.enqueueEncoded(result.audioBase64);
      },
      (error) => console.warn("[narrator] speech generation failed:", error),
    );
    return requestQueueRef.current;
  }, [handleActiveChange]);

  const stopNarration = useCallback(() => {
    lifecycleGenerationRef.current++;
    requestQueueRef.current?.clear();
    playbackQueueRef.current?.clear();
  }, []);

  const narratorEnabled =
    isHost &&
    ttsMode === "ON" &&
    Boolean(roomCapability) &&
    Boolean(gameStatus) &&
    gameStatus !== "LOBBY";
  const canEnqueue = narratorEnabled && gameStatus !== "FINAL_RESULTS";

  useEffect(() => {
    if (narratorEnabled) return;
    stopNarration();
  }, [narratorEnabled, stopNarration]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopNarration();
      playbackQueueRef.current?.destroy();
      playbackQueueRef.current = null;
      setNarratorDucking(false);
    };
  }, [stopNarration]);

  const narrate = useCallback(
    (cue: NarrationCue) => {
      if (!canEnqueue || !roomCapability || !cue.fallbackText.trim()) return;
      const dropped = getRequestQueue().enqueue({
        capability: roomCapability,
        cue,
        lifecycleGeneration: lifecycleGenerationRef.current,
      });
      if (dropped) {
        console.warn(`[narrator] dropped stale queued ${dropped.cue.eventType} narration`);
      }
    },
    [canEnqueue, getRequestQueue, roomCapability],
  );

  return {
    narrate,
    isReady: narratorEnabled,
    isSpeaking,
  };
}
