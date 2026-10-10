"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { CompletionCard } from "@/room/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { setAmbient } from "@/lib/ambient-events";
import { SPRING, enter, fade, pop, press } from "@/lib/animations";
import { ordinal } from "@/lib/format";
import { useModeView, useRoom, useRoomAction, type RoomPlayer } from "@/room/context";
import { CountUp, TypeOn, buzz, useFreshAtMount } from "@/room/moment";
import {
  LONE,
  PARTING_CPS,
  SEND,
  finalBeats,
  replyBeats,
  useBeats,
  useDisplayMood,
  type NamedCue,
} from "./beats";
import { Composer } from "./composer";
import {
  COPY,
  LEVEL_TONE,
  TONE_TEXT,
  heartDelta,
  letterOf,
  phoneEnding,
  reactionOf,
  signedPoints,
  stampOf,
} from "./copy";
import { rankPlayers, verdictFor } from "./finale";
import { PersonaFace } from "./strip";
import {
  TypingDots,
  isLastMessageRound,
  latestPersona,
  openerCards,
  personaName,
  type Answer,
  type MatchslopMode,
  type Round,
} from "./primitives";

/** A status screen: centred in the lower two-thirds, where eyes already are. */
function Status({ children }: { children: ReactNode }) {
  return (
    <output className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 pt-[18svh] text-center">
      {children}
    </output>
  );
}

function EyesOnTv({ className = "text-base" }: { className?: string }) {
  return <p className={`text-ink-dim ${className}`}>{COPY.eyesOnTv}</p>;
}

/** Her line on a phone: her face and a bubble. */
function HerLine({
  mode,
  text,
  className = "text-lg",
  clamp = "",
}: {
  mode: MatchslopMode;
  text: ReactNode;
  className?: string;
  /** A line clamp, kept off the padded bubble so the padding never shows a cut line. */
  clamp?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <PersonaFace
        persona={mode.persona}
        className="size-8"
        radius="50%"
        monogram="text-base"
        layoutId={null}
      />
      <p
        className={`min-w-0 rounded-2xl rounded-bl-md border border-edge bg-surface px-4 py-2.5 leading-snug text-ink ${className}`}
      >
        {clamp ? <span className={clamp}>{text}</span> : text}
      </p>
    </div>
  );
}

/** Round 1: tap one of her prompts (or her photo, once it exists), then write to it. */
function OpenerWriting({
  mode,
  send,
}: {
  mode: MatchslopMode;
  send: (text: string, opener: string) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const openers = openerCards(mode.persona);
  const chosen = openers.find((opener) => opener.id === picked) ?? null;
  const others = openers.filter((opener) => opener !== chosen);

  return (
    <LayoutGroup id="ms-opener">
      <h2 className="font-display text-xl font-bold text-ink">{COPY.pickOne}</h2>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        {chosen && (
          <fieldset
            className="m-0 flex min-w-0 gap-2 overflow-x-auto border-0 p-0 pb-1"
            aria-label="Switch prompt"
          >
            {others.map((opener) => (
              <motion.button
                key={opener.id}
                layoutId={`opener-${opener.id}`}
                type="button"
                onClick={() => setPicked(opener.id)}
                className="flex h-12 min-w-0 max-w-[45%] shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 border-edge bg-surface px-4 text-sm font-bold text-punch"
                transition={SPRING.snappy}
                whileTap={press.whileTap}
              >
                {opener.photo && <Thumb src={opener.photo} className="-ml-3 size-9" />}
                <span className="truncate">{opener.prompt}</span>
              </motion.button>
            ))}
          </fieldset>
        )}
        {(chosen ? [chosen] : openers).map((opener) => (
          <motion.button
            key={opener.id}
            layoutId={`opener-${opener.id}`}
            type="button"
            aria-pressed={opener === chosen}
            onClick={() => setPicked(opener.id)}
            className={`flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 text-left ${
              opener === chosen ? "border-punch bg-punch/10" : "border-edge bg-surface"
            }`}
            transition={SPRING.snappy}
            whileTap={press.whileTap}
          >
            {opener.photo && <Thumb src={opener.photo} className="size-12" />}
            <span className="min-w-0">
              <span className="block text-sm font-bold text-punch">{opener.prompt}</span>
              {opener.answer && (
                <span
                  className={`block text-base leading-snug text-ink ${opener === chosen ? "" : "line-clamp-3"}`}
                >
                  {opener.answer}
                </span>
              )}
            </span>
          </motion.button>
        ))}
      </div>
      <Composer
        placeholder={COPY.yourOpener}
        ready={chosen !== null}
        field={chosen !== null}
        draft={draft}
        onDraft={setDraft}
        onSend={(text) => (chosen ? send(text, chosen.id) : Promise.resolve(false))}
      />
    </LayoutGroup>
  );
}

function Thumb({ src, className }: { src: string; className: string }) {
  return (
    <span className={`relative shrink-0 overflow-hidden rounded-xl ${className}`}>
      <Image src={src} alt="" fill unoptimized sizes="48px" className="object-cover" />
    </span>
  );
}

/** Round 2 on: her latest line, then the composer. */
function ReplyWriting({
  mode,
  round,
  last,
  send,
}: {
  mode: MatchslopMode;
  round: Round;
  last: boolean;
  send: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const name = personaName(mode.persona);
  const her = latestPersona(mode.messages)?.text ?? round.promptText;
  return (
    <>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        {mode.comeback ? (
          <div className="mb-1">
            <p className="text-base font-bold text-punch">{COPY.oneLastShot}</p>
            <p className="text-sm text-ink-dim">{COPY.comebackKicker(name)}</p>
          </div>
        ) : (
          last && (
            <p className="mb-1 text-sm font-bold uppercase tracking-[0.2em] text-gold-ink">
              {COPY.lastMessage}
            </p>
          )
        )}
        <HerLine mode={mode} text={her} />
      </div>
      <Composer
        placeholder={mode.comeback ? COPY.winBackPlaceholder(name) : COPY.yourReply}
        draft={draft}
        onDraft={setDraft}
        onSend={send}
      />
    </>
  );
}

/** WRITING: write, then "Locked in" with who's still writing. */
function Writing({ mode, round }: { mode: MatchslopMode; round: Round }) {
  const { view } = useRoom();
  const { act, error } = useRoomAction();
  const [sent, setSent] = useState<string | null>(null);
  const me = view.me?.playerId;

  if (!me || !round.writerIds.includes(me)) {
    return (
      <Status>
        <p className="text-xl text-ink">{COPY.nextRound}</p>
        <EyesOnTv />
      </Status>
    );
  }
  if (round.myResponseId) {
    const done = new Set<string>(round.answeredPlayerIds);
    const pending = view.players.filter(
      (player) => round.writerIds.includes(player.id) && !done.has(player.id),
    );
    return (
      <Status>
        <CompletionCard
          title={COPY.lockedIn}
          subtitle={sent ? `“${sent}”` : undefined}
          pending={pending.map(face)}
        />
      </Status>
    );
  }
  const submit = async (text: string, openerPromptId: string | null) => {
    const ok = await act(api.matchslop.play.submitResponse, {
      promptId: round.promptId,
      text,
      openerPromptId,
    });
    if (ok) setSent(text);
    return ok;
  };
  return (
    <>
      <ErrorBanner error={error} />
      {round.number === 1 ? (
        <OpenerWriting mode={mode} send={(text, opener) => submit(text, opener)} />
      ) : (
        <ReplyWriting
          mode={mode}
          round={round}
          last={isLastMessageRound(view.room)}
          send={(text) => submit(text, null)}
        />
      )}
    </>
  );
}

function face(player: RoomPlayer) {
  return { id: player.id, name: player.name, modelId: player.modelId };
}

/** VOTING: tap a card to send it. One tap, no confirm. */
function Voting({ mode, round }: { mode: MatchslopMode; round: Round }) {
  const { view } = useRoom();
  const { act, pending, error } = useRoomAction();
  const answers = round.answers;
  const mine = (answer: Answer) => answer.id === round.myResponseId;

  if (round.myVoteResponseId) {
    const index = answers.findIndex((answer) => answer.id === round.myVoteResponseId);
    const voted = new Set<string>(round.votedPlayerIds);
    return (
      <Status>
        <CompletionCard
          title={COPY.voted(letterOf(Math.max(0, index)))}
          subtitle={index >= 0 ? `“${answers[index]!.text}”` : undefined}
          pending={view.players.filter((player) => !voted.has(player.id)).map(face)}
        />
      </Status>
    );
  }
  if (!answers.some((answer) => !mine(answer))) {
    return (
      <Status>
        <EyesOnTv className="text-xl" />
      </Status>
    );
  }
  const her = round.number > 1 ? latestPersona(mode.messages) : null;
  const vote = (answer: Answer) => {
    buzz(12);
    void act(api.matchslop.play.castVote, { promptId: round.promptId, responseId: answer.id });
  };
  // Seven or eight lines: compact cards and a one-line context, so the whole
  // ballot fits one phone screen without scrolling.
  const compact = answers.length >= 7;
  return (
    <div className="flex flex-1 flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <ErrorBanner error={error} />
      <h2 className="font-display text-xl font-bold text-ink">{COPY.whichOne}</h2>
      {her && (
        <HerLine
          mode={mode}
          text={her.text}
          className="text-sm"
          clamp={compact ? "line-clamp-1" : "line-clamp-2"}
        />
      )}
      <ul className={`mt-auto flex flex-col pt-2 ${compact ? "gap-1.5" : "gap-2"}`}>
        {answers.map((answer, index) => {
          const own = mine(answer);
          return (
            <motion.li key={answer.id} variants={enter} initial="hidden" animate="visible">
              <motion.button
                type="button"
                disabled={own || pending}
                onClick={() => vote(answer)}
                className={`flex w-full cursor-pointer gap-3 rounded-2xl border-2 border-edge bg-surface text-left disabled:cursor-not-allowed ${
                  compact ? "min-h-12 items-center px-3 py-1.5" : "min-h-14 items-start p-3"
                } ${own ? "opacity-50" : ""}`}
                {...press}
              >
                {own ? (
                  <span className="mt-0.5 shrink-0 rounded-full bg-raised px-2 py-1 text-xs font-bold text-ink-dim">
                    {COPY.yours}
                  </span>
                ) : (
                  <span
                    className={`grid shrink-0 place-items-center rounded-full border border-edge bg-raised font-bold text-ink ${
                      compact ? "size-7 text-sm" : "size-8"
                    }`}
                  >
                    {letterOf(index)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block break-words leading-snug text-ink ${
                      compact ? "line-clamp-2 text-sm" : "text-base"
                    }`}
                  >
                    {answer.text}
                  </span>
                  {round.number === 1 && answer.openerPromptText && (
                    <span className="mt-0.5 block truncate text-xs text-punch">
                      ↳ {answer.openerPromptText}
                    </span>
                  )}
                </span>
              </motion.button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** A line that appears on its beat. */
function Beat({
  show,
  children,
  variants = fade,
}: {
  show: boolean;
  children: ReactNode;
  variants?: typeof fade;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div key="beat" variants={variants} initial="hidden" animate="visible" exit="exit">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** SENT: eyes up, then your own payoff on the TV's beat. */
function Sent({ mode, round }: { mode: MatchslopMode; round: Round }) {
  const { view } = useRoom();
  const fresh = useFreshAtMount();
  const me = view.me?.playerId;
  const name = personaName(mode.persona);
  const lone = round.answers.length === 1;
  const mine = round.answers.find((answer) => answer.playerId === me);
  const author = mine !== undefined && mine.id === round.winnerResponseId;
  const pickedIt =
    !author && round.myVoteResponseId !== null && round.myVoteResponseId === round.winnerResponseId;
  const cues: NamedCue<string>[] = lone
    ? [
        {
          name: "payoff",
          at: LONE.author,
          ...(author ? { haptic: [30, 40, 90], confetti: "personal" as const } : {}),
        },
        { name: "typing", at: LONE.typing },
      ]
    : [
        { name: "unmask", at: SEND.unmask },
        {
          name: "payoff",
          at: SEND.stamp + 170,
          ...(author
            ? { haptic: [30, 40, 90], confetti: "personal" as const }
            : pickedIt
              ? { haptic: 20 }
              : {}),
        },
        { name: "typing", at: SEND.typing },
      ];
  const reached = useBeats(cues);
  const points = mine?.pointsEarned ?? 0;

  return (
    <Status>
      {author && reached("payoff") ? (
        <motion.div
          className="flex flex-col items-center gap-2"
          variants={pop}
          initial="hidden"
          animate="visible"
        >
          <p className="font-display text-3xl font-bold text-punch">{COPY.gotSent}</p>
          {!lone && points > 0 && (
            <p className="font-mono text-6xl font-bold text-ink">
              <CountUp
                value={points}
                from={fresh ? 0 : points}
                format={(n) => `+${Math.round(n)}`}
              />
            </p>
          )}
        </motion.div>
      ) : mine && !lone && reached("unmask") ? (
        <motion.div variants={enter} initial="hidden" animate="visible">
          {points > 0 ? (
            <p className="font-mono text-2xl font-bold text-ink">
              {COPY.yourText}{" "}
              <CountUp
                value={points}
                from={fresh ? 0 : points}
                format={(n) => `+${Math.round(n)}`}
              />
            </p>
          ) : (
            <p className="text-xl text-ink-dim">{COPY.noVotes}</p>
          )}
        </motion.div>
      ) : (
        <EyesOnTv className="text-xl" />
      )}
      <Beat show={pickedIt && reached("payoff")} variants={pop}>
        <p className="text-xl font-bold text-win">{COPY.youPicked}</p>
      </Beat>
      <Beat show={reached("typing")}>
        <p className="mt-4 flex items-center gap-2 text-base text-ink-dim">
          {COPY.isTyping(name)}
          <TypingDots dot="0.4rem" />
        </p>
      </Beat>
    </Status>
  );
}

/** REPLY: her reaction and what it did, then the verdict on a hero turn. */
function Reply({ mode }: { mode: MatchslopMode }) {
  const { view } = useRoom();
  const fresh = useFreshAtMount();
  const me = view.me?.playerId;
  const latest = latestPersona(mode.messages);
  const R = replyBeats(latest?.text ?? "");
  const signal = mode.signal;
  const level = signal?.source === "model" ? signal.level : null;
  const ending = stampOf(latest, mode);
  const lastShot = ending !== null && mode.outcome === "IN_PROGRESS";
  const verdict = ending ? (mode.verdict ? phoneEnding(mode.verdict) : ending) : null;
  const author = signal?.authorId != null && signal.authorId === me;
  const tone = level ? LEVEL_TONE[level] : "ink";
  const won = verdict?.tone === "win";
  const reached = useBeats([
    {
      name: "react",
      at: R.impact,
      haptic: !level
        ? undefined
        : tone === "win"
          ? 30
          : level === "cringe" || level === "dealbreaker"
            ? [50, 30, 50]
            : undefined,
    },
    { name: "delta", at: R.delta },
    { name: "swing", at: R.swing },
    ...(verdict
      ? [
          {
            name: "hero",
            at: R.heroImpact,
            haptic: won ? [40, 60, 40, 60, 120] : [80, 40, 80],
            ...(won ? { confetti: "personal" as const } : {}),
          },
        ]
      : []),
    ...(lastShot ? [{ name: "teaser", at: R.teaser }] : []),
  ]);
  const reaction = reactionOf(level);

  return (
    <>
      <Status>
        <AnimatePresence mode="wait" initial={false}>
          {verdict && reached("hero") ? (
            <motion.div
              key="hero"
              className="flex flex-col items-center gap-3"
              variants={pop}
              initial="hidden"
              animate="visible"
            >
              <p className={`font-display text-4xl font-bold ${TONE_TEXT[verdict.tone]}`}>
                {verdict.text}
              </p>
              <Beat show={lastShot && reached("teaser")}>
                <p className="text-lg font-bold text-punch">{COPY.oneLastShotNext}</p>
              </Beat>
            </motion.div>
          ) : reached("react") ? (
            <motion.div
              key="react"
              className="flex flex-col items-center gap-2"
              variants={pop}
              initial="hidden"
              animate="visible"
            >
              {level ? (
                <p className={`font-display text-4xl font-bold ${TONE_TEXT[tone]}`}>
                  {reaction.text}
                </p>
              ) : (
                <p className="text-2xl text-ink-dim">{reaction.text}</p>
              )}
              <Beat show={!!level && !!signal && reached("delta")}>
                <p className={`font-mono text-2xl font-bold ${TONE_TEXT[tone]}`}>
                  {signal ? heartDelta(signal.delta) : null}
                </p>
              </Beat>
              <Beat show={author && !!level && !!signal && signal.points !== 0 && reached("swing")}>
                <p
                  className={`font-mono text-2xl font-bold ${signal && signal.points < 0 ? "text-fail" : "text-ink"}`}
                >
                  {COPY.yourText}{" "}
                  <CountUp
                    value={signal?.points ?? 0}
                    from={fresh ? 0 : (signal?.points ?? 0)}
                    format={(n) => signedPoints(Math.round(n))}
                  />
                </p>
              </Beat>
            </motion.div>
          ) : (
            <motion.div key="wait" variants={fade} initial="hidden" animate="visible" exit="exit">
              <TypingDots dot="0.5rem" />
            </motion.div>
          )}
        </AnimatePresence>
      </Status>
      <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-ink-dim">
        {COPY.eyesOnTv}
      </p>
    </>
  );
}

/** FINISHED: the outcome, then your rank on the crown beat, then her verdict on you. */
function Final({ mode }: { mode: MatchslopMode }) {
  const { view, live } = useRoom();
  const fresh = useFreshAtMount();
  const me = view.players.find((player) => player.id === view.me?.playerId);
  const ranked = rankPlayers(view.players);
  const mine = ranked.find((entry) => entry.player.id === me?.id);
  const F = finalBeats(ranked.length);
  const top = mine?.rank === 1;
  const reached = useBeats([
    {
      name: "crown",
      at: F.crown,
      haptic: top ? [40, 60, 120] : 20,
      ...(top ? { confetti: "personal" as const } : {}),
    },
    { name: "verdict", at: F.verdicts },
  ]);
  const ending = phoneEnding(mode.verdict ?? "UNMATCHED");
  const name = personaName(mode.persona);
  const pending = mode.postMortem?.pending ?? false;
  const [pendingAtMount] = useState(pending);
  const verdict = me ? verdictFor(mode, me.name) : null;
  const typeVerdict = live && (fresh || pendingAtMount);

  return (
    <div className="flex flex-1 flex-col items-center gap-4 pb-6 pt-6 text-center">
      <p className={`font-display text-2xl font-bold ${TONE_TEXT[ending.tone]}`}>{ending.text}</p>
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <AnimatePresence mode="wait" initial={false}>
          {mine && reached("crown") ? (
            <motion.div
              key="rank"
              className="flex flex-col items-center"
              variants={pop}
              initial="hidden"
              animate="visible"
            >
              <p
                className={`font-display text-7xl font-bold leading-none ${top ? "text-gold-ink" : "text-ink"}`}
              >
                {ordinal(mine.rank)}
              </p>
              <p className="mt-2 font-mono text-xl text-ink-dim">
                {COPY.points(mine.player.score)}
              </p>
            </motion.div>
          ) : (
            <motion.div key="eyes" variants={fade} initial="hidden" animate="visible" exit="exit">
              <EyesOnTv />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Beat show={reached("verdict") && (pending || verdict !== null)}>
        <div className="w-full text-left">
          <p className="mb-2 text-sm font-bold text-ink-dim">{COPY.onYou(name)}</p>
          {pending ? (
            <div className="inline-flex rounded-2xl rounded-bl-md border border-edge bg-surface px-4 py-3">
              <TypingDots dot="0.4rem" />
            </div>
          ) : (
            <HerLine
              mode={mode}
              text={typeVerdict && verdict ? <TypeOn text={verdict} cps={PARTING_CPS} /> : verdict}
            />
          )}
        </div>
      </Beat>
    </div>
  );
}

/** One player's phone: write, vote, then the personal payoff on the TV's beats. */
export function MatchslopController() {
  const { view } = useRoom();
  const mode = useModeView("MATCHSLOP");
  const displayMood = useDisplayMood();
  const { room } = view;
  const round = mode.round;

  // The bubbles behind the phone follow her mood too; the shell resets it when the room closes.
  useEffect(() => {
    setAmbient({ mood: displayMood });
  }, [displayMood]);

  let screen: ReactNode;
  if (room.status === "FINISHED") screen = <Final mode={mode} />;
  else if (room.phase === "WRITING" && round) screen = <Writing mode={mode} round={round} />;
  else if (room.phase === "VOTING" && round) screen = <Voting mode={mode} round={round} />;
  else if (room.phase === "SENT" && round) screen = <Sent mode={mode} round={round} />;
  else if (room.phase === "REPLY") screen = <Reply mode={mode} />;
  else
    screen = (
      <Status>
        <p className="flex items-center gap-3 font-display text-2xl font-bold text-ink">
          {COPY.findingMatch}
          <TypingDots dot="0.45rem" />
        </p>
      </Status>
    );

  return <div className="flex min-h-full flex-1 flex-col px-4 pt-3">{screen}</div>;
}
