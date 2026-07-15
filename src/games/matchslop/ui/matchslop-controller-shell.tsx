"use client";

import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { ErrorBanner } from "@/components/error-banner";
import { Timer } from "@/components/timer";
import { CompletionCard } from "@/components/completion-card";
import { PulsingDot } from "@/components/pulsing-dot";
import {
  fadeInUp,
  phaseTransition,
  collapseExpand,
  buttonTap,
  buttonTapPrimary,
  springDefault,
} from "@/lib/animations";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { getMatchSlopTimerTotal } from "@/games/matchslop/config/game-config";
import { TypingIndicator, ProgressCount } from "./matchslop-shared-ui";
import { ProfileCard } from "./matchslop-profile-components";
import type { Outcome } from "./matchslop-stage-primitives";

import {
  ControllerTranscript,
  MatchHeader,
  OpenerPromptPicker,
  OpenerVotingList,
  OpenerWriteStep,
} from "./matchslop-controller-components";
import type { MatchSlopControllerShellFixture } from "./matchslop-controller-fixture";
import { useMatchSlopController } from "./use-matchslop-controller";
export type { MatchSlopControllerShellFixture } from "./matchslop-controller-fixture";

export function MatchSlopControllerShell({
  code,
  fixture,
}: {
  code: string;
  fixture?: MatchSlopControllerShellFixture;
}) {
  const { triggerElement } = usePixelDissolve();
  const {
    actionError,
    activePlayerCount,
    canEndGame,
    capability,
    castVote,
    currentVotePrompt,
    endingGame,
    gameStarted,
    gameState,
    handleEndGame,
    hasSubmittedCurrent,
    hasVotedCurrent,
    hostActionBusy,
    isComebackRound,
    isHost,
    isInitialProfileFailed,
    isInitialProfilePending,
    isOpenerRound,
    isOpenerVoting,
    matchslop,
    openerPromptById,
    openerStep,
    personaAction,
    personaName,
    postHostAction,
    postPersonaAction,
    promptOptions,
    responseText,
    selectedOption,
    setOpenerStep,
    setResponseText,
    setSelectedPromptId,
    setShowPersonaSheet,
    showPersonaButton,
    showPersonaSheet,
    submitResponse,
    submittingPromptId,
    votingBusy,
  } = useMatchSlopController(code, fixture);

  if (!fixture && !capability) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <p className="text-fail font-display font-bold text-xl">
            Open this room from the host or join screen
          </p>
        </main>
      </>
    );
  }

  if (!gameState) {
    return (
      <>
        <MatchHeader roomCode={null} roundLabel="Controller" />
        <main className="min-h-svh flex items-center justify-center px-6 pt-14">
          <div className="w-8 h-8 rounded-full border-2 border-edge border-t-punch animate-spin" />
        </main>
      </>
    );
  }

  const roundLabel =
    gameState.status === "LOBBY"
      ? "Controller"
      : isComebackRound
        ? "Comeback Round"
        : `Round ${gameState.currentRound}/${gameState.totalRounds}`;
  const canHostAdvance =
    isHost &&
    (gameState.status === "WRITING" ||
      gameState.status === "VOTING" ||
      gameState.status === "ROUND_RESULTS") &&
    !isInitialProfilePending &&
    !isInitialProfileFailed;

  return (
    <>
      <MatchHeader roomCode={gameState.roomCode} roundLabel={roundLabel} />
      <main className="min-h-svh flex flex-col items-center px-4 py-6 pt-16">
        <motion.div
          className="w-full max-w-md"
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
        >
          <div className="mb-4 text-center">
            <h1 className="font-display text-2xl font-bold text-ink">
              {gameState.status === "LOBBY" && "Lobby"}
              {gameState.status === "WRITING" && (isComebackRound ? "Comeback Round" : "Write")}
              {gameState.status === "VOTING" && (isComebackRound ? "Comeback Vote" : "Vote")}
              {gameState.status === "ROUND_RESULTS" &&
                (isComebackRound ? "Comeback Results" : "Round Results")}
              {gameState.status === "FINAL_RESULTS" &&
                (matchslop?.outcome === "COMEBACK" ? "Partial Win" : "Game Over")}
            </h1>
          </div>

          <AnimatePresence>
            {((gameState.phaseDeadline && !gameState.timersDisabled) ||
              (gameState.status === "WRITING" && !!matchslop?.progressCount) ||
              (gameState.status === "VOTING" && !!matchslop?.voteProgressCount)) && (
              <motion.div
                key="timer"
                className="mb-4"
                variants={collapseExpand}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="flex items-center gap-2">
                  {gameState.phaseDeadline && !gameState.timersDisabled && (
                    <div className="flex-1">
                      <Timer
                        deadline={gameState.phaseDeadline}
                        serverNow={gameState.serverNow}
                        total={getMatchSlopTimerTotal(gameState.status)}
                      />
                    </div>
                  )}
                  {gameState.status === "WRITING" && matchslop?.progressCount && (
                    <ProgressCount
                      count={matchslop.progressCount.submitted}
                      total={matchslop.progressCount.total}
                      label="in"
                    />
                  )}
                  {gameState.status === "VOTING" && matchslop?.voteProgressCount && (
                    <ProgressCount
                      count={matchslop.voteProgressCount.voted}
                      total={matchslop.voteProgressCount.total}
                      label="voted"
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {gameState.status === "LOBBY" && (
                <motion.div
                  key="phase-lobby"
                  className="space-y-4"
                  variants={phaseTransition}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div className="rounded-2xl bg-teal-soft/50 border border-teal/20 p-6 text-center">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-teal font-bold mb-2">
                      Room Code
                    </p>
                    <p className="font-mono text-4xl font-black tracking-[0.25em] text-teal">
                      {gameState.roomCode}
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-ink-dim">
                    <span className="w-1.5 h-1.5 rounded-full bg-punch animate-pulse" />
                    <span className="font-medium">
                      {activePlayerCount} player{activePlayerCount !== 1 ? "s" : ""} connected
                    </span>
                  </div>
                  {isHost ? (
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        triggerElement(e.currentTarget);
                        void postHostAction("start");
                      }}
                      disabled={hostActionBusy || activePlayerCount < 2}
                      className="w-full bg-punch hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed shadow-sm"
                      {...buttonTapPrimary}
                    >
                      {hostActionBusy
                        ? "Starting..."
                        : activePlayerCount < 2
                          ? "Need more players"
                          : "Start Game"}
                    </motion.button>
                  ) : (
                    <div className="text-center py-3">
                      <PulsingDot>Waiting for the host to start the game...</PulsingDot>
                    </div>
                  )}
                </motion.div>
              )}

              {gameState.status === "WRITING" && (
                <motion.div
                  key="phase-writing"
                  className="space-y-4"
                  variants={phaseTransition}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <AnimatePresence mode="wait">
                    {isInitialProfilePending ? (
                      <motion.div
                        key="write-profile-pending"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <CompletionCard
                          title="Building profile"
                          subtitle="The persona is still generating. Writing opens as soon as the prompts are ready."
                        />
                      </motion.div>
                    ) : isInitialProfileFailed ? (
                      <motion.div
                        key="write-profile-failed"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <CompletionCard
                          title="Profile failed"
                          subtitle={
                            isHost
                              ? "Persona generation failed. Retry it from here or end the game."
                              : "The persona could not be generated. Ask the host to retry or end the game."
                          }
                        />
                        {isHost && (
                          <motion.button
                            type="button"
                            onClick={() => void postPersonaAction("generate")}
                            disabled={personaAction != null}
                            className="mt-3 w-full py-3 rounded-2xl border border-edge/60 bg-white/70 font-display font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ color: "var(--ms-ink)" }}
                            {...buttonTap}
                          >
                            {personaAction === "generate" ? "Retrying..." : "Retry Persona"}
                          </motion.button>
                        )}
                      </motion.div>
                    ) : hasSubmittedCurrent ? (
                      <motion.div
                        key="write-submitted"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <CompletionCard
                          title="Submitted!"
                          subtitle={
                            isComebackRound
                              ? "Waiting to see if the room can save this."
                              : "Waiting for everyone else to write."
                          }
                        />
                      </motion.div>
                    ) : isOpenerRound ? (
                      /* ── Opener: two-step pick → write ── */
                      <AnimatePresence mode="wait">
                        {openerStep === "pick" ? (
                          <OpenerPromptPicker
                            key="picker"
                            options={promptOptions}
                            personaName={personaName}
                            onPick={(option) => {
                              setSelectedPromptId(option.id);
                              setOpenerStep("write");
                            }}
                          />
                        ) : selectedOption ? (
                          <OpenerWriteStep
                            key="write"
                            selectedOption={selectedOption}
                            responseText={responseText}
                            onChangeText={setResponseText}
                            onSubmit={() => {
                              if (matchslop?.writing?.promptId) {
                                void submitResponse(matchslop.writing.promptId);
                              }
                            }}
                            onBack={() => setOpenerStep("pick")}
                            submitting={submittingPromptId === matchslop?.writing?.promptId}
                            disabled={
                              !responseText.trim() ||
                              !matchslop?.writing?.promptId ||
                              submittingPromptId === matchslop?.writing?.promptId
                            }
                            triggerElement={triggerElement}
                          />
                        ) : null}
                      </AnimatePresence>
                    ) : (
                      /* ── Follow-up rounds: single-step write ── */
                      <div className="space-y-4">
                        <div
                          className="rounded-2xl p-4"
                          style={{
                            background: "var(--ms-raised)",
                            border: "1px solid var(--ms-edge)",
                          }}
                        >
                          <p
                            className="text-xs uppercase tracking-wider mb-2 font-bold"
                            style={{ color: "var(--ms-ink-dim)" }}
                          >
                            {isComebackRound ? "One last shot" : "Reply to"}
                          </p>
                          <p
                            className="font-display font-semibold text-sm leading-snug"
                            style={{ color: "var(--ms-rose)" }}
                          >
                            {matchslop?.writing?.text ?? "Write the funniest reply."}
                          </p>
                        </div>

                        {/* Persona signal card */}
                        {matchslop?.latestNextSignal && (
                          <motion.div
                            className="rounded-xl flex items-start gap-2"
                            style={{
                              padding: "0.5rem 0.75rem",
                              background: "color-mix(in srgb, var(--ms-coral) 8%, transparent)",
                              border:
                                "1px solid color-mix(in srgb, var(--ms-coral) 20%, transparent)",
                            }}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 24,
                              delay: 0.15,
                            }}
                          >
                            {matchslop.latestSignalCategory && (
                              <span
                                className="font-mono font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded-md"
                                style={{
                                  fontSize: "9px",
                                  color: "var(--ms-coral)",
                                  background: "var(--ms-coral-soft)",
                                }}
                              >
                                {matchslop.latestSignalCategory}
                              </span>
                            )}
                            <div className="min-w-0">
                              {matchslop.latestSideComment && (
                                <p
                                  className="text-[11px] leading-snug mb-1 italic"
                                  style={{ color: "var(--ms-ink-dim)", opacity: 0.85 }}
                                >
                                  &ldquo;{matchslop.latestSideComment}&rdquo;
                                </p>
                              )}
                              <p
                                className="text-xs leading-snug italic"
                                style={{ color: "var(--ms-ink-dim)" }}
                              >
                                {matchslop.latestNextSignal}
                              </p>
                            </div>
                          </motion.div>
                        )}
                        <div className="space-y-3">
                          <input
                            type="text"
                            value={responseText}
                            onChange={(e) => setResponseText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && matchslop?.writing?.promptId) {
                                void submitResponse(matchslop.writing.promptId);
                              }
                            }}
                            placeholder={
                              isComebackRound
                                ? "Type the line that saves the match..."
                                : "Type your funniest reply..."
                            }
                            maxLength={300}
                            className="w-full py-3.5 px-4 rounded-2xl text-base focus:outline-none transition-colors"
                            style={{
                              background: "var(--ms-raised)",
                              border: "2px solid var(--ms-edge)",
                              color: "var(--ms-ink)",
                            }}
                          />
                          <motion.button
                            type="button"
                            onClick={(e) => {
                              triggerElement(e.currentTarget);
                              if (matchslop?.writing?.promptId) {
                                void submitResponse(matchslop.writing.promptId);
                              }
                            }}
                            disabled={
                              !responseText.trim() ||
                              !matchslop?.writing?.promptId ||
                              submittingPromptId === matchslop?.writing?.promptId
                            }
                            className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                              background: "var(--ms-gradient-romance)",
                              boxShadow: !responseText.trim()
                                ? "none"
                                : "0 4px 20px var(--ms-rose-glow)",
                            }}
                            {...buttonTapPrimary}
                          >
                            {submittingPromptId === matchslop?.writing?.promptId
                              ? "Sending..."
                              : isComebackRound
                                ? "Send comeback"
                                : "Send"}
                          </motion.button>
                        </div>
                      </div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {gameState.status === "VOTING" && (
                <motion.div
                  key="phase-voting"
                  className="space-y-4"
                  variants={phaseTransition}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <AnimatePresence mode="wait">
                    {gameState.votingRevealing ? (
                      <motion.div
                        key="vote-revealing"
                        className="rounded-2xl p-6 text-center"
                        style={{
                          background: "var(--ms-raised)",
                          border: "1px solid var(--ms-edge)",
                        }}
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <div className="flex items-center justify-center mb-2">
                          <TypingIndicator />
                        </div>
                        <p
                          className="font-display font-bold text-sm"
                          style={{ color: "var(--ms-ink)" }}
                        >
                          Resolving...
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--ms-ink-dim)" }}>
                          Tallying votes and sending the winning line
                        </p>
                      </motion.div>
                    ) : !currentVotePrompt ? (
                      <motion.div
                        key="vote-waiting"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <CompletionCard
                          title="Waiting"
                          subtitle="The next ballot is not ready yet."
                        />
                      </motion.div>
                    ) : hasVotedCurrent ? (
                      <motion.div
                        key="vote-cast"
                        className="space-y-3"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <div
                          className="rounded-2xl p-4"
                          style={{
                            background: "var(--ms-raised)",
                            border: "1px solid var(--ms-edge)",
                          }}
                        >
                          <p
                            className="font-display font-semibold text-lg mb-2"
                            style={{ color: "var(--ms-violet)" }}
                          >
                            Vote cast!
                          </p>
                          <PulsingDot>
                            {isComebackRound
                              ? "Waiting to see if the room saved it..."
                              : "Waiting on other players..."}
                          </PulsingDot>
                        </div>
                      </motion.div>
                    ) : isOpenerVoting ? (
                      <motion.div
                        key="vote-opener"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <OpenerVotingList
                          responses={currentVotePrompt.responses}
                          openerPromptById={openerPromptById}
                          forfeitCount={currentVotePrompt.forfeitCount}
                          votingBusy={votingBusy}
                          onVote={(responseId) => void castVote(currentVotePrompt.id, responseId)}
                          onPass={() => void castVote(currentVotePrompt.id, null)}
                          triggerElement={triggerElement}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="vote-standard"
                        className="space-y-3"
                        variants={phaseTransition}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                      >
                        <div
                          className="rounded-2xl p-4"
                          style={{
                            background: "var(--ms-raised)",
                            border: "1px solid var(--ms-edge)",
                          }}
                        >
                          <p
                            className="text-xs uppercase tracking-wider mb-2 font-bold"
                            style={{ color: "var(--ms-violet)" }}
                          >
                            {isComebackRound
                              ? "Vote for the line that saves it"
                              : "Vote for the funniest reply"}
                          </p>
                          <p
                            className="font-display font-semibold text-sm leading-snug mb-1"
                            style={{ color: "var(--ms-rose)" }}
                          >
                            {currentVotePrompt.text}
                          </p>
                          <p className="text-xs" style={{ color: "var(--ms-ink-dim)" }}>
                            {isComebackRound
                              ? "Pick the follow-up that gives the room the best chance to claw this back."
                              : "Votes become points, even for strong runner-ups. Human votes count double."}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {currentVotePrompt.responses.map((resp) => (
                            <motion.button
                              key={resp.id}
                              type="button"
                              onClick={(e) => {
                                triggerElement(e.currentTarget);
                                void castVote(currentVotePrompt.id, resp.id);
                              }}
                              disabled={votingBusy}
                              className="w-full text-left py-3 px-4 rounded-2xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{
                                background: "var(--ms-raised)",
                                border: "2px solid var(--ms-edge)",
                              }}
                              whileHover={{
                                borderColor: "var(--ms-violet)",
                              }}
                              whileTap={{ scale: 0.97 }}
                            >
                              <span
                                className="text-[15px] leading-relaxed"
                                style={{ color: "var(--ms-ink)" }}
                              >
                                {resp.text}
                              </span>
                            </motion.button>
                          ))}
                          <motion.button
                            type="button"
                            onClick={(e) => {
                              triggerElement(e.currentTarget);
                              void castVote(currentVotePrompt.id, null);
                            }}
                            disabled={votingBusy}
                            className="w-full py-2.5 rounded-2xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                              border: "1px solid var(--ms-edge)",
                              color: "var(--ms-ink-dim)",
                            }}
                            {...buttonTap}
                          >
                            Pass
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {gameState.status === "ROUND_RESULTS" && (
                <motion.div
                  key="phase-round-results"
                  className="space-y-4"
                  variants={phaseTransition}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <div className="rounded-2xl border border-edge bg-surface/70 p-5 text-center">
                    <p className="font-display font-bold text-lg text-ink mb-2">
                      {isComebackRound
                        ? "Comeback Round Complete"
                        : `Round ${gameState.currentRound} Complete`}
                    </p>
                    <PulsingDot>
                      {isComebackRound
                        ? "The main screen is revealing whether the room saved it."
                        : "Round results are on the main screen."}
                    </PulsingDot>

                    {(matchslop?.latestSignalCategory ||
                      matchslop?.latestSideComment ||
                      (matchslop?.latestMoodDelta != null && matchslop.latestMoodDelta !== 0)) && (
                      <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                        {matchslop?.latestSignalCategory && (
                          <span
                            className="font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{
                              fontSize: "10px",
                              color: "var(--ms-coral)",
                              background: "var(--ms-coral-soft)",
                            }}
                          >
                            {matchslop.latestSignalCategory}
                          </span>
                        )}
                        {matchslop?.latestSideComment && (
                          <span className="text-xs italic" style={{ color: "var(--ms-ink-dim)" }}>
                            &ldquo;{matchslop.latestSideComment}&rdquo;
                          </span>
                        )}
                        {matchslop?.latestMoodDelta != null && matchslop.latestMoodDelta !== 0 && (
                          <span
                            className="font-mono font-bold tabular-nums px-1.5 py-0.5 rounded-md"
                            style={{
                              fontSize: "10px",
                              color:
                                matchslop.latestMoodDelta > 0 ? "var(--ms-mint)" : "var(--ms-red)",
                              background:
                                matchslop.latestMoodDelta > 0
                                  ? "var(--ms-mint-soft)"
                                  : "var(--ms-red-soft)",
                            }}
                          >
                            {matchslop.latestMoodDelta > 0
                              ? `+${matchslop.latestMoodDelta}`
                              : matchslop.latestMoodDelta}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {isHost ? (
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        triggerElement(e.currentTarget);
                        void postHostAction("next");
                      }}
                      disabled={hostActionBusy}
                      className="w-full bg-punch/90 hover:bg-punch-hover disabled:opacity-50 text-white font-display font-bold py-4 rounded-2xl text-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                      {...buttonTapPrimary}
                    >
                      {hostActionBusy
                        ? "Advancing..."
                        : isComebackRound
                          ? "Show Ending"
                          : "Next Round"}
                    </motion.button>
                  ) : (
                    <div className="text-center py-2">
                      <PulsingDot>
                        {isComebackRound
                          ? "Waiting for host to reveal the ending..."
                          : "Waiting for host to continue..."}
                      </PulsingDot>
                    </div>
                  )}
                </motion.div>
              )}

              {gameState.status === "FINAL_RESULTS" && (
                <motion.div
                  key="phase-final-results"
                  className="space-y-4"
                  variants={phaseTransition}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <ControllerTranscript
                    transcript={matchslop?.transcript ?? []}
                    outcome={matchslop?.outcome}
                  />

                  <Link
                    href={isHost ? "/host" : "/join"}
                    className="block text-center py-3 rounded-2xl transition-colors"
                    style={{
                      border: "1px solid var(--ms-edge)",
                      color: "var(--ms-ink-dim)",
                    }}
                  >
                    {isHost ? "Host Another Game" : "Join Another Game"}
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {canHostAdvance &&
                (gameState.status === "WRITING" || gameState.status === "VOTING") && (
                  <motion.div
                    key="force-advance"
                    className="mt-5 pt-4 border-t border-edge/50"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={springDefault}
                  >
                    <motion.button
                      type="button"
                      onClick={(e) => {
                        triggerElement(e.currentTarget);
                        void postHostAction("next");
                      }}
                      disabled={hostActionBusy}
                      className="w-full py-3 rounded-2xl border-2 border-dashed border-punch/30 text-punch/80 hover:text-punch hover:border-punch/50 hover:bg-punch/5 font-display font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      {...buttonTap}
                    >
                      {hostActionBusy ? "Working..." : "Force Advance"}
                    </motion.button>
                  </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
              {canEndGame && (
                <motion.div
                  key="end-game"
                  className="mt-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={springDefault}
                >
                  <motion.button
                    type="button"
                    onClick={() => void handleEndGame()}
                    disabled={endingGame}
                    className="w-full py-3 rounded-2xl border text-sm font-display font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      borderColor: "var(--ms-red-soft)",
                      color: "var(--ms-red)",
                      background: "transparent",
                    }}
                    {...buttonTap}
                  >
                    {endingGame ? "Ending..." : "End Game"}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {actionError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <ErrorBanner error={actionError} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      {/* Floating "View Persona" button */}
      <AnimatePresence>
        {showPersonaButton && !showPersonaSheet && (
          <motion.button
            key="persona-fab"
            type="button"
            onClick={() => setShowPersonaSheet(true)}
            className="fixed bottom-6 right-4 z-30 w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
            style={{
              background: "var(--ms-gradient-romance)",
              boxShadow: "0 4px 20px var(--ms-rose-glow)",
            }}
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            transition={springDefault}
            whileTap={{ scale: 0.9 }}
            aria-label="View persona profile"
          >
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Persona profile bottom sheet */}
      <AnimatePresence>
        {showPersonaSheet && matchslop?.profile && (
          <motion.div
            key="persona-sheet"
            className="fixed inset-0 z-50 flex flex-col justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
              onClick={() => setShowPersonaSheet(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Sheet */}
            <motion.div
              className="relative z-10 rounded-t-3xl overflow-hidden flex flex-col"
              style={{ maxHeight: "92svh", background: "var(--ms-base)" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              {/* Grab handle */}
              <div className="flex items-center justify-center pt-3 pb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPersonaSheet(false)}
                  className="w-10 h-1 rounded-full cursor-pointer"
                  style={{ background: "var(--ms-edge-strong)" }}
                  aria-label="Close"
                />
              </div>

              {/* Scrollable profile */}
              <div className="overflow-y-auto overscroll-contain px-3 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <ProfileCard
                  profile={matchslop.profile}
                  personaImage={matchslop.profile.image}
                  profileGeneration={matchslop.profileGeneration ?? null}
                  outcome={matchslop.outcome as Outcome}
                  mood={matchslop.mood ?? 50}
                  moodDelta={matchslop.latestMoodDelta}
                  gameStarted={gameStarted}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
