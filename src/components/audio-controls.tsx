"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  activateAudio,
  getAudioIssue,
  getAudioStatus,
  getVolume,
  isMuted,
  listenForAudioUnlock,
  playSound,
  preloadSounds,
  setVolume,
  subscribeAudio,
  toggleMute,
  type AudioStatus,
  type SoundName,
} from "@/lib/sounds";

interface AudioControlsProps {
  className?: string;
  color?: string;
  compact?: boolean;
  testSound?: SoundName;
}

const getServerMuted = () => false;
const getServerVolume = () => 0.5;
const getServerAudioStatus = (): AudioStatus => "idle";
const getServerAudioIssue = () => null;

function SpeakerIcon({ muted, volume }: { muted: boolean; volume: number }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
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

function TestSoundIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function getStatusLabel(status: AudioStatus, muted: boolean): string {
  if (muted) return "Sound is muted";
  switch (status) {
    case "ready":
      return "Audio is ready";
    case "blocked":
      return "Audio needs a click to start";
    case "error":
      return "Audio failed to start";
    case "unsupported":
      return "Audio is unavailable in this browser";
    case "idle":
      return "Audio has not started yet";
  }
}

/** Shared master controls and browser-autoplay unlock state for every game surface. */
export function AudioControls({
  className = "",
  color,
  compact = true,
  testSound = "phase-transition",
}: AudioControlsProps) {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, getServerMuted);
  const volume = useSyncExternalStore(subscribeAudio, getVolume, getServerVolume);
  const status = useSyncExternalStore(subscribeAudio, getAudioStatus, getServerAudioStatus);
  const issue = useSyncExternalStore(subscribeAudio, getAudioIssue, getServerAudioIssue);
  const needsUnlock = !muted && status !== "ready" && status !== "unsupported";
  const unavailable = status === "unsupported";

  useEffect(() => {
    if (muted || status === "ready" || status === "unsupported") return;
    return listenForAudioUnlock();
  }, [muted, status]);

  async function handleEnable(): Promise<void> {
    preloadSounds();
    const ready = await activateAudio();
    if (ready && !muted) playSound(testSound);
  }

  async function handleToggle(): Promise<void> {
    const nowMuted = toggleMute();
    if (!nowMuted) await handleEnable();
  }

  return (
    <fieldset
      aria-label="Audio controls"
      className={`m-0 flex min-w-0 shrink-0 items-center gap-1.5 border-0 p-0 ${className}`}
      style={{ color }}
      onPointerDown={preloadSounds}
    >
      {needsUnlock ? (
        <button
          type="button"
          onClick={() => void handleEnable()}
          className="cursor-pointer rounded-full border border-current/25 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition-opacity hover:opacity-75"
        >
          <span className={compact ? "sm:hidden" : "hidden"}>
            {status === "error" ? "Retry" : "Enable"}
          </span>
          <span className={compact ? "hidden sm:inline" : "inline"}>
            {status === "error" ? "Retry sound" : "Enable sound"}
          </span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => void handleToggle()}
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        title={muted ? "Unmute sound" : "Mute sound"}
        className="cursor-pointer rounded-full p-1 transition-opacity hover:opacity-75"
      >
        <SpeakerIcon muted={muted} volume={volume} />
      </button>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        onFocus={preloadSounds}
        aria-label="Master volume"
        title={`Master volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
        className={`volume-slider ${compact ? "hidden sm:block" : ""} h-4 w-16 cursor-pointer`}
        style={{ accentColor: color ?? "currentColor" }}
      />

      <button
        type="button"
        onClick={() => void handleEnable()}
        disabled={unavailable}
        aria-label="Play test sound"
        title={unavailable ? (issue ?? "Audio unavailable") : "Play a test sound"}
        className={`${compact ? "hidden sm:inline-flex" : "inline-flex"} cursor-pointer items-center justify-center rounded-full p-1 transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-35`}
      >
        <TestSoundIcon />
      </button>

      {issue ? (
        <output
          title={issue}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px] font-black"
          aria-label={`Audio issue: ${issue}`}
        >
          !
        </output>
      ) : (
        <output className="sr-only">{getStatusLabel(status, muted)}</output>
      )}
    </fieldset>
  );
}
