"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Count } from "@/tutorial/kit";
import { SPRINGS, clamp, mix, progress, spring } from "@/tutorial/timeline";
import { LETTERS, type PlayerName } from "../content";
import { At, JudgeHead, Tile } from "../parts";
import { practice } from "../practice";

/**
 * `points`: the scoring, side by side. Right is +100; wrong is nothing at all
 * (never minus), plus three friends peeking over to judge.
 */

const WRONG = 0;

export function PointsShot() {
  const shot = useLocalCues();
  const { t } = shot;
  const right = shot.word("points", "right");
  const hundred = shot.word("points", "hundred");
  const pointsEnd = shot.wordEnd("points", "points.");
  const wrong = shot.word("points", "wrong,");
  const nothing = shot.word("points", "nothing.");
  const except = shot.word("points", "Except");
  const judged = shot.word("points", "judged.");

  const leftIn = spring(t + 0.05, SPRINGS.smooth);
  const rightIn = spring(t - (wrong - 0.3), SPRINGS.smooth);
  const zeroDrop = t >= nothing ? spring(t - nothing, SPRINGS.jelly) : 0;
  const sag = t >= nothing ? Math.sin((t - nothing) * 7) * Math.exp(-(t - nothing) * 2.4) * 10 : 0;
  const plus = t >= pointsEnd ? Math.sin(clamp((t - pointsEnd) / 0.3) * Math.PI) * 0.1 : 0;
  const leftDim = progress(t, wrong - 0.2, 0.3) * 0.45;

  return (
    <div className="absolute inset-0">
      <At x={560} y={560}>
        <div
          className="flex h-[440px] w-[760px] flex-col items-center justify-center gap-[24px] rounded-[40px] border-[4px] border-win bg-surface"
          style={{
            opacity: clamp(leftIn * 1.5) * (1 - leftDim),
            transform: `translateX(${(1 - leftIn) * -260}px) scale(${mix(0.9, 1, leftIn) * (1 - leftDim * 0.1)})`,
            boxShadow: "inset 0 0 0 999px color-mix(in srgb, var(--win) 8%, transparent), 0 40px 70px -40px rgba(0,0,0,0.6)",
          }}
        >
          <p className="font-display text-[46px] font-black uppercase tracking-[0.08em] text-win">Right answer</p>
          <Tile
            letter={LETTERS[practice.answer]}
            text={practice.choices[practice.answer]}
            width={620}
            state={t >= right ? "lit" : "idle"}
          />
          <span
            className="font-display text-[150px] font-black leading-none text-win"
            style={{ transform: `scale(${1 + plus})` }}
          >
            <Count
              from={0}
              to={100}
              at={hundred}
              duration={Math.max(0.45, pointsEnd - hundred)}
              format={(value) => `+${Math.round(value)}`}
            />
          </span>
        </div>
      </At>

      {rightIn > 0.001 && (
        <At x={1360} y={560}>
          <div
            className="relative"
            style={{
              opacity: clamp(rightIn * 1.5),
              transform: `translateX(${(1 - rightIn) * 260}px) scale(${mix(0.9, 1, rightIn)})`,
            }}
          >
            <Judges t={t} except={except} judged={judged} />
            <div
              className="relative flex h-[440px] w-[760px] flex-col items-center justify-center gap-[24px] rounded-[40px] border-[4px] border-edge-strong bg-surface"
              style={{ boxShadow: "0 40px 70px -40px rgba(0,0,0,0.6)" }}
            >
              <p className="font-display text-[46px] font-black uppercase tracking-[0.08em] text-ink-dim">
                Wrong answer
              </p>
              <Tile letter={LETTERS[WRONG]} text={practice.choices[WRONG]} width={620} state="dim" />
              <span
                className="block font-display text-[150px] font-black leading-none text-ink-dim"
                style={{
                  opacity: clamp(zeroDrop * 2),
                  transform: `translateY(${(1 - zeroDrop) * -160}px) rotate(${sag}deg)`,
                  transformOrigin: "50% 100%",
                }}
              >
                0
              </span>
            </div>
          </div>
        </At>
      )}
    </div>
  );
}

/** Three friends peek over the card, then give the deadpan side-eye. */
function Judges({ t, except, judged }: { t: number; except: number; judged: number }) {
  const judges: { name: PlayerName; x: number; delay: number }[] = [
    { name: "Sam", x: 170, delay: 0 },
    { name: "Ana", x: 380, delay: 0.12 },
    { name: "Jo", x: 590, delay: 0.06 },
  ];
  const look = -spring(t - judged, SPRINGS.smooth);
  const lid = mix(0.1, 0.55, spring(t - (judged + 0.05), SPRINGS.smooth));
  // One slow, unimpressed blink.
  const blink = t > judged + 0.7 && t < judged + 0.86 ? 1 : 0;
  return (
    <div className="absolute inset-x-0 top-0">
      {judges.map((judge) => {
        const peek = spring(t - (except + judge.delay), SPRINGS.smooth);
        if (peek <= 0.001) return null;
        return (
          <div key={judge.name} className="absolute" style={{ left: judge.x - 75, top: mix(40, -96, peek) }}>
            <JudgeHead name={judge.name} size={150} look={look} lid={Math.max(lid, blink)} />
          </div>
        );
      })}
    </div>
  );
}
