"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { api } from "../../convex/_generated/api";
import { AudioControls } from "@/components/audio-controls";
import { ErrorBanner } from "@/components/error-banner";
import { PlayerList } from "@/components/player-list";
import { PulsingDot } from "@/components/pulsing-dot";
import { RoomInviteButton } from "@/components/room-invite-button";
import { usePhaseCountdown } from "@/components/timer";
import { gameUi } from "@/games/ui-registry";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { buttonTapPrimary, fadeInUp, popIn, staggerContainer } from "@/lib/animations";
import { playSound, preloadSounds } from "@/lib/sounds";
import { useRoom, useRoomAction, type RoomPlayer, type RoomView } from "./context";
import { useCue } from "./effects";
import { RoomGate } from "./gate";

export type RoomLayout = "stage" | "controller" | "game";

const subscribeToNothing = () => () => {};

/** A key that changes whenever the screen should show something new. */
export function phaseKey(view: RoomView) {
  const { room } = view;
  return `${room.status}:${room.phase}:${room.round}:${room.step}`;
}

/** Fades new phase content in without waiting on the old one to leave. */
export function PhaseFade({
  view,
  className = "flex-1 flex flex-col",
  children,
}: {
  view: RoomView;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      key={phaseKey(view)}
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function CountdownChip() {
  const countdown = usePhaseCountdown();
  if (countdown.untimed) return null;
  const tone =
    countdown.urgency === "urgent"
      ? "text-fail"
      : countdown.urgency === "warning"
        ? "text-gold"
        : "text-teal";
  return (
    <span className={`font-mono font-bold text-sm tabular-nums ${tone}`} role="timer">
      {countdown.expired ? "0s" : `${countdown.remaining}s`}
    </span>
  );
}

function RoomHeader() {
  const { view } = useRoom();
  const { room, me } = view;
  const ui = gameUi(room.gameType);
  const playing = room.status === "PLAYING";
  return (
    <header className="shrink-0 z-30 px-4 py-2.5 flex items-center justify-between gap-3 bg-base/80 backdrop-blur-sm border-b border-edge">
      <div className="flex items-center gap-2 min-w-0 text-xs">
        <Link
          href="/"
          className="font-display font-bold text-punch tracking-tight hover:text-punch-hover transition-colors"
        >
          {ui.name.toUpperCase()}
        </Link>
        <span className="text-edge-strong">|</span>
        <span className="font-mono font-bold tracking-widest text-ink-dim">{room.code}</span>
        {playing && (
          <>
            <span className="text-edge-strong">|</span>
            <span className="font-medium text-ink-dim truncate">
              {room.totalRounds > 1 ? `Round ${room.round}/${room.totalRounds} · ` : ""}
              {ui.phaseLabel(view)}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {playing && <CountdownChip />}
        {me?.name && <span className="hidden sm:inline text-xs text-ink-dim">{me.name}</span>}
        <AudioControls />
      </div>
    </header>
  );
}

function confirmKick(player: RoomPlayer) {
  return window.confirm(`Remove ${player.name} from the game?`);
}

/** The host's controls while a game runs: move on, remove someone, or end it. */
function HostBar() {
  const { view } = useRoom();
  const { act, pending, error } = useRoomAction();
  const [showPlayers, setShowPlayers] = useState(false);
  const { room, me, players } = view;
  if (!me?.isHost || room.status !== "PLAYING") return null;
  const ui = gameUi(room.gameType);

  return (
    <div className="shrink-0 border-t border-edge bg-base/90 backdrop-blur-sm px-4 py-3 space-y-2">
      <ErrorBanner error={error} className="mb-1" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void act(api.engine.advanceByHost, { expectedPhaseGeneration: room.phaseGeneration })
          }
          className="flex-1 rounded-xl bg-teal/90 hover:bg-teal-hover text-white font-display font-bold py-2.5 text-sm transition-colors disabled:opacity-50 cursor-pointer"
        >
          {ui.advanceLabel(view)}
        </button>
        <button
          type="button"
          onClick={() => setShowPlayers((open) => !open)}
          className="rounded-xl border border-edge px-3 py-2.5 text-sm text-ink-dim hover:text-ink transition-colors cursor-pointer"
          aria-expanded={showPlayers}
        >
          Players
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm("End the game now? Scores so far will stand.")) {
              void act(api.engine.end, {});
            }
          }}
          className="rounded-xl border border-edge px-3 py-2.5 text-sm text-ink-dim hover:text-fail transition-colors cursor-pointer disabled:opacity-50"
        >
          End
        </button>
      </div>
      {showPlayers && (
        <PlayerList
          players={players.filter((player) => player.id !== me.playerId)}
          showScores
          hostPlayerId={room.hostPlayerId}
          onKick={(player) => {
            if (confirmKick(player)) void act(api.rooms.kick, { playerId: player.id });
          }}
        />
      )}
    </div>
  );
}

function StartButton({ large = false }: { large?: boolean }) {
  const { view } = useRoom();
  const { act, pending, error } = useRoomAction();
  const { room, players } = view;
  const needed = room.minPlayers - players.length;
  return (
    <div className="space-y-2">
      <ErrorBanner error={error} />
      <motion.button
        type="button"
        onClick={() => {
          preloadSounds();
          void act(api.engine.start, {}).then((ok) => ok && playSound("game-start"));
        }}
        disabled={pending || needed > 0}
        className={`w-full font-display font-bold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed ${
          large ? "py-5 text-xl" : "py-4 text-lg"
        } ${
          needed > 0
            ? "bg-raised/80 text-ink-dim border-2 border-edge"
            : "bg-teal/90 hover:bg-teal-hover text-white disabled:opacity-50"
        }`}
        {...buttonTapPrimary}
      >
        {pending
          ? "Starting..."
          : needed > 0
            ? `Need ${needed} more player${needed === 1 ? "" : "s"}`
            : "Start game"}
      </motion.button>
    </div>
  );
}

function usePlayerSounds(players: RoomPlayer[]) {
  const previous = useRef(new Set(players.map((player) => player.id)));
  useEffect(() => {
    const current = new Set(players.map((player) => player.id));
    const joined = players.some((player) => !previous.current.has(player.id));
    const left = [...previous.current].some((id) => !current.has(id));
    previous.current = current;
    if (joined) playSound("player-join");
    else if (left) playSound("player-leave");
  }, [players]);
}

function LobbyPlayers() {
  const { view } = useRoom();
  const { act, error } = useRoomAction();
  const { room, me, players } = view;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-medium text-ink-dim text-sm">Players</h2>
        <span className="font-mono text-ink-dim/60 text-xs">
          {players.length}/{room.maxPlayers}
        </span>
      </div>
      <ErrorBanner error={error} />
      <PlayerList
        players={players}
        hostPlayerId={room.hostPlayerId}
        onKick={
          me?.isHost
            ? (player) => {
                if (confirmKick(player)) void act(api.rooms.kick, { playerId: player.id });
              }
            : undefined
        }
      />
    </div>
  );
}

/** The big screen before the game: how to join, and who is in. */
function StageLobby() {
  const { view } = useRoom();
  const { room, me, players } = view;
  const ui = gameUi(room.gameType);
  const Extra = ui.StageLobby;
  usePlayerSounds(players);
  const host = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.host,
    () => "",
  );

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-8">
      <div className="w-full max-w-6xl grid gap-10 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-6 text-center lg:text-left">
          <motion.h1
            className="font-display font-bold text-ink text-4xl xl:text-5xl"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
          >
            {ui.name}
          </motion.h1>
          <div>
            <p className="text-ink-dim mb-3">
              Join at <span className="font-mono text-ink">{host || "this site"}/join</span> with
            </p>
            <motion.div
              className="flex gap-2.5 justify-center lg:justify-start"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {room.code.split("").map((char, index) => (
                <motion.div
                  key={index}
                  className="flex items-center justify-center bg-surface/80 border-2 border-edge-strong rounded-xl font-mono font-extrabold text-gold h-20 w-16 xl:h-24 xl:w-20 text-4xl xl:text-5xl"
                  style={{ boxShadow: "var(--shadow-card)" }}
                  variants={popIn}
                >
                  {char}
                </motion.div>
              ))}
            </motion.div>
            <div className="mt-4 flex justify-center lg:justify-start">
              <RoomInviteButton roomCode={room.code} compact />
            </div>
          </div>
          {me?.isHost && !me.playerId ? (
            <StartButton large />
          ) : (
            <PulsingDot>
              <span className="text-base">Waiting for the host to start...</span>
            </PulsingDot>
          )}
        </div>
        <div className="space-y-6">
          {Extra && <Extra />}
          <div className="rounded-2xl border border-edge/80 bg-surface/45 p-4 lg:p-5">
            <LobbyPlayers />
          </div>
        </div>
      </div>
    </main>
  );
}

/** A player's phone before the game. */
function ControllerLobby() {
  const { view } = useRoom();
  const { room, me } = view;
  const Extra = gameUi(room.gameType).ControllerLobby;
  return (
    <main className="flex-1 flex flex-col items-center px-5 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <p className="text-sm text-ink-dim">You&apos;re in as</p>
          <p className="font-display font-bold text-3xl text-ink">{me?.name}</p>
        </div>
        {Extra && <Extra />}
        {me?.isHost ? (
          <>
            <StartButton />
            <LobbyPlayers />
          </>
        ) : (
          <div className="text-center py-2">
            <PulsingDot>
              <span className="text-sm">Waiting for the host to start...</span>
            </PulsingDot>
          </div>
        )}
      </div>
    </main>
  );
}

function FinishedFooter({ recap }: { recap: boolean }) {
  const { view } = useRoom();
  if (view.room.status !== "FINISHED") return null;
  return (
    <div className="shrink-0 flex flex-wrap items-center justify-center gap-3 px-4 py-4 border-t border-edge">
      {!recap && (
        <Link
          href={`/game/${view.room.code}/recap`}
          className="rounded-xl border border-edge px-4 py-2 text-sm font-semibold text-ink hover:border-edge-strong"
        >
          Share the recap
        </Link>
      )}
      <Link
        href="/host"
        className="rounded-xl bg-punch px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-punch-hover"
      >
        Host another game
      </Link>
    </div>
  );
}

function StageColumn() {
  const { view, live } = useRoom();
  const ui = gameUi(view.room.gameType);
  const Effects = live ? ui.StageEffects : undefined;
  return (
    <>
      {Effects && <Effects />}
      {view.room.status === "LOBBY" ? (
        <StageLobby />
      ) : (
        <PhaseFade view={view}>
          <ui.Stage />
        </PhaseFade>
      )}
    </>
  );
}

function ControllerColumn() {
  const { view } = useRoom();
  const ui = gameUi(view.room.gameType);
  return (
    <>
      {view.room.status === "LOBBY" ? (
        <ControllerLobby />
      ) : (
        <PhaseFade view={view}>
          <ui.Controller />
        </PhaseFade>
      )}
      <HostBar />
    </>
  );
}

function GameLayout() {
  const [tab, setTab] = useState<"controller" | "stage">("controller");
  return (
    <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] min-h-0">
      <div className="lg:hidden flex shrink-0 border-b border-edge">
        {(["controller", "stage"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 py-2 text-sm font-semibold cursor-pointer ${
              tab === option ? "text-ink border-b-2 border-punch" : "text-ink-dim"
            }`}
          >
            {option === "controller" ? "Your screen" : "Big screen"}
          </button>
        ))}
      </div>
      <section
        className={`${tab === "stage" ? "flex" : "hidden"} lg:flex flex-col min-w-0 lg:border-r border-edge`}
      >
        <StageColumn />
      </section>
      <aside
        className={`${tab === "controller" ? "flex" : "hidden"} lg:flex flex-1 flex-col min-w-0 lg:sticky lg:top-0 lg:max-h-svh lg:overflow-y-auto overflow-x-hidden`}
      >
        <ControllerColumn />
      </aside>
    </div>
  );
}

/**
 * The room frame around a game, for whatever room the surrounding provider
 * holds. `recap` is the read-only stage of a finished game.
 */
export function RoomFrame({ layout }: { layout: RoomLayout | "recap" }) {
  const { view, live } = useRoom();
  const { room } = view;
  const ui = gameUi(room.gameType);
  const seated = view.me?.playerId != null;
  // Only a seat has a controller; everyone else watches the stage.
  const effective: RoomLayout = seated && layout !== "recap" ? layout : "stage";
  useScreenWakeLock(live);
  useCue(
    `${room.status}:${room.phase}:${room.round}`,
    "phase-transition",
    room.status === "PLAYING",
  );

  return (
    <div data-game={ui.theme} className="min-h-svh flex flex-col bg-base">
      <RoomHeader />
      {effective === "stage" && (
        <div className="flex-1 flex flex-col">
          <StageColumn />
          {view.me?.isHost && <HostBar />}
        </div>
      )}
      {effective === "controller" && (
        <div className="flex-1 flex flex-col">
          <ControllerColumn />
        </div>
      )}
      {effective === "game" && <GameLayout />}
      <FinishedFooter recap={layout === "recap"} />
    </div>
  );
}

/** Every live room screen: `/stage`, `/controller`, and `/game`. */
export function RoomScreen({ code, layout }: { code: string; layout: RoomLayout }) {
  return (
    <RoomGate code={code} allowSpectator={layout === "stage"}>
      <RoomFrame layout={layout} />
    </RoomGate>
  );
}
