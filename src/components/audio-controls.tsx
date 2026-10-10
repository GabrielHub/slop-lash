"use client";

import { useEffect, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { pop } from "@/lib/animations";
import {
  activateAudio,
  getAudioStatus,
  getVolume,
  isMuted,
  listenForAudioUnlock,
  playSound,
  preloadSounds,
  subscribeAudio,
  toggleMute,
  type AudioStatus,
} from "@/lib/sounds";

const getServerMuted = () => false;
const getServerVolume = () => 0.5;
const getServerAudioStatus = (): AudioStatus => "idle";

/** The shared sound settings and whether the browser has let audio start yet. */
export function useAudioState() {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, getServerMuted);
  const volume = useSyncExternalStore(subscribeAudio, getVolume, getServerVolume);
  const status = useSyncExternalStore(subscribeAudio, getAudioStatus, getServerAudioStatus);
  return {
    muted,
    volume,
    status,
    /** Sound is on but the browser is still waiting for a click or key press. */
    needsUnlock: !muted && status !== "ready" && status !== "unsupported",
  };
}

/**
 * Starts audio on the first click or key press anywhere, for as long as the
 * caller is mounted. Every room screen mounts it once, so no screen needs an
 * "enable sound" button.
 */
export function useAudioUnlock() {
  const { muted, status } = useAudioState();
  useEffect(() => {
    if (muted || status === "ready" || status === "unsupported") return;
    return listenForAudioUnlock();
  }, [muted, status]);
}

/** Mutes, or unmutes and plays a short confirmation so the player hears it work. */
export async function toggleSound(): Promise<void> {
  const nowMuted = toggleMute();
  if (nowMuted) return;
  preloadSounds();
  if (await activateAudio()) playSound("submitted");
}

export function SpeakerIcon({
  muted,
  volume = 1,
  className = "size-[1.25em]",
}: {
  muted: boolean;
  volume?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          {volume >= 0.5 ? <path d="M19.07 4.93a10 10 0 0 1 0 14.14" /> : null}
        </>
      )}
    </svg>
  );
}

/**
 * A gold pill for the big screen while the browser blocks sound. Any click or
 * key press unlocks it (see `useAudioUnlock`), so the pill only says so.
 */
export function AudioUnlockHint({ className = "" }: { className?: string }) {
  const { needsUnlock, status } = useAudioState();
  if (!needsUnlock) return null;
  return (
    <motion.output
      variants={pop}
      initial="hidden"
      animate="visible"
      className={`inline-flex items-center gap-[0.5em] rounded-full border border-gold/40 bg-gold-soft px-[1em] py-[0.4em] font-semibold text-gold-ink ${className}`}
    >
      <SpeakerIcon muted className="size-[1.1em]" />
      {status === "error" ? "Sound failed. Click to try again" : "Click anywhere to turn on sound"}
    </motion.output>
  );
}
