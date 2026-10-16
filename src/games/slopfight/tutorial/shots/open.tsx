"use client";

import type { ReactNode } from "react";
import { Sequence, useCues } from "@/tutorial/clock";
import { Burst, Shake, TypeOn } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring, springTo, wobble } from "@/tutorial/timeline";
import { FREDOKA, INK, NIGHT, SLAM_IMPACT, Slam, Spotlight, TOY, jiggle, useBeat } from "../look";
import { Glove, Toy, TrophyShape, type Mood, type ToyKind } from "../toys";

// The promo's cold open. "Tonight. Live from this living room. Four
// champions. One trophy. Ladies and gentlemen... this is SlopFight." Hard
// cuts on the words: the gloves touch, TONIGHT, a living room with a ring
// on the coffee table, four silhouettes lit one by one, the trophy, the
// ring mic, then the fight-night poster.

/** The silhouetted crowd along the bottom, rim-lit by the spot. */
export function Crowd({ t, cheer = 0, rim = 1 }: { t: number; cheer?: number; rim?: number }) {
  const rows = [
    { y: 884, count: 15, r: [60, 76], seed: 1 },
    { y: 950, count: 11, r: [76, 94], seed: 2 },
  ];
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
      {rows.map((row) =>
        Array.from({ length: row.count }, (_, index) => {
          const jitter = hash01(row.seed * 31 + index * 7.3);
          const x = ((index + 0.5 + (jitter - 0.5) * 0.5) / row.count) * 1920;
          const r = mix(row.r[0], row.r[1], hash01(row.seed * 13 + index * 3.1));
          const bob = wobble(t * 1.6, index + row.seed * 9) * 5 - cheer * (14 + jitter * 22) * Math.abs(Math.sin(t * 7 + index));
          const y = row.y + bob;
          return (
            <g key={`${row.seed}-${index}`}>
              <path
                d={`M ${x - r * 1.7} ${y + r * 2.4} C ${x - r * 1.6} ${y + r * 0.9} ${x - r * 1.1} ${y + r * 0.7} ${x} ${y + r * 0.7} C ${x + r * 1.1} ${y + r * 0.7} ${x + r * 1.6} ${y + r * 0.9} ${x + r * 1.7} ${y + r * 2.4} Z`}
                fill="var(--sft-crowd)"
              />
              <circle cx={x} cy={y} r={r * 0.62} fill="var(--sft-crowd)" />
              <path
                d={`M ${x - r * 0.5} ${y - r * 0.36} A ${r * 0.62} ${r * 0.62} 0 0 1 ${x + r * 0.5} ${y - r * 0.36}`}
                fill="none"
                stroke="var(--sf-tangerine)"
                strokeOpacity={0.55 * rim}
                strokeWidth={4}
                strokeLinecap="round"
              />
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** Camera flashes popping over the crowd at `times`. */
export function Flashes({ t, times, seed = 4 }: { t: number; times: readonly number[]; seed?: number }) {
  return (
    <>
      {times.map((at, index) => {
        const life = (t - at) / 0.32;
        if (life < 0 || life > 1) return null;
        const x = 140 + hash01(seed * 17 + index * 5.1) * 1640;
        const y = 730 + hash01(seed * 7 + index * 2.3) * 130;
        const pop = Math.sin(Math.min(1, life * 2.2) * Math.PI * 0.5) * (1 - life);
        const size = 140 + hash01(index * 3.7 + seed) * 100;
        return (
          <div
            key={index}
            className="pointer-events-none absolute"
            style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: clamp(pop * 1.4) }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(closest-side, rgba(255,250,236,0.95), rgba(255,214,150,0.35) 45%, transparent)" }}
            />
            <svg viewBox="-50 -50 100 100" className="absolute inset-0" style={{ transform: `scale(${0.6 + pop * 0.7}) rotate(${index * 23}deg)` }}>
              <path d="M 0 -48 L 7 -7 L 48 0 L 7 7 L 0 48 L -7 7 L -48 0 L -7 -7 Z" fill="#FFFBEF" stroke={TOY.butter.hex} strokeWidth={3} />
            </svg>
          </div>
        );
      })}
    </>
  );
}

/** The ring announcer's microphone hanging grille-down on its cable. */
function Mic({ x, y, swing }: { x: number; y: number; swing: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
      <g transform={`rotate(${swing} ${x} -240)`}>
        <path d={`M ${x} -1400 L ${x} ${y - 70}`} stroke={INK} strokeWidth={12} strokeLinecap="round" />
        <path d={`M ${x} -1400 L ${x} ${y - 70}`} stroke="#4A4650" strokeWidth={6} strokeLinecap="round" />
        <g transform={`translate(${x} ${y}) scale(1.3)`}>
          <rect x={-26} y={-80} width={52} height={150} rx={20} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={7} />
          <rect x={-16} y={-70} width={10} height={124} rx={5} fill="#ffffff" opacity={0.18} />
          <rect x={-34} y={56} width={68} height={26} rx={10} fill={TOY.tangerine.hex} stroke={INK} strokeWidth={6} />
          <circle cx={0} cy={140} r={66} fill="#C9C6CF" stroke={INK} strokeWidth={8} />
          <clipPath id="sft-grille">
            <circle cx={0} cy={140} r={60} />
          </clipPath>
          <g clipPath="url(#sft-grille)" stroke="#8C8894" strokeWidth={4}>
            {[-48, -32, -16, 0, 16, 32, 48].map((offset) => (
              <g key={offset}>
                <line x1={offset} y1={70} x2={offset} y2={210} />
                <line x1={-70} y1={140 + offset} x2={70} y2={140 + offset} />
              </g>
            ))}
          </g>
          <ellipse cx={-24} cy={110} rx={18} ry={10} fill="#ffffff" opacity={0.55} transform="rotate(-30 -24 110)" />
        </g>
      </g>
    </svg>
  );
}

/** A slow trailer push-in across a cut: scale from 1 toward `to`. */
function Push({ t, length, to = 1.07, origin = "960px 540px", children }: { t: number; length: number; to?: number; origin?: string; children: ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ transformOrigin: origin, transform: `scale(${mix(1, to, progress(t, 0, length, ease.inOutSine))})` }}>
      {children}
    </div>
  );
}

/** The ident: a spot snaps on and two gloves touch. */
function Ident() {
  const { t } = useBeat();
  const spot = t < 0.4 ? 0 : t < 0.46 ? 1 : t < 0.54 ? 0.12 : progress(t, 0.54, 0.16, ease.out);
  const touch = 1.45;
  const approach = progress(t, 0.55, touch - 0.55, ease.inOutSine);
  const bounce = jiggle(t, touch, 8, 18) * 18;
  return (
    <div className="absolute inset-0">
      <Spotlight intensity={spot} width={900} floor={820} />
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <g transform={`translate(${mix(480, 822, approach) - bounce} 500) rotate(-6)`} opacity={spot}>
          <Glove x={0} y={0} color={TOY.tomato.hex} size={2.2} />
        </g>
        <g transform={`translate(${mix(1440, 1098, approach) + bounce} 500) scale(-1 1) rotate(-6)`} opacity={spot}>
          <Glove x={0} y={0} color={TOY.ocean.hex} size={2.2} />
        </g>
      </svg>
      <div className="absolute" style={{ left: 960, top: 480 }}>
        <Burst at={touch} count={18} speed={700} gravity={900} size={18} colors={[TOY.butter.hex, "#FFF4DC"]} shape="star" seed={2} />
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-[680px] text-center uppercase text-ink"
        style={{ fontFamily: FREDOKA, fontWeight: 600, fontSize: 38, letterSpacing: "0.5em", opacity: progress(t, touch + 0.1, 0.4) }}
      >
        A fight-night presentation
      </div>
    </div>
  );
}

/** "Tonight." */
function Tonight() {
  const { t } = useBeat();
  return (
    <Push t={t} length={1.2} to={1.08}>
      <Spotlight width={1300} floor={860} />
      <Slam text="Tonight." at={0.02} x={960} y={520} size={250} rotate={-2} />
    </Push>
  );
}

/** A living room with a boxing ring on the coffee table, in silhouette but for the ring. */
function LivingRoom() {
  const { t } = useBeat();
  const shade = "var(--sft-crowd)";
  const rim = "var(--sf-tangerine)";
  const ropes = [TOY.tomato.hex, TOY.butter.hex, TOY.ocean.hex];
  return (
    <Push t={t} length={2.2} to={1.1} origin="960px 720px">
      <Spotlight x={960} width={760} floor={790} />
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <ellipse cx={1610} cy={470} rx={190} ry={230} fill="var(--sft-pool)" />
        <rect x={1600} y={420} width={16} height={420} fill={shade} />
        <path d="M 1530 420 L 1690 420 L 1650 320 L 1570 320 Z" fill={shade} stroke={rim} strokeWidth={3} strokeOpacity={0.6} />
        <ellipse cx={1608} cy={842} rx={80} ry={14} fill={shade} />
        <g transform="rotate(-4 400 330)">
          <rect x={300} y={250} width={220} height={160} rx={8} fill="none" stroke={shade} strokeWidth={18} />
          <path d="M 330 380 L 390 310 L 430 350 L 460 320 L 500 380 Z" fill={shade} />
        </g>
        <rect x={500} y={500} width={920} height={230} rx={70} fill={shade} />
        <path d="M 540 512 C 720 496 1200 496 1380 512" fill="none" stroke={rim} strokeWidth={4} strokeOpacity={0.55} strokeLinecap="round" />
        <rect x={440} y={600} width={130} height={230} rx={50} fill={shade} />
        <rect x={1350} y={600} width={130} height={230} rx={50} fill={shade} />
        <rect x={540} y={700} width={840} height={110} rx={30} fill={shade} />
        <path d="M 250 840 L 236 740 L 324 740 L 310 840 Z" fill={shade} />
        {[-50, -20, 10, 40].map((angle, index) => {
          const cx = 280 + Math.sin((angle * Math.PI) / 180) * 70;
          const cy = 680 - index * 6;
          return <ellipse key={angle} cx={cx} cy={cy} rx={22} ry={70} fill={shade} transform={`rotate(${angle} ${cx} ${cy})`} />;
        })}
        <rect x={640} y={808} width={640} height={36} rx={10} fill={TOY.cocoa.hex} stroke={INK} strokeWidth={6} />
        <rect x={680} y={842} width={30} height={60} fill={TOY.cocoa.hex} stroke={INK} strokeWidth={5} />
        <rect x={1210} y={842} width={30} height={60} fill={TOY.cocoa.hex} stroke={INK} strokeWidth={5} />
        <path d="M 700 808 L 760 760 L 1160 760 L 1220 808 Z" fill={TOY.teal.hex} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
        {[770, 1150].map((x) => (
          <rect key={x} x={x - 8} y={660} width={16} height={104} rx={6} fill={TOY.bone.hex} stroke={INK} strokeWidth={4} />
        ))}
        {ropes.map((color, index) => (
          <path key={color} d={`M 770 ${672 + index * 26} L 1150 ${672 + index * 26}`} stroke={color} strokeWidth={6} />
        ))}
      </svg>
      <Toy kind="shark" x={890} y={786} scale={0.3} extras={{ tux: true }} pose={{ look: 0.6, lean: wobble(t, 1) * 3 }} shadow={false} />
      <Toy kind="toaster" x={1030} y={786} scale={0.3} pose={{ flip: true, mood: "angry", look: 0.6, lean: wobble(t, 4) * 3 }} extras={{ clock: t }} shadow={false} />
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        {[700, 1220].map((x) => (
          <rect key={x} x={x - 10} y={690} width={20} height={124} rx={7} fill={TOY.bone.hex} stroke={INK} strokeWidth={5} />
        ))}
        {ropes.map((color, index) => (
          <path key={color} d={`M 700 ${704 + index * 30} L 1220 ${704 + index * 30}`} stroke={color} strokeWidth={8} />
        ))}
      </svg>
    </Push>
  );
}

/** The date-line burn-in, typed like a broadcast slate. */
function Burnin() {
  const { t } = useBeat();
  return (
    <div
      className="pointer-events-none absolute left-[110px] top-[150px] flex items-center gap-[16px]"
      style={{ opacity: progress(t, 0, 0.15), transform: `translateX(${(1 - progress(t, 0, 0.35, ease.outQuint)) * -60}px)` }}
    >
      <span className="flex items-center gap-[10px] rounded-[10px] px-[16px] py-[8px] font-mono text-[30px] font-bold" style={{ background: "#E5322D", color: "#FFF6EE" }}>
        <span className="size-[16px] rounded-full" style={{ background: "#FFF6EE", opacity: Math.floor(t * 2.5) % 2 === 0 ? 1 : 0.35 }} />
        LIVE
      </span>
      <span className="rounded-[10px] px-[18px] py-[8px] font-mono text-[30px] font-bold uppercase tracking-[0.08em]" style={{ background: NIGHT, color: "#FFF4DC" }}>
        <TypeOn text="Tonight · Your living room" at={0.12} cps={30} caret={false} />
      </span>
    </div>
  );
}

const LINEUP: { kind: ToyKind; x: number; flip?: boolean; mood?: Mood }[] = [
  { kind: "duck", x: 420, mood: "smug" },
  { kind: "shark", x: 790 },
  { kind: "toaster", x: 1130, flip: true, mood: "angry" },
  { kind: "cactus", x: 1500, flip: true },
];

/** "Four champions.": four silhouettes, lit one by one on "champions". */
function FourChampions({ lit }: { lit: number }) {
  const { t, local } = useBeat();
  const at = local(lit);
  return (
    <Push t={t} length={1.4} to={1.06} origin="960px 780px">
      {LINEUP.map((toy, index) => {
        const on = progress(t, at + index * 0.09, 0.14, ease.out);
        return (
          <div key={toy.kind}>
            <Spotlight x={toy.x} width={380} floor={822} intensity={0.25 + on * 0.75} />
            <div style={{ filter: on < 0.99 ? `brightness(${on})` : undefined }}>
              <Toy
                kind={toy.kind}
                x={toy.x}
                y={820}
                scale={0.95}
                pose={{ flip: toy.flip, mood: toy.mood, squash: jiggle(t, at + index * 0.09, 8, 20) * 0.12, look: toy.flip ? 0.3 : -0.3 }}
                extras={{ tux: toy.kind === "shark", clock: t }}
              />
            </div>
          </div>
        );
      })}
      <Slam text="4 Champions" at={at - 0.02} x={960} y={236} size={140} rotate={-2} />
    </Push>
  );
}

/** "One trophy.": the trophy turns under the spot with a sweeping glint. */
function OneTrophy({ word }: { word: number }) {
  const { t, local } = useBeat();
  const at = local(word);
  const glint = progress(t, 0.2, 0.8, ease.inOut);
  return (
    <Push t={t} length={1.4} to={1.1} origin="960px 600px">
      <Spotlight width={800} floor={850} />
      <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
        <defs>
          <clipPath id="sft-trophy-clip">
            <path d="M -64 -164 L 64 -164 C 64 -100 36 -66 0 -62 C -36 -66 -64 -100 -64 -164 Z" transform="translate(960 830) scale(2.7)" />
          </clipPath>
        </defs>
        <path d="M 790 830 L 790 872 A 170 30 0 0 0 1130 872 L 1130 830 Z" fill="var(--sf-raised)" stroke="var(--sf-edge-strong)" strokeWidth={6} />
        <ellipse cx={960} cy={830} rx={170} ry={30} fill="var(--sf-surface)" stroke="var(--sf-edge-strong)" strokeWidth={6} />
        <g transform="translate(960 830) scale(2.7)">
          <TrophyShape />
        </g>
        <g clipPath="url(#sft-trophy-clip)">
          <rect x={mix(640, 1280, glint)} y={300} width={70} height={600} fill="#ffffff" opacity={0.6} transform={`rotate(20 ${mix(640, 1280, glint)} 600)`} />
        </g>
      </svg>
      {[0, 1, 2, 3].map((index) => {
        const phase = (t * 0.9 + index * 0.27) % 1;
        const x = 960 + Math.cos(index * 2.1) * 250;
        const y = 520 + Math.sin(index * 1.7) * 150;
        const glow = Math.sin(phase * Math.PI);
        return (
          <svg key={index} className="pointer-events-none absolute" style={{ left: x - 30, top: y - 30, opacity: glow, transform: `scale(${0.5 + glow * 0.7})` }} width={60} height={60} viewBox="-30 -30 60 60" aria-hidden="true">
            <path d="M 0 -28 L 5 -5 L 28 0 L 5 5 L 0 28 L -5 5 L -28 0 L -5 -5 Z" fill="#FFF4DC" stroke={TOY.butter.hex} strokeWidth={3} />
          </svg>
        );
      })}
      <Slam text="1 Trophy" at={at - 0.04} x={960} y={236} size={140} rotate={-2} tone="gold" />
    </Push>
  );
}

/** "Ladies and gentlemen...": the ring mic drops, the cameras go off. */
function Announce({ until }: { until: number }) {
  const { t, local } = useBeat();
  const end = local(until);
  const drop = springTo(t, -0.1, -760, 0, { stiffness: 140, damping: 11 });
  const swing = Math.sin(t * 2.6) * 6 * Math.exp(-Math.max(0, t) * 0.8) + wobble(t, 2) * 1.6;
  const flashes = Array.from({ length: 14 }, (_, index) => mix(0.3, end, hash01(index * 4.7 + 2)));
  return (
    <div className="absolute inset-0">
      <Spotlight width={1100} floor={880} sway={1.2} />
      <Crowd t={t} cheer={progress(t, end - 0.7, 0.4)} />
      <Flashes t={t} times={flashes} />
      <Mic x={960} y={250 + drop} swing={swing} />
      <div
        className="pointer-events-none absolute left-0 right-0 text-center uppercase text-ink"
        style={{ top: 620, fontFamily: FREDOKA, fontWeight: 700, fontSize: 84, letterSpacing: "0.06em" }}
      >
        <TypeOn text="Ladies and gentlemen…" at={0.05} cps={17} caret={false} />
      </div>
    </div>
  );
}

const POSTER: { kind: ToyKind; x: number; y: number; scale: number; flip?: boolean; back?: boolean; mood?: Mood }[] = [
  { kind: "duck", x: 330, y: 800, scale: 0.78, back: true, mood: "smug" },
  { kind: "cactus", x: 1590, y: 800, scale: 0.78, back: true, flip: true },
  { kind: "shark", x: 700, y: 850, scale: 1.12 },
  { kind: "toaster", x: 1220, y: 850, scale: 1.12, flip: true, mood: "angry" },
];

/** The fight-night poster: four champions, the band, and the logo slammed on `logo`. */
export function Poster({ logo, still = false }: { logo: number; still?: boolean }) {
  const { t, local } = useBeat();
  const at = local(logo);
  const settled = still ? 10 : t;
  return (
    <div className="absolute inset-0">
      <div
        className="absolute left-1/2 top-[44%] size-[2600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `repeating-conic-gradient(from ${t * 6}deg, color-mix(in srgb, var(--sf-tangerine) 18%, transparent) 0deg 9deg, transparent 9deg 18deg)`,
          opacity: progress(settled, 0, 0.4),
          maskImage: "radial-gradient(closest-side, black 25%, transparent)",
          WebkitMaskImage: "radial-gradient(closest-side, black 25%, transparent)",
        }}
      />
      <Spotlight width={1500} floor={880} />
      {POSTER.map((toy, index) => {
        const enter = spring(settled - (0.04 + index * 0.1), SPRINGS.smooth);
        const fromX = toy.x < 960 ? -800 : 800;
        return (
          <div key={toy.kind} style={{ filter: toy.back ? "saturate(0.7) brightness(0.78)" : undefined }}>
            <Toy
              kind={toy.kind}
              x={toy.x + (1 - enter) * fromX}
              y={toy.y}
              scale={toy.scale}
              pose={{
                flip: toy.flip,
                mood: toy.mood,
                lean: wobble(t, index) * 1.5 + (toy.flip ? -4 : 4),
                look: -0.5,
                squash: jiggle(t, at + SLAM_IMPACT, 7, 18) * 0.08,
              }}
              extras={{ tux: toy.kind === "shark", clock: t }}
            />
          </div>
        );
      })}
      <div
        className="pointer-events-none absolute left-1/2 top-[388px] flex items-center gap-[22px] whitespace-nowrap rounded-[14px] px-[34px] py-[12px] uppercase"
        style={{
          background: NIGHT,
          border: `4px solid ${TOY.butter.hex}`,
          color: "#FFF4DC",
          fontFamily: FREDOKA,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: "0.12em",
          transform: `translateX(-50%) rotate(-1.5deg) scale(${still ? 1 : spring(t - (at + 0.25), SPRINGS.pop)})`,
        }}
      >
        <span style={{ color: TOY.butter.hex }}>Tonight</span>
        <span>4 Champions</span>
        <span style={{ color: TOY.tangerine.hex }}>·</span>
        <span>1 Trophy</span>
      </div>
      <Shake at={still ? [] : [at + SLAM_IMPACT]} strength={16} className="absolute inset-0">
        {!still && (
          <div className="absolute" style={{ left: 960, top: 236 }}>
            <Burst at={at + SLAM_IMPACT} count={30} speed={1200} gravity={1500} size={20} colors={[TOY.tangerine.hex, TOY.butter.hex, TOY.teal.hex, "#FFF4DC"]} seed={3} />
          </div>
        )}
        <Slam text="SlopFight" at={still ? -1 : at} x={960} y={236} size={196} rotate={-3} />
      </Shake>
      {!still && <Glint t={t} at={at + 0.55} />}
    </div>
  );
}

function Glint({ t, at }: { t: number; at: number }) {
  const p = progress(t, at, 0.5, ease.inOut);
  if (p <= 0 || p >= 1) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: mix(520, 1400, p),
        top: 140,
        width: 60,
        height: 190,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)",
        transform: "skewX(-20deg)",
        mixBlendMode: "screen",
      }}
    />
  );
}

export function OpenShot() {
  const cues = useCues();
  const tonight = cues.word("intro", "tonight");
  const live = cues.word("intro", "live");
  const four = cues.word("intro", "four");
  const champions = cues.word("intro", "champions");
  const one = cues.word("intro", "one");
  const trophy = cues.word("intro", "trophy");
  const ladies = cues.word("intro", "ladies");
  const thisIs = cues.word("intro", "this", 1);
  const slopfight = cues.word("intro", "slopfight");
  const end = cues.at("build");
  const cut = (time: number) => time - 0.06;
  return (
    <>
      <Sequence from={0} to={cut(tonight)}>
        <Ident />
      </Sequence>
      <Sequence from={cut(tonight)} to={cut(live)}>
        <Tonight />
      </Sequence>
      <Sequence from={cut(live)} to={cut(four)}>
        <LivingRoom />
        <Burnin />
      </Sequence>
      <Sequence from={cut(four)} to={cut(one)}>
        <FourChampions lit={champions} />
      </Sequence>
      <Sequence from={cut(one)} to={cut(ladies) - 0.1}>
        <OneTrophy word={trophy} />
      </Sequence>
      <Sequence from={cut(ladies) - 0.1} to={cut(thisIs)}>
        <Announce until={thisIs} />
      </Sequence>
      <Sequence from={cut(thisIs)} to={end}>
        <Poster logo={slopfight} />
      </Sequence>
    </>
  );
}

