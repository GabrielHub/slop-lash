"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { PlayerAvatar } from "@/components/player-avatar";
import { fadeInUp, springDefault, springGentle, staggerContainerSlow } from "@/lib/animations";
import type { GameState } from "@/lib/types";

/* ─── Local Types ─── */

import {
  CrownIcon,
  HeartIcon,
  SparkleIcon,
  type PostMortemDataLocal,
} from "./matchslop-stage-primitives";
import { TypingIndicator } from "./matchslop-shared-ui";

export function CompactScoreboard({ game, isFinal }: { game: GameState; isFinal: boolean }) {
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
                padding:
                  "clamp(0.2rem, 0.4vw, 0.3rem) clamp(0.5rem, 0.8vw, 0.7rem) clamp(0.2rem, 0.4vw, 0.3rem) clamp(0.25rem, 0.4vw, 0.3rem)",
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
              {isLeader && <CrownIcon size={10} />}
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

/* ─── Post-Mortem Panel ─── */

export function PersonaPostMortemPanel({
  postMortem,
  postMortemDraft,
  postMortemStatus,
  personaName,
}: {
  postMortem: PostMortemDataLocal | null;
  postMortemDraft: PostMortemDataLocal | null;
  postMortemStatus: string;
  personaName: string;
}) {
  const data = postMortem ?? postMortemDraft;
  const isStreaming = postMortemStatus === "STREAMING";
  const isWaiting = postMortemStatus === "NOT_REQUESTED" || (isStreaming && !data);

  if (postMortemStatus === "FAILED") {
    return (
      <motion.div
        className="rounded-2xl p-[clamp(1rem,2vw,1.5rem)]"
        style={{
          background: "var(--ms-surface)",
          border: "1px solid var(--ms-edge)",
        }}
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <p
          className="text-center"
          style={{
            fontSize: "clamp(0.8rem, 1vw, 0.95rem)",
            color: "var(--ms-ink-dim)",
          }}
        >
          {personaName} had nothing to say.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="rounded-[1.5rem] overflow-hidden"
      style={{
        background: "var(--ms-surface)",
        border: "1px solid var(--ms-edge)",
        boxShadow: "var(--ms-shadow)",
      }}
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: "clamp(1rem,2vw,1.5rem)",
          borderBottom: data ? "1px solid var(--ms-edge)" : "none",
        }}
      >
        <div
          className="shrink-0 flex items-center justify-center rounded-lg"
          style={{
            width: "clamp(1.5rem, 2vw, 2rem)",
            height: "clamp(1.5rem, 2vw, 2rem)",
            background: "var(--ms-rose-soft)",
            color: "var(--ms-rose)",
          }}
        >
          <HeartIcon size={14} />
        </div>
        <h3
          className="font-display font-bold"
          style={{
            fontSize: "clamp(0.85rem, 1.2vw, 1.15rem)",
            color: "var(--ms-ink)",
          }}
        >
          {personaName}&apos;s take
        </h3>
        {isStreaming && (
          <span
            className="font-mono uppercase tracking-wider"
            style={{
              fontSize: "clamp(0.5rem, 0.65vw, 0.6rem)",
              color: "var(--ms-ink-dim)",
            }}
          >
            typing...
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "clamp(1rem,2vw,1.5rem)" }}>
        {isWaiting ? (
          <div className="flex items-center justify-center py-4">
            <TypingIndicator />
          </div>
        ) : data ? (
          <motion.div
            className="space-y-[clamp(1rem,1.5vw,1.5rem)]"
            variants={staggerContainerSlow}
            initial="hidden"
            animate="visible"
          >
            {/* Opening quote */}
            {data.opening && (
              <motion.div variants={fadeInUp}>
                <p
                  className="font-display leading-relaxed"
                  style={{
                    fontSize: "clamp(1rem, 1.4vw, 1.35rem)",
                    color: "var(--ms-ink)",
                    fontStyle: "italic",
                  }}
                >
                  &ldquo;{data.opening}&rdquo;
                </p>
                <p
                  className="font-bold uppercase tracking-wider mt-2"
                  style={{
                    fontSize: "clamp(0.55rem, 0.7vw, 0.7rem)",
                    color: "var(--ms-rose)",
                  }}
                >
                  &mdash; {personaName}
                </p>
              </motion.div>
            )}

            {/* Player callouts */}
            {data.playerCallouts && data.playerCallouts.length > 0 && (
              <motion.div className="space-y-2" variants={fadeInUp}>
                {data.playerCallouts.map((callout, i) => (
                  <motion.div
                    key={callout.playerName ?? i}
                    className="rounded-xl"
                    style={{
                      background: "var(--ms-raised)",
                      border: "1px solid var(--ms-edge)",
                      padding: "clamp(0.75rem, 1.2vw, 1rem) clamp(1rem, 1.5vw, 1.25rem)",
                    }}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...springDefault, delay: i * 0.08 }}
                  >
                    {callout.playerName && (
                      <span
                        className="font-display font-bold"
                        style={{
                          fontSize: "clamp(0.75rem, 0.95vw, 0.95rem)",
                          color: "var(--ms-violet)",
                        }}
                      >
                        {callout.playerName}
                      </span>
                    )}
                    {callout.verdict && (
                      <p
                        className="leading-relaxed mt-0.5"
                        style={{
                          fontSize: "clamp(0.8rem, 1vw, 1rem)",
                          color: "var(--ms-ink)",
                        }}
                      >
                        {callout.verdict}
                      </p>
                    )}
                    {callout.favoriteLine && (
                      <p
                        className="mt-1.5 pl-3 leading-relaxed"
                        style={{
                          fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)",
                          color: "var(--ms-ink-dim)",
                          borderLeft: "2px solid var(--ms-violet)",
                          fontStyle: "italic",
                        }}
                      >
                        &ldquo;{callout.favoriteLine}&rdquo;
                      </p>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}

            {/* Favorite moment */}
            {data.favoriteMoment && (
              <motion.div className="flex items-start gap-2.5" variants={fadeInUp}>
                <span className="shrink-0 mt-0.5" style={{ color: "var(--ms-coral)" }}>
                  <SparkleIcon size={14} />
                </span>
                <div>
                  <span
                    className="font-bold uppercase tracking-wider"
                    style={{
                      fontSize: "clamp(0.55rem, 0.7vw, 0.65rem)",
                      color: "var(--ms-coral)",
                    }}
                  >
                    Standout moment
                  </span>
                  <p
                    className="leading-relaxed mt-0.5"
                    style={{
                      fontSize: "clamp(0.85rem, 1.1vw, 1.05rem)",
                      color: "var(--ms-ink)",
                    }}
                  >
                    {data.favoriteMoment}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Final thought */}
            {data.finalThought && (
              <motion.div
                className="pt-2"
                style={{
                  borderTop: "1px solid var(--ms-edge)",
                }}
                variants={fadeInUp}
              >
                <p
                  className="leading-relaxed"
                  style={{
                    fontSize: "clamp(0.85rem, 1.1vw, 1.05rem)",
                    color: "var(--ms-ink-dim)",
                    fontStyle: "italic",
                  }}
                >
                  {data.finalThought}
                </p>
              </motion.div>
            )}

            {/* Streaming cursor */}
            {isStreaming && <TypingIndicator />}
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function FinalScoreChart({ game }: { game: GameState }) {
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
                        textShadow: "0 0 10px color-mix(in srgb, var(--gold) 40%, transparent)",
                      }
                    : {}),
                }}
              >
                {idx + 1}
              </span>

              {/* Avatar */}
              <PlayerAvatar name={player.name} modelId={player.modelId} size={28} />

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
                  background: "color-mix(in srgb, var(--ms-edge) 40%, transparent)",
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

export function CopyRoomCode({ code }: { code: string }) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, [code]);

  const handleCopy = useCallback(async () => {
    if (resetTimerRef.current != null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }

    resetTimerRef.current = window.setTimeout(() => {
      setCopyState("idle");
      resetTimerRef.current = null;
    }, 1500);
  }, [code]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="font-mono font-black tracking-[0.3em] cursor-pointer transition-opacity hover:opacity-80 active:opacity-60"
      style={{
        fontSize: "clamp(2rem, 4vw, 4rem)",
        color:
          copyState === "success"
            ? "var(--ms-coral)"
            : copyState === "error"
              ? "var(--ms-red)"
              : "var(--ms-rose)",
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        display: "block",
        width: "100%",
      }}
      title={copyState === "error" ? "Clipboard unavailable" : "Click to copy room code"}
    >
      {copyState === "success" ? "Copied!" : copyState === "error" ? "Copy failed" : code}
    </button>
  );
}
