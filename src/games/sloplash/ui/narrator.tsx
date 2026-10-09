"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { NarratorPlaybackQueue } from "@/games/sloplash/narrator-audio";
import {
  buildHurryUpNarration,
  phaseNarration,
  type NarrationCue,
} from "@/games/sloplash/narrator-events";
import { BoundedSerialQueue } from "@/games/sloplash/narrator-request-queue";
import { getAudioStatus, setNarratorDucking, subscribeAudio } from "@/lib/sounds";
import { useModeView, useRoom } from "@/room/context";
import { useCue } from "@/room/effects";

const MAX_PENDING_NARRATIONS = 4;
const HURRY_UP_SECONDS = 15;

export type NarratorStatus = "off" | "blocked" | "ready" | "generating" | "speaking" | "error";

type NarrationTask = { capability: string; cue: NarrationCue; generation: number };

const getServerAudioStatus = () => "idle" as const;

/**
 * Speaks cues through the host's speakers: the server writes and voices each
 * line, and clips play one after another. Turning the narrator off cuts
 * whatever is queued; reaching the end only stops new lines.
 */
function useNarrator(capability: string | null, enabled: boolean, canSpeak: boolean) {
  const generate = useAction(api.narrator.generate);
  const generateRef = useRef(generate);
  useEffect(() => {
    generateRef.current = generate;
  }, [generate]);
  const [speaking, setSpeaking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioStatus = useSyncExternalStore(subscribeAudio, getAudioStatus, getServerAudioStatus);
  const playback = useRef<NarratorPlaybackQueue | null>(null);
  const requests = useRef<BoundedSerialQueue<NarrationTask> | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  const stop = useCallback(() => {
    generation.current++;
    requests.current?.clear();
    playback.current?.clear();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
      playback.current?.destroy();
      playback.current = null;
      setNarratorDucking(false);
    };
  }, [stop]);

  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  const queue = useCallback(() => {
    requests.current ??= new BoundedSerialQueue<NarrationTask>(
      MAX_PENDING_NARRATIONS,
      async (task) => {
        if (!mounted.current || task.generation !== generation.current) return;
        setGenerating(true);
        setError(null);
        try {
          const { audioBase64 } = await generateRef.current({
            capability: task.capability,
            eventType: task.cue.eventType,
            fallbackText: task.cue.fallbackText,
            ...(task.cue.generationContext
              ? { generationContext: task.cue.generationContext }
              : {}),
          });
          if (!mounted.current || task.generation !== generation.current) return;
          playback.current ??= new NarratorPlaybackQueue((active) => {
            setNarratorDucking(active);
            if (mounted.current) setSpeaking(active);
          });
          await playback.current.enqueueEncoded(audioBase64);
        } finally {
          if (mounted.current) setGenerating(false);
        }
      },
      (cause) => {
        const message =
          cause instanceof Error && cause.message.trim()
            ? cause.message
            : "Narrator speech generation failed";
        if (mounted.current) setError(message);
        console.warn("[narrator] speech generation failed:", cause);
      },
    );
    return requests.current;
  }, []);

  const ready = enabled && audioStatus === "ready";
  const narrate = useCallback(
    (cue: NarrationCue) => {
      if (!ready || !canSpeak || !capability || !cue.fallbackText.trim()) return;
      const dropped = queue().enqueue({ capability, cue, generation: generation.current });
      if (dropped)
        console.warn(`[narrator] dropped stale queued ${dropped.cue.eventType} narration`);
    },
    [ready, canSpeak, capability, queue],
  );

  const status: NarratorStatus = !enabled
    ? "off"
    : audioStatus === "error" || audioStatus === "unsupported"
      ? "error"
      : audioStatus !== "ready"
        ? "blocked"
        : speaking
          ? "speaking"
          : generating
            ? "generating"
            : error
              ? "error"
              : "ready";

  return { narrate, ready: ready && canSpeak, status, error };
}

const STATUS_LABELS: Record<Exclude<NarratorStatus, "off">, string> = {
  blocked: "Enable audio",
  error: "Narrator error",
  generating: "Generating",
  ready: "Armed",
  speaking: "Speaking",
};

const BAR_HEIGHTS = [0.55, 0.9, 0.65, 0.8];
const BAR_DELAYS = [0, 0.12, 0.06, 0.18];

function NarratorIndicator({ status, detail }: { status: NarratorStatus; detail: string | null }) {
  if (status === "off") return null;
  const label = STATUS_LABELS[status];
  const tone = status === "blocked" ? "text-gold" : status === "error" ? "text-fail" : "text-teal";
  return (
    <div className="fixed bottom-4 left-4 z-40 rounded-full border border-edge bg-surface/90 backdrop-blur-sm px-3 py-1.5">
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          className={`flex items-center gap-1.5 ${tone}`}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.2 }}
          title={detail ?? label}
        >
          <output
            className="flex items-end gap-[2px]"
            style={{ height: 14, width: 16 }}
            aria-label={`Narrator: ${label}`}
          >
            {status === "speaking" ? (
              BAR_HEIGHTS.map((height, index) => (
                <motion.div
                  key={index}
                  className="w-[3px] rounded-full bg-current"
                  initial={{ height: "20%" }}
                  animate={{
                    height: [
                      "20%",
                      `${height * 100}%`,
                      "30%",
                      `${BAR_HEIGHTS[(index + 2) % BAR_HEIGHTS.length]! * 100}%`,
                      "20%",
                    ],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: BAR_DELAYS[index],
                    ease: "easeInOut",
                  }}
                />
              ))
            ) : (
              <span className="flex items-center justify-center w-full h-full">
                <motion.span
                  className="w-[6px] h-[6px] rounded-full bg-current"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                />
              </span>
            )}
          </output>
          <span className="select-none text-[10px] font-bold uppercase tracking-wider">
            {label}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * The stage's side effects: matchup sound cues for everyone watching, and the
 * TTS narrator on the host's screen when the room has it switched on.
 */
export function SloplashStageEffects() {
  const { view, capability, clockOffsetMs } = useRoom();
  const mode = useModeView("SLOPLASH");
  const { room, me, players } = view;
  const enabled = Boolean(
    me?.isHost && room.ttsMode === "ON" && capability && room.status !== "LOBBY",
  );
  const { narrate, ready, status, error } = useNarrator(
    capability,
    enabled,
    room.status === "PLAYING",
  );

  const key = `${room.status}:${room.phase}:${room.round}:${room.step}`;
  const playing = room.status === "PLAYING";
  useCue(key, "vote-reveal", playing && room.phase === "REVEAL");
  useCue(key, "prompt-advance", playing && room.phase === "VOTING" && room.step > 0);

  const heard = useRef<{ key: string; phase: string } | null>(null);
  const announce = useEffectEvent(() => {
    const previous = heard.current?.phase ?? null;
    heard.current = { key, phase: room.phase };
    for (const cue of phaseNarration(room, mode, players, previous)) narrate(cue);
  });
  useEffect(() => {
    if (!ready) heard.current = null;
    else if (heard.current?.key !== key) announce();
  }, [ready, key]);

  useEffect(() => {
    if (!ready || room.phase !== "WRITING" || room.phaseDeadline === null) return;
    const delay = room.phaseDeadline - HURRY_UP_SECONDS * 1000 - (Date.now() + clockOffsetMs);
    if (delay < 0) return;
    const timer = window.setTimeout(() => narrate(buildHurryUpNarration(HURRY_UP_SECONDS)), delay);
    return () => window.clearTimeout(timer);
  }, [ready, room.phase, room.phaseDeadline, clockOffsetMs, narrate]);

  return <NarratorIndicator status={status} detail={error} />;
}
