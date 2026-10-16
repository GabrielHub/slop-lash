"use client";

import { flight } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { At, Chip, Spotlight, useShot } from "../parts";

/**
 * `two`: two chips for the whole game. One gets spent; the other hovers over
 * the rounds left, under a spotlight, and drops when the moment is right.
 */

const SLOTS = ["Warm-up", "Ana's topic", "Sam's topic", "Jo's topic", "Max's topic", "Last round"];
const SLOT = { width: 220, height: 180, gap: 20, y: 700 };
const SOCKET = { size: 110, top: 14 };
const SOCKET_Y = SLOT.y - SLOT.height / 2 + SOCKET.top + SOCKET.size / 2;
const TRACK_LEFT = (1920 - (SLOTS.length * SLOT.width + (SLOTS.length - 1) * SLOT.gap)) / 2;

function slotX(index: number) {
  return TRACK_LEFT + index * (SLOT.width + SLOT.gap) + SLOT.width / 2;
}

const FIRST_SLOT = 1;
const SECOND_SLOT = 4;

export function TwoShot() {
  const shot = useShot();
  const { t } = shot;
  const two = shot.word("two", "two");
  const allGame = shot.word("two", "all");
  const so = shot.word("two", "so");
  const pick = shot.word("two", "pick");
  const your = shot.word("two", "your");
  const moment = shot.word("two", "moment.");

  const firstLand = so + 0.42;
  const secondLand = moment + 0.34;
  const left = t < firstLand ? 2 : t < secondLand ? 1 : 0;
  const counter = spring(t - 0.15, SPRINGS.smooth);
  const tick = Math.max(
    t >= firstLand ? Math.sin(clamp((t - firstLand) / 0.3) * Math.PI) : 0,
    t >= secondLand ? Math.sin(clamp((t - secondLand) / 0.3) * Math.PI) : 0,
  );

  // The second chip's deliberation: over Sam's round, Jo's, then down on Max's.
  const hover = [
    { at: pick - 0.15, x: slotX(2) },
    { at: your, x: slotX(3) },
    { at: moment - 0.05, x: slotX(SECOND_SLOT) },
  ];
  let hoverX = 1120;
  for (const step of hover) hoverX = mix(hoverX, step.x, spring(t - step.at, SPRINGS.smooth));
  const lightOn = progress(t, pick - 0.2, 0.25) * (1 - progress(t, secondLand + 0.3, 0.4));

  return (
    <div className="absolute inset-0">
      <At x={960} y={196}>
        <div
          className="rounded-full border-[3px] border-edge-strong bg-surface px-[44px] py-[12px] font-display text-[52px] font-black text-ink"
          style={{
            opacity: clamp(counter * 1.5),
            transform: `translateY(${(1 - counter) * -30}px) scale(${1 + tick * 0.08})`,
          }}
        >
          {left === 2 ? "2 bets left" : left === 1 ? "1 bet left" : "No bets left"}
        </div>
      </At>

      <Spotlight x={hoverX + 40} y={-80} angle={-2} length={900} spread={420} strength={lightOn * 0.9} />

      {SLOTS.map((label, index) => {
        const shown = spring(t - (allGame + index * 0.05), SPRINGS.pop);
        const hit =
          index === FIRST_SLOT
            ? spring(t - firstLand, SPRINGS.pop)
            : index === SECOND_SLOT
              ? spring(t - secondLand, SPRINGS.pop)
              : 0;
        const filled = index === FIRST_SLOT || index === SECOND_SLOT;
        return (
          <At key={label} x={slotX(index)} y={SLOT.y}>
            <div
              className="relative flex flex-col items-center justify-end rounded-[24px] border-[3px] border-edge-strong bg-surface pb-[14px]"
              style={{
                width: SLOT.width,
                height: SLOT.height,
                opacity: clamp(shown * 1.5),
                transform: `translateY(${(1 - shown) * 60}px) scale(${1 + (filled ? Math.sin(clamp(hit) * Math.PI) * 0.05 : 0)})`,
                borderColor:
                  index === SECOND_SLOT && t >= secondLand
                    ? "var(--punch)"
                    : undefined,
              }}
            >
              <span
                className="absolute rounded-full border-[3px] border-dashed border-edge-strong"
                style={{ top: SOCKET.top, width: SOCKET.size, height: SOCKET.size }}
              />
              <span className="whitespace-nowrap font-display text-[28px] font-bold text-ink-dim">{label}</span>
            </div>
          </At>
        );
      })}

      <TrackChip
        t={t}
        appear={two}
        home={{ x: 800, y: 430 }}
        land={{ x: slotX(FIRST_SLOT), y: SOCKET_Y }}
        leave={so}
        landAt={firstLand}
        spend
        seed={0}
      />
      <TrackChip
        t={t}
        appear={two + 0.14}
        home={{ x: 1120, y: 430 }}
        land={{ x: slotX(SECOND_SLOT), y: SOCKET_Y }}
        hoverX={hoverX}
        hoverFrom={pick - 0.25}
        leave={moment}
        landAt={secondLand}
        seed={1}
      />
    </div>
  );
}

function TrackChip({
  t,
  appear,
  home,
  land,
  hoverX,
  hoverFrom,
  leave,
  landAt,
  spend = false,
  seed,
}: {
  t: number;
  appear: number;
  home: { x: number; y: number };
  land: { x: number; y: number };
  hoverX?: number;
  hoverFrom?: number;
  leave: number;
  landAt: number;
  spend?: boolean;
  seed: number;
}) {
  const pop = spring(t - appear, SPRINGS.jelly);
  if (pop <= 0.001) return null;
  const spin = (1 - spring(t - appear, SPRINGS.gentle)) * 540 + t * 30 + seed * 40;
  let x = home.x;
  let y = home.y + Math.sin(t * 2.2 + seed * 2) * 8;
  let size = 210;
  // The deliberating chip lifts and drifts over the rounds first.
  if (hoverX !== undefined && hoverFrom !== undefined && t >= hoverFrom) {
    const lift = spring(t - hoverFrom, SPRINGS.smooth);
    x = mix(home.x, hoverX, lift);
    y = mix(home.y, 450, lift) + Math.sin(t * 6) * 6;
    size = mix(210, 150, lift);
  }
  if (t >= leave) {
    const trip = flight(t, { at: leave, duration: landAt - leave, from: { x, y }, to: land, lift: 60, easing: ease.in });
    x = trip.x;
    y = trip.y;
    size = mix(size, SOCKET.size, trip.progress);
  }
  const landed = t >= landAt;
  const squash = landed ? 1 - 0.18 * Math.exp(-(t - landAt) * 10) * Math.cos((t - landAt) * 32) : 1;
  const spent = spend ? progress(t, landAt + 0.15, 0.35, ease.out) : 0;
  return (
    <At x={x} y={y}>
      <div style={{ transform: `scale(${pop * (2 - squash)}, ${pop * squash})` }}>
        <Chip size={size} spin={spin} spent={spent} label={spent > 0.5 ? "USED" : "BET"} />
      </div>
    </At>
  );
}
