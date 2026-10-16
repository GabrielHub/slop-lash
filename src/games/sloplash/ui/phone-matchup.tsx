"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { CheckIcon } from "@/components/icons";
import { ACCENT, SPRING, collapse, pop, press } from "@/lib/animations";
import { useModeView, useRoom, useRoomAction } from "@/room/context";
import { ReactionStrip } from "@/room/reaction-strip";
import { useSloplashReactions } from "./reactions";
import { CountUp, Stamp, buzz, useMoment, useReducedAfterMount } from "@/room/moment";
import { REACTION_STRIP } from "../game-constants";
import { matchupOutcome } from "../outcomes";
import { pointsPerVote } from "../scoring";
import { phoneRevealCues, phoneWalkoverCues, type RevealRole } from "./cues";
import { currentPrompt, plus, typeOfPlayer, type SlAnswer, type SlPrompt } from "./data";
import { EyesOnTv, PhoneScreen, WaitingScreen } from "./phone-parts";

// --- VOTING ---

/** VOTING on a phone: vote in one tap, then react while the room finishes. */
export function PhoneVoting() {
  const { view } = useRoom();
  const mode = useModeView("SLOPLASH");
  const prompt = currentPrompt(mode);
  const me = view.me?.playerId;
  if (!prompt || !me || prompt.kind !== "vote" || prompt.answers.length < 2) {
    return <WaitingScreen />;
  }
  if (prompt.assigneeIds.includes(me)) {
    const mine = prompt.answers.find((answer) => answer.playerId === me);
    return (
      <PhoneScreen className="gap-4">
        <div className="flex flex-col gap-3 pt-4">
          <p className="font-display text-3xl font-black text-teal">You&apos;re up!</p>
          {mine && (
            <p className="rounded-2xl border-2 border-teal/40 bg-surface p-4 text-xl leading-snug text-ink">
              {mine.text}
            </p>
          )}
        </div>
        <EyesOnTv />
      </PhoneScreen>
    );
  }
  return <Ballot prompt={prompt} me={me} />;
}

function Ballot({ prompt, me }: { prompt: SlPrompt; me: string }) {
  const { act, error } = useRoomAction();
  const reduced = useReducedAfterMount();
  const [picked, setPicked] = useState<string | null>(null);
  const vote = prompt.votes.find((row) => row.voterId === me);
  const myPick = vote?.responseId ?? picked;
  const layoutId = reduced ? undefined : `pick:${prompt.id}`;

  async function choose(answer: SlAnswer) {
    if (picked || vote) return;
    setPicked(answer.id);
    buzz(10);
    const ok = await act(api.sloplash.play.castVote, {
      promptId: prompt.id,
      responseId: answer.id,
    });
    if (!ok) setPicked(null);
  }

  if (vote && myPick) {
    const answer = prompt.answers.find((candidate) => candidate.id === myPick);
    return (
      <PhoneScreen className="gap-4">
        <div className="flex flex-col gap-3 pt-4">
          <p className="flex items-center gap-2 font-display text-3xl font-bold text-ink">
            <CheckIcon size={40} className="text-teal" />
            Voted
          </p>
          {answer && (
            <motion.p
              layoutId={layoutId}
              className="rounded-2xl border-2 border-teal bg-surface p-4 text-xl leading-snug text-ink"
              transition={{ layout: SPRING.snappy }}
            >
              {answer.text}
            </motion.p>
          )}
        </div>
        <MatchupReactions prompt={prompt} responseId={myPick} />
      </PhoneScreen>
    );
  }

  return (
    <PhoneScreen className="gap-4">
      <div className="flex flex-col gap-2 pt-4">
        <p className="font-display text-3xl font-bold text-ink">Which is funnier?</p>
        <p className="line-clamp-3 text-lg leading-snug text-ink-dim">{prompt.text}</p>
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <ErrorBanner error={error} className="" />
        <AnimatePresence initial={false}>
          {prompt.answers.slice(0, 2).map((answer) =>
            picked && picked !== answer.id ? null : (
              <motion.div
                key={answer.id}
                variants={collapse}
                exit="exit"
                className="overflow-visible"
              >
                <motion.button
                  type="button"
                  layoutId={picked === answer.id ? layoutId : undefined}
                  disabled={picked !== null}
                  onClick={() => void choose(answer)}
                  className={`relative flex min-h-[6.5rem] w-full cursor-pointer items-center rounded-2xl border-2 bg-surface p-5 text-left text-2xl leading-snug text-ink disabled:cursor-default ${
                    picked === answer.id ? "border-teal" : "border-edge"
                  }`}
                  {...press}
                  transition={{ ...press.transition, layout: SPRING.snappy }}
                >
                  <span className="min-w-0 flex-1">{answer.text}</span>
                  {picked === answer.id && (
                    <motion.span
                      className="ml-3 shrink-0 text-teal"
                      variants={pop}
                      initial="hidden"
                      animate="visible"
                    >
                      <CheckIcon size={32} />
                    </motion.span>
                  )}
                </motion.button>
              </motion.div>
            ),
          )}
        </AnimatePresence>
      </div>
    </PhoneScreen>
  );
}

/** Five reactions on my pick; each sends once and stays lit. */
function MatchupReactions({ prompt, responseId }: { prompt: SlPrompt; responseId: string }) {
  const { run } = useRoom();
  const reactions = useSloplashReactions(prompt) ?? [];
  return (
    <ReactionStrip
      keys={REACTION_STRIP}
      sent={reactions.filter((reaction) => reaction.mine).map((reaction) => reaction.emoji)}
      send={(emoji) =>
        run(api.sloplash.play.react, { responseId: responseId as SlAnswer["id"], emoji })
      }
    />
  );
}

// --- REVEAL ---

/** REVEAL on a phone: this viewer's verdict lands on the TV's beat. */
export function PhoneReveal() {
  const { view } = useRoom();
  const mode = useModeView("SLOPLASH");
  const prompt = currentPrompt(mode);
  const me = view.me?.playerId;
  if (!prompt || !me) {
    return <WaitingScreen />;
  }
  if (prompt.kind === "walkover") return <WalkoverPayoff prompt={prompt} me={me} />;
  return <RevealPayoff prompt={prompt} me={me} />;
}

function roleOf(
  prompt: SlPrompt,
  me: string,
  outcome: ReturnType<typeof matchupOutcome>,
): RevealRole {
  const { score, stamp, winnerAnswerId } = outcome;
  const mine = prompt.answers.find((answer) => answer.playerId === me);
  if (mine) {
    if (score.outcome === "tie") return { kind: "author", result: "tie" };
    if (score.outcome === "noVotes") return { kind: "author", result: "noVotes" };
    if (winnerAnswerId === mine.id) {
      return { kind: "author", result: score.unanimous ? "flawless" : "won" };
    }
    return { kind: "author", result: stamp === "slopped" ? "slopped" : "lost" };
  }
  const vote = prompt.votes.find((row) => row.voterId === me);
  if (!vote) return { kind: "none" };
  const cast = vote.responseId !== null && prompt.answers.some((a) => a.id === vote.responseId);
  if (!cast || score.outcome === "noVotes") return { kind: "voter", result: "none" };
  if (score.outcome === "tie") return { kind: "voter", result: "tie" };
  return { kind: "voter", result: vote.responseId === winnerAnswerId ? "won" : "lost" };
}

function RevealPayoff({ prompt, me }: { prompt: SlPrompt; me: string }) {
  const { view } = useRoom();
  const { room, players } = view;
  const outcome = matchupOutcome(prompt, room.round, typeOfPlayer(players));
  const role = roleOf(prompt, me, outcome);
  const { cast } = outcome.score;
  const roleKey = role.kind === "none" ? "none" : `${role.kind}:${role.result}`;
  const cues = useMemo(
    () => phoneRevealCues(cast, outcome.stamp, role),
    // The role is fully described by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cast, outcome.stamp, roleKey],
  );
  const moment = useMoment(cues.cues, { when: room.phase === "REVEAL" });
  const at = (name: keyof typeof cues.beat) => moment >= cues.beat[name];

  if (role.kind === "none") {
    return <WaitingScreen />;
  }

  if (role.kind === "voter") {
    if (!at("verdict")) {
      return <WaitingScreen />;
    }
    const line = {
      won: <Line className="font-display text-4xl font-black text-teal">Called it!</Line>,
      lost: <Line className="font-display text-4xl font-bold text-ink-dim">Room disagreed</Line>,
      tie: <Line className="font-display text-4xl font-black text-gold-ink">Split room</Line>,
      none: <Line className="text-2xl text-ink-dim">Missed this one</Line>,
    }[role.result];
    return <PhoneScreen className="items-center pb-16 text-center">{line}</PhoneScreen>;
  }

  if (!at("unmask")) {
    return <WaitingScreen />;
  }
  const mine = prompt.answers.find((answer) => answer.playerId === me)!;
  const unit = pointsPerVote(room.round);
  const base = (outcome.score.votes[mine.id] ?? 0) * unit;
  const total = outcome.score.points[mine.id] ?? 0;
  const result = role.result;

  return (
    <PhoneScreen className="relative isolate items-center gap-3 pb-16 text-center">
      {(result === "won" || result === "flawless" || result === "slopped") && (
        <motion.div
          aria-hidden="true"
          className={`absolute inset-0 -z-10 ${result === "slopped" ? "bg-punch/15" : "bg-teal-soft"}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      {(result === "flawless" || result === "slopped") && (
        <Stamp
          tone={result === "slopped" ? "punch" : "teal"}
          size="lg"
          tilt={ACCENT.sloplash.stampTilt}
          show={at("stamp")}
          className="mb-4"
        >
          {result === "slopped" ? "SLOPPED" : "FLAWLESS"}
        </Stamp>
      )}
      {result === "won" || result === "flawless" ? (
        <>
          <Line className="font-display text-5xl font-black text-teal">You won!</Line>
          <CountUp
            value={result === "flawless" && at("impact") ? total : base}
            duration={0.6}
            format={plus}
            className="font-mono text-6xl font-black text-ink"
          />
        </>
      ) : result === "slopped" ? (
        <>
          <Line className="font-display text-4xl font-bold text-ink">Not this time</Line>
          <p className="font-mono text-3xl text-ink-dim">+0</p>
        </>
      ) : result === "lost" ? (
        <>
          <Line className="font-display text-4xl font-bold text-ink">Not this time</Line>
          <CountUp
            value={total}
            duration={0.6}
            format={plus}
            className="font-mono text-5xl text-ink"
          />
        </>
      ) : result === "tie" ? (
        <>
          <Line className="font-display text-5xl font-black text-gold-ink">Tie!</Line>
          <CountUp
            value={total}
            duration={0.6}
            format={plus}
            className="font-mono text-5xl text-ink"
          />
        </>
      ) : (
        <>
          <Line className="font-display text-4xl text-ink-dim">No votes</Line>
          <p className="font-mono text-3xl text-ink-dim">+0</p>
        </>
      )}
    </PhoneScreen>
  );
}

function WalkoverPayoff({ prompt, me }: { prompt: SlPrompt; me: string }) {
  const { room } = useRoom().view;
  const mine = prompt.answers.find((answer) => answer.playerId === me);
  const winner = !!mine && !mine.forfeited;
  const cues = useMemo(() => phoneWalkoverCues(winner), [winner]);
  const moment = useMoment(cues.cues, { when: room.phase === "REVEAL" });
  const at = (name: keyof typeof cues.beat) => moment >= cues.beat[name];

  if (!mine || !at("band")) {
    return <WaitingScreen />;
  }
  return (
    <PhoneScreen className="items-center gap-3 pb-16 text-center">
      {winner ? (
        <>
          <Line className="font-display text-4xl font-bold text-teal">Won by default</Line>
          {at("count") && (
            <CountUp
              value={pointsPerVote(room.round)}
              duration={0.6}
              format={plus}
              className="font-mono text-6xl font-black text-ink"
            />
          )}
        </>
      ) : (
        <>
          <Line className="font-display text-4xl text-ink-dim">No answer</Line>
          <p className="font-mono text-3xl text-ink-dim">+0</p>
        </>
      )}
    </PhoneScreen>
  );
}

function Line({ className, children }: { className: string; children: ReactNode }) {
  return (
    <motion.p className={className} variants={pop} initial="hidden" animate="visible">
      {children}
    </motion.p>
  );
}
