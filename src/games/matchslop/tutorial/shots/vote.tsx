"use client";

import { useCues, useTime } from "@/tutorial/clock";
import { Camera, PhoneMock, Words, flight } from "@/tutorial/kit";
import { SPRINGS, clamp, mix, spring } from "@/tutorial/timeline";
import { COPY, letterOf } from "../../ui/copy";
import { CAST, TEXTS, VOTES, WINNER, type CastId } from "../data";
import { C, alpha, fin, fout, sp, tf } from "../fx";
import { BallotCard, CheckBadge, Token } from "../parts";
import { Sticker } from "../friend";
import { BallotScreen } from "../phones";

export const BALLOT = {
  width: 620,
  height: 210,
  cols: [628, 1292],
  rows: [352, 612],
} as const;

export function cardCenter(index: number) {
  return { x: BALLOT.cols[index % 2], y: BALLOT.rows[Math.floor(index / 2)] };
}

/** A chip's resting place on a card's top edge, `slot` from the right. */
function chipSlot(card: number, slot: number) {
  const center = cardCenter(card);
  return { x: center.x + BALLOT.width / 2 - 70 - slot * 64, y: center.y - BALLOT.height / 2 };
}

const VOTERS: readonly { who: CastId; x: number }[] = [
  { who: "zoe", x: 700 },
  { who: "tess", x: 880 },
  { who: "remy", x: 1060 },
  { who: "claude", x: 1240 },
];
const VOTER_Y = 812;

/** In the double beat, B's chips spread out so each human vote can split in two. */
const SPREAD: Record<string, number> = { zoe: -236, remy: -40, claude: 176 };

/**
 * VOTE and DOUBLE: the ballot deals in, everyone's face flies to the text they
 * want sent; the camera leans into B, where each human vote splits in two;
 * then Tess's phone shows her own text locked.
 */
export function VoteShot() {
  const t = useTime();
  const cues = useCues();
  const voteAt = cues.at("vote");
  const one = cues.word("vote", "one");
  const text = cues.word("vote", "text");
  const so = cues.word("vote", "so");
  const vote = cues.word("vote", "vote");
  const doubleAt = cues.at("double");
  const count = cues.word("double", "count");
  const double = cues.word("double", "double");
  const and = cues.word("double", "and");
  const no = cues.word("double", "no");
  const cant = cues.word("double", "can't");
  const own = cues.word("double", "own");

  const spread = sp(t, doubleAt + 0.15, SPRINGS.smooth);
  const focus = fin(t, doubleAt, 0.4) * fout(t, and, 0.4);
  const phoneIn = sp(t, and + 0.05, SPRINGS.smooth);
  const b = cardCenter(WINNER);

  return (
    <div className="absolute inset-0">
      <Camera
        keys={[
          { at: doubleAt - 0.25 },
          { at: doubleAt + 0.55, x: b.x - 40, y: b.y + 40, zoom: 1.5 },
          { at: and - 0.1, x: b.x - 40, y: b.y + 40, zoom: 1.5 },
          { at: and + 0.6, x: 1505, y: 520, zoom: 0.75 },
        ]}
      >
        {/* The TV's question. */}
        <div
          className="absolute inset-x-0 top-[132px] text-center font-display text-[64px] font-black text-ink"
          style={{ opacity: fout(t, doubleAt, 0.3) }}
        >
          <Words text={COPY.whichOne} at={text - 0.1} stagger={0.06} accent={["send?"]} />
        </div>

        {TEXTS.map((entry, index) => {
          const center = cardCenter(index);
          const at = voteAt - 0.1 + index * 0.09;
          const deal = sp(t, at, SPRINGS.smooth);
          const hopT = t - (one - 0.05 + index * 0.07);
          const hop = hopT > 0 && hopT < 0.4 ? Math.sin((hopT / 0.4) * Math.PI) * 26 : 0;
          const winner = index === WINNER;
          return (
            <div
              key={entry.text}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: tf(center.x + mix(90, 0, deal), center.y - hop),
                opacity: fin(t, at, 0.2) * (winner ? 1 : 1 - focus * 0.6),
              }}
            >
              <div className="-translate-x-1/2 -translate-y-1/2">
                <BallotCard
                  letter={letterOf(index)}
                  text={entry.text}
                  width={BALLOT.width}
                  height={BALLOT.height}
                  crowned={winner ? focus * 0.8 : 0}
                />
              </div>
            </div>
          );
        })}

        {/* The voters, then their faces flying to the text they want sent. */}
        {VOTERS.map((voter, index) => {
          const at = so - 0.1 + index * 0.08;
          const enter = sp(t, at, SPRINGS.pop);
          const ballot = VOTES.find((entry) => entry.voter === voter.who);
          const flyAt = vote + VOTES.findIndex((entry) => entry.voter === voter.who) * 0.17;
          return (
            <div
              key={voter.who}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: tf(voter.x, VOTER_Y + (1 - enter) * 60, 1),
                opacity: fin(t, at, 0.15) * fout(t, doubleAt, 0.3),
              }}
            >
              <div className="relative -translate-x-1/2 -translate-y-1/2" style={{ opacity: t > flyAt ? 0.45 : 1 }}>
                <Token who={CAST[voter.who]} size={84} ai={CAST[voter.who].modelId !== null} />
                {ballot && (
                  <span className="absolute -right-[6px] -top-[6px]">
                    <CheckBadge at={flyAt + 0.55} size={34} />
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {VOTES.map((entry, index) => {
          const at = vote + index * 0.17;
          if (t < at) return null;
          const voter = VOTERS.find((v) => v.who === entry.voter)!;
          const slot = VOTES.filter((v, i) => v.card === entry.card && i < index).length;
          const rest = chipSlot(entry.card, slot);
          const spreadX =
            entry.card === WINNER ? mix(rest.x, b.x + (SPREAD[entry.voter] ?? 0), spread) : rest.x;
          const path = flight(t, {
            at,
            duration: 0.62,
            from: { x: voter.x, y: VOTER_Y },
            to: { x: spreadX, y: rest.y },
            lift: 220,
          });
          const landed = spring(t - (at + 0.62), SPRINGS.pop);
          const scale = path.progress < 1 ? mix(1.3, 1, path.progress) : mix(1.25, 1, landed);
          const human = CAST[entry.voter].modelId === null;
          const twin = human && entry.card === WINNER ? sp(t, count - 0.05 + slot * 0.12, SPRINGS.pop) : 0;
          const badge = entry.card === WINNER ? sp(t, double - 0.05 + slot * 0.08, SPRINGS.pop) : 0;
          return (
            <div
              key={entry.voter}
              className="absolute left-0 top-0"
              style={{ transform: tf(path.x, path.y, 1), opacity: entry.card === WINNER ? 1 : 1 - focus * 0.6 }}
            >
              {twin > 0.01 && (
                <div className="absolute left-0 top-0" style={{ transform: tf(-32 + twin * 64, -32, clamp(twin)) }}>
                  <Token who={CAST[entry.voter]} size={64} />
                </div>
              )}
              <div className="absolute left-0 top-0" style={{ transform: tf(-32, -32, scale) }}>
                <Token who={CAST[entry.voter]} size={64} ai={!human && focus > 0.1} />
              </div>
              {badge > 0.01 && (
                <div
                  className="absolute left-0 top-0 rounded-full px-[14px] py-[5px] font-mono text-[40px] font-black leading-none text-accent-ink"
                  style={{
                    transform: tf(human ? 32 - 50 : -42, -120, badge),
                    background: human ? C.rose : "var(--ai-badge)",
                    boxShadow: `0 0 24px ${alpha(human ? C.rose : "var(--ai-badge)", 50)}`,
                  }}
                >
                  ×{human ? 2 : 1}
                </div>
              )}
            </div>
          );
        })}

        {/* "Human votes count double", under B. */}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: tf(b.x, b.y + BALLOT.height / 2 + 70, mix(0.8, 1, sp(t, count, SPRINGS.pop))),
            opacity: fin(t, count, 0.2) * fout(t, and, 0.25),
          }}
        >
          <div className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-[3px] border-punch bg-surface px-[30px] py-[12px] font-display text-[40px] font-black text-punch">
            {COPY.humanDouble}
          </div>
        </div>
      </Camera>

      {/* Tess's phone: her own text is locked. */}
      {t >= and - 0.1 && (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: tf(1580, mix(1500, 526, phoneIn), 1, mix(10, -2, phoneIn)) }}
        >
          <div className="-translate-x-1/2 -translate-y-1/2">
            <PhoneMock width={390}>
              <BallotScreen tryAt={cant + 0.05} voteAt={own + 0.1} />
            </PhoneMock>
          </div>
          <div
            className="absolute left-[-215px] top-[-400px] flex -translate-x-full items-center gap-[14px]"
            style={{ opacity: fin(t, and + 0.4, 0.3) }}
          >
            <Token who={CAST.tess} size={60} />
            <span className="font-display text-[38px] font-black text-ink">{CAST.tess.name}&apos;s phone</span>
          </div>
          {/* Her deadpan "and no". */}
          <div className="absolute left-[-350px] top-[-60px]">
            <Sticker at={no - 0.05} tilt={-10} size={80}>
              😐
            </Sticker>
          </div>
        </div>
      )}
    </div>
  );
}

