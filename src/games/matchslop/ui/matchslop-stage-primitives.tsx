"use client";

import { motion } from "motion/react";
import { popIn } from "@/lib/animations";
import type { GameState } from "@/lib/types";

/* ─── Local Types ─── */

export type MatchSlopIdentity = "MAN" | "WOMAN" | "NON_BINARY" | "OTHER";

export type MatchSlopPersonaImageState = {
  status?: "NOT_REQUESTED" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
  imageUrl?: string | null;
};

export type MatchSlopProfileGenerationState = {
  status?: "NOT_REQUESTED" | "STREAMING" | "READY" | "FAILED";
  updatedAt?: string;
  generationId?: string | null;
};

export type MatchSlopProfilePrompt = {
  id?: string;
  prompt?: string;
  answer?: string;
};

export type MatchSlopPersonaDetails = {
  job?: string | null;
  school?: string | null;
  height?: string | null;
  languages?: string[];
};

export type MatchSlopProfile = {
  displayName?: string;
  age?: number | null;
  location?: string | null;
  bio?: string | null;
  tagline?: string | null;
  prompts?: MatchSlopProfilePrompt[];
  details?: MatchSlopPersonaDetails | null;
  image?: MatchSlopPersonaImageState | null;
};

export type MatchSlopTranscriptEntry = {
  id?: string;
  speaker?: string;
  text?: string;
  turn?: number;
  outcome?: string | null;
  authorName?: string | null;
  selectedPromptText?: string | null;
  selectedPromptId?: string | null;
};

export type MatchSlopRoundResult = {
  winnerText?: string;
  authorName?: string | null;
  winnerPlayerId?: string;
  weightedVotes?: number;
  rawVotes?: number;
  selectedPromptText?: string | null;
  selectedPromptId?: string | null;
};

export type PostMortemCalloutLocal = {
  playerName?: string;
  verdict?: string;
  favoriteLine?: string | null;
};

export type PostMortemDataLocal = {
  opening?: string;
  playerCallouts?: PostMortemCalloutLocal[];
  favoriteMoment?: string;
  finalThought?: string;
};

export type MatchSlopPostMortemGenerationStateLocal = {
  status?: "NOT_REQUESTED" | "STREAMING" | "READY" | "FAILED";
  updatedAt?: string;
  generationId?: string | null;
};

export type MatchSlopModeState = {
  seekerIdentity?: MatchSlopIdentity | null;
  personaIdentity?: MatchSlopIdentity | null;
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
  mood?: number;
  pendingPersonaReply?: {
    status?: "NOT_REQUESTED" | "GENERATING" | "READY" | "FAILED";
    reply?: string | null;
    outcome?: string | null;
    moodDelta?: number | null;
    generationId?: string | null;
    signalCategory?: string | null;
    sideComment?: string | null;
    nextSignal?: string | null;
  } | null;
  latestSignalCategory?: string | null;
  latestSideComment?: string | null;
  latestNextSignal?: string | null;
  latestMoodDelta?: number | null;
  postMortemGeneration?: MatchSlopPostMortemGenerationStateLocal | null;
  postMortemDraft?: PostMortemDataLocal | null;
  postMortem?: PostMortemDataLocal | null;
};

import {
  MATCHSLOP_MOOD_THRESHOLD_UNMATCH,
  clampMatchSlopMood,
  getMoodLabel,
  type MatchSlopMoodLabel,
} from "../types";
import { DeltaBadge } from "./matchslop-shared-ui";

const MOOD_CONFIG: Record<MatchSlopMoodLabel, { emoji: string }> = {
  done: { emoji: "\u{1F480}" },
  skeptical: { emoji: "\u{1F612}" },
  amused: { emoji: "\u{1F60F}" },
  intrigued: { emoji: "\u{1F60D}" },
  obsessed: { emoji: "\u{1F525}" },
};

/** Cold-to-hot color: blue (0) → cyan → yellow → orange → red (100) */
export function getMoodColor(mood: number): string {
  const t = clampMatchSlopMood(mood) / 100;
  // HSL hue: 220 (blue) → 0 (red)
  const hue = Math.round(220 * (1 - t));
  const sat = Math.round(70 + 20 * Math.abs(t - 0.5) * 2); // boost saturation at extremes
  return `hsl(${hue}, ${sat}%, 55%)`;
}

export function getMoodConfig(mood: number) {
  const label = getMoodLabel(mood);
  const color = getMoodColor(mood);
  return { color, emoji: MOOD_CONFIG[label].emoji };
}

export type Outcome = "IN_PROGRESS" | "DATE_SEALED" | "UNMATCHED" | "TURN_LIMIT" | "COMEBACK";
export const EMPTY_TRANSCRIPT: MatchSlopTranscriptEntry[] = [];

/* ─── Helpers ─── */

export function asModeState(state: GameState["modeState"] | undefined): MatchSlopModeState {
  return (state ?? {}) as MatchSlopModeState;
}

export function getTranscriptSignature(entries: MatchSlopTranscriptEntry[]): string {
  return entries
    .map((entry) =>
      [
        entry.id ?? "",
        entry.speaker ?? "",
        entry.turn ?? "",
        entry.authorName ?? "",
        entry.text ?? "",
        entry.outcome ?? "",
        entry.selectedPromptId ?? "",
        entry.selectedPromptText ?? "",
      ].join("::"),
    )
    .join("|");
}

/* ─── SVG Icons ─── */

export function HeartIcon({ className = "", size = 24 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export function BrokenHeartIcon({
  className = "",
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.53L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zM12.1 18.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5 18.5 5 20 6.5 20 8.5c0 2.89-3.14 5.74-7.9 10.05z" />
    </svg>
  );
}

export function LocationIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function PenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function VoteIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

export function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  );
}

export function CrownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 19h20v2H2v-2zm1.2-5.6L2 5l4.8 4.8L12 2l5.2 7.8L22 5l-1.2 8.4H3.2z" />
    </svg>
  );
}

export function SwipeLeftIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

/* ─── Sub-components ─── */

export function PersonaTypingBubble({ personaName }: { personaName: string }) {
  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.3 }}
    >
      <div
        className="rounded-2xl rounded-bl-md"
        style={{
          background: "var(--ms-bubble-persona)",
          border: "1px solid var(--ms-rose-soft)",
          padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 1.8vw, 1.5rem)",
        }}
      >
        <span
          className="block font-bold uppercase tracking-wider mb-1"
          style={{
            fontSize: "clamp(0.55rem, 0.7vw, 0.7rem)",
            color: "var(--ms-rose)",
          }}
        >
          {personaName}
        </span>
        <div className="flex items-center gap-1.5 py-1 px-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="rounded-full"
              style={{
                width: "clamp(0.4rem, 0.6vw, 0.5rem)",
                height: "clamp(0.4rem, 0.6vw, 0.5rem)",
                background: "var(--ms-ink-dim)",
                animation: `ms-typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
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

export function MoodMeter({ mood, moodDelta }: { mood: number; moodDelta?: number | null }) {
  const normalizedMood = clampMatchSlopMood(mood);
  const label = getMoodLabel(normalizedMood);
  const config = getMoodConfig(normalizedMood);
  const isDanger = normalizedMood <= MATCHSLOP_MOOD_THRESHOLD_UNMATCH;

  return (
    <motion.div
      className="flex items-center gap-3"
      style={{ padding: "clamp(0.6rem, 1vw, 0.8rem) 0" }}
      animate={isDanger ? { x: [0, -2, 2, -1.5, 1.5, -0.5, 0.5, 0] } : { x: 0 }}
      transition={isDanger ? { duration: 0.5, repeat: 3, repeatDelay: 2.5 } : { duration: 0.2 }}
    >
      {/* Label + emoji */}
      <div className="shrink-0 flex items-center gap-1.5">
        <motion.span
          key={label}
          style={{ fontSize: "clamp(0.85rem, 1.1vw, 1rem)" }}
          initial={{ scale: 1.4, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          {config.emoji}
        </motion.span>
        <span
          className="font-display font-bold uppercase tracking-wider"
          style={{
            fontSize: "clamp(0.55rem, 0.7vw, 0.65rem)",
            color: config.color,
          }}
        >
          {label}
        </span>
      </div>

      {/* Bar track */}
      <div className="flex-1 relative">
        <div
          className="w-full rounded-full overflow-hidden relative"
          style={{
            height: "clamp(6px, 0.5vw, 8px)",
            background: "color-mix(in srgb, var(--ms-edge) 50%, transparent)",
          }}
        >
          {/* Critical zone fill (0-20%) */}
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{
              width: `${MATCHSLOP_MOOD_THRESHOLD_UNMATCH}%`,
              background: "color-mix(in srgb, var(--ms-red) 12%, transparent)",
            }}
          />

          {/* Fill */}
          <motion.div
            className="h-full rounded-full relative z-[1]"
            initial={false}
            animate={{
              width: `${Math.max(normalizedMood, 2)}%`,
            }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 22,
              mass: 0.8,
            }}
            style={{
              background: config.color,
              boxShadow: `0 0 6px color-mix(in srgb, ${config.color} 40%, transparent)`,
            }}
          />
        </div>

        {/* Critical zone threshold marker */}
        <div
          className="absolute top-[-2px] bottom-[-2px] pointer-events-none z-[2]"
          style={{
            left: `${MATCHSLOP_MOOD_THRESHOLD_UNMATCH}%`,
            width: "2px",
            background: "var(--ms-red)",
            opacity: normalizedMood > MATCHSLOP_MOOD_THRESHOLD_UNMATCH ? 0.4 : 0.8,
            borderRadius: "1px",
          }}
        />

        {/* Glow pulse overlay — re-mounts on mood value change */}
        <motion.div
          key={normalizedMood}
          className="absolute inset-0 rounded-full pointer-events-none"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{
            boxShadow: `0 0 16px ${config.color}, 0 0 32px color-mix(in srgb, ${config.color} 30%, transparent)`,
          }}
        />
      </div>

      {/* Numeric value + delta badge */}
      <div className="shrink-0 flex items-center gap-1">
        <motion.span
          className="font-mono font-bold tabular-nums"
          style={{
            fontSize: "clamp(0.6rem, 0.8vw, 0.75rem)",
            color: config.color,
            minWidth: "2ch",
            textAlign: "right",
          }}
          key={normalizedMood}
          initial={{ scale: 1.3, opacity: 0.5 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          {normalizedMood}
        </motion.span>

        <DeltaBadge moodDelta={moodDelta} badgeKey={`delta-${moodDelta}-${normalizedMood}`} />
      </div>
    </motion.div>
  );
}
