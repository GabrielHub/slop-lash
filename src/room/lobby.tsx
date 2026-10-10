"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { AudioUnlockHint } from "@/components/audio-controls";
import { ErrorBanner } from "@/components/error-banner";
import { PlayerList } from "./player-list";
import { QrCode } from "@/components/qr-code";
import { gameUi } from "@/games/ui-registry";
import { originOf, pulseAmbient } from "@/lib/ambient-events";
import { STAGGER, SPRING, enter, listParent, pop, press } from "@/lib/animations";
import { preloadSounds, playSound } from "@/lib/sounds";
import { Avatar } from "./avatar";
import { useRoom, type RoomPlayer } from "./context";
import { hostName, useHostActions, useTwoTap } from "./host-actions";
import { Chevron, Sheet } from "./menu-sheet";
import { useMoment } from "./moment";
import { useStageKey } from "./host-dock";
import { StageSoundButton, useSiteHost, useSiteOrigin } from "./stage-rail";

/** The join sound and the leave sound, for the screen the room is watching. */
export function usePlayerSounds(players: RoomPlayer[]) {
  const { live } = useRoom();
  const previous = useRef(new Set(players.map((player) => player.id)));
  useEffect(() => {
    const current = new Set(players.map((player) => player.id));
    const joined = players.some((player) => !previous.current.has(player.id));
    const left = [...previous.current].some((id) => !current.has(id));
    previous.current = current;
    if (!live) return;
    if (joined) playSound("player-join");
    else if (left) playSound("player-leave");
  }, [players, live]);
}

/** How many more seats the room needs before the host can start. */
function useNeeded() {
  const { room, players } = useRoom().view;
  return Math.max(0, room.minPlayers - players.length);
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function PendingDot() {
  return (
    <span className="relative flex size-[0.6em] shrink-0" aria-hidden="true">
      <span className="absolute inset-0 animate-ping rounded-full bg-teal/60" />
      <span className="relative size-full rounded-full bg-teal" />
    </span>
  );
}

export function WaitingForHost({ className = "" }: { className?: string }) {
  const { view } = useRoom();
  const name = hostName(view);
  return (
    <output className={`flex items-center justify-center gap-[0.6em] text-ink-dim ${className}`}>
      <PendingDot />
      {name ? `Waiting for ${name} to start` : "Waiting for the host to start"}
    </output>
  );
}

function CrownIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 7.5l4.5 3.5L12 4l4.5 7L21 7.5 19 18H5L3 7.5z" />
    </svg>
  );
}

/** A seat token: 5rem on the TV, smaller on a narrow stage so four always fit across. */
const TOKEN_SIZE = "min(5rem, 17cqw)";

const tokenJoin: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: { opacity: 1, scale: 1, transition: SPRING.pop },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.16 } },
};

/** One seat in the stage lobby's grid; a fresh join springs in and cheers the background. */
function LobbyToken({
  player,
  isHost,
  fresh,
  canKick,
  armed,
  onKick,
}: {
  player: RoomPlayer;
  isHost: boolean;
  fresh: boolean;
  canKick: boolean;
  armed: boolean;
  onKick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fresh) pulseAmbient({ kind: "cheer", origin: originOf(ref.current), strength: 0.6 });
  }, [fresh]);
  const away = !player.online;
  return (
    <motion.li
      layout
      variants={tokenJoin}
      initial={fresh ? "hidden" : false}
      animate="visible"
      exit="exit"
      className="group relative flex min-w-0 flex-col items-center gap-[0.5rem]"
    >
      <div ref={ref} className={`relative transition-opacity ${away ? "opacity-40" : ""}`}>
        <Avatar name={player.name} modelId={player.modelId} size={TOKEN_SIZE} />
        {isHost && (
          <CrownIcon className="absolute -top-[0.85rem] left-1/2 size-[1.5rem] -translate-x-1/2 text-gold drop-shadow" />
        )}
        {player.type === "AI" && (
          <span className="absolute -bottom-[0.35rem] left-1/2 -translate-x-1/2 rounded-full bg-ai px-[0.5rem] py-[0.1rem] text-[0.75rem] font-extrabold leading-tight text-accent-ink">
            AI
          </span>
        )}
      </div>
      <span
        className={`max-w-full truncate text-[1rem] font-semibold ${away ? "text-ink-dim" : "text-ink"}`}
      >
        {player.name}
      </span>
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          aria-label={armed ? `Click again to remove ${player.name}` : `Remove ${player.name}`}
          className={`absolute -top-[0.25rem] right-[calc(50%-3rem)] grid h-[1.75rem] min-w-[1.75rem] cursor-pointer place-items-center rounded-full px-[0.4rem] text-[0.75rem] font-bold transition-[opacity,background-color] ${
            armed
              ? "bg-fail text-accent-ink opacity-100"
              : "bg-surface text-ink-dim opacity-0 shadow hover:text-fail group-hover:opacity-100 focus-visible:opacity-100"
          }`}
        >
          {armed ? "Remove?" : "✕"}
        </button>
      )}
    </motion.li>
  );
}

function EmptySeat() {
  return (
    <li className="flex flex-col items-center gap-[0.5rem]" aria-hidden="true">
      <span
        className="grid place-items-center rounded-full border-2 border-dashed border-edge-strong/60 font-display text-[2rem] font-bold text-ink-dim/35"
        style={{ width: TOKEN_SIZE, height: TOKEN_SIZE }}
      >
        ?
      </span>
      <span className="text-[1rem]">&nbsp;</span>
    </li>
  );
}

/** Who's in: a token per player, then dashed seats up to the room's limit. */
export function PlayerTokens() {
  const { view } = useRoom();
  const { room, me, players } = view;
  const { kick, error } = useHostActions();
  const { armed, press: pressTwice } = useTwoTap();
  const [initial] = useState(() => new Set(players.map((player) => player.id)));
  const empty = Math.max(0, room.maxPlayers - players.length);
  const columns = room.maxPlayers > 8 ? "grid-cols-6" : "grid-cols-4";
  return (
    <div className="flex min-h-0 flex-col gap-[1rem]" data-ambient-calm>
      <h2 className="text-center font-display text-[1.25rem] font-bold text-ink">
        <span className="tabular-nums">{players.length}</span>
        <span className="text-ink-dim"> / {room.maxPlayers} players</span>
      </h2>
      <ErrorBanner error={error} className="text-[0.875rem]" />
      <ul className={`grid ${columns} gap-x-[1rem] gap-y-[1.25rem] pt-[0.5rem]`}>
        <AnimatePresence initial={false} mode="popLayout">
          {players.map((player) => (
            <LobbyToken
              key={player.id}
              player={player}
              isHost={player.id === room.hostPlayerId}
              fresh={!initial.has(player.id)}
              canKick={me?.isHost === true && player.id !== room.hostPlayerId}
              armed={armed === player.id}
              onKick={() => pressTwice(player.id, () => void kick(player))}
            />
          ))}
        </AnimatePresence>
        {Array.from({ length: empty }, (_, index) => (
          <EmptySeat key={`empty-${index}`} />
        ))}
      </ul>
    </div>
  );
}

/** Starts the game, warming the sound cache first so the first phase's sounds play on time. */
function beginGame(start: () => Promise<boolean>) {
  preloadSounds();
  void start();
}

/**
 * The host's Start: disabled, and saying how many more are needed, until the
 * room has enough players. Size it with `className`.
 */
function StartButton({
  start,
  pending,
  className,
}: {
  start: () => Promise<boolean>;
  pending: boolean;
  className: string;
}) {
  const needed = useNeeded();
  return (
    <motion.button
      type="button"
      onClick={() => beginGame(start)}
      disabled={pending || needed > 0}
      className={`${className} cursor-pointer font-display font-bold transition-colors disabled:cursor-not-allowed ${
        needed > 0
          ? "border-2 border-edge bg-surface text-ink-dim"
          : "bg-punch text-accent-ink hover:bg-punch-hover disabled:opacity-60"
      }`}
      {...press}
    >
      {pending
        ? "Starting..."
        : needed > 0
          ? `Need ${plural(needed, "more player")}`
          : "Start game"}
    </motion.button>
  );
}

/** The host's Start on the stage: Enter starts too, unless a field or control has focus. */
export function StageStart({ keys }: { keys: boolean }) {
  const { start, pending, error } = useHostActions();
  const needed = useNeeded();
  // A held Enter never gets here, so it can't start the game and then skip its first phase too.
  useStageKey(keys, (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (needed === 0 && !pending) beginGame(start);
  });

  return (
    <div className="flex flex-col items-center gap-[0.75rem]">
      <ErrorBanner error={error} className="text-[0.875rem]" />
      <StartButton
        start={start}
        pending={pending}
        className="h-[3.5rem] rounded-full px-[3rem] text-[1.5rem]"
      />
    </div>
  );
}

/**
 * Everything a game that owns its lobby (`GameUi.ownsLobby`) needs to draw
 * one as data, e.g. in a 3D scene: how to join, who's in, and the host's
 * Start. `start` warms the sound cache first, like the shell's Start. Pair it
 * with `usePlayerSounds` on the screen the room watches.
 */
export function useLobby() {
  const { view } = useRoom();
  const { room, me, players } = view;
  const siteHost = useSiteHost();
  const origin = useSiteOrigin();
  const { start, pending, error } = useHostActions();
  const needed = useNeeded();
  const isHost = me?.isHost === true;
  return {
    code: room.code,
    /** Empty during server rendering. */
    joinUrl: origin ? `${origin}/join/${room.code}` : "",
    siteHost,
    players,
    minPlayers: room.minPlayers,
    maxPlayers: room.maxPlayers,
    /** Seats still needed before the host can start. */
    needed,
    isHost,
    canStart: isHost && needed === 0 && !pending,
    start: () => {
      preloadSounds();
      return start();
    },
    pending,
    error,
  };
}

/**
 * Masks the bottom edge of a bounded area only while its content overflows,
 * so content that fits is never faded.
 */
function useOverflowing<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    measure();
    return () => observer.disconnect();
  }, []);
  return { ref, overflowing };
}

/**
 * How to get in, sized for a real six-character code: the QR beside the site
 * address, then the code in tiles that shrink with the stage on a narrow
 * screen, so nothing ever pushes into the player column.
 */
export function JoinPanel() {
  const { room } = useRoom().view;
  const host = useSiteHost();
  const origin = useSiteOrigin();
  return (
    <div className="flex flex-col gap-[1rem]">
      <div className="flex items-center gap-[1.25rem]">
        {origin && (
          <QrCode
            value={`${origin}/join/${room.code}`}
            label={`Scan to join room ${room.code}`}
            className="size-[min(8rem,28cqw)]"
          />
        )}
        <div className="min-w-0" data-ambient-calm>
          <p className="text-[0.875rem] font-semibold uppercase tracking-[0.2em] text-ink-dim">
            Join on your phone
          </p>
          <p className="mt-[0.25rem] break-all font-mono text-[1.5rem] leading-tight text-ink">
            {host || " "}
          </p>
        </div>
      </div>
      <motion.div
        className="flex gap-[min(0.5rem,1.5cqw)]"
        variants={listParent(room.code.length, STAGGER.cards)}
        initial="hidden"
        animate="visible"
        aria-label={`Room code ${room.code.split("").join(" ")}`}
      >
        {room.code.split("").map((char, index) => (
          <motion.span
            key={index}
            aria-hidden="true"
            className="grid h-[min(4.5rem,15cqw)] w-[min(3.5rem,12cqw)] place-items-center rounded-[0.875rem] border-2 border-edge-strong bg-surface font-mono text-[min(2.75rem,9cqw)] font-extrabold text-gold-ink"
            variants={pop}
          >
            {char}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}

/**
 * The big screen before the game: a full-screen join panel. Left: the game,
 * how to join (a QR to `/join/CODE` beside the bare host, then the big code)
 * and how to play. Right: who's in, with empty seats up to the limit, and the
 * game's own lobby extra in a bounded area. Bottom: Start for the host, else
 * who we're waiting on, and the sound prompt while the browser blocks audio.
 * Docked, the host starts from the controller column instead (from lg up), so
 * Start never sits below the fold.
 */
export function StageLobby({ docked = false }: { docked?: boolean }) {
  const { view } = useRoom();
  const { room, me, players } = view;
  const ui = gameUi(room.gameType);
  const Extra = ui.StageLobby;
  const { ref: extraRef, overflowing } = useOverflowing<HTMLDivElement>();
  usePlayerSounds(players);

  return (
    <main className="@container relative flex h-full min-h-0 flex-1 flex-col gap-[1.25rem] px-4 pb-[1.5rem] pt-[2rem] sm:px-[2.5rem]">
      {!docked && <StageSoundButton className="absolute right-[1rem] top-[1rem]" />}
      {/* Two columns once the stage itself is wide enough (the docked stage is narrower than the window). */}
      <div className="grid min-h-0 flex-1 gap-[2.5rem] @6xl:grid-cols-[6fr_7fr] @6xl:grid-rows-[minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col justify-center gap-[2rem]">
          <motion.div
            variants={enter}
            initial="hidden"
            animate="visible"
            className="w-fit"
            data-ambient-calm
          >
            <h1 className="font-display text-[3.5rem] font-extrabold leading-none tracking-tight text-punch">
              {ui.name}
            </h1>
            <p className="mt-[0.5rem] text-[1.25rem] text-ink-dim">{ui.tagline}</p>
          </motion.div>

          <JoinPanel />

          <ol className="w-fit space-y-[0.75rem]" data-ambient-calm>
            {ui.howTo.map((step, index) => (
              <li key={step} className="flex items-center gap-[0.875rem] text-[1.125rem] text-ink">
                <span className="grid size-[2rem] shrink-0 place-items-center rounded-full bg-raised font-display text-[1rem] font-extrabold text-punch">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="flex min-h-0 min-w-0 flex-col gap-[1.5rem]">
          <PlayerTokens />
          {Extra && (
            <div
              ref={extraRef}
              data-overflow={overflowing || undefined}
              className={`lobby-extra relative min-h-0 flex-1 overflow-hidden data-[overflow]:[mask-image:linear-gradient(to_bottom,black_85%,transparent)] ${
                docked ? "max-h-[40svh]" : ""
              }`}
            >
              <Extra />
            </div>
          )}
        </section>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-[0.75rem]">
        <AudioUnlockHint className="text-[1rem]" />
        {me?.isHost ? (
          <div className={docked ? "lg:hidden" : ""}>
            <StageStart keys={!docked} />
          </div>
        ) : (
          <WaitingForHost className="text-[1.125rem]" />
        )}
      </div>
    </main>
  );
}

/** The host's sticky bar on a phone: the player count (opens the list) and Start. */
export function HostStartBar() {
  const { view } = useRoom();
  const { room, players } = view;
  const { start, kick, pending, error } = useHostActions();
  const [listOpen, setListOpen] = useState(false);
  return (
    <div className="sticky bottom-0 z-20 border-t border-edge bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <ErrorBanner error={error} className="mb-2" />
      <button
        type="button"
        onClick={() => setListOpen(true)}
        aria-haspopup="dialog"
        className="mx-auto mb-1 flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-ink-dim hover:text-ink"
      >
        {plural(players.length, "player")}
        <Chevron open={false} />
      </button>
      <StartButton start={start} pending={pending} className="h-14 w-full rounded-2xl text-lg" />
      <Sheet open={listOpen} onClose={() => setListOpen(false)} label="Players">
        <div className="px-4 pb-2 pt-1">
          <p className="pb-3 pl-1 font-display text-lg font-bold text-ink">
            {players.length}
            <span className="text-ink-dim"> / {room.maxPlayers} players</span>
          </p>
          <PlayerList
            players={players}
            hostPlayerId={room.hostPlayerId}
            onKick={(player) => void kick(player)}
          />
        </div>
      </Sheet>
    </div>
  );
}

/**
 * A player's phone before the game: who you are, a nudge to watch the TV, and
 * the game's own lobby extra. The host gets a sticky Start bar; everyone else
 * sees who they're waiting on.
 */
export function ControllerLobby() {
  const { view } = useRoom();
  const { room, me, players } = view;
  const ui = gameUi(room.gameType);
  const Extra = ui.ControllerLobby;
  const player = players.find((candidate) => candidate.id === me?.playerId);
  // After "Play again" every phone lands here together; each one buzzes as it does.
  useMoment([{ at: 0, haptic: 30 }], { when: room.gameNumber > 1 });
  return (
    <main className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center px-5 pb-8 pt-8">
        {/* The background keeps clear of the hero wherever the screen puts it. */}
        <div className="flex flex-col items-center text-center" data-ambient-calm>
          <p className="mb-5 font-display text-sm font-extrabold uppercase tracking-[0.25em] text-punch">
            {ui.name}
          </p>
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING.pop}
          >
            <Avatar name={me?.name ?? "?"} modelId={player?.modelId ?? null} size="96px" />
          </motion.div>
          <p className="mt-4 max-w-full truncate font-display text-3xl font-bold text-ink">
            {me?.name}
          </p>
          <p className="mt-1 text-base text-ink-dim">You&apos;re in! Watch the TV.</p>
        </div>
        {Extra && (
          <div className="mt-8 w-full max-w-md">
            <Extra />
          </div>
        )}
      </div>
      {me?.isHost ? (
        // Docked too: from lg up the host starts from here, where it stays in view.
        <HostStartBar />
      ) : (
        <div className="sticky bottom-0 bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <WaitingForHost className="text-sm" />
        </div>
      )}
    </main>
  );
}
