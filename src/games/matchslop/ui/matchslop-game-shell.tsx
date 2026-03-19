"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { PulsingDot } from "@/components/pulsing-dot";
import { ScoreBarChart } from "@/components/score-bar-chart";
import {
  fadeInUp,
  floatIn,
  popIn,
  slideInLeft,
  slideInRight,
  staggerContainer,
  staggerContainerSlow,
  buttonTap,
  buttonTapPrimary,
} from "@/lib/animations";
import { useGameStream } from "@/hooks/use-game-stream";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import type { GameState } from "@/lib/types";

/* ─── Local Types ─── */

type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";

type MatchSlopPersonaImageState = {
  status?: "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED";
  imageUrl?: string | null;
};

type MatchSlopProfilePrompt = {
  id?: string;
  prompt?: string;
  answer?: string;
};

type MatchSlopProfile = {
  displayName?: string;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  tagline?: string | null;
  prompts?: MatchSlopProfilePrompt[];
  image?: MatchSlopPersonaImageState | null;
};

type MatchSlopTranscriptEntry = {
  id?: string;
  speaker?: string;
  text?: string;
  turn?: number;
  outcome?: string | null;
  authorName?: string | null;
};

type MatchSlopModeState = {
  seekerIdentity?: MatchSlopIdentity | string | null;
  personaIdentity?: MatchSlopIdentity | string | null;
  outcome?: "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT";
  humanVoteWeight?: number;
  aiVoteWeight?: number;
  selectedPersonaExampleIds?: string[];
  selectedPlayerExampleIds?: string[];
  profile?: MatchSlopProfile | null;
  transcript?: MatchSlopTranscriptEntry[];
  personaImage?: MatchSlopPersonaImageState | null;
};

type Outcome = "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT";

/* ─── Helpers ─── */

function getPlayerId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("playerId");
}

function getHostControlToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("hostControlToken");
}

const noopSubscribe = () => () => {};

function asModeState(state: GameState["modeState"] | undefined): MatchSlopModeState {
  return (state ?? {}) as MatchSlopModeState;
}

function identityLabel(value: string | null | undefined) {
  switch (value) {
    case "MAN": return "Man";
    case "WOMAN": return "Woman";
    case "NON_BINARY": return "Non-binary";
    case "OTHER": return "Other";
    default: return value ?? "Unknown";
  }
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
  seekerIdentity,
  personaIdentity,
  outcome,
}: {
  profile: MatchSlopProfile | null;
  personaImage: MatchSlopPersonaImageState | null;
  seekerIdentity: string | null | undefined;
  personaIdentity: string | null | undefined;
  outcome: Outcome;
}) {
  const imageStatus = personaImage?.status ?? "NOT_REQUESTED";

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
            <div className="text-center">
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
                {imageStatus === "PENDING" ? "Generating portrait..." : "Awaiting portrait"}
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
                {profile?.displayName ?? "AI Persona"}
              </h1>
              {(profile?.age || profile?.location) && (
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
          {profile?.bio ?? "The persona profile is being generated..."}
        </p>

        {/* Identity badges */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span
            className="text-[clamp(0.6rem,0.8vw,0.75rem)] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
            style={{ color: "var(--ms-violet)", background: "var(--ms-violet-soft)" }}
          >
            {identityLabel(seekerIdentity)} seeking {identityLabel(personaIdentity)}
          </span>
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

function TranscriptBubble({
  entry,
  index,
}: {
  entry: MatchSlopTranscriptEntry;
  index: number;
}) {
  const isPersona = entry.speaker === "PERSONA";

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
        <div className="flex items-center justify-between gap-3 mb-1">
          <span
            className="font-bold uppercase tracking-wider"
            style={{
              fontSize: "clamp(0.55rem, 0.7vw, 0.7rem)",
              color: isPersona ? "var(--ms-rose)" : "var(--ms-violet)",
            }}
          >
            {isPersona ? entry.authorName ?? "Persona" : entry.authorName ?? "Players"}
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
              color: entry.outcome === "DATE_SEALED" ? "var(--ms-mint)" : "var(--ms-red)",
            }}
            variants={popIn}
            initial="hidden"
            animate="visible"
          >
            {entry.outcome === "DATE_SEALED" ? <HeartIcon size={12} /> : <BrokenHeartIcon size={12} />}
            <span className="font-bold uppercase tracking-wider">
              {entry.outcome === "DATE_SEALED" ? "Date sealed!" : entry.outcome === "UNMATCHED" ? "Unmatched" : "Turn limit"}
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function PhaseStatusCard({
  gameState,
  outcome,
  isHost,
  hostActionBusy,
  endingGame,
  triggerElement,
  postHostAction,
  handleEndGame,
  canEndGame,
}: {
  gameState: GameState;
  outcome: Outcome;
  isHost: boolean;
  hostActionBusy: boolean;
  endingGame: boolean;
  triggerElement: (el: HTMLElement) => void;
  postHostAction: (path: "start" | "next" | "end") => void;
  handleEndGame: () => void;
  canEndGame: boolean;
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
      title: "Craft your best line",
      subtitle: "Everyone's writing their funniest opener on their phones.",
      color: "var(--ms-coral)",
    },
    VOTING: {
      icon: <VoteIcon size={24} />,
      title: "Pick the winner",
      subtitle: "Vote for the line most likely to land. Human votes count double.",
      color: "var(--ms-violet)",
    },
    ROUND_RESULTS: {
      icon: <SparkleIcon size={24} />,
      title: "The verdict is in",
      subtitle: "The winning line has been sent. Let's see the response...",
      color: "var(--ms-coral)",
    },
    FINAL_RESULTS: {
      icon: outcome === "DATE_SEALED"
        ? <HeartIcon size={28} />
        : <BrokenHeartIcon size={28} />,
      title: outcome === "DATE_SEALED"
        ? "It's a match!"
        : outcome === "UNMATCHED"
          ? "Better luck next time"
          : "Time ran out",
      subtitle: outcome === "DATE_SEALED"
        ? "You collectively charmed the persona. Date sealed."
        : outcome === "UNMATCHED"
          ? "The persona wasn't feeling it. Try a different approach?"
          : "The conversation hit the round limit without a clear outcome.",
      color: outcome === "DATE_SEALED" ? "var(--ms-mint)" : "var(--ms-red)",
    },
  }[gameState.status] ?? {
    icon: <HeartIcon size={28} />,
    title: "MatchSlop",
    subtitle: "",
    color: "var(--ms-rose)",
  };

  return (
    <motion.div
      className="rounded-[1.5rem] overflow-hidden"
      style={{
        background: "var(--ms-surface)",
        border: "1px solid var(--ms-edge)",
        boxShadow: "var(--ms-shadow)",
      }}
      variants={slideInRight}
      initial="hidden"
      animate="visible"
    >
      <div className="p-[clamp(1rem,2vw,2rem)]">
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
                Join at <strong style={{ color: "var(--ms-ink)" }}>sloplash.com</strong>
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
              Players are typing their best lines...
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
              Votes are coming in...
            </p>
          </div>
        )}

        {gameState.status === "FINAL_RESULTS" && (
          <div className="mt-2">
            <ScoreBarChart game={gameState} />
          </div>
        )}
      </div>

      {/* Host controls */}
      {isHost && (
        <div
          className="p-[clamp(1rem,2vw,2rem)] pt-0 space-y-2"
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
              disabled={hostActionBusy}
              className="w-full rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--ms-raised)",
                border: "1px solid var(--ms-edge)",
                color: "var(--ms-ink-dim)",
                padding: "clamp(0.75rem, 1.2vw, 1rem)",
                fontSize: "clamp(0.85rem, 1.1vw, 1rem)",
              }}
              {...buttonTap}
            >
              {hostActionBusy ? "Working..." : gameState.status === "ROUND_RESULTS" ? "Next Round" : "Skip Phase"}
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
              className="w-full rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                border: "1px solid var(--ms-red-soft)",
                color: "var(--ms-red)",
                background: "transparent",
                padding: "clamp(0.75rem, 1.2vw, 1rem)",
                fontSize: "clamp(0.85rem, 1.1vw, 1rem)",
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
    </motion.div>
  );
}

/* ─── Outcome Overlay ─── */

function OutcomeOverlay({ outcome }: { outcome: Outcome }) {
  if (outcome === "IN_PROGRESS") return null;

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        {outcome === "DATE_SEALED" && (
          <div className="animate-ms-match-sealed" style={{ color: "var(--ms-mint)" }}>
            <HeartIcon size={120} />
          </div>
        )}
        {outcome === "UNMATCHED" && (
          <div className="animate-ms-unmatch-slam" style={{ color: "var(--ms-red)", opacity: 0.15 }}>
            <BrokenHeartIcon size={120} />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
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
  const hostControlToken = useSyncExternalStore(noopSubscribe, getHostControlToken, () => null);
  const { triggerElement } = usePixelDissolve();
  const playerId = viewMode === "stage" ? null : storedPlayerId;
  const { gameState, error } = useGameStream(code, playerId, hostControlToken, viewMode);
  const [endingGame, setEndingGame] = useState(false);
  const [hostActionBusy, setHostActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewMode !== "stage") return;
    const urlToken = searchParams.get("token");
    if (urlToken) {
      localStorage.setItem("hostControlToken", urlToken);
    }
  }, [searchParams, viewMode]);

  useEffect(() => {
    if (viewMode !== "stage") return;
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
  }, [viewMode]);

  // Auto-scroll transcript
  const modeState = asModeState(gameState?.modeState);
  const transcript = modeState.transcript ?? [];
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  // Set data-game attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-game", "matchslop");
    return () => {
      document.documentElement.removeAttribute("data-game");
    };
  }, []);

  const profile = modeState.profile ?? null;
  const outcome = (modeState.outcome ?? "IN_PROGRESS") as Outcome;
  const personaImage = modeState.personaImage ?? profile?.image ?? null;
  const isHost =
    playerId === gameState?.hostPlayerId ||
    (viewMode === "stage" && !!hostControlToken && gameState?.hostPlayerId == null);
  const canEndGame =
    isHost &&
    (gameState?.status === "WRITING" ||
      gameState?.status === "VOTING" ||
      gameState?.status === "ROUND_RESULTS");

  async function postHostAction(path: "start" | "next" | "end") {
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
        style={{ background: "var(--ms-bg)" }}
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
        style={{ background: "var(--ms-bg)" }}
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
      style={{ background: "var(--ms-bg)" }}
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
          padding: "clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)",
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
            {gameState.status === "LOBBY" ? "Lobby" : gameState.status === "WRITING" ? "Writing" : gameState.status === "VOTING" ? "Voting" : gameState.status === "ROUND_RESULTS" ? "Results" : "Final"}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            Turn {gameState.currentRound}/{gameState.totalRounds}
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
              profile={profile}
              personaImage={personaImage}
              seekerIdentity={modeState.seekerIdentity}
              personaIdentity={modeState.personaIdentity}
              outcome={outcome}
            />

            {/* Vote weight info */}
            <motion.div
              className="flex items-center gap-3 mt-3 rounded-2xl"
              style={{
                background: "var(--ms-surface)",
                border: "1px solid var(--ms-edge)",
                padding: "clamp(0.6rem, 1vw, 0.875rem) clamp(0.75rem, 1.2vw, 1rem)",
              }}
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
            >
              <div
                className="shrink-0 flex items-center justify-center rounded-full font-bold"
                style={{
                  width: "clamp(2rem, 2.5vw, 2.5rem)",
                  height: "clamp(2rem, 2.5vw, 2.5rem)",
                  fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)",
                  background: "var(--ms-rose-soft)",
                  color: "var(--ms-rose)",
                }}
              >
                {modeState.humanVoteWeight ?? 2}x
              </div>
              <p
                style={{
                  fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)",
                  color: "var(--ms-ink-dim)",
                }}
              >
                Human votes count double. AI votes = {modeState.aiVoteWeight ?? 1}x.
              </p>
            </motion.div>
          </div>

          {/* Right: Conversation + Phase Status */}
          <div className="space-y-[clamp(0.75rem,1.5vw,1.5rem)]">
            {/* Phase status card */}
            <PhaseStatusCard
              gameState={gameState}
              outcome={outcome}
              isHost={isHost}
              hostActionBusy={hostActionBusy}
              endingGame={endingGame}
              triggerElement={triggerElement}
              postHostAction={(path) => void postHostAction(path)}
              handleEndGame={() => void handleEndGame()}
              canEndGame={canEndGame}
            />

            {/* Conversation transcript */}
            <motion.div
              className="rounded-[1.5rem] overflow-hidden relative"
              style={{
                background: "var(--ms-surface)",
                border: "1px solid var(--ms-edge)",
                boxShadow: "var(--ms-shadow)",
              }}
              variants={floatIn}
              initial="hidden"
              animate="visible"
            >
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2vw, 1.5rem)",
                  borderBottom: "1px solid var(--ms-edge)",
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

              <div
                className="overflow-y-auto"
                style={{
                  padding: "clamp(0.75rem, 1.5vw, 1.25rem)",
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
                )}
              </div>

              {/* Outcome overlay inside transcript area */}
              {outcome !== "IN_PROGRESS" && (
                <OutcomeOverlay outcome={outcome} />
              )}
            </motion.div>

            {/* Final results link */}
            {gameState.status === "FINAL_RESULTS" && (
              <motion.div variants={fadeInUp} initial="hidden" animate="visible">
                <Link
                  href="/join"
                  className="block text-center rounded-2xl font-display font-semibold transition-all"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                    padding: "clamp(0.75rem, 1.2vw, 1rem)",
                    fontSize: "clamp(0.85rem, 1.1vw, 1rem)",
                  }}
                >
                  Join Another Game
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
