"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameState, GamePrompt, GamePlayer, filterCastVotes, filterAbstainVotes } from "@/lib/types";
import { VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS } from "@/lib/game-constants";
import { Timer } from "@/components/timer";
import { ErrorBanner } from "@/components/error-banner";
import {
  fadeInUp,
  scaleIn,
  springDefault,
  springBouncy,
  springGentle,
  buttonTap,
} from "@/lib/animations";
import { playSound } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { useTts } from "@/hooks/use-tts";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { getPlayerColor } from "@/lib/player-colors";

function getVotingSkipText(skipping: boolean, revealing: boolean, timersDisabled: boolean): string {
  if (skipping) return "Skipping...";
  if (revealing) return "Next";
  if (timersDisabled) return "End Voting";
  return "Skip Timer";
}

/** Animated equalizer bars shown next to a prompt while TTS is playing. */
function TtsIndicator({ mirror = false }: { mirror?: boolean }) {
  const bars = [
    { height: "h-3", delay: "" },
    { height: "h-4", delay: "[animation-delay:150ms]" },
    { height: "h-2.5", delay: "[animation-delay:300ms]" },
  ];
  const ordered = mirror ? [...bars].reverse() : bars;
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      {ordered.map((bar, i) => (
        <span
          key={i}
          className={`w-0.5 ${bar.height} bg-gold rounded-full animate-pulse ${bar.delay}`}
        />
      ))}
    </span>
  );
}

function progressDotClass(index: number, current: number, revealing: boolean): string {
  if (index < current) return "bg-teal w-1.5 h-1.5";
  if (index > current) return "bg-edge-strong w-1.5 h-1.5";
  // index === current
  return revealing ? "bg-gold w-2.5 h-2.5" : "bg-punch w-2.5 h-2.5";
}

/** Progress dots showing which prompt we're on. */
function ProgressDots({
  total,
  current,
  revealing,
}: {
  total: number;
  current: number;
  revealing: boolean;
}) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          className={`rounded-full transition-colors duration-300 ${progressDotClass(i, current, revealing)}`}
          animate={
            i === current
              ? { scale: [1, 1.2, 1] }
              : {}
          }
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function Voting({
  game,
  playerId,
  code,
  isHost,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
  isHost: boolean;
}) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");

  const currentRound = game.rounds[0];

  // Compute votable prompts sorted by id (matching server ordering)
  const votablePrompts = useMemo(() => {
    if (!currentRound) return [];
    return [...currentRound.prompts]
      .filter((p) => p.responses.length >= 2)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [currentRound]);

  const currentPrompt = votablePrompts[game.votingPromptIndex] ?? null;
  const isRevealing = game.votingRevealing;
  const totalPrompts = votablePrompts.length;

  // Check if this player is a respondent for the current prompt
  const isRespondent = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return currentPrompt.responses.some((r) => r.playerId === playerId);
  }, [currentPrompt, playerId]);

  // Check if this player already voted on the current prompt
  const hasVotedCurrent = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return (
      voted.has(currentPrompt.id) ||
      currentPrompt.votes.some((v) => v.voterId === playerId)
    );
  }, [currentPrompt, playerId, voted]);

  // TTS: play when votingPromptIndex changes (not during reveal)
  const { playPromptTts, currentPromptId } = useTts({
    code,
    ttsMode: game.ttsMode,
    prompts: votablePrompts,
  });

  const prevIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (isRevealing) return;
    if (game.votingPromptIndex === prevIndexRef.current) return;
    prevIndexRef.current = game.votingPromptIndex;

    if (currentPrompt && game.ttsMode !== "OFF") {
      playPromptTts(currentPrompt.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.votingPromptIndex, isRevealing]);

  async function castVote(promptId: string, responseId: string) {
    if (!playerId) return;
    setVoting(true);
    setError("");

    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: playerId, promptId, responseId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to vote");
        return;
      }

      playSound("vote-cast");
      setVoted((prev) => new Set(prev).add(promptId));
    } catch {
      setError("Something went wrong");
    } finally {
      setVoting(false);
    }
  }

  async function skipTimer() {
    setSkipping(true);
    setError("");
    try {
      const res = await fetch(`/api/games/${code}/next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to skip");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSkipping(false);
    }
  }

  const player = game.players.find((p) => p.id === playerId);
  const isAI = player?.type === "AI";

  // Spectator / AI view — gets the full host display
  if (isAI || !playerId) {
    return (
      <HostDisplay
        game={game}
        currentPrompt={currentPrompt}
        isRevealing={isRevealing}
        totalPrompts={totalPrompts}
        currentPromptId={currentPromptId}
      />
    );
  }

  return (
    <main className="min-h-svh flex flex-col items-center px-4 sm:px-6 py-8 pt-16 sm:pt-20">
      <motion.div
        className="w-full max-w-lg lg:max-w-5xl"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        {/* Progress + timer row — compact on mobile */}
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="flex-1 min-w-0">
            {!game.timersDisabled && (
              <Timer
                deadline={game.phaseDeadline}
                total={isRevealing ? REVEAL_SECONDS : VOTE_PER_PROMPT_SECONDS}
              />
            )}
          </div>
          {isHost && (
            <motion.button
              onClick={skipTimer}
              disabled={skipping}
              className="shrink-0 px-4 py-2 text-xs sm:text-sm font-medium text-ink-dim hover:text-ink bg-raised/80 backdrop-blur-sm hover:bg-surface border border-edge rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              {...buttonTap}
            >
              {getVotingSkipText(skipping, isRevealing, game.timersDisabled)}
            </motion.button>
          )}
        </div>

        {/* Progress dots */}
        <div className="mb-5 sm:mb-8">
          <ProgressDots
            total={totalPrompts}
            current={game.votingPromptIndex}
            revealing={isRevealing}
          />
        </div>

        {/* Main content */}
        <AnimatePresence mode="wait">
          {currentPrompt ? (
            <motion.div
              key={`${game.votingPromptIndex}-${isRevealing}`}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.97, transition: { duration: 0.2 } }}
              transition={springDefault}
            >
              {/* Prompt text — big and centered */}
              <div className="text-center mb-6 sm:mb-8">
                <p className="font-display font-bold text-lg sm:text-2xl lg:text-3xl text-gold leading-snug inline-flex items-center justify-center gap-2 flex-wrap">
                  {currentPromptId === currentPrompt.id && <TtsIndicator />}
                  <span>{currentPrompt.text}</span>
                  {currentPromptId === currentPrompt.id && (
                    <TtsIndicator mirror />
                  )}
                </p>
              </div>

              {isRevealing ? (
                <RevealView
                  prompt={currentPrompt}
                  players={game.players}
                />
              ) : isRespondent ? (
                <>
                  {isHost && <HostVotingView prompt={currentPrompt} />}
                  <PassiveView
                    label="You wrote one of these!"
                    sublabel="Waiting for others to vote..."
                    color="gold"
                  />
                </>
              ) : hasVotedCurrent ? (
                <>
                  {isHost && <HostVotingView prompt={currentPrompt} />}
                  <PassiveView
                    label="Vote locked in!"
                    sublabel="Waiting for others..."
                    color="teal"
                  />
                </>
              ) : (
                <VoteView
                  prompt={currentPrompt}
                  voting={voting}
                  onVote={castVote}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-edge border-t-teal animate-spin" />
              <p className="text-ink-dim text-sm">Processing results...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <ErrorBanner error={error} className="mt-4" />
      </motion.div>
    </main>
  );
}

/**
 * Host/TV display — the theatrical "stage" view shown on the shared screen.
 * Large prompt text, dramatic reveals, designed to be readable from across the room.
 */
function HostDisplay({
  game,
  currentPrompt,
  isRevealing,
  totalPrompts,
  currentPromptId,
}: {
  game: GameState;
  currentPrompt: GamePrompt | null;
  isRevealing: boolean;
  totalPrompts: number;
  currentPromptId: string | null;
}) {
  return (
    <main className="min-h-svh flex flex-col items-center justify-center px-6 sm:px-10 lg:px-16 py-12 pt-20">
      <div className="w-full max-w-4xl">
        {/* Phase label */}
        <motion.div
          className="text-center mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springDefault}
        >
          <span className={`inline-block px-4 py-1 rounded-full text-xs font-bold uppercase tracking-[0.2em] ${
            isRevealing
              ? "bg-gold/20 text-gold border border-gold/40"
              : "bg-punch/20 text-punch border border-punch/40"
          }`}>
            {isRevealing ? "Results" : "Vote Now"}
          </span>
        </motion.div>

        {/* Timer — slim */}
        {!game.timersDisabled && (
          <div className="max-w-md mx-auto mb-8">
            <Timer
              deadline={game.phaseDeadline}
              total={isRevealing ? REVEAL_SECONDS : VOTE_PER_PROMPT_SECONDS}
            />
          </div>
        )}

        {/* Progress dots */}
        <div className="mb-8">
          <ProgressDots
            total={totalPrompts}
            current={game.votingPromptIndex}
            revealing={isRevealing}
          />
        </div>

        <AnimatePresence mode="wait">
          {currentPrompt ? (
            <motion.div
              key={`host-${game.votingPromptIndex}-${isRevealing}`}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95, transition: { duration: 0.25 } }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            >
              {/* The prompt — BIG */}
              <div className="text-center mb-10">
                <p className="font-display font-extrabold text-2xl sm:text-4xl lg:text-5xl text-gold leading-tight inline-flex items-center justify-center gap-3 flex-wrap">
                  {currentPromptId === currentPrompt.id && <TtsIndicator />}
                  <span>{currentPrompt.text}</span>
                  {currentPromptId === currentPrompt.id && <TtsIndicator mirror />}
                </p>
              </div>

              {isRevealing ? (
                <RevealView
                  prompt={currentPrompt}
                  players={game.players}
                  isHostDisplay
                />
              ) : (
                <HostVotingView prompt={currentPrompt} />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="host-processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="w-10 h-10 mx-auto mb-4 rounded-full border-2 border-edge border-t-teal animate-spin" />
              <p className="text-ink-dim text-lg">Tallying results...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

/** Host display during voting — shows the two answers without vote buttons. */
function HostVotingView({ prompt }: { prompt: GamePrompt }) {
  const [respA, respB] = prompt.responses;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch gap-4 lg:gap-0">
      {/* Response A */}
      <motion.div
        className="p-6 sm:p-8 lg:p-10 rounded-2xl bg-surface/80 backdrop-blur-md border-2 border-edge"
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        <p className="text-lg sm:text-2xl lg:text-3xl leading-snug text-ink font-medium">
          {respA.text}
        </p>
      </motion.div>

      {/* VS divider */}
      <motion.div
        className="flex lg:flex-col items-center justify-center gap-3 lg:px-6"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.15 }}
      >
        <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
        <span className="font-display font-black text-lg lg:text-2xl text-ink-dim/30 tracking-[0.3em]">
          VS
        </span>
        <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
      </motion.div>

      {/* Response B */}
      <motion.div
        className="p-6 sm:p-8 lg:p-10 rounded-2xl bg-surface/80 backdrop-blur-md border-2 border-edge"
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        <p className="text-lg sm:text-2xl lg:text-3xl leading-snug text-ink font-medium">
          {respB.text}
        </p>
      </motion.div>
    </div>
  );
}

/** Mobile vote buttons — big, thumb-friendly, satisfying to tap. */
function VoteView({
  prompt,
  voting,
  onVote,
}: {
  prompt: { id: string; responses: { id: string; text: string; playerId: string }[] };
  voting: boolean;
  onVote: (promptId: string, responseId: string) => void;
}) {
  const [respA, respB] = prompt.responses;
  const { triggerElement } = usePixelDissolve();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch gap-3 lg:gap-0">
      {/* Response A */}
      <motion.button
        onClick={(e) => {
          triggerElement(e.currentTarget);
          onVote(prompt.id, respA.id);
        }}
        disabled={voting}
        className="w-full p-5 sm:p-6 lg:p-8 rounded-2xl bg-surface/80 backdrop-blur-md border-2 border-edge text-left transition-all hover:border-teal hover:bg-teal-soft active:scale-[0.97] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group"
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        whileHover={{ scale: 1.015, y: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        <p className="text-base sm:text-lg lg:text-xl leading-snug text-ink group-hover:text-teal transition-colors">
          {respA.text}
        </p>
      </motion.button>

      {/* VS divider */}
      <motion.div
        className="flex lg:flex-col items-center justify-center gap-3 lg:px-6 py-1"
        variants={scaleIn}
        initial="hidden"
        animate="visible"
      >
        <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
        <span className="font-display font-black text-xs lg:text-lg text-ink-dim/40 tracking-[0.3em]">
          VS
        </span>
        <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
      </motion.div>

      {/* Response B */}
      <motion.button
        onClick={(e) => {
          triggerElement(e.currentTarget);
          onVote(prompt.id, respB.id);
        }}
        disabled={voting}
        className="w-full p-5 sm:p-6 lg:p-8 rounded-2xl bg-surface/80 backdrop-blur-md border-2 border-edge text-left transition-all hover:border-punch hover:bg-fail-soft active:scale-[0.97] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group"
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        whileHover={{ scale: 1.015, y: -2 }}
        whileTap={{ scale: 0.97 }}
      >
        <p className="text-base sm:text-lg lg:text-xl leading-snug text-ink group-hover:text-punch transition-colors">
          {respB.text}
        </p>
      </motion.button>
    </div>
  );
}

/** Passive state — respondent or already-voted. */
function PassiveView({
  label,
  sublabel,
  color,
}: {
  label: string;
  sublabel: string;
  color: "gold" | "teal";
}) {
  const styles = {
    gold: "bg-gold/20 border-gold/40 text-ink",
    teal: "bg-teal/20 border-teal/40 text-teal",
  };

  return (
    <motion.div
      className="text-center py-10 sm:py-14"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springDefault}
    >
      <div className={`inline-flex items-center gap-2 px-5 py-3 rounded-full border ${styles[color]}`}>
        {color === "teal" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        <span className="font-display font-bold text-sm sm:text-base">
          {label}
        </span>
      </div>
      <p className="text-ink-dim text-sm mt-3">{sublabel}</p>
    </motion.div>
  );
}

/** SVG crown icon for winner badges. */
function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06l-4.23 1.14-3.47-6.22c-.42-.75-1.64-.75-2.06 0L7.01 9.72l-4.23-1.14c-.8-.22-1.63.26-1.84 1.06-.11.4-.02.82.24 1.13L5.5 15.5h13l4.32-4.73c.26-.31.35-.73.25-1.13z" />
    </svg>
  );
}

/** SVG skull/robot icon for "Lost to the slop". */
function SlopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12v4c0 1.1.9 2 2 2h1v-2c0-.55.45-1 1-1s1 .45 1 1v2h2v-2c0-.55.45-1 1-1s1 .45 1 1v2h2v-2c0-.55.45-1 1-1s1 .45 1 1v2h2v-2c0-.55.45-1 1-1s1 .45 1 1v2h1c1.1 0 2-.9 2-2v-4c0-5.52-4.48-10-10-10zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

/** Small avatar chip for a voter — model icon for AI, colored initial for humans. */
function VoterChip({
  player,
  size = "sm",
}: {
  player: GamePlayer;
  size?: "sm" | "lg";
}) {
  const model = player.type === "AI" && player.modelId ? getModelByModelId(player.modelId) : null;
  const iconSize = size === "lg" ? 20 : 16;
  const chipClass = size === "lg"
    ? "gap-2 px-3 py-1.5 text-sm"
    : "gap-1.5 px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center ${chipClass} rounded-full bg-surface/80 border border-edge font-medium text-ink-dim`}
    >
      {model ? (
        <ModelIcon model={model} size={iconSize} />
      ) : (
        <span
          className="shrink-0 rounded-full flex items-center justify-center text-white font-bold"
          style={{
            width: iconSize + 2,
            height: iconSize + 2,
            fontSize: iconSize - 3,
            backgroundColor: getPlayerColor(player.name),
          }}
        >
          {player.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate max-w-[5rem]">{player.name}</span>
    </span>
  );
}

function getRevealCardStyle(isWinner: boolean, isTie: boolean, isSlopped: boolean): { border: string; shadow: string } {
  if (isWinner) {
    return {
      border: "border-teal bg-teal-soft",
      shadow: "0 0 30px rgba(14, 163, 146, 0.2), 0 0 60px rgba(14, 163, 146, 0.05)",
    };
  }
  if (isTie) {
    return { border: "border-gold/40 bg-gold-soft", shadow: "var(--shadow-card)" };
  }
  if (isSlopped) {
    return { border: "border-punch/30 bg-fail-soft/50", shadow: "0 0 20px rgba(255, 86, 71, 0.1)" };
  }
  return { border: "border-edge bg-surface/60", shadow: "var(--shadow-card)" };
}

/** Single response card used in the reveal view. */
function RevealResponseCard({
  response,
  votes,
  pct,
  isWinner,
  isTie,
  isHostDisplay,
  players,
  slideFrom,
  isLoser,
  aiBeatsHuman,
}: {
  response: GamePrompt["responses"][0];
  votes: { voterId: string }[];
  pct: number;
  isWinner: boolean;
  isTie: boolean;
  isHostDisplay: boolean;
  players: GamePlayer[];
  slideFrom: "left" | "right";
  isLoser: boolean;
  aiBeatsHuman: boolean;
}) {
  const textSize = isHostDisplay ? "text-lg sm:text-2xl lg:text-3xl" : "text-base sm:text-lg";
  const authorSize = isHostDisplay ? "text-sm sm:text-base" : "text-sm";
  const pctSize = isHostDisplay ? "text-3xl sm:text-5xl lg:text-6xl" : "text-2xl sm:text-3xl";
  const voteCountSize = isHostDisplay ? "text-sm sm:text-base" : "text-xs sm:text-sm";
  const padding = isHostDisplay ? "p-6 sm:p-8 lg:p-10" : "p-4 sm:p-5";

  const playerById = new Map(players.map((p) => [p.id, p]));

  const cardStyle = getRevealCardStyle(isWinner, isTie, isLoser && aiBeatsHuman);

  return (
    <motion.div
      className={`${padding} rounded-2xl border-2 relative overflow-hidden ${cardStyle.border}`}
      style={{ boxShadow: cardStyle.shadow }}
      initial={{ opacity: 0, x: slideFrom === "left" ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      {/* Vote fill bar */}
      <motion.div
        className={`absolute inset-0 ${
          isWinner ? "bg-teal/8" : isLoser && aiBeatsHuman ? "bg-punch/5" : "bg-ink/[0.02]"
        }`}
        initial={{ width: "0%" }}
        animate={{ width: `${pct}%` }}
        transition={{ ...springGentle, delay: 0.3 }}
      />

      <div className="relative">
        {/* Winner badge — crown icon + text */}
        {isWinner && (
          <motion.div
            className="absolute -top-1 -right-1 z-10"
            initial={{ opacity: 0, scale: 0, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ ...springBouncy, delay: 0.8 }}
          >
            <span
              className={`animate-crown-shimmer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-teal to-teal-hover text-white font-display font-bold uppercase tracking-wider ${
                isHostDisplay ? "text-xs sm:text-sm" : "text-[10px]"
              }`}
              style={{ boxShadow: "0 2px 8px rgba(14, 163, 146, 0.3)" }}
            >
              <CrownIcon className={isHostDisplay ? "w-4 h-4" : "w-3 h-3"} />
              Winner
            </span>
          </motion.div>
        )}

        <p className={`${textSize} leading-snug text-ink mb-3 font-medium ${isWinner ? "pr-16" : ""}`}>
          {response.text}
        </p>

        {/* Author + score row */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={`${authorSize} text-ink-dim font-medium`}>
              &mdash; {response.player.name}
            </p>
            {/* Voter badges */}
            {votes.length > 0 && (
              <motion.div
                className="flex flex-wrap gap-1 mt-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                {votes.map((v) => {
                  const voter = playerById.get(v.voterId);
                  if (!voter) return null;
                  return (
                    <VoterChip
                      key={v.voterId}
                      player={voter}
                      size={isHostDisplay ? "lg" : "sm"}
                    />
                  );
                })}
              </motion.div>
            )}
          </div>

          <motion.div
            className="text-right shrink-0"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springBouncy, delay: 0.4 }}
          >
            <span className={`${pctSize} font-mono font-black tabular-nums ${
              isWinner ? "text-teal" : isTie ? "text-gold" : "text-ink-dim/40"
            }`}>
              {pct}
              <span className={isHostDisplay ? "text-lg sm:text-2xl" : "text-sm"}>%</span>
            </span>
            <p className={`${voteCountSize} text-ink-dim/60 tabular-nums`}>
              {votes.length} vote{votes.length !== 1 ? "s" : ""}
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

/** Reveal view — the dramatic vote results. Scales up for host display. */
function RevealView({
  prompt,
  players,
  isHostDisplay = false,
}: {
  prompt: GamePrompt;
  players: GamePlayer[];
  isHostDisplay?: boolean;
}) {
  const [respA, respB] = prompt.responses;

  const actualVotes = filterCastVotes(prompt.votes);
  const totalVotes = actualVotes.length;

  const votesA = actualVotes.filter((v) => v.responseId === respA.id);
  const votesB = actualVotes.filter((v) => v.responseId === respB.id);

  const pctA = totalVotes > 0 ? Math.round((votesA.length / totalVotes) * 100) : 0;
  const pctB = totalVotes > 0 ? Math.round((votesB.length / totalVotes) * 100) : 0;

  const winnerIsA = votesA.length > votesB.length;
  const winnerIsB = votesB.length > votesA.length;
  const isTie = votesA.length === votesB.length && totalVotes > 0;
  const isUnanimous = totalVotes >= 2 && (votesA.length === totalVotes || votesB.length === totalVotes);

  // Detect AI beats human
  const hasWinner = winnerIsA || winnerIsB;
  const winnerResp = winnerIsA ? respA : respB;
  const loserResp = winnerIsA ? respB : respA;
  const aiBeatsHuman = hasWinner && winnerResp.player.type === "AI" && loserResp.player.type === "HUMAN";
  const isSlopped = isUnanimous && aiBeatsHuman;

  // Fire confetti for unanimous votes
  const confettiFired = useRef(false);
  useEffect(() => {
    if (!isUnanimous || confettiFired.current) return;
    confettiFired.current = true;

    playSound("winner-reveal");

    if (isSlopped) {
      setTimeout(() => {
        import("canvas-confetti").then(({ default: confetti }) => {
          confetti({
            particleCount: 40,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.6 },
            colors: ["#FF5647", "#FF8A80", "#FF6E62"],
            startVelocity: 30,
          });
          confetti({
            particleCount: 40,
            angle: 120,
            spread: 55,
            origin: { x: 1, y: 0.6 },
            colors: ["#FF5647", "#FF8A80", "#FF6E62"],
            startVelocity: 30,
          });
        });
      }, 800);
    } else {
      setTimeout(() => {
        import("canvas-confetti").then(({ default: confetti }) => {
          confetti({
            particleCount: 60,
            spread: 80,
            origin: { y: 0.55 },
            colors: ["#2DD4B8", "#FFD644", "#5DDFC8"],
            startVelocity: 28,
          });
          setTimeout(() => {
            confetti({
              particleCount: 30,
              spread: 50,
              origin: { x: 0.3, y: 0.5 },
              colors: ["#2DD4B8", "#FFD644"],
              startVelocity: 20,
            });
          }, 300);
        });
      }, 800);
    }
  }, [isUnanimous, isSlopped]);

  const respondentIds = new Set(prompt.responses.map((r) => r.playerId));

  const abstainVoterIds = new Set(
    filterAbstainVotes(prompt.votes).map((v) => v.voterId),
  );
  const abstainedVoters = players.filter((p) => abstainVoterIds.has(p.id));

  // Players who never voted at all (disconnected, etc.)
  const allVoterIds = new Set(prompt.votes.map((v) => v.voterId));
  const didntVote = players.filter(
    (p) => !respondentIds.has(p.id) && !allVoterIds.has(p.id),
  );

  return (
    <div className="space-y-4 sm:space-y-5 relative">
      {/* Side-by-side response cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch gap-3 lg:gap-0">
        <RevealResponseCard
          response={respA}
          votes={votesA}
          pct={pctA}
          isWinner={winnerIsA}
          isTie={isTie}
          isHostDisplay={isHostDisplay}
          players={players}
          slideFrom="left"
          isLoser={winnerIsB}
          aiBeatsHuman={aiBeatsHuman}
        />

        {/* VS divider */}
        <motion.div
          className="flex lg:flex-col items-center justify-center gap-3 lg:px-5"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
          <span className={`font-display font-black text-ink-dim/25 tracking-[0.3em] ${
            isHostDisplay ? "text-lg lg:text-xl" : "text-xs"
          }`}>
            VS
          </span>
          <div className="h-px lg:h-auto lg:w-px flex-1 bg-edge" />
        </motion.div>

        <RevealResponseCard
          response={respB}
          votes={votesB}
          pct={pctB}
          isWinner={winnerIsB}
          isTie={isTie}
          isHostDisplay={isHostDisplay}
          players={players}
          slideFrom="right"
          isLoser={winnerIsA}
          aiBeatsHuman={aiBeatsHuman}
        />
      </div>

      {/* SLOPPED! stamp — dramatic slam-down effect */}
      {isSlopped && (
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div
            className={`animate-stamp-slam inline-flex flex-col items-center gap-1 px-8 py-3 rounded-xl border-3 border-punch bg-punch/15 backdrop-blur-sm ${
              isHostDisplay ? "px-12 py-5" : ""
            }`}
            style={{
              boxShadow: "0 0 40px rgba(255, 86, 71, 0.25), inset 0 0 20px rgba(255, 86, 71, 0.05)",
              textShadow: "0 0 20px rgba(255, 86, 71, 0.4)",
            }}
          >
            <span className={`font-display font-black tracking-[0.2em] uppercase text-punch ${
              isHostDisplay ? "text-3xl sm:text-5xl" : "text-xl sm:text-2xl"
            }`}>
              SLOPPED!
            </span>
            <span className={`font-display font-bold text-punch/70 uppercase tracking-wider ${
              isHostDisplay ? "text-sm" : "text-xs"
            }`}>
              Obliterated by the machine
            </span>
          </div>
        </motion.div>
      )}

      {/* FLAWLESS! — unanimous non-AI win */}
      {isUnanimous && !isSlopped && (
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <div
            className={`animate-stamp-slam inline-flex flex-col items-center gap-1 px-8 py-3 rounded-xl border-3 border-teal bg-teal/15 backdrop-blur-sm ${
              isHostDisplay ? "px-12 py-5" : ""
            }`}
            style={{
              boxShadow: "0 0 40px rgba(45, 212, 184, 0.25), inset 0 0 20px rgba(45, 212, 184, 0.05)",
              textShadow: "0 0 20px rgba(45, 212, 184, 0.4)",
            }}
          >
            <span className={`font-display font-black tracking-[0.2em] uppercase text-teal ${
              isHostDisplay ? "text-3xl sm:text-5xl" : "text-xl sm:text-2xl"
            }`}>
              FLAWLESS!
            </span>
          </div>
        </motion.div>
      )}

      {/* Lost to the slop — non-unanimous AI win */}
      {aiBeatsHuman && !isUnanimous && (
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          <div
            className={`animate-slop-drip inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border-2 border-punch/30 bg-gradient-to-b from-punch/10 to-punch/5 ${
              isHostDisplay ? "px-8 py-4" : ""
            }`}
            style={{
              boxShadow: "0 4px 20px rgba(255, 86, 71, 0.12)",
            }}
          >
            <SlopIcon className={`text-punch/60 ${isHostDisplay ? "w-6 h-6" : "w-4 h-4"}`} />
            <span className={`font-display font-bold text-punch uppercase tracking-wider ${
              isHostDisplay ? "text-base sm:text-lg" : "text-sm"
            }`}>
              Lost to the slop
            </span>
            <SlopIcon className={`text-punch/60 ${isHostDisplay ? "w-6 h-6" : "w-4 h-4"}`} />
          </div>
        </motion.div>
      )}

      {/* Tie indicator */}
      {isTie && (
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <span className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg border border-gold/30 bg-gold/10 font-display font-bold text-gold ${
            isHostDisplay ? "text-lg" : "text-sm"
          }`}>
            It&apos;s a tie!
          </span>
        </motion.div>
      )}

      {/* Abstained voters — explicitly chose not to vote */}
      {abstainedVoters.length > 0 && (
        <motion.div
          className="flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-edge bg-surface/50 ${
            isHostDisplay ? "text-sm" : "text-xs"
          }`}>
            <span className="text-ink-dim/50 font-medium">Abstained:</span>
            <div className="flex flex-wrap gap-1">
              {abstainedVoters.map((p) => (
                <VoterChip
                  key={p.id}
                  player={p}
                  size={isHostDisplay ? "lg" : "sm"}
                />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Didn't vote — no vote record at all */}
      {didntVote.length > 0 && (
        <motion.p
          className={`text-center text-ink-dim/35 ${
            isHostDisplay ? "text-sm" : "text-xs"
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          Didn&apos;t vote: {didntVote.map((p) => p.name).join(", ")}
        </motion.p>
      )}
    </div>
  );
}
