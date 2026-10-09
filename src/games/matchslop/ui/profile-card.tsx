"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { collapseExpand, fadeInUp, slideInLeft, staggerContainerSlow } from "@/lib/animations";
import {
  HeartIcon,
  LocationIcon,
  MoodMeter,
  OutcomeBadge,
  personaName,
  type Outcome,
  type Persona,
} from "./primitives";

function portraitCaption(persona: Persona): string {
  if (persona.portraitPending) return "Generating portrait...";
  if (!persona.profile) return "Building persona first...";
  return "Mysterious type. No photos.";
}

/**
 * The persona's dating profile: portrait, name, mood, bio and prompt cards.
 * `mood` is null before the chat starts, which hides the meter.
 */
export function ProfileCard({
  persona,
  outcome,
  mood,
  moodDelta = null,
  compact = false,
}: {
  persona: Persona;
  outcome: Outcome;
  mood: number | null;
  moodDelta?: number | null;
  compact?: boolean;
}) {
  const { profile, portraitUrl } = persona;
  const details = profile?.details;
  const chips = [
    details?.job,
    details?.school,
    details?.height,
    details?.languages.length ? details.languages.join(", ") : null,
  ].filter((chip): chip is string => Boolean(chip));
  const pad = "p-[clamp(1rem,2vw,2rem)]";

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
      <div className="relative" style={{ aspectRatio: compact ? "6/5" : "4/3" }}>
        {portraitUrl ? (
          <Image
            src={portraitUrl}
            alt={personaName(persona)}
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
              <div className="animate-ms-heartbeat" style={{ color: "var(--ms-rose)" }}>
                <HeartIcon size={48} />
              </div>
              <p className="text-sm font-medium mt-3" style={{ color: "var(--ms-ink-dim)" }}>
                {portraitCaption(persona)}
              </p>
            </div>
          </div>
        )}

        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: "linear-gradient(to top, var(--ms-surface), transparent)" }}
        />

        <div className={`absolute inset-x-0 bottom-0 ${pad}`}>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="font-display font-bold leading-tight"
                style={{
                  fontSize: compact
                    ? "clamp(1.5rem, 2.25vw, 2.6rem)"
                    : "clamp(1.75rem, 3vw, 3.5rem)",
                  color: "var(--ms-ink)",
                }}
              >
                {profile?.displayName ?? "Building persona"}
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
                  {profile.age != null && <span>{profile.age}</span>}
                  {profile.age != null && profile.location && (
                    <span style={{ color: "var(--ms-edge-strong)" }}>·</span>
                  )}
                  {profile.location && (
                    <span className="inline-flex items-center gap-1">
                      <LocationIcon size={14} />
                      {profile.location}
                    </span>
                  )}
                </div>
              )}
            </div>
            <OutcomeBadge outcome={outcome} />
          </div>
        </div>
      </div>

      {mood !== null && outcome === "IN_PROGRESS" && (
        <motion.div
          className="px-[clamp(1rem,2vw,2rem)]"
          style={{ borderTop: "1px solid var(--ms-edge)" }}
          variants={collapseExpand}
          initial="hidden"
          animate="visible"
        >
          <MoodMeter mood={mood} delta={moodDelta} />
        </motion.div>
      )}

      {profile && (
        <div className={pad} style={{ borderTop: "1px solid var(--ms-edge)" }}>
          {profile.tagline && (
            <p
              className="font-display font-semibold italic mb-3"
              style={{
                fontSize: compact ? "clamp(0.85rem, 1vw, 1.05rem)" : "clamp(0.9rem, 1.3vw, 1.4rem)",
                color: "var(--ms-rose)",
              }}
            >
              &ldquo;{profile.tagline}&rdquo;
            </p>
          )}
          <p
            className={`leading-relaxed ${compact ? "line-clamp-4" : ""}`}
            style={{
              fontSize: compact ? "clamp(0.8rem, 0.9vw, 0.98rem)" : "clamp(0.85rem, 1.1vw, 1.2rem)",
              color: "var(--ms-ink)",
            }}
          >
            {profile.bio}
          </p>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="px-3 py-1 rounded-full"
                  style={{
                    fontSize: "clamp(0.65rem, 0.75vw, 0.75rem)",
                    background: "var(--ms-raised)",
                    border: "1px solid var(--ms-edge)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {profile && profile.prompts.length > 0 && (
        <motion.div
          className={`${pad} pt-0 ${compact ? "space-y-2" : "space-y-3"}`}
          variants={staggerContainerSlow}
          initial="hidden"
          animate="visible"
        >
          {profile.prompts.slice(0, 3).map((prompt) => (
            <motion.div
              key={prompt.id}
              className="rounded-2xl ms-profile-shimmer"
              style={{
                padding: compact ? "clamp(0.65rem, 1vw, 1rem)" : "clamp(0.75rem, 1.5vw, 1.5rem)",
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
                {prompt.prompt}
              </p>
              <p
                className={`mt-1 leading-relaxed ${compact ? "line-clamp-3" : ""}`}
                style={{
                  fontSize: compact
                    ? "clamp(0.8rem, 0.92vw, 0.95rem)"
                    : "clamp(0.8rem, 1.1vw, 1.15rem)",
                  color: "var(--ms-ink)",
                }}
              >
                {prompt.answer}
              </p>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
