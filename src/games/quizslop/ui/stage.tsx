"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, type Variants } from "motion/react";
import { originOf } from "@/lib/ambient-events";
import {
  ACCENT,
  DUR,
  EASE,
  SPRING,
  STAGGER,
  STAMP_IMPACT_MS,
  deckCard,
  enter,
  fade,
  listParent,
  pop,
  stamp,
  unmask,
} from "@/lib/animations";
import { useRoom } from "@/room/context";
import { isHostClocked } from "@/room/host-actions";
import { CountUp, Stamp, useMoment, useReducedAfterMount, type MomentCue } from "@/room/moment";
import { DoneTracker } from "@/room/parts";
import { ReactionFloats } from "@/room/reaction-floats";
import { FrozenRoom } from "@/room/scene";
import { CALL_SLOP_POINTS } from "../game-constants";
import {
  ANSWER_BETS_NAMED_MAX,
  GAME_START_CARD_MS,
  OPENER,
  REVEAL_BETS_NAMED_MAX,
  REVEAL,
  RESULTS,
  TALLY,
  TITLE_CARD_MS,
  VOTE,
  answerBetTimes,
  explanationAt,
} from "./beats";
import {
  AWARD_LABELS,
  CHOICE_LETTERS,
  ClockIcon,
  PlayerAvatar,
  TrophyIcon,
  choiceSize,
  finalModel,
  heroNameSize,
  isOpeningPhase,
  promptSize,
  resultRows,
  sequence,
  sortBets,
  tallyOf,
  titleSize,
  useNames,
  useQuizslop,
  useRevealStep,
  useSeatOrder,
  type QuizslopBet,
  type QuizslopRound,
} from "./shared";
import { formatDelta, formatPoints } from "@/lib/format";

const TILT = ACCENT.quizslop.stampTilt;
const BET = formatPoints(CALL_SLOP_POINTS);
const MINUS_BET = formatDelta(-CALL_SLOP_POINTS);

/** A moment's origin: the first element matching `selector`, measured when the cue plays. */
const from = (selector: string) => () => originOf(document.querySelector(selector));

/** Shown once its beat has fired; space is kept either way, so nothing reflows. */
function beatState(shown: boolean) {
  return shown ? "visible" : "hidden";
}

/* ─── Lobby extra (S0) ─── */

/** Who has picked a topic, as avatar chips. Names already sit on the tokens above. */
export function StageLobby() {
  const { lobby } = useQuizslop();
  const { players } = useRoom().view;
  if (!lobby) return null;
  const picked = new Map(
    lobby.topics.flatMap((topic) => (topic.claimedBy ? [[topic.claimedBy, topic.label]] : [])),
  );
  const everyone = players.length > 0 && players.every((player) => picked.has(player.id));

  return (
    <div className="flex flex-col gap-[0.5rem]" data-ambient-calm>
      <h2
        className={`h-[1.75rem] font-display text-xl leading-[1.75rem] font-bold ${
          everyone ? "text-win" : "text-ink"
        }`}
      >
        {everyone ? "Everyone has a topic" : "Pick a topic on your phone"}
      </h2>
      <ul className="grid grid-cols-2 gap-x-[1rem] gap-y-[0.5rem]">
        {players.map((player) => {
          const label = picked.get(player.id);
          return (
            <li key={player.id} className="flex h-[2.25rem] min-w-0 items-center gap-[0.5rem]">
              <PlayerAvatar id={player.id} size="1.75rem" />
              <AnimatePresence mode="popLayout" initial={false}>
                {label ? (
                  <motion.span
                    key={label}
                    variants={pop}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="min-w-0 truncate text-xl text-ink"
                  >
                    {label}
                  </motion.span>
                ) : (
                  <motion.span
                    key="picking"
                    variants={fade}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="flex items-center gap-[0.5rem] text-xl text-ink-dim"
                  >
                    <span
                      aria-hidden="true"
                      className="size-[0.5rem] shrink-0 animate-soft-pulse rounded-full bg-teal"
                    />
                    Picking…
                  </motion.span>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── The stage ─── */

export function Stage() {
  const { room } = useRoom().view;
  return room.status === "FINISHED" ? <FinalStage /> : <RoundStage />;
}

/** The round's kicker: "Warm-up", "{Name}'s topic" or "Last round". */
function useKicker(round: QuizslopRound | null) {
  const name = useNames();
  if (!round) return { name: null, text: "", tone: "text-ink", ownerId: null };
  if (round.kind === "HOUSE_CHOICE") {
    return { name: null, text: "Last round", tone: "text-gold", ownerId: null };
  }
  if (round.kind === "HOME_TURF" && round.ownerPlayerId) {
    return {
      name: name(round.ownerPlayerId),
      text: "'s topic",
      tone: "text-punch",
      ownerId: round.ownerPlayerId,
    };
  }
  return { name: null, text: "Warm-up", tone: "text-teal", ownerId: null };
}

/** "Warm-up", "Last round", or "{Name}'s topic" with only the name truncating. */
function KickerText({ kicker }: { kicker: ReturnType<typeof useKicker> }) {
  return (
    <span className="flex min-w-0 items-baseline whitespace-nowrap">
      {kicker.name && <span className="max-w-[20rem] min-w-0 truncate">{kicker.name}</span>}
      {kicker.text}
    </span>
  );
}

type OpenerKey =
  | "drop"
  | "pick"
  | "pickSlam"
  | "kicker"
  | "title"
  | "owner"
  | "double"
  | "doubleSlam"
  | "body"
  | "pills"
  | "tracker";

/**
 * The round opener (M1), or the last round's tally into its opener (M6).
 * `answerOpener`: CALL never ran, so the body is the ANSWER screen.
 */
function openerSequence({
  lastRound,
  homeTurf,
  answerOpener,
  tallyStamp,
}: {
  lastRound: boolean;
  homeTurf: boolean;
  answerOpener: boolean;
  tallyStamp: boolean;
}) {
  const title = from("[data-qs-title]");
  const body: MomentCue = {
    at: lastRound ? TALLY.body : OPENER.body,
    sound: answerOpener ? "round-start" : undefined,
  };
  if (lastRound) {
    return sequence<OpenerKey>([
      ["drop", { at: TALLY.drop, sound: "vote-cast" }],
      ["pick", { at: TALLY.pick, sound: "vote-reveal" }],
      [
        "pickSlam",
        { at: TALLY.pick + STAMP_IMPACT_MS, sound: tallyStamp ? "stamp-slam" : undefined },
      ],
      ["kicker", { at: TALLY.morph, ambient: { kind: "gust", strength: 0.7 }, origin: title }],
      ["title", { at: TALLY.morph }],
      ["owner", { at: TALLY.morph }],
      [
        "double",
        { at: TALLY.double, flash: "gold", ambient: { kind: "gust", strength: 1 }, origin: title },
      ],
      ["doubleSlam", { at: TALLY.double + STAMP_IMPACT_MS, sound: "stamp-slam" }],
      ["body", body],
      ["pills", { at: TALLY.pills }],
      ["tracker", { at: TALLY.tracker }],
    ]);
  }
  return sequence<OpenerKey>([
    ["kicker", { at: OPENER.kicker }],
    ["title", { at: OPENER.title, ambient: { kind: "gust", strength: 0.7 }, origin: title }],
    [
      "owner",
      homeTurf
        ? {
            at: OPENER.owner,
            sound: "vote-cast",
            ambient: { kind: "cheer", strength: 0.5 },
            origin: from("[data-qs-owner]"),
          }
        : { at: OPENER.owner },
    ],
    ["body", body],
    ["pills", { at: OPENER.pills }],
    ["tracker", { at: OPENER.tracker }],
  ]);
}

/**
 * A panel never fades as a whole on the way in: its parts bring their own
 * entrances (through these labels or their own beats), so the shared topic
 * title can travel between panels at full strength. The leaving panel fades
 * fast; its copy of the title is hidden the moment the new one takes over.
 */
const PANEL: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER.beats } },
  exit: { opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } },
};

/** Props for every copy of the travelling topic title: one element, never two half-faded ones. */
const TITLE_TRAVEL = {
  layoutId: "qs-topic-title",
  layoutCrossfade: false,
  transition: { layout: SPRING.smooth },
} as const;

/**
 * One stage scene for the whole round. Panels swap inside it (opener, answer,
 * each reveal step, results), and the topic title travels between them as one
 * element.
 */
function RoundStage() {
  const { view } = useRoom();
  const { room } = view;
  const mode = useQuizslop();
  const round = mode.round;
  const lastRound = round?.kind === "HOUSE_CHOICE";
  const opening = room.status === "PLAYING" && isOpeningPhase(room.phase, mode);
  const answerOpener = opening && room.phase === "ANSWER";
  const tally = tallyOf(mode.houseVote);
  const opener = openerSequence({
    lastRound,
    homeTurf: round?.kind === "HOME_TURF" && round.ownerPlayerId !== null,
    answerOpener,
    tallyStamp: tally?.stamp != null,
  });
  // The round-1 opener waits for the shell's game-start card.
  const openerAnchor =
    room.phaseStartedAt + (room.round === 1 && !lastRound ? GAME_START_CARD_MS : 0);
  const beat = useMoment(opener.cues, { anchor: openerAnchor, when: opening });
  const seen = (key: OpenerKey) => !opening || opener.seen(beat, key);

  let panel: string;
  if (room.phase === "HOUSE_VOTE") panel = "vote";
  else if (room.phase === "REVEAL") panel = `reveal:${room.step}`;
  else if (room.phase === "ROUND_RESULTS") panel = "results";
  else if (opening && lastRound && !seen("title")) panel = "vote";
  else if (room.phase === "CALL" || (answerOpener && !seen("body"))) panel = "open";
  else panel = "answer";

  const answerAnchor = answerOpener
    ? openerAnchor + (lastRound ? TALLY.body : OPENER.body)
    : room.phaseStartedAt;

  let content: ReactNode = null;
  if (panel === "vote") content = <VotePanel tally={opening} seen={seen} />;
  else if (panel === "open") content = <OpenerPanel seen={seen} drop={!lastRound} />;
  else if (panel === "answer")
    content = <AnswerPanel anchor={answerAnchor} roundStart={!answerOpener} />;
  else if (panel === "results") content = <ResultsPanel />;
  else content = <RevealPanel step={room.step} />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-[2.5rem] py-[1.25rem] max-md:overflow-x-clip max-md:px-4">
      <LayoutGroup id="qs-round">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={panel}
            className="flex min-h-0 w-full flex-1 flex-col"
            variants={PANEL}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* A leaving panel keeps drawing the room as it was. */}
            <FrozenRoom>{content}</FrozenRoom>
          </motion.div>
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

/* ─── S1: the round opener ─── */

/** The topic title, dropping in word by word (or fading whole under reduced motion). */
function HeroTitle({
  label,
  lastRound,
  drop,
  shown,
}: {
  label: string;
  lastRound: boolean;
  drop: boolean;
  shown: boolean;
}) {
  const reduced = useReducedAfterMount();
  // Each word drops out of a clipped slot; once it lands the clip lifts so the glow isn't cut off.
  const [landed, setLanded] = useState(false);
  if (landed && !shown) setLanded(false);
  const words = label.split(/\s+/);
  const count = words.length;
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setLanded(true), count * STAGGER.cards * 1000 + 700);
    return () => window.clearTimeout(timer);
  }, [shown, count]);
  // No line clamp: the catalog test caps labels at 40 characters, two lines at most.
  const className = `max-w-[72rem] text-center font-display leading-none font-black text-balance break-words text-gold qs-marquee-text ${titleSize(label, lastRound)} max-md:text-5xl`;
  if (!drop || reduced) {
    return (
      <motion.h2
        {...TITLE_TRAVEL}
        data-qs-title=""
        className={className}
        initial={false}
        animate={{ opacity: shown || !drop ? 1 : 0 }}
        transition={{ ...TITLE_TRAVEL.transition, opacity: { duration: DUR.slow, ease: EASE.out } }}
      >
        {label}
      </motion.h2>
    );
  }
  return (
    <motion.h2 {...TITLE_TRAVEL} data-qs-title="" className={className} aria-label={label}>
      {words.map((word, index) => (
        <span key={index} aria-hidden="true">
          <span
            className={`inline-block pt-[0.06em] pb-[0.1em] align-bottom ${landed ? "" : "overflow-hidden"}`}
          >
            <motion.span
              className="inline-block"
              initial={{ y: "115%" }}
              animate={{ y: shown ? "0%" : "115%" }}
              transition={{ ...SPRING.slam, delay: shown ? index * STAGGER.cards : 0 }}
            >
              {word}
            </motion.span>
          </span>
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </motion.h2>
  );
}

function OpenerPanel({ seen, drop }: { seen: (key: OpenerKey) => boolean; drop: boolean }) {
  const { room } = useRoom().view;
  const mode = useQuizslop();
  const round = mode.round;
  const kicker = useKicker(round);
  const lastRound = round?.kind === "HOUSE_CHOICE";
  const calling = room.phase === "CALL";
  if (!round?.topic) return null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="flex max-w-full flex-col items-center" data-ambient-calm>
        <motion.p
          className={`flex h-[2.25rem] max-w-full items-center gap-[0.75rem] font-display text-3xl font-bold max-md:text-xl ${kicker.tone}`}
          variants={lastRound ? pop : fade}
          initial="hidden"
          animate={beatState(seen("kicker"))}
        >
          {kicker.ownerId && (
            <motion.span
              data-qs-owner=""
              variants={pop}
              initial="hidden"
              animate={beatState(seen("owner"))}
            >
              <PlayerAvatar id={kicker.ownerId} size="2.75rem" />
            </motion.span>
          )}
          <KickerText kicker={kicker} />
        </motion.p>
        <div className="mt-[1rem] max-w-full">
          <HeroTitle
            label={round.topic.label}
            lastRound={lastRound}
            drop={drop}
            shown={seen("title")}
          />
        </div>
        {lastRound && (
          <div className="mt-[1rem]">
            <Stamp
              size="xl"
              tone="gold"
              tilt={TILT}
              show={seen("double")}
              className="max-md:text-3xl"
            >
              DOUBLE POINTS
            </Stamp>
          </div>
        )}
        {calling && (
          <>
            <motion.p
              className="mt-[1.5rem] font-display text-5xl text-ink max-md:text-3xl"
              variants={enter}
              initial="hidden"
              animate={beatState(seen("body"))}
            >
              Pick who gets it wrong
            </motion.p>
            <motion.div
              className="mt-[1rem] flex flex-wrap justify-center gap-[1.5rem] max-md:gap-2"
              variants={listParent(2, STAGGER.cards)}
              initial="hidden"
              animate={beatState(seen("pills"))}
            >
              <motion.span
                variants={pop}
                className="rounded-full bg-win-soft px-[1.25rem] py-[0.5rem] text-2xl font-bold text-win max-md:text-base"
              >
                They miss → you +{BET}
              </motion.span>
              <motion.span
                variants={pop}
                className="rounded-full bg-fail-soft px-[1.25rem] py-[0.5rem] text-2xl font-bold text-fail max-md:text-base"
              >
                They&apos;re right → you {MINUS_BET}
              </motion.span>
            </motion.div>
            <motion.div
              className="mt-[2rem] max-w-full"
              variants={fade}
              initial="hidden"
              animate={beatState(seen("tracker"))}
            >
              <DoneTracker
                playerIds={mode.calls.eligiblePlayerIds}
                doneIds={mode.calls.decidedPlayerIds}
              />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── S2: answering ─── */

/** The left-aligned dock: kicker · topic title, small. */
function DockRow() {
  const mode = useQuizslop();
  const kicker = useKicker(mode.round);
  return (
    <p
      className="flex h-[3.5rem] max-w-full shrink-0 items-center gap-[0.75rem] self-start text-2xl text-ink-dim max-md:h-[2.5rem] max-md:text-xl"
      data-ambient-calm
    >
      <motion.span variants={fade} className="flex min-w-0 items-center gap-[0.75rem]">
        <KickerText kicker={kicker} />
        <span aria-hidden="true">·</span>
      </motion.span>
      <motion.span
        {...TITLE_TRAVEL}
        className="whitespace-nowrap font-display text-4xl font-black text-gold qs-marquee-text max-md:min-w-0 max-md:truncate max-md:text-2xl"
      >
        {mode.round?.topic?.label}
      </motion.span>
    </p>
  );
}

function BetBoardCard({
  bet,
  shown,
  compact,
}: {
  bet: QuizslopBet;
  shown: boolean;
  compact: boolean;
}) {
  const name = useNames();
  if (compact) {
    return (
      <motion.li
        layoutId={`qs-bet-${bet.callerId}`}
        variants={stamp(0)}
        initial="hidden"
        animate={beatState(shown)}
        className="flex h-[3.5rem] items-center gap-[0.5rem] rounded-full bg-surface px-[0.75rem]"
      >
        <PlayerAvatar id={bet.callerId} size="2.25rem" />
        <span className="text-xl text-ink-dim" aria-hidden="true">
          →
        </span>
        <PlayerAvatar id={bet.targetId} size="2.25rem" />
        <span className="sr-only">{`${name(bet.callerId)} bets ${name(bet.targetId)} misses`}</span>
      </motion.li>
    );
  }
  return (
    <motion.li
      layoutId={`qs-bet-${bet.callerId}`}
      variants={stamp(0)}
      initial="hidden"
      animate={beatState(shown)}
      className="flex h-[3.5rem] w-full min-w-0 items-center gap-[0.5rem] rounded-2xl border-2 border-edge bg-surface px-[0.75rem] text-2xl max-md:text-base"
    >
      <PlayerAvatar id={bet.callerId} size="2.25rem" />
      <span className="max-w-[9rem] truncate font-bold text-ink">{name(bet.callerId)}</span>
      <span className="text-ink-dim">bets</span>
      <PlayerAvatar id={bet.targetId} size="2.25rem" />
      <span className="max-w-[9rem] truncate font-bold text-punch">{name(bet.targetId)}</span>
      <span className="text-ink-dim">misses</span>
    </motion.li>
  );
}

function AnswerPanel({ anchor, roundStart }: { anchor: number; roundStart: boolean }) {
  const mode = useQuizslop();
  const order = useSeatOrder();
  const lastRound = mode.round?.kind === "HOUSE_CHOICE";
  const bets = sortBets(mode.calls.list, order);
  const times = answerBetTimes(bets.length);
  const callRan = mode.calls.decidedPlayerIds.length > 0;
  const moment = sequence<string>([
    ["start", { at: 0, sound: roundStart ? "round-start" : undefined }],
    ...bets.map((_, i) => [`bet${i}`, { at: times[i]! }] as const),
    ...(bets.length <= ANSWER_BETS_NAMED_MAX
      ? bets.map(
          (_, i) => [`slam${i}`, { at: times[i]! + STAMP_IMPACT_MS, sound: "stamp-slam" }] as const,
        )
      : [["slam", { at: times[0]! + STAMP_IMPACT_MS, sound: "stamp-slam" }] as const]),
  ]);
  const beat = useMoment(moment.cues, { anchor });
  const answer = mode.answer;

  return (
    <div className="flex flex-1 flex-col">
      <DockRow />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.25rem]">
        <motion.div
          variants={enter}
          className="flex h-[3rem] flex-wrap items-center justify-center gap-[1.5rem] max-md:h-auto max-md:gap-2"
          data-ambient-calm
        >
          <p className="font-display text-5xl text-ink max-md:text-3xl">Answer on your phone</p>
          <span
            className={`rounded-full px-[1.25rem] py-[0.25rem] text-2xl font-bold max-md:text-base ${
              lastRound ? "bg-gold-soft text-gold" : "bg-win-soft text-win"
            }`}
          >
            Right answer +{formatPoints(mode.round?.pointValue ?? 100)}
          </span>
        </motion.div>
        {bets.length > ANSWER_BETS_NAMED_MAX ? (
          <div className="flex flex-col items-center gap-[0.75rem]" data-ambient-calm>
            <motion.p variants={enter} className="text-2xl text-ink-dim max-md:text-base">
              Bets on a miss
            </motion.p>
            <ul className="flex max-w-[70rem] flex-wrap justify-center gap-[0.75rem] max-md:gap-2">
              {bets.map((bet, i) => (
                <BetBoardCard
                  key={bet.callerId}
                  bet={bet}
                  shown={moment.seen(beat, `bet${i}`)}
                  compact
                />
              ))}
            </ul>
          </div>
        ) : bets.length > 0 ? (
          <ul
            className="grid w-full max-w-[75rem] grid-cols-2 gap-x-[2rem] gap-y-[0.75rem] max-md:grid-cols-1"
            data-ambient-calm
          >
            {bets.map((bet, i) => (
              <BetBoardCard
                key={bet.callerId}
                bet={bet}
                shown={moment.seen(beat, `bet${i}`)}
                compact={false}
              />
            ))}
          </ul>
        ) : (
          callRan && (
            <motion.p variants={enter} className="text-2xl text-ink-dim">
              No bets this round
            </motion.p>
          )
        )}
        {answer && (
          <motion.div variants={enter} className="max-w-full" data-ambient-calm>
            <DoneTracker playerIds={answer.assignedPlayerIds} doneIds={answer.lockedPlayerIds} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

/* ─── S3: a reveal step ─── */

function whoseLabel(names: string[], everyone: boolean) {
  if (everyone) return "Question for everyone";
  if (names.length === 1) return `Question for ${names[0]}`;
  if (names.length === 2) return null; // drawn with truncated names
  return `Question for ${names.length} players`;
}

function StepDots({ total, current }: { total: number; current: number }) {
  if (total <= 1) return <span />;
  return (
    <span className="flex items-center gap-[0.5rem] justify-self-end" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`size-[0.75rem] rounded-full ${
            index === current ? "bg-punch" : index < current ? "bg-ink-dim" : "bg-edge"
          }`}
        />
      ))}
    </span>
  );
}

function RevealPanel({ step }: { step: number }) {
  const { view } = useRoom();
  const mode = useQuizslop();
  const name = useNames();
  const { group, groupIds, bets, betTimes } = useRevealStep(step);
  const m = groupIds.length;
  const c = bets.length;
  const anyRight = group?.players.some((player) => player.correct) ?? false;
  const allRight = m > 0 && (group?.players.every((player) => player.correct) ?? false);
  const moment = sequence<string>([
    ["start", { at: REVEAL.start, sound: "prompt-advance" }],
    ["fly", { at: REVEAL.fly, sound: "vote-cast" }],
    [
      "key",
      {
        at: REVEAL.key,
        sound: "vote-reveal",
        ambient: !anyRight ? "chill" : allRight && m >= 2 ? "cheer" : "gust",
        flash: allRight && m >= 2 ? "win" : undefined,
        origin: from(anyRight ? "[data-qs-correct]" : "[data-qs-tiles]"),
      },
    ],
    ["keySlam", { at: REVEAL.key + STAMP_IMPACT_MS, sound: "stamp-slam" }],
    ...bets.map((_, j) => [`bet${j}`, { at: betTimes[j]! }] as const),
    ...(c <= REVEAL_BETS_NAMED_MAX
      ? bets.map(
          (_, j) =>
            [`betSlam${j}`, { at: betTimes[j]! + STAMP_IMPACT_MS, sound: "stamp-slam" }] as const,
        )
      : [["betSlam", { at: betTimes[0]! + STAMP_IMPACT_MS, sound: "stamp-slam" }] as const]),
    ["explain", { at: explanationAt(c) }],
  ]);
  const beat = useMoment(moment.cues);
  const reduced = useReducedAfterMount();
  const seen = (key: string) => moment.seen(beat, key);
  if (!group) return null;

  const flown = seen("fly");
  const keyed = seen("key");
  const everyone = mode.revealTotal === 1;
  const groupNames = groupIds.map(name);
  const label = whoseLabel(groupNames, everyone);
  const size = choiceSize(group.choices);
  const points = formatDelta(mode.round?.pointValue ?? 100);
  const showExplanation = !(isHostClocked(view.room) && c >= 6);
  // Who flies to a tile; who timed out stays in Row A.
  const waiting = group.players.filter((player) => !flown || player.selectedIndex === null);

  return (
    <div className="flex flex-1 flex-col">
      <div
        className="grid h-[2.75rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-[1rem] max-md:flex max-md:h-auto max-md:justify-between"
        data-ambient-calm
      >
        <motion.span
          {...TITLE_TRAVEL}
          className="max-w-[18rem] justify-self-start truncate text-xl text-ink-dim max-md:hidden"
        >
          {mode.round?.topic?.label}
        </motion.span>
        <div className="flex min-w-0 items-center gap-[1rem]">
          <motion.p
            variants={fade}
            className="flex min-w-0 items-center gap-[0.4rem] font-display text-2xl text-ink max-md:text-lg"
          >
            {label ?? (
              <>
                Question for <span className="max-w-[12rem] truncate">{groupNames[0]}</span> &amp;{" "}
                <span className="max-w-[12rem] truncate">{groupNames[1]}</span>
              </>
            )}
          </motion.p>
          <div className="flex items-center pl-[0.5rem]">
            {waiting.map((player) => (
              <motion.span
                key={player.playerId}
                layoutId={`qs-pick-${group.questionId}-${player.playerId}`}
                className="-ml-[0.5rem] flex items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: flown && player.timedOut ? 0.4 : 1 }}
              >
                <PlayerAvatar id={player.playerId} size="2.75rem" />
                {flown && player.timedOut && (
                  <ClockIcon className="-ml-[0.6rem] size-[1rem] self-end text-ink-dim" />
                )}
              </motion.span>
            ))}
          </div>
        </div>
        <motion.span variants={fade} className="justify-self-end">
          <StepDots total={mode.revealTotal} current={step} />
        </motion.span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.25rem]">
        {!reduced && <ReactionFloats reactions={mode.reactions} />}
        <motion.h2
          variants={enter}
          data-ambient-calm
          className={`line-clamp-3 max-w-[70rem] text-center font-display leading-tight font-bold text-balance text-ink ${promptSize(group.displayPrompt)} max-md:text-2xl`}
        >
          {group.displayPrompt}
        </motion.h2>

        <motion.div
          data-qs-tiles=""
          data-ambient-calm
          variants={listParent(4, STAGGER.cards)}
          className="relative mt-[0.5rem] grid w-full max-w-[75rem] grid-cols-2 gap-x-[2rem] gap-y-[0.75rem] max-md:mt-0 max-md:grid-cols-1"
        >
          {group.choices.map((choice, index) => {
            const correct = index === group.correctIndex;
            const pickers = group.players.filter((player) => player.selectedIndex === index);
            const lit = keyed && correct;
            const dim = keyed && !correct;
            return (
              <motion.div
                key={index}
                variants={enter}
                data-qs-correct={correct || undefined}
                className={`relative flex h-[6rem] w-full min-w-0 items-center gap-[1rem] rounded-2xl border-2 px-[0.75rem] transition-colors duration-300 max-md:h-[4.5rem] ${
                  lit ? "border-win bg-win-soft" : "border-edge bg-surface"
                }`}
              >
                <span
                  className={`grid size-[3rem] shrink-0 place-items-center rounded-xl font-display text-2xl font-black transition-[background-color,color] duration-300 ${
                    lit
                      ? "bg-win text-accent-ink"
                      : dim
                        ? "bg-raised text-ink-dim"
                        : "bg-raised text-ink"
                  }`}
                >
                  {CHOICE_LETTERS[index]}
                </span>
                <span
                  className={`line-clamp-2 max-w-[18.5rem] leading-tight font-semibold transition-colors duration-300 ${size} max-md:text-lg ${
                    dim ? "text-ink-dim" : "text-ink"
                  }`}
                >
                  {choice}
                </span>
                <span className="absolute top-1/2 right-[0.75rem] flex max-w-[11.5rem] -translate-y-1/2 items-center justify-end pl-[0.5rem]">
                  {flown &&
                    pickers.slice(0, pickers.length > 4 ? 3 : 4).map((player, order) => (
                      <motion.span
                        key={player.playerId}
                        layoutId={`qs-pick-${group.questionId}-${player.playerId}`}
                        className="-ml-[0.5rem] rounded-full"
                        transition={{ ...SPRING.pop, delay: order * 0.09 }}
                      >
                        <PlayerAvatar
                          id={player.playerId}
                          size="2.5rem"
                          className={dim ? "outline-2 outline-fail" : ""}
                        />
                      </motion.span>
                    ))}
                  {flown && pickers.length > 4 && (
                    <motion.span
                      variants={pop}
                      initial="hidden"
                      animate="visible"
                      className="-ml-[0.5rem] grid size-[2.5rem] place-items-center rounded-full bg-raised text-xl font-bold text-ink"
                    >
                      +{pickers.length - 3}
                    </motion.span>
                  )}
                </span>
                {/* The verdict sits on the key's corner, clear of every choice's text. */}
                {correct && (
                  <span className="pointer-events-none absolute -top-[1.1rem] right-[1rem] z-10">
                    {anyRight ? (
                      <Stamp size="md" tone="win" tilt={TILT} show={keyed}>
                        {points}
                      </Stamp>
                    ) : (
                      <Stamp
                        size="md"
                        tone="punch"
                        tilt={TILT}
                        show={keyed}
                        className="rounded-[0.2em] bg-canvas"
                      >
                        THE QUIZ WINS
                      </Stamp>
                    )}
                  </span>
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {c > 0 && <RevealBets bets={bets} seen={(j) => seen(`bet${j}`)} />}

        {showExplanation && (
          <motion.p
            className="line-clamp-3 max-w-[68rem] text-center text-2xl text-balance text-ink max-md:text-lg"
            data-ambient-calm
            variants={unmask}
            initial="hidden"
            animate={beatState(seen("explain"))}
          >
            {group.explanation}
          </motion.p>
        )}
      </div>
    </div>
  );
}

function BetVerdict({ bet, shown, size }: { bet: QuizslopBet; shown: boolean; size: "md" | "lg" }) {
  if (bet.outcome !== "WON" && bet.outcome !== "LOST") return null;
  const won = bet.outcome === "WON";
  return (
    <Stamp size={size} tone={won ? "win" : "fail"} tilt={TILT} show={shown}>
      {won ? `+${BET}` : MINUS_BET}
    </Stamp>
  );
}

function RevealBets({ bets, seen }: { bets: QuizslopBet[]; seen: (index: number) => boolean }) {
  const name = useNames();
  if (bets.length <= REVEAL_BETS_NAMED_MAX) {
    return (
      <ul
        className="flex w-full max-w-[75rem] justify-center gap-[2rem] max-md:flex-col max-md:gap-2"
        data-ambient-calm
      >
        {bets.map((bet, j) => (
          <motion.li
            key={bet.callerId}
            layoutId={`qs-bet-${bet.callerId}`}
            variants={enter}
            className="relative flex h-[3.5rem] w-[36.5rem] max-w-full min-w-0 items-center gap-[0.5rem] rounded-2xl border-2 border-edge bg-surface px-[1rem] text-2xl max-md:w-full max-md:text-base"
          >
            <span className="max-w-[7rem] truncate font-bold text-ink">{name(bet.callerId)}</span>
            <span className="text-ink-dim">bet</span>
            <span className="max-w-[7rem] truncate font-bold text-punch">{name(bet.targetId)}</span>
            <span className="text-ink-dim">misses</span>
            <span className="absolute top-1/2 right-[0.75rem] -translate-y-1/2">
              <BetVerdict bet={bet} shown={seen(j)} size="lg" />
            </span>
          </motion.li>
        ))}
      </ul>
    );
  }
  return (
    <ul
      className="flex max-w-[70rem] flex-wrap justify-center gap-[0.75rem] max-md:gap-2"
      data-ambient-calm
    >
      {bets.map((bet, j) => (
        <motion.li
          key={bet.callerId}
          layoutId={`qs-bet-${bet.callerId}`}
          variants={enter}
          className="flex h-[3.5rem] items-center gap-[0.5rem] rounded-full bg-surface px-[0.75rem]"
        >
          <PlayerAvatar id={bet.callerId} size="2.25rem" />
          <span className="text-xl text-ink-dim" aria-hidden="true">
            →
          </span>
          <PlayerAvatar id={bet.targetId} size="2.25rem" />
          <span className="sr-only">{`${name(bet.callerId)} bet ${name(bet.targetId)} misses`}</span>
          <span className="min-w-[5.5rem]">
            <BetVerdict bet={bet} shown={seen(j)} size="md" />
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

/* ─── S4: round results ─── */

function ResultsPanel() {
  const mode = useQuizslop();
  const name = useNames();
  const { now, before, leaders, prevLeaders, leadChanged } = resultRows(mode, name);
  const reordered = now.some((row, index) => before[index]?.playerId !== row.playerId);
  const moment = sequence<string>([
    ["start", { at: 0, sound: "phase-transition" }],
    ["chips", { at: RESULTS.chips }],
    ["count", { at: RESULTS.count, sound: "prompt-advance" }],
    ["sort", { at: RESULTS.sort, sound: reordered ? "vote-reveal" : undefined }],
    [
      "crown",
      leadChanged
        ? {
            at: RESULTS.crown,
            sound: "stamp-slam",
            flash: "gold",
            ambient: "cheer",
            origin: from("[data-qs-leader]"),
          }
        : { at: RESULTS.crown },
    ],
  ]);
  const beat = useMoment(moment.cues);
  const seen = (key: string) => moment.seen(beat, key);
  const sorted = seen("sort");
  const rows = sorted ? now : before;
  const crowned = seen("crown") ? leaders : prevLeaders.length === 1 ? prevLeaders : [];
  const single = crowned.length === 1;
  const hops = prevLeaders.length === 1;

  return (
    <div className="flex flex-1 items-center justify-center">
      <motion.ol
        className="flex w-full max-w-[60rem] flex-col gap-[0.5rem]"
        variants={listParent(rows.length, STAGGER.list)}
        data-ambient-calm
      >
        {rows.map((row) => {
          const leader = crowned.includes(row.playerId);
          const rank = sorted ? row.rank : row.prevRank;
          const moved = sorted ? Math.sign(row.prevRank - row.rank) : 0;
          return (
            <motion.li
              key={row.playerId}
              layout="position"
              variants={enter}
              transition={SPRING.smooth}
              data-qs-leader={leaders.includes(row.playerId) || undefined}
              className="grid h-[3.75rem] grid-cols-[3rem_3rem_1fr_auto_8rem_2rem] items-center gap-[1rem] rounded-2xl bg-surface px-[1.25rem] max-md:grid-cols-[1.25rem_3rem_1fr_auto_4rem_1rem] max-md:gap-2 max-md:px-3"
            >
              <span className="text-3xl font-black text-ink-dim tabular-nums max-md:text-lg">
                {rank}
              </span>
              <PlayerAvatar id={row.playerId} size="3rem" />
              <span className="flex min-w-0 items-center gap-[0.75rem]">
                <span className="truncate font-display text-3xl text-ink max-md:text-lg">
                  {row.name}
                </span>
                {leader && (
                  <motion.span
                    layoutId={single ? "qs-crown" : undefined}
                    // Only a crown that hops from the last single leader skips its entrance.
                    initial={single && hops ? false : { scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SPRING.pop}
                    className="shrink-0 text-gold"
                  >
                    <TrophyIcon className="size-[2rem]" />
                  </motion.span>
                )}
              </span>
              <DeltaChips quiz={row.quiz} bets={row.bets} shown={seen("chips")} />
              <CountUp
                value={seen("count") ? row.total : row.prevTotal}
                from={row.prevTotal}
                duration={0.8}
                format={formatPoints}
                className={`text-right text-4xl font-black max-md:text-xl ${
                  leaders.includes(row.playerId) && seen("crown") ? "text-gold" : "text-ink"
                }`}
              />
              <span className="text-xl">
                {moved !== 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SPRING.pop}
                    className={`inline-block ${moved > 0 ? "text-win" : "text-fail"}`}
                    aria-label={moved > 0 ? "Up" : "Down"}
                  >
                    {moved > 0 ? "▲" : "▼"}
                  </motion.span>
                )}
              </span>
            </motion.li>
          );
        })}
      </motion.ol>
    </div>
  );
}

/**
 * Where a row's points came from: the answer, then the bet ("bet +150"), as
 * separate chips so the TV keeps the cause and effect the reveal showed.
 */
function DeltaChips({ quiz, bets, shown }: { quiz: number; bets: number; shown: boolean }) {
  const parts = [
    { key: "quiz", value: quiz, label: null },
    { key: "bets", value: bets, label: "bet" },
  ].filter((part) => part.value !== 0);
  return (
    <motion.span
      className="flex items-center gap-[0.5rem] max-md:gap-1"
      variants={listParent(parts.length, STAGGER.tight)}
      initial="hidden"
      animate={beatState(shown)}
    >
      {parts.map((part) => (
        <motion.span
          key={part.key}
          variants={pop}
          className={`flex items-baseline gap-[0.35rem] rounded-full px-[0.75rem] text-2xl font-bold whitespace-nowrap tabular-nums max-md:px-2 max-md:text-sm ${
            part.value > 0 ? "bg-win-soft text-win" : "bg-fail-soft text-fail"
          }`}
        >
          {part.label && <span className="text-xl font-semibold max-md:text-xs">{part.label}</span>}
          {formatDelta(part.value)}
        </motion.span>
      ))}
    </motion.span>
  );
}

/* ─── S5 / S6: the vote for the last topic, and its tally ─── */

function VotePanel({ tally, seen }: { tally: boolean; seen: (key: OpenerKey) => boolean }) {
  const { room } = useRoom().view;
  const mode = useQuizslop();
  const houseVote = mode.houseVote;
  const voting = room.phase === "HOUSE_VOTE";
  const moment = sequence<string>([
    ["headline", { at: VOTE.headline }],
    ["cards", { at: VOTE.cards, sound: "prompt-advance" }],
    ["tracker", { at: VOTE.tracker }],
  ]);
  const beat = useMoment(moment.cues, {
    anchor: room.phaseStartedAt + TITLE_CARD_MS,
    when: voting,
  });
  const result = tallyOf(houseVote);
  if (!houseVote) return null;
  const show = (key: string) => (tally ? false : !voting || moment.seen(beat, key));
  const dropped = tally && seen("drop");
  const picked = tally && seen("pick");
  const finalPoints = formatPoints(mode.round?.pointValue ?? 200);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[2rem]">
      <motion.div
        className="flex h-[3rem] flex-wrap items-center justify-center gap-[1.5rem] max-md:h-auto max-md:gap-2"
        variants={fade}
        initial="hidden"
        animate={beatState(show("headline"))}
        data-ambient-calm
      >
        <p className="font-display text-5xl text-ink max-md:text-3xl">Vote for the last topic</p>
        <span className="rounded-full bg-gold-soft px-[1.25rem] py-[0.25rem] text-2xl font-bold text-gold max-md:text-base">
          Right answers +{finalPoints}
        </span>
      </motion.div>
      <motion.ul
        className="grid w-full max-w-[75rem] grid-cols-3 gap-[2.25rem] max-md:grid-cols-1 max-md:gap-3"
        data-ambient-calm
        variants={listParent(3, STAGGER.cards)}
        initial="hidden"
        animate={beatState(tally || show("cards"))}
      >
        {houseVote.slate.map((topic) => {
          const winner = result?.winnerId === topic.id;
          const voters = result?.voters(topic.id) ?? [];
          return (
            <motion.li key={topic.id} variants={deckCard}>
              <motion.div
                className={`relative flex h-[13rem] w-full flex-col items-center justify-between rounded-3xl border-2 bg-surface p-[1.5rem] transition-[border-color] duration-300 max-md:h-auto max-md:min-h-[6rem] max-md:p-4 ${
                  picked && winner ? "border-gold" : "border-edge"
                }`}
                initial={false}
                animate={
                  picked && !winner
                    ? // Losers dim, then collapse before the winner becomes the title.
                      { scale: [1, 1, 1, 0.6], opacity: [1, 0.35, 0.35, 0] }
                    : { scale: picked ? 1.06 : 1, opacity: 1 }
                }
                transition={
                  picked && !winner
                    ? { duration: 0.65, times: [0, 0.35, 0.6, 1], ease: EASE.inOut }
                    : SPRING.smooth
                }
              >
                {winner && tally ? (
                  <span className="grid flex-1 place-items-center text-center">
                    {/* A tight box, so the morph into the hero scales the words evenly. */}
                    <motion.span
                      {...TITLE_TRAVEL}
                      className="inline-block font-display text-4xl font-black text-balance text-gold qs-marquee-text max-md:text-2xl"
                    >
                      {topic.label}
                    </motion.span>
                  </span>
                ) : (
                  <span className="grid flex-1 place-items-center text-center font-display text-4xl font-black text-balance text-ink max-md:text-2xl">
                    {topic.label}
                  </span>
                )}
                <motion.span
                  className="flex h-[2.25rem] items-center pl-[0.5rem]"
                  variants={listParent(voters.length, STAGGER.tight)}
                  initial="hidden"
                  animate={beatState(dropped)}
                >
                  {voters.map((voterId) => (
                    <motion.span key={voterId} variants={pop} className="-ml-[0.5rem]">
                      <PlayerAvatar id={voterId} size="2.25rem" />
                    </motion.span>
                  ))}
                </motion.span>
                {winner && result?.stamp && (
                  <span className="pointer-events-none absolute -top-[1rem] right-[1rem]">
                    <Stamp size="sm" tone="gold" tilt={TILT} show={picked}>
                      {result.stamp}
                    </Stamp>
                  </span>
                )}
              </motion.div>
            </motion.li>
          );
        })}
      </motion.ul>
      <motion.div
        className="max-w-full"
        variants={fade}
        initial="hidden"
        animate={beatState(show("tracker"))}
        data-ambient-calm
      >
        <DoneTracker doneIds={houseVote.votedPlayerIds} />
      </motion.div>
    </div>
  );
}

/* ─── S7: the final ─── */

function FinalStage() {
  const { view } = useRoom();
  const mode = useQuizslop();
  const name = useNames();
  const { final, standings, awards, winners, worstFirst, times } = finalModel(mode);
  const moment = sequence<string>([
    ["start", { at: 0, sound: "game-over" }],
    ...worstFirst.map((_, i) => [`bar${i}`, { at: times.bars[i]!, sound: "vote-cast" }] as const),
    [
      "winner",
      {
        at: times.winner,
        sound: "winner-reveal",
        confetti: "final",
        flash: "gold",
        ambient: { kind: "cheer", strength: 1 },
        origin: from("[data-qs-hero]"),
      },
    ],
    ["celebrate", { at: times.celebrate, sound: "celebration", confetti: "quiz" }],
    ...awards.flatMap((_, j) => [
      [`award${j}`, { at: times.awards[j]! }] as const,
      [`awardSlam${j}`, { at: times.awards[j]! + STAMP_IMPACT_MS, sound: "stamp-slam" }] as const,
    ]),
  ]);
  const beat = useMoment(moment.cues, { anchor: view.room.phaseStartedAt + TITLE_CARD_MS });
  const seen = (key: string) => moment.seen(beat, key);
  if (!final) return null;

  const crowned = seen("winner");
  const top = Math.max(1, ...standings.map((entry) => entry.total));
  const n = standings.length;
  const column = Math.min(12, (75 - (n - 1)) / Math.max(1, n));
  const barShown = (playerId: string) => {
    const index = worstFirst.findIndex((entry) => entry.playerId === playerId);
    return index === -1 ? crowned : seen(`bar${index}`);
  };
  const winnerNames = winners.map((entry) => name(entry.playerId));
  const joined = winnerNames.join(" & ");
  const tieLine =
    winners.length === 1 && standings[1] && standings[1].total === standings[0]!.total
      ? `Tied on ${formatPoints(standings[0]!.total)} · ${
          standings[1].quizSubtotal !== standings[0]!.quizSubtotal
            ? "more points from answers"
            : "more bets won"
        }`
      : null;

  return (
    // Below md the shell floats "Play again" over the bottom: the last award card clears it.
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.5rem] px-[2.5rem] py-[1.25rem] max-md:overflow-x-clip max-md:px-4 max-md:pb-[6rem]">
      <div
        data-qs-hero=""
        data-ambient-calm
        className="flex h-[11rem] max-w-full flex-col items-center justify-start max-md:h-auto"
      >
        {/* On screen from the first frame, so the lead-in never looks empty; it gives way to the name. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={crowned ? "crowned" : "teaser"}
            variants={fade}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="font-display text-3xl text-ink-dim"
          >
            {crowned
              ? winners.length > 1
                ? "Your champions"
                : "Your champion"
              : winners.length > 1
                ? "And the winners are…"
                : "And the winner is…"}
          </motion.p>
        </AnimatePresence>
        {/* Padded past the name's glow, so the unmask clip never cuts it into a box. */}
        <motion.div
          className="-mx-[2.5rem] -mt-[2rem] -mb-[2.5rem] flex max-w-[calc(100%+5rem)] items-end gap-[1.5rem] p-[2.5rem] max-md:-mx-4 max-md:max-w-[calc(100%+2rem)] max-md:flex-col max-md:items-center max-md:gap-2 max-md:px-4"
          variants={unmask}
          initial="hidden"
          animate={beatState(crowned)}
        >
          <span className="flex items-end gap-[1rem]">
            {winners.map((entry) => (
              <span key={entry.playerId} className="relative flex flex-col items-center">
                <TrophyIcon
                  className={`${winners.length >= 3 ? "size-[2.75rem]" : "size-[3.5rem]"} -mb-[0.5rem] text-gold`}
                />
                <PlayerAvatar id={entry.playerId} size={winners.length >= 3 ? "5rem" : "6rem"} />
              </span>
            ))}
          </span>
          {winners.length <= 2 && (
            <span className="flex max-w-full min-w-0 flex-col pb-[0.25rem] max-md:items-center max-md:text-center">
              {/* No clip: it would cut the marquee glow. Length already picks the size. */}
              <span
                className={`max-w-[52rem] font-display leading-none font-black text-balance break-words text-gold qs-marquee-text ${heroNameSize(joined)} max-md:max-w-full max-md:text-5xl`}
              >
                {joined}
              </span>
              {tieLine && <span className="mt-[0.5rem] text-xl text-ink-dim">{tieLine}</span>}
            </span>
          )}
        </motion.div>
      </div>

      <motion.ol
        className="flex w-full max-w-[75rem] items-end justify-center gap-[1rem] max-md:gap-1"
        variants={listParent(n, STAGGER.tight)}
        initial="hidden"
        animate={beatState(seen("start"))}
        data-ambient-calm
      >
        {standings.map((entry) => {
          const shown = barShown(entry.playerId);
          // A share of the 9rem lane, so the bars scale with a shorter lane on narrow screens.
          const height = ((0.75 + (8.25 * Math.max(0, entry.total)) / top) / 9) * 100;
          return (
            <motion.li
              key={entry.playerId}
              variants={enter}
              className="flex min-w-0 flex-1 flex-col items-center gap-[0.25rem]"
              style={{ maxWidth: `${column}rem` }}
            >
              <CountUp
                value={shown ? entry.total : 0}
                duration={0.6}
                format={formatPoints}
                className={`text-3xl font-black max-md:text-sm ${entry.total < 0 ? "text-fail" : "text-ink"} ${
                  shown ? "" : "opacity-0"
                }`}
              />
              <div className="flex h-[9rem] w-full items-end max-md:h-[6rem]">
                <motion.div
                  className={`w-full origin-bottom rounded-t-xl ${
                    entry.winner ? "bg-gold" : "border-2 border-edge-strong bg-raised"
                  }`}
                  style={{ height: `${height}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: shown ? 1 : 0 }}
                  transition={entry.winner ? SPRING.slam : SPRING.smooth}
                />
              </div>
              <span
                title={name(entry.playerId)}
                className={`max-w-full truncate pb-[0.12em] font-display text-2xl leading-snug max-md:text-xs ${
                  entry.winner && crowned ? "text-gold" : "text-ink"
                }`}
              >
                {name(entry.playerId)}
              </span>
            </motion.li>
          );
        })}
      </motion.ol>

      {awards.length > 0 && (
        <ul
          className="flex h-[8rem] w-full justify-center gap-[1.5rem] max-md:h-auto max-md:flex-col max-md:gap-2"
          data-ambient-calm
        >
          {awards.map((award, j) => {
            const shown = seen(`award${j}`);
            const recipients = award.recipients.map(name).join(" & ");
            return (
              <motion.li
                key={award.kind}
                variants={enter}
                initial="hidden"
                animate={beatState(shown)}
                className="flex h-[8rem] w-[23rem] min-w-0 shrink flex-col items-center justify-center gap-[0.25rem] rounded-2xl bg-surface p-[0.75rem] max-md:h-auto max-md:w-full"
              >
                <Stamp size="sm" tone="gold" tilt={TILT} show={shown}>
                  {AWARD_LABELS[award.kind]}
                </Stamp>
                <span
                  className={`max-w-full shrink-0 truncate pb-[0.12em] font-display leading-tight text-ink ${
                    award.recipients.length >= 2 ? "text-2xl" : "text-3xl"
                  }`}
                >
                  {recipients}
                </span>
                <span className="shrink-0 text-xl leading-tight text-ink-dim">{award.stat}</span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
