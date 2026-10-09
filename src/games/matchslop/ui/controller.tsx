"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { CompletionCard } from "@/components/completion-card";
import { ErrorBanner } from "@/components/error-banner";
import { PulsingDot } from "@/components/pulsing-dot";
import { Timer } from "@/components/timer";
import { usePixelDissolve } from "@/hooks/use-pixel-dissolve";
import { MAX_ANSWER_LENGTH } from "@/games/core/constants";
import { buttonTapPrimary, collapseExpand, springDefault } from "@/lib/animations";
import { ordinal } from "@/lib/format";
import { playSound } from "@/lib/sounds";
import { useModeView, usePlayers, useRoom, useRoomAction } from "@/room/context";
import { StatusCard } from "@/room/parts";
import { MATCHSLOP_PHOTO_PROMPT_ID, MATCHSLOP_PHOTO_PROMPT_TEXT } from "../config/game-config";
import { ProfileCard } from "./profile-card";
import {
  Chat,
  HeartIcon,
  OutcomeBadge,
  PhotoIcon,
  ProgressCount,
  SignalChips,
  TypingDots,
  personaName,
  raised,
  type Answer,
  type MatchslopMode,
} from "./primitives";

type Round = NonNullable<MatchslopMode["round"]>;
type Opener = { id: string; prompt: string; answer: string };

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={raised}>
      {children}
    </div>
  );
}

function Eyebrow({ children, color }: { children: ReactNode; color: string }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.15em] font-bold mb-1" style={{ color }}>
      {children}
    </p>
  );
}

/** A tap-to-open copy of the persona's profile. */
function ProfileToggle({ mode }: { mode: MatchslopMode }) {
  const [open, setOpen] = useState(false);
  if (!mode.persona.profile) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl text-sm font-display font-semibold cursor-pointer"
        style={{ border: "1px solid var(--ms-edge)", color: "var(--ms-ink-dim)" }}
      >
        <HeartIcon size={14} className="text-[var(--ms-rose)]" />
        {open ? "Hide profile" : `View ${personaName(mode.persona)}'s profile`}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="overflow-hidden pt-3"
            variants={collapseExpand}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <ProfileCard persona={mode.persona} outcome={mode.outcome} mood={mode.mood} compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A one-line message box with a send button. Enter sends. */
function Composer({
  placeholder,
  label,
  onSend,
}: {
  placeholder: string;
  label: string;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { triggerElement } = usePixelDissolve();
  const ready = text.trim().length > 0 && !sending;

  const send = async () => {
    if (!ready) return;
    setSending(true);
    const ok = await onSend(text.trim());
    setSending(false);
    if (ok) playSound("submitted");
  };

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void send();
        }}
        placeholder={placeholder}
        maxLength={MAX_ANSWER_LENGTH}
        enterKeyHint="send"
        className="w-full py-3.5 px-4 rounded-2xl text-base focus:outline-none transition-colors"
        style={{
          background: "var(--ms-raised)",
          border: "2px solid var(--ms-edge)",
          color: "var(--ms-ink)",
        }}
      />
      <motion.button
        type="button"
        onClick={(event) => {
          triggerElement(event.currentTarget);
          void send();
        }}
        disabled={!ready}
        className="w-full py-3.5 rounded-2xl font-display font-bold text-white text-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: "var(--ms-gradient-romance)",
          boxShadow: ready ? "0 4px 20px var(--ms-rose-glow)" : "none",
        }}
        {...buttonTapPrimary}
      >
        {sending ? "Sending..." : label}
      </motion.button>
    </div>
  );
}

function OpenerPicker({
  name,
  openers,
  onPick,
}: {
  name: string;
  openers: Opener[];
  onPick: (opener: Opener) => void;
}) {
  const photo = openers.find((opener) => opener.id === MATCHSLOP_PHOTO_PROMPT_ID);
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springDefault}
    >
      <div className="text-center">
        <Eyebrow color="var(--ms-rose)">Step 1</Eyebrow>
        <p className="text-sm" style={{ color: "var(--ms-ink-dim)" }}>
          Pick a prompt from {name}&apos;s profile
        </p>
      </div>
      <div className="space-y-3">
        {openers
          .filter((opener) => opener !== photo)
          .map((opener, index) => (
            <motion.button
              key={opener.id}
              type="button"
              onClick={() => onPick(opener)}
              className="w-full rounded-2xl p-4 text-left cursor-pointer"
              style={{ background: "var(--ms-raised)", border: "2px solid var(--ms-edge)" }}
              whileHover={{ borderColor: "var(--ms-rose)" }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springDefault, delay: index * 0.08 }}
            >
              <p
                className="font-display font-bold text-[15px] leading-snug mb-1.5"
                style={{ color: "var(--ms-rose)" }}
              >
                {opener.prompt}
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ms-ink)" }}>
                {opener.answer}
              </p>
            </motion.button>
          ))}
      </div>
      {photo && (
        <>
          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 h-px" style={{ background: "var(--ms-edge)" }} />
            <span
              className="text-[10px] uppercase tracking-[0.2em] font-bold"
              style={{ color: "var(--ms-ink-dim)" }}
            >
              or
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--ms-edge)" }} />
          </div>
          <motion.button
            type="button"
            onClick={() => onPick(photo)}
            className="w-full rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2.5 cursor-pointer"
            style={{
              background: "var(--ms-violet-soft)",
              border: "2px dashed var(--ms-edge-strong)",
              color: "var(--ms-violet)",
            }}
            whileHover={{ borderColor: "var(--ms-violet)" }}
            whileTap={{ scale: 0.97 }}
          >
            <PhotoIcon />
            <span className="font-display font-bold text-[14px]">Just respond to their photo</span>
          </motion.button>
        </>
      )}
    </motion.div>
  );
}

function OpenerChosen({ opener, onBack }: { opener: Opener; onBack: () => void }) {
  const photo = opener.id === MATCHSLOP_PHOTO_PROMPT_ID;
  const color = photo ? "var(--ms-violet)" : "var(--ms-rose)";
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 mb-3 text-sm font-medium cursor-pointer"
        style={{ color: "var(--ms-ink-dim)" }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Change prompt
      </button>
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{
          background: photo ? "var(--ms-violet-soft)" : "var(--ms-rose-soft)",
          border: `1px solid ${color}`,
          color,
        }}
      >
        {photo && <PhotoIcon size={20} className="shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold mb-0.5">Responding to</p>
          <p className="font-display font-bold text-[15px] leading-snug">{opener.prompt}</p>
          {opener.answer && (
            <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--ms-ink)" }}>
              {opener.answer}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Round 1: pick something on the profile, then write the opener to it. */
function OpenerWriting({
  mode,
  send,
}: {
  mode: MatchslopMode;
  send: (text: string, openerPromptId: string | null) => Promise<boolean>;
}) {
  const [chosen, setChosen] = useState<Opener | null>(null);
  const { persona } = mode;
  const openers: Opener[] = [...(persona.profile?.prompts.slice(0, 3) ?? [])];
  // Only offer the photo when there is one to talk about.
  if (persona.portraitUrl || persona.portraitPending) {
    openers.push({
      id: MATCHSLOP_PHOTO_PROMPT_ID,
      prompt: MATCHSLOP_PHOTO_PROMPT_TEXT,
      answer: "",
    });
  }

  if (!chosen) {
    return <OpenerPicker name={personaName(persona)} openers={openers} onPick={setChosen} />;
  }
  const photo = chosen.id === MATCHSLOP_PHOTO_PROMPT_ID;
  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springDefault}
    >
      <OpenerChosen opener={chosen} onBack={() => setChosen(null)} />
      <div>
        <Eyebrow color="var(--ms-coral)">Step 2 &mdash; Write your opener</Eyebrow>
        <Composer
          placeholder={
            photo ? "Say something about their photo..." : `Reply to "${chosen.prompt}"...`
          }
          label="Send opener"
          onSend={(text) => send(text, chosen.id)}
        />
      </div>
    </motion.div>
  );
}

function ReplyWriting({
  mode,
  round,
  comeback,
  send,
}: {
  mode: MatchslopMode;
  round: Round;
  comeback: boolean;
  send: (text: string, openerPromptId: string | null) => Promise<boolean>;
}) {
  const { signal } = mode;
  return (
    <div className="space-y-4">
      <Panel>
        <Eyebrow color="var(--ms-ink-dim)">{comeback ? "One last shot" : "Reply to"}</Eyebrow>
        <p
          className="font-display font-semibold text-sm leading-snug"
          style={{ color: "var(--ms-rose)" }}
        >
          {round.promptText}
        </p>
      </Panel>
      {signal && (
        <motion.div
          className="rounded-xl flex items-start gap-2 px-3 py-2"
          style={{
            background: "color-mix(in srgb, var(--ms-coral) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--ms-coral) 20%, transparent)",
          }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24, delay: 0.15 }}
        >
          <span
            className="font-mono font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded-md text-[9px]"
            style={{ color: "var(--ms-coral)", background: "var(--ms-coral-soft)" }}
          >
            {signal.category}
          </span>
          <div
            className="min-w-0 text-xs leading-snug italic"
            style={{ color: "var(--ms-ink-dim)" }}
          >
            {signal.sideComment && (
              <p className="mb-1 opacity-85">&ldquo;{signal.sideComment}&rdquo;</p>
            )}
            <p>{signal.nextSignal}</p>
          </div>
        </motion.div>
      )}
      <Composer
        placeholder={
          comeback ? "Type the line that saves the match..." : "Type your funniest reply..."
        }
        label={comeback ? "Send comeback" : "Send"}
        onSend={(text) => send(text, null)}
      />
    </div>
  );
}

function Writing({ mode, round }: { mode: MatchslopMode; round: Round }) {
  const { act, error } = useRoomAction();
  const { comeback } = mode;
  const send = (text: string, openerPromptId: string | null) =>
    act(api.matchslop.play.submitResponse, { promptId: round.promptId, text, openerPromptId });

  if (round.myResponseId) {
    return (
      <CompletionCard
        title="Sent!"
        subtitle={
          comeback
            ? "Waiting to see if the room can save this."
            : "Waiting for everyone else to write."
        }
      />
    );
  }
  return (
    <>
      <ErrorBanner error={error} />
      {round.number === 1 ? (
        <OpenerWriting mode={mode} send={send} />
      ) : (
        <ReplyWriting mode={mode} round={round} comeback={comeback} send={send} />
      )}
    </>
  );
}

function BallotOption({
  answer,
  disabled,
  onVote,
}: {
  answer: Answer;
  disabled: boolean;
  onVote: (answer: Answer, button: HTMLElement) => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={(event) => onVote(answer, event.currentTarget)}
      disabled={disabled}
      className="w-full text-left py-3 px-4 rounded-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: "var(--ms-raised)", border: "2px solid var(--ms-edge)" }}
      whileHover={{ borderColor: "var(--ms-violet)" }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="text-[15px] leading-relaxed break-words" style={{ color: "var(--ms-ink)" }}>
        {answer.text}
      </span>
    </motion.button>
  );
}

/** Groups openers under the profile prompt they answered, in ballot order. */
function groupByOpener(answers: Answer[]): { prompt: string | null; answers: Answer[] }[] {
  const groups = new Map<string | null, Answer[]>();
  for (const answer of answers) {
    const key = answer.openerPromptText;
    groups.set(key, [...(groups.get(key) ?? []), answer]);
  }
  return [...groups].map(([prompt, grouped]) => ({ prompt, answers: grouped }));
}

function Voting({ mode, round }: { mode: MatchslopMode; round: Round }) {
  const { act, pending, error } = useRoomAction();
  const { triggerElement } = usePixelDissolve();
  const { comeback } = mode;
  const ballot = round.answers.filter((answer) => answer.id !== round.myResponseId);

  if (round.myVoteResponseId) {
    return (
      <Panel>
        <p
          className="font-display font-semibold text-lg mb-2"
          style={{ color: "var(--ms-violet)" }}
        >
          Vote cast!
        </p>
        <PulsingDot>
          {comeback ? "Waiting to see if the room saved it..." : "Waiting on other players..."}
        </PulsingDot>
      </Panel>
    );
  }
  if (ballot.length === 0) {
    return <CompletionCard title="Nothing to vote on" subtitle="Your line is the only one in." />;
  }

  const vote = (answer: Answer, button: HTMLElement) => {
    triggerElement(button);
    void act(api.matchslop.play.castVote, { promptId: round.promptId, responseId: answer.id }).then(
      (ok) => ok && playSound("vote-cast"),
    );
  };
  const opener = round.number === 1;

  return (
    <div className="space-y-3">
      <ErrorBanner error={error} />
      <Panel>
        <Eyebrow color="var(--ms-violet)">
          {comeback
            ? "Vote for the line that saves it"
            : opener
              ? "Pick the best opener"
              : "Vote for the funniest reply"}
        </Eyebrow>
        {!opener && (
          <p
            className="font-display font-semibold text-sm leading-snug mb-1"
            style={{ color: "var(--ms-rose)" }}
          >
            {round.promptText}
          </p>
        )}
        <p className="text-xs" style={{ color: "var(--ms-ink-dim)" }}>
          {comeback
            ? "Pick the follow-up that gives the room the best chance to claw this back."
            : "Votes become points, even for strong runner-ups. Human votes count double."}
        </p>
      </Panel>
      {opener ? (
        <div className="space-y-4">
          {groupByOpener(ballot).map((group, index) => (
            <motion.div
              key={group.prompt ?? "none"}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springDefault, delay: index * 0.06 }}
            >
              {group.prompt && (
                <p
                  className="flex items-center gap-2 mb-2 px-1 text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    color:
                      group.prompt === MATCHSLOP_PHOTO_PROMPT_TEXT
                        ? "var(--ms-violet)"
                        : "var(--ms-rose)",
                  }}
                >
                  {group.prompt === MATCHSLOP_PHOTO_PROMPT_TEXT ? (
                    <PhotoIcon size={12} className="shrink-0" />
                  ) : (
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-current" />
                  )}
                  <span className="truncate">{group.prompt}</span>
                </p>
              )}
              <div className="space-y-2">
                {group.answers.map((answer) => (
                  <BallotOption key={answer.id} answer={answer} disabled={pending} onVote={vote} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {ballot.map((answer) => (
            <BallotOption key={answer.id} answer={answer} disabled={pending} onVote={vote} />
          ))}
        </div>
      )}
      {round.forfeitedPlayerIds.length > 0 && (
        <p className="text-xs text-center opacity-60" style={{ color: "var(--ms-ink-dim)" }}>
          {round.forfeitedPlayerIds.length} player{round.forfeitedPlayerIds.length === 1 ? "" : "s"}{" "}
          didn&apos;t send anything
        </p>
      )}
    </div>
  );
}

/** SENT and REPLY: the action is on the big screen; the phone keeps a short chat. */
function Watching({ mode }: { mode: MatchslopMode }) {
  const { view } = useRoom();
  const { room } = view;
  const round = mode.round;
  const typing = room.phase === "SENT";
  const won = round?.myResponseId != null && round.myResponseId === round.winnerResponseId;

  return (
    <div className="space-y-4">
      <StatusCard>
        <p className="font-display font-bold text-lg text-ink mb-2">
          {won
            ? "Your line got sent!"
            : typing
              ? "Message sent"
              : `${personaName(mode.persona)} replied`}
        </p>
        <PulsingDot>Watch the big screen</PulsingDot>
        {!typing && mode.signal && (
          <div className="mt-3 flex justify-center">
            <SignalChips signal={mode.signal} className="justify-center" />
          </div>
        )}
      </StatusCard>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-edge)" }}
      >
        <Chat
          messages={mode.messages.slice(-4)}
          typing={typing ? personaName(mode.persona) : null}
          compact
          className="px-3 py-3 max-h-[50svh]"
        />
      </div>
    </div>
  );
}

function Finished({ mode }: { mode: MatchslopMode }) {
  const { view } = useRoom();
  const { players, byId } = usePlayers();
  const me = byId(view.me?.playerId);
  const place = me ? players.filter((player) => player.score > me.score).length + 1 : null;

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-edge)" }}
      >
        {me && place && (
          <>
            <p className="text-sm" style={{ color: "var(--ms-ink-dim)" }}>
              You placed
            </p>
            <p
              className="font-display font-bold text-4xl"
              style={{ color: place === 1 ? "var(--gold)" : "var(--ms-ink)" }}
            >
              {ordinal(place)}
            </p>
            <p className="font-mono text-sm mt-1" style={{ color: "var(--ms-ink-dim)" }}>
              {me.score} point{me.score === 1 ? "" : "s"}
            </p>
          </>
        )}
        <div className="mt-3 flex justify-center">
          <OutcomeBadge outcome={mode.outcome} small />
        </div>
      </div>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--ms-surface)", border: "1px solid var(--ms-edge)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--ms-edge)" }}
        >
          <span className="font-display font-bold text-sm" style={{ color: "var(--ms-ink)" }}>
            The whole chat
          </span>
          <span className="text-[10px] font-mono" style={{ color: "var(--ms-ink-dim)" }}>
            {mode.messages.length} msg{mode.messages.length === 1 ? "" : "s"}
          </span>
        </div>
        <Chat messages={mode.messages} compact className="px-3 py-3 max-h-[50svh]" />
      </div>
    </div>
  );
}

function Waiting({ mode }: { mode: MatchslopMode }) {
  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <div className="flex justify-center mb-3">
          <TypingDots />
        </div>
        <p className="font-display font-bold text-lg" style={{ color: "var(--ms-ink)" }}>
          Finding your match...
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--ms-ink-dim)" }}>
          Writing opens as soon as the profile is ready.
        </p>
      </div>
      {mode.persona.profile && (
        <ProfileCard persona={mode.persona} outcome={mode.outcome} mood={null} compact />
      )}
    </div>
  );
}

const TITLES: Record<string, [normal: string, comeback: string]> = {
  PROFILE: ["Get ready", "Get ready"],
  WRITING: ["Write", "Comeback round"],
  VOTING: ["Vote", "Comeback vote"],
  SENT: ["Sent", "Comeback sent"],
  REPLY: ["The reply", "The verdict"],
};

/** One player's phone: write, vote, then watch the screen. */
export function MatchslopController() {
  const { view } = useRoom();
  const mode = useModeView("MATCHSLOP");
  const { room } = view;
  const round = mode.round;
  const finished = room.status === "FINISHED";
  const title = finished
    ? mode.outcome === "COMEBACK"
      ? "Partial win"
      : "Game over"
    : (TITLES[room.phase]?.[mode.comeback ? 1 : 0] ?? "MatchSlop");
  const progress =
    room.phase === "WRITING"
      ? { count: round?.answeredPlayerIds.length ?? 0, label: "in" }
      : room.phase === "VOTING"
        ? { count: round?.votedPlayerIds.length ?? 0, label: "voted" }
        : null;

  let body: ReactNode = <Waiting mode={mode} />;
  if (finished) body = <Finished mode={mode} />;
  else if (room.phase === "WRITING" && round) body = <Writing mode={mode} round={round} />;
  else if (room.phase === "VOTING" && round) body = <Voting mode={mode} round={round} />;
  else if (room.phase === "SENT" || room.phase === "REPLY") body = <Watching mode={mode} />;

  return (
    <main className="flex-1 flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-md space-y-4">
        <h1
          className="font-display text-2xl font-bold text-center"
          style={{ color: "var(--ms-ink)" }}
        >
          {title}
        </h1>
        {progress && (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Timer />
            </div>
            <ProgressCount
              count={progress.count}
              total={view.players.length}
              label={progress.label}
            />
          </div>
        )}
        {body}
        {!finished && room.phase !== "PROFILE" && <ProfileToggle mode={mode} />}
      </div>
    </main>
  );
}
