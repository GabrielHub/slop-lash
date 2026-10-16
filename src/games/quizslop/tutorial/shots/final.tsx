"use client";

import { useLocalCues } from "@/tutorial/clock";
import { Burst, STAMP_IMPACT, Stamp, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { SLATE, VOTES, VOTE_WINNER } from "../content";
import { At, BulbRing, Token } from "../parts";

/**
 * `final`: the last round's topic is a vote. Three cards, everyone drops a
 * vote, the winner takes the stage, and its right answers are worth double.
 */

const CARD = { width: 470, height: 250, y: 540 };const XS = [440, 960, 1480];

export function FinalShot() {
  const shot = useLocalCues();
  const { t } = shot;
  const last = shot.word("final", "last");
  const everyone = shot.word("final", "everyone");
  const votes = shot.word("final", "votes");
  const topic = shot.word("final", "topic,");
  const and = shot.word("final", "and");
  const worth = shot.word("final", "worth");
  const double = shot.word("final", "double.");
  const exit = shot.end("final", 0.15);

  const leave = progress(t, exit, 0.35, ease.in);
  const kicker = spring(t - (last - 0.25), SPRINGS.pop);
  const headline = spring(t - (everyone - 0.1), SPRINGS.smooth);
  const headlineOut = progress(t, and, 0.3, ease.in);
  const stage = spring(t - and, SPRINGS.gentle);
  const shake = shakeOffset(t, double + 0.12 + STAMP_IMPACT, 10, 0.3);

  return (
    <div
      className="absolute inset-0"
      style={{ opacity: 1 - leave, transform: `translate(${shake.x}px, ${shake.y + leave * -60}px)` }}
    >
      <At x={960} y={mix(178, 150, stage)}>
        <span
          className="block whitespace-nowrap rounded-full bg-gold-soft px-[34px] py-[8px] font-display text-[44px] font-black uppercase tracking-[0.14em] text-gold"
          style={{ transform: `scale(${kicker})` }}
        >
          Last round
        </span>
      </At>
      <At x={960} y={278}>
        <p
          className="whitespace-nowrap font-display text-[66px] text-ink"
          style={{
            opacity: clamp(headline * 1.5) * (1 - headlineOut),
            transform: `translateY(${(1 - headline) * 30 - headlineOut * 30}px)`,
          }}
        >
          Vote for the last topic
        </p>
      </At>

      {SLATE.map((label, index) => (
        <TopicVoteCard
          key={label}
          t={t}
          index={index}
          label={label}
          dealAt={everyone + index * 0.1}
          votesAt={votes}
          pickAt={topic + 0.05}
          stageAt={and}
        />
      ))}

      <DoubleBadge t={t} worth={worth} double={double} />
    </div>
  );
}

function TopicVoteCard({
  t,
  index,
  label,
  dealAt,
  votesAt,
  pickAt,
  stageAt,
}: {
  t: number;
  index: number;
  label: string;
  dealAt: number;
  votesAt: number;
  pickAt: number;
  stageAt: number;
}) {
  const deal = spring(t - dealAt, SPRINGS.smooth);
  if (deal <= 0.001) return null;
  const winner = index === VOTE_WINNER;
  const picked = t >= pickAt;
  const pick = spring(t - pickAt, SPRINGS.pop);
  // Losers dim, then fold away; the winner takes centre stage and grows.
  const dim = winner ? 0 : progress(t, pickAt, 0.25);
  const fold = winner ? 0 : progress(t, pickAt + 0.45, 0.3, ease.in);
  const stage = winner ? spring(t - stageAt, SPRINGS.gentle) : 0;
  const x = mix(XS[index], 960, stage);
  const y = mix(CARD.y, 440, stage) + (1 - deal) * 400;
  const scale = mix(1, 1.06, winner ? pick : 0) * mix(1, 1.3, stage) * mix(1, 0.6, fold);
  const voters = VOTES.filter((vote) => vote.topic === index);
  const titleGlow = winner ? stage : 0;
  if (fold >= 1) return null;
  return (
    <At x={x} y={y}>
      <div
        className="relative"
        style={{
          width: CARD.width,
          height: CARD.height,
          transform: `rotate(${(1 - deal) * (index - 1) * 12}deg) scale(${scale})`,
          opacity: clamp(deal * 1.5) * mix(1, 0.35, dim) * (1 - fold),
        }}
      >
        {winner && (
          <div className="absolute -left-[22px] -top-[22px]" style={{ opacity: progress(t, pickAt - 0.05, 0.2) }}>
            <BulbRing
              width={CARD.width + 44}
              height={CARD.height + 44}
              radius={50}
              spacing={40}
              size={12}
              power={progress(t, pickAt, 0.5)}
              chase={1.8}
            />
          </div>
        )}
        <div
          className="flex h-full w-full flex-col items-center justify-between rounded-[34px] border-[4px] bg-surface p-[24px]"
          style={{
            borderColor: winner && picked ? "var(--gold)" : "var(--edge)",
            boxShadow: "0 30px 60px -30px rgba(0,0,0,0.6)",
          }}
        >
          <span
            className={`grid flex-1 place-items-center text-center font-display font-black leading-[1.05] ${
              titleGlow > 0.5 ? "text-gold qs-marquee-text" : "text-ink"
            }`}
            style={{ fontSize: 52 }}
          >
            {label}
          </span>
          <span className="flex h-[58px] items-center pl-[12px]">
            {voters.map((vote, order) => {
              const drop = spring(t - (votesAt + VOTES.indexOf(vote) * 0.12), SPRINGS.pop);
              if (drop <= 0.001) return null;
              return (
                <span
                  key={vote.name}
                  className="-ml-[12px] rounded-full"
                  style={{
                    transform: `translateY(${(1 - drop) * -160}px) scale(${drop})`,
                    boxShadow: "0 0 0 4px var(--surface)",
                    zIndex: order,
                  }}
                >
                  <Token name={vote.name} size={58} />
                </span>
              );
            })}
          </span>
        </div>
      </div>
    </At>
  );
}

/** "Right answers +100" becomes "+200" under a DOUBLE POINTS stamp. */
function DoubleBadge({ t, worth, double }: { t: number; worth: number; double: number }) {
  const shown = spring(t - (worth - 0.1), SPRINGS.pop);
  if (shown <= 0.001) return null;
  const doubled = t >= double + 0.08;
  const flip = t >= double ? Math.sin(clamp((t - double) / 0.3) * Math.PI) : 0;
  return (
    <>
      <At x={960} y={770} corner>
        <Burst at={double + 0.1} count={28} speed={900} size={16} colors={["var(--gold)", "var(--punch)", "var(--teal)"]} seed={11} />
      </At>
      <At x={960} y={770}>
        <div
          className={`flex items-center gap-[20px] whitespace-nowrap rounded-full px-[40px] py-[12px] font-display font-black ${
            doubled ? "bg-gold-soft text-gold" : "bg-win-soft text-win"
          }`}
          style={{ fontSize: 56, transform: `scale(${shown * (1 + flip * 0.12)}) rotate(${flip * -3}deg)` }}
        >
          <span className="text-[40px] font-bold">Right answers</span>
          <span className="tabular-nums">{doubled ? "+200" : "+100"}</span>
        </div>
      </At>
      <At x={1480} y={650}>
        <Stamp
          text={"DOUBLE\nPOINTS"}
          at={double + 0.12}
          tone="gold"
          rotate={-8}
          size={58}
          className="whitespace-pre-line text-center"
        />
      </At>
    </>
  );
}
