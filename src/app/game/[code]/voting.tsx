"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GameState, GamePrompt } from "@/lib/types";
import {
  scorePrompt,
  applyScoreResult,
  FORFEIT_MARKER,
  type PlayerState,
  type ScorePromptResult,
} from "@/games/sloplash/scoring";
import { VOTE_PER_PROMPT_SECONDS, REVEAL_SECONDS } from "@/games/sloplash/game-constants";
import { Timer } from "@/components/timer";
import { ErrorBanner } from "@/components/error-banner";
import { fadeInUp, springDefault, buttonTap } from "@/lib/animations";
import { playSound } from "@/lib/sounds";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { ReactionBar } from "@/components/reaction-bar";
import { VsDivider } from "@/components/vs-divider";
import { useConvexRoomSession } from "@/hooks/use-convex-room-session";
import { getConvexErrorMessage } from "@/lib/convex-errors";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useSloplashAdvanceMutation, useSloplashCastVoteMutation } from "@/hooks/use-game-runtime";
import { RevealView, VotingScoreboard } from "./voting-reveal";

function getVotingSkipText(skipping: boolean, revealing: boolean, timersDisabled: boolean): string {
  if (skipping) return "Skipping...";
  if (revealing) return "Next";
  if (timersDisabled) return "End Voting";
  return "Skip Timer";
}

function progressDotClass(index: number, current: number, revealing: boolean): string {
  if (index < current) return "bg-teal w-1.5 h-1.5";
  if (index > current) return "bg-edge-strong w-1.5 h-1.5";
  return revealing ? "bg-gold w-2.5 h-2.5" : "bg-punch w-2.5 h-2.5";
}

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
          animate={i === current ? { scale: [1, 1.2, 1] } : {}}
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
  forceStageView = false,
}: {
  game: GameState;
  playerId: string | null;
  code: string;
  isHost: boolean;
  forceStageView?: boolean;
}) {
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [abstained, setAbstained] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState("");
  const roomSession = useConvexRoomSession(code);
  const playerCapability = roomSession?.playerCapability ?? null;
  const hostCapability = roomSession?.hostCapability ?? null;
  const castConvexVote = useSloplashCastVoteMutation();
  const advanceConvexGame = useSloplashAdvanceMutation();

  const currentRound = game.rounds[0];

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of game.players) map.set(p.id, p.name);
    return map;
  }, [game.players]);

  const votablePrompts = useMemo(() => {
    if (!currentRound) return [];
    return [...currentRound.prompts]
      .filter((p) => p.responses.length >= 2 && !p.responses.some((r) => r.text === FORFEIT_MARKER))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [currentRound]);

  const currentPrompt = votablePrompts[game.votingPromptIndex] ?? null;
  const isRevealing = game.votingRevealing;
  const totalPrompts = votablePrompts.length;

  const { promptScores, runningScores } = useMemo(() => {
    const activePlayers = game.players.filter((p) => p.type !== "SPECTATOR");
    const states = new Map<string, PlayerState>(
      activePlayers.map((p) => [
        p.id,
        { score: p.score, humorRating: p.humorRating, winStreak: p.winStreak },
      ]),
    );
    const scores = new Map<string, ScorePromptResult>();
    const revealedCount = isRevealing ? game.votingPromptIndex + 1 : game.votingPromptIndex;

    for (let i = 0; i < revealedCount; i++) {
      const prompt = votablePrompts[i];
      if (!prompt || prompt.responses.length < 2) continue;

      const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
      const eligibleVoterCount = activePlayers.filter((p) => !respondentIds.has(p.id)).length;

      const result = scorePrompt(
        prompt.responses.map((r) => ({
          id: r.id,
          playerId: r.playerId,
          playerType: r.player.type,
          text: r.text,
        })),
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

  const lastMatchupDeltas = useMemo(() => {
    const deltas = new Map<string, number>();
    const revealedCount = isRevealing ? game.votingPromptIndex + 1 : game.votingPromptIndex;
    const lastPrompt = revealedCount > 0 ? votablePrompts[revealedCount - 1] : null;
    const lastResult = lastPrompt ? promptScores.get(lastPrompt.id) : undefined;
    if (!lastPrompt || !lastResult) return deltas;

    for (const resp of lastPrompt.responses) {
      const pts = lastResult.points[resp.id] ?? 0;
      if (pts !== 0) deltas.set(resp.playerId, (deltas.get(resp.playerId) ?? 0) + pts);
    }
    for (const [playerId, penalty] of Object.entries(lastResult.penalties)) {
      if (penalty !== 0) deltas.set(playerId, (deltas.get(playerId) ?? 0) + penalty);
    }
    return deltas;
  }, [votablePrompts, game.votingPromptIndex, isRevealing, promptScores]);

  const isRespondent = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return currentPrompt.responses.some((r) => r.playerId === playerId);
  }, [currentPrompt, playerId]);

  const hasVotedCurrent = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    return voted.has(currentPrompt.id) || currentPrompt.votes.some((v) => v.voterId === playerId);
  }, [currentPrompt, playerId, voted]);

  const hasAbstainedCurrent = useMemo(() => {
    if (!currentPrompt || !playerId) return false;
    if (abstained.has(currentPrompt.id)) return true;
    if (!isRevealing) return false;
    return currentPrompt.votes.some(
      (v) => v.voterId === playerId && v.responseId == null && v.failReason == null,
    );
  }, [currentPrompt, playerId, abstained, isRevealing]);

  const prevRevealing = useRef(false);
  const skipAnchorRef = useRef<{ promptIndex: number; revealing: boolean } | null>(null);
  useEffect(() => {
    if (isRevealing && !prevRevealing.current) {
      playSound("vote-reveal");
    }
    prevRevealing.current = isRevealing;
  }, [isRevealing]);

  useEffect(() => {
    if (!skipping) return;
    if (game.status !== "VOTING") {
      setSkipping(false);
      skipAnchorRef.current = null;
      return;
    }
    const anchor = skipAnchorRef.current;
    if (!anchor) return;

    const advanced =
      game.votingPromptIndex !== anchor.promptIndex || game.votingRevealing !== anchor.revealing;
    if (!advanced) return;

    setSkipping(false);
    skipAnchorRef.current = null;
  }, [skipping, game.status, game.votingPromptIndex, game.votingRevealing]);

  async function castVote(promptId: string, responseId: string | null) {
    if (!playerCapability) {
      setError("Session expired. Refresh or rejoin the game.");
      return;
    }
    setVoting(true);
    setError("");

    const isAbstain = responseId === null;

    try {
      await castConvexVote({
        capability: playerCapability,
        promptId: promptId as Id<"prompts">,
        responseId: responseId as Id<"responses"> | null,
      });
      if (isAbstain) {
        setAbstained((prev) => new Set(prev).add(promptId));
      } else {
        playSound("vote-cast");
      }
      setVoted((prev) => new Set(prev).add(promptId));
    } catch (cause) {
      setError(getConvexErrorMessage(cause, "Something went wrong"));
    } finally {
      setVoting(false);
    }
  }

  async function skipTimer() {
    if (!hostCapability) {
      setError("Host room access is required to advance the game.");
      return;
    }
    setSkipping(true);
    setError("");
    skipAnchorRef.current = {
      promptIndex: game.votingPromptIndex,
      revealing: game.votingRevealing,
    };
    let keepPending = false;
    try {
      await advanceConvexGame({
        capability: hostCapability,
      });
      keepPending = true;
    } catch (cause) {
      setError(getConvexErrorMessage(cause, "Something went wrong"));
    } finally {
      if (!keepPending) {
        setSkipping(false);
        skipAnchorRef.current = null;
      }
    }
  }

  const player = game.players.find((p) => p.id === playerId);
  const isAI = player?.type === "AI";
  const showHostStageDisplay = !forceStageView && (isAI || !playerId);

  if (showHostStageDisplay) {
    return (
      <HostDisplay
        game={game}
        currentPrompt={currentPrompt}
        isRevealing={isRevealing}
        totalPrompts={totalPrompts}
        playerNames={playerNames}
        scoreResult={currentPromptScore}
        runningScores={runningScores}
        lastMatchupDeltas={lastMatchupDeltas}
        isHost={isHost}
        onSkip={isHost ? () => void skipTimer() : undefined}
        skipping={skipping}
      />
    );
  }

  return (
    <main
      className={`flex-1 flex flex-col items-center px-4 sm:px-6 ${forceStageView ? "py-6 lg:py-5" : "py-8"}`}
    >
      <div className="w-full max-w-lg lg:max-w-none xl:max-w-[1240px] lg:grid lg:grid-cols-[minmax(0,1fr)_280px] xl:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 xl:gap-10">
        <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="min-w-0">
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
                  Prompt {Math.min(game.votingPromptIndex + 1, Math.max(totalPrompts, 1))}/
                  {Math.max(totalPrompts, 1)}
                </p>
              </div>

              {/* Timer — takes remaining space */}
              <div className="min-w-0 flex-1">
                {!game.timersDisabled && (
                  <Timer
                    deadline={game.phaseDeadline}
                    serverNow={game.serverNow}
                    total={isRevealing ? REVEAL_SECONDS : VOTE_PER_PROMPT_SECONDS}
                  />
                )}
              </div>

              {/* Host skip/next — inline with timer */}
              {isHost && (
                <motion.button
                  onClick={() => void skipTimer()}
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

                {(() => {
                  if (isRevealing) {
                    return (
                      <RevealView
                        prompt={currentPrompt}
                        players={game.players}
                        playerNames={playerNames}
                        scoreResult={currentPromptScore}
                      />
                    );
                  }
                  if (forceStageView) {
                    return (
                      <PassiveView
                        sublabel="Players are voting..."
                        color="dim"
                        prompt={currentPrompt}
                        playerId={null}
                        code={code}
                        playerNames={playerNames}
                      />
                    );
                  }
                  if (isRespondent) {
                    return (
                      <PassiveView
                        sublabel="You wrote one of these!"
                        color="gold"
                        prompt={currentPrompt}
                        playerId={playerId}
                        code={code}
                        playerNames={playerNames}
                      />
                    );
                  }
                  if (hasVotedCurrent) {
                    return (
                      <PassiveView
                        sublabel="Waiting for others..."
                        color={hasAbstainedCurrent ? "dim" : "teal"}
                        prompt={currentPrompt}
                        playerId={playerId}
                        code={code}
                        playerNames={playerNames}
                      />
                    );
                  }
                  return (
                    <VoteView
                      prompt={currentPrompt}
                      voting={voting}
                      onVote={castVote}
                      playerId={playerId}
                      code={code}
                      playerNames={playerNames}
                    />
                  );
                })()}
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
              <VotingScoreboard
                players={game.players}
                runningScores={runningScores}
                lastMatchupDeltas={lastMatchupDeltas}
              />
            </div>
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
  lastMatchupDeltas,
  isHost = false,
  onSkip,
  skipping = false,
}: {
  game: GameState;
  currentPrompt: GamePrompt | null;
  isRevealing: boolean;
  totalPrompts: number;
  playerNames: Map<string, string>;
  scoreResult?: ScorePromptResult;
  runningScores: Map<string, PlayerState>;
  lastMatchupDeltas: Map<string, number>;
  isHost?: boolean;
  onSkip?: () => void;
  skipping?: boolean;
}) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 lg:px-16 py-12">
      <div className="w-full max-w-4xl">
        {/* Phase label */}
        <motion.div
          className="text-center mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springDefault}
        >
          <span
            className={`inline-block px-4 py-1 rounded-full text-xs font-bold uppercase tracking-[0.2em] ${
              isRevealing
                ? "bg-gold/20 text-gold border border-gold/40"
                : "bg-punch/20 text-punch border border-punch/40"
            }`}
          >
            {isRevealing ? "Results" : "Vote Now"}
          </span>
        </motion.div>

        {/* Timer — slim */}
        {!game.timersDisabled && (
          <div className="max-w-md mx-auto mb-8">
            <Timer
              deadline={game.phaseDeadline}
              serverNow={game.serverNow}
              total={isRevealing ? REVEAL_SECONDS : VOTE_PER_PROMPT_SECONDS}
            />
          </div>
        )}

        {isHost && onSkip && (
          <div className="max-w-md mx-auto mb-6">
            <motion.button
              onClick={onSkip}
              disabled={skipping}
              className="w-full h-10 px-4 text-sm font-medium text-ink-dim hover:text-ink bg-raised/80 backdrop-blur-sm hover:bg-surface border border-edge rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              {...buttonTap}
            >
              {getVotingSkipText(skipping, isRevealing, game.timersDisabled)}
            </motion.button>
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
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isRevealing ? "bg-gold" : "bg-punch"}`}
                  />
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
          <VotingScoreboard
            players={game.players}
            runningScores={runningScores}
            lastMatchupDeltas={lastMatchupDeltas}
            horizontal
          />
        </motion.div>
      </div>
    </main>
  );
}

/** Host display during voting — shows the two answers without vote buttons. */
function HostVotingView({
  prompt,
  playerNames,
}: {
  prompt: GamePrompt;
  playerNames: Map<string, string>;
}) {
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
        <ReactionBar
          responseId={respA.id}
          reactions={respA.reactions}
          playerId={null}
          code=""
          disabled
          size="lg"
          playerNames={playerNames}
        />
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
        <ReactionBar
          responseId={respB.id}
          reactions={respB.reactions}
          playerId={null}
          code=""
          disabled
          size="lg"
          playerNames={playerNames}
        />
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
          <p className="text-base sm:text-lg lg:text-[1.45rem] leading-snug text-ink group-hover:text-teal transition-colors">
            {respA.text}
          </p>
        </motion.button>
        <ReactionBar
          responseId={respA.id}
          reactions={respA.reactions}
          playerId={playerId}
          code={code}
          playerNames={playerNames}
        />
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
          <p className="text-base sm:text-lg lg:text-[1.45rem] leading-snug text-ink group-hover:text-punch transition-colors">
            {respB.text}
          </p>
        </motion.button>
        <ReactionBar
          responseId={respB.id}
          reactions={respB.reactions}
          playerId={playerId}
          code={code}
          playerNames={playerNames}
        />
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
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${status.chip}`}
            >
              {color === "teal" ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden="true" />
              )}
              <span className="text-[11px] font-mono font-bold uppercase tracking-[0.18em]">
                {color === "gold" ? "Respondent" : color === "teal" ? "Vote Locked" : "Passed"}
              </span>
            </div>
            <p className="text-sm text-ink-dim">{sublabel}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
