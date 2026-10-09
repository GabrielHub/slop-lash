"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import type { SloplashAnswer, SloplashPrompt } from "../../../../convex/sloplash/view";
import { MAX_ANSWER_LENGTH } from "@/games/core/constants";
import { sortPlayersByScore } from "@/games/core/player-rankings";
import { computeAchievements } from "@/games/sloplash/achievements";
import { matchupResult } from "@/games/sloplash/outcomes";
import { CompletionCard } from "@/components/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { CheckIcon, CrownIcon } from "@/components/icons";
import { PulsingDot } from "@/components/pulsing-dot";
import { Timer } from "@/components/timer";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { buttonTap, fadeInUp, floatIn, popIn } from "@/lib/animations";
import { formatSigned, ordinal } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { useModeView, usePlayerName, usePlayers, useRoom, useRoomAction } from "@/room/context";
import { StatusCard } from "@/room/parts";
import { ReactionBar } from "./reaction-bar";
import { AchievementBadge } from "./results";

const COUNT_FROM = 160;

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 flex flex-col items-center px-4 py-6">
      <motion.div
        className="w-full max-w-md space-y-4"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        {children}
      </motion.div>
    </main>
  );
}

/** Writing: my prompts one at a time, then a wait for everyone else. */
export function ControllerWriting() {
  const { players } = useRoom().view;
  const { writing } = useModeView("SLOPLASH");
  const { act, pending, error } = useRoomAction();
  const { triggerElement } = usePixelDissolve();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const prompts = writing?.prompts ?? [];
  const current = prompts.find((prompt) => !prompt.submitted);
  const draft = current ? (drafts[current.id] ?? "") : "";
  const waitingOn = players.length - (writing?.finishedPlayerIds.length ?? 0);

  async function submit() {
    if (!current || !draft.trim() || pending) return;
    if (await act(api.sloplash.play.submitResponse, { promptId: current.id, text: draft.trim() })) {
      playSound("submitted");
    }
  }

  if (prompts.length === 0) {
    return (
      <Screen>
        <StatusCard>
          <PulsingDot>Players are writing their answers...</PulsingDot>
        </StatusCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <Timer />
      {current ? (
        <motion.div
          key={current.id}
          className="p-4 rounded-xl border-2 bg-surface/80 backdrop-blur-md border-edge"
          style={{ boxShadow: "var(--shadow-card)" }}
          variants={floatIn}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-ui-soft">
              Prompt {prompts.indexOf(current) + 1} of {prompts.length}
            </span>
            {draft.length >= COUNT_FROM && (
              <span
                className={`text-xs tabular-nums ${draft.length >= MAX_ANSWER_LENGTH ? "text-punch" : "text-ink-dim/50"}`}
              >
                {draft.length}/{MAX_ANSWER_LENGTH}
              </span>
            )}
          </div>
          <p className="font-display font-semibold text-lg leading-snug text-gold mb-4">
            {current.text}
          </p>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) =>
                setDrafts((previous) => ({ ...previous, [current.id]: event.target.value }))
              }
              placeholder="Your answer..."
              aria-label="Your answer"
              maxLength={MAX_ANSWER_LENGTH}
              disabled={pending}
              autoComplete="off"
              autoCapitalize="sentences"
              enterKeyHint="send"
              className="w-full py-3 px-4 rounded-xl bg-raised/80 border-2 border-edge text-ink placeholder:text-ink-dim/40 focus:outline-none focus:border-punch transition-colors text-base"
            />
            <motion.button
              type="submit"
              onClick={(event) => {
                if (draft.trim()) triggerElement(event.currentTarget);
              }}
              disabled={pending || !draft.trim()}
              className="w-full py-3 bg-punch/90 hover:bg-punch-hover disabled:opacity-40 text-white rounded-xl font-bold transition-colors cursor-pointer disabled:cursor-not-allowed"
              {...buttonTap}
            >
              {pending ? "Sending..." : "Send"}
            </motion.button>
          </form>
        </motion.div>
      ) : (
        <CompletionCard
          title="All submitted!"
          subtitle={
            waitingOn > 0
              ? `Waiting for ${waitingOn} more player${waitingOn === 1 ? "" : "s"}...`
              : "Everyone's in. Voting is next..."
          }
        />
      )}
      <ErrorBanner error={error} className="mt-2" />
    </Screen>
  );
}

function useCurrentPrompt(): SloplashPrompt | undefined {
  const { round, currentPromptId } = useModeView("SLOPLASH");
  return round?.prompts.find((prompt) => prompt.id === currentPromptId);
}

function MatchupHeader({ prompt }: { prompt: SloplashPrompt }) {
  const { room } = useRoom().view;
  const { matchupCount } = useModeView("SLOPLASH");
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-ui-soft mb-1">
        Matchup {room.step + 1} of {matchupCount}
      </p>
      <p className="font-display font-semibold text-xl leading-snug text-gold">{prompt.text}</p>
    </div>
  );
}

/** One answer with its reactions, tagged when it is mine or my pick. */
function AnswerCard({ answer, tag }: { answer: SloplashAnswer; tag?: string }) {
  return (
    <div
      className="rounded-xl border border-edge/90 bg-surface/84 p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {tag && (
        <span className="mb-1.5 inline-block text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-teal">
          {tag}
        </span>
      )}
      <p className="text-base leading-snug text-ink">{answer.text}</p>
      <ReactionBar answer={answer} interactive />
    </div>
  );
}

/** Voting: pick an answer or pass. The two writers sit this matchup out. */
export function ControllerVoting() {
  const me = useRoom().view.me;
  const prompt = useCurrentPrompt();
  const { act, pending, error } = useRoomAction();
  const { triggerElement } = usePixelDissolve();
  if (!prompt || !me?.playerId) {
    return (
      <Screen>
        <StatusCard>
          <PulsingDot>Waiting for the next matchup...</PulsingDot>
        </StatusCard>
      </Screen>
    );
  }

  const mine = prompt.assigneeIds.includes(me.playerId);
  const myVote = prompt.votes.find((vote) => vote.voterId === me.playerId);

  async function vote(responseId: SloplashAnswer["id"] | null) {
    if (pending || !prompt) return;
    if (
      (await act(api.sloplash.play.castVote, { promptId: prompt.id, responseId })) &&
      responseId
    ) {
      playSound("vote-cast");
    }
  }

  if (mine || myVote) {
    const status = mine
      ? {
          chip: "border-gold/40 bg-gold/12 text-gold",
          label: "Your matchup",
          note: "Sit tight while everyone votes.",
        }
      : myVote?.responseId
        ? {
            chip: "border-teal/45 bg-teal/12 text-teal",
            label: "Vote locked",
            note: "Waiting for the others...",
          }
        : {
            chip: "border-edge-strong/60 bg-raised/70 text-ui-soft",
            label: "Passed",
            note: "Waiting for the others...",
          };
    return (
      <Screen>
        <Timer />
        <MatchupHeader prompt={prompt} />
        <motion.div
          className="flex flex-col items-center gap-2 py-2 text-center"
          variants={popIn}
          initial="hidden"
          animate="visible"
        >
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.18em] ${status.chip}`}
          >
            {myVote?.responseId && <CheckIcon size={14} />}
            {status.label}
          </span>
          <p className="text-sm text-ink-dim">{status.note}</p>
        </motion.div>
        {prompt.answers.map((answer) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            tag={
              answer.playerId === me.playerId
                ? "Yours"
                : answer.id === myVote?.responseId
                  ? "Your pick"
                  : undefined
            }
          />
        ))}
      </Screen>
    );
  }

  return (
    <Screen>
      <Timer />
      <MatchupHeader prompt={prompt} />
      <p className="text-sm text-ink-dim">Tap the funnier answer.</p>
      {prompt.answers.map((answer, index) => (
        <div key={answer.id}>
          <motion.button
            type="button"
            onClick={(event) => {
              triggerElement(event.currentTarget);
              void vote(answer.id);
            }}
            disabled={pending}
            className={`w-full min-h-[112px] p-5 rounded-2xl bg-surface/92 backdrop-blur-md border-2 border-edge/90 text-left transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed group ${
              index === 0
                ? "hover:border-teal hover:bg-teal-soft"
                : "hover:border-punch hover:bg-fail-soft"
            }`}
            style={{ boxShadow: "var(--shadow-card)" }}
            initial={{ opacity: 0, x: index === 0 ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="text-lg leading-snug text-ink">{answer.text}</span>
          </motion.button>
          <ReactionBar answer={answer} interactive />
        </div>
      ))}
      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={() => void vote(null)}
          disabled={pending}
          className="px-4 py-2 text-sm text-ui-soft hover:text-ink transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Pass
        </button>
      </div>
      <ErrorBanner error={error} className="mt-2" />
    </Screen>
  );
}

/** Reveal: how the matchup went for me, and reactions while it is on screen. */
export function ControllerReveal() {
  const { byId } = usePlayers();
  const playerName = usePlayerName();
  const me = useRoom().view.me;
  const prompt = useCurrentPrompt();
  if (!prompt) return null;

  const result = matchupResult(prompt, (id) => byId(id)?.type);
  const mineEntry = result.answers.find((entry) => entry.answer.playerId === me?.playerId);
  const myVote = prompt.votes.find((vote) => vote.voterId === me?.playerId);
  const winner = result.answers.find((entry) => entry.isWinner);
  const verdict = mineEntry
    ? mineEntry.isWinner
      ? `You won! ${formatSigned(mineEntry.points)}`
      : result.isTie
        ? `A tie. ${formatSigned(mineEntry.points)}`
        : `Not this time. ${formatSigned(mineEntry.points)}`
    : myVote?.responseId && winner
      ? myVote.responseId === winner.answer.id
        ? "You backed the winner."
        : "The room disagreed with you."
      : null;

  return (
    <Screen>
      <MatchupHeader prompt={prompt} />
      {verdict && (
        <motion.p
          className="text-center font-display font-bold text-2xl text-ink"
          variants={popIn}
          initial="hidden"
          animate="visible"
        >
          {verdict}
        </motion.p>
      )}
      {result.answers.map((entry) => (
        <div
          key={entry.answer.id}
          className={`rounded-xl border-2 p-4 ${
            entry.isWinner ? "border-teal bg-teal-soft/80" : "border-edge bg-surface/80"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-base leading-snug text-ink">{entry.answer.text}</p>
            <span className="shrink-0 font-mono font-bold tabular-nums text-ink-dim">
              {entry.pct}%
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-dim">
            {entry.isWinner && <CrownIcon className="w-3.5 h-3.5 text-teal" />}
            {playerName(entry.answer.playerId)}
            {entry.answer.playerId === me?.playerId && " (you)"}
          </p>
          <ReactionBar answer={entry.answer} interactive />
        </div>
      ))}
    </Screen>
  );
}

function usePlacement() {
  const { players, me } = useRoom().view;
  const ranked = sortPlayersByScore(players);
  const mine = ranked.find((player) => player.id === me?.playerId);
  // Ties share a place: 1st, 2nd, 2nd, 4th.
  const place = mine ? ranked.filter((player) => player.score > mine.score).length + 1 : 0;
  return { ranked, place, me: mine };
}

/** Between rounds: my score and place. */
export function ControllerRoundResults() {
  const { room } = useRoom().view;
  const { round } = useModeView("SLOPLASH");
  const { ranked, place, me } = usePlacement();
  if (!me) return null;
  const prompts = round?.prompts ?? [];
  const earned =
    prompts
      .flatMap((prompt) => prompt.answers)
      .filter((answer) => answer.playerId === me.id)
      .reduce((sum, answer) => sum + answer.pointsEarned + answer.penalty, 0) +
    prompts
      .flatMap((prompt) => prompt.votes)
      .filter((vote) => vote.voterId === me.id)
      .reduce((sum, vote) => sum + vote.penalty, 0);

  return (
    <Screen>
      <div className="rounded-2xl border-2 border-edge bg-surface/80 p-6 text-center">
        <p className="text-sm text-ink-dim">Round {room.round} · you&apos;re in</p>
        <p className="font-display font-black text-5xl text-gold mt-1">{ordinal(place)}</p>
        <p className="text-sm text-ink-dim">of {ranked.length}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <p className="font-mono font-bold text-2xl tabular-nums text-ink">
              {me.score.toLocaleString()}
            </p>
            <p className="text-xs text-ink-dim">Total</p>
          </div>
          <div>
            <p
              className={`font-mono font-bold text-2xl tabular-nums ${earned > 0 ? "text-teal" : "text-ink-dim"}`}
            >
              {formatSigned(earned)}
            </p>
            <p className="text-xs text-ink-dim">This round</p>
          </div>
        </div>
      </div>
      <div className="text-center">
        <PulsingDot>
          <span className="text-sm">
            {room.round >= room.totalRounds
              ? "Final results are up next..."
              : "Next round starts soon..."}
          </span>
        </PulsingDot>
      </div>
    </Screen>
  );
}

/** The end: where I finished and what I won. */
export function ControllerFinal() {
  const { players } = useRoom().view;
  const { rounds } = useModeView("SLOPLASH");
  const { ranked, place, me } = usePlacement();
  if (!me) return null;
  const awards = computeAchievements(rounds, players).filter((award) => award.playerId === me.id);

  return (
    <Screen>
      <motion.div
        className="rounded-2xl border-2 border-gold/40 bg-surface/80 p-6 text-center"
        variants={popIn}
        initial="hidden"
        animate="visible"
      >
        <p className="text-sm text-ink-dim">You placed</p>
        <p className="font-display font-black text-6xl text-gold mt-1">{ordinal(place)}</p>
        <p className="text-sm text-ink-dim">
          of {ranked.length} with{" "}
          <span className="font-mono font-bold text-ink">{me.score.toLocaleString()}</span> points
        </p>
      </motion.div>
      {awards.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {awards.map((award, index) => (
            <AchievementBadge key={award.achievement.id} award={award} index={index} />
          ))}
        </div>
      )}
    </Screen>
  );
}
