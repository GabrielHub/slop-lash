"use client";

import { useLocalCues } from "@/tutorial/clock";
import { STAMP_IMPACT, Stamp, flight, shakeOffset } from "@/tutorial/kit";
import { useTutorialLive, type LivePlayer } from "@/tutorial/live";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring } from "@/tutorial/timeline";
import { LETTERS, REHEARSAL_CAST } from "../content";
import { At, BulbRing, MarqueeSign, Tile, Token } from "../parts";
import { practice } from "../practice";
import { CheckMark } from "../screens";
import { StageLights } from "../title";

/**
 * `practice` and `reveal`: the rehearsal. The room answers a real question on
 * its phones while the TV shows the tiles, a countdown and who has locked in
 * (never what they picked). "Pencils down": the picks fly to their tiles, the
 * key lights, right answers get a rehearsal +100 and wrong ones the side-eye.
 *
 * In a lobby the contestants are the room's real players (their picks are an
 * input like the time); AI players play along with a pick and a lock-in time
 * hashed from their id. On the standalone page an invented cast plays.
 */

interface Contestant {
  id: string;
  name: string;
  ai: boolean;
  /** Their answer, or null for none. */
  pick: number | null;
  /** Local seconds they lock in; -Infinity when already locked, null when they never do. */
  lockAt: number | null;
}

/** A stable number for an id, to seed an AI player's play. */
function seedOf(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return Math.abs(hash % 100_003);
}

function contestantsOf(
  live: readonly LivePlayer[] | null,
  opens: number,
  window: number,
): Contestant[] {
  if (!live) {
    return REHEARSAL_CAST.map((member) => ({
      id: member.name,
      name: member.name,
      ai: false,
      pick: member.pick,
      lockAt: opens + Math.min(member.lockAfter, window - 0.8),
    }));
  }
  return live.map((player) => {
    if (player.isAi) {
      const seed = seedOf(player.id);
      return {
        id: player.id,
        name: player.name,
        ai: true,
        pick: Math.floor(hash01(seed) * practice.choices.length) % practice.choices.length,
        lockAt: opens + 1.2 + hash01(seed + 7) * Math.max(0.5, window - 2.6),
      };
    }
    return {
      id: player.id,
      name: player.name,
      ai: false,
      pick: player.pick,
      lockAt: player.pick === null ? null : -Infinity,
    };
  });
}

const TILE = { width: 700, height: 116, gapX: 40, gapY: 22, top: 356 };
const GRID_LEFT = (1920 - (TILE.width * 2 + TILE.gapX)) / 2;
const BAR = { left: 262, width: 1300, y: 700 };
const CHIPS_Y = 818;

function tileBox(index: number) {
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    left: GRID_LEFT + column * (TILE.width + TILE.gapX),
    top: TILE.top + row * (TILE.height + TILE.gapY),
  };
}

function chipLayout(count: number) {
  const gap = 18;
  const width = Math.min(240, (1680 - gap * (count - 1)) / Math.max(1, count));
  const left = (1920 - (count * width + (count - 1) * gap)) / 2;
  return { width, x: (index: number) => left + index * (width + gap) + width / 2 };
}

export function RehearsalShot() {
  const shot = useLocalCues();
  const { t } = shot;
  const live = useTutorialLive();
  const rehearse = shot.word("practice", "rehearse.");
  const phones = shot.word("practice", "Phones");
  const opens = shot.word(practice.opens.line, practice.opens.word);
  const closes = shot.at(practice.closes);
  const its = shot.word("reveal", "It's");
  const keyAt = shot.word("reveal", "orecchiette.") + 0.3;
  const little = shot.word("reveal", "Little");
  const exit = shot.at("points", -0.2);
  const window = closes - opens;

  const contestants = contestantsOf(live?.players ?? null, opens, window);
  const answered = contestants.filter((entry) => entry.pick !== null && entry.lockAt !== null && entry.lockAt <= closes);
  const anyRight = answered.some((entry) => entry.pick === practice.answer);

  const leave = progress(t, exit, 0.4, ease.in);
  const asked = spring(t - opens, SPRINGS.smooth);
  const shake = shakeOffset(t, closes + STAMP_IMPACT, 10, 0.3);
  const keyShake = shakeOffset(t, keyAt + STAMP_IMPACT, 8, 0.28);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: 1 - leave,
        transform: `translate(${shake.x + keyShake.x}px, ${shake.y + keyShake.y - leave * 80}px)`,
      }}
    >
      <StageLights
        at={-0.1}
        aim={[
          { x: mix(960, 560, asked), y: mix(470, 470, asked) },
          { x: mix(960, 1360, asked), y: mix(470, 470, asked) },
        ]}
        strength={[mix(0.9, 0.35, asked), mix(0.9, 0.35, asked)]}
      />

      <RehearsalSign t={t} rehearse={rehearse} opens={opens} />

      {/* The question and its tiles. */}
      {t >= opens - 0.1 && (
        <>
          <At x={960} y={262}>
            <h2
              className="w-[1600px] text-center font-display text-[66px] font-bold leading-tight text-ink"
              style={{ opacity: clamp(asked * 1.5), transform: `translateY(${(1 - asked) * 40}px)` }}
            >
              {practice.prompt}
            </h2>
          </At>
          {practice.choices.map((choice, index) => {
            const box = tileBox(index);
            const shown = spring(t - (opens + 0.15 + index * 0.08), SPRINGS.smooth);
            const correct = index === practice.answer;
            const keyed = t >= keyAt;
            return (
              <div
                key={choice}
                className="absolute"
                style={{
                  left: box.left,
                  top: box.top,
                  opacity: clamp(shown * 1.5),
                  transform: `translateY(${(1 - shown) * 50}px) scale(${correct && keyed ? 1 + Math.sin(clamp((t - keyAt) / 0.35) * Math.PI) * 0.04 : 1})`,
                }}
              >
                <Tile
                  letter={LETTERS[index]}
                  text={choice}
                  width={TILE.width}
                  height={TILE.height}
                  state={keyed ? (correct ? "lit" : "dim") : "idle"}
                />
                {correct && keyed && (
                  <div className="absolute -left-[22px] -top-[22px]">
                    <BulbRing
                      width={TILE.width + 44}
                      height={TILE.height + 44}
                      radius={40}
                      spacing={44}
                      size={14}
                      power={progress(t, keyAt, 0.45)}
                      chase={2}
                    />
                  </div>
                )}
                {correct && (
                  <div className="absolute -top-[40px] left-[300px] z-20">
                    {anyRight ? (
                      <Stamp text="+100" at={keyAt} tone="win" rotate={-4} size={46} />
                    ) : (
                      <Stamp text="THE QUIZ WINS" at={keyAt} tone="punch" rotate={-4} size={40} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <Countdown t={t} opens={opens} closes={closes} its={its} />

      <At x={960} y={BAR.y}>
        <Stamp text="PENCILS DOWN" at={closes} tone="punch" rotate={-3} size={64} out={its - 0.05} />
      </At>

      <Explanation t={t} at={little} />

      <Contestants
        t={t}
        contestants={contestants}
        phones={phones}
        closes={closes}
        its={its}
        keyAt={keyAt}
      />
    </div>
  );
}

/** "REHEARSAL" in lights, then tucked up top as the round's header. */
function RehearsalSign({ t, rehearse, opens }: { t: number; rehearse: number; opens: number }) {
  // Lands on "rehearse.", after the answer shot's phones have cleared.
  const at = rehearse - 0.12;
  const shown = spring(t - at, SPRINGS.smooth);
  if (shown <= 0.001) return null;
  const tuck = spring(t - (opens - 0.15), SPRINGS.gentle);
  const subtitle = progress(t, rehearse + 0.3, 0.3) * (1 - progress(t, opens - 0.2, 0.2));
  return (
    <At x={960} y={mix(430, 136, tuck)}>
      <div
        className="flex flex-col items-center"
        style={{ transform: `scale(${mix(0.7, 1, shown) * mix(1, 0.4, tuck)})`, opacity: clamp(shown * 1.5) }}
      >
        <MarqueeSign width={980} height={250} power={progress(t, at, 0.6, ease.inOut)} chase={1.6}>
          <span className="font-display text-[120px] font-black uppercase leading-none tracking-[0.08em] text-gold qs-marquee-text">
            Rehearsal
          </span>
        </MarqueeSign>
        <p className="mt-[30px] font-display text-[48px] font-bold text-ink-dim" style={{ opacity: subtitle }}>
          Just for practice
        </p>
      </div>
    </At>
  );
}

/** The answer window running down to "Pencils down". */
function Countdown({ t, opens, closes, its }: { t: number; opens: number; closes: number; its: number }) {
  const shown = spring(t - (opens + 0.4), SPRINGS.smooth);
  const gone = progress(t, its - 0.2, 0.3, ease.in);
  if (shown <= 0.001 || gone >= 1) return null;
  const left = clamp((closes - t) / Math.max(0.1, closes - opens));
  const seconds = Math.max(0, Math.ceil(closes - Math.max(t, opens)));
  const color = closes - t < 2 ? "var(--punch)" : closes - t < 4 ? "var(--gold)" : "var(--teal)";
  const tick = t < closes ? 1 + Math.max(0, 0.12 - ((t - opens) % 1)) * 1.2 : 1;
  return (
    <div className="absolute inset-0" style={{ opacity: clamp(shown * 1.5) * (1 - gone) }}>
      <p
        className="absolute font-display text-[34px] font-bold text-ink-dim"
        style={{ left: BAR.left, top: BAR.y - 62 }}
      >
        Answer on your phone
      </p>
      <div
        className="absolute h-[20px] overflow-hidden rounded-full bg-raised"
        style={{ left: BAR.left, top: BAR.y - 10, width: BAR.width }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${left * 100}%`, background: color, boxShadow: `0 0 18px ${color}` }}
        />
      </div>
      <At x={BAR.left + BAR.width + 82} y={BAR.y}>
        <span
          className="block font-mono text-[72px] font-bold tabular-nums"
          style={{ color, transform: `scale(${tick})` }}
        >
          {seconds}
        </span>
      </At>
    </div>
  );
}

function Explanation({ t, at }: { t: number; at: number }) {
  const shown = progress(t, at, 0.5, ease.out);
  if (shown <= 0) return null;
  return (
    <At x={960} y={BAR.y}>
      <p
        className="whitespace-nowrap font-display text-[44px] text-ink"
        style={{ clipPath: `inset(0 ${(1 - shown) * 100}% 0 0)` }}
      >
        Orecchiette is Italian for <span className="font-bold text-gold">“little ears”</span>.
      </p>
    </At>
  );
}

function Contestants({
  t,
  contestants,
  phones,
  closes,
  its,
  keyAt,
}: {
  t: number;
  contestants: readonly Contestant[];
  phones: number;
  closes: number;
  its: number;
  keyAt: number;
}) {
  const layout = chipLayout(contestants.length);
  const tokenSize = Math.min(58, layout.width * 0.26);
  const fliers = contestants.filter(
    (entry) => entry.pick !== null && entry.lockAt !== null && entry.lockAt <= closes,
  );
  return (
    <>
      {contestants.map((entry, index) => {
        const appear = spring(t - (phones + index * 0.09), SPRINGS.pop);
        if (appear <= 0.001) return null;
        const flies = fliers.includes(entry);
        const flyAt = its + fliers.indexOf(entry) * 0.08;
        // The chip empties as its token leaves for the tiles.
        const emptied = flies ? progress(t, flyAt, 0.2) : 0;
        const fade = flies ? progress(t, flyAt + 0.3, 0.3) : 0;
        return (
          <At key={entry.id} x={layout.x(index)} y={CHIPS_Y}>
            <div style={{ transform: `scale(${appear})`, opacity: 1 - fade }}>
              <ContestantChip
                t={t}
                entry={entry}
                width={layout.width}
                tokenSize={tokenSize}
                closes={closes}
                emptied={emptied}
              />
            </div>
          </At>
        );
      })}
      {fliers.map((entry, order) => (
        <FlyingPick
          key={entry.id}
          t={t}
          entry={entry}
          from={{ x: chipLayout(contestants.length).x(contestants.indexOf(entry)) - layout.width / 2 + 12 + tokenSize / 2, y: CHIPS_Y - 20 }}
          at={its + order * 0.08}
          keyAt={keyAt}
          fliers={fliers}
          tokenSize={tokenSize}
        />
      ))}
    </>
  );
}

function ContestantChip({
  t,
  entry,
  width,
  tokenSize,
  closes,
  emptied,
}: {
  t: number;
  entry: Contestant;
  width: number;
  tokenSize: number;
  closes: number;
  emptied: number;
}) {
  const lockAt = entry.lockAt;
  const locksInTime = lockAt !== null && lockAt <= closes;
  const flip = lockAt === null ? 0 : lockAt === -Infinity ? 1 : progress(t, lockAt, 0.36, ease.inOut);
  const back = flip >= 0.5;
  const squash = Math.abs(Math.cos(flip * Math.PI));
  const timedOut = t >= closes && !locksInTime;
  const thinking = Math.floor(t * 3) % 4;
  return (
    <div
      className={`flex h-[116px] flex-col justify-center gap-[6px] rounded-[26px] border-[3px] px-[12px] ${
        back ? "border-teal bg-teal-soft" : "border-edge bg-surface"
      }`}
      style={{
        width,
        transform: `scaleY(${Math.max(0.04, squash)})`,
        opacity: timedOut ? 0.5 : 1,
        boxShadow: back
          ? "0 0 0 5px color-mix(in srgb, var(--teal) 18%, transparent), 0 16px 30px -18px rgba(0,0,0,0.5)"
          : "0 16px 30px -18px rgba(0,0,0,0.5)",
      }}
    >
      <span className="flex min-w-0 items-center gap-[10px]">
        <span style={{ opacity: 1 - emptied, transform: `scale(${1 - emptied * 0.3})` }}>
          <Token name={entry.name} size={tokenSize} ai={entry.ai} />
        </span>
        <span className="min-w-0 truncate font-display text-[30px] font-bold text-ink">{entry.name}</span>
      </span>
      <span
        className={`flex items-center gap-[6px] whitespace-nowrap pl-[4px] text-[28px] font-bold uppercase tracking-[0.06em] ${
          back ? "text-teal" : "text-ink-dim"
        }`}
      >
        {back ? (
          <>
            <CheckMark size={26} />
            Locked
          </>
        ) : timedOut ? (
          "No answer"
        ) : (
          <span className="normal-case tracking-normal">Thinking{".".repeat(thinking)}</span>
        )}
      </span>
    </div>
  );
}

function FlyingPick({
  t,
  entry,
  from,
  at,
  keyAt,
  fliers,
  tokenSize,
}: {
  t: number;
  entry: Contestant;
  from: { x: number; y: number };
  at: number;
  keyAt: number;
  fliers: readonly Contestant[];
  tokenSize: number;
}) {
  if (t < at || entry.pick === null) return null;
  const box = tileBox(entry.pick);
  const sharers = fliers.filter((other) => other.pick === entry.pick);
  const slot = sharers.indexOf(entry);
  const spacing = Math.min(78, 330 / Math.max(1, sharers.length));
  const target = {
    x: box.left + TILE.width - 50 - (sharers.length - 1 - slot) * spacing,
    y: box.top + TILE.height / 2,
  };
  const trip = flight(t, { at, duration: 0.5, from, to: target, lift: 140, easing: ease.inOut });
  const size = mix(tokenSize, 64, trip.progress);
  const land = trip.progress >= 1 ? Math.sin(clamp((t - at - 0.5) / 0.25) * Math.PI) * 0.15 : 0;
  const right = entry.pick === practice.answer;
  const keyed = t >= keyAt;
  const order = sharers.indexOf(entry);
  const tag = keyed && right ? spring(t - (keyAt + 0.25 + order * 0.08), SPRINGS.pop) : 0;
  const eye = keyed && !right ? spring(t - (keyAt + 0.45 + order * 0.08), SPRINGS.pop) : 0;
  const high = spacing < 72 && slot % 2 === 1;
  return (
    <At x={trip.x} y={trip.y} className="z-30">
      <div className="relative" style={{ transform: `scale(${1 + land})` }}>
        <Token name={entry.name} size={size} ai={entry.ai} ring={keyed && !right ? "var(--fail)" : "var(--surface)"} />
        {tag > 0.001 && (
          <span
            className="absolute left-1/2 whitespace-nowrap rounded-full bg-win px-[10px] py-[2px] font-display text-[24px] font-black text-accent-ink"
            style={{
              top: high ? -78 : -44,
              transform: `translateX(-50%) scale(${tag}) rotate(-6deg)`,
            }}
          >
            +100
          </span>
        )}
        {eye > 0.001 && (
          <span className="absolute left-1/2 top-[-42px]" style={{ transform: `translateX(-50%) scale(${eye})` }}>
            <SideEye t={t} at={keyAt + 0.45} />
          </span>
        )}
      </div>
    </At>
  );
}

/** A little pair of unimpressed eyes, glancing at whoever got it wrong. */
function SideEye({ t, at }: { t: number; at: number }) {
  const glance = spring(t - (at + 0.25), SPRINGS.smooth);
  const eye = (side: number) => (
    <span
      key={side}
      className="relative block h-[30px] w-[36px] overflow-hidden rounded-full"
      style={{ background: "#fbf8f1", boxShadow: "0 0 0 2px rgba(0,0,0,0.35)" }}
    >
      <span
        className="absolute top-[11px] size-[15px] rounded-full"
        style={{ left: mix(9, 19, glance), background: "#17122c" }}
      />
      <span className="absolute inset-x-0 top-0 h-[13px]" style={{ background: "var(--edge-strong)" }} />
    </span>
  );
  return <span className="flex gap-[3px]">{[0, 1].map(eye)}</span>;
}
