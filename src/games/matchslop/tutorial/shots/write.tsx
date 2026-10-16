"use client";

import { useCues, useTime } from "@/tutorial/clock";
import { PhoneMock } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress } from "@/tutorial/timeline";
import { CAST, TEXTS, type CastId } from "../data";
import { C, Neon, NeonHeart, fin, neonLevel, sp, tf } from "../fx";
import { OpenerScreen, PageSwipe, ReplyScreen, WriterScreen } from "../phones";

const PHONE_W = 370;
const WRITE_SCALE = 0.95;
/** The solo phone's scale: as big as fits between the rail and the captions. */
const SOLO_SCALE = 1.025;

/** The three writers, left to right; the middle one (Remy) carries on into the opener. */
const WRITERS: readonly { who: CastId; text: number; x: number; y: number; rotate: number }[] = [
  { who: "zoe", text: 0, x: 555, y: 552, rotate: -8 },
  { who: "remy", text: 3, x: 960, y: 528, rotate: 0 },
  { who: "tess", text: 1, x: 1365, y: 552, rotate: 8 },
];

/** Where Remy's phone settles for the opener. */
const SOLO = { x: 560, y: 506 };

/** The label beside the solo phone: a kicker, a neon title and a line, swapping on `at`. */
function RoundLabel({
  kicker,
  title,
  line,
  at,
  out,
}: {
  kicker: string;
  title: string;
  line: string;
  at: number;
  out?: number;
}) {
  const t = useTime();
  const enter = sp(t, at, SPRINGS.smooth);
  const leave = out === undefined ? 0 : progress(t, out, 0.3, ease.in);
  if (t < at - 0.05 || leave >= 1) return null;
  return (
    <div
      className="absolute left-[930px] top-[300px] w-[880px]"
      style={{ opacity: fin(t, at, 0.2) * (1 - leave), transform: tf(mix(60, 0, enter) - leave * 80, 0) }}
    >
      <p className="font-display text-[40px] font-extrabold uppercase tracking-[0.3em] text-teal">{kicker}</p>
      <p className="mt-[4px] font-display text-[150px] font-black leading-[1] tracking-[-0.02em]">
        <Neon level={neonLevel(t, at + 0.1, title.length)}>{title}</Neon>
      </p>
      <p className="mt-[18px] font-sans text-[44px] font-medium leading-[1.2] text-ink-dim">{line}</p>
    </div>
  );
}

/**
 * WRITE and OPENER: three phones fan out and type at once, then Remy's phone
 * takes the stage for round 1 (pick a prompt, write to it) and round 2 on
 * (reply to their latest line), with the round labelled beside it.
 */
export function WriteShot() {
  const t = useTime();
  const cues = useCues();
  const writeAt = cues.at("write");
  const each = cues.word("write", "each");
  const writes = cues.word("write", "writes");
  const phone = cues.word("write", "phone");
  const openerAt = cues.at("opener");
  const one = cues.word("opener", "one");
  const something = cues.word("opener", "something");
  const after = cues.word("opener", "after");
  const replying = cues.word("opener", "replying");
  const whatever = cues.word("opener", "whatever");
  const openerEnd = cues.end("opener");

  const fan = sp(t, each - 0.15, SPRINGS.smooth);
  const solo = sp(t, openerAt - 0.05, SPRINGS.smooth);
  const away = progress(t, openerAt - 0.1, 0.55, ease.in);

  return (
    <div className="absolute inset-0">
      {WRITERS.map((writer, index) => {
        const rise = sp(t, writeAt - 0.12 + index * 0.08, SPRINGS.smooth);
        const middle = index === 1;
        const side = index === 0 ? -1 : 1;
        let x = mix(960 + (index - 1) * 40, writer.x, fan);
        let y = mix(1500, mix(540, writer.y, fan), rise);
        let rotate = mix((index - 1) * 4, writer.rotate, fan);
        let scale = WRITE_SCALE;
        let opacity = 1;
        if (middle) {
          x = mix(x, SOLO.x, solo);
          y = mix(y, SOLO.y, solo);
          scale = mix(WRITE_SCALE, SOLO_SCALE, solo);
        } else {
          // Swiped off like a card.
          x += side * away * 1100;
          y -= away * 120;
          rotate += side * away * 34;
          opacity = 1 - progress(t, openerAt + 0.2, 0.25);
          if (opacity <= 0) return null;
        }
        const sendAt = phone + index * 0.12;
        const typeAt = writes + index * 0.14;
        const writer$ = (
          <WriterScreen
            who={CAST[writer.who]}
            text={TEXTS[writer.text].text}
            typeAt={typeAt}
            sendAt={sendAt}
          />
        );
        return (
          <div
            key={writer.who}
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: tf(x, y, scale, rotate), opacity, zIndex: middle ? 2 : 1 }}
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <PhoneMock width={PHONE_W}>
                {middle ? (
                  <PageSwipe
                    at={openerAt + 0.05}
                    first={writer$}
                    second={
                      <PageSwipe
                        at={after - 0.05}
                        first={
                          <OpenerScreen
                            pickAt={something}
                            typeAt={something + 0.5}
                            sendAt={after - 0.32}
                          />
                        }
                        second={
                          <ReplyScreen lineAt={replying - 0.1} typeAt={whatever} typeEnd={openerEnd + 0.3} />
                        }
                      />
                    }
                  />
                ) : (
                  writer$
                )}
              </PhoneMock>
            </div>
          </div>
        );
      })}

      <RoundLabel
        kicker="Round 1"
        title="Openers"
        line="Pick one of their prompts and open with it."
        at={one - 0.25}
        out={after - 0.05}
      />
      <RoundLabel
        kicker="Rounds 2 – 5"
        title="Replies"
        line="Answer whatever they just said."
        at={after + 0.15}
      />

      {/* Five rounds, as hearts: round 1 lights first, then the rest. */}
      <div
        className="absolute left-[930px] top-[680px] flex gap-[26px]"
        style={{ opacity: fin(t, one, 0.3) }}
      >
        {[0, 1, 2, 3, 4].map((round) => {
          const at = round === 0 ? one + 0.1 : after + 0.35 + round * 0.14;
          const level = Math.max(0.12, neonLevel(t, at, 10 + round));
          return (
            <div key={round} className="flex flex-col items-center gap-[6px]">
              <NeonHeart size={74} level={level} fill={clamp(level) * 0.5} color={C.rose} />
              <span
                className="font-mono text-[30px] font-bold text-ink-dim"
                style={{ opacity: 0.4 + clamp(level) * 0.6 }}
              >
                {round + 1}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
