"use client";

import type { CSSProperties } from "react";
import { useRoom, type ModeView, type RoomView } from "@/room/context";
import { ARENAS, type ArenaId } from "../arenas";
import { bodyPlanLabel, type Champion } from "../sheet";
import type { FightEvent, FightMethod, Side } from "../sim";
import { formatFightTime, methodWords, readableEventLog, type LogTone } from "../stage3d/fight/event-log";
import { storedEvents } from "../stage3d/fight/playback";
import { MOVE_TYPE_INFO, TOY_COLOR_VALUES } from "../vocab";

/**
 * The recap without WebGL: the podium as cards, each fight's two champion
 * cards (name, body plan, moves), how it ended and its recap line, and a
 * readable event log built from the stored events. No three.js here: the
 * event log helper is plain TypeScript with type-only imports.
 */

type SlopfightMode = ModeView<"SLOPFIGHT">;
type FightView = SlopfightMode["fights"][number];
type FighterView = SlopfightMode["fighters"][number];

const PLACE_LABEL = ["Champion", "Runner-up", "Third", "Fourth"] as const;

interface FallbackFight {
  id: string;
  round: number;
  isFinal: boolean;
  isThirdPlace: boolean;
  arena: ArenaId;
  a: string;
  b: string;
  sheets: { A: Champion | null; B: Champion | null };
  winner: Side | null;
  method: FightMethod | null;
  endMs: number | null;
  decidedBySeed: boolean;
  recapLine: string | null;
  events: FightEvent[];
}

function fightLabel(fight: Pick<FallbackFight, "round" | "isFinal" | "isThirdPlace">): string {
  if (fight.isFinal) return "The Final";
  if (fight.isThirdPlace) return "Third place";
  return `Round ${fight.round}`;
}

function toFallbackFight(fight: FightView, fighters: readonly FighterView[]): FallbackFight {
  const championOf = (id: string) => fighters.find((fighter) => fighter.id === id)?.champion ?? null;
  return {
    id: fight.id,
    round: fight.round,
    isFinal: fight.isFinal,
    isThirdPlace: fight.isThirdPlace,
    arena: fight.arena,
    a: fight.a,
    b: fight.b,
    sheets: fight.sheets ?? { A: championOf(fight.a), B: championOf(fight.b) },
    winner: fight.outcome?.winner ?? null,
    method: fight.outcome?.method ?? null,
    endMs: fight.outcome?.endMs ?? null,
    decidedBySeed: fight.decidedBySeed,
    recapLine: fight.recapLine,
    events: storedEvents(fight.outcome),
  };
}

function ownerName(view: RoomView, fighter: FighterView | undefined): string {
  if (!fighter?.ownerId) return "House champion";
  return view.players.find((player) => player.id === fighter.ownerId)?.name ?? "A player";
}

function swatch(champion: Champion | null): CSSProperties {
  const color = champion ? TOY_COLOR_VALUES[champion.palette.primary].hex : "#888888";
  return { background: color };
}

export function RecapFallback() {
  const { view } = useRoom();
  const mode = view.mode.kind === "SLOPFIGHT" ? view.mode : null;
  const fighters = mode?.fighters ?? [];
  const fights = (mode?.fights ?? []).map((fight) => toFallbackFight(fight, fighters)).filter((fight) => fight.winner !== null);
  const podium = mode?.podium ?? null;
  const fighter = (id: string) => fighters.find((entry) => entry.id === id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-6 text-ink">
      <header className="text-center">
        <h1 className="font-display text-3xl font-bold">Fight night results</h1>
        <p className="text-base text-ink-dim">Room {view.room.code}. The 3D stage could not start on this device, so here is the night in words.</p>
      </header>

      {podium && podium.length > 0 && (
        <section aria-labelledby="recap-podium">
          <h2 id="recap-podium" className="mb-3 font-display text-xl font-bold">
            The podium
          </h2>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {podium.map((id, index) => {
              const entry = fighter(id);
              const champion = entry?.champion ?? null;
              return (
                <li
                  key={id}
                  className={`flex flex-col gap-1 rounded-2xl border-2 bg-surface p-3 ${index === 0 ? "border-gold" : "border-edge"}`}
                >
                  <span className={`text-sm font-bold uppercase ${index === 0 ? "text-gold" : "text-ink-dim"}`}>{PLACE_LABEL[index] ?? `#${index + 1}`}</span>
                  <span className="flex items-center gap-2 font-display text-lg font-bold leading-tight">
                    <span aria-hidden className="inline-block size-3 shrink-0 rounded-full" style={swatch(champion)} />
                    {champion?.name ?? "Unknown champion"}
                  </span>
                  <span className="text-sm text-ink-dim">{ownerName(view, entry)}</span>
                  {entry?.record && (
                    <span className="text-sm text-ink-dim">
                      {entry.record.wins}-{entry.record.losses}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section aria-labelledby="recap-fights" className="flex flex-col gap-6">
        <h2 id="recap-fights" className="font-display text-xl font-bold">
          Every fight
        </h2>
        {fights.length === 0 && <p className="text-ink-dim">No fights were fought.</p>}
        {fights.map((fight) => (
          <FightCard key={fight.id} fight={fight} view={view} fighterOf={fighter} />
        ))}
      </section>
    </main>
  );
}

const TONE_CLASS: Record<LogTone, string> = {
  hit: "text-ink",
  big: "font-semibold text-ink",
  edge: "text-punch",
  ringout: "font-semibold text-punch",
  ko: "font-semibold text-punch",
  end: "font-bold text-gold",
  info: "text-ink-dim",
};

function FightCard({ fight, view, fighterOf }: { fight: FallbackFight; view: RoomView; fighterOf: (id: string) => FighterView | undefined }) {
  const winnerName = fight.winner ? (fight.sheets[fight.winner]?.name ?? "?") : null;
  const how = fight.decidedBySeed ? "on the judges' coin" : fight.method ? `by ${methodWords(fight.method)}` : "";
  const log = readableEventLog(fight.events, fight.sheets);
  return (
    <article className="flex flex-col gap-3 rounded-[1.5rem] border border-edge bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold">
          {fightLabel(fight)} <span className="font-normal text-ink-dim">· {ARENAS[fight.arena]?.name ?? fight.arena}</span>
        </h3>
        {winnerName && (
          <p className="font-semibold">
            {winnerName} wins {how}
            {fight.endMs !== null && !fight.decidedBySeed && <span className="text-ink-dim"> at {formatFightTime(fight.endMs)}</span>}
          </p>
        )}
      </header>
      {fight.isFinal && <p className="text-sm font-bold text-gold">Double points</p>}
      {fight.recapLine && <p className="text-base italic text-ink-dim">{fight.recapLine}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["A", "B"] as const).map((side) => (
          <ChampionCard
            key={side}
            champion={fight.sheets[side]}
            owner={ownerName(view, fighterOf(side === "A" ? fight.a : fight.b))}
            won={fight.winner === side}
          />
        ))}
      </div>
      {log.length > 0 && (
        <details className="rounded-2xl border border-edge bg-raised p-3">
          <summary className="cursor-pointer font-semibold">What happened ({log.length} beats)</summary>
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {log.map((line, index) => (
              <li key={index} className={`flex gap-3 ${TONE_CLASS[line.tone]}`}>
                <span className="w-14 shrink-0 font-mono text-ink-dim">{line.time}</span>
                <span>{line.text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

function ChampionCard({ champion, owner, won }: { champion: Champion | null; owner: string; won: boolean }) {
  if (!champion) {
    return <div className="rounded-2xl border border-edge bg-raised p-3 text-ink-dim">Champion unavailable</div>;
  }
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border-2 bg-raised p-3 ${won ? "border-gold" : "border-edge"}`}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block size-4 shrink-0 rounded-full" style={swatch(champion)} />
        <span className="font-display text-lg font-bold leading-tight">{champion.name}</span>
        {won && (
          <span className="ml-auto rounded-full border border-gold bg-gold-soft px-2 text-xs font-bold text-gold-ink">
            WINNER
          </span>
        )}
      </div>
      <p className="text-sm text-ink-dim">
        {bodyPlanLabel(champion)} · {owner}
      </p>
      {champion.bio && <p className="text-sm">{champion.bio}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {champion.moves.map((move, index) => (
          <li key={index} className="flex justify-between gap-2">
            <span className="font-semibold">{move.name}</span>
            <span className="text-ink-dim">
              {MOVE_TYPE_INFO[move.type].label} · {"●".repeat(move.power)}
              {"○".repeat(Math.max(0, 5 - move.power))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
