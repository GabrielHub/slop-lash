"use client";

import { Burst, STAMP_IMPACT, Stamp, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, interpolate, mix, progress, spring } from "@/tutorial/timeline";
import { At, Chip, useShot, type Shot } from "../parts";
import { StageLights, TitleSign } from "../title";

/**
 * The sting and `intro`: the show lights up, then a balance weighs "know
 * stuff" against "bet your friends don't", and tips hard to the bet.
 */

const PIVOT = { x: 960, y: 392 };
const ARM = 560;
const STRING = 268;

/** The intro's beats, in local seconds. */
export function openBeats(shot: Shot) {
  return {
    sign: 0.2,
    welcome: shot.word("intro", "QuizSlop!"),
    shrink: shot.word("intro", "the"),
    balance: shot.word("intro", "where"),
    know: shot.word("intro", "knowing"),
    good: shot.word("intro", "good..."),
    bet: shot.word("intro", "betting"),
    better: shot.word("intro", "better."),
  };
}

export function OpenShot() {
  const shot = useShot();
  const { t } = shot;
  const beats = openBeats(shot);

  // The title shrinks up out of the way of the balance.
  const lift = spring(t - beats.shrink, SPRINGS.gentle);
  const titleY = mix(500, 136, lift);
  const titleScale = mix(1, 0.36, lift);

  // Lights: on the title for the sting, then on whichever side is winning.
  const toPans = progress(t, beats.shrink, 0.9, ease.inOut);
  const leftOn = progress(t, beats.know, 0.3);
  const rightOn = progress(t, beats.bet, 0.3);
  const aimLeft = { x: mix(960, 400, toPans), y: mix(520, 620, toPans) };
  const aimRight = { x: mix(960, 1520, toPans), y: mix(520, 660, toPans) };
  const strengthLeft = mix(1, mix(0.25, 1, leftOn) * mix(1, 0.3, rightOn), toPans);
  const strengthRight = mix(1, mix(0.25, 0.25, leftOn) + rightOn * 0.85, toPans);

  return (
    <div className="absolute inset-0">
      <StageLights
        at={0.05}
        aim={[aimLeft, aimRight]}
        strength={[strengthLeft, Math.min(1, strengthRight)]}
      />

      <Balance beats={beats} t={t} />

      <At x={960} y={titleY}>
        <div style={{ transform: `scale(${titleScale})` }}>
          <TitleSign at={beats.sign} flashAt={[beats.welcome]} />
        </div>
      </At>

      {/* Confetti kicks off both ends of the sign as the letters land. */}
      <At x={430} y={560} corner>
        <Burst at={1.15} count={26} direction={-115} spread={60} speed={1300} seed={3} size={20} />
      </At>
      <At x={1490} y={560} corner>
        <Burst at={1.2} count={26} direction={-65} spread={60} speed={1300} seed={8} size={20} />
      </At>
    </div>
  );
}

function Balance({ beats, t }: { beats: ReturnType<typeof openBeats>; t: number }) {
  const shown = spring(t - beats.balance, SPRINGS.smooth);
  if (t < beats.balance - 0.1) return null;

  // Each card falls onto its pan, landing 0.32s after its word.
  const fall = 0.32;
  const landLeft = beats.know + fall;
  const landRight = beats.bet + fall;
  const tilt =
    -7 * spring(t - landLeft, SPRINGS.jelly) +
    19 * spring(t - landRight, { stiffness: 260, damping: 11, mass: 1 }) +
    2.5 * Math.sin(clamp((t - beats.better - STAMP_IMPACT) / 0.4) * Math.PI);
  const radians = (tilt * Math.PI) / 180;
  const end = (side: -1 | 1) => ({
    x: PIVOT.x + side * ARM * Math.cos(radians),
    y: PIVOT.y + side * ARM * Math.sin(radians),
  });
  const left = end(-1);
  const right = end(1);
  const shake = shakeOffset(t, beats.better + STAMP_IMPACT, 12, 0.35);
  const thud = shakeOffset(t, landRight, 9, 0.3);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: clamp(shown * 1.5),
        transform: `translate(${shake.x + thud.x}px, ${(1 - shown) * 160 + shake.y + thud.y}px)`,
      }}
    >
      {/* The stand. */}
      <div
        className="absolute rounded-full"
        style={{
          left: PIVOT.x - 15,
          top: PIVOT.y,
          width: 30,
          height: 420,
          background: "linear-gradient(90deg, color-mix(in srgb, var(--gold) 70%, var(--surface)), var(--gold) 45%, color-mix(in srgb, var(--gold) 55%, var(--raised)))",
        }}
      />
      <div
        className="absolute rounded-t-[60px] border-[4px] border-gold"
        style={{
          left: PIVOT.x - 170,
          top: PIVOT.y + 400,
          width: 340,
          height: 56,
          background: "linear-gradient(180deg, color-mix(in srgb, var(--gold) 25%, var(--raised)), var(--surface))",
        }}
      />

      {/* Strings, pans and cards: they hang straight down from the beam ends. */}
      <Pan end={left} tone="teal" />
      <Pan end={right} tone="punch" />

      {/* The beam. */}
      <div
        className="absolute rounded-full border-[4px] border-gold"
        style={{
          left: PIVOT.x - ARM - 20,
          top: PIVOT.y - 14,
          width: ARM * 2 + 40,
          height: 28,
          transform: `rotate(${tilt}deg)`,
          background: "linear-gradient(180deg, color-mix(in srgb, var(--gold) 45%, var(--surface)), color-mix(in srgb, var(--gold) 20%, var(--raised)))",
        }}
      />
      <div
        className="absolute rounded-full border-[5px] border-gold bg-surface"
        style={{ left: PIVOT.x - 30, top: PIVOT.y - 30, width: 60, height: 60 }}
      />

      <PanCard
        end={left}
        t={t}
        land={landLeft}
        fall={fall}
        width={400}
        height={170}
        tone="teal"
        label="KNOW STUFF"
        tag="GOOD"
        tagAt={beats.good}
      />
      <PanCard
        end={right}
        t={t}
        land={landRight}
        fall={fall}
        width={450}
        height={210}
        tone="punch"
        label="BET YOUR FRIENDS DON'T"
        stampAt={beats.better}
      />
    </div>
  );
}

function Pan({ end, tone }: { end: { x: number; y: number }; tone: "teal" | "punch" }) {
  const color = tone === "teal" ? "var(--teal)" : "var(--punch)";
  const panY = end.y + STRING;
  return (
    <>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden="true">
        <path
          d={`M ${end.x} ${end.y} L ${end.x - 200} ${panY} M ${end.x} ${end.y} L ${end.x + 200} ${panY}`}
          stroke="var(--gold)"
          strokeWidth={4}
          strokeOpacity={0.75}
          fill="none"
        />
      </svg>
      <div
        className="absolute"
        style={{
          left: end.x - 230,
          top: panY - 6,
          width: 460,
          height: 46,
          borderRadius: "0 0 230px 230px / 0 0 46px 46px",
          background: `linear-gradient(180deg, color-mix(in srgb, var(--gold) 55%, var(--surface)), color-mix(in srgb, var(--gold) 25%, var(--raised)))`,
          borderTop: `6px solid ${color}`,
        }}
      />
      <div
        className="absolute rounded-full bg-gold"
        style={{ left: end.x - 11, top: end.y - 11, width: 22, height: 22 }}
      />
    </>
  );
}

function PanCard({
  end,
  t,
  land,
  fall,
  width,
  height,
  tone,
  label,
  tag,
  tagAt,
  stampAt,
}: {
  end: { x: number; y: number };
  t: number;
  land: number;
  fall: number;
  width: number;
  height: number;
  tone: "teal" | "punch";
  label: string;
  tag?: string;
  tagAt?: number;
  stampAt?: number;
}) {
  if (t < land - fall) return null;
  const drop = interpolate(t, [land - fall, land], [-640, 0], ease.in);
  const squash = t < land ? 1 : 1 - 0.1 * Math.exp(-(t - land) * 9) * Math.cos((t - land) * 30);
  const bottom = end.y + STRING - 4;
  const border = tone === "teal" ? "border-teal" : "border-punch";
  return (
    <div
      className="absolute"
      style={{
        left: end.x - width / 2,
        top: bottom - height + drop,
        width,
        height,
        transformOrigin: "50% 100%",
        transform: `scale(${2 - squash}, ${squash})`,
      }}
    >
      <div
        className={`grid h-full w-full place-items-center rounded-[28px] border-[4px] bg-surface px-[26px] text-center font-display text-[54px] font-black leading-[1.02] text-ink ${border}`}
        style={{ boxShadow: "0 30px 50px -26px rgba(0,0,0,0.55)" }}
      >
        {label}
      </div>
      {tone === "punch" && (
        <div className="absolute -left-[46px] -top-[40px]" style={{ transform: "rotate(-14deg)" }}>
          <Chip size={96} />
        </div>
      )}
      {tag && tagAt !== undefined && t >= tagAt && (
        <div
          className="absolute left-1/2 top-[-58px] rounded-full bg-teal px-[26px] py-[6px] font-display text-[40px] font-black tracking-[0.08em] text-accent-ink"
          style={{
            transform: `translateX(-50%) scale(${spring(t - tagAt, SPRINGS.pop)})`,
          }}
        >
          {tag}
        </div>
      )}
      {stampAt !== undefined && (
        <div className="absolute left-1/2 top-[-74px] -translate-x-1/2">
          <Stamp text="BETTER" at={stampAt} tone="punch" rotate={-6} size={76} />
        </div>
      )}
    </div>
  );
}
