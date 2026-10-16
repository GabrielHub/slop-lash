"use client";

import { useCues, useTime } from "@/tutorial/clock";
import { Burst, STAMP_IMPACT, TypeOn, flight, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { COPY, UNMATCHED, endingOf, heartDelta } from "../../ui/copy";
import { MATCH, REACTIONS, REPLY, TEXTS, WINNER, type Reaction } from "../data";
import { Sticker } from "../friend";
import { C, alpha, fin, fout, sp, stepped, tf } from "../fx";
import { Dots, HerBubble, MatchFace, Meter, MsStamp, OurBubble, Tapback, type MsTone } from "../parts";

const METER = { left: 260, top: 520, width: 1400 };
/** The heart marker's centre for `mood`. */
const markerAt = (mood: number) => ({ x: METER.left + (METER.width * mood) / 100, y: METER.top + 110 });

/** The legend: each reaction with its heart delta, in a row. */
const LEGEND_Y = 318;
/** Legend chips share one width, so a fixed pitch gives one even gap between them. */
const CHIP_W = 236;
const CHIP_GAP = 24;
const legendX = (index: number) => 960 + (index - 2.5) * (CHIP_W + CHIP_GAP);

const MOOD_SPRING = { stiffness: 190, damping: 21, mass: 1 };
const FLY = 0.5;

function toneOf(reaction: Reaction): MsTone {
  return reaction.tone;
}

const TONE_TEXT: Record<MsTone, string> = {
  punch: "text-punch",
  win: "text-win",
  fail: "text-fail",
  ink: "text-ink",
  gold: "text-gold",
};

/** A "♥ +15" chip in its tone. */
function DeltaChip({ reaction, size = 40 }: { reaction: Reaction; size?: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-[0.3em] whitespace-nowrap rounded-full border-[3px] bg-surface py-[0.18em] font-mono font-bold leading-none ${TONE_TEXT[toneOf(reaction)]}`}
      style={{ fontSize: size, width: CHIP_W, borderColor: "currentColor" }}
    >
      <span className="text-[1.15em] leading-none">{reaction.emoji}</span>
      {heartDelta(reaction.delta)}
    </span>
  );
}

/**
 * REACT, METER, DATE and UNMATCH: the sent line, their reply and the six
 * reactions slammed on the host's words; then the heart meter, a surge to the
 * date line, a drain to the unmatch line, and one last shot that wins them back.
 */
export function MoodShot() {
  const t = useTime();
  const cues = useCues();
  const reactAt = cues.at("react");
  const reads = cues.word("react", "reads");
  const and = cues.word("react", "and");
  const words = REACTIONS.map((reaction) => cues.word("react", reaction.id));
  const meterAt = cues.at("meter");
  const reaction = cues.word("meter", "reaction");
  const moves = cues.word("meter", "moves");
  const their = cues.word("meter", "their");
  const moodW = cues.word("meter", "mood");
  const gasp = cues.word("react", "or") - 0.55;
  const eighty = cues.word("date", "eighty");
  const dateW = cues.word("date", "date");
  const unmatchAt = cues.at("unmatch");
  const twenty = cues.word("unmatch", "twenty");
  const they = cues.word("unmatch", "they");
  const unmatchW = cues.word("unmatch", "unmatch");
  const unless = cues.word("unmatch", "unless");
  const wins = cues.word("unmatch", "wins");

  // Chips fly from the legend (or the comeback stamp) into the heart.
  const great = REACTIONS[0];
  const dealbreaker = REACTIONS[5];
  const comebackStamp = { x: 1330, y: 468 };
  const flights = [
    { reaction: great, from: { x: legendX(0), y: LEGEND_Y }, at: moodW - 0.08, to: 65 },
    { reaction: great, from: { x: legendX(0), y: LEGEND_Y }, at: eighty - FLY + 0.04, to: 80 },
    ...[0, 1, 2].map((index) => ({
      reaction: dealbreaker,
      from: { x: legendX(5), y: LEGEND_Y },
      at: twenty + 0.12 - FLY - (2 - index) * 0.24,
      to: 60 - index * 20,
    })),
    { reaction: great, from: comebackStamp, at: wins + 0.12, to: 80 },
  ];
  const lands = flights.map((entry) => entry.at + FLY);
  const mood = stepped(
    t,
    50,
    flights.map((entry, index) => ({ at: lands[index], to: entry.to })),
    MOOD_SPRING,
  );
  let previous = 50;
  const targets = flights.map((entry) => {
    const from = previous;
    previous = entry.to;
    return from;
  });

  // Overlays: mint at the date, cold at the unmatch, a red flash for the dealbreaker.
  const dated = fin(t, lands[1], 0.4) * fout(t, unmatchAt + 0.1, 0.5);
  const cold = fin(t, lands[4], 0.5) * fout(t, lands[5], 0.5);
  const rescued = fin(t, lands[5], 0.4);
  const dealImpact = words[5] + 0.02;
  const flash = fin(t, dealImpact, 0.06) * fout(t, dealImpact + 0.12, 0.6);
  const shake = shakeOffset(t, dealImpact, 26, 0.6);
  // The gasp: everything leans in and holds its breath until the dealbreaker lands.
  const held = fin(t, gasp, 0.22, ease.out) * fout(t, dealImpact, 0.35, ease.out);
  // The vibe check: a screenshot snapped in, with a flash.
  const snapAt = moves - 0.2;
  const snap = sp(t, snapAt, SPRINGS.smooth);
  const camFlash = fin(t, snapAt, 0.04) * fout(t, snapAt + 0.05, 0.35);
  const dateShake = shakeOffset(t, dateW + 0.05, 12, 0.35);
  const unmatchShake = shakeOffset(t, unmatchW + 0.08, 18, 0.45);

  // The thread leaves as the meter arrives.
  const threadOut = progress(t, meterAt - 0.2, 0.4, ease.in);
  const stampsOut = progress(t, meterAt - 0.15, 0.4, ease.in);
  const legendOut = progress(t, unless - 0.1, 0.3, ease.in);
  const current = words.findLastIndex((word) => t >= word - 0.06);

  const sentIn = sp(t, reactAt - 0.15, SPRINGS.smooth);
  const typing = t >= reads - 0.1 && t < and;
  const replyIn = sp(t, and, SPRINGS.pop);

  const drawn = progress(t, moves - 0.12, 0.6, ease.emphasized);
  const linePop = (at: number) => sp(t, at, SPRINGS.pop);
  const pulse = (at: number) => {
    const local = t - at;
    return local < 0 || local > 0.6 ? 0 : Math.sin((local / 0.6) * Math.PI);
  };

  return (
    <div className="absolute inset-0">
      {/* Mood light. */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            opacity: Math.max(dated, rescued),
            background: `radial-gradient(60% 70% at 50% 58%, ${alpha(C.mint, 22)}, transparent 72%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: cold,
            background: `radial-gradient(65% 70% at 50% 60%, ${alpha(C.violet, 14)}, transparent 70%), linear-gradient(${alpha(C.bg, 55)}, ${alpha(C.bg, 55)})`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            opacity: flash,
            background: `radial-gradient(70% 70% at 50% 50%, transparent 25%, ${alpha(C.red, 50)} 100%)`,
          }}
        />
      </div>

      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${shake.x + dateShake.x + unmatchShake.x}px, ${shake.y + dateShake.y + unmatchShake.y}px) scale(${1 + held * 0.035})`,
          transformOrigin: "960px 700px",
        }}
      >
        {/* The chat: our sent line, their typing, their reply. */}
        {threadOut < 1 && (
          <div
            className="absolute inset-0"
            style={{ opacity: 1 - threadOut, transform: `translateY(${-threadOut * 90}px)` }}
          >
            <div
              className="absolute left-[420px] top-[150px] flex items-center gap-[20px]"
              style={{ opacity: fin(t, reactAt, 0.3) }}
            >
              <MatchFace size={84} />
              <p className="font-display text-[46px] font-black text-ink">{MATCH.name}</p>
            </div>
            <div
              className="absolute right-[420px] top-[272px] flex max-w-[760px] justify-end"
              style={{
                opacity: fin(t, reactAt - 0.15, 0.15),
                transform: tf(mix(320, 0, sentIn), mix(220, 0, sentIn), mix(0.7, 1, sentIn)),
              }}
            >
              <OurBubble size={42}>
                {TEXTS[WINNER].text}
                {current >= 0 && (
                  <span className="absolute -left-[60px] -top-[52px]">
                    <Tapback
                      emoji={REACTIONS[current].emoji}
                      size={84}
                      pop={mix(1.5, 1, spring(t - words[current], SPRINGS.pop))}
                    />
                  </span>
                )}
              </OurBubble>
            </div>
            <div className="absolute left-[420px] top-[470px]">
              {typing && (
                <HerBubble className="py-[30px]" style={{ transform: `scale(${sp(t, reads - 0.1, SPRINGS.pop)})`, transformOrigin: "bottom left" }}>
                  <Dots size={18} />
                </HerBubble>
              )}
              {t >= and && (
                <HerBubble
                  size={42}
                  style={{ transform: `scale(${mix(0.7, 1, replyIn)})`, transformOrigin: "bottom left" }}
                >
                  <TypeOn text={REPLY} at={and} cps={42} />
                </HerBubble>
              )}
            </div>
          </div>
        )}

        {/* The six reactions, each slammed on its word. */}
        {stampsOut < 1 && (
          <div className="absolute inset-x-0 top-[600px] flex flex-col items-center gap-[30px]">
            {[REACTIONS.slice(0, 3), REACTIONS.slice(3)].map((row, rowIndex) => (
              <div key={rowIndex} className="flex items-center justify-center gap-[34px]">
                {row.map((entry, column) => {
                  const index = rowIndex * 3 + column;
                  const heavy = entry.id === "dealbreaker";
                  const leave = progress(t, meterAt - 0.15 + index * 0.04, 0.35, ease.in);
                  return (
                    <div
                      key={entry.id}
                      style={{
                        opacity: 1 - leave,
                        transform: tf(0, -leave * 120, 1 - leave * 0.3),
                      }}
                    >
                      <MsStamp
                        text={`${entry.emoji} ${entry.word}`}
                        at={words[index] - STAMP_IMPACT + 0.02}
                        tone={toneOf(entry)}
                        tilt={[-7, 4, -3, 5, -5, -9][index]}
                        size={heavy ? 56 : 46}
                        heavy={heavy}
                        reserve
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* The legend: each reaction's heart delta. */}
        {t >= reaction - 0.2 && legendOut < 1 &&
          REACTIONS.map((entry, index) => {
            const at = reaction - 0.1 + index * 0.07;
            const pop = sp(t, at, SPRINGS.pop);
            const fired = flights.findIndex(
              (fly) => fly.reaction === entry && fly.from.y === LEGEND_Y && t >= fly.at && t < fly.at + 0.25,
            );
            return (
              <div
                key={entry.id}
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  transform: tf(legendX(index), LEGEND_Y - legendOut * 60, clamp(pop) * (fired >= 0 ? 1.08 : 1)),
                  opacity: fin(t, at, 0.12) * (1 - legendOut),
                }}
              >
                <div className="-translate-x-1/2 -translate-y-1/2">
                  <DeltaChip reaction={entry} size={40} />
                </div>
              </div>
            );
          })}

        {/* The heart meter, in the vibe-check screenshot she snaps in. */}
        {t >= snapAt && (
          <div
            className="absolute inset-0"
            style={{
              transform: `rotate(${mix(-5, 0, snap)}deg) scale(${mix(1.14, 1, snap)})`,
              transformOrigin: "960px 630px",
              opacity: fin(t, snapAt, 0.12),
            }}
          >
            <div
              className="absolute rounded-[44px] border-2 border-edge"
              style={{
                left: METER.left - 70,
                top: METER.top - 66,
                width: METER.width + 140,
                height: 350,
                background: "color-mix(in srgb, var(--surface) 82%, transparent)",
                boxShadow: "0 50px 90px -50px rgba(0,0,0,0.7)",
              }}
            />
            <div className="absolute" style={{ left: METER.left - 96, top: METER.top - 108 }}>
              <Sticker at={snapAt + 0.2} tilt={-7} size={40} tone={C.violet}>
                Vibe check 📸
              </Sticker>
            </div>
          </div>
        )}
        {t >= snapAt && (
          <div
            className="absolute"
            style={{
              left: METER.left,
              top: METER.top,
              transform: `rotate(${mix(-5, 0, snap)}deg) scale(${mix(1.14, 1, snap)})`,
              transformOrigin: `${960 - METER.left}px ${110}px`,
              opacity: fin(t, snapAt, 0.12),
            }}
          >
            <Meter
              mood={mood}
              width={METER.width}
              drawn={drawn}
              lines={[linePop(moves + 0.2), linePop(moves + 0.34)]}
              marker={sp(t, their - 0.1, SPRINGS.pop)}
              pulse={[pulse(lands[4]) + pulse(unmatchW), pulse(lands[1]) + pulse(lands[5])]}
              glow={Math.max(dated, rescued) * 0.8}
            />
          </div>
        )}

        {/* "It's a date". */}
        <div className="absolute left-[960px] top-[450px]">
          <div className="-translate-x-1/2 -translate-y-1/2">
            <MsStamp text={endingOf("DATE").text} at={dateW - STAMP_IMPACT + 0.03} tone="win" size={84} peel={unmatchAt + 0.05} />
          </div>
        </div>

        {/* "Unmatched" hovers, slams, then steps aside for one last shot and peels off. */}
        <UnmatchStamp they={they} slam={unmatchW - STAMP_IMPACT + 0.08} unless={unless} peel={lands[5] - 0.05} />

        {/* One last shot. */}
        <LastShotBand at={unless + 0.05} />
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: tf(comebackStamp.x, comebackStamp.y) }}>
          <div className="-translate-x-1/2 -translate-y-1/2">
            <MsStamp text={`${great.emoji} ${great.word}`} at={wins - STAMP_IMPACT + 0.03} tone="win" size={60} tilt={-6} />
          </div>
        </div>

        {/* The gasp. */}
        <div className="absolute left-[1560px] top-[540px]">
          <Sticker at={gasp} out={meterAt - 0.2} tilt={10} size={84}>
            😱
          </Sticker>
        </div>

        {/* The chips in flight. */}
        {flights.map((entry, index) => {
          if (t < entry.at || t > lands[index] + 0.3) return null;
          const target = markerAt(targets[index]);
          const path = flight(t, {
            at: entry.at,
            duration: FLY,
            from: entry.from,
            to: { x: target.x, y: target.y - 20 },
            lift: 140,
            easing: ease.inOut,
          });
          const landed = progress(t, lands[index], 0.3, ease.out);
          return (
            <div
              key={index}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: tf(path.x, path.y, mix(1.1, 0.75, path.progress) * (1 + landed * 0.6)),
                opacity: 1 - landed,
              }}
            >
              <div className="-translate-x-1/2 -translate-y-1/2">
                <DeltaChip reaction={entry.reaction} size={40} />
              </div>
            </div>
          );
        })}

        {/* Hearts for the date and the rescue. */}
        <div className="absolute left-[960px] top-[450px]">
          <Burst at={dateW + 0.05} count={32} shape="heart" size={42} speed={980} colors={[C.mint, C.rose, C.coral]} seed={11} />
        </div>
        <div className="absolute" style={{ left: markerAt(80).x, top: markerAt(80).y - 40 }}>
          <Burst at={lands[5]} count={22} shape="heart" size={36} speed={900} colors={[C.mint, C.rose]} seed={21} />
        </div>
      </div>
      {camFlash > 0.01 && (
        <div className="pointer-events-none absolute inset-0" style={{ opacity: camFlash * 0.75, background: "#fff" }} />
      )}
    </div>
  );
}

/** "Unmatched": a threat hovering on "they", a slam on "unmatch", then it steps aside on "unless". */
function UnmatchStamp({ they, slam, unless, peel }: { they: number; slam: number; unless: number; peel: number }) {
  const t = useTime();
  if (t < they - 0.1 || t > peel + 0.7) return null;
  const hover = fin(t, they - 0.1, 0.3) * (t < slam ? 1 : 0);
  const aside = sp(t, unless, SPRINGS.smooth);
  const jolt = t >= unless && t < unless + 0.12 ? 1 : 0;
  return (
    <div
      className="absolute left-0 top-0 origin-top-left"
      style={{ transform: tf(mix(960, 730, aside), mix(450, 468, aside), mix(1, 0.62, aside), jolt * 5) }}
    >
      {hover > 0 && (
        <div
          className="absolute left-0 top-0"
          style={{ opacity: hover * 0.35, transform: `translate(-50%, -50%) scale(${1.6 + Math.sin(t * 9) * 0.03}) rotate(-14deg)` }}
        >
          <span className="block whitespace-nowrap rounded-[0.2em] border-[0.14em] border-fail px-[0.8em] py-[0.4em] font-display text-[84px] font-black uppercase leading-none tracking-[0.1em] text-fail">
            {UNMATCHED.text}
          </span>
        </div>
      )}
      <div className="-translate-x-1/2 -translate-y-1/2">
        <MsStamp text={UNMATCHED.text} at={slam} tone="fail" size={84} heavy peel={peel} />
      </div>
    </div>
  );
}

/** The comeback title card: a rose band sweeping across with "One last shot". */
function LastShotBand({ at }: { at: number }) {
  const t = useTime();
  if (t < at) return null;
  const sweep = progress(t, at, 0.45, ease.outExpo);
  const text = sp(t, at + 0.12, SPRINGS.pop);
  return (
    <div
      className="absolute inset-x-0 top-[150px] h-[204px] bg-punch"
      style={{
        transform: `translateX(${(sweep - 1) * 2100}px) skewY(-2deg)`,
        boxShadow: `0 0 80px ${alpha(C.rose, 50)}`,
      }}
    >
      <div
        className="flex h-full flex-col items-center justify-center text-accent-ink"
        style={{ transform: `scale(${mix(0.85, 1, text)})`, opacity: clamp(text * 2) }}
      >
        <p className="font-sans text-[34px] font-bold">{COPY.comebackKicker(MATCH.name)}</p>
        <p className="font-display text-[110px] font-black uppercase leading-[0.95] tracking-[0.02em]">
          {COPY.oneLastShot}
        </p>
      </div>
    </div>
  );
}
