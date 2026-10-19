"use client";

import { motion } from "motion/react";
import { api } from "../../../../../convex/_generated/api";
import { ErrorBanner } from "@/components/error-banner";
import { formatPoints, ordinal } from "@/lib/format";
import { listParent, enter } from "@/lib/animations";
import { usePlayers, useRoom, useRoomAction } from "@/room/context";
import { Avatar } from "@/room/avatar";
import { Stamp } from "@/room/moment";
import { ChampionCard, PLATE } from "./champion-card";
import { ForgingScreen, ReadyScreen } from "./forging";
import { championsWaiting } from "./logic";
import { UpgradeScreen } from "./build";
import { BigButton, Kicker, Screen, championName, fighterById, useMine, type SlopfightMode } from "./shared";
import { ChampionSilhouette } from "./silhouette";

// FOUNDRY, ROSTER, STANDINGS and the finished game.

/** "The Foundry jammed": a forge failed on both models and the host has the retry. */
function Jammed({ mine }: { mine: boolean }) {
  const { view } = useRoom();
  const { act, pending, error } = useRoomAction();
  const host = view.me?.isHost === true;
  return (
    <Screen
      center
      action={
        host ? (
          <div className="flex flex-col gap-2">
            <ErrorBanner error={error} className="" />
            <BigButton onClick={() => void act(api.slopfight.play.retryForges, {})} disabled={pending}>
              {pending ? "Retrying…" : "Retry the Foundry"}
            </BigButton>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.span
          aria-hidden="true"
          className="grid size-24 place-items-center rounded-full bg-fail-soft font-display text-5xl text-fail"
          animate={{ rotate: [0, -8, 8, -4, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1.6 }}
        >
          !
        </motion.span>
        <Kicker tone="dim">The Foundry</Kicker>
        <h2 className="font-display text-3xl font-bold text-ink">The Foundry jammed</h2>
        <p className="text-base text-ink-dim">
          {mine ? "Your champion got stuck in the machine. " : "A champion got stuck in the machine. "}
          {host ? "Give it another go." : "The host can retry it."}
        </p>
      </div>
    </Screen>
  );
}

/** FOUNDRY: the watchdog wait after Build (round 1) or an upgrade (later rounds). */
export function FoundryScreen() {
  const { view } = useRoom();
  const { mode, fighter } = useMine();
  if (view.room.round > 1) {
    if (mode.foundryParked && fighter?.status !== "FAILED") return <Jammed mine={false} />;
    if (fighter?.status === "FAILED") return <Jammed mine />;
    return <UpgradeScreen />;
  }
  if (fighter?.status === "FAILED") return <Jammed mine />;
  if (fighter?.status === "FORGING") return <ForgingScreen fighter={fighter} />;
  if (mode.foundryParked) return <Jammed mine={false} />;
  if (fighter?.champion) {
    return <ReadyScreen champion={fighter.champion} landed={false} footer={championsWaiting(mode.fighters, 0)} />;
  }
  return (
    <Screen center>
      <p className="text-center font-display text-2xl font-bold text-ink">The Foundry is busy</p>
    </Screen>
  );
}

/** This phone's fight in the current round: who and when. */
function myNextFight(mode: SlopfightMode, round: number, fighterId: string | null) {
  const fights = mode.fights.filter((fight) => fight.round === round).toSorted((x, y) => x.step - y.step);
  const index = fights.findIndex((fight) => fight.a === fighterId || fight.b === fighterId);
  if (index < 0) return null;
  const fight = fights[index]!;
  const rival = fighterById(mode, fight.a === fighterId ? fight.b : fight.a);
  return { fight, index, count: fights.length, rival };
}

export function RosterScreen() {
  const { view } = useRoom();
  const { mode, fighter, champion } = useMine();
  const next = myNextFight(mode, view.room.round, fighter?.id ?? null);
  return (
    <Screen>
      <div className="flex flex-col items-center gap-1 pt-1 text-center">
        <Kicker>{view.room.round === 3 ? "Final round" : `Round ${view.room.round}`}</Kicker>
        <h2 className="font-display text-3xl font-bold text-ink">Get ready</h2>
        {next && (
          <p className="text-base text-ink-dim">
            {next.fight.isFinal
              ? `You're in the Final, against ${championName(next.rival?.champion)}`
              : next.fight.isThirdPlace
                ? `Third place is on the line, against ${championName(next.rival?.champion)}`
                : `${next.index === 0 ? "First up" : "Up second"}: you against ${championName(next.rival?.champion)}`}
          </p>
        )}
      </div>
      {champion ? (
        <ChampionCard champion={champion} />
      ) : (
        <p className="text-center text-base text-ink-dim">Four champions walk out. Eyes on the TV.</p>
      )}
    </Screen>
  );
}

/** Players best first by points, with their champion and its record. */
function useTable() {
  const { mode } = useMine();
  const { players } = usePlayers();
  const ranked = players.toSorted((x, y) => y.score - x.score);
  return ranked.map((player) => {
    const fighter = mode.fighters.find((entry) => entry.ownerId === player.id) ?? null;
    const rank = ranked.findIndex((other) => other.score === player.score) + 1;
    return { player, fighter, rank };
  });
}

function Table({ meId }: { meId: string | null }) {
  const rows = useTable();
  return (
    <motion.ol variants={listParent(rows.length)} initial="hidden" animate="visible" className="flex flex-col gap-2">
      {rows.map(({ player, fighter, rank }) => {
        const me = player.id === meId;
        const record = fighter?.record;
        return (
          <motion.li
            key={player.id}
            variants={enter}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${me ? "bg-punch/12 ring-2 ring-punch" : "bg-surface"} ${player.online ? "" : "opacity-60"}`}
          >
            <span className="w-7 text-center font-display text-lg font-bold text-ink-dim">{rank}</span>
            {fighter?.champion ? (
              <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: PLATE }}>
                <ChampionSilhouette champion={fighter.champion} className="size-9" />
              </span>
            ) : (
              <Avatar name={player.name} modelId={player.modelId} size="40px" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold text-ink">
                {player.name}
                {!player.online && <span className="font-medium text-ink-dim"> · left</span>}
              </span>
              <span className="block truncate text-sm text-ink-dim">
                {championName(fighter?.champion)}
                {record ? ` · ${record.wins}–${record.losses}` : ""}
              </span>
            </span>
            <span className="font-display text-xl font-bold tabular-nums text-ink">{formatPoints(player.score)}</span>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

export function StandingsScreen() {
  const { view } = useRoom();
  const meId = view.me?.playerId ?? null;
  const rows = useTable();
  const mine = rows.find((row) => row.player.id === meId);
  return (
    <Screen>
      <div className="flex flex-col items-center gap-1 pt-1 text-center">
        <Kicker>Standings · after round {view.room.round}</Kicker>
        {mine ? (
          <>
            <p className="font-display text-5xl font-black text-ink">{ordinal(mine.rank)}</p>
            <p className="text-lg font-semibold text-ink-dim">{formatPoints(mine.player.score)} points</p>
          </>
        ) : (
          <h2 className="font-display text-3xl font-bold text-ink">The table</h2>
        )}
      </div>
      <Table meId={meId} />
    </Screen>
  );
}

export function FinishedScreen() {
  const { view } = useRoom();
  const { mode, fighter, champion } = useMine();
  const meId = view.me?.playerId ?? null;
  const place = fighter && mode.podium ? mode.podium.indexOf(fighter.id) + 1 : 0;
  const winner = mode.podium ? fighterById(mode, mode.podium[0]) : null;
  return (
    <Screen className="pb-28">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <Kicker tone="gold">Fight night is over</Kicker>
        {place > 0 ? (
          <Stamp tone={place === 1 ? "gold" : place === 2 ? "teal" : "ink"} size="lg">
            {place === 1 ? "Champion!" : `${ordinal(place)} place`}
          </Stamp>
        ) : (
          <h2 className="font-display text-3xl font-bold text-ink">
            {winner ? `${championName(winner.champion)} takes the trophy` : "What a night"}
          </h2>
        )}
      </div>
      {champion && <ChampionCard champion={champion} compact />}
      <Table meId={meId} />
    </Screen>
  );
}
