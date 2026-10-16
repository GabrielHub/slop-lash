"use client";

import { Burst, PhoneMock, Shake, Tap, flight } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, hash01, mix, progress, spring, springTo, wobble } from "@/tutorial/timeline";
import { Doodle, SHARK_DOODLE, TUX_DOODLE } from "../doodles";
import { CREAM, FACE, FREDOKA, Flash, INK, NIGHT, Slam, Spotlight, StarBurst, TOY, jiggle, mixHex, useBeat } from "../look";
import { DrawScreen, Plate } from "../phone";
import { Toy } from "../toys";

// "Send it to the Foundry, and it comes back as a real fighter, with a name,
// a body, and three moves." then "Big ones hit hard. Long ones reach far.
// Chaotic ones... do whatever they want."

const PHONE_W = 330;
const PHONE_SCALE = PHONE_W / 418;
const PHONE = { left: 230, top: 170 };
/** The phone canvas centre on the board. */
const CANVAS = { x: PHONE.left + (14 + 195) * PHONE_SCALE, y: PHONE.top + (14 + 70 + 52 + 173) * PHONE_SCALE };
const MACHINE = { x: 1180, floor: 830 };
const HOPPER = { x: MACHINE.x, y: MACHINE.floor - 640 + 60 };
const PEDESTAL = { x: 640, y: 800 };
const BAG_X = 1660;

function gearPath(r: number, teeth: number): string {
  const points: string[] = [];
  for (let index = 0; index < teeth * 4; index++) {
    const angle = (index / (teeth * 4)) * Math.PI * 2;
    const radius = index % 4 < 2 ? r : r * 0.8;
    points.push(`${(Math.cos(angle) * radius).toFixed(1)},${(Math.sin(angle) * radius).toFixed(1)}`);
  }
  return `M ${points.join(" L ")} Z`;
}
const GEAR_BIG = gearPath(64, 10);
const GEAR_SMALL = gearPath(40, 8);

/** The Foundry: a toy factory with a hopper, a porthole furnace, gears and a chimney. */
function Machine({ t, busy, glow }: { t: number; busy: number; glow: number }) {
  const spin = t * (40 + busy * 260);
  const flicker = 0.85 + 0.15 * Math.sin(t * 31) * Math.sin(t * 17);
  const tangerine = TOY.tangerine.hex;
  return (
    <svg viewBox="0 0 640 640" width={640} height={640} style={{ overflow: "visible" }} aria-hidden="true">
      <defs>
        <radialGradient id="sft-furnace" cx="0.5" cy="0.55" r="0.6">
          <stop offset="0" stopColor="#FFF1B8" />
          <stop offset="0.45" stopColor={TOY.butter.hex} />
          <stop offset="0.8" stopColor={tangerine} />
          <stop offset="1" stopColor={TOY.rust.hex} />
        </radialGradient>
        <linearGradient id="sft-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={mixHex(tangerine, "#ffffff", 0.3)} />
          <stop offset="0.6" stopColor={tangerine} />
          <stop offset="1" stopColor={mixHex(tangerine, INK, 0.35)} />
        </linearGradient>
      </defs>
      {[0, 1, 2].map((index) => {
        const phase = (t * (0.5 + busy * 0.7) + index / 3) % 1;
        return (
          <circle
            key={index}
            cx={520 + Math.sin(phase * 5 + index) * 14 + phase * 40}
            cy={-60 - phase * 220}
            r={22 + phase * 34}
            fill="#FFFDF7"
            stroke={INK}
            strokeWidth={5}
            opacity={(1 - phase) * 0.95}
          />
        );
      })}
      <rect x={480} y={-70} width={70} height={160} rx={12} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={8} />
      <rect x={470} y={-84} width={90} height={30} rx={10} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={7} />
      <g transform={`translate(600 300) rotate(${spin})`}>
        <path d={GEAR_BIG} fill={TOY.butter.hex} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
        <circle r={18} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={6} />
      </g>
      <g transform={`translate(612 420) rotate(${-spin * 1.5 + 12})`}>
        <path d={GEAR_SMALL} fill={TOY.teal.hex} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
        <circle r={12} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={5} />
      </g>
      <rect x={90} y={590} width={90} height={46} rx={14} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={8} />
      <rect x={460} y={590} width={90} height={46} rx={14} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={8} />
      <rect x={40} y={210} width={560} height={400} rx={60} fill="url(#sft-body)" stroke={INK} strokeWidth={9} />
      <rect x={76} y={246} width={488} height={328} rx={42} fill={TOY.bone.hex} stroke={INK} strokeWidth={6} />
      {[96, 544].flatMap((x) => [266, 554].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r={8} fill={TOY.sand.hex} stroke={INK} strokeWidth={4} />))}
      <circle cx={320} cy={404} r={128} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={9} />
      <circle cx={320} cy={404} r={104} fill="url(#sft-furnace)" opacity={0.55 + 0.45 * glow * flicker} stroke={INK} strokeWidth={6} />
      <g transform={`translate(320 404) rotate(${spin * 0.8})`} opacity={0.35 + busy * 0.4}>
        {[0, 1, 2, 3].map((index) => (
          <path
            key={index}
            d="M 0 0 C 30 -10 60 -40 70 -80"
            fill="none"
            stroke="#FFFDF7"
            strokeWidth={10}
            strokeLinecap="round"
            transform={`rotate(${index * 90})`}
          />
        ))}
      </g>
      <ellipse cx={278} cy={346} rx={34} ry={16} fill="#ffffff" opacity={0.45} transform="rotate(-35 278 346)" />
      <g transform="translate(150 300)">
        <circle r={38} fill="#FFFDF7" stroke={INK} strokeWidth={6} />
        <line x1={0} y1={0} x2={0} y2={-26} stroke={TOY.tomato.hex} strokeWidth={6} strokeLinecap="round" transform={`rotate(${-60 + busy * 120 + Math.sin(t * 13) * busy * 25})`} />
        <circle r={6} fill={INK} />
      </g>
      <rect x={180} y={530} width={280} height={56} rx={16} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={6} />
      <text x={320} y={570} textAnchor="middle" fontFamily={FREDOKA} fontWeight={700} fontSize={34} letterSpacing="3" fill={TOY.butter.hex}>
        THE FOUNDRY
      </text>
      <path d="M 110 40 L 530 40 L 410 214 L 230 214 Z" fill={TOY.bone.hex} stroke={INK} strokeWidth={9} strokeLinejoin="round" />
      <path d="M 150 60 L 230 60 L 260 196" fill="none" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" opacity={0.5} />
      <rect x={90} y={18} width={460} height={42} rx={16} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={8} />
    </svg>
  );
}

function MoveIcon({ type }: { type: "STRIKE" | "GRAPPLE" | "TRICK" }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[52px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === "STRIKE" && <path d="M13 2 4 14h7l-1 8 9-12h-7z" />}
      {type === "GRAPPLE" && (
        <>
          <path d="M6 13V7a2 2 0 0 1 4 0v5" />
          <path d="M10 11V5a2 2 0 0 1 4 0v6" />
          <path d="M14 11V7a2 2 0 0 1 4 0v7a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 4 0" />
        </>
      )}
      {type === "TRICK" && <path d="M12 12a2 2 0 1 1 2-2 4 4 0 1 1-4-4 6 6 0 1 1-6 6" />}
    </svg>
  );
}

const MOVES = [
  { name: "Fin Slap", type: "STRIKE", label: "Strike", tone: "text-punch bg-punch/15", power: 4 },
  { name: "Formal Hug", type: "GRAPPLE", label: "Grapple", tone: "text-teal bg-teal-soft", power: 3 },
  { name: "Fake Dolphin", type: "TRICK", label: "Trick", tone: "text-gold bg-gold-soft", power: 2 },
] as const;

function pop(t: number, at: number) {
  return { transform: `scale(${spring(t - at, SPRINGS.pop)})`, opacity: progress(t, at, 0.12) };
}

/** The champion card: name, body and three moves, built on the words. */
function ChampionCard({ t, name, body, moves }: { t: number; name: number; body: number; moves: readonly number[] }) {
  return (
    <div className="w-[700px] rounded-[40px] border-[3px] border-edge-strong bg-surface p-[34px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-[14px]" style={pop(t, body)}>
        <span className="rounded-full bg-raised px-[20px] py-[6px] font-display text-[28px] font-extrabold uppercase tracking-[0.12em] text-ink-dim">
          Biped
        </span>
        <span className="text-[28px] font-semibold text-ink-dim">Two legs, upright</span>
      </div>
      <div
        className="mt-[10px] uppercase text-ink"
        style={{ ...pop(t, name), transformOrigin: "0% 50%", fontFamily: FREDOKA, fontWeight: 700, fontSize: 70, lineHeight: 1.05 }}
      >
        Sir Chompsalot
      </div>
      <div className="mt-[22px] flex flex-col gap-[14px]">
        {MOVES.map((move, index) => (
          <div
            key={move.name}
            className="flex items-center gap-[18px] rounded-[24px] bg-raised/70 px-[16px] py-[12px]"
            style={{ ...pop(t, moves[index]), transformOrigin: "0% 50%" }}
          >
            <span className={`grid size-[78px] shrink-0 place-items-center rounded-[18px] ${move.tone}`}>
              <MoveIcon type={move.type} />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="font-display text-[42px] font-bold leading-tight text-ink">{move.name}</span>
              <span className="text-[24px] font-bold uppercase tracking-[0.14em] text-ink-dim">{move.label}</span>
            </span>
            <span className="flex gap-[6px]">
              {Array.from({ length: 5 }, (_, pip) => (
                <span key={pip} className={`h-[16px] w-[26px] rounded-full ${pip < move.power ? "bg-ink" : "bg-edge-strong/60"}`} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TAPE = [
  { key: "heft", label: "Heft", value: 3, tone: "bg-punch" },
  { key: "reach", label: "Reach", value: 2, tone: "bg-teal" },
  { key: "chaos", label: "Chaos", value: 4, tone: "bg-gold" },
] as const;

function StatIcon({ stat }: { stat: "heft" | "reach" | "chaos" }) {
  return (
    <svg viewBox="0 0 48 48" className="size-[60px]" fill="none" stroke="currentColor" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {stat === "heft" && (
        <>
          <path d="M16 16a8 8 0 0 1 16 0" />
          <path d="M10 20h28l-4 22H14z" />
        </>
      )}
      {stat === "reach" && (
        <>
          <path d="M6 24h36" />
          <path d="M14 15 5 24l9 9M34 15l9 9-9 9" />
        </>
      )}
      {stat === "chaos" && <path d="M24 24a3 3 0 1 1 3-3 6 6 0 1 1-6-6 10 10 0 1 1-10 10 14 14 0 1 1 14 14" />}
    </svg>
  );
}

/** The tale of the tape: Sir Chompsalot's stats, each row lit and filled on its beat. */
function TaleOfTheTape({ t, beats, active }: { t: number; beats: readonly number[]; active: number }) {
  return (
    <div className="w-[560px] overflow-hidden rounded-[30px] border-[3px] border-edge-strong bg-surface shadow-[0_40px_80px_-30px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between px-[28px] py-[14px]" style={{ background: NIGHT }}>
        <span className="uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 38, letterSpacing: "0.12em", color: TOY.butter.hex }}>
          Tale of the tape
        </span>
        <span className="size-[18px] rounded-full" style={{ background: "#E5322D", opacity: Math.floor(t * 2.5) % 2 === 0 ? 1 : 0.35 }} />
      </div>
      <div className="flex items-center gap-[18px] px-[24px] pb-[8px] pt-[20px]">
        <Plate kind="shark" size={104} />
        <div className="flex flex-col">
          <span className="uppercase text-ink" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 44, lineHeight: 1.05 }}>
            Sir Chompsalot
          </span>
          <span className="text-[26px] font-semibold text-ink-dim">Biped · Sam&apos;s corner</span>
        </div>
      </div>
      <div className="flex flex-col gap-[10px] px-[18px] pb-[14px] pt-[8px]">
        {TAPE.map((stat, index) => {
          const lit = index === active;
          const filled = Math.round(progress(t, beats[index], 0.45, ease.out) * stat.value);
          return (
            <div
              key={stat.key}
              className={`flex items-center gap-[16px] rounded-[22px] border-[3px] px-[18px] py-[10px] ${lit ? "border-punch bg-punch/12" : "border-transparent bg-raised/60"}`}
              style={{ transform: `scale(${lit ? 1 + jiggle(t, beats[index], 8, 20) * 0.05 : 1})` }}
            >
              <span className={lit ? "text-punch" : "text-ink-dim"}>
                <StatIcon stat={stat.key} />
              </span>
              <span className="w-[170px] uppercase text-ink" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 42, lineHeight: 1 }}>
                {stat.label}
              </span>
              <span className="flex flex-1 gap-[7px]">
                {Array.from({ length: 5 }, (_, pip) => (
                  <span key={pip} className={`h-[22px] flex-1 rounded-full ${pip < filled ? stat.tone : "bg-edge-strong/50"}`} />
                ))}
              </span>
              <span className="w-[44px] text-right font-mono text-[48px] font-bold tabular-nums text-ink">{filled}</span>
            </div>
          );
        })}
      </div>
      <div className="border-t-[3px] border-edge px-[28px] py-[12px] text-[26px] font-semibold text-ink-dim">
        1 to 5 each · always adds up to 9
      </div>
    </div>
  );
}

/** A punching bag on a chain, swinging `angle` degrees about the ceiling. */
function Bag({ x, top, angle }: { x: number; top: number; angle: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
      <g transform={`rotate(${angle} ${x} -40)`}>
        <path d={`M ${x} -60 L ${x} ${top + 20}`} stroke={INK} strokeWidth={10} strokeDasharray="18 8" />
        <rect x={x - 80} y={top} width={160} height={310} rx={56} fill={TOY.tomato.hex} stroke={INK} strokeWidth={9} />
        <rect x={x - 80} y={top + 60} width={160} height={26} fill={TOY.bone.hex} stroke={INK} strokeWidth={6} />
        <rect x={x - 80} y={top + 226} width={160} height={26} fill={TOY.bone.hex} stroke={INK} strokeWidth={6} />
        <rect x={x - 52} y={top + 20} width={20} height={250} rx={10} fill="#ffffff" opacity={0.25} />
      </g>
    </svg>
  );
}

/** A damped swing set off at each impulse. */
function swing(t: number, impulses: readonly [number, number][]): number {
  let angle = 0;
  for (const [at, strength] of impulses) {
    if (t < at) continue;
    const local = t - at;
    angle += Math.sin(local * 5.2) * strength * Math.exp(-local * 1.4);
  }
  return angle;
}

/** 1 while a freeze-frame holds, with a quick fade out. */
function windowedFreeze(t: number, at: number, hold: number): number {
  if (t < at || t > at + hold + 0.12) return 0;
  return t < at + hold ? 1 : 1 - (t - at - hold) / 0.12;
}

/** Poof clouds where something vanished or appeared. */
function Poof({ t, at, x, y }: { t: number; at: number; x: number; y: number }) {
  const life = (t - at) / 0.5;
  if (life < 0 || life > 1) return null;
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => {
        const angle = (index / 7) * Math.PI * 2 + 0.4;
        const distance = 40 + life * 110;
        return (
          <circle
            key={index}
            cx={x + Math.cos(angle) * distance}
            cy={y + Math.sin(angle) * distance * 0.7}
            r={(38 + hash01(index) * 20) * (1 - life * 0.6)}
            fill="#FFFDF7"
            stroke={INK}
            strokeWidth={5}
            opacity={1 - life}
          />
        );
      })}
    </svg>
  );
}

export function FoundryShot() {
  const b = useBeat();
  const t = b.t;
  const send = b.word("foundry", "send");
  const into = b.word("foundry", "foundry");
  const comes = b.word("foundry", "comes");
  const real = b.word("foundry", "real");
  const fighter = b.word("foundry", "fighter");
  const name = b.word("foundry", "name");
  const body = b.word("foundry", "body");
  const three = b.word("foundry", "three");
  const moves = b.word("foundry", "moves");
  const stats = b.at("stats");
  const big = b.word("stats", "big");
  const hard = b.word("stats", "hard");
  const long = b.word("stats", "long");
  const far = b.word("stats", "far");
  const chaotic = b.word("stats", "chaotic");
  const ones = b.word("stats", "ones", 2);
  const whatever = b.word("stats", "whatever");
  const want = b.word("stats", "want");

  const enter = 1 - spring(t, SPRINGS.smooth);

  // --- Send: the phone, the tap, the flight into the hopper ---
  const tapAt = send + 0.12;
  const sendPress = t > tapAt ? 1 - progress(t, tapAt + 0.08, 0.2) : 0;
  const phoneOut = progress(t, comes - 0.3, 0.45, ease.in);
  const cardFlight = flight(t, { at: tapAt + 0.25, duration: into - tapAt - 0.15, from: CANVAS, to: HOPPER, lift: 300, easing: ease.inOut });
  const swallow = progress(t, into + 0.05, 0.2, ease.in);
  const intake = into + 0.12;

  // --- The machine forges, then spits the toy out ---
  const busy = progress(t, intake, 0.3) * (1 - progress(t, comes + 0.2, 0.4));
  const launch = comes + 0.05;
  const glow = clamp(0.3 + busy + (t > launch ? 0.4 * (1 - progress(t, launch, 0.6)) : 0));
  const machineK = jiggle(t, intake, 7, 20) + jiggle(t, launch, 8, 22) * 1.2;
  const chug = busy * Math.sin(t * 22) * 0.025;
  const machineOut = progress(t, fighter + 0.25, 0.55, ease.in);
  const machineX = MACHINE.x + machineOut * 1300;

  const landAt = launch + 0.62;
  const toyFlight = flight(t, { at: launch, duration: landAt - launch, from: { x: HOPPER.x, y: HOPPER.y + 60 }, to: PEDESTAL, lift: 340, easing: ease.out });
  const inflate = spring(t - (real - 0.05), { stiffness: 260, damping: 11 });
  const landed = t >= landAt;

  // --- Stats: a tale of the tape, each beat ending on a freeze-frame ---
  const toStats = spring(t - (stats - 0.4), SPRINGS.gentle);
  const toyHome = { x: mix(PEDESTAL.x, 1000, toStats), y: mix(PEDESTAL.y - 6, 836, toStats) };
  const pedestalOut = progress(t, stats - 0.45, 0.4, ease.in);
  const cardOut = progress(t, stats - 0.5, 0.45, ease.in);
  const pound = hard + 0.04;
  const hit = far + 0.06;
  const stop = want + 0.14;
  const freezes: [number, number][] = [
    [pound + 0.1, 0.5],
    [hit + 0.08, 0.5],
    [stop, 0.75],
  ];
  const frozen = freezes.find(([at, hold]) => t >= at && t < at + hold);
  /** The action's clock: it stops dead on each freeze-frame. */
  const ft = frozen ? frozen[0] : t;
  const freeze = freezes.reduce((sum, [at, hold]) => sum + windowedFreeze(t, at, hold), 0);

  // Heft: bulk up, then a ground pound on "hard".
  const bulkOn = spring(ft - (big - 0.05), SPRINGS.jelly) * (1 - spring(ft - (long - 0.25), SPRINGS.smooth));
  const jump = ft > pound - 0.42 && ft < pound ? Math.sin(((ft - (pound - 0.42)) / 0.42) * Math.PI) * 170 : 0;
  const poundK = jiggle(ft, pound, 7, 22);
  // Reach: the fin stretches across to the bag on "far".
  const reachOut = springTo(ft, hit - 0.3, 0, 354, { stiffness: 380, damping: 17 }) * (1 - progress(ft, chaotic - 0.35, 0.3, ease.in));
  // Chaos: jitter, spins, teleports, and ends standing on its head.
  const chaos = ft > chaotic - 0.1;
  const hop1 = whatever + 0.08;
  const hop2 = want + 0.05;
  const slot = Math.floor(ft / 0.06);
  const jitter = chaos && ft < hop1 ? { x: (hash01(slot) - 0.5) * 34, y: (hash01(slot + 0.5) - 0.5) * 20 } : { x: 0, y: 0 };
  const spinOnes = springTo(ft, ones - 0.05, 0, 360, SPRINGS.smooth);
  const chaosX = ft < hop1 ? 0 : ft < hop2 ? 330 : 90;
  const upside = ft >= hop2 ? 180 : 0;
  const tumble = ft > hop1 && ft < hop2 ? (ft - hop1) * 900 : 0;

  const bagIn = springTo(t, stats - 0.25, -700, 0, { stiffness: 160, damping: 13 });
  const bagAngle =
    swing(ft, [
      [pound + 0.2, 6],
      [hit, -22],
    ]) + wobble(ft, 3) * 1.2;

  const activeStat = t < long - 0.15 ? 0 : t < chaotic - 0.15 ? 1 : 2;
  const tapeIn = spring(t - (stats - 0.35), SPRINGS.smooth);
  // Each freeze pushes in a touch on the toy; the ground pound shakes the frame.
  const push = freezes.reduce((sum, [at, hold]) => sum + windowedFreeze(t, at, hold) * progress(t, at, 0.4, ease.out), 0);
  const quake = ft > pound && ft < pound + 0.45 ? 1 - (ft - pound) / 0.45 : 0;
  const quakeSlot = Math.floor(ft * 50);
  const quakeX = (hash01(quakeSlot + 3) - 0.5) * 30 * quake;
  const quakeY = (hash01(quakeSlot + 7.5) - 0.5) * 22 * quake;

  // The toy, from flight to pedestal to stats.
  let toy: { x: number; y: number; scale: number; squash: number; spin: number; hop: number; mood: "happy" | "angry" | "dizzy" | "wow"; bulk: [number, number] };
  if (!landed) {
    toy = { x: toyFlight.x, y: toyFlight.y, scale: 0.5, squash: 0.45, spin: toyFlight.progress * 540, hop: 0, mood: "wow", bulk: [1, 1] };
  } else if (t < stats - 0.4) {
    const landK = jiggle(t, landAt, 9, 24);
    const flex = jiggle(t, body + 0.05, 6, 20) * 0.5;
    toy = {
      x: PEDESTAL.x,
      y: PEDESTAL.y - 6,
      scale: mix(0.5, 1.3, inflate),
      squash: mix(0.45, 0, clamp(inflate)) + landK * 0.2 + flex * 0.4,
      spin: 0,
      hop: 0,
      mood: t < real ? "wow" : "happy",
      bulk: [1, 1],
    };
  } else {
    toy = {
      x: toyHome.x + jitter.x + chaosX * (chaos ? 1 : 0),
      y: toyHome.y + jitter.y,
      scale: mix(1.3, 1.15, toStats),
      squash: poundK * 0.35 + (ft > hop1 ? jiggle(ft, hop1, 8, 20) * 0.3 + jiggle(ft, hop2, 8, 20) * 0.3 : 0),
      spin: (chaos ? spinOnes + upside + tumble : 0) % 360,
      hop: jump + (ft > hop1 && ft < hop2 ? Math.sin(Math.min(1, (ft - hop1) / 0.5) * Math.PI) * 120 : 0),
      mood: chaos ? "dizzy" : ft > big - 0.05 && ft < long - 0.2 ? "angry" : "happy",
      bulk: [mix(1, 1.42, bulkOn), mix(1, 1.16, bulkOn)],
    };
  }

  return (
    <div className="absolute inset-0" style={{ transform: `translateX(${enter * 1800}px)` }}>
      <div
        className="absolute inset-0"
        style={{ transformOrigin: `${toyHome.x}px 640px`, transform: `translate(${quakeX}px, ${quakeY}px) scale(${1 + push * 0.06})` }}
      >
        <Spotlight x={mix(MACHINE.x, toyHome.x, clamp(machineOut + toStats))} width={1000} floor={850} intensity={0.85} />
        <Shake at={[intake, launch]} strength={12} duration={0.4} className="absolute inset-0">
          {/* The punching bag (stats). */}
          {t > stats - 0.3 && <Bag x={BAG_X} top={400 + bagIn} angle={bagAngle} />}

          {/* The machine. */}
          {machineOut < 1 && (
            <div
              className="absolute"
              style={{
                left: machineX - 320,
                top: MACHINE.floor - 640,
                transformOrigin: "320px 640px",
                transform: `scale(${1 + machineK * 0.06 + chug}, ${1 - machineK * 0.08 - chug})`,
              }}
            >
              <Machine t={t} busy={busy} glow={glow} />
            </div>
          )}
          <div className="absolute" style={{ left: HOPPER.x, top: HOPPER.y }}>
            <Burst at={intake} count={26} speed={900} gravity={1700} size={18} direction={-90} spread={120} colors={[TOY.butter.hex, TOY.tangerine.hex, "#FFF4DC"]} seed={5} />
            <Burst at={launch} count={20} speed={1100} gravity={1800} size={16} direction={-90} spread={90} colors={[TOY.butter.hex, TOY.teal.hex, "#FFF4DC"]} seed={8} />
          </div>

          {/* The pedestal. */}
          {t > comes - 0.4 && pedestalOut < 1 && (
            <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true" style={{ transform: `translateY(${(1 - progress(t, comes - 0.4, 0.35, ease.outBack)) * 260 + pedestalOut * 400}px)` }}>
              <path d={`M ${PEDESTAL.x - 230} ${PEDESTAL.y} L ${PEDESTAL.x - 230} ${PEDESTAL.y + 56} A 230 44 0 0 0 ${PEDESTAL.x + 230} ${PEDESTAL.y + 56} L ${PEDESTAL.x + 230} ${PEDESTAL.y} Z`} fill="var(--sf-raised)" stroke="var(--sf-edge-strong)" strokeWidth={6} />
              <ellipse cx={PEDESTAL.x} cy={PEDESTAL.y} rx={230} ry={44} fill="var(--sf-surface)" stroke="var(--sf-edge-strong)" strokeWidth={6} />
              <ellipse cx={PEDESTAL.x} cy={PEDESTAL.y} rx={170} ry={30} fill="none" stroke="var(--sf-tangerine)" strokeWidth={5} strokeDasharray="14 12" />
            </svg>
          )}

          {/* Heft's shockwave. */}
          {ft > pound && ft < pound + 0.6 && (
            <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
              {[0, 0.12].map((delay) => {
                const p = progress(ft, pound + delay, 0.5, ease.out);
                return <ellipse key={delay} cx={toyHome.x} cy={840} rx={80 + p * 900} ry={16 + p * 90} fill="none" stroke="var(--sf-tangerine)" strokeWidth={14 * (1 - p)} opacity={1 - p} />;
              })}
            </svg>
          )}

          {/* The toy. */}
          {t > launch && (
            <Toy
              kind="shark"
              x={toy.x}
              y={toy.y}
              scale={toy.scale}
              shadow={landed}
              pose={{ squash: toy.squash, spin: toy.spin, hop: toy.hop, mood: toy.mood, bulk: toy.bulk, look: t > stats ? 0.4 : 0 }}
              extras={{ tux: true, reach: t > stats ? reachOut : 0, clock: ft }}
            />
          )}
          {t > real - 0.1 && t < real + 0.6 && (
            <div className="absolute" style={{ left: PEDESTAL.x, top: PEDESTAL.y - 250 }}>
              <Burst at={real - 0.05} count={22} speed={800} gravity={900} size={20} shape="star" colors={[TOY.butter.hex, "#FFF4DC", TOY.tangerine.hex]} seed={11} />
            </div>
          )}
          {ft > hit && ft < hit + 0.5 && (
            <div className="absolute" style={{ left: BAG_X - 70, top: 560, transform: `scale(${spring(ft - hit, SPRINGS.pop)}) rotate(-8deg)`, opacity: 1 - progress(ft, hit + 0.3, 0.2) }}>
              <StarBurst size={300} color={TOY.butter.hex} />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 uppercase" style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 76, color: INK }}>
                Pow!
              </span>
            </div>
          )}
          <Poof t={ft} at={hop1} x={toyHome.x} y={700} />
          <Poof t={ft} at={hop2} x={toyHome.x + 330} y={700} />

          {/* The doodle, flying from the phone into the hopper. */}
          {t > tapAt + 0.2 && swallow < 1 && (
            <div
              className="pointer-events-none absolute"
              style={{
                left: cardFlight.x - 140,
                top: cardFlight.y - 140 + swallow * 90,
                width: 280,
                height: 280,
                transform: `rotate(${cardFlight.progress * 380}deg) scale(${mix(0.98, 0.5, cardFlight.progress) * (1 - swallow)})`,
                background: CREAM,
                border: `5px solid ${INK}`,
                borderRadius: 18,
                boxShadow: "0 20px 40px -18px rgba(0,0,0,0.6)",
              }}
            >
              <Doodle size={270} layers={[{ strokes: SHARK_DOODLE }, { strokes: TUX_DOODLE }]} />
            </div>
          )}
        </Shake>
      </div>

      {/* Freeze-frame: the picture drains to black and white inside a cream frame. */}
      {freeze > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ opacity: freeze, backdropFilter: "grayscale(1) contrast(1.3) brightness(1.04)" }}
        >
          <div className="absolute inset-[26px] rounded-[20px] border-[6px]" style={{ borderColor: FACE }} />
          {[0, 1, 2, 3].map((corner) => (
            <div
              key={corner}
              className="absolute size-[70px]"
              style={{
                left: corner % 2 === 0 ? 50 : undefined,
                right: corner % 2 === 1 ? 50 : undefined,
                top: corner < 2 ? 50 : undefined,
                bottom: corner >= 2 ? 50 : undefined,
                borderColor: TOY.butter.hex,
                borderStyle: "solid",
                borderWidth: 0,
                borderTopWidth: corner < 2 ? 8 : 0,
                borderBottomWidth: corner >= 2 ? 8 : 0,
                borderLeftWidth: corner % 2 === 0 ? 8 : 0,
                borderRightWidth: corner % 2 === 1 ? 8 : 0,
              }}
            />
          ))}
        </div>
      )}
      {freezes.map(([at]) => (
        <Flash key={at} at={at} duration={0.25} strength={0.6} />
      ))}

      {/* The phone and its tap. */}
      {phoneOut < 1 && (
        <div className="absolute" style={{ left: PHONE.left - phoneOut * 700, top: PHONE.top + phoneOut * 120, transform: "rotate(-3deg)" }}>
          <PhoneMock width={PHONE_W}>
            <DrawScreen
              title="Draw your champion"
              sendPress={sendPress}
              layers={[
                { strokes: SHARK_DOODLE, opacity: t > tapAt + 0.22 ? 0.12 : 1 },
                { strokes: TUX_DOODLE, opacity: t > tapAt + 0.22 ? 0.12 : 1 },
              ]}
            />
            <div className="absolute" style={{ left: 195 - 44, top: 775 - 44 }}>
              <Tap at={tapAt} size={88} />
            </div>
          </PhoneMock>
        </div>
      )}

      {/* The champion card. */}
      {t > name - 0.5 && cardOut < 1 && (
        <div
          className="absolute"
          style={{
            left: 1040 + (1 - spring(t - (name - 0.45), SPRINGS.smooth)) * 1000 + cardOut * 1100,
            top: 196,
          }}
        >
          <ChampionCard t={t} name={name} body={body} moves={[three - 0.08, three + 0.2, moves + 0.12]} />
        </div>
      )}

      {/* The tale of the tape. */}
      {t > stats - 0.4 && (
        <div className="absolute left-[96px] top-[150px]" style={{ transform: `translateX(${(1 - tapeIn) * -760}px) rotate(${mix(-6, -1.5, tapeIn)}deg)` }}>
          <TaleOfTheTape t={t} beats={[big, long, chaotic]} active={activeStat} />
        </div>
      )}

      {/* Freeze-frame callouts. */}
      <Slam text="Hits hard!" at={freezes[0][0]} out={freezes[0][0] + freezes[0][1] - 0.1} x={1270} y={250} size={124} tone="tomato" rotate={-5} />
      <Slam text="Reaches far!" at={freezes[1][0]} out={freezes[1][0] + freezes[1][1] - 0.1} x={1250} y={250} size={116} tone="teal" rotate={-4} />
      <Slam text="Total chaos!" at={freezes[2][0]} x={1250} y={250} size={116} tone="gold" rotate={-5} />
    </div>
  );
}
