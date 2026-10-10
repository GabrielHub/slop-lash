"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { collapse, press } from "@/lib/animations";
import { useRoom, useRoomAction } from "@/room/context";
import { buzz } from "@/room/moment";
import { getArena } from "../../arenas";
import { DESCRIBE_TEXT_MAX, UPGRADE_TEXT_MAX } from "../../constants";
import { isBlankDoodle, type Stroke } from "../../strokes";
import { ERASER_INDEX } from "../../vocab";
import { DrawingCanvas, InkPicker } from "./canvas";
import { ForgingScreen, ReadyScreen } from "./forging";
import {
  BigButton,
  Kicker,
  Screen,
  useLastSecondsTicks,
  useMine,
  useSfx,
  type FighterView,
} from "./shared";
import { ChampionSilhouette } from "./silhouette";
import { useStrokeSync, type StrokeSync } from "./use-strokes";

// BUILD and UPGRADE: pick Draw it or Describe it, then the canvas or the text
// box, then one submit. A rejection shows the reason and reopens the work as
// it was. Upgrades add one thing: a short text or strokes on a new layer over
// the faded drawing.

type InputKind = "DRAW" | "DESCRIBE";

const DESCRIBE_EXAMPLES = [
  "a very confident jellyfish",
  "a toaster with little legs and big dreams",
  "a raccoon lawyer who has never won a case",
  "a potato with googly eyes and a grudge",
  "a pigeon in a tiny business suit",
  "a grumpy rain cloud with fists",
];
const UPGRADE_EXAMPLES = [
  "a jetpack",
  "a tiny lawyer",
  "rocket skates",
  "a frying pan",
  "angry bees",
  "a cape",
];
const EXAMPLE_MS = 3_000;
/** The stage's typing shimmer is throttled on the server too; no need to say it more often. */
const TYPING_EVERY_MS = 2_500;
/** The character count shows from this share of the limit. */
const COUNT_FROM = 0.5;

/** True once this phone has seen its fighter forging, so the card's arrival gets the payoff cue. */
function useSawForging(status: FighterView["status"] | undefined) {
  const [saw, setSaw] = useState(status === "FORGING");
  if (status === "FORGING" && !saw) setSaw(true);
  return saw;
}

/** A description draft kept per round in this browser, so a reload keeps it. */
function useDraft(key: string): [string, (text: string) => void] {
  const [text, setText] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : (window.sessionStorage.getItem(key) ?? "");
    } catch {
      return "";
    }
  });
  const save = (next: string) => {
    setText(next);
    try {
      window.sessionStorage.setItem(key, next);
    } catch {
      // Storage blocked: the draft just doesn't survive a reload.
    }
  };
  return [text, save];
}

function useRotating(list: readonly string[]) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % list.length),
      EXAMPLE_MS,
    );
    return () => window.clearInterval(timer);
  }, [list.length]);
  return list[index]!;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function PencilIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20l1-5L16 4l4 4L9 19z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

function TypeIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

function ChoiceButton({
  icon,
  title,
  hint,
  onClick,
  tone,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  tone: "punch" | "teal";
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={`flex min-h-[7.5rem] w-full cursor-pointer items-center gap-4 rounded-3xl border-2 px-5 text-left ${
        tone === "punch"
          ? "border-punch/50 bg-punch/10 text-punch"
          : "border-teal/50 bg-teal-soft text-teal"
      }`}
      {...press}
    >
      {icon}
      <span className="flex flex-col">
        <span className="font-display text-3xl font-bold text-ink">{title}</span>
        <span className="text-base text-ink-dim">{hint}</span>
      </span>
    </motion.button>
  );
}

function Tonight() {
  const { mode } = useMine();
  if (mode.arenas.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <Kicker tone="dim">Tonight&apos;s arenas</Kicker>
      <ul className="flex flex-wrap justify-center gap-1.5">
        {mode.arenas.map((arena, index) => (
          <li key={arena} className="rounded-full bg-raised px-3 py-1 text-sm font-bold text-ink">
            {getArena(arena).name}
            {index === mode.arenas.length - 1 && <span className="text-gold-ink"> · Final</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Foundry's "no", with the work reopened underneath. */
function Rejection({ reason, suggestion }: { reason: string; suggestion: string }) {
  return (
    <motion.div
      role="alert"
      variants={collapse}
      initial="hidden"
      animate="visible"
      className="overflow-hidden rounded-2xl border-2 border-fail/40 bg-fail-soft"
    >
      <div className="px-4 py-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-fail">
          The Foundry said no
        </p>
        <p className="mt-1 text-base font-bold text-ink">{reason}</p>
        {suggestion && <p className="mt-0.5 text-[15px] text-ink-dim">{suggestion}</p>}
      </div>
    </motion.div>
  );
}

function ToolButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-raised px-4 text-[15px] font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40"
      {...press}
    >
      {children}
    </motion.button>
  );
}

/** The canvas with its inks and tools, and the one Submit. */
function DrawPanel({
  sync,
  submit,
  submitting,
  switchLabel,
  onSwitch,
  backdrop,
  minInk = true,
}: {
  sync: StrokeSync;
  submit: () => void;
  submitting: boolean;
  switchLabel: string;
  onSwitch: () => void;
  backdrop?: ReactNode;
  /** Submit waits for something readable on this layer. */
  minInk?: boolean;
}) {
  const [ink, setInk] = useState(0);
  const play = useSfx();
  const blank = isBlankDoodle(sync.strokes);
  const onStroke = (stroke: Stroke) => {
    sync.add(stroke);
    play("tap", 0.3);
  };
  return (
    <>
      <DrawingCanvas
        strokes={sync.strokes}
        below={sync.below}
        ink={ink}
        disabled={!sync.ready || sync.full || submitting || sync.error !== null}
        onStroke={onStroke}
        backdrop={backdrop}
      />
      {sync.full && (
        <p className="text-sm text-ink-dim">Canvas full. Send it, or undo a stroke to make room.</p>
      )}
      <InkPicker
        ink={ink}
        onInk={(index) => {
          setInk(index);
          play("tap", 0.2);
        }}
      />
      <div className="flex items-center gap-2">
        <ToolButton
          label="Undo"
          onClick={sync.undo}
          disabled={sync.strokes.length === 0 || submitting}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
          Undo
        </ToolButton>
        <ToolButton
          label="Clear"
          onClick={sync.clear}
          disabled={sync.strokes.length === 0 || submitting}
        >
          Clear
        </ToolButton>
        <button
          type="button"
          onClick={onSwitch}
          className="ml-auto h-11 cursor-pointer rounded-full px-3 text-[15px] font-bold text-teal"
        >
          {switchLabel}
        </button>
      </div>
      <ErrorBanner error={sync.error} className="" />
      <BigButton onClick={submit} disabled={(minInk && blank) || submitting || !sync.ready}>
        {submitting
          ? "Sending…"
          : ink === ERASER_INDEX && blank
            ? "Draw something first"
            : "Send to the Foundry"}
      </BigButton>
    </>
  );
}

/** The text box with a live counter. */
function DescribePanel({
  text,
  onText,
  max,
  examples,
  submit,
  submitting,
  switchLabel,
  onSwitch,
  label,
}: {
  text: string;
  onText: (text: string) => void;
  max: number;
  examples: readonly string[];
  submit: () => void;
  submitting: boolean;
  switchLabel: string;
  onSwitch: () => void;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const example = useRotating(examples);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.max(element.scrollHeight + 4, 132)}px`;
  }, [text]);
  const ready = text.trim().length > 0 && !submitting;
  return (
    <>
      <div className="relative">
        <textarea
          ref={ref}
          value={text}
          maxLength={max}
          readOnly={submitting}
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="sentences"
          aria-label={label}
          placeholder={example}
          onChange={(event) => onText(event.target.value.replace(/\n/g, " "))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (ready) submit();
            }
          }}
          className="w-full resize-none rounded-2xl border-2 border-edge bg-surface p-4 text-xl text-ink placeholder:text-ink-dim/70 focus:border-teal focus:outline-none"
        />
      </div>
      <div className="-mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onSwitch}
          className="h-11 cursor-pointer rounded-full pr-3 text-[15px] font-bold text-teal"
        >
          {switchLabel}
        </button>
        <span
          className={`text-sm tabular-nums transition-opacity ${text.length >= max ? "text-fail" : "text-ink-dim"} ${
            text.length >= max * COUNT_FROM ? "opacity-100" : "opacity-0"
          }`}
          aria-live="polite"
        >
          {text.length}/{max}
        </span>
      </div>
      <BigButton onClick={submit} disabled={!ready}>
        {submitting ? "Sending…" : "Send to the Foundry"}
      </BigButton>
    </>
  );
}

/** Throttled `setTyping` while the box changes, for the TV's typing shimmer. */
function useTypingPing() {
  const { run } = useRoom();
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current < TYPING_EVERY_MS) return;
    last.current = now;
    run(api.slopfight.play.setTyping, {}).catch(() => {});
  };
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------

export function BuildScreen() {
  const { fighter } = useMine();
  const saw = useSawForging(fighter?.status);
  if (!fighter) return <Spectating />;
  if (fighter.status === "FORGING") return <ForgingScreen fighter={fighter} />;
  if (fighter.status === "READY" && fighter.champion) {
    return (
      <ReadyScreen
        champion={fighter.champion}
        landed={saw}
        footer="Watch it come alive on the TV"
      />
    );
  }
  return <BuildWork fighter={fighter} />;
}

function Spectating() {
  return (
    <Screen center>
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold text-ink">The champions are being made</h2>
        <p className="mt-1 text-base text-ink-dim">Eyes on the TV</p>
      </div>
    </Screen>
  );
}

function BuildWork({ fighter }: { fighter: FighterView }) {
  const { view, run } = useRoom();
  const { act, pending, error } = useRoomAction();
  const play = useSfx();
  const started = fighter.status !== "EMPTY" || fighter.inputKind !== null;
  const [kind, setKind] = useState<InputKind | null>(
    started ? (fighter.inputKind ?? "DRAW") : null,
  );
  const sync = useStrokeSync(0);
  const [text, setText] = useDraft(`slopfight:describe:${view.room.code}:${view.room.gameNumber}`);
  const typing = useTypingPing();
  const [flushing, setFlushing] = useState(false);
  useLastSecondsTicks(true);

  const choose = (next: InputKind) => {
    setKind(next);
    play("tap");
    run(api.slopfight.play.chooseInput, { kind: next }).catch(() => {});
  };

  const submitDrawing = async () => {
    setFlushing(true);
    const saved = await sync.flush();
    setFlushing(false);
    if (!saved) return;
    if (await act(api.slopfight.play.submitChampion, { kind: "DRAW" })) {
      play("confirm");
      buzz(20);
    }
  };
  const submitText = async () => {
    if (await act(api.slopfight.play.submitChampion, { kind: "DESCRIBE", text: text.trim() })) {
      play("confirm");
      buzz(20);
    }
  };

  const rejection = fighter.status === "REJECTED" ? fighter.rejection : null;
  const failed = fighter.status === "FAILED";

  if (!kind) {
    return (
      <Screen>
        <div className="flex flex-col items-center gap-1 pt-2 text-center">
          <Kicker>Build your champion</Kicker>
          <h2 className="font-display text-3xl font-bold text-ink">How do you want to make it?</h2>
        </div>
        <div className="flex flex-col gap-3">
          <ChoiceButton
            tone="punch"
            icon={<PencilIcon />}
            title="Draw it"
            hint="Doodle a fighter. Bad drawings welcome."
            onClick={() => choose("DRAW")}
          />
          <ChoiceButton
            tone="teal"
            icon={<TypeIcon />}
            title="Describe it"
            hint="One line. The Foundry does the rest."
            onClick={() => choose("DESCRIBE")}
          />
        </div>
        <Tonight />
      </Screen>
    );
  }

  return (
    <Screen className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold text-ink">
          {kind === "DRAW" ? "Draw your champion" : "Describe your champion"}
        </h2>
      </div>
      <AnimatePresence initial={false}>
        {rejection && (
          <Rejection key="rejected" reason={rejection.reason} suggestion={rejection.suggestion} />
        )}
        {failed && (
          <Rejection
            key="failed"
            reason="The Foundry jammed on that one."
            suggestion="Send it again, or wait for the host to retry."
          />
        )}
      </AnimatePresence>
      <ErrorBanner error={error} className="" />
      {kind === "DRAW" ? (
        <DrawPanel
          sync={sync}
          submit={() => void submitDrawing()}
          submitting={pending || flushing}
          switchLabel="Describe it instead"
          onSwitch={() => choose("DESCRIBE")}
        />
      ) : (
        <DescribePanel
          text={text}
          onText={(next) => {
            setText(next);
            typing();
          }}
          max={DESCRIBE_TEXT_MAX}
          examples={DESCRIBE_EXAMPLES}
          submit={() => void submitText()}
          submitting={pending}
          switchLabel="Draw it instead"
          onSwitch={() => choose("DRAW")}
          label="Describe your champion"
        />
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// UPGRADE
// ---------------------------------------------------------------------------

/** The upgrade phase and the Foundry that follows it, for this phone's fighter. */
export function UpgradeScreen() {
  const { view } = useRoom();
  const { fighter } = useMine();
  const round = view.room.round;
  const saw = useSawForging(fighter?.status);
  if (!fighter?.champion) return <Spectating />;
  const done = fighter.version >= round && fighter.status === "READY";
  const added = fighter.addition?.round === round;
  if (fighter.status === "FORGING") return <ForgingScreen fighter={fighter} upgrade />;
  if (done) {
    return (
      <ReadyScreen
        champion={fighter.champion}
        previous={added ? fighter.previous : null}
        kept={!added}
        landed={saw}
        footer={view.room.phase === "FOUNDRY" ? "Waiting for the other champions" : undefined}
      />
    );
  }
  if (view.room.phase !== "UPGRADE") {
    // The clock ran out with nothing added: the Foundry keeps it as is.
    return (
      <ReadyScreen
        champion={fighter.champion}
        kept
        landed={false}
        footer="Waiting for the other champions"
      />
    );
  }
  return <UpgradeWork fighter={fighter} round={round} />;
}

function UpgradeWork({ fighter, round }: { fighter: FighterView; round: number }) {
  const { view } = useRoom();
  const { act, pending, error } = useRoomAction();
  const play = useSfx();
  const champion = fighter.champion!;
  const [kind, setKind] = useState<InputKind | null>(null);
  const sync = useStrokeSync(round);
  const [text, setText] = useDraft(
    `slopfight:upgrade:${view.room.code}:${view.room.gameNumber}:${round}`,
  );
  const typing = useTypingPing();
  const [flushing, setFlushing] = useState(false);
  useLastSecondsTicks(true);
  const rejected = fighter.status === "REJECTED" ? fighter.rejection : null;
  // Strokes already on this round's layer (a reload mid-doodle) reopen the canvas.
  const shownKind = kind ?? (sync.strokes.length > 0 ? "DRAW" : null);

  const submitDrawing = async () => {
    setFlushing(true);
    const saved = await sync.flush();
    setFlushing(false);
    if (!saved) return;
    if (await act(api.slopfight.play.submitUpgrade, { kind: "DRAW" })) {
      play("confirm");
      buzz(20);
    }
  };
  const submitText = async () => {
    if (await act(api.slopfight.play.submitUpgrade, { kind: "DESCRIBE", text: text.trim() })) {
      play("confirm");
      buzz(20);
    }
  };

  if (!shownKind) {
    return (
      <Screen>
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <Kicker>Upgrade</Kicker>
          <h2 className="font-display text-3xl font-bold text-ink">Add one thing</h2>
          <div className="flex items-center gap-2 rounded-full bg-raised py-1 pl-1 pr-3">
            <ChampionSilhouette champion={champion} className="size-9" />
            <span className="text-[15px] font-bold text-ink">{champion.name}</span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <ChoiceButton
            tone="teal"
            icon={<TypeIcon />}
            title="Write it"
            hint={`"${UPGRADE_EXAMPLES[0]}", "${UPGRADE_EXAMPLES[1]}"…`}
            onClick={() => setKind("DESCRIBE")}
          />
          <ChoiceButton
            tone="punch"
            icon={<PencilIcon />}
            title="Draw it on"
            hint="Doodle on top of your champion."
            onClick={() => setKind("DRAW")}
          />
        </div>
        <p className="text-center text-sm text-ink-dim">Add nothing and it fights as it is.</p>
      </Screen>
    );
  }

  return (
    <Screen className="gap-3">
      <h2 className="font-display text-2xl font-bold text-ink">
        {shownKind === "DRAW" ? `Draw on ${champion.name}` : `Give ${champion.name} one thing`}
      </h2>
      <AnimatePresence initial={false}>
        {rejected && (
          <Rejection key="rejected" reason={rejected.reason} suggestion={rejected.suggestion} />
        )}
      </AnimatePresence>
      <ErrorBanner error={error} className="" />
      {shownKind === "DRAW" ? (
        <DrawPanel
          sync={sync}
          submit={() => void submitDrawing()}
          submitting={pending || flushing}
          switchLabel="Write it instead"
          onSwitch={() => setKind("DESCRIBE")}
          backdrop={<ChampionSilhouette champion={champion} className="size-4/5" />}
        />
      ) : (
        <DescribePanel
          text={text}
          onText={(next) => {
            setText(next);
            typing();
          }}
          max={UPGRADE_TEXT_MAX}
          examples={UPGRADE_EXAMPLES}
          submit={() => void submitText()}
          submitting={pending}
          switchLabel="Draw it on instead"
          onSwitch={() => setKind("DRAW")}
          label="Add one thing"
        />
      )}
    </Screen>
  );
}
