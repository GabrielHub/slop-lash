"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { AiUsageBreakdown } from "@/components/ai-usage-breakdown";
import { Timer, usePhaseCountdown } from "@/components/timer";
import { fadeInUp, slideInRight, staggerContainer } from "@/lib/animations";
import { useModeView, useRoom, type RoomView } from "@/room/context";
import { PlayerProgress } from "@/room/parts";
import { ProfileCard } from "./profile-card";
import { FinalStandings, PostMortem, RoundReveal, Scoreboard } from "./results";
import {
  BrokenHeartIcon,
  Chat,
  ENDINGS,
  HeartIcon,
  OutcomeVerdict,
  PenIcon,
  SignalChips,
  SparkleIcon,
  TypingDots,
  VoteIcon,
  card,
  personaName,
  raised,
  type Answer,
  type MatchslopMode,
} from "./primitives";

type Headline = { icon: ReactNode; title: string; subtitle: string; color: string };

function headline(view: RoomView, mode: MatchslopMode): Headline {
  const { room } = view;
  const name = personaName(mode.persona);
  const { comeback } = mode;
  const outcome = mode.outcome === "IN_PROGRESS" ? null : mode.outcome;

  if (room.status === "FINISHED" || (room.phase === "REPLY" && outcome)) {
    const ending = outcome ?? "TURN_LIMIT";
    const copy = {
      DATE_SEALED: ["It's a match!", "You collectively charmed the persona. Date sealed."],
      COMEBACK: [
        "You saved it",
        "Not a full date, but the room talked its way back from disaster.",
      ],
      UNMATCHED: ["Better luck next time", `${name} wasn't feeling it. Try a different approach?`],
      TURN_LIMIT: ["Time ran out", "The conversation hit the round limit without a clear outcome."],
    }[ending];
    const { Icon, color } = ENDINGS[ending];
    return { icon: <Icon size={24} />, title: copy[0], subtitle: copy[1], color };
  }

  switch (room.phase) {
    case "PROFILE":
      return {
        icon: <HeartIcon size={26} className="animate-ms-heartbeat" />,
        title: "Finding your match",
        subtitle: "The profile is being written. The chat opens as soon as it's ready.",
        color: "var(--ms-rose)",
      };
    case "WRITING":
      return {
        icon: <PenIcon size={24} />,
        title: comeback
          ? "Comeback round"
          : room.round === 1
            ? "Craft your opener"
            : "Craft your best line",
        subtitle: comeback
          ? "You got unmatched, but one killer follow-up can still save the conversation."
          : room.round === 1
            ? `Everyone picks something on ${name}'s profile and writes an opener.`
            : "Everyone's writing the next message on their phones.",
        color: "var(--ms-coral)",
      };
    case "VOTING":
      return {
        icon: <VoteIcon size={24} />,
        title: comeback ? "Vote for the save" : "Pick the winner",
        subtitle: comeback
          ? "This vote decides whether the room pulls off the comeback."
          : "Votes turn straight into points, and even close seconds can score. Human votes count double.",
        color: "var(--ms-violet)",
      };
    case "SENT":
      return {
        icon: <SparkleIcon size={22} />,
        title: comeback ? "Did they save it?" : "Message sent",
        subtitle: comeback
          ? "The best rescue line has landed. Now we find out whether it worked."
          : "The winning line has been sent. Let's see the response...",
        color: "var(--ms-coral)",
      };
    default:
      // The persona unmatched, but the room has its comeback still to come.
      return mode.messages.at(-1)?.outcome === "UNMATCHED"
        ? {
            icon: <BrokenHeartIcon size={22} />,
            title: "Unmatched!",
            subtitle: "But the room gets one last message to win them back.",
            color: "var(--ms-red)",
          }
        : {
            icon: <SparkleIcon size={22} />,
            title: "The verdict is in",
            subtitle: `${name} wrote back.`,
            color: "var(--ms-coral)",
          };
  }
}

function PhaseHeader({ view, mode }: { view: RoomView; mode: MatchslopMode }) {
  const { icon, title, subtitle, color } = headline(view, mode);
  const compact = ["SENT", "REPLY"].includes(view.room.phase) || view.room.status === "FINISHED";
  const badge = (size: string) => (
    <div
      className={`shrink-0 flex items-center justify-center ${size}`}
      style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}
    >
      {icon}
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {badge("w-8 h-8 rounded-lg [&_svg]:w-4 [&_svg]:h-4")}
        <h2
          className="font-display font-bold"
          style={{ fontSize: "clamp(1rem, 1.2vw, 1.2rem)", color: "var(--ms-ink)" }}
        >
          {title}
        </h2>
        <span style={{ fontSize: "clamp(0.75rem, 0.85vw, 0.9rem)", color: "var(--ms-ink-dim)" }}>
          — {subtitle}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 mb-4">
      {badge("w-[clamp(2.5rem,3.5vw,4rem)] h-[clamp(2.5rem,3.5vw,4rem)] rounded-2xl")}
      <div className="min-w-0">
        <h2
          className="font-display font-bold"
          style={{ fontSize: "clamp(1.2rem, 1.8vw, 2rem)", color: "var(--ms-ink)" }}
        >
          {title}
        </h2>
        <p
          className="mt-0.5"
          style={{ fontSize: "clamp(0.8rem, 1vw, 1rem)", color: "var(--ms-ink-dim)" }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function TurnsLeft({ view, mode }: { view: RoomView; mode: MatchslopMode }) {
  const { room } = view;
  const turnsLeft = room.totalRounds - room.round;
  if (
    !["WRITING", "VOTING", "SENT"].includes(room.phase) ||
    mode.comeback ||
    mode.outcome !== "IN_PROGRESS" ||
    turnsLeft < 0 ||
    turnsLeft > 2
  ) {
    return null;
  }
  const last = turnsLeft === 0;
  const color = last ? "var(--ms-red)" : "var(--ms-coral)";
  return (
    <motion.div
      className="flex items-center gap-2 rounded-xl mb-4"
      style={{
        padding: "clamp(0.5rem, 1vw, 0.75rem) clamp(0.75rem, 1.2vw, 1rem)",
        background: last ? "var(--ms-red-soft)" : "var(--ms-coral-soft)",
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
        color,
      }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {last ? (
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <BrokenHeartIcon size={16} />
        </motion.div>
      ) : (
        <SparkleIcon size={14} />
      )}
      <span
        className="font-display font-bold"
        style={{ fontSize: "clamp(0.75rem, 0.9vw, 0.9rem)" }}
      >
        {last
          ? "Last turn to seal the deal!"
          : `${turnsLeft} turn${turnsLeft === 1 ? "" : "s"} left to seal the deal`}
      </span>
    </motion.div>
  );
}

/** The reply's countdown, with no gap left behind in untimed rooms. */
function StageTimer() {
  const { untimed } = usePhaseCountdown();
  if (untimed) return null;
  return (
    <div className="mb-4">
      <Timer />
    </div>
  );
}

/** Who has written or voted so far, beside the phase clock. */
function RoomProgress({ label, doneIds }: { label: string; doneIds: readonly string[] }) {
  return (
    <div className="mb-4">
      <PlayerProgress label={label} doneIds={doneIds} aside={<Timer />} />
    </div>
  );
}

function WaitingBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={raised}>
      {children}
    </div>
  );
}

/** The messages up for the vote, with no names attached. */
function Ballot({ answers }: { answers: Answer[] }) {
  return (
    <motion.div
      className="grid gap-2 @xl:grid-cols-2"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {answers.map((answer) => (
        <motion.div
          key={answer.id}
          className="rounded-2xl"
          style={{ ...raised, padding: "clamp(0.75rem, 1.2vw, 1rem) clamp(1rem, 1.5vw, 1.25rem)" }}
          variants={fadeInUp}
        >
          {answer.openerPromptText && (
            <p
              className="font-display font-bold uppercase tracking-wider truncate mb-1"
              style={{ fontSize: "clamp(0.6rem, 0.7vw, 0.7rem)", color: "var(--ms-violet)" }}
            >
              {answer.openerPromptText}
            </p>
          )}
          <p
            className="leading-relaxed break-words"
            style={{ fontSize: "clamp(0.9rem, 1.1vw, 1.15rem)", color: "var(--ms-ink)" }}
          >
            {answer.text}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}

function PhaseBody({ view, mode }: { view: RoomView; mode: MatchslopMode }) {
  const { room } = view;
  const round = mode.round;
  if (room.status === "FINISHED") return <FinalStandings />;
  switch (room.phase) {
    case "PROFILE":
      return (
        <WaitingBox>
          <TypingDots />
          <p style={{ fontSize: "clamp(0.85rem, 1vw, 1rem)", color: "var(--ms-ink-dim)" }}>
            Writing a profile worth swiping on...
          </p>
        </WaitingBox>
      );
    case "WRITING":
      return (
        <>
          <RoomProgress label="Messages in" doneIds={round?.answeredPlayerIds ?? []} />
          <WaitingBox>
            <TypingDots />
            <p style={{ fontSize: "clamp(0.85rem, 1vw, 1rem)", color: "var(--ms-ink-dim)" }}>
              {mode.comeback
                ? "Players are firing off one last save..."
                : "Players are typing their best lines..."}
            </p>
          </WaitingBox>
        </>
      );
    case "VOTING":
      return (
        <>
          <RoomProgress label="Votes in" doneIds={round?.votedPlayerIds ?? []} />
          <Ballot answers={round?.answers ?? []} />
        </>
      );
    case "SENT":
      return <RoundReveal mode={mode} />;
    default:
      return (
        <>
          <StageTimer />
          {mode.signal && <SignalChips signal={mode.signal} className="mb-3" />}
          <Scoreboard />
        </>
      );
  }
}

function Conversation({ view, mode }: { view: RoomView; mode: MatchslopMode }) {
  const count = mode.messages.length;
  const typing = view.room.phase === "SENT" ? personaName(mode.persona) : null;
  return (
    <>
      <div
        className="flex items-center justify-between"
        style={{
          padding: "clamp(0.75rem, 1.5vw, 1.25rem) clamp(1rem, 2vw, 1.5rem)",
          borderTop: "1px solid var(--ms-edge)",
        }}
      >
        <div className="flex items-center gap-2" style={{ color: "var(--ms-rose)" }}>
          <HeartIcon size={16} />
          <h3
            className="font-display font-bold"
            style={{ fontSize: "clamp(0.9rem, 1.2vw, 1.2rem)", color: "var(--ms-ink)" }}
          >
            The conversation
          </h3>
        </div>
        {count > 0 && (
          <span
            className="font-mono"
            style={{ fontSize: "clamp(0.65rem, 0.75vw, 0.75rem)", color: "var(--ms-ink-dim)" }}
          >
            {count} message{count === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <Chat
        messages={mode.messages}
        typing={typing}
        className="px-[clamp(0.75rem,1.5vw,1.25rem)] pb-[clamp(0.75rem,1.5vw,1.25rem)] max-h-[clamp(20rem,50vh,50rem)]"
        empty={
          <div
            className="text-center py-[clamp(2rem,4vw,4rem)]"
            style={{ color: "var(--ms-ink-dim)" }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <HeartIcon size={32} className="mx-auto mb-3" />
            </motion.div>
            <p
              className="font-display font-semibold"
              style={{ fontSize: "clamp(0.9rem, 1.1vw, 1.1rem)" }}
            >
              Waiting for the first move...
            </p>
            <p className="mt-1 opacity-70" style={{ fontSize: "clamp(0.75rem, 0.9vw, 0.85rem)" }}>
              Players will write openers to impress {personaName(mode.persona)}.
            </p>
          </div>
        }
      />
      <OutcomeVerdict outcome={mode.outcome} />
    </>
  );
}

function AmbientGlow() {
  return (
    <div
      className="absolute inset-0 pointer-events-none opacity-60"
      style={{
        background: `
          radial-gradient(ellipse 60% 50% at 20% 50%, var(--ms-rose-soft) 0%, transparent 70%),
          radial-gradient(ellipse 50% 40% at 80% 30%, var(--ms-violet-soft) 0%, transparent 70%)
        `,
      }}
    />
  );
}

/**
 * The dating app on the big screen: the persona's profile beside the chat,
 * with the current phase on top of the conversation.
 */
export function MatchslopStage() {
  const { view } = useRoom();
  const mode = useModeView("MATCHSLOP");
  const finished = view.room.status === "FINISHED";

  return (
    <main
      className="@container flex-1 relative overflow-hidden"
      style={{ padding: "clamp(0.75rem, 2vw, 2rem)" }}
    >
      <AmbientGlow />
      <div className="relative mx-auto max-w-[120rem] grid gap-[clamp(0.75rem,2vw,2rem)] items-start @3xl:grid-cols-[clamp(18rem,40%,36rem)_minmax(0,1fr)]">
        <div className="order-2 @3xl:order-none @3xl:sticky @3xl:top-4 self-start">
          <ProfileCard
            persona={mode.persona}
            outcome={mode.outcome}
            mood={mode.mood}
            moodDelta={view.room.phase === "REPLY" ? (mode.signal?.moodDelta ?? null) : null}
          />
        </div>

        <div className="min-w-0 space-y-[clamp(0.75rem,1.5vw,1.5rem)]">
          <motion.section
            className="rounded-[1.5rem] overflow-hidden"
            style={card}
            variants={slideInRight}
            initial="hidden"
            animate="visible"
          >
            <div className="p-[clamp(1rem,2vw,2rem)]">
              <PhaseHeader view={view} mode={mode} />
              <TurnsLeft view={view} mode={mode} />
              <PhaseBody view={view} mode={mode} />
            </div>
            <Conversation view={view} mode={mode} />
          </motion.section>

          {finished && <PostMortem mode={mode} />}

          {finished && view.usage && (
            <motion.div variants={fadeInUp} initial="hidden" animate="visible">
              <h2 className="text-base font-medium mb-3" style={{ color: "var(--ms-ink-dim)" }}>
                AI usage
              </h2>
              <AiUsageBreakdown usage={view.usage} />
            </motion.div>
          )}
        </div>
      </div>
    </main>
  );
}

/** The persona as it is being written, beside the lobby's player list. */
export function MatchslopStageLobby() {
  const mode = useModeView("MATCHSLOP");
  return (
    <div className="max-w-md mx-auto lg:mx-0">
      <ProfileCard persona={mode.persona} outcome="IN_PROGRESS" mood={null} compact />
    </div>
  );
}
