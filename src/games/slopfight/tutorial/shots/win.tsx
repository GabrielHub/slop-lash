"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Burst, Shake } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring, wobble } from "@/tutorial/timeline";
import { ArenaStage } from "../arenas";
import { InkPaths, type Ink } from "../doodles";
import { FREDOKA, INK, Letterbox, Slam, Spotlight, TOY, jiggle, mixHex } from "../look";
import { Toy, TrophyShape, type Mood, type ToyKind } from "../toys";
import { Poster } from "./open";

// "Win the final, and you are the champion. Everyone else... we are very
// proud of you." then "Now get drawing!" The rooftop podium, the trophy and
// CHAMPION, participation rosettes for everyone else; then the call to
// action and the end card.

const STEPS = [
  { place: 2, x: 640, top: 690, width: 290, medal: "#C9CED6" },
  { place: 1, x: 960, top: 620, width: 310, medal: TOY.butter.hex },
  { place: 3, x: 1280, top: 740, width: 290, medal: TOY.cocoa.hex },
] as const;
const BASE = 860;

function Podium() {
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
      {STEPS.map((step) => (
        <g key={step.place}>
          <rect x={step.x - step.width / 2} y={step.top} width={step.width} height={BASE - step.top} rx={18} fill="#FFF4DC" stroke={INK} strokeWidth={7} />
          <rect x={step.x - step.width / 2} y={step.top} width={step.width} height={26} rx={12} fill={mixHex("#FFF4DC", INK, 0.12)} stroke={INK} strokeWidth={7} />
          <circle cx={step.x} cy={step.top + 100} r={46} fill={step.medal} stroke={INK} strokeWidth={6} />
          <text x={step.x} y={step.top + 118} textAnchor="middle" fill={INK} style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 54 }}>
            {step.place}
          </text>
        </g>
      ))}
    </svg>
  );
}

const ROSETTE_COLORS = [TOY.teal.hex, TOY.bubblegum.hex, TOY.ocean.hex];

export function WinShot() {
  const b = useLocalCues();
  const t = b.t;
  const final = b.word("win", "final");
  const champion = b.word("win", "champion");
  const everyone = b.word("win", "everyone");
  const very = b.word("win", "very");
  const proud = b.word("win", "proud");
  const you = b.word("win", "you", 1);

  const trophy = 1 + jiggle(t, champion - 0.1, 7, 20) * 0.15;
  const trophyDrop = progress(t, champion - 0.45, 0.35, ease.in);
  const sad = t > everyone - 0.05;
  const ribbons = [very, proud, you];
  const spotNarrow = progress(t, everyone - 0.1, 0.5, ease.inOut) * (1 - progress(t, very - 0.2, 0.5, ease.inOut));

  const losers: { kind: ToyKind; x: number; y: number; flip?: boolean; ribbonAt: number; scale: number }[] = [
    { kind: "toaster", x: 640, y: 690, ribbonAt: ribbons[0], scale: 0.86 },
    { kind: "duck", x: 1280, y: 740, flip: true, ribbonAt: ribbons[1], scale: 0.86 },
    { kind: "cactus", x: 1640, y: 860, flip: true, ribbonAt: ribbons[2], scale: 0.78 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ transformOrigin: "960px 600px", transform: `scale(${mix(1.0, 1.05, progress(t, 0, 5, ease.inOutSine))})` }}>
        <ArenaStage id="rooftop" t={t} />
        <div className="absolute inset-0" style={{ background: "rgba(20, 11, 16, 0.35)", opacity: spotNarrow }} />
        <Spotlight x={960} width={mix(1500, 640, spotNarrow)} floor={860} intensity={0.9} />
        <Podium />
        <Shake at={[champion + 0.05]} strength={12} className="absolute inset-0">
          {losers.map((loser, index) => {
            const ribbon = spring(t - loser.ribbonAt, SPRINGS.jelly);
            const cheered = t > loser.ribbonAt;
            const mood: Mood = cheered ? "happy" : sad ? "sad" : loser.kind === "toaster" ? "angry" : "happy";
            return (
              <div key={loser.kind}>
                <Toy
                  kind={loser.kind}
                  x={loser.x}
                  y={loser.y}
                  scale={loser.scale}
                  pose={{
                    flip: loser.flip,
                    mood,
                    lean: (sad && !cheered ? 6 : 0) * (loser.flip ? -1 : 1) + wobble(t, index + 2) * 2,
                    squash: (sad && !cheered ? 0.08 : 0) + jiggle(t, loser.ribbonAt, 7, 20) * 0.25,
                    hop: cheered ? Math.max(0, Math.sin(clamp((t - loser.ribbonAt) / 0.35) * Math.PI)) * 40 : 0,
                    look: -0.3,
                  }}
                  extras={{ ribbon: t > loser.ribbonAt ? ribbon : 0, tux: false, clock: t }}
                />
                {t > loser.ribbonAt - 0.02 && t < loser.ribbonAt + 0.8 && (
                  <div className="absolute" style={{ left: loser.x, top: loser.y - 200 * loser.scale }}>
                    <Burst at={loser.ribbonAt} count={14} speed={520} gravity={800} size={18} shape="heart" colors={[ROSETTE_COLORS[index], "#FFF4DC"]} seed={index + 30} />
                  </div>
                )}
              </div>
            );
          })}
          <Toy
            kind="shark"
            x={960}
            y={620}
            scale={0.92}
            pose={{ mood: t > champion ? "wow" : "smug", squash: jiggle(t, champion + 0.05, 7, 20) * 0.2, hop: t > champion ? Math.max(0, jiggle(t, champion + 0.05, 5, 12)) * 30 : 0, look: -0.4 }}
            extras={{ tux: true, trophy: t > champion - 0.1 ? trophy : 0, clock: t }}
          />
          {/* The trophy, dropping in from above to the champion's fins. */}
          {trophyDrop > 0 && t < champion - 0.1 && (
            <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
              <g transform={`translate(960 ${mix(-220, 620 - 320 * 0.92, trophyDrop)}) rotate(${(1 - trophyDrop) * 30}) scale(${0.9 * 0.92})`}>
                <TrophyShape />
              </g>
            </svg>
          )}
        </Shake>
        {t > champion - 0.05 && t < champion + 2 && (
          <>
            <div className="absolute" style={{ left: 300, top: -40 }}>
              <Burst at={champion + 0.02} count={36} speed={1100} gravity={900} size={22} direction={60} spread={70} colors={[TOY.butter.hex, "#FFF4DC", TOY.tangerine.hex, TOY.teal.hex]} seed={41} />
            </div>
            <div className="absolute" style={{ left: 1620, top: -40 }}>
              <Burst at={champion + 0.08} count={36} speed={1100} gravity={900} size={22} direction={120} spread={70} colors={[TOY.butter.hex, "#FFF4DC", TOY.tangerine.hex, TOY.bubblegum.hex]} seed={43} />
            </div>
          </>
        )}
      </div>

      <Slam text="The Final" at={final - 0.02} out={champion - 0.25} x={960} y={250} size={170} tone="gold" rotate={-4} />
      <Slam text="Champion" at={champion - 0.02} out={everyone - 0.1} x={960} y={770} size={180} tone="gold" rotate={-3} />
    </div>
  );
}

const UNDERLINE: Ink[] = [{ d: "M 60 60 C 260 10 420 110 620 50 S 900 20 960 70", color: TOY.butter.hex, width: 30, weight: 1 }];

/** A giant pencil, tip at (x, y), leaning into the stroke. */
function Pencil({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} style={{ overflow: "visible" }} aria-hidden="true">
      <g transform={`translate(${x} ${y}) rotate(${angle})`}>
        <path d="M 0 0 L 40 -90 L 80 -60 Z" fill="#F6D7A7" stroke={INK} strokeWidth={7} strokeLinejoin="round" />
        <path d="M 0 0 L 14 -32 L 28 -21 Z" fill={TOY.charcoal.hex} />
        <path d="M 40 -90 L 300 -440 L 340 -410 L 80 -60 Z" fill={TOY.tangerine.hex} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
        <path d="M 58 -78 L 318 -426" stroke="#ffffff" strokeWidth={8} opacity={0.35} />
        <path d="M 300 -440 L 330 -480 L 370 -450 L 340 -410 Z" fill="#C9CED6" stroke={INK} strokeWidth={7} strokeLinejoin="round" />
        <path d="M 330 -480 L 352 -510 C 362 -524 392 -504 392 -480 L 370 -450 Z" fill={TOY.bubblegum.hex} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A boxing bell that rings at `at`. */
function Bell({ t, at, x, y }: { t: number; at: number; x: number; y: number }) {
  const ring = t > at ? Math.exp(-(t - at) * 3) * Math.sin((t - at) * 60) : 0;
  const lines = t > at && t < at + 0.8 ? 1 - progress(t, at, 0.8) : 0;
  return (
    <svg className="pointer-events-none absolute inset-0" width={1920} height={1080} aria-hidden="true">
      <g transform={`translate(${x} ${y}) rotate(${ring * 10})`}>
        <rect x={-14} y={-130} width={28} height={50} fill={TOY.charcoal.hex} stroke={INK} strokeWidth={6} />
        <path d="M -100 30 C -100 -70 -50 -96 0 -96 C 50 -96 100 -70 100 30 Z" fill={TOY.butter.hex} stroke={INK} strokeWidth={8} strokeLinejoin="round" />
        <rect x={-112} y={22} width={224} height={26} rx={12} fill={TOY.butter.dark} stroke={INK} strokeWidth={7} />
        <path d="M -60 -50 C -50 -70 -30 -80 -10 -82" stroke="#ffffff" strokeWidth={10} strokeLinecap="round" opacity={0.5} />
      </g>
      {lines > 0 &&
        [-1, 1].map((side) =>
          [0, 1, 2].map((index) => (
            <path
              key={`${side}${index}`}
              d={`M ${x + side * (130 + index * 10)} ${y - 60 + index * 46} l ${side * 50 * (1 - lines * 0.3)} ${(index - 1) * 16}`}
              stroke={TOY.butter.hex}
              strokeWidth={10}
              strokeLinecap="round"
              opacity={lines}
            />
          )),
        )}
    </svg>
  );
}

export function OutroShot() {
  const b = useLocalCues();
  const t = b.t;
  const now = b.word("outro", "now");
  const drawing = b.word("outro", "drawing");
  const end = b.end("outro");
  const card = end + 0.35;

  const scribble = progress(t, drawing + 0.05, 0.55, ease.inOutSine);
  const pencilIn = spring(t - (drawing - 0.2), SPRINGS.smooth);
  const pencilX = mix(440, 1400, scribble);
  const pencilY = 760 + Math.sin(scribble * Math.PI * 2.2) * 26;
  const cardIn = t > card;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {!cardIn && (
        <div className="absolute inset-0" style={{ opacity: 1 - progress(t, card - 0.12, 0.12) }}>
          <div
            className="absolute left-1/2 top-[44%] size-[2600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `repeating-conic-gradient(from ${t * 20}deg, color-mix(in srgb, var(--sf-tangerine) 22%, transparent) 0deg 8deg, transparent 8deg 16deg)`,
              maskImage: "radial-gradient(closest-side, black 25%, transparent)",
              WebkitMaskImage: "radial-gradient(closest-side, black 25%, transparent)",
            }}
          />
          <Shake at={[now + 0.08, drawing + 0.08]} strength={16} className="absolute inset-0">
            <Slam text="Drawing!" at={drawing - 0.04} x={980} y={520} size={230} tone="gold" rotate={-4} burst={TOY.tomato.hex} burstSize={0.62} />
            <Slam text="Now get" at={now - 0.02} x={880} y={290} size={180} tone="tangerine" rotate={-5} />
          </Shake>
          <svg className="pointer-events-none absolute" style={{ left: 440, top: 700 }} width={960} height={120} viewBox="0 0 1000 120" aria-hidden="true">
            <InkPaths strokes={UNDERLINE} progress={scribble} />
          </svg>
          {t > drawing - 0.2 && (
            <div style={{ transform: `translate(${(1 - pencilIn) * 900}px, ${(1 - pencilIn) * 300}px)` }}>
              <Pencil x={pencilX} y={pencilY} angle={-6 + Math.sin(scribble * 12) * 4} />
            </div>
          )}
          <Bell t={t} at={drawing + 0.02} x={1650} y={300} />
        </div>
      )}
      {cardIn && (
        <div className="absolute inset-0" style={{ opacity: progress(t, card, 0.12) }}>
          <Poster logo={card + 0.15 - b.local(0)} />
          <div
            className="absolute left-1/2 top-[492px] -translate-x-1/2 whitespace-nowrap rounded-[12px] px-[28px] py-[8px] uppercase"
            style={{
              background: TOY.tomato.hex,
              color: "#FFF4DC",
              fontFamily: FREDOKA,
              fontWeight: 700,
              fontSize: 36,
              letterSpacing: "0.12em",
              border: `4px solid ${INK}`,
              transform: `translateX(-50%) rotate(-1deg) scale(${spring(t - (card + 0.7), SPRINGS.pop)})`,
            }}
          >
            Now get drawing
          </div>
        </div>
      )}
      <Letterbox at={now - 0.06} out={card} height={110} />
    </div>
  );
}
