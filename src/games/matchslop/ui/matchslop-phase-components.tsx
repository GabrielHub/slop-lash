"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Timer } from "@/components/timer";
import { getMatchSlopTimerTotal } from "@/games/matchslop/config/game-config";
import { PulsingDot } from "@/components/pulsing-dot";
import { RoomInviteButton } from "@/components/room-invite-button";
import {
  phaseTransition,
  collapseExpand,
  springDefault,
  buttonTap,
  buttonTapPrimary,
} from "@/lib/animations";
import type { GameState } from "@/lib/types";

/* ─── Local Types ─── */

import {
  BrokenHeartIcon,
  HeartIcon,
  PenIcon,
  SparkleIcon,
  VoteIcon,
  type Outcome,
} from "./matchslop-stage-primitives";
import { CompactScoreboard, CopyRoomCode, FinalScoreChart } from "./matchslop-result-components";
import { ProgressCount, TypingIndicator } from "./matchslop-shared-ui";

export function PhaseStatusCard({
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
  progressCount,
  voteProgressCount,
  sideComment,
  signalCategory,
  moodDelta,
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
  progressCount?: { submitted: number; total: number } | null;
  voteProgressCount?: { voted: number; total: number } | null;
  sideComment?: string | null;
  signalCategory?: string | null;
  moodDelta?: number | null;
}) {
  const [browserHost, setBrowserHost] = useState("");

  useEffect(() => {
    setBrowserHost(window.location.host);
  }, []);

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
        outcome === "DATE_SEALED" ? (
          <HeartIcon size={28} />
        ) : outcome === "COMEBACK" ? (
          <SparkleIcon size={24} />
        ) : (
          <BrokenHeartIcon size={28} />
        ),
      title:
        outcome === "DATE_SEALED"
          ? "It's a match!"
          : outcome === "COMEBACK"
            ? "You saved it"
            : outcome === "UNMATCHED"
              ? "Better luck next time"
              : "Time ran out",
      subtitle:
        outcome === "DATE_SEALED"
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

        {/* Persona signal row — visible during ROUND_RESULTS */}
        <AnimatePresence>
          {gameState.status === "ROUND_RESULTS" &&
            (sideComment || signalCategory || (moodDelta != null && moodDelta !== 0)) && (
              <motion.div
                className="flex items-center gap-2 flex-wrap mb-3"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.2 }}
              >
                {signalCategory && (
                  <span
                    className="font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{
                      fontSize: "clamp(0.45rem, 0.55vw, 0.55rem)",
                      color: "var(--ms-coral)",
                      background: "var(--ms-coral-soft)",
                      border: "1px solid color-mix(in srgb, var(--ms-coral) 25%, transparent)",
                    }}
                  >
                    {signalCategory}
                  </span>
                )}
                {sideComment && (
                  <span
                    className="font-display italic"
                    style={{
                      fontSize: "clamp(0.7rem, 0.85vw, 0.8rem)",
                      color: "var(--ms-ink-dim)",
                    }}
                  >
                    &ldquo;{sideComment}&rdquo;
                  </span>
                )}
                {moodDelta != null && moodDelta !== 0 && (
                  <span
                    className="font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                    style={{
                      fontSize: "clamp(0.5rem, 0.65vw, 0.6rem)",
                      color: moodDelta > 0 ? "var(--ms-mint)" : "var(--ms-red)",
                      background: moodDelta > 0 ? "var(--ms-mint-soft)" : "var(--ms-red-soft)",
                    }}
                  >
                    {moodDelta > 0 ? `+${moodDelta}` : moodDelta}
                  </span>
                )}
              </motion.div>
            )}
        </AnimatePresence>

        {/* Turn-limit warning */}
        {(() => {
          const turnsLeft = gameState.totalRounds - gameState.currentRound;
          const showWarning =
            !isComebackRound &&
            turnsLeft >= 0 &&
            turnsLeft <= 2 &&
            (gameState.status === "WRITING" ||
              gameState.status === "VOTING" ||
              gameState.status === "ROUND_RESULTS");
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

        {/* Timer + progress */}
        <AnimatePresence>
          {(gameState.phaseDeadline || progressCount || voteProgressCount) && (
            <motion.div
              key="timer"
              className="mb-4"
              variants={collapseExpand}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="flex items-center gap-3">
                {gameState.phaseDeadline && (
                  <div className="flex-1">
                    <Timer
                      deadline={gameState.phaseDeadline}
                      serverNow={gameState.serverNow}
                      disabled={gameState.timersDisabled}
                      total={getMatchSlopTimerTotal(gameState.status)}
                    />
                  </div>
                )}
                {gameState.status === "WRITING" && progressCount && (
                  <ProgressCount
                    count={progressCount.submitted}
                    total={progressCount.total}
                    label="submitted"
                  />
                )}
                {gameState.status === "VOTING" && voteProgressCount && (
                  <ProgressCount
                    count={voteProgressCount.voted}
                    total={voteProgressCount.total}
                    label="voted"
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase-specific content */}
        <AnimatePresence mode="wait">
          {gameState.status === "LOBBY" && (
            <motion.div
              key="phase-lobby"
              className="space-y-3"
              variants={phaseTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div
                className="rounded-2xl p-4 text-center"
                style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)" }}
              >
                <CopyRoomCode code={gameState.roomCode} />
                <p
                  className="mt-1"
                  style={{
                    fontSize: "clamp(0.7rem, 0.9vw, 0.85rem)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  Join at <strong style={{ color: "var(--ms-ink)" }}>{browserHost}</strong>
                </p>
                {isHost && (
                  <RoomInviteButton
                    roomCode={gameState.roomCode}
                    tone="match"
                    compact
                    className="mt-3"
                  />
                )}
              </div>
              <div className="text-center">
                <p
                  className="font-medium"
                  style={{
                    fontSize: "clamp(0.75rem, 1vw, 0.95rem)",
                    color: "var(--ms-ink-dim)",
                  }}
                >
                  {gameState.players.length} player{gameState.players.length !== 1 ? "s" : ""}{" "}
                  connected
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
            </motion.div>
          )}

          {gameState.status === "WRITING" && (
            <motion.div
              key="phase-writing"
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)" }}
              variants={phaseTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <TypingIndicator />
              <p style={{ fontSize: "clamp(0.8rem, 1vw, 1rem)", color: "var(--ms-ink-dim)" }}>
                {isComebackRound
                  ? "Players are firing off one last save..."
                  : "Players are typing their best lines..."}
              </p>
            </motion.div>
          )}

          {gameState.status === "VOTING" && (
            <motion.div
              key="phase-voting"
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{ background: "var(--ms-raised)", border: "1px solid var(--ms-edge)" }}
              variants={phaseTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
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
            </motion.div>
          )}

          {gameState.status === "ROUND_RESULTS" && (
            <motion.div
              key="phase-round-results"
              variants={phaseTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <CompactScoreboard game={gameState} isFinal={false} />
            </motion.div>
          )}
          {gameState.status === "FINAL_RESULTS" && (
            <motion.div
              key="phase-final-results"
              variants={phaseTransition}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <FinalScoreChart game={gameState} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Host controls */}
      <AnimatePresence>
        {isHost && (
          <motion.div
            key="host-controls"
            className={`p-[clamp(1rem,2vw,2rem)] pt-0 ${isCompact ? "flex gap-2" : "space-y-2"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springDefault}
          >
            {gameState.status === "LOBBY" && (
              <motion.button
                type="button"
                onClick={(e) => {
                  triggerElement(e.currentTarget);
                  postHostAction("start");
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
            {(gameState.status === "WRITING" ||
              gameState.status === "VOTING" ||
              gameState.status === "ROUND_RESULTS") && (
              <motion.button
                type="button"
                onClick={(e) => {
                  triggerElement(e.currentTarget);
                  postHostAction("next");
                }}
                disabled={hostActionBusy || !canAdvancePhase}
                className={`${isCompact ? "flex-1" : "w-full"} rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{
                  background: "var(--ms-raised)",
                  border: "1px solid var(--ms-edge)",
                  color: "var(--ms-ink-dim)",
                  padding: isCompact
                    ? "clamp(0.5rem, 0.8vw, 0.65rem) clamp(0.75rem, 1vw, 1rem)"
                    : "clamp(0.75rem, 1.2vw, 1rem)",
                  fontSize: isCompact
                    ? "clamp(0.75rem, 0.9vw, 0.85rem)"
                    : "clamp(0.85rem, 1.1vw, 1rem)",
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
                  handleEndGame();
                }}
                disabled={endingGame}
                className={`${isCompact ? "" : "w-full"} rounded-2xl font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{
                  border: "1px solid var(--ms-red-soft)",
                  color: "var(--ms-red)",
                  background: "transparent",
                  padding: isCompact
                    ? "clamp(0.5rem, 0.8vw, 0.65rem) clamp(0.75rem, 1vw, 1rem)"
                    : "clamp(0.75rem, 1.2vw, 1rem)",
                  fontSize: isCompact
                    ? "clamp(0.75rem, 0.9vw, 0.85rem)"
                    : "clamp(0.85rem, 1.1vw, 1rem)",
                }}
                {...buttonTap}
              >
                {endingGame ? "Ending..." : "End Game"}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isHost && gameState.status === "LOBBY" && (
          <motion.div
            key="non-host-lobby"
            className="p-[clamp(1rem,2vw,2rem)] pt-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <PulsingDot>Waiting for the game to start...</PulsingDot>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Outcome Verdict ─── */

export function OutcomeVerdict({ outcome }: { outcome: Outcome }) {
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
