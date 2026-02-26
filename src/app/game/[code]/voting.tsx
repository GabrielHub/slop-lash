"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameState, GamePrompt, GamePlayer, filterCastVotes, filterAbstainVotes, filterErrorVotes } from "@/lib/types";
import { scorePrompt, applyScoreResult, FORFEIT_MARKER, type PlayerState, type ScorePromptResult } from "@/lib/scoring";
import { VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS } from "@/lib/game-constants";
import { Timer } from "@/components/timer";
import { ErrorBanner } from "@/components/error-banner";
import {
  fadeInUp,
  springDefault,
  springBouncy,
  springGentle,
  buttonTap,
} from "@/lib/animations";
import { playSound } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { getModelByModelId } from "@/lib/models";
import { ModelIcon } from "@/components/model-icon";
import { getPlayerColor } from "@/lib/player-colors";
import { PlayerAvatar } from "@/components/player-avatar";
import { ReactionBar } from "@/components/reaction-bar";
import { VsDivider } from "@/components/vs-divider";
import { CrownIcon, SlopIcon } from "@/components/icons";

/** Format a number with a leading "+" for positive values. */
function formatSigned(n: number): string {
  return n >= 0 ? `+${n.toLocaleString()}` : n.toLocaleString();
}

function getVotingSkipText(skipping: boolean, revealing: boolean, timersDisabled: boolean): string {
  if (skipping) return "Skipping...";
  if (revealing) return "Next";
  if (timersDisabled) return "End Voting";
  return "Skip Timer";
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
  isSpectator = false,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
  isHost: boolean;
  isSpectator?: boolean;
}) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [abstained, setAbstained] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");

  const currentRound = game.rounds[0];

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of game.players) map.set(p.id, p.name);
    return map;
  }, [game.players]);

  // Compute votable prompts sorted by id (matching server getVotablePrompts ordering)
  const votablePrompts = useMemo(() => {
    if (!currentRound) return [];
    return [...currentRound.prompts]
      .filter((p) => p.responses.length >= 2 && !p.responses.some((r) => r.text === FORFEIT_MARKER))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [currentRound]);

  const currentPrompt = votablePrompts[game.votingPromptIndex] ?? null;
  const isRevealing = game.votingRevealing;
  const totalPrompts = votablePrompts.length;

  // Client-side scoring for revealed prompts — powers points display + running scoreboard
  const { promptScores, runningScores } = useMemo(() => {
    const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
    const states = new Map<string, PlayerState>(
      activePlayers.map((p) => [p.id, { score: p.score, humorRating: p.humorRating, winStreak: p.winStreak }]),
    );
    const scores = new Map<string, ScorePromptResult>();
    const revealedCount = isRevealing ? game.votingPromptIndex + 1 : game.votingPromptIndex;

    for (let i = 0; i < revealedCount; i++) {
      const prompt = votablePrompts[i];
      if (!prompt || prompt.responses.length < 2) continue;

      const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
      const eligibleVoterCount = activePlayers.filter((p) => !respondentIds.has(p.id)).length;

      const result = scorePrompt(
        prompt.responses.map((r) => ({ id: r.id, playerId: r.playerId, playerType: r.player.type, text: r.text })),
        prompt.votes.map((v) => ({ id: v.voter.id, type: v.voter.type, responseId: v.responseId })),
        states,
        game.currentRound,
        eligibleVoterCount,
      );

      scores.set(prompt.id, result);
      applyScoreResult(result, prompt.responses, states);
    }

    return { promptScores: scores, runningScores: states };
  }, [votablePrompts, game.votingPromptIndex, isRevealing, game.players, game.currentRound]);

  const currentPromptScore = currentPrompt ? promptScores.get(currentPrompt.id) : undefined;

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

  // Check if the player explicitly abstained on the current prompt (survives reconnect)
  const hasAbstainedCurrent = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return (
      abstained.has(currentPrompt.id) ||
      currentPrompt.votes.some(
        (v) => v.voterId === playerId && v.responseId == null && v.failReason == null
      )
    );
  }, [currentPrompt, playerId, abstained]);

  // Play vote-reveal sound when reveal phase starts
  const prevRevealing = useRef(false);
  useEffect(() => {
    if (isRevealing && !prevRevealing.current) {
      playSound("vote-reveal");
    }
    prevRevealing.current = isRevealing;
  }, [isRevealing]);

  async function castVote(promptId: string, responseId: string | null) {
    if (!playerId) return;
    setVoting(true);
    setError("");

    const isAbstain = responseId === null;

    try {
      const res = await fetch(`/api/games/${code}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voterId: playerId, promptId, responseId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || (isAbstain ? "Failed to pass" : "Failed to vote"));
        return;
      }

      if (isAbstain) {
        setAbstained((prev) => new Set(prev).add(promptId));
      } else {
        playSound("vote-cast");
      }
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

  // AI / unidentified view — gets the full host display (spectators get interactive voting below)
  if ((isAI || !playerId) && !isSpectator) {
    return (
      <HostDisplay
        game={game}
        currentPrompt={currentPrompt}
        isRevealing={isRevealing}
        totalPrompts={totalPrompts}
        playerNames={playerNames}
        scoreResult={currentPromptScore}
        runningScores={runningScores}
      />
    );
  }

  return (
    <main className="min-h-svh flex flex-col items-center px-4 sm:px-6 py-8 pt-16 sm:pt-20">
      <div className="w-full max-w-lg lg:max-w-none xl:max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 xl:gap-10">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="min-w-0"
        >
          {/* Top controls */}
          <div className="mb-4 sm:mb-6 lg:mb-7">
            {/* Mobile progress dots */}
            <div className="mb-3 lg:hidden">
              <ProgressDots
                total={totalPrompts}
                current={game.votingPromptIndex}
                revealing={isRevealing}
              />
            </div>

            <div className="flex items-end gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4">
              {/* Desktop label */}
              <div className="hidden lg:block">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-ink">
                  Judges Voting
                </p>
                <p className="mt-1 text-xs font-mono text-ui-soft">
                  Prompt {Math.min(game.votingPromptIndex + 1, Math.max(totalPrompts, 1))}/{Math.max(totalPrompts, 1)}
                </p>
              </div>

              {/* Timer — takes remaining space */}
              <div className="min-w-0 flex-1">
                {!game.timersDisabled && (
                  <Timer
                    deadline={game.phaseDeadline}
                    total={isRevealing ? REVEAL_SECONDS : VOTE_PER_PROMPT_SECONDS}
                  />
                )}
              </div>

              {/* Host skip/next — inline with timer */}
              {isHost && (
                <motion.button
                  onClick={skipTimer}
                  disabled={skipping}
                  className="shrink-0 h-9 px-4 text-xs sm:text-sm font-medium text-ink-dim hover:text-ink bg-raised/80 backdrop-blur-sm hover:bg-surface border border-edge rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  {...buttonTap}
                >
                  {getVotingSkipText(skipping, isRevealing, game.timersDisabled)}
                </motion.button>
              )}
            </div>
          </div>

          {/* Desktop progress dots */}
          <div className="hidden lg:flex mb-6 justify-center">
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
                className="rounded-2xl border border-edge/90 bg-surface/50 backdrop-blur-sm p-4 sm:p-5 lg:p-7 xl:p-8"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {/* Prompt text — big and centered */}
                <div className="mb-6 sm:mb-8 lg:mb-10 lg:text-left">
                  <div className="hidden lg:flex justify-start mb-3">
                    <span className="inline-flex items-center gap-2 rounded-full border border-edge/80 bg-raised/60 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-ui-soft">
                      {isRevealing ? "Reveal" : "Vote"}
                      <span className="text-edge-strong">•</span>
                      Prompt {Math.min(game.votingPromptIndex + 1, Math.max(totalPrompts, 1))}
                    </span>
                  </div>
                  <p className="mx-auto lg:mx-0 max-w-4xl font-display font-bold text-lg sm:text-2xl lg:text-3xl xl:text-[2.15rem] text-gold leading-tight text-center lg:text-left">
                    {currentPrompt.text}
                  </p>
                </div>

                {isRevealing ? (
                  <RevealView
                    prompt={currentPrompt}
                    players={game.players}
                    playerNames={playerNames}
                    scoreResult={currentPromptScore}
                  />
                ) : isRespondent ? (
                  <PassiveView
                    sublabel="You wrote one of these!"
                    color="gold"
                    prompt={currentPrompt}
                    playerId={playerId}
                    code={code}
                    playerNames={playerNames}
                  />
                ) : hasVotedCurrent ? (
                  <PassiveView
                    sublabel="Waiting for others..."
                    color={hasAbstainedCurrent ? "dim" : "teal"}
                    prompt={currentPrompt}
                    playerId={playerId}
                    code={code}
                    playerNames={playerNames}
                  />
                ) : (
                  <VoteView
                    prompt={currentPrompt}
                    voting={voting}
                    onVote={castVote}
                    playerId={playerId}
                    code={code}
                    playerNames={playerNames}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 rounded-2xl border border-edge/90 bg-surface/50 backdrop-blur-sm"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-edge border-t-teal animate-spin" />
                <p className="text-ink-dim text-sm">Processing results...</p>
              </motion.div>
            )}
          </AnimatePresence>

          <ErrorBanner error={error} className="mt-4 lg:mt-5" />
        </motion.div>

        {/* Desktop running scoreboard */}
        <motion.div
          className="hidden lg:block sticky top-20 self-start"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={springDefault}
        >
          <div className="space-y-4">
            <div
              className="rounded-2xl border border-edge/90 bg-surface/50 backdrop-blur-sm p-4 xl:p-5"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <VotingScoreboard players={game.players} runningScores={runningScores} />
            </div>
            {currentPrompt && (
              <div
                className="rounded-2xl border border-edge/90 bg-surface/50 backdrop-blur-sm p-4 xl:p-5"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <VotingPromptStatusPanel
                  prompt={currentPrompt}
                  players={game.players}
                  promptIndex={game.votingPromptIndex}
                  totalPrompts={totalPrompts}
                  isRevealing={isRevealing}
                />
              </div>
            )}
          </div>
        </motion.div>
      </div>
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
  playerNames,
  scoreResult,
  runningScores,
}: {
  game: GameState;
  currentPrompt: GamePrompt | null;
  isRevealing: boolean;
  totalPrompts: number;
  playerNames: Map<string, string>;
  scoreResult?: ScorePromptResult;
  runningScores: Map<string, PlayerState>;
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
              <div className="mb-10 lg:text-left">
                <div className="hidden lg:flex items-center gap-2 mb-3">
                  <span className={`h-1.5 w-1.5 rounded-full ${isRevealing ? "bg-gold" : "bg-punch"}`} />
                  <span className="text-[11px] uppercase tracking-[0.24em] text-ui-faint">
                    {isRevealing ? "Reveal Stage" : "Voting Stage"}
                  </span>
                </div>
                <p className="font-display font-extrabold text-2xl sm:text-4xl lg:text-5xl text-gold leading-tight text-center lg:text-left">
                  {currentPrompt.text}
                </p>
              </div>

              {isRevealing ? (
                <RevealView
                  prompt={currentPrompt}
                  players={game.players}
                  playerNames={playerNames}
                  isHostDisplay
                  scoreResult={scoreResult}
                />
              ) : (
                <HostVotingView prompt={currentPrompt} playerNames={playerNames} />
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

        {/* Running scoreboard — compact strip for host display */}
        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springDefault, delay: 0.2 }}
        >
          <VotingScoreboard players={game.players} runningScores={runningScores} horizontal />
        </motion.div>
      </div>
    </main>
  );
}

/** Host display during voting — shows the two answers without vote buttons. */
function HostVotingView({ prompt, playerNames }: { prompt: GamePrompt; playerNames: Map<string, string> }) {
  if (prompt.responses.length < 2) return null;
  const [respA, respB] = prompt.responses;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr] items-stretch gap-4 lg:gap-0">
      {/* Response A */}
      <motion.div
        className="relative p-6 sm:p-8 lg:p-10 rounded-2xl bg-surface/88 backdrop-blur-md border-2 border-edge"
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        <p className="text-lg sm:text-2xl lg:text-3xl leading-snug text-ink font-medium">
          {respA.text}
        </p>
        <ReactionBar responseId={respA.id} reactions={respA.reactions} playerId={null} code="" disabled size="lg" playerNames={playerNames} />
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
        className="relative p-6 sm:p-8 lg:p-10 rounded-2xl bg-surface/88 backdrop-blur-md border-2 border-edge"
        style={{ boxShadow: "var(--shadow-card)" }}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      >
        <p className="text-lg sm:text-2xl lg:text-3xl leading-snug text-ink font-medium">
          {respB.text}
        </p>
        <ReactionBar responseId={respB.id} reactions={respB.reactions} playerId={null} code="" disabled size="lg" playerNames={playerNames} />
      </motion.div>
    </div>
  );
}

/** Mobile vote buttons — big, thumb-friendly, satisfying to tap. */
function VoteView({
  prompt,
  voting,
  onVote,
  playerId,
  code,
  playerNames,
}: {
  prompt: GamePrompt;
  voting: boolean;
  onVote: (promptId: string, responseId: string | null) => void;
  playerId: string | null;
  code: string;
  playerNames: Map<string, string>;
}) {
  const [respA, respB] = prompt.responses;
  const { triggerElement } = usePixelDissolve();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-stretch gap-3 lg:gap-4">
      {/* Response A */}
      <div className="relative">
        <motion.button
          onClick={(e) => {
            triggerElement(e.currentTarget);
            onVote(prompt.id, respA.id);
          }}
          disabled={voting}
          className="w-full min-h-[148px] lg:min-h-[210px] p-5 sm:p-6 lg:p-7 rounded-2xl bg-surface/92 backdrop-blur-md border-2 border-edge/90 text-left transition-all hover:border-teal hover:bg-teal-soft active:scale-[0.97] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group flex flex-col justify-between"
          style={{ boxShadow: "var(--shadow-card)" }}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-ui-soft group-hover:text-teal transition-colors mb-3">
            Option A
          </p>
          <p className="text-base sm:text-lg lg:text-[1.45rem] leading-snug text-ink group-hover:text-teal transition-colors">
            {respA.text}
          </p>
        </motion.button>
        <ReactionBar responseId={respA.id} reactions={respA.reactions} playerId={playerId} code={code} playerNames={playerNames} />
      </div>

      {/* VS divider */}
      <VsDivider animated />

      {/* Response B */}
      <div className="relative">
        <motion.button
          onClick={(e) => {
            triggerElement(e.currentTarget);
            onVote(prompt.id, respB.id);
          }}
          disabled={voting}
          className="w-full min-h-[148px] lg:min-h-[210px] p-5 sm:p-6 lg:p-7 rounded-2xl bg-surface/92 backdrop-blur-md border-2 border-edge/90 text-left transition-all hover:border-punch hover:bg-fail-soft active:scale-[0.97] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group flex flex-col justify-between"
          style={{ boxShadow: "var(--shadow-card)" }}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          whileHover={{ scale: 1.015, y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-ui-soft group-hover:text-punch transition-colors mb-3">
            Option B
          </p>
          <p className="text-base sm:text-lg lg:text-[1.45rem] leading-snug text-ink group-hover:text-punch transition-colors">
            {respB.text}
          </p>
        </motion.button>
        <ReactionBar responseId={respB.id} reactions={respB.reactions} playerId={playerId} code={code} playerNames={playerNames} />
      </div>

      {/* Pass button — spans full width below the grid */}
      <div className="col-span-1 lg:col-span-3 flex justify-center pt-2">
        <button
          onClick={() => onVote(prompt.id, null)}
          disabled={voting}
          className="text-sm text-ui-soft hover:text-ink transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Pass
        </button>
      </div>
    </div>
  );
}

const PASSIVE_STATUS_STYLES = {
  gold: {
    chip: "border-gold/40 bg-gold/12 text-gold",
    dot: "bg-gold",
  },
  teal: {
    chip: "border-teal/45 bg-teal/12 text-teal",
    dot: "bg-teal",
  },
  dim: {
    chip: "border-edge-strong/60 bg-raised/70 text-ui-soft",
    dot: "bg-edge-strong",
  },
} as const;

/** Passive state -- respondent or already-voted. Shows responses with interactive reaction bars. */
function PassiveView({
  sublabel,
  color,
  prompt,
  playerId,
  code,
  playerNames,
}: {
  sublabel: string;
  color: "gold" | "teal" | "dim";
  prompt: GamePrompt;
  playerId: string | null;
  code: string;
  playerNames: Map<string, string>;
}) {
  const status = PASSIVE_STATUS_STYLES[color];

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Response cards with reactions */}
      {prompt.responses.length >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] items-stretch gap-3 lg:gap-4">
          {prompt.responses.map((resp, i) => (
            <React.Fragment key={resp.id}>
              {i === 1 && <VsDivider />}
              <div
                className="relative min-h-[132px] lg:min-h-[178px] p-4 sm:p-5 lg:p-6 rounded-2xl bg-surface/84 border border-edge/90 flex flex-col justify-between"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-ui-soft mb-2">
                    {i === 0 ? "Option A" : "Option B"}
                  </p>
                  <p className="text-base sm:text-lg lg:text-xl leading-snug text-ink">
                  {resp.text}
                  </p>
                </div>
                <ReactionBar
                  responseId={resp.id}
                  reactions={resp.reactions}
                  playerId={playerId}
                  code={code}
                  playerNames={playerNames}
                />
              </div>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Status badge */}
      <motion.div
        className="text-center py-4 sm:py-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springDefault}
      >
        <div
          className="mx-auto w-full max-w-md rounded-2xl border border-edge/90 bg-surface/88 backdrop-blur-sm px-4 sm:px-5 py-4 sm:py-5"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${status.chip}`}>
              {color === "teal" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
              )}
              <span className="text-[11px] font-mono font-bold uppercase tracking-[0.18em]">
                {color === "gold" ? "Respondent" : color === "teal" ? "Vote Locked" : "Passed"}
              </span>
            </div>
            <p className="text-sm text-ink-dim">
              {sublabel}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/** Animated wrapper for outcome stamps (SLOPPED, FLAWLESS, etc.). */
function StampWrapper({ delay, children }: { delay: number; children: React.ReactNode }) {
  return (
    <motion.div
      className="flex justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
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

/** Row of voter chips with a label (e.g. "Crashed:", "Abstained:"). */
function VoterStatusRow({
  label,
  players,
  chipSize,
  textSize,
  className,
  labelClassName,
}: {
  label: string;
  players: GamePlayer[];
  chipSize: "sm" | "lg";
  textSize: string;
  className: string;
  labelClassName: string;
}) {
  return (
    <motion.div
      className="flex justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.0 }}
    >
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${className} ${textSize}`}>
        <span className={`${labelClassName} font-medium`}>{label}</span>
        <div className="flex flex-wrap gap-1">
          {players.map((p) => (
            <VoterChip key={p.id} player={p} size={chipSize} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function getRevealCardStyle(isWinner: boolean, isTie: boolean, isSlopped: boolean): { border: string; shadow: string } {
  if (isWinner) {
    return {
      border: "border-teal bg-teal-soft/90",
      shadow: "0 0 18px rgba(14, 163, 146, 0.18), 0 0 36px rgba(14, 163, 146, 0.05)",
    };
  }
  if (isTie) {
    return { border: "border-gold/50 bg-gold-soft/70", shadow: "var(--shadow-card)" };
  }
  if (isSlopped) {
    return { border: "border-punch/35 bg-fail-soft/45", shadow: "0 0 14px rgba(255, 86, 71, 0.08)" };
  }
  return { border: "border-edge bg-surface/70", shadow: "var(--shadow-card)" };
}

function getAccentBarColor(isWinner: boolean, isTie: boolean, isSlopped: boolean): string {
  if (isWinner) return "bg-teal";
  if (isTie) return "bg-gold/70";
  if (isSlopped) return "bg-punch/60";
  return "bg-edge";
}

function getVoteFillBg(isWinner: boolean, isSlopped: boolean): string {
  if (isWinner) return "bg-teal/8";
  if (isSlopped) return "bg-punch/5";
  return "bg-ink/[0.02]";
}

function getScorePctColor(isWinner: boolean, isTie: boolean): string {
  if (isWinner) return "text-teal";
  if (isTie) return "text-gold";
  return "text-ink-dim/40";
}

function getPointsColor(pointsEarned: number, isWinner: boolean): string {
  if (pointsEarned < 0) return "text-punch";
  if (isWinner) return "text-gold";
  return "text-ink-dim/50";
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
  playerNames,
  slideFrom,
  isLoser,
  aiBeatsHuman,
  pointsEarned,
}: {
  response: GamePrompt["responses"][0];
  votes: { voterId: string }[];
  pct: number;
  isWinner: boolean;
  isTie: boolean;
  isHostDisplay: boolean;
  players: GamePlayer[];
  playerNames: Map<string, string>;
  slideFrom: "left" | "right";
  isLoser: boolean;
  aiBeatsHuman: boolean;
  pointsEarned?: number;
}) {
  const textSize = isHostDisplay ? "text-lg sm:text-2xl lg:text-3xl" : "text-base sm:text-lg lg:text-[1.35rem]";
  const authorSize = isHostDisplay ? "text-sm sm:text-base" : "text-sm";
  const pctSize = isHostDisplay ? "text-3xl sm:text-5xl lg:text-6xl" : "text-2xl sm:text-3xl lg:text-4xl";
  const voteCountSize = isHostDisplay ? "text-sm sm:text-base" : "text-xs sm:text-sm";
  const padding = isHostDisplay ? "p-6 sm:p-8 lg:p-10" : "p-4 sm:p-5 lg:p-6";

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
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${getAccentBarColor(isWinner, isTie, isLoser && aiBeatsHuman)}`}
      />

      {/* Vote fill bar */}
      <motion.div
        className={`absolute inset-0 ${getVoteFillBg(isWinner, isLoser && aiBeatsHuman)}`}
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
            {/* Reactions */}
            {response.reactions.length > 0 && (
              <ReactionBar responseId={response.id} reactions={response.reactions} playerId={null} code="" disabled size={isHostDisplay ? "lg" : "sm"} playerNames={playerNames} />
            )}
          </div>

          <motion.div
            className="text-right shrink-0"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...springBouncy, delay: 0.4 }}
          >
            <span className={`${pctSize} font-mono font-black tabular-nums ${getScorePctColor(isWinner, isTie)}`}>
              {pct}
              <span className={isHostDisplay ? "text-lg sm:text-2xl" : "text-sm"}>%</span>
            </span>
            <p className={`${voteCountSize} text-ink-dim/60 tabular-nums`}>
              {votes.length} vote{votes.length !== 1 ? "s" : ""}
            </p>
            {pointsEarned != null && (
              <motion.p
                className={`font-mono font-black tabular-nums ${getPointsColor(pointsEarned, isWinner)} ${isHostDisplay ? "text-lg sm:text-xl mt-1" : "text-sm mt-0.5"}`}
                initial={{ opacity: 0, scale: 0.3, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ ...springBouncy, delay: 1.0 }}
              >
                {formatSigned(pointsEarned)}
              </motion.p>
            )}
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
  playerNames,
  isHostDisplay = false,
  scoreResult,
}: {
  prompt: GamePrompt;
  players: GamePlayer[];
  playerNames: Map<string, string>;
  isHostDisplay?: boolean;
  scoreResult?: ScorePromptResult;
}) {
  const respA = prompt.responses[0];
  const respB = prompt.responses[1];

  const actualVotes = respA && respB ? filterCastVotes(prompt.votes) : [];
  const totalVotes = actualVotes.length;

  const votesA = respA && respB ? actualVotes.filter((v) => v.responseId === respA.id) : [];
  const votesB = respA && respB ? actualVotes.filter((v) => v.responseId === respB.id) : [];

  const pctA = totalVotes > 0 ? Math.round((votesA.length / totalVotes) * 100) : 0;
  const pctB = totalVotes > 0 ? Math.round((votesB.length / totalVotes) * 100) : 0;

  // When score data is available, determine winner by points (matches results page);
  // otherwise fall back to raw vote count (before scoring is computed)
  const ptsA = scoreResult?.points[respA.id] ?? 0;
  const ptsB = scoreResult?.points[respB.id] ?? 0;
  const winnerIsA = scoreResult ? ptsA > ptsB : votesA.length > votesB.length;
  const winnerIsB = scoreResult ? ptsB > ptsA : votesB.length > votesA.length;
  const isTie = scoreResult
    ? ptsA === ptsB && totalVotes > 0
    : votesA.length === votesB.length && totalVotes > 0;
  const isUnanimous = totalVotes >= 2 && (votesA.length === totalVotes || votesB.length === totalVotes);

  // Detect AI beats human
  const hasWinner = winnerIsA || winnerIsB;
  const winnerResp = winnerIsA ? respA : respB;
  const loserResp = winnerIsA ? respB : respA;
  const aiBeatsHuman = hasWinner && winnerResp?.player.type === "AI" && loserResp?.player.type === "HUMAN";
  const isSlopped = isUnanimous && aiBeatsHuman;

  // Fire confetti for unanimous votes
  const confettiFired = useRef(false);
  useEffect(() => {
    if (!isUnanimous || confettiFired.current) return;
    confettiFired.current = true;

    playSound("winner-reveal");

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => {
      if (cancelled) return;
      import("canvas-confetti").then(({ default: confetti }) => {
        if (cancelled) return;
        if (isSlopped) {
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
        } else {
          confetti({
            particleCount: 60,
            spread: 80,
            origin: { y: 0.55 },
            colors: ["#2DD4B8", "#FFD644", "#5DDFC8"],
            startVelocity: 28,
          });
          timers.push(setTimeout(() => {
            if (cancelled) return;
            confetti({
              particleCount: 30,
              spread: 50,
              origin: { x: 0.3, y: 0.5 },
              colors: ["#2DD4B8", "#FFD644"],
              startVelocity: 20,
            });
          }, 300));
        }
      });
    }, 800));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [isUnanimous, isSlopped]);

  if (!respA || !respB) return null;

  // Compute per-response points (vote points + any penalty on the respondent)
  const pointsA = scoreResult
    ? (scoreResult.points[respA.id] ?? 0) + (scoreResult.penalties[respA.playerId] ?? 0)
    : undefined;
  const pointsB = scoreResult
    ? (scoreResult.points[respB.id] ?? 0) + (scoreResult.penalties[respB.playerId] ?? 0)
    : undefined;

  const respondentIds = new Set(prompt.responses.map((r) => r.playerId));

  const abstainVoterIds = new Set(
    filterAbstainVotes(prompt.votes).map((v) => v.voterId),
  );
  const abstainedVoters = players.filter((p) => abstainVoterIds.has(p.id));

  // AI voters that crashed (API error, unsupported structured output, etc.)
  const errorVoterIds = new Set(
    filterErrorVotes(prompt.votes).map((v) => v.voterId),
  );
  const crashedVoters = players.filter((p) => errorVoterIds.has(p.id));

  // Players who never voted at all (disconnected, etc.)
  const allVoterIds = new Set(prompt.votes.map((v) => v.voterId));
  const didntVote = players.filter(
    (p) => !respondentIds.has(p.id) && !allVoterIds.has(p.id),
  );

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6 relative">
      {/* Side-by-side response cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] items-stretch gap-3 lg:gap-4">
        <RevealResponseCard
          response={respA}
          votes={votesA}
          pct={pctA}
          isWinner={winnerIsA}
          isTie={isTie}
          isHostDisplay={isHostDisplay}
          players={players}
          playerNames={playerNames}
          slideFrom="left"
          isLoser={winnerIsB}
          aiBeatsHuman={aiBeatsHuman}
          pointsEarned={pointsA}
        />

        {/* VS divider */}
        <motion.div
          className="flex lg:flex-col items-center justify-center gap-3"
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
          playerNames={playerNames}
          slideFrom="right"
          isLoser={winnerIsA}
          aiBeatsHuman={aiBeatsHuman}
          pointsEarned={pointsB}
        />
      </div>

      {/* SLOPPED! stamp -- dramatic slam-down effect */}
      {isSlopped && (
        <StampWrapper delay={0.6}>
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
        </StampWrapper>
      )}

      {/* FLAWLESS! -- unanimous non-AI win */}
      {isUnanimous && !isSlopped && (
        <StampWrapper delay={0.6}>
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
        </StampWrapper>
      )}

      {/* Lost to the slop -- non-unanimous AI win */}
      {aiBeatsHuman && !isUnanimous && (
        <StampWrapper delay={0.9}>
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
        </StampWrapper>
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

      {/* Crashed voters — AI errors */}
      {crashedVoters.length > 0 && (
        <VoterStatusRow
          label="Crashed:"
          players={crashedVoters}
          chipSize={isHostDisplay ? "lg" : "sm"}
          textSize={isHostDisplay ? "text-sm" : "text-xs"}
          className="border-punch/30 bg-punch/5"
          labelClassName="text-punch/70"
        />
      )}

      {/* Abstained voters */}
      {abstainedVoters.length > 0 && (
        <VoterStatusRow
          label="Abstained:"
          players={abstainedVoters}
          chipSize={isHostDisplay ? "lg" : "sm"}
          textSize={isHostDisplay ? "text-sm" : "text-xs"}
          className="border-edge bg-surface/50"
          labelClassName="text-ink-dim/50"
        />
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

/** Running scoreboard during voting — shows scores updating live as reveals happen. */
function VotingScoreboard({
  players,
  runningScores,
  horizontal = false,
}: {
  players: GamePlayer[];
  runningScores: Map<string, PlayerState>;
  horizontal?: boolean;
}) {
  const sorted = players
    .filter((p) => p.type !== "SPECTATOR")
    .map((p) => ({
      player: p,
      score: runningScores.get(p.id)?.score ?? p.score,
      delta: (runningScores.get(p.id)?.score ?? p.score) - p.score,
    }))
    .sort((a, b) => b.score - a.score);

  if (horizontal) {
    return (
      <div className="flex items-center justify-center gap-4 flex-wrap px-4 py-3 rounded-xl bg-surface/60 backdrop-blur-sm border border-edge">
        <span className="text-xs font-medium text-ui-soft uppercase tracking-wider shrink-0">
          Scores
        </span>
        {sorted.map(({ player, score, delta }) => (
          <motion.div
            key={player.id}
            className="flex items-center gap-1.5"
            layout
          >
            <PlayerAvatar name={player.name} modelId={player.modelId} size={16} />
            <span className="text-xs font-medium text-ink truncate max-w-[5rem]">
              {player.name}
            </span>
            <div className="flex items-center gap-1">
              {delta !== 0 && (
                <motion.span
                  key={delta}
                  className={`text-[10px] font-mono font-bold tabular-nums ${
                    delta > 0 ? "text-teal/70" : "text-punch/70"
                  }`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springBouncy}
                >
                  {formatSigned(delta)}
                </motion.span>
              )}
              <motion.span
                key={score}
                className="font-mono font-bold text-gold text-xs tabular-nums"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={springBouncy}
              >
                {score.toLocaleString()}
              </motion.span>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-[11px] font-medium text-ui-soft uppercase tracking-[0.22em] mb-3">
        Standings
      </h3>
      <div className="space-y-2">
        {sorted.map(({ player, score, delta }, i) => (
          <motion.div
            key={player.id}
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-surface/70 backdrop-blur-sm border border-edge/90"
            layout
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springDefault, delay: i * 0.04 }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-4 shrink-0 text-center font-mono text-[11px] ${
                i === 0 ? "text-gold" : "text-ui-faint"
              }`}>
                {i + 1}
              </span>
              <PlayerAvatar name={player.name} modelId={player.modelId} size={18} />
              <span className={`text-sm font-medium truncate ${
                i === 0 ? "text-ink" : "text-ui-soft"
              }`}>
                {player.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {delta !== 0 && (
                <motion.span
                  key={delta}
                  className={`text-[11px] font-mono font-bold tabular-nums ${
                    delta > 0 ? "text-teal/70" : "text-punch/70"
                  }`}
                  initial={{ opacity: 0, y: -6, scale: 0.5 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={springBouncy}
                >
                  {formatSigned(delta)}
                </motion.span>
              )}
              <motion.span
                key={score}
                className={`font-mono font-bold text-sm tabular-nums ${
                  i === 0 ? "text-gold" : "text-ink"
                }`}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={springBouncy}
              >
                {score.toLocaleString()}
              </motion.span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function VotingPromptStatusPanel({
  prompt,
  players,
  promptIndex,
  totalPrompts,
  isRevealing,
}: {
  prompt: GamePrompt;
  players: GamePlayer[];
  promptIndex: number;
  totalPrompts: number;
  isRevealing: boolean;
}) {
  const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
  const castVotes = filterCastVotes(prompt.votes);
  const abstainVotes = filterAbstainVotes(prompt.votes);
  const errorVotes = filterErrorVotes(prompt.votes);
  const allVoterIds = new Set(prompt.votes.map((v) => v.voterId));
  const missingVoters = players.filter(
    (p) => p.type !== "SPECTATOR" && !respondentIds.has(p.id) && !allVoterIds.has(p.id),
  );
  const respondents = players.filter((p) => respondentIds.has(p.id));

  const rows = [
    { label: "Cast", value: castVotes.length, tone: "text-ink" },
    { label: "Abstain", value: abstainVotes.length, tone: "text-ui-muted" },
    { label: "Errors", value: errorVotes.length, tone: "text-punch" },
    { label: "Missing", value: missingVoters.length, tone: "text-ui-muted" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium text-ink uppercase tracking-[0.22em]">
          Prompt Status
        </h3>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em] ${
          isRevealing
            ? "border-gold/40 bg-gold/10 text-gold"
            : "border-punch/40 bg-punch/10 text-punch"
        }`}>
          {isRevealing ? "Reveal" : "Voting"}
        </span>
      </div>

      <p className="text-xs font-mono text-ui-soft mb-1">
        Prompt {Math.min(promptIndex + 1, Math.max(totalPrompts, 1))}/{Math.max(totalPrompts, 1)}
      </p>
      <p className="text-sm leading-snug text-ink mb-4">
        {prompt.text}
      </p>

      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-ui-soft mb-2">
          {isRevealing ? "Respondents" : "Responses"}
        </p>
        {isRevealing ? (
          <div className="flex flex-wrap gap-1.5">
            {respondents.map((p) => (
              <span key={p.id} className="inline-flex items-center rounded-full border border-edge/90 px-2 py-1 text-xs text-ui-soft bg-surface/55">
                {p.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-edge/80 bg-surface/50 px-3 py-2 text-sm text-ui-muted">
            {prompt.responses.length} anonymous responses (authors revealed after voting)
          </div>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-lg border border-edge/80 bg-surface/55 px-3 py-2">
            <span className="text-xs text-ui-muted">{row.label}</span>
            <span className={`font-mono text-xs font-bold tabular-nums ${row.tone}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
