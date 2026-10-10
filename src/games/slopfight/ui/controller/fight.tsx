"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { api } from "../../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { formatDelta, formatPoints } from "@/lib/format";
import { press, SPRING } from "@/lib/animations";
import { usePlayers, useRoom, useRoomAction } from "@/room/context";
import { Avatar } from "@/room/avatar";
import { Stamp, buzz } from "@/room/moment";
import { getArena } from "../../arenas";
import { bodyPlanLabel } from "../../sheet";
import { HYPE_FLUSH_MS, healthAt, takeHype } from "./logic";
import {
  Kicker,
  Screen,
  championName,
  currentFight,
  ambientBuzz,
  fighterById,
  ownerName,
  sideOf,
  useLastSecondsTicks,
  useMine,
  useSfx,
  type FightView,
  type FighterView,
  type Side,
} from "./shared";
import { PLATE } from "./champion-card";
import { ChampionSilhouette } from "./silhouette";

// FACE_OFF (one tap to bet), FIGHT (two live health bars and Hype) and
// RESULT (who won, how, and what it paid this phone).

const METHOD_LABEL = { KO: "KO", RINGOUT: "Ring out", DECISION: "Decision", SUDDEN_DEATH: "Sudden death" } as const;

function fightTitle(fight: FightView, total: number) {
  if (fight.isFinal) return "The Final";
  if (fight.isThirdPlace) return "Third place";
  return `Round ${fight.round} · Fight ${fight.step + 1} of ${total}`;
}

/** Both fighters of a fight, and which one (if any) belongs to this phone. */
function useFight() {
  const { mode, fighter } = useMine();
  const fight = currentFight(mode);
  if (!fight) return null;
  const a = fighterById(mode, fight.a);
  const b = fighterById(mode, fight.b);
  const roundFights = mode.fights.filter((entry) => entry.round === fight.round).length;
  return { mode, fight, a, b, mySide: sideOf(fight, fighter?.id), roundFights };
}

function NoFight() {
  return (
    <Screen center>
      <p className="text-center font-display text-2xl font-bold text-ink">Eyes on the TV</p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// FACE_OFF
// ---------------------------------------------------------------------------

function Bettors({ ids }: { ids: readonly string[] }) {
  const { byId } = usePlayers();
  if (ids.length === 0) return null;
  return (
    <span className="flex -space-x-1.5">
      {ids.slice(0, 5).map((id) => {
        const player = byId(id);
        return player ? (
          <Avatar key={id} name={player.name} modelId={player.modelId} size="26px" className="ring-2 ring-surface" />
        ) : null;
      })}
    </span>
  );
}

function FighterButton({
  fighter,
  side,
  picked,
  mine,
  bettors,
  onPick,
}: {
  fighter: FighterView | null;
  side: Side;
  picked: boolean;
  mine: boolean;
  bettors: readonly string[];
  onPick: () => void;
}) {
  const { players } = usePlayers();
  const champion = fighter?.champion ?? null;
  return (
    <motion.button
      type="button"
      onClick={onPick}
      aria-pressed={picked}
      aria-label={`Bet on ${championName(champion)}`}
      className={`relative flex min-h-[9.5rem] w-full cursor-pointer items-center gap-3 rounded-3xl border-[3px] p-3 text-left transition-colors ${
        picked ? "border-punch bg-punch/12" : "border-edge bg-surface"
      }`}
      {...press}
    >
      <span
        className="grid size-28 shrink-0 place-items-center rounded-2xl"
        style={{ background: PLATE, boxShadow: `inset 0 -8px 0 0 var(${side === "A" ? "--teal" : "--gold"})` }}
      >
        {champion && <ChampionSilhouette champion={champion} className="size-24" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-display text-2xl font-bold leading-tight text-ink">{championName(champion)}</span>
        <span className="text-sm font-semibold text-ink-dim">
          {champion ? bodyPlanLabel(champion) : ""} · {mine ? "Yours" : ownerName(players, fighter)}
        </span>
        <span className="mt-1 flex min-h-[26px] items-center gap-2">
          <Bettors ids={bettors} />
        </span>
      </span>
      <AnimatePresence>
        {picked && (
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: -6 }}
            exit={{ scale: 0 }}
            transition={SPRING.pop}
            className="absolute -top-3 right-3 rounded-full bg-punch px-3 py-1 font-display text-sm font-extrabold uppercase tracking-wider text-accent-ink shadow"
          >
            Your pick
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function FaceOffScreen() {
  const state = useFight();
  const { act, error } = useRoomAction();
  const play = useSfx();
  const [optimistic, setOptimistic] = useState<Side | null>(null);
  useLastSecondsTicks(state !== null && state.fight.mine === null && optimistic === null);
  if (!state) return <NoFight />;
  const { fight, a, b, mySide, roundFights } = state;
  const picked = optimistic ?? fight.mine;
  const pick = (side: Side) => {
    if (side === picked) return;
    setOptimistic(side);
    play("betPlaced");
    buzz(15);
    void act(api.slopfight.play.placeBet, { fightId: fight.id, side }).then((ok) => {
      if (!ok) setOptimistic(null);
    });
  };
  return (
    <Screen center>
      <div className="flex flex-col items-center gap-1 text-center">
        <Kicker tone={fight.isFinal ? "gold" : "punch"}>{fightTitle(fight, roundFights)}</Kicker>
        <h2 className="font-display text-3xl font-bold text-ink">Who wins?</h2>
        <p className="text-base text-ink-dim">
          {fight.isFinal ? "Double points. " : ""}
          {mySide ? "Your champion is in this one. Back it, or hedge." : `${getArena(fight.arena).name}. Change your pick until the bell.`}
        </p>
      </div>
      <ErrorBanner error={error} className="" />
      <div className="flex flex-col gap-2">
        <FighterButton fighter={a} side="A" picked={picked === "A"} mine={mySide === "A"} bettors={fight.bets.A} onPick={() => pick("A")} />
        <div className="text-center font-display text-xl font-black italic text-ink-dim" aria-hidden="true">
          VS
        </div>
        <FighterButton fighter={b} side="B" picked={picked === "B"} mine={mySide === "B"} bettors={fight.bets.B} onPick={() => pick("B")} />
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// FIGHT
// ---------------------------------------------------------------------------

/** Sim time on the server's clock, every frame, from the fight's `startsAt`. */
function useSimClock(startsAt: number | null) {
  const { clockOffsetMs } = useRoom();
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (startsAt === null) return;
    let frame = 0;
    const tick = () => {
      setMs(Date.now() + clockOffsetMs - startsAt);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [startsAt, clockOffsetMs]);
  return ms;
}

function HealthBar({
  name,
  health,
  max,
  side,
  mine,
}: {
  name: string;
  health: number;
  max: number;
  side: Side;
  mine: boolean;
}) {
  const pct = Math.max(0, Math.min(1, health / max)) * 100;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const previous = useRef(health);
  const play = useSfx();
  useEffect(() => {
    const dropped = previous.current - health;
    previous.current = health;
    // A chunk off the bar: a jolt you can feel. Interpolated slivers don't count.
    if (dropped >= max * 0.06 && scope.current) {
      void animate(scope.current, { x: [0, -7, 6, -3, 0] }, { duration: 0.3 });
      if (mine) ambientBuzz(25);
      else play("tap", 0.2);
    }
  }, [health, max, mine, animate, scope, play]);
  const low = pct <= 25;
  return (
    <div ref={scope} className={`rounded-2xl p-3 ${mine ? "bg-punch/12 ring-[3px] ring-punch" : "bg-surface"}`}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate font-display text-xl font-bold text-ink">{name}</span>
        <span className="shrink-0 font-mono text-base font-bold tabular-nums text-ink-dim">{Math.ceil(health)}</span>
      </div>
      <div className="relative h-7 overflow-hidden rounded-full bg-raised">
        {/* The ghost lags behind the bar, so a hit reads as a chunk crunching off. */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ink/80 transition-[width] delay-200 duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${low ? "bg-fail" : side === "A" ? "bg-teal" : "bg-gold"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function HypeButton() {
  const { run } = useRoom();
  const play = useSfx();
  const banked = useRef(0);
  const timer = useRef<number | null>(null);
  const [taps, setTaps] = useState(0);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flush = () => {
    timer.current = null;
    const { send, rest } = takeHype(banked.current);
    banked.current = rest;
    if (send > 0) run(api.slopfight.play.hype, { count: send }).catch(() => {});
    if (rest > 0) timer.current = window.setTimeout(flush, HYPE_FLUSH_MS);
  };
  const tap = () => {
    banked.current += 1;
    setTaps((count) => count + 1);
    play("hype");
    buzz(8);
    if (timer.current === null) timer.current = window.setTimeout(flush, HYPE_FLUSH_MS);
  };
  return (
    <div className="relative flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onPointerDown={(event) => {
          // Pointer down, not click: mashing must never wait for a release.
          event.preventDefault();
          tap();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            tap();
          }
        }}
        className="relative grid size-52 cursor-pointer touch-manipulation select-none place-items-center rounded-full bg-punch font-display text-5xl font-black uppercase tracking-wide text-accent-ink shadow-[0_10px_0_0_color-mix(in_srgb,var(--punch)_55%,black)]"
        whileTap={{ scale: 0.92, y: 6 }}
        transition={SPRING.press}
      >
        Hype!
        <AnimatePresence>
          {taps > 0 && (
            <motion.span
              key={taps}
              aria-hidden="true"
              className="pointer-events-none absolute -top-2 right-4 font-display text-2xl font-black text-punch"
              initial={{ y: 0, opacity: 1, scale: 0.8 }}
              animate={{ y: -50, opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.6 }}
            >
              +1
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <p className="text-sm font-semibold text-ink-dim">Mash it. The crowd gets louder.</p>
    </div>
  );
}

function Conferring({ coin }: { coin: boolean }) {
  return (
    <output className="flex flex-col items-center gap-3 py-6 text-center">
      <motion.span
        aria-hidden="true"
        className="grid size-20 place-items-center rounded-full bg-gold font-display text-3xl font-black text-accent-ink"
        animate={coin ? { rotateY: [0, 180, 360] } : { scale: [1, 1.08, 1] }}
        transition={{ duration: coin ? 0.9 : 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        {coin ? "?" : "…"}
      </motion.span>
      <p className="font-display text-2xl font-bold text-ink">
        {coin ? "The judges are flipping a coin" : "The judges are conferring"}
      </p>
    </output>
  );
}

export function FightScreen() {
  const state = useFight();
  const simMs = useSimClock(state?.fight.startsAt ?? null);
  if (!state) return <NoFight />;
  const { fight, a, b, mySide } = state;
  const outcome = fight.outcome;
  const nameA = championName(a?.champion);
  const nameB = championName(b?.champion);
  const mine = mySide === "A" ? a : mySide === "B" ? b : null;

  if (!outcome || fight.decidedBySeed) {
    return (
      <Screen center>
        <div className="text-center">
          <Kicker>{nameA} vs {nameB}</Kicker>
        </div>
        <Conferring coin={fight.decidedBySeed} />
      </Screen>
    );
  }

  const now = simMs ?? 0;
  const health = healthAt(outcome.healthTimeline, now) ?? outcome.maxHealth;
  const over = now >= outcome.endMs;
  const before = now < 0;
  const winner = outcome.winner === "A" ? nameA : nameB;

  return (
    <Screen fill>
      <div className="flex flex-col gap-2 pt-1">
        <HealthBar name={nameA} health={health.A} max={outcome.maxHealth.A} side="A" mine={mySide === "A"} />
        <HealthBar name={nameB} health={health.B} max={outcome.maxHealth.B} side="B" mine={mySide === "B"} />
      </div>
      <div
        className={`flex min-h-[15rem] flex-1 flex-col items-center gap-3 pb-6 ${before || over || mine ? "justify-center" : "justify-end"}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {before ? (
            <motion.p key="ready" className="font-display text-4xl font-black uppercase text-ink" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.4, opacity: 0 }}>
              Get ready
            </motion.p>
          ) : over ? (
            <motion.div key="over" className="flex flex-col items-center gap-3 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Stamp tone={outcome.method === "DECISION" ? "gold" : "punch"} size="xl">
                {METHOD_LABEL[outcome.method]}
              </Stamp>
              <p className="font-display text-2xl font-bold text-ink">{winner} wins</p>
            </motion.div>
          ) : mine ? (
            <motion.p
              key="cheer"
              className="text-center font-display text-4xl font-black leading-tight text-punch"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
            >
              Come on, {championName(mine.champion)}!
            </motion.p>
          ) : (
            <motion.div key="hype" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <HypeButton />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// RESULT
// ---------------------------------------------------------------------------

const AWARD_LABEL = { WIN: "Your champion won", FINISH: "Finish bonus", BET: "Called it" } as const;

export function ResultScreen() {
  const state = useFight();
  const { view } = useRoom();
  const { players } = usePlayers();
  const play = useSfx();
  const meId = view.me?.playerId ?? null;
  const awards = (state?.fight.awards ?? []).filter((award) => award.playerId === meId);
  const earned = awards.reduce((sum, award) => sum + award.points, 0);
  const won = state?.fight.outcome && state.mySide === state.fight.outcome.winner;
  const cued = useRef(false);
  useEffect(() => {
    if (cued.current || !state?.fight.outcome) return;
    cued.current = true;
    if (earned > 0) {
      play("confirm");
      ambientBuzz(won ? [20, 60, 30] : 20);
    }
  }, [state?.fight.outcome, earned, won, play]);
  if (!state) return <NoFight />;
  const { fight, a, b, mySide } = state;
  const outcome = fight.outcome;
  if (!outcome) return <NoFight />;
  const winner = outcome.winner === "A" ? a : b;
  const loser = outcome.winner === "A" ? b : a;
  const score = players.find((player) => player.id === meId)?.score ?? 0;
  const lost = mySide !== null && !won;
  const bet = fight.mine;
  return (
    <Screen center>
      <div className="flex flex-col items-center gap-3 text-center">
        <Kicker tone={fight.isFinal ? "gold" : "punch"}>{won ? "You won the fight" : lost ? "Your champion lost" : "Result"}</Kicker>
        {winner?.champion && (
          <span className="grid size-36 place-items-center rounded-full" style={{ background: PLATE }}>
            <ChampionSilhouette champion={winner.champion} className="size-28" />
          </span>
        )}
        <h2 className="font-display text-3xl font-bold leading-tight text-ink">{championName(winner?.champion)} wins</h2>
        <Stamp tone={fight.decidedBySeed ? "gold" : outcome.method === "DECISION" ? "teal" : "punch"} size="lg">
          {fight.decidedBySeed ? "Coin flip" : METHOD_LABEL[outcome.method]}
        </Stamp>
        <p className="text-base text-ink-dim">
          {fight.decidedBySeed
            ? "The judges flipped a coin."
            : outcome.method === "RINGOUT"
              ? `${championName(loser?.champion)} left the arena.`
              : outcome.method === "KO"
                ? `${championName(loser?.champion)} is down for good.`
                : "On health, after the bell."}
        </p>
      </div>
      <div className="rounded-3xl border-2 border-edge bg-surface p-4">
        {awards.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {awards.map((award) => (
              <li key={award.reason} className="flex items-center justify-between text-base font-semibold text-ink">
                <span>{AWARD_LABEL[award.reason]}</span>
                <span className="font-mono font-bold text-win">{formatDelta(award.points)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-base font-semibold text-ink-dim">
            {bet && bet !== outcome.winner ? `You backed ${championName((bet === "A" ? a : b)?.champion)}. No points this time.` : "No points this fight."}
          </p>
        )}
        <div className="mt-3 flex items-baseline justify-between border-t border-edge pt-3">
          <span className="text-sm font-bold uppercase tracking-wider text-ink-dim">Your score</span>
          <span className="font-display text-3xl font-bold tabular-nums text-ink">{formatPoints(score)}</span>
        </div>
      </div>
    </Screen>
  );
}
