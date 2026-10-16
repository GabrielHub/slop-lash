"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTime } from "@/tutorial/clock";
import { Burst, flight } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { CAST, type CastId } from "../tutorial/data";
import { C, alpha, blend, fin, fout, sp, tf } from "../tutorial/fx";
import { Dots, Token } from "../tutorial/parts";
import { FEED, FLOAT, T } from "./beatsheet";

/**
 * The chat, laid out in feed px (see `feedY`): Jules's opener, the room's two
 * drafts side by side, our sent line and her reply. Type is big enough to
 * read at the host page's 0.2x.
 */

/** A bubble's height for `lines` lines of `size` px type (padding and border included). */
const heightOf = (lines: number, size: number) => lines * size * 1.16 + size * 0.6 + 6;

/** Jules's opener, cut to two words so it reads at a glance. */
const ASK = { text: "Impress me. 😏", left: 430, top: 0, size: 128 };

/** The two drafts, head to head: a groaner and the boat line (both from the tutorial's ballot). */
const DRAFT = { top: 360, size: 88 };
const LOSER = {
  who: "zoe" as CastId,
  lines: ["Is your Wi-Fi", "named after me?"],
  left: 80,
  width: 800,
};
const WIN = {
  who: "tess" as CastId,
  lines: ["Two truths and a lie:", "I'm fun, I'm funny,", "I own a boat."],
  right: 1840,
  width: 908,
};
const WIN_LEFT = WIN.right - WIN.width;
const WIN_H = heightOf(WIN.lines.length, DRAFT.size);
const WRITER = 130;

/** Jules's reply, broken where it lands best. */
const REPLY = {
  lines: ["A boat?? Okay,", "you have my attention."],
  left: 430,
  top: DRAFT.top + WIN_H + 70,
  size: 104,
};
const REPLY_H = heightOf(REPLY.lines.length, REPLY.size);

/** Jules's avatar: beside her opener, then beside her reply. The match card shrinks into it. */
export const AVATAR = {
  x: 300,
  y: heightOf(1, ASK.size) - 100,
  replyY: REPLY.top + REPLY_H - 100,
  size: 200,
} as const;

/** The voters, whose faces rise from below the board and line up under the winner. */
const VOTERS: readonly CastId[] = ["zoe", "remy", "claude"];
const VOTE_SIZE = 156;
const voteSlot = (index: number) => ({
  x: WIN_LEFT + WIN.width / 2 + (index - 1) * 178,
  y: DRAFT.top + WIN_H + 104,
});

/** Drafts are typed out this fast (characters a second). */
const CPS = 80;
const draftAt = (index: number) => T.deal + index * T.dealStagger;

/** A bubble, sized in em from its type: hers (tail left) or a card. */
function Bubble({
  card = false,
  size,
  children,
  style,
}: {
  card?: boolean;
  size: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="whitespace-nowrap border-[3px] border-edge bg-surface font-sans font-semibold leading-[1.16] text-ink"
      style={{
        fontSize: size,
        padding: "0.28em 0.56em 0.32em",
        borderRadius: card ? "0.42em" : "0.56em 0.56em 0.56em 0.14em",
        boxShadow: "0 26px 54px -32px rgba(0,0,0,0.55)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Jules typing, then her line popping out of the dots on a soft spring. */
function HerLine({
  dotsAt,
  at,
  left,
  top,
  size,
  lines = 1,
  out,
  children,
}: {
  dotsAt: number;
  at: number;
  left: number;
  top: number;
  size: number;
  /** The line's height in lines: the dots sit on its bottom, so it grows up out of them. */
  lines?: number;
  /** Fades as it scrolls off the top. */
  out?: number;
  children: ReactNode;
}) {
  const t = useTime();
  if (t < dotsAt) return null;
  const dots = sp(t, dotsAt, SPRINGS.pop) * fout(t, at - 0.02, 0.08);
  const pop = sp(t, at, FLOAT);
  const leave = out === undefined ? 1 : fout(t, out, 0.3);
  if (leave <= 0) return null;
  return (
    <div className="absolute left-0 top-0" style={{ transform: `translate(${left}px, ${top}px)`, opacity: leave }}>
      {dots > 0.01 && (
        <div
          className="absolute left-0 origin-bottom-left"
          style={{ top: heightOf(lines, size) - heightOf(1, size), transform: `scale(${dots})` }}
        >
          <Bubble size={size}>
            <span className="flex h-[1.16em] items-center px-[0.1em]">
              <Dots size={size * 0.24} className="text-ink-dim" />
            </span>
          </Bubble>
        </div>
      )}
      {t >= at && (
        <div
          className="absolute left-0 top-0 origin-bottom-left"
          style={{ opacity: fin(t, at, 0.1), transform: `scale(${mix(0.55, 1, pop)}) rotate(${mix(-4, 0, pop)}deg)` }}
        >
          <Bubble size={size}>{children}</Bubble>
        </div>
      )}
    </div>
  );
}

/** Lines typing out from `at`, with a caret; the untyped rest holds its space so nothing reflows. */
function Typed({ lines, at }: { lines: readonly string[]; at: number }) {
  const t = useTime();
  const total = lines.reduce((sum, line) => sum + line.length, 0);
  const shown = Math.floor(clamp((t - at) * CPS, 0, total));
  const typing = t >= at && shown < total;
  return (
    <>
      {lines.map((line, index) => {
        const start = lines.slice(0, index).reduce((sum, before) => sum + before.length, 0);
        const visible = clamp(shown - start, 0, line.length);
        const caret = typing && shown >= start && shown < start + line.length;
        return (
          <p key={line}>
            {line.slice(0, visible)}
            {caret && <span className="ml-[0.04em] inline-block h-[0.9em] w-[0.07em] translate-y-[0.1em] bg-punch" />}
            <span className="invisible">{line.slice(visible)}</span>
          </p>
        );
      })}
    </>
  );
}

/** A writer's face, badged on their draft's top-left corner. */
function Writer({ who, at, out = 0 }: { who: CastId; at: number; out?: number }) {
  const t = useTime();
  const pop = sp(t, at, SPRINGS.pop) * (1 - out);
  if (pop <= 0.001) return null;
  return (
    <div className="absolute left-[90px] top-[-34px]" style={{ transform: `translate(-50%, -50%) scale(${pop})` }}>
      <Token who={CAST[who]} size={WRITER} ai={CAST[who].modelId !== null} />
    </div>
  );
}

/** How a draft deals in: up from below on a swipe tilt. */
function dealPose(t: number, at: number, tilt: number) {
  const deal = sp(t, at, FLOAT);
  return { y: mix(720, 0, deal), rotate: mix(tilt, 0, deal), shown: fin(t, at, 0.12) };
}

/** The losing draft: dealt, typed, passed over, then swiped off its own edge. Nope. */
function Loser() {
  const t = useTime();
  const at = draftAt(0);
  if (t < at) return null;
  const nope = progress(t, T.nope, 0.38, ease.in);
  if (nope >= 1) return null;
  const pose = dealPose(t, at, -8);
  const passed = fin(t, T.crown, 0.25);
  return (
    <div
      className="absolute left-0 top-0 origin-center"
      style={{
        transform: tf(LOSER.left - nope * 1000, DRAFT.top + pose.y + nope * 70, 1 - passed * 0.05, pose.rotate - nope * 18),
        opacity: pose.shown * (1 - nope),
      }}
    >
      <Bubble card size={DRAFT.size} style={{ width: LOSER.width, opacity: 1 - passed * 0.45 }}>
        <Typed lines={LOSER.lines} at={at + 0.18} />
      </Bubble>
      <Writer who={LOSER.who} at={at + 0.12} />
    </div>
  );
}

/** The winning draft: dealt, typed, voted up, crowned, then sent as our bubble and loved. */
function Winner() {
  const t = useTime();
  const at = draftAt(1);
  if (t < at) return null;
  const pose = dealPose(t, at, 8);
  const pink = progress(t, T.send, 0.3, ease.inOut);
  const crown = fin(t, T.crown, 0.25) * (1 - pink);
  // Each vote landing bumps the card.
  let bump = 0;
  for (let vote = 0; vote < VOTERS.length; vote++) {
    const land = T.vote + vote * T.voteStagger + T.voteFly;
    bump += Math.max(0, 1 - Math.abs(t - land - 0.04) / 0.12);
  }
  // Sent: a little hop. Loved: a heartbeat bump.
  const hop = Math.sin(clamp((t - T.send) / 0.4) * Math.PI) * 34;
  const love = Math.max(0, 1 - Math.abs(t - T.tapback - 0.1) / 0.18);
  const scale = 1 + bump * 0.025 + crown * 0.03 + love * 0.04;
  const tapback = sp(t, T.tapback, SPRINGS.pop);

  return (
    <div
      className="absolute left-0 top-0 origin-center"
      style={{ transform: tf(WIN_LEFT, DRAFT.top + pose.y - hop, scale, pose.rotate), opacity: pose.shown }}
    >
      <div
        className="whitespace-nowrap font-sans font-semibold leading-[1.16]"
        style={{
          width: WIN.width,
          height: WIN_H,
          fontSize: DRAFT.size,
          padding: "0.28em 0.56em 0.32em",
          borderRadius: `0.42em 0.42em ${mix(0.42, 0.14, pink).toFixed(3)}em 0.42em`,
          color: blend(C.ink, "var(--accent-ink)", pink),
          background: blend(C.surface, C.rose, pink),
          border: `3px solid ${blend(blend("var(--edge)", C.rose, crown), C.rose, pink)}`,
          boxShadow: `0 0 0 ${(crown * 8).toFixed(1)}px ${alpha(C.rose, 100 * crown)}, 0 0 ${(crown * 80).toFixed(0)}px ${alpha(C.rose, 55 * crown)}, 0 26px 54px -30px ${pink > 0.5 ? alpha(C.rose, 85) : "rgba(0,0,0,0.55)"}`,
        }}
      >
        <Typed lines={WIN.lines} at={at + 0.18} />
      </div>
      <Writer who={WIN.who} at={at + 0.12} out={fin(t, T.send - 0.04, 0.16)} />
      {/* Jules's reaction, on our bubble's corner. */}
      {t >= T.tapback && (
        <div className="absolute right-[-10px] top-[-74px]" style={{ transform: tf(0, 0, tapback, mix(-30, 10, tapback)) }}>
          <span
            className="grid size-[150px] place-items-center rounded-full border-[3px] border-edge bg-surface leading-none"
            style={{ fontSize: 84, boxShadow: `0 16px 34px -14px rgba(0,0,0,0.6), 0 0 40px ${alpha(C.rose, 40)}` }}
          >
            😍
          </span>
        </div>
      )}
      <div className="absolute right-[65px] top-0">
        <Burst
          at={T.tapback + 0.06}
          count={14}
          shape="heart"
          size={52}
          speed={560}
          gravity={-140}
          spread={150}
          duration={1.2}
          colors={[C.rose, C.coral, C.rose, C.violet]}
          seed={12}
        />
      </div>
    </div>
  );
}

/** The voters' faces arcing up onto the winner's bottom edge, each with a pop of hearts. */
function Votes() {
  const t = useTime();
  return (
    <>
      {VOTERS.map((who, index) => {
        const at = T.vote + index * T.voteStagger;
        if (t < at) return null;
        const gone = fin(t, T.send - 0.05 + index * 0.04, 0.16, ease.in);
        if (gone >= 1) return null;
        const slot = voteSlot(index);
        const path = flight(t, {
          at,
          duration: T.voteFly,
          from: { x: slot.x - 70, y: 1280 - FEED.vote },
          to: slot,
          lift: 50,
          easing: ease.out,
        });
        const landed = spring(t - (at + T.voteFly), SPRINGS.pop);
        const scale = (path.progress < 1 ? mix(1.15, 1, path.progress) : mix(1.25, 1, landed)) * (1 - gone);
        return (
          <div key={who} className="absolute left-0 top-0" style={{ transform: tf(path.x, path.y + gone * 40, scale) }}>
            <div className="-translate-x-1/2 -translate-y-1/2">
              <Token who={CAST[who]} size={VOTE_SIZE} ai={CAST[who].modelId !== null} />
            </div>
            <Burst
              at={at + T.voteFly}
              count={7}
              shape="heart"
              size={46}
              speed={520}
              gravity={420}
              spread={70}
              duration={0.75}
              colors={[C.rose, C.coral]}
              seed={20 + index}
            />
          </div>
        );
      })}
    </>
  );
}

/** Jules's chat, in feed px: the opener, the two drafts and the vote, our sent line, the reply. */
export function Chat() {
  return (
    <>
      <HerLine dotsAt={T.dots} at={T.ask} left={ASK.left} top={ASK.top} size={ASK.size} out={T.follow + 0.12}>
        {ASK.text}
      </HerLine>
      <Loser />
      <Winner />
      <Votes />
      <HerLine
        dotsAt={T.typing}
        at={T.reply}
        left={REPLY.left}
        top={REPLY.top}
        size={REPLY.size}
        lines={REPLY.lines.length}
      >
        {REPLY.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </HerLine>
    </>
  );
}
