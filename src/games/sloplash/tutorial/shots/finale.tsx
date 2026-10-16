"use client";

import { Avatar } from "@/room/avatar";
import { useLocalCues, useLocalTime } from "@/tutorial/clock";
import { Burst, Words, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring, type LocalCues } from "@/tutorial/timeline";
import { KIT, RAFI, YOU, type CastMember } from "../content";
import { PixelText, pixelSize } from "../pixel";
import { Crown } from "../parts";

/**
 * Outro: the podium rises (second, third, then you on top), the crown drops,
 * then the wordmark rains back in for the end card.
 */

const WORD = "SLOPLASH";
const WORD_SIZE = pixelSize(WORD, 26, 5);
const BASE_Y = 850;

const PODIUM: { member: CastMember; place: 1 | 2 | 3; x: number; block: number; avatar: number; score: string }[] = [
  { member: RAFI, place: 2, x: 620, block: 175, avatar: 116, score: "2,900" },
  { member: YOU, place: 1, x: 960, block: 250, avatar: 150, score: "4,300" },
  { member: KIT, place: 3, x: 1300, block: 125, avatar: 116, score: "2,600" },
];

export function finaleBeats(b: LocalCues) {
  const most = b.word("outro", "most");
  const grab = b.word("outro", "grab");
  const sloppy = b.word("outro", "sloppy!");
  return {
    most,
    rise: { 3: most + 0.05, 2: most + 0.22, 1: most + 0.5 } as Record<1 | 2 | 3, number>,
    wins: b.word("outro", "wins."),
    grab,
    rainStart: grab + 0.45,
    sloppy,
  };
}

export function FinaleShot() {
  const t = useLocalTime();
  const b = useLocalCues();
  const k = finaleBeats(b);
  const shake = shakeOffset(t, k.sloppy, 16, 0.5);
  const crownShake = shakeOffset(t, k.wins + 0.12, 8, 0.3);
  return (
    <div
      className="absolute inset-0"
      style={{ transform: `translate(${shake.x + crownShake.x}px, ${shake.y + crownShake.y}px)` }}
    >
      <Headline k={k} />
      {/* Confetti fires from behind the winner, so it frames the crown rather than covering it. */}
      <div className="absolute" style={{ left: 960, top: 700 }}>
        <Burst at={k.wins + 0.1} count={36} speed={1250} gravity={1500} size={20} duration={1.7} spread={150} seed={11} />
      </div>
      {PODIUM.map((entry) => (
        <Step key={entry.member.name} entry={entry} k={k} />
      ))}
      <EndCard k={k} />
      <div
        className="pointer-events-none absolute inset-0 bg-punch"
        style={{ opacity: t >= k.sloppy ? (1 - progress(t, k.sloppy, 0.5, ease.out)) * 0.3 : 0 }}
      />
    </div>
  );
}

function sink(t: number, at: number) {
  const local = Math.max(0, t - at);
  return 4800 * local * local;
}

function Headline({ k }: { k: ReturnType<typeof finaleBeats> }) {
  const t = useLocalTime();
  if (t < k.most) return null;
  // Swap once the crown has slammed down, so it never falls through the words.
  const won = t >= k.wins + 0.22;
  const swap = spring(t - k.wins - 0.22, SPRINGS.pop);
  const out = sink(t, k.grab);
  return (
    <div className="absolute inset-x-0 flex justify-center" style={{ top: 168, transform: `translateY(${-out * 0.4}px)`, opacity: 1 - progress(t, k.grab, 0.25) }}>
      {won ? (
        <p
          className="font-display text-[84px] font-black leading-none text-gold-ink"
          style={{ transform: `scale(${mix(0.5, 1, swap)})` }}
        >
          You win!
        </p>
      ) : (
        <p
          className="font-display text-[60px] font-bold leading-none text-ink-dim"
          style={{ opacity: progress(t, k.most, 0.25), transform: `translateY(${(1 - progress(t, k.most, 0.4, ease.out)) * 30}px)` }}
        >
          And the funniest is…
        </p>
      )}
    </div>
  );
}

function Step({ entry, k }: { entry: (typeof PODIUM)[number]; k: ReturnType<typeof finaleBeats> }) {
  const t = useLocalTime();
  const at = k.rise[entry.place];
  if (t < at) return null;
  const grow = spring(t - at, SPRINGS.smooth);
  const land = spring(t - at - 0.18, entry.place === 1 ? SPRINGS.slam : SPRINGS.pop);
  const out = sink(t, k.grab + (entry.place - 1) * 0.06);
  const width = 300;
  const first = entry.place === 1;
  const top = BASE_Y - entry.block;
  return (
    <div className="absolute" style={{ left: entry.x - width / 2, top: 0, width, transform: `translateY(${out}px)` }}>
      <div
        className={`absolute inset-x-0 grid place-items-center rounded-t-[26px] font-display font-black leading-none ${first ? "bg-gold text-accent-ink" : "border-2 border-edge bg-raised text-ink-dim"}`}
        style={{
          top,
          height: entry.block,
          fontSize: first ? 96 : 72,
          transformOrigin: "50% 100%",
          transform: `scaleY(${clamp(grow, 0, 1.1)})`,
        }}
      >
        {entry.place}
      </div>
      <div
        className="absolute inset-x-0 flex flex-col items-center"
        style={{
          top: top - 96,
          opacity: progress(t, at + 0.15, 0.15),
          transform: `translateY(${(1 - land) * 20}px)`,
        }}
      >
        <span className={`font-display font-extrabold leading-none ${first ? "text-[46px] text-punch" : "text-[38px] text-ink"}`}>
          {entry.member.name}
        </span>
        <span className={`mt-[8px] font-mono font-bold leading-none ${first ? "text-[40px] text-gold-ink" : "text-[34px] text-ink"}`}>
          {entry.score}
        </span>
      </div>
      <div
        className="absolute left-1/2"
        style={{
          top: top - 108 - entry.avatar,
          opacity: progress(t, at + 0.18, 0.08),
          transform: `translateX(-50%) translateY(${(1 - land) * (first ? -160 : -40)}px) scale(${first ? 1 : mix(0.85, 1, land)})`,
        }}
      >
        <Avatar name={entry.member.name} modelId={entry.member.modelId} size={`${entry.avatar}px`} />
        {first && (
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: -78 }}>
            <Crown at={k.wins} size={104} tilt={-8} />
          </div>
        )}
      </div>
    </div>
  );
}

/** The wordmark rains back in and locks on "sloppy", over the tagline and the call to action. */
function EndCard({ k }: { k: ReturnType<typeof finaleBeats> }) {
  const t = useLocalTime();
  if (t < k.grab) return null;
  const lockup = spring(t - k.grab - 0.4, SPRINGS.pop);
  const breathe = t > k.sloppy + 0.6 ? 1 + Math.sin((t - k.sloppy) * 2.4) * 0.012 : 1;
  return (
    <>
      <div
        className="absolute"
        style={{
          left: 960 - WORD_SIZE.width / 2,
          top: 330 - WORD_SIZE.height / 2,
          transform: `scale(${0.86 * breathe})`,
        }}
      >
        <PixelText
          text={WORD}
          cell={26}
          gap={5}
          grid={2}
          rain={{ start: k.rainStart, end: k.sloppy - 0.06, drop: 760, speed: 3000, seed: 9 }}
          flashAt={k.sloppy}
          shimmer={k.sloppy + 0.6}
        />
      </div>
      <div className="absolute" style={{ left: 960, top: 360 }}>
        <Burst at={k.sloppy} count={38} speed={1300} gravity={1500} size={20} duration={1.8} seed={21} />
      </div>
      <div className="absolute inset-x-0 text-center" style={{ top: 520 }}>
        <Words
          text="Out-funny the AI."
          at={k.sloppy + 0.35}
          stagger={0.12}
          accent={["AI."]}
          accentClassName="text-ai"
          className="font-display text-[80px] font-black leading-none text-ink"
        />
      </div>
      <div
        className="absolute left-1/2 flex items-center gap-[20px] rounded-full border-[4px] border-punch bg-surface py-[16px] pl-[30px] pr-[40px] shadow-[0_24px_50px_-26px_rgba(0,0,0,0.6)]"
        style={{
          top: 690,
          opacity: clamp(lockup * 3),
          transform: `translateX(-50%) scale(${mix(0.4, 1, lockup)}) rotate(${mix(-8, -2, lockup)}deg)`,
        }}
      >
        <PhoneGlyph />
        <span className="font-display text-[50px] font-black leading-none text-ink">Grab your phones</span>
      </div>
    </>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[54px] text-punch" fill="none" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="3" stroke="currentColor" strokeWidth="2.4" />
      <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
