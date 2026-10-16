"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ErrorBanner } from "@/components/error-banner";
import { CrownIcon } from "@/components/icons";
import { formatDelta, formatPoints, ordinal } from "@/lib/format";
import { SPRING, collapse, enter, pop, press } from "@/lib/animations";
import { useRoom, useRoomAction } from "@/room/context";
import { CountUp, Stamp, buzz, useMoment, type MomentCue } from "@/room/moment";
import { DoneTracker } from "@/room/parts";
import { ReactionStrip } from "@/room/reaction-strip";
import { CALL_SLOP_POINTS, QUIZSLOP_REACTIONS } from "../game-constants";
import { dealTopics } from "../deck";
import {
  ALERT_COLLAPSE_MS,
  GAME_START_CARD_MS,
  OPENER,
  REVEAL,
  RESULTS,
  TALLY,
  TAP_GUARD_MS,
  TITLE_CARD_MS,
} from "./beats";
import {
  AWARD_LABELS,
  CHOICE_LETTERS,
  CheckIcon,
  PlayerAvatar,
  finalModel,
  isOpeningPhase,
  joinNames,
  resultRows,
  sequence,
  useMySeat,
  useNames,
  useQuizslop,
  useQuizslopReactions,
  useRevealStep,
} from "./shared";

const BET = formatPoints(CALL_SLOP_POINTS);
const MINUS_BET = formatDelta(-CALL_SLOP_POINTS);
/**
 * The "bets you'll miss" buzz waits this long, so the shell's short your-turn
 * buzz at phase start doesn't cancel it.
 */
const TARGET_BUZZ_MS = 150;
/** After the "bets you'll miss" alert collapses, choices wait this long before taking taps. */
const ALERT_GUARD_MS = 250;

function betsLeft(tokens: number) {
  return tokens <= 0 ? "No bets left" : tokens === 1 ? "1 bet left" : `${tokens} bets left`;
}

/** True once `ms` has passed since mount and `blocked` last turned false. */
function useArmedAfter(ms: number, blocked = false) {
  const [armed, setArmed] = useState(false);
  const [wasBlocked, setWasBlocked] = useState(blocked);
  if (wasBlocked !== blocked) {
    setWasBlocked(blocked);
    setArmed(false);
  }
  useEffect(() => {
    if (blocked) return;
    const timer = window.setTimeout(() => setArmed(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms, blocked]);
  return armed && !blocked;
}

/** A phone screen: content on top, the one action anchored in the thumb zone. */
function Screen({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-6">
      {children}
      {action && (
        <div className="sticky bottom-0 z-10 mt-auto -mx-4 bg-canvas/95 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {action}
        </div>
      )}
    </div>
  );
}

/** A centred status screen: what to look at, and nothing to do. */
function Status({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="font-display text-2xl text-ink">{title}</div>
      {children}
    </div>
  );
}

function EyesOnTv() {
  return <p className="text-base text-ink-dim">Eyes on the TV</p>;
}

/* ─── Lobby: the topic deal ─── */

export function ControllerLobby() {
  const { view } = useRoom();
  const { lobby } = useQuizslop();
  const { meId } = useMySeat();
  const { act, pending, error } = useRoomAction();
  const [shuffle, setShuffle] = useState(0);
  const [reopened, setReopened] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  if (!lobby || !meId) return null;

  const mine = lobby.topics.find((topic) => topic.claimedBy === meId) ?? null;
  const label = (id: string) => lobby.topics.find((topic) => topic.id === id)?.label ?? "";

  if (mine && !reopened) {
    return (
      <motion.div
        variants={pop}
        initial="hidden"
        animate="visible"
        className="flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-teal bg-teal-soft py-2 pr-1 pl-4"
      >
        <CheckIcon className="size-5 shrink-0 text-teal" />
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className="text-xs font-semibold tracking-wider text-teal uppercase">
            Your topic
          </span>
          <span className="truncate font-display text-lg font-bold text-ink">{mine.label}</span>
        </span>
        <button
          type="button"
          onClick={() => setReopened(true)}
          className="h-12 shrink-0 cursor-pointer rounded-xl px-4 text-sm font-bold text-teal"
        >
          Change
        </button>
      </motion.div>
    );
  }

  const deal = dealTopics(lobby.topics, `${view.room.id}:${meId}`, shuffle, mine?.id ?? null, 6);
  const highlighted = optimistic ?? mine?.id ?? null;
  const choose = (topicId: string) => {
    if (topicId === mine?.id) {
      setReopened(false);
      return;
    }
    setOptimistic(topicId);
    void act(api.quizslop.play.chooseTopic, { topicId }).then((ok) => {
      setOptimistic(null);
      if (ok) {
        buzz(20);
        setReopened(false);
      }
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-center font-display text-xl font-bold text-ink">Pick a topic you know</h2>
      <ErrorBanner error={error} className="" />
      <ul className="grid grid-cols-2 gap-2">
        {deal.map((topicId) => {
          const on = topicId === highlighted;
          return (
            <li key={topicId}>
              <motion.button
                type="button"
                disabled={pending}
                onClick={() => choose(topicId)}
                aria-pressed={on}
                className={`flex min-h-[64px] w-full cursor-pointer items-center rounded-xl border-2 px-3 text-left text-base font-bold transition-colors ${
                  on ? "border-teal bg-teal-soft text-ink" : "border-edge bg-surface text-ink"
                }`}
                {...press}
              >
                <span className="line-clamp-2">{label(topicId)}</span>
              </motion.button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setShuffle((count) => count + 1)}
        className="mx-auto h-12 cursor-pointer rounded-xl px-5 text-sm font-bold text-ink-dim hover:text-ink"
      >
        Shuffle
      </button>
    </section>
  );
}

/* ─── The phone ─── */

export function Controller() {
  const { room } = useRoom().view;
  if (room.status === "FINISHED") return <PhoneFinal />;
  switch (room.phase) {
    case "CALL":
      return <PhoneCall />;
    case "ANSWER":
      return <PhoneAnswer />;
    case "REVEAL":
      return <PhoneReveal />;
    case "ROUND_RESULTS":
      return <PhoneResults />;
    case "HOUSE_VOTE":
      return <PhoneVote />;
    default:
      return (
        <Screen>
          <Status title="Eyes on the TV" />
        </Screen>
      );
  }
}

/**
 * The opener's haptics on the phone (M1 / M6), in step with the TV: the
 * topic owner feels their topic land; everyone feels DOUBLE POINTS.
 */
function usePhoneOpener() {
  const { view } = useRoom();
  const { room } = view;
  const mode = useQuizslop();
  const lastRound = mode.round?.kind === "HOUSE_CHOICE";
  const owner = mode.round?.ownerPlayerId === view.me?.playerId && mode.round?.kind === "HOME_TURF";
  const cues: MomentCue[] = lastRound
    ? [{ at: TALLY.double, haptic: [30, 40, 30] }]
    : [{ at: OPENER.owner, haptic: owner ? 30 : undefined }];
  useMoment(cues, {
    anchor: room.phaseStartedAt + (room.round === 1 && !lastRound ? GAME_START_CARD_MS : 0),
    when: room.status === "PLAYING" && isOpeningPhase(room.phase, mode),
  });
}

/* ─── CALL ─── */

function TopicKicker() {
  const mode = useQuizslop();
  const { meId } = useMySeat();
  const mineTopic = mode.round?.kind === "HOME_TURF" && mode.round.ownerPlayerId === meId;
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-ink-dim">
      <span className="truncate">{mode.round?.topic?.label}</span>
      {mineTopic && (
        <span className="shrink-0 rounded-full bg-teal-soft px-2 text-xs text-teal">
          Your topic
        </span>
      )}
    </p>
  );
}

function PhoneCall() {
  const { view } = useRoom();
  const mode = useQuizslop();
  const name = useNames();
  const { meId, seat } = useMySeat();
  const { act, pending, error } = useRoomAction();
  const [target, setTarget] = useState<string | null>(null);
  usePhoneOpener();
  const tokens = seat?.callTokens ?? 0;
  const myCall = mode.calls.myCall;

  const undo = () => {
    buzz(10);
    setTarget(null);
    void act(api.quizslop.play.uncall, {});
  };

  if (myCall) {
    return (
      <Screen
        action={
          <div className="flex flex-col gap-1">
            <ErrorBanner error={error} className="mb-1" />
            <button
              type="button"
              disabled={pending}
              onClick={undo}
              className="h-12 w-full cursor-pointer rounded-xl text-base font-bold text-ink-dim hover:text-ink disabled:opacity-40"
            >
              {myCall.targetId ? "Undo bet" : "Undo"}
            </button>
          </div>
        }
      >
        <Status
          title={myCall.targetId ? `You bet ${name(myCall.targetId)} misses` : "No bet this round"}
        >
          {myCall.targetId && (
            <motion.button
              type="button"
              aria-label={`Undo your bet on ${name(myCall.targetId)}`}
              disabled={pending}
              onClick={undo}
              variants={pop}
              initial="hidden"
              animate="visible"
              className="order-first cursor-pointer rounded-full"
              {...press}
            >
              <PlayerAvatar id={myCall.targetId} size="96px" />
            </motion.button>
          )}
          {myCall.targetId && (
            <p className="text-sm font-bold text-win">
              {name(myCall.targetId)} misses → you +{BET}
            </p>
          )}
          <p className="text-sm text-ink-dim">{betsLeft(tokens)}</p>
          <EyesOnTv />
        </Status>
        <DoneTracker
          variant="phone"
          playerIds={mode.calls.eligiblePlayerIds}
          doneIds={mode.calls.decidedPlayerIds}
        />
      </Screen>
    );
  }

  if (tokens <= 0) {
    return (
      <Screen>
        <Status title="No bets left">
          <EyesOnTv />
        </Status>
      </Screen>
    );
  }

  const others = view.players.filter((player) => player.id !== meId);
  const owner = mode.round?.kind === "HOME_TURF" ? mode.round.ownerPlayerId : null;
  const example = others[0]?.name ?? "They";
  // One tap places the bet; the confirmation screen can take it back.
  const submit = (targetId: string | null) => {
    if (pending) return;
    buzz(20);
    setTarget(targetId);
    void act(api.quizslop.play.call, { targetId: targetId as Id<"players"> | null });
  };

  return (
    <Screen
      action={
        <div className="flex flex-col gap-1">
          <ErrorBanner error={error} className="mb-1" />
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(null)}
            className="h-11 w-full cursor-pointer rounded-xl text-sm font-bold text-ink-dim underline-offset-4 hover:text-ink hover:underline disabled:opacity-40"
          >
            Skip, no bet
          </button>
        </div>
      }
    >
      <TopicKicker />
      <h2 className="font-display text-2xl font-bold text-ink">Pick who gets it wrong</h2>
      <p className="text-sm text-ink-dim">
        <span className="font-bold text-win">
          {example} misses → you +{BET}
        </span>
        {" · "}
        <span className="font-bold text-fail">
          {example}&apos;s right → you {MINUS_BET}
        </span>
      </p>
      <p className="text-sm text-ink-dim">{betsLeft(tokens)}</p>
      <ul className="grid grid-cols-2 gap-3">
        {others.map((player) => {
          const on = player.id === target;
          return (
            <li key={player.id}>
              <motion.button
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => submit(player.id)}
                className={`flex min-h-[72px] w-full cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-wait ${
                  on ? "border-punch bg-punch/10 ring-2 ring-punch" : "border-edge bg-surface"
                }`}
                {...press}
              >
                <PlayerAvatar id={player.id} size="40px" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-bold text-ink">{player.name}</span>
                  {player.id === owner && <span className="text-xs text-teal">Their topic</span>}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}

/* ─── ANSWER ─── */

function PhoneAnswer() {
  const mode = useQuizslop();
  const name = useNames();
  const { meId } = useMySeat();
  const { act, error } = useRoomAction();
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  usePhoneOpener();

  const bettors = mode.calls.list.filter((bet) => bet.targetId === meId).map((bet) => bet.callerId);
  const targeted = bettors.length > 0;
  const beat = useMoment(
    [
      { at: TARGET_BUZZ_MS, haptic: targeted ? [60, 40, 60] : undefined },
      { at: ALERT_COLLAPSE_MS },
    ],
    { when: targeted },
  );
  const alerting = targeted && beat < 2 && !dismissed;
  const mountArmed = useArmedAfter(TAP_GUARD_MS);
  const alertArmed = useArmedAfter(ALERT_GUARD_MS, alerting);
  const armed = mountArmed && alertArmed && !alerting;

  const answer = mode.answer;
  const mine = answer?.mine ?? null;
  if (!answer || !mine) {
    return (
      <Screen>
        <Status title="Eyes on the TV" />
      </Screen>
    );
  }

  const chosen = mine.locked ? mine.selectedIndex : pendingIndex;
  const locked = chosen !== null;
  const bettorNames = bettors.map(name);
  const alertLine = `${joinNames(bettorNames)} ${bettors.length === 1 ? "bets" : "bet"} you'll miss`;
  const stakesLine =
    bettors.length === 1
      ? `Get it right and ${bettorNames[0]} loses ${BET}.`
      : `Get it right and they each lose ${BET}.`;
  const lock = (index: number) => {
    if (!armed || locked) return;
    setPendingIndex(index);
    buzz(20);
    void act(api.quizslop.play.lockAnswer, { selectedIndex: index }).then((ok) => {
      if (!ok) setPendingIndex(null);
    });
  };
  const bettorFaces = (size: string) => (
    <span className="flex shrink-0 pl-1.5">
      {bettors.slice(0, 4).map((id) => (
        <span key={id} className="-ml-1.5 rounded-full shadow-[0_0_0_2px_var(--bg)]">
          <PlayerAvatar id={id} size={size} />
        </span>
      ))}
    </span>
  );

  return (
    <LayoutGroup id="qs-answer">
      <Screen>
        {locked ? (
          <p className="font-display text-2xl text-teal">Locked in</p>
        ) : (
          <p className="truncate text-sm text-ink-dim">{mode.round?.topic?.label}</p>
        )}
        {targeted && !alerting && (
          <motion.p
            layoutId="qs-target-alert"
            transition={SPRING.smooth}
            className="flex items-center gap-2 self-start rounded-full bg-punch/10 px-3 py-1 text-sm font-bold text-punch"
          >
            {bettorFaces("20px")}
            <span className="min-w-0 truncate">{alertLine}</span>
          </motion.p>
        )}
        <h2 className="font-display text-xl font-bold text-balance text-ink">
          {mine.displayPrompt}
        </h2>
        <ErrorBanner error={error ? "Didn't lock. Tap again." : null} className="" />
        <ol className={`mt-auto flex flex-col gap-2 ${armed ? "" : "pointer-events-none"}`}>
          {mine.choices.map((choice, index) => {
            const picked = chosen === index;
            return (
              <li key={index}>
                <motion.button
                  type="button"
                  disabled={locked}
                  aria-disabled={!armed || undefined}
                  onClick={() => lock(index)}
                  className={`flex min-h-[64px] w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-[opacity,border-color,background-color] duration-150 disabled:cursor-default ${
                    picked ? "border-teal bg-teal-soft" : "border-edge bg-surface"
                  } ${locked && !picked ? "opacity-35" : ""}`}
                  {...(locked ? {} : press)}
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg font-black ${
                      picked ? "bg-teal text-accent-ink" : "bg-raised text-ink"
                    }`}
                  >
                    {picked ? <CheckIcon className="size-5" /> : CHOICE_LETTERS[index]}
                  </span>
                  <span className="line-clamp-2 text-base font-semibold text-ink">{choice}</span>
                </motion.button>
              </li>
            );
          })}
        </ol>
        {locked && (
          <DoneTracker
            variant="phone"
            playerIds={answer.assignedPlayerIds}
            doneIds={answer.lockedPlayerIds}
          />
        )}
      </Screen>
      <AnimatePresence>
        {alerting && (
          <motion.button
            type="button"
            key="alert"
            onClick={() => setDismissed(true)}
            className="absolute inset-x-4 top-4 z-20 flex cursor-pointer flex-col items-start gap-3 text-left"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              layoutId="qs-target-alert"
              transition={SPRING.smooth}
              className="flex w-full flex-col gap-3 rounded-3xl border-2 border-punch bg-canvas p-5 shadow-[inset_0_0_0_100vmax_color-mix(in_srgb,var(--punch)_10%,transparent)]"
            >
              {bettorFaces("40px")}
              <span className="font-display text-3xl font-bold text-ink">{alertLine}</span>
              <span className="text-base text-ink">{stakesLine}</span>
            </motion.div>
          </motion.button>
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}

/* ─── REVEAL ─── */

function PhoneReveal() {
  const { room } = useRoom().view;
  const mode = useQuizslop();
  const name = useNames();
  const { meId } = useMySeat();
  const step = room.step;
  const { group, bets, betTimes: times } = useRevealStep(step);
  const points = formatDelta(mode.round?.pointValue ?? 100);
  const mineHere = group?.players.find((player) => player.playerId === meId) ?? null;
  const myBetIndex = bets.findIndex((bet) => bet.callerId === meId);
  const myBet = myBetIndex === -1 ? null : bets[myBetIndex]!;
  const moment = sequence<string>([
    [
      "key",
      mineHere
        ? mineHere.correct
          ? { at: REVEAL.key, haptic: [20, 60, 30], confetti: "personal" }
          : { at: REVEAL.key, haptic: 60 }
        : { at: REVEAL.key },
    ],
    ...bets.map(
      (bet, j) =>
        [
          `bet${j}`,
          bet.callerId === meId
            ? { at: times[j]!, haptic: bet.outcome === "WON" ? [20, 60, 30] : 60 }
            : { at: times[j]! },
        ] as const,
    ),
  ]);
  const beat = useMoment(moment.cues);
  const seen = (key: string) => moment.seen(beat, key);
  if (!group) return null;

  const keyed = seen("key");
  const correctText = `${CHOICE_LETTERS[group.correctIndex]} · ${group.choices[group.correctIndex]}`;
  const onMe = bets.map((bet, j) => ({ bet, j })).filter(({ bet }) => bet.targetId === meId);

  // Its slot is kept from the start, so nothing jumps when the verdict lands.
  const myBetShown = myBet !== null && seen(`bet${myBetIndex}`);
  const myBetCard = myBet && (
    <motion.p
      variants={enter}
      initial="hidden"
      animate={myBetShown ? "visible" : "hidden"}
      aria-hidden={!myBetShown || undefined}
      className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-edge bg-surface p-4 text-center"
    >
      {/* The verdict stays out of the DOM until the TV stamps it. */}
      <span className="max-w-full truncate text-lg font-bold text-ink">
        {myBetShown
          ? `${name(myBet.targetId)} ${myBet.outcome === "WON" ? "missed" : "got it"}`
          : " "}
      </span>
      <span
        className={`font-display text-3xl font-black ${
          myBet.outcome === "WON" ? "text-win" : "text-fail"
        }`}
      >
        {myBetShown ? (myBet.outcome === "WON" ? `You +${BET}` : `You ${MINUS_BET}`) : " "}
      </span>
    </motion.p>
  );

  if (!mineHere) {
    const myStep = mode.myRevealStep;
    const earlier = myStep !== null && myStep < step ? mode.reveal[myStep] : null;
    const earlierMine = earlier?.players.find((player) => player.playerId === meId) ?? null;
    const line =
      myStep === null
        ? null
        : myStep === step + 1
          ? "Yours is next"
          : myStep > step + 1
            ? "Yours is coming up"
            : earlierMine?.correct
              ? `Yours: correct ${points}`
              : "Yours: missed";
    return (
      <Screen>
        <Status title="Eyes on the TV">
          {line && <p className="text-base text-ink-dim">{line}</p>}
          {myBetCard}
        </Status>
        <RevealReactions key={group.questionId} />
      </Screen>
    );
  }

  const picked =
    mineHere.selectedIndex === null
      ? "No answer"
      : `You picked ${CHOICE_LETTERS[mineHere.selectedIndex]} · ${group.choices[mineHere.selectedIndex]}`;

  return (
    <Screen>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wider text-gold uppercase">
          Your question is up
        </p>
        <p className="text-xl text-ink">{picked}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {/* Until the TV shows the key, a quiet cue holds the stamp's spot. */}
        <div className="grid place-items-center">
          <p
            className={`col-start-1 row-start-1 flex items-center gap-2 text-base text-ink-dim transition-opacity ${
              keyed ? "opacity-0" : ""
            }`}
          >
            <span aria-hidden="true" className="size-2 animate-soft-pulse rounded-full bg-gold" />
            Watch the TV
          </p>
          <span className="col-start-1 row-start-1">
            <Stamp size="lg" tone={mineHere.correct ? "win" : "fail"} tilt={-1.5} show={keyed}>
              {mineHere.correct ? "CORRECT" : mineHere.timedOut ? "OUT OF TIME" : "MISSED"}
            </Stamp>
          </span>
        </div>
        {mineHere.correct ? (
          <CountUp
            value={keyed ? (mode.round?.pointValue ?? 100) : 0}
            format={formatDelta}
            className={`text-5xl font-black text-win ${keyed ? "" : "invisible"}`}
          />
        ) : (
          <motion.p
            variants={enter}
            initial="hidden"
            animate={keyed ? "visible" : "hidden"}
            aria-hidden={!keyed || undefined}
            className="text-lg text-ink-dim"
          >
            {/* The key stays out of the DOM until the TV shows it. */}
            {keyed ? `Answer: ${correctText}` : "\u00a0"}
          </motion.p>
        )}
        {/* Each bet line keeps its slot from the start, so nothing above it jumps. */}
        {onMe.map(({ bet, j }) => (
          <motion.p
            key={bet.callerId}
            variants={enter}
            initial="hidden"
            animate={seen(`bet${j}`) ? "visible" : "hidden"}
            aria-hidden={!seen(`bet${j}`) || undefined}
            className={`text-base font-bold ${bet.outcome === "WON" ? "text-fail" : "text-win"}`}
          >
            {bet.outcome === "WON"
              ? `${name(bet.callerId)}'s bet paid off`
              : `You beat ${name(bet.callerId)}'s bet`}
          </motion.p>
        ))}
        {myBetCard}
      </div>
    </Screen>
  );
}

/** Spectators react to the question on the TV; each emoji once per reveal step. */
function RevealReactions() {
  const { run } = useRoom();
  const reactions = useQuizslopReactions();
  return (
    <ReactionStrip
      keys={QUIZSLOP_REACTIONS}
      sent={(reactions ?? []).filter((reaction) => reaction.mine).map((reaction) => reaction.emoji)}
      send={(emoji) => run(api.quizslop.play.react, { emoji })}
    />
  );
}

/* ─── ROUND_RESULTS ─── */

function PhoneResults() {
  const mode = useQuizslop();
  const name = useNames();
  const { meId } = useMySeat();
  const { now, leaders, leadChanged } = resultRows(mode, name);
  const me = now.find((row) => row.playerId === meId) ?? null;
  const improved = me !== null && me.rank < me.prevRank;
  const newLeader = leadChanged && leaders[0] === meId;
  const moment = sequence<string>([
    ["count", { at: RESULTS.count }],
    ["sort", { at: RESULTS.sort, haptic: improved ? 20 : undefined }],
    ["crown", { at: RESULTS.crown, haptic: newLeader ? [30, 40, 30] : undefined }],
  ]);
  const beat = useMoment(moment.cues);
  const seen = (key: string) => moment.seen(beat, key);
  if (!me) {
    return (
      <Screen>
        <Status title="Eyes on the TV" />
      </Screen>
    );
  }

  const parts = [
    me.quiz !== 0 ? `Right answer ${formatDelta(me.quiz)}` : null,
    me.bets !== 0 ? `Bet ${formatDelta(me.bets)}` : null,
  ].filter(Boolean);
  const tied = now.filter((row) => row.playerId !== me.playerId && row.total === me.total);
  const index = now.findIndex((row) => row.playerId === me.playerId);
  const above = now.slice(0, index).findLast((row) => row.total > me.total) ?? null;
  const below = now.find((row) => row.total < me.total) ?? null;
  const gapLine =
    tied.length > 0
      ? `Tied with ${tied[0]!.name}`
      : me.rank === 1
        ? below
          ? `Leading by ${formatPoints(me.total - below.total)}`
          : null
        : above
          ? `${formatPoints(above.total - me.total)} behind ${above.name}`
          : null;
  const moved = Math.sign(me.prevRank - me.rank);

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-xs font-semibold tracking-wider text-ink-dim uppercase">This round</p>
        <CountUp
          value={seen("count") ? me.delta : 0}
          format={formatDelta}
          className={`text-6xl font-black transition-colors ${
            !seen("count") || me.delta === 0
              ? "text-ink-dim"
              : me.delta > 0
                ? "text-win"
                : "text-fail"
          }`}
        />
        <p className={`min-h-5 text-sm text-ink-dim ${seen("count") ? "" : "invisible"}`}>
          {parts.join(" · ")}
        </p>
        <motion.div
          className="mt-6 flex flex-col items-center gap-1"
          initial={false}
          animate={{ opacity: seen("sort") ? 1 : 0 }}
        >
          <p className="flex items-center gap-2 font-display text-3xl text-ink">
            {tied.length > 0 ? "Tied " : ""}
            {ordinal(me.rank)} of {now.length}
            {moved !== 0 && (
              <span className={`text-xl ${moved > 0 ? "text-win" : "text-fail"}`}>
                {moved > 0 ? "▲" : "▼"}
              </span>
            )}
          </p>
          {gapLine && <p className="text-base text-ink-dim">{gapLine}</p>}
        </motion.div>
      </div>
    </Screen>
  );
}

/* ─── HOUSE_VOTE ─── */

function PhoneVote() {
  const mode = useQuizslop();
  const { act, error } = useRoomAction();
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const armed = useArmedAfter(TAP_GUARD_MS);
  const houseVote = mode.houseVote;
  if (!houseVote) return null;
  const voted = houseVote.myVoteTopicId ?? optimistic;
  const vote = (topicId: string) => {
    if (!armed || voted) return;
    setOptimistic(topicId);
    buzz(20);
    void act(api.quizslop.play.houseVote, { topicId }).then((ok) => {
      if (!ok) setOptimistic(null);
    });
  };

  return (
    <Screen>
      <div className="flex flex-col items-start gap-2">
        <h2 className="font-display text-2xl font-bold text-ink">Vote for the last topic</h2>
        <span className="rounded-full bg-gold-soft px-3 py-1 text-sm font-bold text-gold">
          Right answers +{formatPoints(mode.round?.pointValue ?? 200)}
        </span>
      </div>
      <ErrorBanner error={error} className="" />
      <ul className={`mt-auto flex flex-col gap-2 ${armed ? "" : "pointer-events-none"}`}>
        {houseVote.slate.map((topic) => {
          const mine = voted === topic.id;
          return (
            <li key={topic.id}>
              <motion.button
                type="button"
                disabled={voted !== null}
                aria-disabled={!armed || undefined}
                onClick={() => vote(topic.id)}
                className={`flex min-h-[80px] w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border-2 px-4 text-left font-display text-xl font-bold text-ink transition-[opacity,border-color,background-color] duration-150 disabled:cursor-default ${
                  mine ? "border-gold bg-gold-soft" : "border-edge bg-surface"
                } ${voted && !mine ? "opacity-35" : ""}`}
                {...(voted ? {} : press)}
              >
                <span className="line-clamp-2">{topic.label}</span>
                {mine && (
                  <span className="flex shrink-0 items-center gap-1 text-sm text-gold">
                    <CheckIcon className="size-4" />
                    Your vote
                  </span>
                )}
              </motion.button>
            </li>
          );
        })}
      </ul>
      {voted && <DoneTracker variant="phone" doneIds={houseVote.votedPlayerIds} />}
    </Screen>
  );
}

/* ─── FINISHED ─── */

function PhoneFinal() {
  const { view } = useRoom();
  const mode = useQuizslop();
  const name = useNames();
  const { meId } = useMySeat();
  const { final, standings, awards, winners, worstFirst, times } = finalModel(mode);
  const me = standings.find((entry) => entry.playerId === meId) ?? null;
  const myBar = worstFirst.findIndex((entry) => entry.playerId === meId);
  const iWon = me?.winner ?? false;
  const moment = sequence<string>([
    ...worstFirst.map(
      (_, i) => [`bar${i}`, { at: times.bars[i]!, haptic: i === myBar ? 30 : undefined }] as const,
    ),
    [
      "winner",
      iWon
        ? { at: times.winner, haptic: [100, 60, 100, 60, 200], confetti: "personal" }
        : { at: times.winner },
    ],
    ...awards.map(
      (award, j) =>
        [
          `award${j}`,
          {
            at: times.awards[j]!,
            haptic: meId && award.recipients.includes(meId as never) ? [15, 40, 15] : undefined,
          },
        ] as const,
    ),
  ]);
  const beat = useMoment(moment.cues, { anchor: view.room.phaseStartedAt + TITLE_CARD_MS });
  const seen = (key: string) => moment.seen(beat, key);
  if (!final || !me) {
    return (
      <Screen>
        <Status title="Eyes on the TV" />
      </Screen>
    );
  }

  const mine = iWon ? seen("winner") : seen(`bar${myBar}`);
  const myAwards = awards
    .map((award, j) => ({ award, j }))
    .filter(({ award }) => award.recipients.some((id) => id === meId));
  const tiedRank = standings.filter((entry) => entry.rank === me.rank).length > 1;
  const topTotal = formatPoints(winners[0]?.total ?? 0);
  const winnerLine = `${joinNames(winners.map((entry) => name(entry.playerId)))} won with ${topTotal}`;

  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <AnimatePresence mode="wait" initial={false}>
          {!mine ? (
            <motion.div key="wait" exit={{ opacity: 0 }}>
              <Status title="Eyes on the TV" />
            </motion.div>
          ) : iWon ? (
            <motion.div
              key="won"
              variants={pop}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center gap-3"
            >
              <CrownIcon className="size-12 text-gold" />
              <p
                className={`font-display text-gold ${winners.length > 1 ? "text-4xl" : "text-5xl"} font-black`}
              >
                {winners.length > 1 ? "You tied for 1st!" : "You won!"}
              </p>
              <p className="text-4xl font-black text-ink">
                <CountUp value={me.total} format={formatPoints} /> pts
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="placed"
              variants={pop}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center gap-2"
            >
              <p className="text-6xl font-black text-ink">
                {tiedRank ? "Tied " : ""}
                {ordinal(me.rank)}
              </p>
              <p className="text-xl text-ink-dim">of {standings.length}</p>
              <p className="mt-2 text-4xl font-black text-ink">
                <CountUp value={me.total} format={formatPoints} /> pts
              </p>
              <motion.p
                className="text-base text-ink-dim"
                initial={false}
                animate={{ opacity: seen("winner") ? 1 : 0 }}
              >
                {winnerLine}
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
        <ul className="mt-2 flex w-full flex-col gap-2">
          {myAwards.map(({ award, j }) => (
            <motion.li
              key={award.kind}
              variants={collapse}
              initial="hidden"
              animate={seen(`award${j}`) ? "visible" : "hidden"}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border-2 border-gold bg-surface p-4">
                <p className="text-sm font-black text-gold">{AWARD_LABELS[award.kind]}</p>
                <p className="text-sm text-ink-dim">{award.stat}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}
