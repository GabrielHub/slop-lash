"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Burst, Count } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { STANDINGS } from "../content";
import { At, Token } from "../parts";
import { StageLights, TitleSign } from "../title";

/**
 * `outro`: most points wins (bars rise, worst first, the winner crowned),
 * "Phones out, brains on!", and the marquee lights up once more.
 */

const BAR = { width: 210, gap: 44, floor: 790, tall: 350 };
const LEFT = (1920 - (STANDINGS.length * BAR.width + (STANDINGS.length - 1) * BAR.gap)) / 2;

export function OutroShot() {
  const shot = useLocalCues();
  const { t } = shot;
  const points = shot.word("outro", "points");
  const wins = shot.word("outro", "wins.");
  const phones = shot.word("outro", "Phones");
  const out = shot.word("outro", "out,");
  const brains = shot.word("outro", "brains");
  const on = shot.word("outro", "on!");
  const lets = shot.word("outro", "Let's");
  const quizslop = shot.word("outro", "QuizSlop!");

  const boardOut = progress(t, phones - 0.15, 0.35, ease.in);
  const slogansOut = progress(t, lets - 0.1, 0.3, ease.in);
  const top = Math.max(...STANDINGS.map((entry) => entry.total));
  const worstFirst = [...STANDINGS].sort((a, b) => a.total - b.total);
  const winner = worstFirst.at(-1)!;

  return (
    <div className="absolute inset-0">
      {boardOut < 1 && (
        <div className="absolute inset-0" style={{ opacity: 1 - boardOut, transform: `translateY(${boardOut * 120}px)` }}>
          <At x={960} y={196}>
            <p
              className="whitespace-nowrap font-display text-[56px] text-ink-dim"
              style={{ opacity: progress(t, 0.05, 0.3) * (1 - progress(t, wins, 0.15)) }}
            >
              And the winner is…
            </p>
          </At>
          <At x={960} y={196}>
            <p
              className="whitespace-nowrap font-display text-[64px] font-black text-gold qs-marquee-text"
              style={{ opacity: progress(t, wins + 0.05, 0.2), transform: `scale(${mix(0.7, 1, spring(t - wins, SPRINGS.pop))})` }}
            >
              Your champion
            </p>
          </At>
          {STANDINGS.map((entry, seat) => {
            const isWinner = entry.name === winner.name;
            const rank = worstFirst.indexOf(entry);
            const at = isWinner ? wins : points + rank * 0.14;
            const grow = spring(t - at, isWinner ? SPRINGS.slam : SPRINGS.smooth);
            const height = (0.12 + (0.88 * entry.total) / top) * BAR.tall;
            const left = LEFT + seat * (BAR.width + BAR.gap);
            const crown = spring(t - (wins + 0.15), SPRINGS.jelly);
            return (
              <div key={entry.name}>
                <div
                  className={`absolute origin-bottom rounded-t-[22px] ${isWinner ? "bg-gold" : "border-[3px] border-edge-strong bg-raised"}`}
                  style={{
                    left,
                    top: BAR.floor - height,
                    width: BAR.width,
                    height,
                    transform: `scaleY(${Math.max(0, grow)})`,
                    boxShadow: isWinner ? "0 0 60px -10px color-mix(in srgb, var(--gold) 60%, transparent)" : undefined,
                  }}
                />
                <div
                  className="absolute flex flex-col items-center"
                  style={{ left, width: BAR.width, top: BAR.floor - height * Math.max(0, grow) - 84, opacity: clamp(grow * 3) }}
                >
                  <span className={`font-display text-[52px] font-black ${isWinner ? "text-gold" : "text-ink"}`}>
                    <Count from={0} to={entry.total} at={at} duration={0.6} />
                  </span>
                </div>
                {isWinner && crown > 0.001 && (
                  <div
                    className="absolute"
                    style={{
                      left: left + BAR.width / 2 - 50,
                      top: BAR.floor - height - 190,
                      transform: `translateY(${(1 - crown) * -80}px) rotate(${(1 - crown) * -30}deg) scale(${crown})`,
                    }}
                  >
                    <Crown />
                  </div>
                )}
                <div
                  className="absolute flex items-center justify-center gap-[12px]"
                  style={{ left, width: BAR.width, top: BAR.floor + 18, opacity: progress(t, 0.1 + seat * 0.05, 0.3) }}
                >
                  <Token name={entry.name} size={52} />
                  <span className={`font-display text-[38px] font-bold ${isWinner && t >= wins ? "text-gold" : "text-ink"}`}>
                    {entry.name}
                  </span>
                </div>
                {isWinner && (
                  <At x={left + BAR.width / 2} y={BAR.floor - height} corner>
                    <Burst at={wins + 0.1} count={30} speed={1100} size={18} seed={21} />
                  </At>
                )}
              </div>
            );
          })}
        </div>
      )}

      {t >= phones - 0.2 && slogansOut < 1 && (
        <div className="absolute inset-0" style={{ opacity: 1 - slogansOut, transform: `translateY(${slogansOut * -80}px)` }}>
          <Slogan t={t} at={phones} accentAt={out} y={410} lead="Phones" accent="out," tone="text-punch" />
          <Slogan t={t} at={brains} accentAt={on} y={630} lead="brains" accent="on!" tone="text-teal" />
        </div>
      )}

      {t >= lets - 0.4 && (
        <>
          <StageLights
            at={lets - 0.3}
            aim={[
              { x: 960, y: 560 },
              { x: 960, y: 560 },
            ]}
            strength={[1, 1]}
          />
          <At x={960} y={540}>
            <TitleSign at={lets - 0.15} flashAt={[quizslop]} kicker="Let's play" />
          </At>
          <At x={60} y={1080} corner>
            <Burst at={quizslop} count={36} direction={-62} spread={34} speed={2100} gravity={1300} duration={2.4} size={22} seed={31} />
          </At>
          <At x={1860} y={1080} corner>
            <Burst at={quizslop + 0.05} count={36} direction={-118} spread={34} speed={2100} gravity={1300} duration={2.4} size={22} seed={37} />
          </At>
        </>
      )}
    </div>
  );
}

function Slogan({
  t,
  at,
  accentAt,
  y,
  lead,
  accent,
  tone,
}: {
  t: number;
  at: number;
  accentAt: number;
  y: number;
  lead: string;
  accent: string;
  tone: string;
}) {
  const leadIn = spring(t - at, SPRINGS.slam);
  const accentIn = spring(t - accentAt, SPRINGS.jelly);
  return (
    <At x={960} y={y}>
      <p className="flex items-baseline gap-[0.25em] whitespace-nowrap font-display text-[180px] font-black uppercase leading-none tracking-[-0.01em]">
        <span
          className="inline-block text-ink"
          style={{ opacity: clamp(leadIn * 3), transform: `translateY(${(1 - leadIn) * 80}px) scale(${mix(1.4, 1, leadIn)})` }}
        >
          {lead}
        </span>
        <span
          className={`inline-block ${tone}`}
          style={{ opacity: clamp(accentIn * 3), transform: `scale(${accentIn}) rotate(${(1 - accentIn) * -12}deg)` }}
        >
          {accent}
        </span>
      </p>
    </At>
  );
}

function Crown() {
  return (
    <svg viewBox="0 0 100 80" width={100} height={80} aria-hidden="true">
      <path
        d="M8 70 L14 22 L34 44 L50 8 L66 44 L86 22 L92 70 Z"
        fill="var(--gold)"
        stroke="color-mix(in srgb, var(--gold) 60%, var(--ink))"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <circle cx={50} cy={8} r={6} fill="var(--punch)" />
      <circle cx={14} cy={22} r={5} fill="var(--teal)" />
      <circle cx={86} cy={22} r={5} fill="var(--teal)" />
    </svg>
  );
}
