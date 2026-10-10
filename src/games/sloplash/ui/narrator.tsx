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
import { motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { NarratorPlaybackQueue } from "@/games/sloplash/narrator-audio";
import {
  buildHurryUpNarration,
  phaseNarration,
  type NarrationCue,
} from "@/games/sloplash/narrator-events";
import { BoundedSerialQueue } from "@/games/sloplash/narrator-request-queue";
import {
  activateAudio,
  getAudioStatus,
  setNarratorDucking,
  subscribeAudio,
} from "@/lib/sounds";
import { useModeView, useRoom } from "@/room/context";

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
  generating: "Narrator writing",
  ready: "Narrator ready",
  speaking: "Narrator speaking",
};

const BAR_HEIGHTS = [0.55, 0.9, 0.65, 0.8];
const BAR_DELAYS = [0, 0.12, 0.06, 0.18];

/**
 * A small round icon in the bottom-left corner: bars that move while the
 * narrator speaks, red on an error. Its words live in the tooltip and for
 * screen readers only. When the browser blocks audio it becomes the one
 * thing to tap.
 */
function NarratorIndicator({ status, detail }: { status: NarratorStatus; detail: string | null }) {
  if (status === "off") return null;
  const label = STATUS_LABELS[status];
  if (status === "blocked") {
    return (
      <button
        type="button"
        onClick={() => void activateAudio()}
        className="fixed bottom-4 left-4 z-40 cursor-pointer rounded-full border border-edge bg-surface px-3 py-1.5 text-sm font-bold text-gold-ink"
      >
        Tap to enable narrator
      </button>
    );
  }
  const tone = status === "error" ? "text-fail" : "text-teal";
  return (
    <output
      className={`fixed bottom-4 left-4 z-40 grid size-[2.5rem] place-items-center rounded-full border border-edge bg-surface ${tone}`}
      title={detail ?? label}
      aria-label={label}
    >
      <span className="flex h-[1rem] w-[1.1rem] items-end justify-between" aria-hidden="true">
        {BAR_HEIGHTS.map((height, index) => (
          <motion.span
            key={index}
            className="w-[0.18rem] rounded-full bg-current"
            initial={false}
            animate={
              status === "speaking"
                ? {
                    height: [
                      "20%",
                      `${height * 100}%`,
                      "30%",
                      `${BAR_HEIGHTS[(index + 2) % BAR_HEIGHTS.length]! * 100}%`,
                      "20%",
                    ],
                  }
                : { height: `${30 + index * 10}%` }
            }
            transition={
              status === "speaking"
                ? { duration: 0.8, repeat: Infinity, delay: BAR_DELAYS[index], ease: "easeInOut" }
                : { duration: 0.3 }
            }
          />
        ))}
      </span>
    </output>
  );
}

/**
 * The stage's side effects: the TTS narrator on the host's screen when the
 * room has it switched on. The matchup sounds belong to the moments now.
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
