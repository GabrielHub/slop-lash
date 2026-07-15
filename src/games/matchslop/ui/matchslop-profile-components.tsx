"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import {
  fadeInUp,
  popIn,
  collapseExpand,
  slideInLeft,
  staggerContainerSlow,
} from "@/lib/animations";
import type { GameState } from "@/lib/types";

/* ─── Local Types ─── */

import {
  BrokenHeartIcon,
  CrownIcon,
  HeartIcon,
  LocationIcon,
  MoodMeter,
  OutcomeBadge,
  SparkleIcon,
  type MatchSlopPersonaImageState,
  type MatchSlopProfile,
  type MatchSlopProfileGenerationState,
  type MatchSlopRoundResult,
  type MatchSlopTranscriptEntry,
  type Outcome,
} from "./matchslop-stage-primitives";

export function ProfileCard({
  profile,
  personaImage,
  profileGeneration,
  outcome,
  mood,
  moodDelta,
  gameStarted,
  compact = false,
}: {
  profile: MatchSlopProfile | null;
  personaImage: MatchSlopPersonaImageState | null;
  profileGeneration: MatchSlopProfileGenerationState | null;
  outcome: Outcome;
  mood: number;
  moodDelta?: number | null;
  gameStarted: boolean;
  compact?: boolean;
}) {
  const imageStatus = personaImage?.status ?? "NOT_REQUESTED";
  const isProfileStreaming =
    profileGeneration?.status === "STREAMING" ||
    (profileGeneration?.status !== "FAILED" && !profile?.displayName);
  const displayName =
    profile?.displayName ?? (isProfileStreaming ? "Building persona" : "AI Persona");

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
      <div className="relative" style={{ aspectRatio: compact ? "6/5" : "4/3" }}>
        {imageStatus === "READY" && personaImage?.imageUrl ? (
          <Image
            src={personaImage.imageUrl}
            alt={profile?.displayName ?? "Persona"}
            fill
            unoptimized
            sizes={compact ? "320px" : "640px"}
            className="object-cover object-center"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, var(--ms-rose-soft), var(--ms-violet-soft), var(--ms-coral-soft))",
            }}
          >
            <div className="flex flex-col items-center text-center">
              <motion.div className="animate-ms-heartbeat" style={{ color: "var(--ms-rose)" }}>
                <HeartIcon size={48} />
              </motion.div>
              <p className="text-sm font-medium mt-3" style={{ color: "var(--ms-ink-dim)" }}>
                {imageStatus === "PENDING" || imageStatus === "PROCESSING"
                  ? "Generating portrait..."
                  : isProfileStreaming
                    ? "Building persona first..."
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
                  fontSize: compact
                    ? "clamp(1.5rem, 2.25vw, 2.6rem)"
                    : "clamp(1.75rem, 3vw, 3.5rem)",
                  color: "var(--ms-ink)",
                }}
              >
                {displayName}
              </h1>
              {(profile?.age != null || profile?.location) && (
                <div
                  className="flex items-center gap-2 mt-1"
                  style={{
                    fontSize: compact
                      ? "clamp(0.75rem, 0.95vw, 1rem)"
                      : "clamp(0.8rem, 1.2vw, 1.25rem)",
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

      {/* Mood Meter — only after game starts */}
      <AnimatePresence>
        {outcome === "IN_PROGRESS" && gameStarted && (
          <motion.div
            key="mood-meter"
            style={{
              padding: "0 clamp(1rem, 2vw, 2rem)",
              borderTop: "1px solid var(--ms-edge)",
            }}
            variants={collapseExpand}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <MoodMeter mood={mood} moodDelta={moodDelta} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bio + Tagline — only show when there's actual content */}
      <AnimatePresence>
        {(profile?.tagline || profile?.bio || profile?.details) && (
          <motion.div
            key="bio-section"
            className="p-[clamp(1rem,2vw,2rem)]"
            style={{ borderTop: "1px solid var(--ms-edge)" }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {profile?.tagline && (
              <p
                className="font-display font-semibold italic mb-3"
                style={{
                  fontSize: compact
                    ? "clamp(0.85rem, 1vw, 1.05rem)"
                    : "clamp(0.9rem, 1.3vw, 1.4rem)",
                  color: "var(--ms-rose)",
                }}
              >
                &ldquo;{profile.tagline}&rdquo;
              </p>
            )}
            {profile?.bio && (
              <p
                className="leading-relaxed"
                style={{
                  fontSize: compact
                    ? "clamp(0.8rem, 0.9vw, 0.98rem)"
                    : "clamp(0.85rem, 1.1vw, 1.2rem)",
                  color: "var(--ms-ink)",
                  display: compact ? "-webkit-box" : undefined,
                  WebkitBoxOrient: compact ? "vertical" : undefined,
                  WebkitLineClamp: compact ? 4 : undefined,
                  overflow: compact ? "hidden" : undefined,
                }}
              >
                {profile.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {profile?.details?.job && (
                <span
                  className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {profile.details.job}
                </span>
              )}
              {profile?.details?.school && (
                <span
                  className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {profile.details.school}
                </span>
              )}
              {profile?.details?.height && (
                <span
                  className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {profile.details.height}
                </span>
              )}
              {profile?.details?.languages && profile.details.languages.length > 0 && (
                <span
                  className="text-[clamp(0.55rem,0.75vw,0.7rem)] px-3 py-1 rounded-full"
                  style={{
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {profile.details.languages.join(", ")}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt cards */}
      <AnimatePresence>
        {profile?.prompts && profile.prompts.length > 0 && (
          <motion.div
            key="prompt-cards"
            className="p-[clamp(1rem,2vw,2rem)] pt-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className={compact ? "space-y-2" : "space-y-3"}
              variants={staggerContainerSlow}
              initial="hidden"
              animate="visible"
            >
              {profile.prompts.slice(0, 3).map((prompt, i) => (
                <motion.div
                  key={prompt.id ?? `prompt-${i}`}
                  className="rounded-2xl ms-profile-shimmer"
                  style={{
                    padding: compact
                      ? "clamp(0.65rem, 1vw, 1rem)"
                      : "clamp(0.75rem, 1.5vw, 1.5rem)",
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                  }}
                  variants={fadeInUp}
                >
                  <p
                    className="font-display font-semibold"
                    style={{
                      fontSize: compact
                        ? "clamp(0.72rem, 0.85vw, 0.9rem)"
                        : "clamp(0.75rem, 1vw, 1rem)",
                      color: "var(--ms-rose)",
                    }}
                  >
                    {prompt.prompt ?? "Prompt"}
                  </p>
                  {prompt.answer && (
                    <p
                      className="mt-1 leading-relaxed"
                      style={{
                        fontSize: compact
                          ? "clamp(0.8rem, 0.92vw, 0.95rem)"
                          : "clamp(0.8rem, 1.1vw, 1.15rem)",
                        color: "var(--ms-ink)",
                        display: compact ? "-webkit-box" : undefined,
                        WebkitBoxOrient: compact ? "vertical" : undefined,
                        WebkitLineClamp: compact ? 3 : undefined,
                        overflow: compact ? "hidden" : undefined,
                      }}
                    >
                      {prompt.answer}
                    </p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PromptContextBanner({ promptText, isPhoto }: { promptText: string; isPhoto: boolean }) {
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

export function TranscriptBubble({
  entry,
  index,
}: {
  entry: MatchSlopTranscriptEntry;
  index: number;
}) {
  const isPersona = entry.speaker === "PERSONA";
  const displayName = isPersona ? (entry.authorName ?? "Persona") : (entry.authorName ?? "Players");

  const isFirstPlayerMessage = !isPersona && entry.turn === 1 && entry.selectedPromptText;
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
          <PromptContextBanner promptText={entry.selectedPromptText!} isPhoto={isPhotoPrompt} />
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

export function EmptyConversationState({
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
      <div className="py-[clamp(1.5rem,3vw,3rem)]" style={{ color: "var(--ms-ink-dim)" }}>
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
                boxShadow:
                  "0 0 24px color-mix(in srgb, var(--gold) 15%, transparent), 0 2px 12px color-mix(in srgb, var(--gold) 8%, transparent) inset",
              }}
            >
              {/* Gold accent bar at top */}
              <div
                style={{
                  height: 3,
                  background:
                    "linear-gradient(90deg, transparent 0%, var(--gold) 30%, var(--gold) 70%, transparent 100%)",
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
                      {lastRoundResult.weightedVotes} vote
                      {lastRoundResult.weightedVotes !== 1 ? "s" : ""}
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
            <p className="mt-1" style={{ fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)", opacity: 0.7 }}>
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
    <div className="text-center py-[clamp(2rem,4vw,4rem)]" style={{ color: "var(--ms-ink-dim)" }}>
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
      <p className="mt-1" style={{ fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)", opacity: 0.7 }}>
        Players will write openers to impress the persona.
      </p>
    </div>
  );
}
