"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { originOf } from "@/lib/ambient-events";
import {
  ACCENT,
  DUR,
  EASE,
  SPRING,
  STAGGER,
  TRAVEL,
  listParent,
  pop,
  sceneItem,
  spot,
  unmask,
} from "@/lib/animations";
import { spreadOf } from "@/lib/hash";
import { reactionEmoji } from "@/lib/reactions";
import { Avatar } from "@/room/avatar";
import { useModeView, usePlayers, useRoom, type RoomPlayer } from "@/room/context";
import { useCue } from "@/room/effects";
import { DrawnCheck } from "@/room/parts";
import { ReactionFloats } from "@/room/reaction-floats";
import { CountUp, Stamp, useMoment, useReducedAfterMount } from "@/room/moment";
import { matchupOutcome } from "../outcomes";
import { flightOrder } from "../reveal-timeline";
import { pointsPerVote } from "../scoring";
import { CrownDrop } from "./crown-drop";
import { introCues, revealCues, walkoverCues } from "./cues";
import {
  answerSize,
  currentPrompt,
  plus,
  promptSize,
  typeOfPlayer,
  votesLabel,
  walkoverCount,
  type SlAnswer,
  type SlPrompt,
} from "./data";
import { formatPoints } from "@/lib/format";
import { useSloplashReactions } from "./reactions";

/** The most ballot chips, voter faces or reaction bursts a card shows. */
const MAX_FACES = 6;

/**
 * The scene grid: top pad, dots, gap, prompt, gap, cards, gap, band, bottom
 * pad. The card row takes what is left (25rem timed, 20rem with the host's
 * Continue bar). Below a 56rem container (the docked /game column, a portrait
 * spectator) the cards stack and the page may scroll instead.
 */
const GRID =
  "relative grid min-h-0 flex-1 grid-rows-[1rem_0.75rem_0.75rem_auto_1.25rem_minmax(0,1fr)_0.75rem_3.5rem_1rem] @max-4xl:flex @max-4xl:flex-col @max-4xl:gap-4 @max-4xl:py-4";

/** The prompt heading, sized by its length. */
const promptClasses = (text: string) =>
  `mx-auto max-w-[74rem] text-center font-display leading-tight font-bold text-balance text-gold-ink line-clamp-2 ${promptSize(text)}`;

/** An answer card's chrome, shared by contested and walkover matchups. */
const CARD =
  "relative flex min-h-0 flex-col rounded-3xl border-2 border-edge bg-surface px-6 pt-[3.5rem] pb-6 @max-4xl:min-h-[14rem]";
const ANSWER_TEXT =
  "w-full font-display leading-tight font-semibold text-balance break-words text-ink";

/** VOTING, a contested REVEAL and a walkover REVEAL share this scene. */
export function StageMatchup() {
  const mode = useModeView("SLOPLASH");
  const prompt = currentPrompt(mode);
  if (!prompt || prompt.answers.length === 0) return null;
  return prompt.kind === "walkover" ? (
    <WalkoverMatchup prompt={prompt} />
  ) : (
    <ContestedMatchup prompt={prompt} />
  );
}

// --- Contested: VOTING, then the reveal, in one mounted scene ---

function ContestedMatchup({ prompt }: { prompt: SlPrompt }) {
  const { view } = useRoom();
  const { room, players } = view;
  const mode = useModeView("SLOPLASH");
  const reduced = useReducedAfterMount();
  const voting = room.phase === "VOTING";
  const revealing = room.phase === "REVEAL";
  const [left, right] = [prompt.answers[0]!, prompt.answers[1] ?? prompt.answers[0]!];

  // The intro: the prompt alone, then it glides up and the answers deal in.
  const intro = useMemo(() => introCues(), []);
  const introBeat = useMoment(intro.cues, { when: voting });
  const shown = (name: keyof typeof intro.beat) => revealing || introBeat >= intro.beat[name];

  // The reveal, from the votes the server just unmasked.
  const typeOf = typeOfPlayer(players);
  const outcome = revealing ? matchupOutcome(prompt, room.round, typeOf) : null;
  const winnerSide =
    outcome?.winnerAnswerId === left.id ? 0 : outcome?.winnerAnswerId === right.id ? 1 : null;
  const verdictKind =
    outcome?.score.outcome === "win" ? "win" : outcome?.score.outcome === "tie" ? "tie" : "noVotes";
  const cast = outcome?.score.cast ?? 0;
  const stampKind = outcome?.stamp ?? null;
  const aiWon = outcome?.aiWon ?? false;
  const reveal = useMemo(
    () =>
      revealCues({
        cast,
        outcome: verdictKind,
        stamp: stampKind,
        aiWon,
        // Looked up when the beat fires, never during render.
        winnerOrigin: () =>
          originOf(
            document.querySelector(
              winnerSide === null ? "[data-sl-centre]" : `[data-sl-card="${winnerSide}"]`,
            ),
          ),
      }),
    [cast, verdictKind, stampKind, aiWon, winnerSide],
  );
  const moment = useMoment(reveal.cues, { when: revealing });
  const at = (name: keyof typeof reveal.beat) => revealing && moment >= reveal.beat[name];
  const [mountMoment] = useState(moment);

  // Which votes have flown into which card, in minority-first order.
  const order = revealing ? flightOrder(prompt.votes, left.id, right.id) : [];
  const flown = new Set(order.filter((_, k) => at(`flight${k}`)));
  const landed = (answer: SlAnswer) =>
    prompt.votes.filter((vote, index) => flown.has(index) && vote.responseId === answer.id);

  const unit = pointsPerVote(room.round);
  const size = answerSize(prompt.answers);
  const verdict = at("verdict");
  const firstVote = room.round === 1 && room.step === walkoverCount(mode);

  const card = (answer: SlAnswer, side: 0 | 1) => {
    const won = winnerSide === side;
    const votes = outcome?.score.votes[answer.id] ?? 0;
    const total = outcome?.score.points[answer.id] ?? 0;
    const base = votes * unit;
    const state =
      !verdict || winnerSide === null ? "idle" : won ? ("focus" as const) : ("dim" as const);
    return (
      <AnswerCard
        answer={answer}
        side={side}
        size={size}
        entered={shown(side === 0 ? "cardA" : "cardB")}
        spotState={state}
        pulse={verdict && verdictKind === "tie"}
        reduced={reduced}
        crown={won && verdict}
        stamp={
          won && (stampKind === "slopped" || stampKind === "flawless") ? (
            <Stamp
              tone={stampKind === "slopped" ? "punch" : "teal"}
              size="lg"
              tilt={ACCENT.sloplash.stampTilt}
              show={at("stamp")}
            >
              {stampKind === "slopped" ? "SLOPPED" : "FLAWLESS"}
            </Stamp>
          ) : null
        }
        voters={landed(answer).map((vote) => vote.voterId)}
        promptId={prompt.id}
        math={
          revealing ? (
            <ScoreMath
              shownVotes={landed(answer).length}
              verdict={verdict}
              votes={votes}
              unit={unit}
              value={at("impact") && won ? total : base}
              tone={won ? "text-gold-ink" : "text-ink"}
              bonus={won && (outcome?.score.unanimous ?? false) && at("impact")}
            />
          ) : null
        }
        bursts={
          at("reactions") && mountMoment < reveal.beat.reactions && !reduced
            ? answer.reactions.slice(0, MAX_FACES).map((reaction) => reaction.emoji)
            : []
        }
      />
    );
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col px-[3rem] @max-4xl:px-4">
      <div className={GRID}>
        <ProgressDots className="row-start-2" />
        <PromptRow
          prompt={prompt}
          alone={voting && !shown("glide")}
          shown={shown("prompt")}
          reduced={reduced}
        />
        <div className="relative row-start-6 grid min-h-0 grid-cols-1 gap-y-[0.5rem] @4xl:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)]">
          {card(left, 0)}
          <div data-sl-centre="" className="flex items-center justify-center @max-4xl:h-[2.5rem]">
            <motion.span
              className="grid size-[3.5rem] place-items-center rounded-full border-2 border-edge-strong bg-vs font-display text-2xl font-black text-ink @max-4xl:size-[2.5rem] @max-4xl:text-lg"
              initial={false}
              animate={
                at("unmask")
                  ? { opacity: 0, scale: 0.8 }
                  : shown("band")
                    ? { opacity: 1, scale: 1 }
                    : { opacity: 0, scale: 0.6 }
              }
              transition={at("unmask") ? { duration: DUR.slow, ease: EASE.out } : SPRING.pop}
            >
              VS
            </motion.span>
          </div>
          {card(right, 1)}
          {(stampKind === "tie" || stampKind === "noVotes") && (
            <div className="pointer-events-none absolute -top-[0.5rem] left-1/2 z-20 -translate-x-1/2">
              <Stamp
                tone={stampKind === "tie" ? "gold" : "ink"}
                size="lg"
                tilt={ACCENT.sloplash.stampTilt}
                show={at("stamp")}
              >
                {stampKind === "tie" ? "TIE" : "NO VOTES"}
              </Stamp>
            </div>
          )}
        </div>
        <div className="relative row-start-8 min-h-[3.5rem]">
          {voting && (
            <BallotBand prompt={prompt} shown={shown("band")} hint={firstVote} reduced={reduced} />
          )}
          {revealing && !at("unmask") && (
            <RevealBand
              prompt={prompt}
              flown={flown}
              collapsed={at("collapse")}
              reduced={reduced}
            />
          )}
          <AnimatePresence>
            {revealing && at("unmask") && (
              <NamePlates
                key="names"
                answers={[left, right]}
                winnerSide={winnerSide}
                reduced={reduced}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

/** One dot per matchup this round: past, current (a gold pill), future. */
function ProgressDots({ className = "" }: { className?: string }) {
  const { room } = useRoom().view;
  const { matchupCount } = useModeView("SLOPLASH");
  if (matchupCount <= 1) return <div className={className} />;
  return (
    <div className={`flex items-center justify-center gap-[0.5rem] ${className}`}>
      <span className="sr-only">{`Matchup ${room.step + 1} of ${matchupCount}`}</span>
      {Array.from({ length: matchupCount }, (_, index) => (
        <span
          key={index}
          className={`h-[0.75rem] rounded-full ${
            index === room.step
              ? "w-[1.75rem] bg-gold"
              : index < room.step
                ? "w-[0.75rem] bg-ink-dim"
                : "w-[0.75rem] bg-edge-strong"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * The prompt. During the intro it first sits alone in the middle of the
 * scene, then glides into its row (one `layoutId`); a copy holds the row's
 * height meanwhile so nothing below it moves.
 */
function PromptRow({
  prompt,
  alone,
  shown,
  reduced,
}: {
  prompt: SlPrompt;
  alone: boolean;
  shown: boolean;
  reduced: boolean;
}) {
  const classes = promptClasses(prompt.text);
  const layoutId = reduced ? undefined : `prompt:${prompt.id}`;
  return (
    <>
      <div className="row-start-4" data-ambient-calm>
        {alone ? (
          <p aria-hidden="true" className={`invisible ${classes}`}>
            {prompt.text}
          </p>
        ) : (
          <motion.h2 layoutId={layoutId} className={classes} transition={{ layout: SPRING.smooth }}>
            {prompt.text}
          </motion.h2>
        )}
      </div>
      {alone && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <motion.h2
            layoutId={layoutId}
            className={classes}
            initial={{ opacity: 0, y: TRAVEL.stage }}
            animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: TRAVEL.stage }}
            transition={{ ...SPRING.gentle, layout: SPRING.smooth }}
          >
            {prompt.text}
          </motion.h2>
        </div>
      )}
    </>
  );
}

function AnswerCard({
  answer,
  side,
  size,
  entered,
  spotState,
  pulse,
  reduced,
  crown,
  stamp,
  voters,
  promptId,
  math,
  bursts,
}: {
  answer: SlAnswer;
  side: 0 | 1;
  size: string;
  entered: boolean;
  spotState: "idle" | "focus" | "dim";
  pulse: boolean;
  reduced: boolean;
  crown: boolean;
  stamp: ReactNode;
  voters: string[];
  promptId: string;
  math: ReactNode;
  bursts: string[];
}) {
  const from = side === 0 ? -TRAVEL.stage : TRAVEL.stage;
  // The card stays opaque when dimmed (only its answer fades), so the ambient
  // field never shows through it and the score lines keep their contrast.
  const { opacity: textOpacity, ...look } = spot(spotState);
  return (
    <motion.div
      data-sl-card={side}
      data-ambient-calm
      className={CARD}
      initial={false}
      animate={
        entered
          ? { opacity: 1, x: 0, ...look, ...(pulse ? { scale: [1, 1.03, 1] } : {}) }
          : { opacity: 0, x: from, scale: 1 }
      }
      transition={
        pulse
          ? { duration: 0.6, ease: EASE.inOut }
          : spotState === "idle"
            ? SPRING.pop
            : SPRING.smooth
      }
    >
      <CrownDrop
        show={crown}
        reduced={reduced}
        squash
        className="absolute -top-[1.25rem] left-[1.25rem] z-10"
        iconClassName="size-[3rem] -rotate-12"
      />
      {stamp && (
        // The stamp waits invisible at 2.4x and slams in from there. Clipping its
        // box (4rem of slack, which reaches the scene's edge from the right card)
        // keeps that oversized box from making the scene scrollable mid-reveal.
        <div className="pointer-events-none absolute -top-[0.75rem] right-[1.5rem] z-20 overflow-clip [overflow-clip-margin:4rem]">
          {stamp}
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-center">
        <motion.p
          className={`${ANSWER_TEXT} ${size}`}
          initial={false}
          animate={{ opacity: textOpacity }}
          transition={SPRING.smooth}
        >
          {answer.text}
        </motion.p>
      </div>
      <div className="mt-[1rem] flex min-h-[5rem] items-end justify-between gap-4">
        <VoterStack voterIds={voters} promptId={promptId} reduced={reduced} />
        {math}
      </div>
      <AnimatePresence>
        {bursts.length > 0 && <Bursts key="bursts" emojis={bursts} seed={answer.id} />}
      </AnimatePresence>
    </motion.div>
  );
}

/** The voters' faces once their votes have flown in. */
function VoterStack({
  voterIds,
  promptId,
  reduced,
}: {
  voterIds: string[];
  promptId: string;
  reduced: boolean;
}) {
  const { byId } = usePlayers();
  return (
    <div className="flex min-w-0 items-center pl-[0.5rem]">
      {voterIds.slice(0, MAX_FACES).map((id) => {
        const voter = byId(id);
        if (!voter) return null;
        return (
          <motion.span
            key={id}
            layoutId={reduced ? undefined : `voter:${promptId}:${id}`}
            className="-ml-[0.5rem] rounded-full shadow-[0_0_0_0.15rem_var(--surface)]"
            transition={{ layout: SPRING.snappy }}
            title={voter.name}
          >
            <Avatar name={voter.name} modelId={voter.modelId} size="2.5rem" />
          </motion.span>
        );
      })}
    </div>
  );
}

/** "3 votes × 400" over "+1,200", filling in as the reveal lands. */
function ScoreMath({
  shownVotes,
  verdict,
  votes,
  unit,
  value,
  tone,
  bonus,
}: {
  shownVotes: number;
  verdict: boolean;
  votes: number;
  unit: number;
  value: number;
  tone: string;
  bonus: boolean;
}) {
  const line = verdict
    ? `${votesLabel(votes)} × ${formatPoints(unit)}`
    : shownVotes > 0
      ? votesLabel(shownVotes)
      : " ";
  return (
    <div className="flex shrink-0 flex-col items-end text-right">
      <p className="flex items-center font-mono text-xl whitespace-nowrap text-ink-dim">
        <span>{line}</span>
        <AnimatePresence>
          {bonus && (
            <motion.span
              className="ml-2 rounded-full bg-gold/15 px-2 text-xl font-bold text-gold-ink"
              variants={pop}
              initial="hidden"
              animate="visible"
            >
              +50%
            </motion.span>
          )}
        </AnimatePresence>
      </p>
      <p
        className={`font-mono text-5xl leading-none font-black whitespace-nowrap ${
          value === 0 ? "text-ink-dim" : tone
        }`}
      >
        {verdict ? (
          <CountUp value={value} from={0} duration={bonus ? 0.5 : 0.6} format={plus} />
        ) : (
          " "
        )}
      </p>
    </div>
  );
}

/** Reactions burst up out of a card at the end of its reveal. */
function Bursts({ emojis, seed }: { emojis: string[]; seed: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[3rem] z-30">
      {emojis.map((key, index) => {
        const x = 50 + spreadOf(`${seed}:${index}`) * 40;
        return (
          <motion.span
            key={index}
            className="absolute top-0 text-5xl"
            style={{ left: `${x}%` }}
            initial={{ y: 0, opacity: 0, scale: 0.6 }}
            animate={{ y: "-3rem", opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{
              duration: 1.6,
              delay: index * 0.08,
              ease: EASE.out,
              opacity: { duration: 1.6, delay: index * 0.08, times: [0, 0.1, 0.6, 1] },
            }}
          >
            {reactionEmoji(key)}
          </motion.span>
        );
      })}
    </div>
  );
}

/** Who can vote on this matchup: everyone but its two authors, at most six chips. */
function useEligible(prompt: SlPrompt): RoomPlayer[] {
  const { players } = usePlayers();
  return players.filter((player) => !prompt.assigneeIds.includes(player.id)).slice(0, MAX_FACES);
}

/**
 * VOTING's band: one ballot chip per voter, filling (in vote order, never
 * saying whose) as votes come in, plus anonymous reaction floats.
 */
function BallotBand({
  prompt,
  shown,
  hint,
  reduced,
}: {
  prompt: SlPrompt;
  shown: boolean;
  hint: boolean;
  reduced: boolean;
}) {
  const { room } = useRoom().view;
  const eligible = useEligible(prompt);
  const rows = prompt.votes;
  const filled = Math.min(rows.length, eligible.length);
  useCue(rows.length, "vote-cast", room.phase === "VOTING");

  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[1rem]">
      {hint && (
        <motion.p
          className="text-2xl whitespace-nowrap text-ink-dim"
          initial={false}
          animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: TRAVEL.enter }}
          transition={SPRING.smooth}
        >
          Vote on your phone
        </motion.p>
      )}
      <motion.ul
        className="flex items-center gap-[0.5rem]"
        variants={listParent(eligible.length, STAGGER.tight)}
        initial={false}
        animate={shown ? "visible" : "hidden"}
        aria-hidden="true"
      >
        {eligible.map((_, index) => {
          const row = rows[index];
          return (
            <motion.li key={index} variants={pop} className="relative size-[2.5rem]">
              <AnimatePresence initial={false}>
                {row ? (
                  <motion.span
                    key={row.voterId}
                    className="absolute inset-0 grid place-items-center rounded-full bg-teal text-accent-ink"
                    variants={pop}
                    initial="hidden"
                    animate="visible"
                  >
                    <DrawnCheck className="size-[60%]" delay={0.08} />
                  </motion.span>
                ) : (
                  <span
                    key="empty"
                    className="absolute inset-0 rounded-full border-2 border-dashed border-edge-strong"
                  />
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </motion.ul>
      <p className="sr-only" aria-live="polite">
        {filled} of {eligible.length} votes in
      </p>
      {!reduced && <LiveReactionFloats prompt={prompt} />}
    </div>
  );
}

function LiveReactionFloats({ prompt }: { prompt: SlPrompt }) {
  const reactions = useSloplashReactions(prompt);
  return reactions ? <ReactionFloats reactions={reactions} /> : null;
}

/**
 * REVEAL's band before the names: the ballot chips unmask into the voters'
 * faces, abstainers and empty chips fold away, and each cast vote flies off
 * into the card it picked (the same `layoutId` as its spot in the stack).
 */
function RevealBand({
  prompt,
  flown,
  collapsed,
  reduced,
}: {
  prompt: SlPrompt;
  flown: Set<number>;
  collapsed: boolean;
  reduced: boolean;
}) {
  const { byId } = usePlayers();
  const eligible = useEligible(prompt);
  const answerIds = new Set(prompt.answers.map((answer) => answer.id as string));
  const slots = Math.max(eligible.length, prompt.votes.length);

  return (
    <ul className="absolute inset-0 flex items-center justify-center gap-[0.5rem]">
      <AnimatePresence mode="popLayout">
        {Array.from({ length: slots }, (_, index) => {
          const row = prompt.votes[index];
          const cast = !!row && row.responseId !== null && answerIds.has(row.responseId);
          if (row && flown.has(index)) return null;
          if (collapsed && !cast) return null;
          const voter = row ? byId(row.voterId) : undefined;
          if (!row || !voter) {
            return (
              <motion.li
                key={`empty-${index}`}
                className="size-[2.5rem] rounded-full border-2 border-dashed border-edge-strong"
                exit={{ opacity: 0, scale: 0.4, transition: { duration: DUR.fast } }}
              />
            );
          }
          return (
            <motion.li
              key={row.voterId}
              layoutId={reduced || !cast ? undefined : `voter:${prompt.id}:${row.voterId}`}
              className="rounded-full"
              variants={unmask}
              initial="hidden"
              animate="visible"
              exit={
                cast
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { opacity: 0, scale: 0.4, transition: { duration: DUR.fast } }
              }
              transition={{ layout: SPRING.snappy }}
              title={voter.name}
            >
              <Avatar name={voter.name} modelId={voter.modelId} size="2.5rem" />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/** Who wrote what: loser first, then the winner. */
function NamePlates({
  answers,
  winnerSide,
  reduced,
}: {
  answers: [SlAnswer, SlAnswer];
  winnerSide: 0 | 1 | null;
  reduced: boolean;
}) {
  const { byId } = usePlayers();
  return (
    <div
      data-ambient-calm
      className="absolute inset-0 grid grid-cols-1 items-center @4xl:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)]"
    >
      {answers.map((answer, side) => {
        const author = byId(answer.playerId);
        const late = winnerSide === null ? side === 1 : side === winnerSide;
        return (
          <motion.div
            key={answer.id}
            className={`flex min-w-0 items-center justify-center gap-[0.75rem] ${side === 1 ? "@4xl:col-start-3" : ""}`}
            variants={unmask}
            initial={reduced ? false : "hidden"}
            animate="visible"
            transition={{ delay: late ? STAGGER.beats : 0 }}
          >
            {author && <Avatar name={author.name} modelId={author.modelId} size="3rem" />}
            <span
              className={`min-w-0 truncate font-display font-bold ${
                winnerSide === side ? "text-gold-ink" : "text-ink"
              } ${(author?.name.length ?? 0) <= 14 ? "text-3xl @4xl:text-4xl" : "text-2xl @4xl:text-3xl"}`}
            >
              {author?.name ?? "?"}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// --- Walkover: one answer, a ghost, and a flat win ---

function WalkoverMatchup({ prompt }: { prompt: SlPrompt }) {
  const { view } = useRoom();
  const { room } = view;
  const { byId } = usePlayers();
  const reduced = useReducedAfterMount();
  const cues = useMemo(() => walkoverCues(), []);
  const moment = useMoment(cues.cues, { when: room.phase === "REVEAL" });
  const at = (name: keyof typeof cues.beat) => moment >= cues.beat[name];
  const present = prompt.answers.find((answer) => !answer.forfeited) ?? prompt.answers[0]!;
  const winner = byId(present.playerId);
  const unit = pointsPerVote(room.round);

  return (
    <div className="@container flex min-h-0 flex-1 flex-col px-[3rem] @max-4xl:px-4">
      <div className={GRID}>
        <ProgressDots className="row-start-2" />
        <motion.h2 variants={sceneItem} className={`row-start-4 ${promptClasses(prompt.text)}`}>
          {prompt.text}
        </motion.h2>
        <motion.div
          variants={sceneItem}
          className="row-start-6 grid min-h-0 grid-cols-1 gap-y-4 @4xl:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)]"
        >
          <div className={CARD}>
            <div className="flex min-h-0 flex-1 items-center">
              <p className={`${ANSWER_TEXT} ${answerSize([present])}`}>{present.text}</p>
            </div>
            <div className="mt-[1rem] flex min-h-[5rem] items-end justify-end">
              <p className="font-mono text-5xl leading-none font-black text-gold-ink">
                {at("count") ? <CountUp value={unit} from={0} duration={0.6} format={plus} /> : " "}
              </p>
            </div>
          </div>
          <motion.div
            aria-hidden="true"
            className="flex min-h-0 items-center justify-center gap-[1rem] rounded-3xl border-2 border-dashed border-edge-strong bg-transparent @4xl:col-start-3 @max-4xl:min-h-[8rem]"
            initial={false}
            animate={
              at("sag") && !reduced
                ? { rotate: [0, 2.5, 0.75], y: ["0rem", "0.6rem", "0.2rem"] }
                : { rotate: 0, y: 0 }
            }
            transition={{ duration: 1.1, ease: EASE.inOut, times: [0, 0.45, 1] }}
          >
            {/* The empty seat: a big "…", drawn as dots so it reads across a room. */}
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-[1.1rem] rounded-full bg-ink-dim" />
            ))}
          </motion.div>
        </motion.div>
        <div className="relative row-start-8 flex min-h-[3.5rem] items-center justify-center">
          <AnimatePresence>
            {at("band") && winner && (
              <motion.p
                key="band"
                className="flex min-w-0 items-center gap-[0.75rem] font-display text-2xl font-bold text-ink @4xl:text-3xl"
                variants={unmask}
                initial={reduced ? false : "hidden"}
                animate="visible"
              >
                <Avatar name={winner.name} modelId={winner.modelId} size="3rem" />
                <span className="min-w-0 truncate">
                  No answer · <span className="text-gold-ink">{winner.name}</span> wins by default
                </span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
