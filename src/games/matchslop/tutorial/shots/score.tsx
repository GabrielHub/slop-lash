"use client";

import type { ReactNode } from "react";
import { useCues, useTime } from "@/tutorial/clock";
import { STAMP_IMPACT, Stamp, flight, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { COPY, signedPoints } from "../../ui/copy";
import { CAST, POINTS, REACTIONS, TEXTS, WINNER, type CastId } from "../data";
import { C, alpha, fin, sp, stepped, tf } from "../fx";
import { Sticker } from "../friend";
import { BallotCard, Tapback, Token } from "../parts";

const CARD = { x: 560, y: 430, width: 780, height: 280 };
const PANEL = { left: 1030, top: 214, width: 730 };

/** The winner's voters on its top edge, each human vote doubled. */
const CHIPS: readonly { who: CastId; x: number }[] = [
  { who: "zoe", x: -170 },
  { who: "zoe", x: -112 },
  { who: "remy", x: -30 },
  { who: "remy", x: 28 },
  { who: "claude", x: 110 },
];

const ROW_Y = [404, 510, 616];
/** Where the total's number sits: the outro's iris closes on it. */
export const TOTAL_POINT = { x: PANEL.left + PANEL.width - 120, y: ROW_Y[2] + 134 };
/** The Dealbreaker swing: stiff and critically damped, so it lands fast and doesn't wobble. */
const SWING_SPRING = { stiffness: 400, damping: 40, mass: 1 };
const VALUE_X = PANEL.left + PANEL.width - 40;

function Row({
  y,
  shown,
  label,
  detail,
  value,
  tone,
  glow = 0,
}: {
  y: number;
  shown: number;
  label: string;
  detail?: ReactNode;
  value: ReactNode;
  tone: string;
  glow?: number;
}) {
  return (
    <div
      className="absolute flex items-center rounded-[22px] px-[26px]"
      style={{
        left: PANEL.left,
        top: y - 46,
        width: PANEL.width,
        height: 92,
        opacity: clamp(shown * 2),
        transform: `translateX(${(1 - clamp(shown)) * 50}px)`,
        background: glow > 0 ? alpha(C.mint, glow * 14) : undefined,
        boxShadow: glow > 0 ? `inset 0 0 0 3px ${alpha(C.mint, glow * 70)}` : undefined,
      }}
    >
      <span className="w-[200px] font-display text-[42px] font-black text-ink">{label}</span>
      <span className="flex-1 font-sans text-[36px] font-medium text-ink-dim">{detail}</span>
      <span className={`font-mono text-[50px] font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/**
 * SCORE: the sent text's author unmasks; every vote flings 25 points (human
 * ones doubled); "Sent +50" stamps the card; then the reaction's swing lands,
 * +150 for a Great, flipping to −200 for a Dealbreaker on "or bad".
 */
export function ScoreShot() {
  const t = useTime();
  const cues = useCues();
  const pointsAt = cues.at("points");
  const vote = cues.word("points", "vote");
  const sent = cues.word("points", "sent");
  const reaction = cues.word("points", "reaction");
  const good = cues.word("points", "good");
  const or = cues.word("points", "or");

  const enter = sp(t, pointsAt - 0.1, SPRINGS.smooth);
  const unmask = sp(t, pointsAt + 0.25, SPRINGS.pop);
  const coins = CHIPS.map((_, index) => vote + 0.15 + index * 0.14);
  const coinFly = 0.5;
  const stampAt = sent - STAMP_IMPACT + 0.03;
  const swingAt = reaction + 0.1;
  // "Good or bad": the swing flips on "or" and has landed by the end of "bad",
  // so the red total holds before the iris (keyed past the outro's first word).
  const flip = progress(t, or - 0.06, 0.34, ease.inOut);
  const swingDown = or + 0.02;
  const flipped = flip >= 0.5;

  const votes = stepped(
    t,
    0,
    coins.map((at, index) => ({ at: at + coinFly, to: (index + 1) * POINTS.perVote })),
    SPRINGS.smooth,
  );
  const great = REACTIONS[0];
  const dealbreaker = REACTIONS[5];
  const total =
    stepped(
      t,
      0,
      [
        ...coins.map((at, index) => ({ at: at + coinFly, to: (index + 1) * POINTS.perVote })),
        { at: stampAt + STAMP_IMPACT, to: 5 * POINTS.perVote + POINTS.sent },
        { at: swingAt, to: 5 * POINTS.perVote + POINTS.sent + great.delta * 10 },
      ],
      SPRINGS.smooth,
    ) +
    (dealbreaker.delta - great.delta) * 10 * spring(t - swingDown, SWING_SPRING);
  const badShake = shakeOffset(t, swingDown + 0.3, 14, 0.4);
  const goodGlow = Math.max(0, 1 - Math.abs(t - (good + 0.25)) / 0.4) * (flipped ? 0 : 1);

  return (
    <div className="absolute inset-0">
      {/* The sent card, its author unmasked. */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: tf(CARD.x - (1 - enter) * 120, CARD.y), opacity: fin(t, pointsAt - 0.1, 0.25) }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <BallotCard
            letter="B"
            text={TEXTS[WINNER].text}
            width={CARD.width}
            height={CARD.height}
            size={44}
            crowned={0.8}
            badge={
              unmask > 0.02 ? (
                <div style={{ transform: `scale(${unmask}) rotate(${(1 - unmask) * -90}deg)` }}>
                  <Token who={CAST.tess} size={76} />
                </div>
              ) : undefined
            }
          >
            <p
              className="absolute bottom-[26px] left-[40px] font-display text-[38px] font-black text-ink"
              style={{ opacity: fin(t, pointsAt + 0.35, 0.3) }}
            >
              {CAST.tess.name}
            </p>
          </BallotCard>
        </div>

        {/* Votes on its top edge. */}
        {CHIPS.map((chip, index) => (
          <div
            key={index}
            className="absolute left-0 top-0"
            style={{
              transform: tf(chip.x - 30, -CARD.height / 2 - 30, sp(t, pointsAt + 0.1 + index * 0.05, SPRINGS.pop)),
            }}
          >
            <Token who={CAST[chip.who]} size={60} />
          </div>
        ))}

        {/* The reaction on its corner. */}
        {t >= swingAt - 0.1 && (
          <div className="absolute left-0 top-0" style={{ transform: tf(CARD.width / 2 - 48, -CARD.height / 2 - 40) }}>
            <Tapback
              emoji={flipped ? dealbreaker.emoji : great.emoji}
              size={92}
              pop={mix(1.6, 1, spring(t - (flipped ? or + 0.16 : swingAt - 0.1), SPRINGS.pop))}
            />
          </div>
        )}

        {/* "Sent +50". */}
        <div className="absolute left-[150px] top-[40px]">
          <div className="-translate-x-1/2 -translate-y-1/2">
            <Stamp worn text={COPY.sentBonus} at={stampAt} size={56} rotate={-8} />
          </div>
        </div>
      </div>

      {/* She laughs before "Good or bad". */}
      <div className="absolute" style={{ left: CARD.x + 300, top: CARD.y + 150 }}>
        <Sticker at={good - 0.6} tilt={10} size={80}>
          😂
        </Sticker>
      </div>

      {/* Coins: 25 a vote, flung at the ledger. */}
      {CHIPS.map((chip, index) => {
        const at = coins[index];
        if (t < at || t > at + coinFly + 0.2) return null;
        const path = flight(t, {
          at,
          duration: coinFly,
          from: { x: CARD.x + chip.x, y: CARD.y - CARD.height / 2 },
          to: { x: VALUE_X - 70, y: ROW_Y[0] },
          lift: 200,
          easing: ease.inOut,
        });
        const landed = progress(t, at + coinFly, 0.2);
        return (
          <div
            key={index}
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: tf(path.x, path.y, 1 + landed * 0.5), opacity: 1 - landed }}
          >
            <span className="block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-gold px-[16px] py-[6px] font-mono text-[34px] font-bold text-accent-ink">
              +{POINTS.perVote}
            </span>
          </div>
        );
      })}

      {/* The ledger. */}
      <div
        className="absolute flex items-center gap-[20px]"
        style={{
          left: PANEL.left + 26,
          top: PANEL.top + 26,
          opacity: fin(t, pointsAt + 0.2, 0.3),
          transform: `translateY(${(1 - sp(t, pointsAt + 0.2, SPRINGS.smooth)) * 30}px)`,
        }}
      >
        <Token who={CAST.tess} size={70} />
        <span className="font-display text-[48px] font-black text-ink">{CAST.tess.name}&apos;s points</span>
      </div>
      <Row
        y={ROW_Y[0]}
        shown={sp(t, vote - 0.15, SPRINGS.smooth)}
        label="Votes"
        detail={`5 × ${POINTS.perVote}`}
        value={signedPoints(votes)}
        tone="text-gold-ink"
      />
      <Row
        y={ROW_Y[1]}
        shown={sp(t, stampAt + STAMP_IMPACT, SPRINGS.smooth)}
        label="Sent"
        value={`+${POINTS.sent}`}
        tone="text-punch"
      />
      <div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          transform: `perspective(1200px) rotateX(${flip * 180 - (flipped ? 180 : 0)}deg)`,
          transformOrigin: `${PANEL.left + PANEL.width / 2}px ${ROW_Y[2]}px`,
        }}
      >
        <Row
          y={ROW_Y[2]}
          shown={sp(t, swingAt - 0.1, SPRINGS.smooth)}
          label="Reaction"
          detail={flipped ? `${dealbreaker.emoji} ${dealbreaker.word}` : `${great.emoji} ${great.word}`}
          value={signedPoints((flipped ? dealbreaker : great).delta * 10)}
          tone={flipped ? "text-fail" : "text-win"}
          glow={goodGlow}
        />
      </div>
      <div
        className="absolute"
        style={{
          left: PANEL.left,
          top: ROW_Y[2] + 70,
          width: PANEL.width,
          opacity: fin(t, vote - 0.1, 0.3),
          transform: `translate(${badShake.x}px, ${badShake.y}px)`,
        }}
      >
        <div className="h-[4px] rounded-full bg-edge-strong" />
        <div className="mt-[18px] flex items-center px-[26px]">
          <span className="flex-1 font-display text-[46px] font-black uppercase tracking-[0.08em] text-ink">
            Total
          </span>
          <span
            className={`font-mono text-[84px] font-bold leading-none tabular-nums ${total < 0 ? "text-fail" : "text-ink"}`}
          >
            {signedPoints(total).replace(/^\+/, "")}
          </span>
        </div>
      </div>
    </div>
  );
}
