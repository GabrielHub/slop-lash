"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Count, PhoneMock, Tap, flight, phonePoint, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, interpolate, mix, progress, spring } from "@/tutorial/timeline";
import { MINUS } from "../content";
import { At, Chip, Token, TvFrame } from "../parts";
import { BetScreen, BetTv, CheckMark, betButton } from "../screens";

/**
 * `bets` and `payout`: "the fun part" spins in as a giant chip; then the TV
 * opens the round with "Pick who gets it wrong";
 * Ana's phone sizes up her friends and calls Sam; a chip lands on Sam. Then
 * the stakes split: Sam misses, Ana wins 150; Sam's right, Ana loses 150.
 */

/** Sized so the whole phone, "Skip, no bet" included, clears the caption band. */
const PHONE_WIDTH = 360;
const TOKEN_HOME = { x: 1250, y: 430 };
const TOKEN_PAYOUT = { x: 960, y: 268 };

export function BetsShot() {
  const shot = useLocalCues();
  const { t } = shot;
  const fun = shot.word("bets", "fun");
  const every = shot.word("bets", "Every");
  const round = shot.word("bets", "round");
  const bets = shot.word("bets", "bets.");
  const think = shot.word("bets", "Think");
  const scan = [shot.word("bets", "friend"), shot.word("bets", "about"), shot.word("bets", "get")];
  const wrong = shot.word("bets", "wrong?");
  const call = shot.word("bets", "Call");
  const it = shot.word("bets", "it.");
  const payout = shot.at("payout");
  const missWord = shot.word("payout", "miss,");
  const winWord = shot.word("payout", "win");
  const fifty = shot.wordEnd("payout", "fifty.");
  const rightWord = shot.word("payout", "right...");
  const loseWord = shot.word("payout", "lose");
  const fifty2 = shot.wordEnd("payout", "fifty.", 1);
  const exit = shot.end("payout", 0.15);

  // The TV holds centre stage, steps aside for the phone, then leaves when the bet is placed.
  const aside = spring(t - think, SPRINGS.gentle);
  const tvGone = progress(t, call + 0.1, 0.45, ease.in);
  const tvIn = spring(t - (every - 0.15), SPRINGS.smooth);
  const tvX = mix(960, 1300, aside) + tvGone * 900;
  const tvScale = mix(1, 0.82, aside);

  // Ana's phone rises on the left, then drops away for the payout.
  const phoneIn = spring(t - (think + 0.1), SPRINGS.smooth);
  const phoneOut = progress(t, payout - 0.05, 0.45, ease.in);
  const phone = { left: 320 - phoneOut * 120, top: 120 + (1 - phoneIn) * 900 + phoneOut * 900, width: PHONE_WIDTH };
  const pressed = progress(t, call, 0.12);
  const placed = progress(t, it + 0.1, 0.3, ease.out);

  // Sam's token: in where the TV was, then up to centre for the payout.
  const tokenIn = spring(t - (call + 0.15), SPRINGS.pop);
  const toCentre = spring(t - payout, SPRINGS.smooth);
  const tokenOut = progress(t, exit, 0.35, ease.in);
  const token = {
    x: mix(TOKEN_HOME.x, TOKEN_PAYOUT.x, toCentre),
    y: mix(TOKEN_HOME.y, TOKEN_PAYOUT.y, toCentre) - tokenOut * 500,
    size: mix(220, 170, toCentre),
  };
  const samButton = betButton(0);
  const samSpot = phonePoint(phone, samButton.u + samButton.width / 2, samButton.v + samButton.height / 2);

  return (
    <div className="absolute inset-0">
      <FunPart t={t} at={fun - 0.12} out={every - 0.2} />

      {tvIn > 0.001 && tvGone < 1 && (
        <At x={tvX} y={470}>
          <div style={{ transform: `scale(${tvScale * mix(0.9, 1, tvIn)})`, opacity: clamp(tvIn * 1.5) }}>
            <TvFrame width={1100}>
              <BetTv
                kicker={spring(t - every, SPRINGS.smooth)}
                title={spring(t - round, SPRINGS.slam)}
                body={spring(t - bets, SPRINGS.smooth)}
                pills={spring(t - (bets + 0.3), SPRINGS.pop)}
                tracker={spring(t - (bets + 0.6), SPRINGS.smooth)}
                decided={spring(t - (call + 0.05), SPRINGS.pop)}
              />
            </TvFrame>
          </div>
        </At>
      )}

      {phoneIn > 0.001 && phoneOut < 1 && (
        <At x={phone.left} y={phone.top} corner>
          <PhoneMock width={PHONE_WIDTH}>
            <BetScreen placed={placed} pressed={pressed} />
          </PhoneMock>
        </At>
      )}

      {phoneOut < 1 && <Suspicion t={t} phone={phone} scan={scan} lock={wrong} gone={call} />}
      {phoneOut < 1 && (
        <At x={samSpot.x} y={samSpot.y}>
          <Tap at={call} size={80} />
        </At>
      )}

      {tokenIn > 0.001 && tokenOut < 1 && (
        <SamToken
          t={t}
          token={token}
          shown={tokenIn}
          missAt={missWord}
          rightAt={rightWord}
          label={1 - progress(t, payout, 0.25)}
        />
      )}

      <BetChipFlight t={t} from={samSpot} at={call + 0.22} token={token} lose={loseWord} gone={exit} />

      <PayoutPanel
        t={t}
        side="left"
        at={missWord}
        countAt={winWord}
        countEnd={fifty}
        dim={progress(t, rightWord, 0.3) * (1 - progress(t, fifty2 + 0.1, 0.3))}
        out={exit}
      />
      <PayoutPanel t={t} side="right" at={rightWord} countAt={loseWord} countEnd={fifty2} dim={0} out={exit} />
    </div>
  );
}

/** "Now, the fun part": a giant bet chip spins in under the words. */
function FunPart({ t, at, out }: { t: number; at: number; out: number }) {
  const shown = spring(t - at, SPRINGS.jelly);
  const leave = progress(t, out, 0.3, ease.in);
  if (shown <= 0.001 || leave >= 1) return null;
  const roll = spring(t - at, SPRINGS.smooth);
  const words = spring(t - (at + 0.2), SPRINGS.pop);
  return (
    <At x={960} y={480}>
      <div
        className="flex flex-col items-center gap-[46px]"
        style={{ opacity: 1 - leave, transform: `translateY(${-leave * 140}px) scale(${1 - leave * 0.3})` }}
      >
        <div
          style={{
            transform: `translateX(${(1 - roll) * -900}px) rotate(${(1 - roll) * -540}deg) scale(${mix(0.6, 1, shown)})`,
          }}
        >
          <Chip size={300} spin={t * 30} />
        </div>
        <p
          className="whitespace-nowrap font-display text-[120px] font-black uppercase leading-none text-punch"
          style={{ opacity: clamp(words * 1.5), transform: `scale(${mix(0.6, 1, words)}) rotate(-3deg)` }}
        >
          The fun part
        </p>
      </div>
    </At>
  );
}

/** A punch-red reticle hopping between friends: who's about to get one wrong? */
function Suspicion({
  t,
  phone,
  scan,
  lock,
  gone,
}: {
  t: number;
  phone: { left: number; top: number; width: number };
  scan: readonly number[];
  lock: number;
  gone: number;
}) {
  if (t < scan[0] - 0.1 || t > gone + 0.2) return null;
  // Jo, then Max, then Sam: each hop springs to the next button.
  const order = [1, 2, 0];
  const spots = order.map((index) => {
    const button = betButton(index);
    return phonePoint(phone, button.u + button.width / 2, button.v + button.height / 2);
  });
  let x = spots[0].x;
  let y = spots[0].y;
  for (let hop = 1; hop < spots.length; hop++) {
    const amount = spring(t - scan[hop], SPRINGS.pop);
    x = mix(x, spots[hop].x, amount);
    y = mix(y, spots[hop].y, amount);
  }
  const appear = spring(t - scan[0] + 0.1, SPRINGS.pop);
  const locked = spring(t - lock, SPRINGS.slam);
  const leave = progress(t, gone, 0.2);
  const size = mix(190, 150, locked);
  return (
    <At x={x} y={y}>
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          transform: `scale(${appear}) rotate(${mix(-30, 45, locked)}deg)`,
          opacity: 1 - leave,
        }}
      >
        <div className="absolute inset-0 rounded-full border-[6px] border-punch" style={{ opacity: 0.9 }} />
        {[0, 90, 180, 270].map((angle) => (
          <div
            key={angle}
            className="absolute left-1/2 top-1/2 h-[6px] w-[34px] rounded-full bg-punch"
            style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(${size / 2}px)` }}
          />
        ))}
      </div>
    </At>
  );
}

function SamToken({
  t,
  token,
  shown,
  missAt,
  rightAt,
  label,
}: {
  t: number;
  token: { x: number; y: number; size: number };
  shown: number;
  missAt: number;
  rightAt: number;
  label: number;
}) {
  const missed = spring(t - missAt, SPRINGS.pop) * (1 - progress(t, rightAt - 0.05, 0.1));
  const right = spring(t - rightAt, SPRINGS.pop);
  const badge = token.size * 0.36;
  const shake = shakeOffset(t, missAt, 10, 0.35);
  return (
    <At x={token.x + shake.x} y={token.y}>
      <div className="relative flex flex-col items-center" style={{ transform: `scale(${shown})` }}>
        <Token name="Sam" size={token.size} />
        <span
          className="absolute grid place-items-center rounded-full bg-fail font-display font-black text-accent-ink"
          style={{
            width: badge,
            height: badge,
            right: -badge * 0.1,
            bottom: -badge * 0.05,
            fontSize: badge * 0.62,
            transform: `scale(${missed})`,
          }}
        >
          ✕
        </span>
        <span
          className="absolute grid place-items-center rounded-full bg-win text-accent-ink"
          style={{
            width: badge,
            height: badge,
            right: -badge * 0.1,
            bottom: -badge * 0.05,
            transform: `scale(${right})`,
          }}
        >
          <CheckMark size={badge * 0.6} />
        </span>
        <p
          className="absolute top-full mt-[18px] whitespace-nowrap font-display text-[40px] font-bold text-ink"
          style={{ opacity: label }}
        >
          Ana bets <span className="text-punch">Sam</span> misses
        </p>
      </div>
    </At>
  );
}

/** The bet chip: out of Ana's phone onto Sam's token; it rides there until the bet is lost. */
function BetChipFlight({
  t,
  from,
  at,
  token,
  lose,
  gone,
}: {
  t: number;
  from: { x: number; y: number };
  at: number;
  token: { x: number; y: number; size: number };
  lose: number;
  gone: number;
}) {
  if (t < at) return null;
  const perch = { x: token.x + token.size * 0.42, y: token.y - token.size * 0.42 };
  const trip = flight(t, { at, duration: 0.55, from, to: perch, lift: 240, easing: ease.inOut });
  const landed = trip.progress >= 1;
  const settle = landed ? spring(t - (at + 0.55), SPRINGS.jelly) : 0;
  // When Sam's right, the chip slides off and is gone.
  const lost = progress(t, lose + 0.2, 0.6, ease.in);
  const out = progress(t, gone, 0.3);
  if (out >= 1) return null;
  const size = mix(70, 104, Math.min(1, trip.progress * 1.4));
  return (
    <At x={trip.x + lost * 60} y={trip.y + lost * 260}>
      <div
        style={{
          transform: `rotate(${mix(-260, 12, trip.progress) + lost * 90}deg) scale(${landed ? mix(1.25, 1, settle) : 1})`,
          opacity: (1 - lost) * (1 - out),
        }}
      >
        <Chip size={size} spin={t * 40} />
      </div>
    </At>
  );
}

function PayoutPanel({
  t,
  side,
  at,
  countAt,
  countEnd,
  dim,
  out,
}: {
  t: number;
  side: "left" | "right";
  at: number;
  countAt: number;
  countEnd: number;
  dim: number;
  out: number;
}) {
  if (t < at - 0.05) return null;
  const win = side === "left";
  const sign = win ? -1 : 1;
  const enter = spring(t - at, SPRINGS.smooth);
  const leave = progress(t, out, 0.35, ease.in);
  const duration = Math.max(0.5, countEnd - countAt);
  const landed = t >= countAt + duration;
  const thump = landed ? Math.sin(clamp((t - countAt - duration) / 0.3) * Math.PI) * 0.08 : 0;
  return (
    <At x={win ? 540 : 1380} y={630 + leave * 500}>
      <div
        className={`relative flex h-[330px] w-[760px] flex-col items-center justify-center gap-[10px] rounded-[40px] border-[4px] bg-surface ${
          win ? "border-win" : "border-fail"
        }`}
        style={{
          opacity: clamp(enter * 1.5) * mix(1, 0.4, dim),
          transform: `translateX(${sign * (1 - enter) * 500}px) rotate(${sign * (1 - enter) * 6}deg) scale(${mix(1, 0.94, dim)})`,
          boxShadow: `inset 0 0 0 999px color-mix(in srgb, var(--${win ? "win" : "fail"}) 9%, transparent), 0 40px 70px -40px rgba(0,0,0,0.6)`,
        }}
      >
        <p className={`font-display text-[52px] font-black ${win ? "text-win" : "text-fail"}`}>
          {win ? "They miss" : "They're right"}
        </p>
        <div className="flex items-center gap-[26px]">
          <Token name="Ana" size={104} />
          <span className="font-display text-[44px] font-bold text-ink-dim">you</span>
          <span
            className={`font-display text-[150px] font-black leading-none ${win ? "text-win" : "text-fail"}`}
            style={{ transform: `scale(${1 + thump})`, minWidth: 330 }}
          >
            <Count
              from={0}
              to={150}
              at={countAt}
              duration={duration}
              format={(value) => `${win ? "+" : MINUS}${Math.round(value)}`}
            />
          </span>
        </div>
        {win && <WinChips t={t} at={countAt} />}
      </div>
    </At>
  );
}

/** A little stack of chips piling up beside the winnings. */
function WinChips({ t, at }: { t: number; at: number }) {
  return (
    <div className="absolute -left-[46px] -top-[40px]">
      {[0, 1, 2].map((index) => {
        const drop = spring(t - (at + index * 0.22), SPRINGS.pop);
        if (drop <= 0.001) return null;
        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: 0,
              top: -index * 16 + (1 - drop) * -120,
              opacity: clamp(drop * 2),
              transform: `rotate(${interpolate(index, [0, 2], [-8, 10])}deg)`,
            }}
          >
            <Chip size={96} spin={index * 20} />
          </div>
        );
      })}
    </div>
  );
}

