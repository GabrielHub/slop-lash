"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Stamp, flight, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { LOBBY, PLAYER_COLOR, RUNDOWN, type PlayerName } from "../content";
import { BulbRow, Token } from "../parts";

/**
 * `topics`: the lobby lists the topic each player picked before the show;
 * each one flies into its own round on the show's rundown. Max didn't pick,
 * so the house drops one into his round.
 */

const LOBBY_BOX = { left: 110, top: 196, width: 690, rowTop: 300, row: 112, gap: 16 };
const CHIP = { left: 400, width: 360, height: 78 };
const SHOW = { left: 890, top: 162, width: 880, rowTop: 262, row: 88, gap: 10 };
const SLOT = { left: 1388, width: 356, height: 70 };

function lobbyChip(index: number) {
  return {
    x: CHIP.left + CHIP.width / 2,
    y: LOBBY_BOX.rowTop + index * (LOBBY_BOX.row + LOBBY_BOX.gap) + LOBBY_BOX.row / 2,
  };
}

function slotCentre(row: number) {
  return {
    x: SLOT.left + SLOT.width / 2,
    y: SHOW.rowTop + row * (SHOW.row + SHOW.gap) + SHOW.row / 2,
  };
}

/** Which rundown row holds each lobby player's round. */
const ROW_OF: Record<PlayerName, number> = { Ana: 1, Sam: 2, Jo: 3, Max: 4 };

export function TopicsShot() {
  const shot = useLocalCues();
  const { t } = shot;
  const picked = shot.word("topics", "picked");
  const gets = shot.word("topics", "gets");
  const own = shot.word("topics", "own.");
  const didnt = shot.word("topics", "Didn't");
  const we = shot.word("topics", "We");
  const forWord = shot.word("topics", "for");

  const flights = LOBBY.map((entry, index) =>
    entry.house ? { at: we, duration: 0.42 } : { at: gets + index * 0.13, duration: 0.55 },
  );
  const lands = flights.map((trip) => trip.at + trip.duration);

  return (
    <div className="absolute inset-0">
      <Lobby t={t} picked={picked} didnt={didnt} houseLands={lands[3]} />
      <Rundown t={t} lands={lands} own={own} didnt={didnt} stampAt={forWord} />
      {LOBBY.map((entry, index) => {
        const trip = flights[index];
        if (t < trip.at || t > trip.at + trip.duration) return null;
        const to = slotCentre(ROW_OF[entry.name]);
        const from = entry.house ? { x: to.x + 40, y: -120 } : lobbyChip(index);
        const path = flight(t, {
          at: trip.at,
          duration: trip.duration,
          from,
          to,
          lift: entry.house ? 0 : 150,
          easing: entry.house ? ease.in : ease.inOut,
        });
        const arc = Math.sin(path.progress * Math.PI);
        return (
          <div
            key={entry.name}
            className="absolute z-20"
            style={{
              left: path.x,
              top: path.y,
              transform: `translate(-50%, -50%) rotate(${entry.house ? (1 - path.progress) * 14 : arc * -8}deg) scale(${1 + arc * 0.14})`,
            }}
          >
            <TopicChip label={entry.topic} owner={entry.name} house={entry.house} width={SLOT.width} height={SLOT.height} />
          </div>
        );
      })}
    </div>
  );
}

function TopicChip({
  label,
  owner,
  house = false,
  width,
  height,
  glow = 0,
}: {
  label: string;
  owner: PlayerName | null;
  house?: boolean;
  width: number;
  height: number;
  glow?: number;
}) {
  const edge = house ? "var(--gold)" : owner ? `color-mix(in srgb, ${PLAYER_COLOR[owner]} 60%, var(--edge))` : "var(--edge)";
  return (
    <div
      className="flex items-center rounded-[18px] border-[3px] bg-surface px-[20px] text-[30px] font-bold text-ink"
      style={{
        width,
        height,
        borderColor: glow > 0.01 ? `color-mix(in srgb, var(--teal) ${Math.round(glow * 100)}%, ${edge})` : edge,
        boxShadow: `0 14px 26px -16px rgba(0,0,0,0.55)${glow > 0.01 ? `, 0 0 0 ${glow * 7}px color-mix(in srgb, var(--teal) 30%, transparent)` : ""}`,
        background: house ? "color-mix(in srgb, var(--gold) 10%, var(--surface))" : undefined,
      }}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

/** The TV lobby: each player and the topic they picked, or "Picking…". */
function Lobby({ t, picked, didnt, houseLands }: { t: number; picked: number; didnt: number; houseLands: number }) {
  const shown = spring(t + 0.15, SPRINGS.smooth);
  const everyone = t >= houseLands;
  return (
    <div
      className="absolute"
      style={{
        left: LOBBY_BOX.left,
        top: LOBBY_BOX.top,
        width: LOBBY_BOX.width,
        opacity: clamp(shown * 1.5),
        transform: `translateX(${(1 - shown) * -200}px)`,
      }}
    >
      <p
        className={`h-[64px] font-display text-[44px] font-bold leading-[64px] ${everyone ? "text-win" : "text-ink"}`}
      >
        {everyone ? "Everyone has a topic" : "Pick a topic on your phone"}
      </p>
      {LOBBY.map((entry, index) => {
        const top = LOBBY_BOX.rowTop - LOBBY_BOX.top + index * (LOBBY_BOX.row + LOBBY_BOX.gap);
        const rowIn = spring(t - index * 0.06, SPRINGS.smooth);
        const glow = entry.house ? 0 : Math.sin(clamp((t - (picked + index * 0.08)) / 0.5) * Math.PI);
        const shake = entry.house ? shakeOffset(t, didnt, 12, 0.45) : { x: 0, y: 0 };
        const filled = !entry.house || t >= houseLands;
        const land = entry.house ? spring(t - houseLands, SPRINGS.pop) : 1;
        return (
          <div
            key={entry.name}
            className="absolute inset-x-0 flex items-center gap-[20px]"
            style={{
              top,
              height: LOBBY_BOX.row,
              opacity: clamp(rowIn * 1.5),
              transform: `translateX(${(1 - rowIn) * -60 + shake.x}px)`,
            }}
          >
            <Token name={entry.name} size={80} />
            <span className="w-[150px] font-display text-[44px] font-bold text-ink">{entry.name}</span>
            {filled ? (
              <div style={{ transform: `scale(${mix(1.15, 1, land)})` }}>
                <TopicChip label={entry.topic} owner={entry.name} house={entry.house} width={CHIP.width} height={CHIP.height} glow={glow} />
              </div>
            ) : (
              <span className="flex items-center gap-[14px] text-[34px] text-ink-dim">
                <span
                  className="size-[16px] rounded-full bg-teal"
                  style={{ opacity: 0.45 + 0.55 * Math.abs(Math.sin(t * 3)) }}
                />
                Picking…
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Rundown({
  t,
  lands,
  own,
  didnt,
  stampAt,
}: {
  t: number;
  lands: readonly number[];
  own: number;
  didnt: number;
  stampAt: number;
}) {
  const shown = spring(t + 0.1, SPRINGS.smooth);
  const flash = t >= own ? 1 - progress(t, own + 0.1, 0.7, ease.out) : 0;
  return (
    <div
      className="absolute"
      style={{
        left: SHOW.left,
        top: SHOW.top,
        width: SHOW.width,
        height: 700,
        opacity: clamp(shown * 1.5),
        transform: `translateX(${(1 - shown) * 260}px)`,
      }}
    >
      <div
        className="absolute inset-0 rounded-[38px] border-[4px] border-gold"
        style={{
          background: "color-mix(in srgb, var(--surface) 94%, transparent)",
          boxShadow: "0 40px 80px -40px rgba(0,0,0,0.6), inset 0 0 0 999px color-mix(in srgb, var(--gold) 4%, transparent)",
        }}
      />
      <div className="absolute left-[40px] top-[24px]">
        <BulbRow length={SHOW.width - 80} spacing={46} size={14} chase={1.6} flash={flash} />
      </div>
      <p className="absolute inset-x-0 top-[40px] text-center font-display text-[46px] font-black uppercase tracking-[0.16em] text-gold qs-marquee-text">
        Tonight&apos;s show
      </p>
      {RUNDOWN.map((row, index) => {
        const top = SHOW.rowTop - SHOW.top + index * (SHOW.row + SHOW.gap);
        const rowIn = spring(t - (0.05 + index * 0.05), SPRINGS.smooth);
        const tone = row.tone === "teal" ? "text-teal" : row.tone === "gold" ? "text-gold" : "text-punch";
        const lobbyIndex = LOBBY.findIndex((entry) => entry.name === row.owner);
        const land = lobbyIndex === -1 ? null : lands[lobbyIndex];
        const house = lobbyIndex !== -1 && LOBBY[lobbyIndex].house;
        const pop = land === null ? 0 : Math.sin(clamp((t - land) / 0.3) * Math.PI) * 0.08;
        const ownPop = row.owner ? Math.sin(clamp((t - (own + index * 0.05)) / 0.35) * Math.PI) * 0.03 : 0;
        return (
          <div
            key={index}
            className="absolute inset-x-[30px] flex items-center gap-[16px] rounded-[22px] bg-raised px-[20px]"
            style={{
              top,
              height: SHOW.row,
              opacity: clamp(rowIn * 1.5),
              transform: `translateX(${(1 - rowIn) * 60}px) scale(${1 + ownPop})`,
            }}
          >
            <span className="w-[34px] font-mono text-[34px] font-bold text-ink-dim">{index + 1}</span>
            <span className={`flex w-[400px] items-center gap-[12px] font-display text-[36px] font-bold ${tone}`}>
              {row.owner && <Token name={row.owner} size={52} />}
              <span className="whitespace-nowrap">
                {row.owner}
                {row.kicker}
              </span>
            </span>
            <div className="relative ml-auto" style={{ transform: `scale(${1 + pop})` }}>
              {row.topic && (land === null || t >= land) ? (
                <TopicChip label={row.topic} owner={row.owner} house={house} width={SLOT.width} height={SLOT.height} />
              ) : (
                <EmptySlot t={t} wanted={house ? didnt : null} last={index === RUNDOWN.length - 1} />
              )}
              {house && (
                <div className="absolute -right-[18px] -top-[34px]">
                  <Stamp text="PICKED FOR YOU" at={stampAt} tone="gold" rotate={4} size={28} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptySlot({ t, wanted, last }: { t: number; wanted: number | null; last: boolean }) {
  const alarm = wanted === null ? 0 : progress(t, wanted, 0.2);
  const pulse = alarm * (0.5 + 0.5 * Math.sin((t - (wanted ?? 0)) * 9));
  return (
    <div
      className="flex items-center justify-center rounded-[18px] border-[3px] border-dashed font-display text-[30px] font-bold"
      style={{
        width: SLOT.width,
        height: SLOT.height,
        borderColor: last ? "color-mix(in srgb, var(--gold) 70%, transparent)" : `color-mix(in srgb, var(--punch) ${Math.round(pulse * 100)}%, var(--edge-strong))`,
        color: last ? "var(--gold)" : "var(--punch)",
        background: alarm > 0 ? `color-mix(in srgb, var(--punch) ${Math.round(pulse * 12)}%, transparent)` : undefined,
      }}
    >
      {last ? "You all vote" : alarm > 0 ? <span style={{ transform: `scale(${1 + pulse * 0.2})` }}>?</span> : null}
    </div>
  );
}
