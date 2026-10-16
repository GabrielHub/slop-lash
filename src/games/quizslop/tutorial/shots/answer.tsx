"use client";

import { PhoneMock, STAMP_IMPACT, Stamp, Tap, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { DEMO, ROUND_QUESTIONS, type PlayerName } from "../content";
import { At, Token, TvFrame, phonePoint, useShot } from "../parts";
import { AnswerScreen, CheckMark, Pill, choiceButton } from "../screens";

/**
 * `answer`: every phone gets its own question from the round's topic (as in
 * the real game, no two match); Ana's fills the frame, the host
 * counts the four choices, and one tap locks B in while the TV ticks off who
 * has answered.
 */

const OWNERS: readonly PlayerName[] = ["Ana", "Sam", "Jo", "Max"];
const WIDE = { width: 290, top: 168, xs: [300, 740, 1180, 1620] };
/** Sized so the whole phone clears the caption band (y 900 and below). */
const CLOSE = { width: 360, left: 300, top: 118 };

export function AnswerShot() {
  const shot = useShot();
  const { t } = shot;
  const everybody = shot.word("answer", "everybody");
  const questionAt = shot.word("answer", "question");
  const four = shot.word("answer", "Four");
  const choices = shot.word("answer", "choices.");
  const tapAt = shot.word("answer", "tap");
  const locks = shot.word("answer", "locks");

  const close = spring(t - four, SPRINGS.gentle);
  // Clear out before the REHEARSAL sign arrives.
  const leave = progress(t, shot.end("answer", -0.1), 0.4, ease.in);
  const locked = progress(t, tapAt + 0.04, 0.2, ease.out);

  return (
    <div className="absolute inset-0">
      {OWNERS.map((owner, index) => {
        const rise = spring(t - (everybody - 0.1 + index * 0.09), SPRINGS.smooth);
        if (rise <= 0.001 || leave >= 1) return null;
        const ana = index === 0;
        if (!ana && close > 0.999) return null;
        const width = ana ? mix(WIDE.width, CLOSE.width, close) : WIDE.width;
        // Ana's phone exits stage left, so it never crosses the captions on the way out.
        const centre = (ana ? mix(WIDE.xs[0], CLOSE.left + CLOSE.width / 2, close) : WIDE.xs[index] + close * 1300) - leave * 1100;
        const top = (ana ? mix(WIDE.top, CLOSE.top, close) : WIDE.top) + (1 - rise) * 800;
        const phone = { left: centre - width / 2, top, width };
        const question = ROUND_QUESTIONS[owner];
        const lit = question.choices.map((_, choice) => progress(t, questionAt + 0.1 + choice * 0.07, 0.3, ease.out));
        const pulse = question.choices.map((_, choice) => {
          const at = choices - 0.2 + choice * 0.15;
          return t < at ? 0 : Math.sin(clamp((t - at) / 0.32) * Math.PI);
        });
        return (
          <div key={owner}>
            <At x={phone.left} y={phone.top} corner style={{ opacity: ana ? 1 : 1 - close }}>
              <PhoneMock width={width}>
                <AnswerScreen
                  owner={owner}
                  question={question}
                  lit={t >= questionAt ? lit : [0, 0, 0, 0]}
                  pulse={ana ? pulse : undefined}
                  locked={ana ? locked : 0}
                />
              </PhoneMock>
            </At>
            <At x={centre} y={top + 640} style={{ opacity: clamp(rise * 2) * (1 - (ana ? close * 3 : close)) }}>
              <NameTag name={owner} />
            </At>
            {ana && <PhoneHits t={t} phone={phone} tapAt={tapAt} locks={locks} />}
          </div>
        );
      })}

      <AnswerTv t={t} at={four + 0.2} tapAt={tapAt} leave={leave} />
    </div>
  );
}

function NameTag({ name }: { name: PlayerName }) {
  return (
    <div className="flex items-center gap-[12px] whitespace-nowrap rounded-full bg-surface py-[6px] pl-[8px] pr-[22px] shadow-[0_12px_24px_-14px_rgba(0,0,0,0.5)]">
      <Token name={name} size={46} />
      <span className="font-display text-[32px] font-bold text-ink">{name}</span>
    </div>
  );
}

/** The finger on B, and the LOCKED IN stamp across the phone. */
function PhoneHits({
  t,
  phone,
  tapAt,
  locks,
}: {
  t: number;
  phone: { left: number; top: number; width: number };
  tapAt: number;
  locks: number;
}) {
  const button = choiceButton(DEMO.correct);
  const spot = phonePoint(phone, button.u + button.width / 2, button.v + button.height / 2);
  const centre = phonePoint(phone, 195, 300);
  const shake = shakeOffset(t, locks + STAMP_IMPACT, 10, 0.3);
  return (
    <>
      <At x={spot.x} y={spot.y}>
        <Tap at={tapAt} size={84} />
      </At>
      <At x={centre.x + shake.x} y={centre.y + shake.y} className="z-10">
        <Stamp text="LOCKED IN" at={locks} tone="teal" rotate={-7} size={70} />
      </At>
    </>
  );
}

/** The TV meanwhile: "Answer on your phone", what a right answer is worth, and who has locked in. */
function AnswerTv({ t, at, tapAt, leave }: { t: number; at: number; tapAt: number; leave: number }) {
  const shown = spring(t - at, SPRINGS.smooth);
  if (shown <= 0.001 || leave >= 1) return null;
  // The others lock in around Ana.
  const lockTimes: Record<PlayerName, number> = { Ana: tapAt + 0.1, Sam: tapAt - 0.5, Jo: tapAt + 0.55, Max: tapAt + 0.9 };
  const timer = clamp((t - at + 9) / 30);
  return (
    <At x={1330 + (1 - shown) * 700 + leave * 800} y={470}>
      <TvFrame width={880}>
        <div className="absolute inset-0 flex flex-col items-center">
          <p className="mt-[70px] text-[40px] text-ink-dim">
            {DEMO.topic}
          </p>
          <p className="mt-[16px] font-display text-[84px] leading-none text-ink">Answer on your phone</p>
          <div className="mt-[34px]">
            <Pill tone="win" size={52}>
              Right answer +100
            </Pill>
          </div>
          <div className="mt-[64px] flex gap-[30px]">
            {OWNERS.map((name) => {
              const done = spring(t - lockTimes[name], SPRINGS.pop);
              return (
                <span key={name} className="relative" style={{ opacity: mix(0.4, 1, clamp(done)) }}>
                  <Token name={name} size={104} />
                  <span
                    className="absolute -bottom-[6px] -right-[6px] grid size-[44px] place-items-center rounded-full bg-win text-accent-ink"
                    style={{ transform: `scale(${Math.max(0, done)})` }}
                  >
                    <CheckMark size={28} />
                  </span>
                </span>
              );
            })}
          </div>
        </div>
        <TimerRing left={1 - timer} />
      </TvFrame>
    </At>
  );
}

/** The answer clock in the TV's corner, seconds left of 30. */
export function TimerRing({ left }: { left: number }) {
  const radius = 46;
  const length = 2 * Math.PI * radius;
  return (
    <div className="absolute right-[40px] top-[36px] size-[116px]">
      <svg viewBox="0 0 116 116" className="absolute inset-0" aria-hidden="true">
        <circle cx={58} cy={58} r={radius} fill="none" stroke="var(--edge)" strokeWidth={10} />
        <circle
          cx={58}
          cy={58}
          r={radius}
          fill="none"
          stroke="var(--teal)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - left)}
          transform="rotate(-90 58 58)"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[40px] font-bold text-ink">
        {Math.ceil(left * 30)}
      </span>
    </div>
  );
}
