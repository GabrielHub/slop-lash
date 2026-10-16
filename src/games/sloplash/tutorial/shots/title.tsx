"use client";

import { useLocalTime } from "@/tutorial/clock";
import { Camera, STAMP_IMPACT, Words, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring, springTo } from "@/tutorial/timeline";
import { useBeats, type Beats } from "../beats";
import { BOT, HUMANS, type CastMember } from "../content";
import { PixelText, pixelSize } from "../pixel";
import { RubberStamp, Token } from "../parts";

/**
 * Sting, intro and robots: the wordmark rains in pixel by pixel and locks with
 * a flash; the table fills (five friends, one AI); the camera finds the AI
 * and a stamp tells you what to do about it.
 */

const WORD = "SLOPLASH";
const CELL = 26;
const GAP = 5;
const WORD_SIZE = pixelSize(WORD, CELL, GAP);

const ROW_Y = 650;
const TOKEN = 150;
const HUMAN_X = [380, 570, 760, 950, 1140] as const;
const BOT_X = 1530;
const VS_X = 1335;

/** When the sting's rain lands and locks, from the intro line's start. */
export function stingBeats(b: Beats) {
  const intro = b.at("intro");
  const lock = Math.max(1.1, intro - 0.8);
  return { rainStart: Math.min(0.3, lock * 0.2), rainEnd: lock - 0.08, lock, intro };
}

export function TitleShot() {
  const t = useLocalTime();
  const b = useBeats(0);
  const { rainStart, rainEnd, lock } = stingBeats(b);

  // The wordmark: centre stage for the sting, then up and smaller for the intro.
  const rise = spring(t - b.word("intro", "the") + 0.1, SPRINGS.gentle);
  const wordY = mix(470, 214, rise);
  const wordScale = mix(1, 0.6, rise);
  const nameBeat = b.word("intro", "SlopLash!");
  const bump = t >= nameBeat ? Math.exp(-(t - nameBeat) * 7) * Math.sin((t - nameBeat) * 26) : 0;
  const shake = shakeOffset(t, lock, 12, 0.45);

  // Robots: push in on the AI, pull back for the stamp.
  const robots = b.at("robots");
  const found = b.word("robots", "robots.");
  const laugh = b.wordEnd("robots", "robots.") + 0.05;
  const dont = b.word("robots", "don't");
  const win = b.word("robots", "win.");
  const stampAt = win - STAMP_IMPACT;
  const stampShake = shakeOffset(t, stampAt + STAMP_IMPACT, 16, 0.45);

  return (
    <div className="absolute inset-0">
      <div
        className="pointer-events-none absolute left-1/2 top-[470px] h-[760px] w-[1800px] -translate-x-1/2 -translate-y-1/2"
        style={{
          opacity: (0.4 + flashGlow(t, lock) * 0.6) * (1 - rise * 0.6),
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--punch) 26%, transparent), transparent)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${shake.x + stampShake.x}px, ${shake.y + stampShake.y}px)` }}
      >
        <Camera
          keys={[
            { at: 0, x: 960, y: 540, zoom: 1 },
            { at: robots - 0.1, x: 960, y: 540, zoom: 1 },
            { at: found + 0.1, x: BOT_X - 20, y: ROW_Y + 72, zoom: 2 },
            { at: laugh, x: BOT_X - 10, y: ROW_Y + 72, zoom: 2.06 },
            // Pull back low, so the wordmark's wall stays under the cue sign.
            { at: laugh + 0.5, x: 1020, y: 516, zoom: 1.08 },
            { at: dont + 0.2, x: 1040, y: 516, zoom: 1.08 },
            { at: b.end("robots") + 0.8, x: 1020, y: 520, zoom: 1.05 },
          ]}
        >
          <div
            className="absolute"
            style={{
              left: 960 - WORD_SIZE.width / 2,
              top: wordY - WORD_SIZE.height / 2,
              transform: `scale(${wordScale * (1 + bump * 0.06)})`,
            }}
          >
            <PixelText
              text={WORD}
              cell={CELL}
              gap={GAP}
              grid={2}
              rain={{ start: rainStart, end: rainEnd, drop: 980, speed: 2900, seed: 4 }}
              flashAt={lock}
              shimmer={lock + 0.5}
            />
          </div>
          <Tagline b={b} />
          <Table b={b} />
          <Brackets b={b} />
          <div className="absolute" style={{ left: BOT_X, top: ROW_Y - 10 }}>
            <div className="-translate-x-1/2 -translate-y-1/2">
              <RubberStamp at={stampAt} tone="punch" size={66}>
                Don&apos;t let
                <br />
                them win
              </RubberStamp>
            </div>
          </div>
          <Laughs at={laugh} />
        </Camera>
      </div>
      {/* The lock's flash: a punch-red pop over everything. */}
      <div
        className="pointer-events-none absolute inset-0 bg-punch"
        style={{ opacity: t >= lock ? (1 - progress(t, lock, 0.5, ease.out)) * 0.32 : 0 }}
      />
    </div>
  );
}

/** The lock's flash, decaying. */
function flashGlow(t: number, lock: number): number {
  return t >= lock ? Math.exp(-(t - lock) * 3) : 0;
}

/** "Out-funny the AI." on the intro's words, "AI" in the AI's purple. */
function Tagline({ b }: { b: Beats }) {
  const start = b.word("intro", "out-funny");
  const last = b.word("intro", "AI.");
  return (
    <div className="absolute left-0 right-0 text-center" style={{ top: 334 }}>
      <Words
        text="Out-funny the AI."
        at={start}
        stagger={Math.max(0.08, (last - start) / 2)}
        accent={["AI."]}
        accentClassName="text-ai"
        className="font-display text-[100px] font-black leading-none tracking-[-0.01em] text-ink"
      />
    </div>
  );
}

/** The table: you, four friends, a VS, and the AI. */
function Table({ b }: { b: Beats }) {
  const t = useLocalTime();
  const you = b.word("intro", "you");
  const friends = b.word("intro", "friends");
  const bot = b.word("intro", "AI.");
  const laugh = b.wordEnd("robots", "robots.") + 0.05;
  return (
    <>
      {HUMANS.map((member, index) => {
        const at = index === 0 ? you : friends + (index - 1) * 0.08;
        const pop = spring(t - at, SPRINGS.pop);
        if (t < at) return null;
        const hop = laughHop(t, laugh + index * 0.07);
        return (
          <TokenAt key={member.name} x={HUMAN_X[index]!} y={ROW_Y}>
            <div
              style={{
                opacity: progress(t, at, 0.12),
                transform: `translateY(${(1 - pop) * 60 + hop.y}px) scale(${mix(0.3, 1, pop)}) rotate(${hop.r}deg)`,
              }}
            >
              <Token member={member} you={index === 0} size={TOKEN} />
            </div>
          </TokenAt>
        );
      })}
      <TokenAt x={VS_X} y={ROW_Y - 26}>
        <div
          className="grid size-[96px] place-items-center rounded-full border-[3px] border-edge-strong bg-vs font-display text-[40px] font-black text-ink"
          style={{
            opacity: progress(t, bot - 0.12, 0.1),
            transform: `scale(${springTo(t, bot - 0.12, 0.4, 1, SPRINGS.pop)})`,
          }}
        >
          VS
        </div>
      </TokenAt>
      {t >= bot && (
        <TokenAt x={BOT_X} y={ROW_Y}>
          <GlitchToken member={BOT} at={bot} b={b} />
        </TokenAt>
      )}
    </>
  );
}

function TokenAt({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      <div className="absolute left-0 top-0 -translate-x-1/2" style={{ top: -TOKEN / 2 }}>
        {children}
      </div>
    </div>
  );
}

/** A laugh: a few quick hops and a wiggle. */
function laughHop(t: number, at: number) {
  const local = t - at;
  if (local < 0 || local > 1.1) return { y: 0, r: 0 };
  const decay = 1 - local / 1.1;
  return {
    y: -Math.abs(Math.sin(local * Math.PI * 4.2)) * 30 * decay,
    r: Math.sin(local * Math.PI * 4.2) * 6 * decay,
  };
}

/** How hard the AI token glitches at `t`: bursts on its beats, and the odd tick while watched. */
function glitchAt(t: number, b: Beats): number {
  const bursts = [b.word("intro", "AI."), b.word("robots", "robots."), b.word("robots", "might")];
  let amount = 0;
  for (const at of bursts) {
    const local = t - at;
    if (local >= 0 && local < 0.42) amount = Math.max(amount, 1 - local / 0.42);
  }
  const watched = t > b.at("robots") && t < b.word("robots", "win.") + 0.2;
  const frame = Math.floor(t * 18);
  if (watched && hash01(frame * 3.1) > 0.82) amount = Math.max(amount, 0.55);
  return amount;
}

/** The AI's token: it arrives glitching and keeps flickering while the camera watches it. */
function GlitchToken({ member, at, b }: { member: CastMember; at: number; b: Beats }) {
  const t = useLocalTime();
  const pop = spring(t - at, SPRINGS.pop);
  const glitch = glitchAt(t, b);
  const frame = Math.floor(t * 24);
  const jitter = (seed: number) => (hash01(frame * 7.3 + seed) - 0.5) * 2;
  const split = glitch * 16;
  const watching = t > b.at("robots") && t < b.end("robots") + 0.6;
  const pulse = watching ? 1 + Math.max(0, Math.sin((t - b.at("robots")) * 7)) * 0.08 : 1;
  const token = <Token member={member} size={TOKEN} />;
  return (
    <div
      className="relative"
      style={{
        opacity: progress(t, at, 0.1),
        transform: `scale(${mix(0.3, 1, pop) * pulse}) translateX(${jitter(1) * glitch * 10}px)`,
      }}
    >
      {glitch > 0.02 && (
        <>
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${-split + jitter(2) * 4}px, ${jitter(3) * 3}px)`,
              opacity: 0.75,
            }}
          >
            <Ghost tone="var(--punch)" />
          </div>
          <div
            className="absolute inset-0"
            style={{ transform: `translate(${split + jitter(4) * 4}px, ${jitter(5) * 3}px)`, opacity: 0.75 }}
          >
            <Ghost tone="var(--teal)" />
          </div>
        </>
      )}
      <div className="relative">{token}</div>
      {glitch > 0.02 &&
        [0, 1].map((slice) => {
          const top = clamp(hash01(frame * 1.7 + slice * 9) * 0.8);
          const height = 0.08 + hash01(frame * 2.9 + slice) * 0.14;
          return (
            <div
              key={slice}
              className="absolute inset-0"
              style={{
                clipPath: `inset(${top * 100}% 0 ${Math.max(0, (1 - top - height) * 100)}% 0)`,
                transform: `translateX(${jitter(10 + slice) * glitch * 34}px)`,
              }}
            >
              {token}
            </div>
          );
        })}
    </div>
  );
}

/** A flat coloured copy of the token's disc, for the RGB split. */
function Ghost({ tone }: { tone: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-full" style={{ width: TOKEN, height: TOKEN, border: `9px solid ${tone}` }} />
    </div>
  );
}

/** Corner brackets that close in on the AI while the camera pushes in: target found. */
function Brackets({ b }: { b: Beats }) {
  const t = useLocalTime();
  const start = b.at("robots") + 0.5;
  const found = b.word("robots", "robots.");
  const leave = b.word("robots", "don't");
  if (t < start || t > leave + 0.3) return null;
  const close = progress(t, start, Math.max(0.3, found - start), ease.inOut);
  const snap = spring(t - found, SPRINGS.slam);
  const reach = mix(220, 136, close) + (t >= found ? (1 - snap) * 14 : 0);
  const opacity = progress(t, start, 0.2) * (1 - progress(t, leave, 0.3));
  const corners = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ];
  return (
    <div className="absolute" style={{ left: BOT_X, top: ROW_Y + 12, opacity }}>
      {corners.map((corner) => (
        <div
          key={`${corner.x}${corner.y}`}
          className="absolute size-[34px] border-punch"
          style={{
            left: corner.x * reach - 17,
            top: corner.y * reach * 0.86 - 17,
            borderTopWidth: corner.y < 0 ? 6 : 0,
            borderBottomWidth: corner.y > 0 ? 6 : 0,
            borderLeftWidth: corner.x < 0 ? 6 : 0,
            borderRightWidth: corner.x > 0 ? 6 : 0,
            borderStyle: "solid",
          }}
        />
      ))}
    </div>
  );
}

/** "HA!" pops over the humans as the host laughs. */
function Laughs({ at }: { at: number }) {
  const t = useLocalTime();
  const bits = [
    { x: HUMAN_X[0] + 40, y: ROW_Y - 130, delay: 0, tone: "text-gold", rotate: -10 },
    { x: HUMAN_X[2], y: ROW_Y - 150, delay: 0.12, tone: "text-teal", rotate: 8 },
    { x: HUMAN_X[4] - 30, y: ROW_Y - 130, delay: 0.22, tone: "text-punch", rotate: -6 },
  ];
  return (
    <>
      {bits.map((bit) => {
        const start = at + bit.delay;
        const local = t - start;
        if (local < 0 || local > 1.1) return null;
        const pop = spring(local, SPRINGS.pop);
        const fade = 1 - progress(local, 0.7, 0.4);
        return (
          <div
            key={bit.x}
            className={`absolute font-display text-[64px] font-black leading-none ${bit.tone}`}
            style={{
              left: bit.x,
              top: bit.y,
              opacity: fade * clamp(local / 0.08),
              transform: `translate(-50%, -50%) translateY(${-local * 60}px) rotate(${bit.rotate}deg) scale(${mix(0.2, 1, pop)})`,
            }}
          >
            HA!
          </div>
        );
      })}
    </>
  );
}
