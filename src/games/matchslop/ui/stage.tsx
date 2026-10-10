"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, type Variants } from "motion/react";
import { setAmbient } from "@/lib/ambient-events";
import { ACCENT, DUR, EASE, SPRING, enter, fade, pop } from "@/lib/animations";
import type { TitleCardSpec } from "@/room/game-ui";
import { isHostClocked } from "@/room/host-actions";
import { useModeView, useRoom, type RoomView } from "@/room/context";
import { CountUp, Stamp, useFreshAtMount, useSurface } from "@/room/moment";
import { DoneTracker } from "@/room/parts";
import { Avatar } from "@/room/avatar";
import { BallotGrid, ContextBubble, VotedRow } from "./ballot";
import {
  LONE,
  MEET,
  NEXT,
  SEND,
  finalBeats,
  meetOffset,
  replyBeats,
  useBeats,
  useDisplayMood,
  type NamedCue,
} from "./beats";
import {
  COPY,
  UNMATCHED,
  endingOf,
  heartDelta,
  reactionOf,
  signedPoints,
  stampOf,
  type Ending,
} from "./copy";
import { MeetHero, ProfileHero, PromptDeck } from "./deck";
import { FinalHero, RecapSections, Standings, rankPlayers } from "./finale";
import { DockedStamp, PersonaStrip, type LinePulse, type MeterShown } from "./strip";
import { Thread } from "./thread";
import {
  isLastMessageRound,
  latestPersona,
  personaName,
  personaTurn,
  type MatchslopMode,
} from "./primitives";

/** The shell's title card for the last message and the comeback (round 1 uses the game-start card). */
export function titleCardOf(view: RoomView): TitleCardSpec | null {
  const { room, mode } = view;
  if (mode.kind !== "MATCHSLOP" || room.status !== "PLAYING" || room.phase !== "WRITING") {
    return null;
  }
  const name = personaName(mode.persona);
  if (mode.comeback) {
    return {
      id: `comeback:${room.round}`,
      kicker: COPY.comebackKicker(name),
      title: COPY.oneLastShot,
      tone: "punch",
    };
  }
  if (isLastMessageRound(room)) {
    return {
      id: `last:${room.round}`,
      kicker: COPY.lastMessageKicker,
      title: COPY.lastMessage,
      tone: "gold",
    };
  }
  return null;
}

type Kind = "profile" | "meet" | "writing" | "voting" | "sent" | "reply" | "final";

function kindOf(view: RoomView): Kind {
  const { status, phase, round } = view.room;
  if (status === "FINISHED") return "final";
  switch (phase) {
    case "PROFILE":
      return "profile";
    case "WRITING":
      return round === 1 ? "meet" : "writing";
    case "VOTING":
      return "voting";
    case "SENT":
      return "sent";
    case "REPLY":
      return "reply";
    default:
      return "writing";
  }
}

/** Lands a stamp in place, without its slam: for a screen opened after the beat. */
function Settled({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? <MotionConfig reducedMotion="always">{children}</MotionConfig> : <>{children}</>;
}

/** The REPLY's verdict state: what is stamped where, and when. */
function useReplyOutcome(mode: MatchslopMode) {
  const { latest, previous } = personaTurn(mode.messages);
  const now = stampOf(latest, mode);
  // A comeback reply: the last shot's "Unmatched" is already docked.
  const before = previous?.outcome === "UNMATCHED" ? UNMATCHED : null;
  return { latest, now, before, saved: before !== null && now?.tone === "win" };
}

/**
 * The whole date on the TV, one scene from PROFILE to FINAL that never
 * remounts: her strip (face + heart meter), one instruction line, and a body
 * (the deck, the chat, or the ballot). Each phase changes the picture in
 * place, so the portrait, voter faces, the sent line, the delta and the
 * verdict stamp fly between regions.
 */
export function MatchslopStage() {
  const { view, live } = useRoom();
  const mode = useModeView("MATCHSLOP");
  const surface = useSurface();
  const { room, players } = view;
  const kind = kindOf(view);
  const tight = surface === "stage" && isHostClocked(room);
  const fresh = useFreshAtMount();
  const displayMood = useDisplayMood();
  const name = personaName(mode.persona);
  const round = mode.round;
  const roundNumber = room.round;

  // The scene never remounts, so this survives from PROFILE into the Meet.
  const [sawProfile, setSawProfile] = useState(kind === "profile");
  if (kind === "profile" && !sawProfile) setSawProfile(true);

  useEffect(() => {
    setAmbient({ mood: displayMood });
  }, [displayMood]);
  useEffect(() => () => setAmbient({ mood: null }), []);

  const reply = useReplyOutcome(mode);
  const signal = mode.signal;
  const scored = kind === "reply" && signal?.source === "model" && signal.level !== null;
  const level = scored ? signal!.level : null;
  const heroTurn = kind === "reply" && reply.now !== null;
  const lastShot = heroTurn && mode.outcome === "IN_PROGRESS";
  const R = replyBeats(kind === "reply" ? (reply.latest?.text ?? "") : "");

  // SENT: who flies to which card, by card then by voting order.
  const answers = round?.answers ?? [];
  const lone = answers.length === 1;
  const voteOrder = new Map(
    (round?.votedPlayerIds ?? []).map((id, index) => [id as string, index]),
  );
  const flights: string[] = answers.flatMap((answer) =>
    answer.voterIds.toSorted((a, b) => (voteOrder.get(a) ?? 0) - (voteOrder.get(b) ?? 0)),
  );

  const ranked = rankPlayers(players);
  const F = finalBeats(ranked.length);
  const stampedInReply = stampOf(reply.latest, mode) !== null;
  const finalEnding: Ending = mode.verdict ? endingOf(mode.verdict) : UNMATCHED;
  const dateWon = finalEnding.tone === "win";
  const crownRef = useRef<HTMLLIElement>(null);
  const heroStampRef = useRef<HTMLDivElement>(null);

  const cues: NamedCue<string>[] = (() => {
    switch (kind) {
      case "meet": {
        const M = meetOffset(sawProfile);
        return [
          { name: "unblur", at: M + MEET.unblur },
          { name: "stamp", at: M + MEET.stamp },
          {
            name: "stampImpact",
            at: M + MEET.stamp + 170,
            sound: "stamp-slam",
            ambient: { kind: "heart", strength: 0.6 },
          },
          { name: "name", at: M + MEET.name },
          { name: "place", at: M + MEET.place },
          { name: "dock", at: M + MEET.dock, sound: "round-start" },
          { name: "fill", at: M + MEET.fill },
          { name: "unmatchLine", at: M + MEET.unmatchLine },
          { name: "dateLine", at: M + MEET.dateLine },
          { name: "deal", at: M + MEET.deal },
          { name: "tracker", at: M + MEET.tracker },
        ];
      }
      case "writing":
        return [
          { name: "start", at: 0, sound: titleCardOf(view) ? undefined : "round-start" },
          { name: "instruction", at: NEXT.instruction },
          { name: "tracker", at: NEXT.tracker },
        ];
      case "voting":
        return [{ name: "start", at: 0, sound: "prompt-advance" }];
      case "sent":
        if (lone) {
          return [
            { name: "bubble", at: LONE.bubble, sound: "chat-send" },
            { name: "author", at: LONE.author },
            { name: "typing", at: LONE.typing },
          ];
        }
        return [
          { name: "reveal", at: SEND.reveal, sound: "vote-reveal" },
          ...flights.map((_, k) => ({ name: `fly:${k}`, at: SEND.flyBase + k * SEND.flyStep })),
          { name: "collapse", at: SEND.collapseB1 },
          { name: "unmask", at: SEND.unmask },
          { name: "stamp", at: SEND.stamp },
          { name: "stampImpact", at: SEND.stamp + 170, sound: "stamp-slam" },
          {
            name: "morph",
            at: SEND.morph,
            sound: "chat-send",
            ambient: { kind: "swell", strength: 0.4 },
          },
          { name: "typing", at: SEND.typing },
        ];
      case "reply": {
        const positive = level === "cute" || level === "good" || level === "great";
        const negative = level === "cringe" || level === "dealbreaker";
        const won = reply.now?.tone === "win";
        const list: NamedCue<string>[] = [
          { name: "receive", at: 0, sound: "chat-receive" },
          { name: "react", at: R.react },
          {
            name: "impact",
            at: R.impact,
            sound: scored && !heroTurn ? "stamp-slam" : undefined,
            ambient: positive
              ? { kind: "heart", strength: 0.5 }
              : negative
                ? { kind: "chill", strength: 0.6 }
                : undefined,
            shake: level === "dealbreaker" ? "soft" : undefined,
          },
          { name: "delta", at: R.delta },
          { name: "swing", at: R.swing, sound: reply.saved ? "winner-reveal" : undefined },
          { name: "chipGone", at: R.swing + 800 },
        ];
        if (!heroTurn) return [...list, { name: "thought", at: R.thought }];
        return [
          ...list,
          { name: "pulse", at: R.pulse },
          { name: "hero", at: R.hero },
          {
            name: "heroImpact",
            at: R.heroImpact,
            sound: "stamp-slam",
            origin: heroStampRef,
            ...(won
              ? {
                  flash: "win" as const,
                  confetti: "hearts" as const,
                  ambient: { kind: "heart" as const, strength: 1 },
                }
              : {
                  shake: "soft" as const,
                  flash: "fail" as const,
                  ambient: { kind: "chill" as const, strength: 1 },
                }),
          },
          ...(won ? [{ name: "celebrate", at: R.celebrate, sound: "celebration" as const }] : []),
          { name: "dock", at: R.dock },
          { name: "thought", at: R.heroThought },
          ...(lastShot ? [{ name: "teaser", at: R.teaser }] : []),
        ];
      }
      case "final":
        return [
          { name: "fold", at: F.fold },
          { name: "unstamped", at: F.unstampedStamp },
          {
            name: "unstampedImpact",
            at: F.unstampedImpact,
            sound: stampedInReply ? undefined : "stamp-slam",
          },
          { name: "name", at: F.name },
          { name: "parting", at: F.parting },
          ...ranked.slice(1).map((_, j) => ({ name: `row:${j}`, at: F.row(j) })),
          {
            name: "crown",
            at: F.crown,
            sound: "game-over",
            flash: "gold",
            confetti: "final",
            origin: crownRef,
            ambient: dateWon ? { kind: "heart", strength: 1 } : { kind: "cheer", strength: 0.6 },
          },
          { name: "verdicts", at: F.verdicts },
        ];
      default:
        return [];
    }
  })();
  const reached = useBeats(cues);

  // ---- Final -------------------------------------------------------------
  let finale: ReactNode = null;
  if (kind === "final") {
    // Row i (best first) rises at row:(n - 1 - i), from last place up; the top waits for the crown.
    const risen = (index: number) =>
      index === 0 ? reached("crown") : reached(`row:${ranked.length - 1 - index}`);
    const stamp = stampedInReply ? "docked" : reached("unstamped") ? "slam" : null;
    const hero = (
      <FinalHero
        mode={mode}
        ending={finalEnding}
        stamp={stamp}
        grey={finalEnding.verdict === "UNMATCHED" && (stampedInReply || reached("unstampedImpact"))}
        named={reached("name")}
        parting={reached("parting")}
        fresh={fresh}
      />
    );
    const standings = (
      <Standings
        mode={mode}
        players={players}
        risen={risen}
        crowned={reached("crown")}
        verdicts={reached("verdicts")}
        topRef={crownRef}
        stacked={!live}
      />
    );
    if (!live) {
      // The recap page: a plain page that may scroll; stacked on narrow screens.
      return (
        <div className="mx-auto w-full max-w-6xl overflow-x-clip px-4 py-8 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,22fr)_minmax(0,52fr)] lg:gap-x-8">
            {hero}
            {standings}
          </div>
          <RecapSections mode={mode} />
        </div>
      );
    }
    finale = (
      <motion.div
        key="final"
        data-ms-frame=""
        className="grid min-h-0 flex-1 grid-cols-[minmax(0,22fr)_minmax(0,52fr)] items-center gap-x-8 px-8 py-3 max-sm:flex max-sm:flex-col max-sm:items-stretch max-sm:gap-8 max-sm:overflow-y-auto max-sm:px-4"
        variants={fade}
        initial="hidden"
        animate="visible"
      >
        <div className="flex min-h-0 flex-col justify-center">{hero}</div>
        <div className="flex min-h-0 flex-col justify-center">{standings}</div>
      </motion.div>
    );
  }

  // ---- Strip -------------------------------------------------------------
  const meetDocked = kind !== "meet" || reached("dock");
  const stripShown = kind !== "profile" && meetDocked;
  const meterShown: MeterShown | undefined =
    kind === "meet"
      ? {
          track: reached("dock"),
          fill: reached("fill"),
          unmatchLine: reached("unmatchLine"),
          dateLine: reached("dateLine"),
        }
      : undefined;
  const moodFrom = kind === "meet" && fresh ? 0 : displayMood;

  // Docked verdict, portrait greyscale, and the line pulse.
  let docked: ReactNode = null;
  let grey = false;
  let pulse: LinePulse = null;
  if (kind === "reply") {
    const { now, before, saved } = reply;
    if (before && !(saved ? reached("swing") : reached("hero"))) {
      docked = <DockedStamp key="before" ending={before} layout={!saved} peel={saved} />;
      grey = true;
    } else if (now && reached("dock")) {
      docked = <DockedStamp key="now" ending={now} />;
    }
    if (now?.verdict === "UNMATCHED" && (before ? !saved : reached("heroImpact"))) grey = true;
    if (now && reached("pulse") && !reached("hero")) {
      pulse = now.tone === "win" ? "date" : now.verdict === "UNMATCHED" ? "unmatch" : "missed";
    }
  } else {
    const now = stampOf(reply.latest, mode);
    if (now) {
      docked = <DockedStamp key={mode.comeback ? "before" : "now"} ending={now} />;
      grey = now.verdict === "UNMATCHED";
    }
  }

  // The delta chip: off the reaction stamp, then into the meter.
  // A saved comeback skips the chip: the peel and the meter's sweep tell that story.
  const chip =
    scored && signal && !reply.saved ? (
      <motion.span
        layoutId={`ms-delta-${roundNumber}`}
        transition={SPRING.smooth}
        className={`block whitespace-nowrap rounded-full bg-surface px-3 py-0.5 font-mono text-3xl font-bold shadow-md ${
          signal.delta > 0 ? "text-win" : signal.delta < 0 ? "text-fail" : "text-ink"
        }`}
        variants={pop}
        initial="hidden"
        animate="visible"
        exit={{ opacity: 0, transition: { duration: DUR.base } }}
      >
        {heartDelta(signal.delta)}
      </motion.span>
    ) : null;
  const chipAtStamp = chip && reached("delta") && !reached("swing");
  const chipAtMeter = chip && reached("swing") && !reached("chipGone");

  // ---- Instruction slot (B1) --------------------------------------------
  let instruction: { key: string; node: ReactNode } | null = null;
  if (kind === "meet" && reached("deal")) {
    instruction = { key: "opener", node: <Instruction>{COPY.writeOpener(name)}</Instruction> };
  } else if (kind === "writing" && reached("instruction")) {
    instruction = {
      key: mode.comeback ? "comeback" : "reply",
      node: <Instruction>{mode.comeback ? COPY.winBack(name) : COPY.writeReply(name)}</Instruction>,
    };
  } else if (kind === "voting" || (kind === "sent" && !lone && !reached("collapse"))) {
    const anyAi = players.some((player) => player.type === "AI");
    const flown = (id: string) => {
      const k = flights.indexOf(id);
      return kind === "sent" && k >= 0 && reached(`fly:${k}`);
    };
    instruction = {
      key: "vote",
      node: (
        <div className="flex h-full items-center gap-6">
          <AnimatePresence initial={false}>
            {kind === "voting" && (
              <motion.div
                key="ask"
                className="flex min-w-0 flex-1 items-baseline gap-4"
                variants={fade}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Instruction>{COPY.whichOne}</Instruction>
                {anyAi && <span className="shrink-0 text-lg text-ink-dim">{COPY.humanDouble}</span>}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="ml-auto">
            <VotedRow players={players} votedIds={round?.votedPlayerIds ?? []} flown={flown} />
          </div>
        </div>
      ),
    };
  } else if (kind === "reply" && lastShot && reached("teaser")) {
    instruction = {
      key: "teaser",
      node: (
        <p className="truncate font-display text-3xl font-bold text-punch">
          {COPY.oneLastShotNext}
        </p>
      ),
    };
  }
  const b1Open = instruction !== null || (kind === "sent" && !lone && !reached("collapse"));

  // ---- Body (B2) ---------------------------------------------------------
  const heroShown = kind === "reply" && reply.now !== null && reached("hero") && !reached("dock");
  const gap = tight ? "gap-3" : "gap-4";
  let body: { key: string; node: ReactNode } = { key: "empty", node: null };
  const tracker = round && (
    <DoneTracker
      variant="stage"
      label={COPY.textsIn}
      doneIds={round.answeredPlayerIds}
      playerIds={round.writerIds}
    />
  );

  if (kind === "profile") {
    body = { key: "profile", node: <ProfileHero persona={mode.persona} /> };
  } else if (kind === "meet" && !reached("dock")) {
    body = {
      key: "meet",
      node: (
        <MeetHero
          persona={mode.persona}
          unblurred={reached("unblur")}
          stamped={reached("stamp")}
          named={reached("name")}
          placed={reached("place")}
          fresh={fresh}
        />
      ),
    };
  } else if (kind === "meet") {
    body = {
      key: "deck",
      node: (
        <div className={`flex h-full flex-col justify-start ${tight ? "gap-3" : "gap-5"}`}>
          {reached("deal") && <PromptDeck persona={mode.persona} deal={fresh} tight={tight} />}
          <Reveal show={reached("tracker")}>{tracker}</Reveal>
        </div>
      ),
    };
  } else if (kind === "voting" || (kind === "sent" && !lone && !reached("morph"))) {
    const sent = kind === "sent";
    const context = roundNumber > 1 ? latestPersona(mode.messages) : null;
    body = {
      key: "ballot",
      node: (
        <div className={`flex h-full flex-col ${tight ? "gap-3" : "gap-4"}`}>
          <AnimatePresence initial={false}>
            {context && !sent && (
              <motion.div
                key="context"
                variants={enter}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <ContextBubble text={context.text} tight={tight} />
              </motion.div>
            )}
          </AnimatePresence>
          <BallotGrid
            answers={answers}
            players={players}
            round={roundNumber}
            winnerId={sent ? (round?.winnerResponseId ?? null) : null}
            reveal={
              sent
                ? {
                    flown: (id) => {
                      const k = flights.indexOf(id);
                      return k >= 0 && reached(`fly:${k}`);
                    },
                    unmasked: reached("unmask"),
                    stamped: reached("stamp"),
                  }
                : null
            }
            deal={kind === "voting" && fresh}
            tight={tight}
          />
        </div>
      ),
    };
  } else {
    const sent = kind === "sent";
    const replying = kind === "reply";
    const winner = answers.find((answer) => answer.id === round?.winnerResponseId);
    const sentAuthor = players.find((player) => player.id === winner?.playerId);
    const replyAuthor = players.find((player) => player.id === signal?.authorId);
    const reaction = reactionOf(level);
    const asideShown = sent && (lone ? reached("author") : reached("morph"));
    body = {
      key: "thread",
      node: (
        <div className={`flex h-full flex-col ${gap}`}>
          <Thread
            className="flex-1"
            gap={gap}
            messages={mode.messages}
            round={roundNumber}
            bigCurrent={sent || replying}
            herLatestBig={!sent}
            typing={sent && reached("typing")}
            typeReply={replying && fresh}
            holdCurrentTapback={sent || replying}
            ourAside={
              asideShown && sentAuthor ? (
                <motion.span variants={enter} initial="hidden" animate="visible">
                  <Avatar name={sentAuthor.name} modelId={sentAuthor.modelId} size="2.25rem" />
                </motion.span>
              ) : null
            }
            ourCorner={
              replying ? (
                // Hangs off our bubble's left edge, centred on it, so it never reaches
                // the row above or covers our words; the delta chip sits to its left.
                // It steps aside while the hero verdict holds the screen.
                <span className="pointer-events-none absolute right-[calc(100%-1rem)] top-1/2 z-10 w-max -translate-y-1/2">
                  {reached("react") && !heroShown && (
                    <Settled when={!fresh}>
                      <Stamp size="lg" tone={reaction.tone} tilt={ACCENT.matchslop.stampTilt}>
                        {reaction.text}
                      </Stamp>
                    </Settled>
                  )}
                  <span className="absolute right-full top-1/2 mr-3 -translate-y-1/2">
                    <AnimatePresence>{chipAtStamp && chip}</AnimatePresence>
                  </span>
                </span>
              ) : null
            }
            ourBelow={
              // Laid out from the start of REPLY and only faded in, so the chat
              // never nudges up when they appear.
              replying && scored && signal && signal.points !== 0 && replyAuthor ? (
                <motion.div
                  className="mt-3 flex items-center gap-3"
                  initial={false}
                  animate={{ opacity: reached("swing") ? 1 : 0 }}
                  transition={{ duration: DUR.base, ease: EASE.out }}
                >
                  <Avatar name={replyAuthor.name} modelId={replyAuthor.modelId} size="2.25rem" />
                  <span className="text-2xl text-ink">{replyAuthor.name}</span>
                  <span
                    className={`font-mono text-2xl font-bold ${signal.points > 0 ? "text-win" : "text-fail"}`}
                  >
                    <CountUp
                      value={reached("swing") || !fresh ? signal.points : 0}
                      from={fresh ? 0 : signal.points}
                      format={(n) => signedPoints(Math.round(n))}
                    />
                  </span>
                </motion.div>
              ) : null
            }
            herBelow={
              replying && signal?.thought ? (
                <motion.p
                  // Right padding keeps the italic overhang of the last glyph inside the clamp.
                  className="mt-2 line-clamp-1 max-w-[80%] pr-3 text-2xl italic text-ink-dim"
                  initial={false}
                  animate={{ opacity: reached("thought") ? 1 : 0 }}
                  transition={{ duration: DUR.base, ease: EASE.out }}
                >
                  💭 {signal.thought}
                </motion.p>
              ) : null
            }
          />
          {kind === "writing" && <Reveal show={reached("tracker")}>{tracker}</Reveal>}
        </div>
      ),
    };
  }

  const date = (
    <motion.div
      key="date"
      data-ms-frame=""
      className={`flex min-h-0 flex-1 flex-col px-8 pt-4 ${tight ? "pb-1" : "pb-5"}`}
      exit={{ opacity: 0, transition: { duration: DUR.base, ease: EASE.in } }}
    >
      <AnimatePresence initial={false}>
        {stripShown && (
          <motion.div
            key="strip"
            className="shrink-0"
            // Height only: the portrait flies in from the Meet's card at full strength.
            variants={GROW}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="pb-5">
              <PersonaStrip
                persona={mode.persona}
                mood={displayMood}
                moodFrom={moodFrom}
                meta={roundNumber === 1}
                grey={grey}
                docked={docked}
                shown={meterShown}
                pulse={pulse}
                metaEnter={kind === "meet" && fresh}
                landing={<AnimatePresence>{chipAtMeter && chip}</AnimatePresence>}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="shrink-0 overflow-hidden"
        initial={false}
        animate={{ height: b1Open ? "3rem" : 0, marginBottom: b1Open ? "1rem" : 0 }}
        transition={{ duration: DUR.base, ease: EASE.inOut }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {instruction && (
            <motion.div
              key={instruction.key}
              className="h-[3rem]"
              variants={enter}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {instruction.node}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={body.key}
            className="h-full"
            variants={fade}
            // In SENT the chat is the flight's landing: it is there at full strength.
            initial={kind === "sent" && body.key === "thread" ? false : "hidden"}
            animate="visible"
            exit="exit"
          >
            {body.node}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {heroShown && (
            <motion.div
              key="scrim"
              className="absolute inset-0 z-20 rounded-[2rem] bg-canvas/85"
              variants={fade}
              initial="hidden"
              animate="visible"
              exit="exit"
            />
          )}
        </AnimatePresence>
        {/* Not faded with the scrim: at the dock it flies, at full strength, to her portrait. */}
        {heroShown && reply.now && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
            <motion.div
              ref={heroStampRef}
              layoutId="ms-outcome"
              layoutCrossfade={false}
              transition={SPRING.smooth}
            >
              <Settled when={!fresh}>
                <Stamp
                  size="xl"
                  tone={reply.now.tone}
                  tilt={ACCENT.matchslop.stampTilt}
                  className="text-7xl!"
                >
                  {reply.now.text}
                </Stamp>
              </Settled>
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <LayoutGroup id="ms-date">
      <AnimatePresence mode="popLayout" initial={false}>
        {finale ?? date}
      </AnimatePresence>
    </LayoutGroup>
  );
}

function Instruction({ children }: { children: ReactNode }) {
  return (
    <p className="truncate font-display text-3xl font-bold leading-[3rem] text-ink">{children}</p>
  );
}

/**
 * Laid out from the start and faded in on its beat, so whatever it joins
 * never shifts when it appears.
 */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
      aria-hidden={!show}
    >
      {children}
    </motion.div>
  );
}

/** The strip arriving or leaving: height only, never opacity (the portrait flies into it). */
const GROW: Variants = {
  hidden: { height: 0 },
  visible: { height: "auto", transition: { duration: DUR.base, ease: EASE.inOut } },
  exit: { height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } },
};
