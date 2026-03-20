"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { PulsingDot } from "@/components/pulsing-dot";
import { PlayerAvatar } from "@/components/player-avatar";
import {
  fadeInUp,
  popIn,
  slideInLeft,
  slideInRight,
  springGentle,
  staggerContainer,
  staggerContainerSlow,
  buttonTap,
  buttonTapPrimary,
} from "@/lib/animations";
import { useGameStream } from "@/hooks/use-game-stream";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { playSound, preloadSounds } from "@/lib/sounds";
import type { GameState } from "@/lib/types";

/* ─── Local Types ─── */

type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";

type MatchSlopPersonaImageState = {
  status?: "NOT_REQUESTED" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
  imageUrl?: string | null;
};

type MatchSlopProfileGenerationState = {
  status?: "NOT_REQUESTED" | "STREAMING" | "READY" | "FAILED";
  updatedAt?: string;
};

type MatchSlopProfilePrompt = {
  id?: string;
  prompt?: string;
  answer?: string;
};

type MatchSlopPersonaDetails = {
  job?: string | null;
  school?: string | null;
  height?: string | null;
  languages?: string[];
};

type MatchSlopProfile = {
  displayName?: string;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  tagline?: string | null;
  prompts?: MatchSlopProfilePrompt[];
  details?: MatchSlopPersonaDetails | null;
  image?: MatchSlopPersonaImageState | null;
};

type MatchSlopTranscriptEntry = {
  id?: string;
  speaker?: string;
  text?: string;
  turn?: number;
  outcome?: string | null;
  authorName?: string | null;
  selectedPromptText?: string | null;
  selectedPromptId?: string | null;
};

type MatchSlopRoundResult = {
  winnerText?: string;
  authorName?: string | null;
  winnerPlayerId?: string;
  weightedVotes?: number;
  rawVotes?: number;
  selectedPromptText?: string | null;
  selectedPromptId?: string | null;
};

type MatchSlopModeState = {
  seekerIdentity?: MatchSlopIdentity | string | null;
  personaIdentity?: MatchSlopIdentity | string | null;
  outcome?: "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | "COMEBACK";
  humanVoteWeight?: number;
  aiVoteWeight?: number;
  selectedPersonaExampleIds?: string[];
  selectedPlayerExamples?: string[];
  comebackRound?: number | null;
  profileDraft?: MatchSlopProfile | null;
  profileGeneration?: MatchSlopProfileGenerationState | null;
  profile?: MatchSlopProfile | null;
  transcript?: MatchSlopTranscriptEntry[];
  personaImage?: MatchSlopPersonaImageState | null;
  lastRoundResult?: MatchSlopRoundResult | null;
};

type Outcome = "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | "COMEBACK";
const EMPTY_TRANSCRIPT: MatchSlopTranscriptEntry[] = [];

/* ─── Helpers ─── */

import { getPlayerId, getPlayerToken, getHostControlToken, noopSubscribe } from "@/lib/client-session";

function asModeState(state: GameState["modeState"] | undefined): MatchSlopModeState {
  return (state ?? {}) as MatchSlopModeState;
}


/* ─── SVG Icons ─── */

function HeartIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function BrokenHeartIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.53L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zM12.1 18.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5 18.5 5 20 6.5 20 8.5c0 2.89-3.14 5.74-7.9 10.05z" />
    </svg>
  );
}

function LocationIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function VoteIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 19h20v2H2v-2zm1.2-5.6L2 5l4.8 4.8L12 2l5.2 7.8L22 5l-1.2 8.4H3.2z" />
    </svg>
  );
}

/* ─── Sub-components ─── */

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{
            background: "var(--ms-rose)",
            animation: `ms-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  if (outcome === "IN_PROGRESS") return null;

  const config = {
    DATE_SEALED: {
      icon: <HeartIcon size={14} />,
      label: "It's a date!",
      color: "var(--ms-mint)",
      bg: "var(--ms-mint-soft)",
    },
    UNMATCHED: {
      icon: <BrokenHeartIcon size={14} />,
      label: "Unmatched",
      color: "var(--ms-red)",
      bg: "var(--ms-red-soft)",
    },
    TURN_LIMIT: {
      icon: <SparkleIcon size={12} />,
      label: "Time's up",
      color: "var(--ms-coral)",
      bg: "var(--ms-coral-soft)",
    },
    COMEBACK: {
      icon: <SparkleIcon size={12} />,
      label: "Comeback",
      color: "var(--ms-coral)",
      bg: "var(--ms-coral-soft)",
    },
  }[outcome];

  return (
    <motion.span
      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full"
      style={{ color: config.color, background: config.bg }}
      variants={popIn}
      initial="hidden"
      animate="visible"
    >
      {config.icon}
      {config.label}
    </motion.span>
  );
}

function ProfileCard({
  profile,
  personaImage,
  profileGeneration,
  outcome,
}: {
  profile: MatchSlopProfile | null;
  personaImage: MatchSlopPersonaImageState | null;
  profileGeneration: MatchSlopProfileGenerationState | null;
  outcome: Outcome;
}) {
  const imageStatus = personaImage?.status ?? "NOT_REQUESTED";
  const isProfileStreaming =
    profileGeneration?.status === "STREAMING" ||
    (profileGeneration?.status !== "FAILED" && !profile?.displayName);
  const bioText =
    profile?.bio ??
    (isProfileStreaming
      ? "As the model fills in the details, the profile will build itself here in real time."
      : "The persona profile is being generated...");
  const displayName = profile?.displayName ?? (isProfileStreaming ? "Building persona" : "AI Persona");

  return (
    <motion.div
      className="relative overflow-hidden rounded-[2rem]"
      style={{
        background: "var(--ms-surface)",
        border: "1px solid var(--ms-edge)",
        boxShadow: "var(--ms-shadow)",
      }}
      variants={slideInLeft}
      initial="hidden"
      animate="visible"
    >
      {/* Profile image / placeholder */}
      <div className="relative" style={{ aspectRatio: "4/3" }}>
        {imageStatus === "READY" && personaImage?.imageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${personaImage.imageUrl})` }}
            role="img"
            aria-label={profile?.displayName ?? "Persona"}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--ms-rose-soft), var(--ms-violet-soft), var(--ms-coral-soft))",
            }}
          >
            <div className="flex flex-col items-center text-center">
              <motion.div
                className="animate-ms-heartbeat"
                style={{ color: "var(--ms-rose)" }}
              >
                <HeartIcon size={48} />
              </motion.div>
              <p
                className="text-sm font-medium mt-3"
                style={{ color: "var(--ms-ink-dim)" }}
              >
                {imageStatus === "PENDING" || imageStatus === "PROCESSING"
                  ? "Generating portrait..."
                  : "Awaiting portrait"}
              </p>
            </div>
          </div>
        )}

        {/* Gradient overlay at bottom for text readability */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{
            background: `linear-gradient(to top, var(--ms-surface), transparent)`,
          }}
        />

        {/* Name overlay */}
        <div className="absolute inset-x-0 bottom-0 p-[clamp(1rem,2vw,2rem)]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1
                className="font-display font-bold leading-tight"
                style={{
                  fontSize: "clamp(1.75rem, 3vw, 3.5rem)",
                  color: "var(--ms-ink)",
                }}
              >
                {displayName}
              </h1>
              {(profile?.age != null || profile?.location) && (
                <div
                  className="flex items-center gap-2 mt-1"
                  style={{
                    fontSize: "clamp(0.8rem, 1.2vw, 1.25rem)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {profile.age && <span>{profile.age}</span>}
                  {profile.location && (
                    <>
                      <span style={{ color: "var(--ms-edge-strong)" }}>·</span>
                      <span className="inline-flex items-center gap-1">
                        <LocationIcon size={14} />
                        {profile.location}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <OutcomeBadge outcome={outcome} />
          </div>
        </div>
      </div>

      {/* Bio + Tagline */}
      <div className="p-[clamp(1rem,2vw,2rem)]" style={{ borderTop: "1px solid var(--ms-edge)" }}>
        {profile?.tagline && (
          <p
            className="font-display font-semibold italic mb-3"
            style={{
              fontSize: "clamp(0.9rem, 1.3vw, 1.4rem)",
              color: "var(--ms-rose)",
            }}
          >
            &ldquo;{profile.tagline}&rdquo;
          </p>
        )}
        <p
          className="leading-relaxed"
          style={{
            fontSize: "clamp(0.85rem, 1.1vw, 1.2rem)",
            color: "var(--ms-ink)",
          }}
        >
          {bioText}
        </p>

        {/* Detail badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {profile?.details?.job && (
            <span
              className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)", color: "var(--ms-ink-dim)" }}
            >
              {profile.details.job}
            </span>
          )}
          {profile?.details?.school && (
            <span
              className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)", color: "var(--ms-ink-dim)" }}
            >
              {profile.details.school}
            </span>
          )}
          {profile?.details?.height && (
            <span
              className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)", color: "var(--ms-ink-dim)" }}
            >
              {profile.details.height}
            </span>
          )}
          {profile?.details?.languages && profile.details.languages.length > 0 && (
            <span
              className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)", color: "var(--ms-ink-dim)" }}
            >
              {profile.details.languages.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Prompt cards */}
      {profile?.prompts && profile.prompts.length > 0 && (
        <div className="p-[clamp(1rem,2vw,2rem)] pt-0">
          <motion.div
            className="space-y-3"
            variants={staggerContainerSlow}
            initial="hidden"
            animate="visible"
          >
            {profile.prompts.slice(0, 3).map((prompt, i) => (
              <motion.div
                key={prompt.id ?? `prompt-${i}`}
                className="rounded-2xl p-[clamp(0.75rem,1.5vw,1.5rem)] ms-profile-shimmer"
                style={{
                  background: "var(--ms-raised)",
                  border: "1px solid var(--ms-edge)",
                }}
                variants={fadeInUp}
              >
                <p
                  className="font-display font-semibold"
                  style={{
                    fontSize: "clamp(0.75rem, 1vw, 1rem)",
                    color: "var(--ms-rose)",
                  }}
                >
                  {prompt.prompt ?? "Prompt"}
                </p>
                {prompt.answer && (
                  <p
                    className="mt-1 leading-relaxed"
                    style={{
                      fontSize: "clamp(0.8rem, 1.1vw, 1.15rem)",
                      color: "var(--ms-ink)",
                    }}
                  >
                    {prompt.answer}
                  </p>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function PromptContextBanner({
  promptText,
  isPhoto,
}: {
  promptText: string;
  isPhoto: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 mb-2 rounded-lg"
      style={{
        padding: "clamp(0.35rem, 0.6vw, 0.5rem) clamp(0.5rem, 0.8vw, 0.7rem)",
        background: "color-mix(in srgb, var(--ms-violet) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--ms-violet) 15%, transparent)",
      }}
    >
      {isPhoto ? (
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--ms-violet)", opacity: 0.7, flexShrink: 0 }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ) : (
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--ms-violet)", opacity: 0.7, flexShrink: 0 }}
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      <span
        className="font-display font-semibold"
        style={{
          fontSize: "clamp(0.5rem, 0.65vw, 0.6rem)",
          color: "var(--ms-violet)",
          opacity: 0.8,
        }}
      >
        Replied to:
      </span>
      <span
        className="font-display font-bold truncate"
        style={{
          fontSize: "clamp(0.5rem, 0.65vw, 0.6rem)",
          color: "var(--ms-violet)",
        }}
      >
        {isPhoto ? "Their photo" : `"${promptText}"`}
      </span>
    </div>
  );
}

function TranscriptBubble({
  entry,
  index,
}: {
  entry: MatchSlopTranscriptEntry;
  index: number;
}) {
  const isPersona = entry.speaker === "PERSONA";
  const displayName = isPersona
    ? (entry.authorName ?? "Persona")
    : (entry.authorName ?? "Players");

  const isFirstPlayerMessage =
    !isPersona && entry.turn === 1 && entry.selectedPromptText;
  const isPhotoPrompt = entry.selectedPromptId === "__photo__";

  return (
    <motion.div
      className={`flex ${isPersona ? "justify-start" : "justify-end"}`}
      variants={fadeInUp}
    >
      <div
        className={`max-w-[85%] animate-ms-bubble-in ${isPersona ? "rounded-2xl rounded-bl-md" : "rounded-2xl rounded-br-md"}`}
        style={{
          background: isPersona ? "var(--ms-bubble-persona)" : "var(--ms-bubble-player)",
          border: `1px solid ${isPersona ? "var(--ms-rose-soft)" : "var(--ms-violet-soft)"}`,
          padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 1.8vw, 1.5rem)",
          animationDelay: `${index * 0.1}s`,
        }}
      >
        {/* Prompt context banner for first player message */}
        {isFirstPlayerMessage && (
          <PromptContextBanner
            promptText={entry.selectedPromptText!}
            isPhoto={isPhotoPrompt}
          />
        )}

        <div className="flex items-center justify-between gap-3 mb-1">
          <span
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: "clamp(0.55rem, 0.7vw, 0.7rem)",
              color: isPersona ? "var(--ms-rose)" : "var(--ms-violet)",
            }}
          >
            {displayName}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: "clamp(0.55rem, 0.65vw, 0.65rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            Turn {entry.turn ?? index + 1}
          </span>
        </div>
        <p
          className="leading-relaxed"
          style={{
            fontSize: "clamp(0.85rem, 1.2vw, 1.3rem)",
            color: "var(--ms-ink)",
          }}
        >
          {entry.text}
        </p>
        {entry.outcome && entry.outcome !== "CONTINUE" && (
          <motion.div
            className="flex items-center gap-1.5 mt-2"
            style={{
              fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
              color:
                entry.outcome === "DATE_SEALED"
                  ? "var(--ms-mint)"
                  : entry.outcome === "COMEBACK" || entry.outcome === "TURN_LIMIT"
                    ? "var(--ms-coral)"
                    : "var(--ms-red)",
            }}
            variants={popIn}
            initial="hidden"
            animate="visible"
          >
            {entry.outcome === "DATE_SEALED" ? (
              <HeartIcon size={12} />
            ) : entry.outcome === "COMEBACK" || entry.outcome === "TURN_LIMIT" ? (
              <SparkleIcon size={12} />
            ) : (
              <BrokenHeartIcon size={12} />
            )}
            <span className="font-bold uppercase tracking-wider">
              {entry.outcome === "DATE_SEALED"
                ? "Date sealed!"
                : entry.outcome === "UNMATCHED"
                  ? "Unmatched"
                  : entry.outcome === "COMEBACK"
                    ? "Comeback"
                    : "Turn limit"}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyConversationState({
  status,
  isComebackRound,
  lastRoundResult,
}: {
  status: GameState["status"];
  isComebackRound: boolean;
  lastRoundResult: MatchSlopRoundResult | null;
}) {
  if (status === "ROUND_RESULTS") {
    return (
      <div
        className="py-[clamp(1.5rem,3vw,3rem)]"
        style={{ color: "var(--ms-ink-dim)" }}
      >
        {lastRoundResult?.winnerText ? (
          <motion.div
            className="mx-auto max-w-[40rem]"
            variants={popIn}
            initial="hidden"
            animate="visible"
          >
            {/* Winner showcase card */}
            <div
              className="relative rounded-[1.25rem] overflow-hidden"
              style={{
                background: "var(--ms-raised)",
                border: "1.5px solid var(--gold)",
                boxShadow: "0 0 24px color-mix(in srgb, var(--gold) 15%, transparent), 0 2px 12px color-mix(in srgb, var(--gold) 8%, transparent) inset",
              }}
            >
              {/* Gold accent bar at top */}
              <div
                style={{
                  height: 3,
                  background: "linear-gradient(90deg, transparent 0%, var(--gold) 30%, var(--gold) 70%, transparent 100%)",
                  opacity: 0.7,
                }}
              />

              <div style={{ padding: "clamp(1rem, 2vw, 1.75rem)" }}>
                {/* Header: crown + label + votes */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ rotate: [0, -8, 8, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      style={{ color: "var(--gold)" }}
                    >
                      <CrownIcon size={20} />
                    </motion.div>
                    <span
                      className="font-display font-bold uppercase tracking-wider"
                      style={{
                        fontSize: "clamp(0.65rem, 0.85vw, 0.8rem)",
                        color: "var(--gold)",
                      }}
                    >
                      Winning line
                    </span>
                  </div>
                  {lastRoundResult.weightedVotes != null && (
                    <span
                      className="font-mono font-bold px-2.5 py-0.5 rounded-full"
                      style={{
                        fontSize: "clamp(0.6rem, 0.75vw, 0.7rem)",
                        color: "var(--gold)",
                        background: "var(--gold-soft)",
                      }}
                    >
                      {lastRoundResult.weightedVotes} vote{lastRoundResult.weightedVotes !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* The winning text */}
                <p
                  className="leading-relaxed"
                  style={{
                    fontSize: "clamp(1rem, 1.4vw, 1.3rem)",
                    color: "var(--ms-ink)",
                  }}
                >
                  &ldquo;{lastRoundResult.winnerText}&rdquo;
                </p>

                {/* Author attribution */}
                {lastRoundResult.authorName && (
                  <div className="flex items-center gap-2 mt-3">
                    <div
                      className="w-1 rounded-full"
                      style={{ height: "1.1em", background: "var(--gold)", opacity: 0.5 }}
                    />
                    <span
                      className="font-display font-bold"
                      style={{
                        fontSize: "clamp(0.8rem, 1vw, 0.95rem)",
                        color: "var(--gold)",
                      }}
                    >
                      {lastRoundResult.authorName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Waiting message below the card */}
            <div className="text-center mt-4">
              <motion.div
                className="mx-auto mb-2 flex justify-center"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                style={{ color: "var(--ms-coral)" }}
              >
                <SparkleIcon size={20} />
              </motion.div>
              <p
                className="font-display font-medium"
                style={{ fontSize: "clamp(0.75rem, 0.95vw, 0.9rem)", color: "var(--ms-ink-dim)" }}
              >
                {isComebackRound
                  ? "Waiting to see if the comeback worked..."
                  : "Waiting for the persona's reply..."}
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="text-center">
            <motion.div
              className="mx-auto mb-3 flex justify-center"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ color: "var(--ms-coral)" }}
            >
              <SparkleIcon size={32} />
            </motion.div>
            <p
              className="font-display font-semibold"
              style={{ fontSize: "clamp(0.85rem, 1.1vw, 1.1rem)" }}
            >
              {isComebackRound
                ? "Waiting to see if the comeback worked..."
                : "Waiting for the persona's reply..."}
            </p>
            <p
              className="mt-1"
              style={{ fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)", opacity: 0.7 }}
            >
              {isComebackRound
                ? "The winning rescue line has been sent. The persona is deciding whether to give the room another chance."
                : "The winning line has been sent. The persona is composing the next message now."}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="text-center py-[clamp(2rem,4vw,4rem)]"
      style={{ color: "var(--ms-ink-dim)" }}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <HeartIcon size={32} className="mx-auto mb-3" />
      </motion.div>
      <p
        className="font-display font-semibold"
        style={{ fontSize: "clamp(0.85rem, 1.1vw, 1.1rem)" }}
      >
        Waiting for the first move...
      </p>
      <p
        className="mt-1"
        style={{ fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)", opacity: 0.7 }}
      >
        Players will write openers to impress the persona.
      </p>
    </div>
  );
}

function CompactScoreboard({ game, isFinal }: { game: GameState; isFinal: boolean }) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);

  return (
    <div className="mt-2">
      <span
        className="font-display font-bold uppercase tracking-wider block mb-2"
        style={{
          fontSize: "clamp(0.55rem, 0.7vw, 0.65rem)",
          color: "var(--ms-ink-dim)",
        }}
      >
        {isFinal ? "Final scores" : "Leaderboard"}
      </span>
      <motion.div
        className="flex flex-wrap gap-1.5"
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
      >
        {sorted.map((player, idx) => {
          const isLeader = idx === 0;
          return (
            <motion.div
              key={player.id}
              className="flex items-center gap-1.5 rounded-full"
              style={{
                padding: "clamp(0.2rem, 0.4vw, 0.3rem) clamp(0.5rem, 0.8vw, 0.7rem) clamp(0.2rem, 0.4vw, 0.3rem) clamp(0.25rem, 0.4vw, 0.3rem)",
                background: isLeader ? "var(--gold-soft)" : "var(--ms-raised)",
                border: `1px solid ${isLeader ? "var(--gold)" : "var(--ms-edge)"}`,
                ...(isLeader
                  ? { boxShadow: "0 0 8px color-mix(in srgb, var(--gold) 15%, transparent)" }
                  : {}),
              }}
              variants={{
                hidden: { opacity: 0, scale: 0.85 },
                visible: { opacity: 1, scale: 1, transition: springGentle },
              }}
            >
              {isLeader && (
                <CrownIcon size={10} />
              )}
              <PlayerAvatar name={player.name} modelId={player.modelId} size={18} />
              <span
                className="font-semibold truncate"
                style={{
                  fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
                  color: isLeader ? "var(--gold)" : "var(--ms-ink)",
                  maxWidth: "clamp(3rem, 6vw, 5rem)",
                }}
              >
                {player.name}
              </span>
              <span
                className="font-mono font-bold tabular-nums"
                style={{
                  fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
                  color: isLeader ? "var(--gold)" : "var(--ms-ink-dim)",
                }}
              >
                {player.score}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function FinalScoreChart({ game }: { game: GameState }) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score);
  const maxScore = sorted[0]?.score || 1;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-4">
        <CrownIcon size={16} />
        <span
          className="font-display font-bold uppercase tracking-wider"
          style={{
            fontSize: "clamp(0.65rem, 0.85vw, 0.8rem)",
            color: "var(--gold)",
          }}
        >
          Final Standings
        </span>
        <div
          className="flex-1 h-px"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--gold) 30%, transparent), transparent)",
          }}
        />
      </div>

      <motion.div
        className="space-y-2.5"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.12 } },
        }}
      >
        {sorted.map((player, idx) => {
          const pct = maxScore > 0 ? (player.score / maxScore) * 100 : 0;
          const isWinner = idx === 0;

          return (
            <motion.div
              key={player.id}
              className="flex items-center gap-3"
              variants={{
                hidden: { opacity: 0, x: -16 },
                visible: { opacity: 1, x: 0, transition: springGentle },
              }}
            >
              {/* Rank */}
              <span
                className="shrink-0 font-mono font-bold tabular-nums"
                style={{
                  width: "clamp(1.2rem, 1.5vw, 1.5rem)",
                  textAlign: "center",
                  fontSize: "clamp(0.85rem, 1.1vw, 1.1rem)",
                  color: isWinner ? "var(--gold)" : "var(--ms-ink-dim)",
                  ...(isWinner
                    ? {
                        textShadow:
                          "0 0 10px color-mix(in srgb, var(--gold) 40%, transparent)",
                      }
                    : {}),
                }}
              >
                {idx + 1}
              </span>

              {/* Avatar */}
              <PlayerAvatar
                name={player.name}
                modelId={player.modelId}
                size={28}
              />

              {/* Name */}
              <span
                className="shrink-0 font-display font-bold truncate"
                style={{
                  width: "clamp(3.5rem, 7vw, 6rem)",
                  fontSize: "clamp(0.8rem, 1vw, 1rem)",
                  color: isWinner ? "var(--gold)" : "var(--ms-ink)",
                }}
              >
                {player.name}
              </span>

              {/* Bar track */}
              <div
                className="flex-1 relative overflow-hidden rounded-lg"
                style={{
                  height: "clamp(1.5rem, 2vw, 2rem)",
                  background:
                    "color-mix(in srgb, var(--ms-edge) 40%, transparent)",
                }}
              >
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-lg"
                  initial={{ width: "0%" }}
                  animate={{ width: `${Math.max(pct, 3)}%` }}
                  transition={{
                    ...springGentle,
                    delay: 0.25 + idx * 0.12,
                  }}
                  style={
                    isWinner
                      ? {
                          background:
                            "linear-gradient(90deg, var(--gold) 0%, color-mix(in srgb, var(--gold) 65%, var(--ms-coral)) 100%)",
                          boxShadow:
                            "0 0 16px color-mix(in srgb, var(--gold) 30%, transparent), 0 0 4px color-mix(in srgb, var(--gold) 15%, transparent) inset",
                        }
                      : {
                          background:
                            "linear-gradient(90deg, var(--ms-violet) 20%, color-mix(in srgb, var(--ms-violet) 40%, transparent) 100%)",
                          opacity: 0.4,
                        }
                  }
                />
              </div>

              {/* Score */}
              <motion.span
                className="shrink-0 font-mono font-bold tabular-nums"
                style={{
                  width: "clamp(2rem, 3vw, 3rem)",
                  textAlign: "right",
                  fontSize: "clamp(0.85rem, 1.1vw, 1.1rem)",
                  color: isWinner ? "var(--gold)" : "var(--ms-ink-dim)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + idx * 0.12 }}
              >
                {player.score}
              </motion.span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function PhaseStatusCard({
  gameState,
  outcome,
  isComebackRound,
  isHost,
  hostActionBusy,
  endingGame,
  triggerElement,
  postHostAction,
  handleEndGame,
  canEndGame,
  canAdvancePhase,
}: {
  gameState: GameState;
  outcome: Outcome;
  isComebackRound: boolean;
  isHost: boolean;
  hostActionBusy: boolean;
  endingGame: boolean;
  triggerElement: (el: HTMLElement) => void;
  postHostAction: (path: "start" | "next") => void;
  handleEndGame: () => void;
  canEndGame: boolean;
  canAdvancePhase: boolean;
}) {
  const phaseConfig = {
    LOBBY: {
      icon: <HeartIcon size={28} className="animate-ms-heartbeat" />,
      title: "Ready to mingle?",
      subtitle: "Players join from their phones, then we find your match.",
      color: "var(--ms-rose)",
    },
    WRITING: {
      icon: <PenIcon size={24} />,
      title: isComebackRound ? "Comeback round" : "Craft your best line",
      subtitle: isComebackRound
        ? "You got unmatched, but one killer follow-up can still save the conversation."
        : "Everyone's writing their funniest opener on their phones.",
      color: "var(--ms-coral)",
    },
    VOTING: {
      icon: <VoteIcon size={24} />,
      title: isComebackRound ? "Vote for the save" : "Pick the winner",
      subtitle: isComebackRound
        ? "This vote decides whether the room pulls off the comeback."
        : "Votes turn straight into points, and even close seconds can score. Human votes count double.",
      color: "var(--ms-violet)",
    },
    ROUND_RESULTS: {
      icon: <SparkleIcon size={24} />,
      title: isComebackRound ? "Did they save it?" : "The verdict is in",
      subtitle: isComebackRound
        ? "The best rescue line has landed. Now we find out whether it worked."
        : "The winning line has been sent. Let's see the response...",
      color: "var(--ms-coral)",
    },
    FINAL_RESULTS: {
      icon:
        outcome === "DATE_SEALED"
          ? <HeartIcon size={28} />
          : outcome === "COMEBACK"
            ? <SparkleIcon size={24} />
            : <BrokenHeartIcon size={28} />,
      title: outcome === "DATE_SEALED"
        ? "It's a match!"
        : outcome === "COMEBACK"
          ? "You saved it"
        : outcome === "UNMATCHED"
          ? "Better luck next time"
          : "Time ran out",
      subtitle: outcome === "DATE_SEALED"
        ? "You collectively charmed the persona. Date sealed."
        : outcome === "COMEBACK"
          ? "Not a full date, but the room talked its way back from disaster."
        : outcome === "UNMATCHED"
          ? "The persona wasn't feeling it. Try a different approach?"
          : "The conversation hit the round limit without a clear outcome.",
      color:
        outcome === "DATE_SEALED"
          ? "var(--ms-mint)"
          : outcome === "COMEBACK"
            ? "var(--ms-coral)"
            : "var(--ms-red)",
    },
  }[gameState.status] ?? {
    icon: <HeartIcon size={28} />,
    title: "MatchSlop",
    subtitle: "",
    color: "var(--ms-rose)",
  };

  const isCompact = gameState.status === "ROUND_RESULTS" || gameState.status === "FINAL_RESULTS";

  return (
    <div>
      <div className="p-[clamp(1rem,2vw,2rem)]">
        {isCompact ? (
          /* Compact inline header for results phases */
          <div className="flex items-center gap-2 mb-3">
            <div
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg"
              style={{
                background: `${phaseConfig.color}18`,
                color: phaseConfig.color,
              }}
            >
              {phaseConfig.icon}
            </div>
            <h2
              className="font-display font-bold"
              style={{
                fontSize: "clamp(0.9rem, 1.2vw, 1.15rem)",
                color: "var(--ms-ink)",
              }}
            >
              {phaseConfig.title}
            </h2>
            <span
              style={{
                fontSize: "clamp(0.7rem, 0.85vw, 0.85rem)",
                color: "var(--ms-ink-dim)",
              }}
            >
              — {phaseConfig.subtitle}
            </span>
          </div>
        ) : (
          /* Full header for lobby/writing/voting */
          <div className="flex items-start gap-3 mb-4">
            <div
              className="shrink-0 flex items-center justify-center w-[clamp(2.5rem,3.5vw,4rem)] h-[clamp(2.5rem,3.5vw,4rem)] rounded-2xl"
              style={{
                background: `${phaseConfig.color}18`,
                color: phaseConfig.color,
              }}
            >
              {phaseConfig.icon}
            </div>
            <div className="min-w-0">
              <h2
                className="font-display font-bold"
                style={{
                  fontSize: "clamp(1.1rem, 1.8vw, 2rem)",
                  color: "var(--ms-ink)",
                }}
              >
                {phaseConfig.title}
              </h2>
              <p
                className="mt-0.5"
                style={{
                  fontSize: "clamp(0.8rem, 1vw, 1rem)",
                  color: "var(--ms-ink-dim)",
                }}
              >
                {phaseConfig.subtitle}
              </p>
            </div>
          </div>
        )}

        {/* Turn-limit warning */}
        {(() => {
          const turnsLeft = gameState.totalRounds - gameState.currentRound;
          const showWarning =
            !isComebackRound &&
            turnsLeft >= 0 &&
            turnsLeft <= 2 &&
            (gameState.status === "WRITING" || gameState.status === "VOTING" || gameState.status === "ROUND_RESULTS");
          if (!showWarning) return null;
          const isDanger = turnsLeft <= 0;
          const color = isDanger ? "var(--ms-red)" : "var(--ms-coral)";
          const bg = isDanger ? "var(--ms-red-soft)" : "var(--ms-coral-soft)";
          return (
            <motion.div
              className="flex items-center gap-2 rounded-xl mb-4"
              style={{
                padding: "clamp(0.5rem, 1vw, 0.75rem) clamp(0.75rem, 1.2vw, 1rem)",
                background: bg,
                border: `1px solid ${color}30`,
              }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
            >
              {isDanger ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                  style={{ color }}
                >
                  <BrokenHeartIcon size={16} />
                </motion.div>
              ) : (
                <SparkleIcon size={14} />
              )}
              <span
                className="font-display font-bold"
                style={{
                  fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)",
                  color,
                }}
              >
                {isDanger
                  ? "Last turn to seal the deal!"
                  : turnsLeft === 1
                    ? "1 turn left to seal the deal"
                    : `${turnsLeft} turns left to seal the deal`}
              </span>
            </motion.div>
          );
        })()}

        {/* Timer */}
        {gameState.phaseDeadline && (
          <div className="mb-4">
            <Timer deadline={gameState.phaseDeadline} disabled={gameState.timersDisabled} />
          </div>
        )}

        {/* Phase-specific content */}
        {gameState.status === "LOBBY" && (
          <div className="space-y-3">
            <div
              className="rounded-2xl p-4 text-center"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)" }}
            >
              <p
                className="font-mono font-black tracking-[0.3em]"
                style={{
                  fontSize: "clamp(2rem, 4vw, 4rem)",
                  color: "var(--ms-rose)",
                }}
              >
                {gameState.roomCode}
              </p>
              <p
                className="mt-1"
                style={{
                  fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)",
                  color: "var(--ms-ink-dim)",
                }}
              >
                Join at <strong style={{ color: "var(--ms-ink)" }}>{typeof window !== "undefined" ? window.location.host : ""}</strong>
              </p>
            </div>
            <div className="text-center">
              <p
                className="font-medium"
                style={{
                  fontSize: "clamp(0.75rem, 1vw, 0.95rem)",
                  color: "var(--ms-ink-dim)",
                }}
              >
                {gameState.players.length} player{gameState.players.length !== 1 ? "s" : ""} connected
              </p>
              <p
                className="mt-1"
                style={{
                  fontSize: "clamp(0.65rem, 0.85vw, 0.85rem)",
                  color: "var(--ms-ink-dim)",
                  opacity: 0.7,
                }}
              >
                {gameState.players.map((p) => p.name).join(" · ")}
              </p>
            </div>
          </div>
        )}

        {gameState.status === "WRITING" && (
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)" }}
          >
            <TypingIndicator />
            <p style={{ fontSize: "clamp(0.8rem, 1vw, 1rem)", color: "var(--ms-ink-dim)" }}>
              {isComebackRound
                ? "Players are firing off one last save..."
                : "Players are typing their best lines..."}
            </p>
          </div>
        )}

        {gameState.status === "VOTING" && (
          <div
            className="rounded-2xl p-4 flex items-center gap-3"
            style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)" }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{ color: "var(--ms-violet)" }}
            >
              <VoteIcon size={20} />
            </motion.div>
            <p style={{ fontSize: "clamp(0.8rem, 1vw, 1rem)", color: "var(--ms-ink-dim)" }}>
              {isComebackRound ? "Votes are deciding the comeback..." : "Votes are coming in..."}
            </p>
          </div>
        )}

        {gameState.status === "ROUND_RESULTS" && (
          <CompactScoreboard
            game={gameState}
            isFinal={false}
          />
        )}
        {gameState.status === "FINAL_RESULTS" && (
          <FinalScoreChart game={gameState} />
        )}
      </div>

      {/* Host controls */}
      {isHost && (
        <div
          className={`p-[clamp(1rem,2vw,2rem)] pt-0 ${isCompact ? "flex gap-2" : "space-y-2"}`}
        >
          {gameState.status === "LOBBY" && (
            <motion.button
              type="button"
              onClick={(e) => {
                triggerElement(e.currentTarget);
                void postHostAction("start");
              }}
              disabled={hostActionBusy}
              className="w-full font-display font-bold rounded-2xl text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--ms-gradient-romance)",
                padding: "clamp(0.875rem, 1.5vw, 1.25rem)",
                fontSize: "clamp(1rem, 1.4vw, 1.25rem)",
                boxShadow: "0 4px 20px var(--ms-rose-glow)",
              }}
              {...buttonTapPrimary}
            >
              {hostActionBusy ? "Starting..." : "Start Matching"}
            </motion.button>
          )}
          {(gameState.status === "WRITING" || gameState.status === "VOTING" || gameState.status === "ROUND_RESULTS") && (
            <motion.button
              type="button"
              onClick={(e) => {
                triggerElement(e.currentTarget);
                void postHostAction("next");
              }}
              disabled={hostActionBusy || !canAdvancePhase}
              className={`${isCompact ? "flex-1" : "w-full"} rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{
                background: "var(--ms-raised)",
                border: "1px solid var(--ms-edge)",
                color: "var(--ms-ink-dim)",
                padding: isCompact ? "clamp(0.5rem, 0.8vw, 0.65rem) clamp(0.75rem, 1vw, 1rem)" : "clamp(0.75rem, 1.2vw, 1rem)",
                fontSize: isCompact ? "clamp(0.75rem, 0.9vw, 0.85rem)" : "clamp(0.85rem, 1.1vw, 1rem)",
              }}
              {...buttonTap}
            >
              {hostActionBusy
                ? "Working..."
                : !canAdvancePhase
                  ? "Building Profile..."
                : gameState.status === "ROUND_RESULTS"
                  ? isComebackRound
                    ? "Show Ending"
                    : "Next Round"
                  : "Skip Phase"}
            </motion.button>
          )}
          {canEndGame && (
            <motion.button
              type="button"
              onClick={(e) => {
                triggerElement(e.currentTarget);
                void handleEndGame();
              }}
              disabled={endingGame}
              className={`${isCompact ? "" : "w-full"} rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{
                border: "1px solid var(--ms-red-soft)",
                color: "var(--ms-red)",
                background: "transparent",
                padding: isCompact ? "clamp(0.5rem, 0.8vw, 0.65rem) clamp(0.75rem, 1vw, 1rem)" : "clamp(0.75rem, 1.2vw, 1rem)",
                fontSize: isCompact ? "clamp(0.75rem, 0.9vw, 0.85rem)" : "clamp(0.85rem, 1.1vw, 1rem)",
              }}
              {...buttonTap}
            >
              {endingGame ? "Ending..." : "End Game"}
            </motion.button>
          )}
        </div>
      )}

      {!isHost && gameState.status === "LOBBY" && (
        <div className="p-[clamp(1rem,2vw,2rem)] pt-0">
          <PulsingDot>Waiting for the game to start...</PulsingDot>
        </div>
      )}
    </div>
  );
}

/* ─── Outcome Verdict ─── */

function OutcomeVerdict({ outcome }: { outcome: Outcome }) {
  if (outcome === "IN_PROGRESS") return null;

  const config = {
    DATE_SEALED: {
      icon: <HeartIcon size={18} />,
      label: "Date sealed",
      color: "var(--ms-mint)",
      bg: "linear-gradient(135deg, color-mix(in srgb, var(--ms-mint) 10%, var(--ms-surface)), var(--ms-surface))",
      border: "color-mix(in srgb, var(--ms-mint) 25%, transparent)",
      lineGradient: "var(--ms-mint)",
      glow: "0 -4px 24px color-mix(in srgb, var(--ms-mint) 12%, transparent)",
      pulse: true,
    },
    UNMATCHED: {
      icon: <BrokenHeartIcon size={18} />,
      label: "Unmatched",
      color: "var(--ms-red)",
      bg: "linear-gradient(135deg, color-mix(in srgb, var(--ms-red) 6%, var(--ms-surface)), var(--ms-surface))",
      border: "color-mix(in srgb, var(--ms-red) 15%, transparent)",
      lineGradient: "var(--ms-red)",
      glow: "none",
      pulse: false,
    },
    TURN_LIMIT: {
      icon: <SparkleIcon size={16} />,
      label: "Time\u2019s up",
      color: "var(--ms-coral)",
      bg: "linear-gradient(135deg, color-mix(in srgb, var(--ms-coral) 8%, var(--ms-surface)), var(--ms-surface))",
      border: "color-mix(in srgb, var(--ms-coral) 18%, transparent)",
      lineGradient: "var(--ms-coral)",
      glow: "none",
      pulse: false,
    },
    COMEBACK: {
      icon: <SparkleIcon size={16} />,
      label: "Comeback",
      color: "var(--ms-coral)",
      bg: "linear-gradient(135deg, color-mix(in srgb, var(--ms-coral) 10%, var(--ms-surface)), var(--ms-surface))",
      border: "color-mix(in srgb, var(--ms-coral) 22%, transparent)",
      lineGradient: "var(--ms-coral)",
      glow: "0 -4px 24px color-mix(in srgb, var(--ms-coral) 10%, transparent)",
      pulse: false,
    },
  }[outcome];

  return (
    <motion.div
      style={{
        borderTop: `1px solid ${config.border}`,
        background: config.bg,
        boxShadow: config.glow,
        padding: "clamp(1rem, 1.8vw, 1.5rem) clamp(1.25rem, 2vw, 1.75rem)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3">
        {/* Left decorative line */}
        <div
          className="flex-1 h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${config.lineGradient})`,
            opacity: 0.3,
          }}
        />

        {/* Centered verdict */}
        <motion.div
          className="shrink-0 flex items-center gap-2.5"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", bounce: 0.35 }}
        >
          <span
            className={config.pulse ? "animate-ms-heartbeat" : ""}
            style={{ color: config.color, display: "flex" }}
          >
            {config.icon}
          </span>
          <span
            className="font-display font-bold uppercase tracking-widest"
            style={{
              fontSize: "clamp(0.6rem, 0.85vw, 0.8rem)",
              color: config.color,
            }}
          >
            {config.label}
          </span>
        </motion.div>

        {/* Right decorative line */}
        <div
          className="flex-1 h-px"
          style={{
            background: `linear-gradient(to left, transparent, ${config.lineGradient})`,
            opacity: 0.3,
          }}
        />
      </div>
    </motion.div>
  );
}

/* ─── Main Shell ─── */

export function MatchSlopGameShell({
  code,
  viewMode = "game",
}: {
  code: string;
  viewMode?: "game" | "stage";
}) {
  const searchParams = useSearchParams();
  const storedPlayerId = useSyncExternalStore(noopSubscribe, getPlayerId, () => null);
  const playerToken = useSyncExternalStore(noopSubscribe, getPlayerToken, () => null);
  const hostControlToken = useSyncExternalStore(noopSubscribe, getHostControlToken, () => null);
  const { triggerElement } = usePixelDissolve();
  const playerId = viewMode === "stage" ? null : storedPlayerId;
  const { gameState, error } = useGameStream(
    code,
    playerToken,
    hostControlToken,
    viewMode,
  );
  useScreenWakeLock(gameState != null);
  const [endingGame, setEndingGame] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef<GameState["status"] | null>(null);
  const prevPlayerIdsRef = useRef<Set<string> | null>(null);
  const prevRoundRef = useRef<number | undefined>(undefined);
  const allInRef = useRef<string>("");
  const winnerRevealRef = useRef<string>("");
  const finalResultsRef = useRef<string>("");
  const prevTranscriptLengthRef = useRef<number | null>(null);
  const prevVoteCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (viewMode !== "stage") return;
    const urlToken = searchParams.get("token");
    if (urlToken) {
      localStorage.setItem("hostControlToken", urlToken);
    }
  }, [searchParams, viewMode]);

  // Auto-scroll transcript
  const modeState = asModeState(gameState?.modeState);
  const profileDraft = modeState.profileDraft ?? null;
  const profile = modeState.profile ?? null;
  const profileGeneration = modeState.profileGeneration ?? null;
  const outcome = (modeState.outcome ?? "IN_PROGRESS") as Outcome;
  const comebackRound = modeState.comebackRound ?? null;
  const personaImage = modeState.personaImage ?? null;
  const rawTranscript = modeState.transcript ?? EMPTY_TRANSCRIPT;
  const lastRoundResult = modeState.lastRoundResult ?? null;
  const isInitialProfilePending =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    profile == null &&
    profileGeneration?.status !== "FAILED";
  const isInitialProfileFailed =
    gameState?.status === "WRITING" &&
    gameState.currentRound === 1 &&
    profile == null &&
    profileGeneration?.status === "FAILED";
  // During ROUND_RESULTS the winning response hasn't been persisted to the
  // transcript yet (it's added when advancing to the next round). Append it
  // to the displayed transcript so the player can see what won.
  const transcript = useMemo(() => {
    if (
      gameState?.status === "ROUND_RESULTS" &&
      lastRoundResult?.winnerText &&
      gameState.currentRound != null
    ) {
      const winnerId = `players-turn-${gameState.currentRound}`;
      // Don't double-add if already present
      if (!rawTranscript.some((e) => e.id === winnerId)) {
        return [
          ...rawTranscript,
          {
            id: winnerId,
            speaker: "PLAYERS" as const,
            text: lastRoundResult.winnerText,
            turn: gameState.currentRound,
            outcome: null,
            authorName: lastRoundResult.authorName ?? null,
            selectedPromptText:
              gameState.currentRound === 1
                ? (lastRoundResult.selectedPromptText ?? null)
                : null,
            selectedPromptId:
              gameState.currentRound === 1
                ? (lastRoundResult.selectedPromptId ?? null)
                : null,
          },
        ];
      }
    }
    return rawTranscript;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- use .length to avoid recomputing on every SSE tick (rawTranscript is a new reference each render)
  }, [rawTranscript.length, lastRoundResult?.winnerText, gameState?.status, gameState?.currentRound]);
  const isComebackRound = comebackRound != null && gameState?.currentRound === comebackRound;
  const isActiveComebackRound = isComebackRound && gameState?.status !== "FINAL_RESULTS";
  const currentRoundData =
    gameState?.rounds.find((round) => round.roundNumber === gameState.currentRound) ??
    gameState?.rounds[0];
  const currentPrompt =
    currentRoundData?.prompts[gameState?.votingPromptIndex ?? 0] ??
    currentRoundData?.prompts[0];
  const activePlayers =
    gameState?.players.filter(
      (player) => player.type !== "SPECTATOR" && player.participationStatus === "ACTIVE",
    ) ?? [];
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    // In final results, scroll to top so the beginning of the conversation
    // (with prompt context) is visible first. During live play, scroll to
    // bottom so the newest message is always in view.
    if (gameState?.status === "FINAL_RESULTS") {
      el.scrollTop = 0;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript.length, gameState?.status]);

  useEffect(() => {
    window.addEventListener("pointerdown", preloadSounds, { once: true });
    return () => window.removeEventListener("pointerdown", preloadSounds);
  }, []);

  useEffect(() => {
    const status = gameState?.status;
    if (!status || status === prevStatusRef.current) return;
    const previousStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!previousStatus || status === "LOBBY") return;
    playSound("phase-transition");
  }, [gameState?.status]);

  useEffect(() => {
    const players = gameState?.players;
    if (!players) return;
    const currentIds = new Set(players.map((player) => player.id));
    const previousIds = prevPlayerIdsRef.current;
    prevPlayerIdsRef.current = currentIds;
    if (!previousIds) return;
    const hasJoin = players.some((player) => !previousIds.has(player.id));
    const hasLeave = [...previousIds].some((id) => !currentIds.has(id));
    if (hasJoin) {
      playSound("player-join");
    } else if (hasLeave) {
      playSound("player-leave");
    }
  }, [gameState?.players]);

  useEffect(() => {
    const status = gameState?.status;
    const currentRound = gameState?.currentRound;
    if (status !== "WRITING" || currentRound == null) return;
    if (prevRoundRef.current !== undefined && currentRound !== prevRoundRef.current) {
      playSound("round-start");
    }
    prevRoundRef.current = currentRound;
  }, [gameState?.currentRound, gameState?.status]);

  useEffect(() => {
    if (!gameState || gameState.status !== "WRITING" || !currentPrompt) return;
    if (activePlayers.length < 2) return;
    const allSubmitted = currentPrompt.responses.length >= activePlayers.length;
    const key = `${gameState.currentRound}`;
    if (allSubmitted && allInRef.current !== key) {
      allInRef.current = key;
      playSound("all-in");
    }
  }, [activePlayers.length, currentPrompt, gameState]);

  useEffect(() => {
    const status = gameState?.status;
    const currentRound = gameState?.currentRound;
    if (status !== "ROUND_RESULTS" || currentRound == null) return;
    const key = `${currentRound}`;
    if (winnerRevealRef.current === key) return;
    winnerRevealRef.current = key;
    playSound("winner-reveal");
  }, [gameState?.currentRound, gameState?.status]);

  useEffect(() => {
    if (gameState?.status !== "FINAL_RESULTS") return;
    const key = `${gameState.currentRound}:${outcome}`;
    if (finalResultsRef.current === key) return;
    finalResultsRef.current = key;
    playSound("game-over");
    if (outcome !== "DATE_SEALED") return;
    const timer = window.setTimeout(() => playSound("celebration"), 2000);
    return () => window.clearTimeout(timer);
  }, [gameState?.currentRound, gameState?.status, outcome]);

  useEffect(() => {
    const previousLength = prevTranscriptLengthRef.current;
    prevTranscriptLengthRef.current = transcript.length;
    if (previousLength == null || transcript.length <= previousLength) return;
    const newEntries = transcript.slice(previousLength);
    const hasPlayerEntry = newEntries.some((entry) => entry.speaker === "PLAYERS");
    const hasPersonaEntry = newEntries.some((entry) => entry.speaker === "PERSONA");
    if (hasPlayerEntry) {
      playSound("chat-send");
    }
    if (!hasPersonaEntry) return;
    const timer = window.setTimeout(() => playSound("chat-receive"), hasPlayerEntry ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [transcript]);

  useEffect(() => {
    const nextVoteCount = currentPrompt?.votes?.length ?? 0;
    const previousVoteCount = prevVoteCountRef.current;
    prevVoteCountRef.current = nextVoteCount;
    if (
      previousVoteCount == null ||
      gameState?.status !== "VOTING" ||
      gameState.votingRevealing ||
      nextVoteCount <= previousVoteCount
    ) {
      return;
    }
    playSound("vote-cast");
  }, [currentPrompt?.votes?.length, gameState?.status, gameState?.votingRevealing]);

  // Set data-game attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-game", "matchslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  const isHost =
    playerId === gameState?.hostPlayerId ||
    (viewMode === "stage" && !!hostControlToken && gameState?.hostPlayerId == null);
  const canEndGame =
    isHost &&
    (gameState?.status === "WRITING" ||
      gameState?.status === "VOTING" ||
      gameState?.status === "ROUND_RESULTS");
  const canAdvancePhase = !isInitialProfilePending && !isInitialProfileFailed;

  async function postHostAction(path: "start" | "next") {
    const token = localStorage.getItem("hostControlToken");
    if (!playerId && !token) return;
    setHostActionBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/games/${code}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken: token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Action failed");
      } else if (path === "start") {
        playSound("game-start");
      } else if (gameState?.status === "ROUND_RESULTS") {
        playSound("round-transition");
      }
    } catch {
      setActionError("Something went wrong");
    } finally {
      setHostActionBusy(false);
    }
  }

  async function handleEndGame() {
    if (!canEndGame) return;
    if (!window.confirm("End the game early?")) return;
    setEndingGame(true);
    try {
      const res = await fetch(`/api/games/${code}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, hostToken: hostControlToken }),
      });
      if (!res.ok) {
        setEndingGame(false);
      }
    } catch {
      setEndingGame(false);
    }
  }

  /* ─── Loading / Error ─── */

  if (error) {
    return (
      <main
        className="min-h-svh flex items-center justify-center px-6"
      >
        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <p className="text-fail font-display font-bold text-xl">{error}</p>
        </motion.div>
      </main>
    );
  }

  if (!gameState) {
    return (
      <main
        className="min-h-svh flex items-center justify-center px-6"
      >
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <HeartIcon size={32} className="animate-ms-heartbeat" />
          <p style={{ color: "var(--ms-ink-dim)" }}>Finding your match...</p>
        </motion.div>
      </main>
    );
  }

  /* ─── Main Layout ─── */

  return (
    <div
      className="min-h-svh flex flex-col overflow-x-hidden relative"
    >
      {/* Ambient glow background */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `
            radial-gradient(ellipse 60% 50% at 20% 50%, var(--ms-rose-soft) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 80% 30%, var(--ms-violet-soft) 0%, transparent 70%)
          `,
          opacity: 0.6,
        }}
      />

      {/* Top bar */}
      <div
        className="shrink-0 z-30 flex items-center justify-between backdrop-blur-md"
        style={{
          paddingTop: "clamp(0.5rem, 1vw, 1rem)",
          paddingBottom: "clamp(0.5rem, 1vw, 1rem)",
          paddingLeft: "clamp(1rem, 2vw, 2rem)",
          paddingRight: "clamp(4rem, 5vw, 5.5rem)",
          background: `color-mix(in srgb, var(--ms-bg) 85%, transparent)`,
          borderBottom: "1px solid var(--ms-edge)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="font-display font-bold tracking-tight transition-colors hover:opacity-80"
            style={{
              fontSize: "clamp(0.7rem, 1vw, 0.9rem)",
              color: "var(--ms-rose)",
            }}
          >
            MATCHSLOP
          </Link>
          <span style={{ color: "var(--ms-edge-strong)" }}>|</span>
          <span
            className="font-mono font-bold tracking-widest"
            style={{
              fontSize: "clamp(0.65rem, 0.85vw, 0.8rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            {gameState.roomCode}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="font-bold uppercase tracking-wider px-3 py-1 rounded-full"
            style={{
              fontSize: "clamp(0.55rem, 0.75vw, 0.7rem)",
              color: "var(--ms-rose)",
              background: "var(--ms-rose-soft)",
            }}
            >
            {gameState.status === "LOBBY"
              ? "Lobby"
              : isActiveComebackRound
                ? "Comeback"
                : gameState.status === "WRITING"
                  ? "Writing"
                  : gameState.status === "VOTING"
                    ? "Voting"
                    : gameState.status === "ROUND_RESULTS"
                      ? "Results"
                      : "Final"}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            {isComebackRound
              ? "Comeback Round"
              : `Turn ${gameState.currentRound}/${gameState.totalRounds}`}
          </span>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 relative z-10" style={{ padding: "clamp(0.75rem, 2vw, 2rem)" }}>
        <div
          className="mx-auto h-full grid gap-[clamp(0.75rem,2vw,2rem)] items-start"
          style={{
            maxWidth: "min(100%, 120rem)",
            gridTemplateColumns: "clamp(20rem, 40%, 36rem) 1fr",
          }}
        >
          {/* Left: Profile Card */}
          <div className="sticky top-4 self-start">
            <ProfileCard
              profile={profile ?? profileDraft}
              personaImage={personaImage}
              profileGeneration={profileGeneration}
              outcome={outcome}
            />

          </div>

          {/* Right: Combined Phase Status + Conversation */}
          <div className="space-y-[clamp(0.75rem,1.5vw,1.5rem)]">
            <motion.div
              className="rounded-[1.5rem] overflow-hidden relative"
              style={{
                background: "var(--ms-surface)",
                border: "1px solid var(--ms-edge)",
                boxShadow: "var(--ms-shadow)",
              }}
              variants={slideInRight}
              initial="hidden"
              animate="visible"
            >
              {/* Phase status header */}
              <PhaseStatusCard
                gameState={gameState}
                outcome={outcome}
                isComebackRound={isActiveComebackRound}
                isHost={isHost}
                hostActionBusy={hostActionBusy}
                endingGame={endingGame}
                triggerElement={triggerElement}
                postHostAction={(path) => void postHostAction(path)}
                handleEndGame={() => void handleEndGame()}
                canEndGame={canEndGame}
                canAdvancePhase={canAdvancePhase}
              />

              {/* Conversation divider + header */}
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2vw, 1.5rem)",
                  borderTop: "1px solid var(--ms-edge)",
                }}
              >
                <div className="flex items-center gap-2">
                  <HeartIcon size={16} className="" />
                  <h3
                    className="font-display font-bold"
                    style={{
                      fontSize: "clamp(0.85rem, 1.2vw, 1.2rem)",
                      color: "var(--ms-ink)",
                    }}
                  >
                    The conversation
                  </h3>
                </div>
                {transcript.length > 0 && (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: "clamp(0.6rem, 0.75vw, 0.7rem)",
                      color: "var(--ms-ink-dim)",
                    }}
                  >
                    {transcript.length} message{transcript.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Conversation transcript */}
              <div
                ref={transcriptScrollRef}
                className="overflow-y-auto"
                style={{
                  padding: "0 clamp(0.75rem, 1.5vw, 1.25rem) clamp(0.75rem, 1.5vw, 1.25rem)",
                  maxHeight: "clamp(20rem, 50vh, 50rem)",
                }}
              >
                {transcript.length > 0 ? (
                  <motion.div
                    className="space-y-3"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                  >
                    {transcript.map((entry, index) => (
                      <TranscriptBubble
                        key={entry.id ?? `${entry.turn ?? index}-${index}`}
                        entry={entry}
                        index={index}
                      />
                    ))}
                    <div ref={transcriptEndRef} />
                  </motion.div>
                ) : (
                  <EmptyConversationState
                    status={gameState.status}
                    isComebackRound={isActiveComebackRound}
                    lastRoundResult={lastRoundResult}
                  />
                )}
              </div>

              {/* Outcome verdict footer */}
              <OutcomeVerdict outcome={outcome} />
            </motion.div>

            {/* Final results link */}
            {gameState.status === "FINAL_RESULTS" && (
              <motion.div variants={fadeInUp} initial="hidden" animate="visible">
                <Link
                  href={isHost ? "/host" : "/join"}
                  className="block text-center rounded-2xl font-display font-semibold transition-all"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                    padding: "clamp(0.75rem, 1.2vw, 1rem)",
                    fontSize: "clamp(0.85rem, 1.1vw, 1rem)",
                  }}
                >
                  {isHost ? "Host Another Game" : "Join Another Game"}
                </Link>
              </motion.div>
            )}

            <ErrorBanner error={actionError} />
          </div>
        </div>
      </main>
    </div>
  );
}
