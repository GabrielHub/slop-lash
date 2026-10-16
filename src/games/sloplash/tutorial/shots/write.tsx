"use client";

import { useLocalCues, useLocalTime } from "@/tutorial/clock";
import { Camera, PHONE_SCREEN, centredPhone, flight, phonePoint, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring, type LocalCues } from "@/tutorial/timeline";
import {
  COUNT_FROM,
  MAX_CHARS,
  MY_ANSWER,
  PROMPT,
  PROMPT_2,
  RAMBLE,
  YOU,
} from "../content";
import { PixelText, pixelSize } from "../pixel";
import {
  PHONE_SCALE,
  PHONE_WIDTH,
  Phone,
  Sticker,
  Touch,
  WRITER,
  WriterScreen,
} from "../parts";

/**
 * Write: the phone takes delivery of two prompts, an answer types itself and
 * goes off with Send, then a runaway draft hits the 80-character wall.
 */

const PX = 700;
const PY = 510;
const FRAME = centredPhone(PX, PY, PHONE_WIDTH);

/** How much of `text` is typed between `start` and `end`. */
export function typed(t: number, text: string, start: number, end: number): string {
  return text.slice(0, Math.floor(clamp((t - start) / Math.max(0.01, end - start)) * text.length));
}

/** The key under the last character typed, while typing. */
export function keyAt(t: number, text: string, start: number, end: number): string | null {
  if (t < start || t > end + 0.05) return null;
  const shown = typed(t, text, start, end);
  return shown.at(-1) ?? null;
}

export function writeBeats(b: LocalCues) {
  const dealOne = b.word("prompts", "gets") - 0.08;
  const dealTwo = b.word("prompts", "two");
  const deliver = Math.max(dealTwo + 0.45, b.word("prompts", "prompts.") + 0.1);
  const typeStart = b.word("type", "type") + 0.3;
  const typeEnd = Math.max(typeStart + 0.8, b.word("type", "and") - 0.05);
  const send = b.word("type", "send.");
  const shortStart = b.at("short") + 0.05;
  const cap = Math.max(shortStart + 1, b.word("short", "tops."));
  return { dealOne, dealTwo, deliver, typeStart, typeEnd, send, shortStart, cap };
}

export function WriteShot({ from, until }: { from: number; until: number }) {
  const t = useLocalTime();
  const b = useLocalCues();
  const beats = writeBeats(b);
  const { send, shortStart, cap } = beats;
  const leave = until - from;

  // The phone rises in under the sweep and leaves left when the rival shows up.
  const enter = spring(t - 0.04, SPRINGS.smooth);
  const exit = progress(t, leave - 0.05, 0.5, ease.in);
  const capShake = t >= cap ? Math.sin((t - cap) * 60) * 14 * Math.max(0, 1 - (t - cap) / 0.5) : 0;

  const sendTouch = phonePoint(FRAME, PHONE_SCREEN.width / 2, WRITER.send.top + WRITER.send.height / 2);
  const keysTouch = phonePoint(FRAME, PHONE_SCREEN.width / 2 + 60, 720);

  return (
    <div className="absolute inset-0">
      <Camera
        keys={[
          { at: 0, x: 960, y: 540, zoom: 1 },
          { at: b.at("type") - 0.1, x: 960, y: 540, zoom: 1 },
          { at: b.at("type") + 0.6, x: 790, y: 430, zoom: 1.3 },
          { at: send + 0.32, x: 790, y: 430, zoom: 1.3 },
          { at: send + 1.05, x: 960, y: 540, zoom: 1 },
        ]}
      >
        <Phone
          x={PX}
          y={PY}
          dx={capShake + mix(0, -980, exit)}
          dy={(1 - enter) * 900}
          rotate={(1 - enter) * 10 - exit * 14}
          sticker={<Sticker member={YOU} rotate={5} />}
        >
          <Screen beats={beats} />
        </Phone>
        <LiftOff beats={beats} />
        <Touch
          from={b.word("type", "hit") - 0.35}
          to={send + 0.45}
          path={[
            { at: b.word("type", "hit") - 0.35, x: keysTouch.x, y: keysTouch.y },
            { at: send - 0.05, x: sendTouch.x, y: sendTouch.y },
          ]}
          taps={[send]}
        />
        <Deal beats={beats} />
      </Camera>
      <Limit start={shortStart} slam={b.word("short", "eighty")} cap={cap} leave={leave} />
    </div>
  );
}

/** What the phone shows, beat by beat. */
function Screen({ beats }: { beats: ReturnType<typeof writeBeats> }) {
  const t = useLocalTime();
  const { deliver, typeStart, typeEnd, send, shortStart, cap } = beats;
  const landed = deliver + 0.57;
  const lifted = t >= send + 0.08;
  const nextIn = progress(t, send + 0.32, 0.4, ease.out);
  const keyboard = progress(t, typeStart - 0.45, 0.35, ease.out);

  if (!lifted) {
    const text = typed(t, MY_ANSWER, typeStart, typeEnd);
    return (
      <WriterScreen
        sent={[0, 0]}
        prompt={PROMPT}
        promptOpacity={progress(t, landed - 0.05, 0.15)}
        boxOpacity={1}
        pending={1 - progress(t, landed - 0.1, 0.15)}
        text={text}
        caret={t >= typeStart - 0.4 && (t < typeEnd || Math.floor(t * 2.4) % 2 === 0)}
        focus={t >= typeStart - 0.4}
        counter={null}
        ready={text.length > 0}
        press={t >= send - 0.02 && t < send + 0.14 ? 1 : 0}
        activeKey={keyAt(t, MY_ANSWER, typeStart, typeEnd)}
        keyboard={keyboard}
      />
    );
  }

  const draft = typed(t, RAMBLE.slice(0, MAX_CHARS), shortStart, cap);
  const hot = draft.length >= MAX_CHARS;
  return (
    <WriterScreen
      sent={[progress(t, send + 0.1, 0.3, ease.out), 0]}
      prompt={PROMPT_2}
      promptX={(1 - nextIn) * 380}
      promptOpacity={nextIn}
      text={draft}
      caret={t < cap || Math.floor(t * 2.4) % 2 === 0}
      counter={draft.length >= COUNT_FROM ? draft.length : null}
      counterHot={hot}
      boxFlash={hot ? Math.max(0.6, 1 - progress(t, cap, 0.6)) : 0}
      ready={draft.length > 0}
      activeKey={keyAt(t, RAMBLE.slice(0, MAX_CHARS), shortStart, cap)}
      keyboard={1}
    />
  );
}

/** Two prompt cards dealt in from the right, then delivered into the phone. */
function Deal({ beats }: { beats: ReturnType<typeof writeBeats> }) {
  const t = useLocalTime();
  const { dealOne, dealTwo, deliver } = beats;
  const target = phonePoint(FRAME, PHONE_SCREEN.width / 2, WRITER.prompt + 70);
  const cards = [
    { text: PROMPT, tag: "1/2", at: dealOne, x: 1320, y: 330, rotate: 4, fly: deliver + 0.12 },
    { text: PROMPT_2, tag: "2/2", at: dealTwo, x: 1390, y: 610, rotate: -3, fly: deliver },
  ];
  return (
    <>
      {[...cards].reverse().map((card) => {
        if (t < card.at) return null;
        const arrive = spring(t - card.at, SPRINGS.smooth);
        const go = flight(t, {
          at: card.fly,
          duration: 0.45,
          from: { x: card.x, y: card.y },
          to: target,
          lift: 120,
          easing: ease.inOut,
        });
        if (go.progress >= 1) return null;
        const x = mix(card.x + 620, card.x, arrive);
        const y = mix(card.y - 260, card.y, arrive);
        const flying = t >= card.fly;
        return (
          <div
            key={card.tag}
            className="absolute"
            style={{
              left: flying ? go.x : x,
              top: flying ? go.y : y,
              opacity: progress(t, card.at, 0.1) * (1 - progress(go.progress, 0.7, 0.3)),
              transform: `translate(-50%, -50%) rotate(${mix(card.rotate + (1 - arrive) * 24, -4, go.progress)}deg) scale(${mix(1, 0.42, go.progress)})`,
            }}
          >
            <PromptCard text={card.text} tag={card.tag} />
          </div>
        );
      })}
    </>
  );
}

function PromptCard({ text, tag }: { text: string; tag: string }) {
  return (
    <div className="relative w-[600px] rounded-[30px] border-2 border-edge bg-surface px-[40px] pb-[34px] pt-[30px] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]">
      <span className="mb-[12px] inline-block rounded-full bg-raised px-[16px] py-[4px] font-mono text-[28px] font-bold text-ink-dim">
        Prompt {tag}
      </span>
      <p className="font-display text-[50px] font-bold leading-[1.08] text-gold-ink">{text}</p>
    </div>
  );
}

/** On Send, the prompt and answer lift off the phone together and whoosh away. */
function LiftOff({ beats }: { beats: ReturnType<typeof writeBeats> }) {
  const t = useLocalTime();
  const go = beats.send + 0.08;
  const local = t - go;
  if (local < 0 || local > 0.75) return null;
  const width = (PHONE_SCREEN.width - WRITER.pad * 2) * PHONE_SCALE;
  const topLeft = phonePoint(FRAME, WRITER.pad, WRITER.prompt - 12);
  const height = (WRITER.box.top + WRITER.box.height - WRITER.prompt + 24) * PHONE_SCALE;
  const p = progress(local, 0.08, 0.55, ease.in);
  const pop = spring(local, SPRINGS.pop);
  const y = -1300 * p;
  return (
    <div
      className="absolute"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width,
        transform: `translateY(${y}px) rotate(${-7 * p}deg) scale(${mix(1, 1.08, pop) * (1 - p * 0.1)}, ${mix(1, 1.08, pop) * (1 + p * 0.25)})`,
      }}
    >
      {p > 0.02 &&
        [1, 2, 3].map((ghost) => (
          <div
            key={ghost}
            className="absolute inset-x-0 top-0 rounded-[26px] border-[3px] border-teal"
            style={{
              height: height,
              transform: `translateY(${ghost * 90 * Math.min(1, p * 2.5)}px)`,
              opacity: (0.5 - ghost * 0.13) * Math.min(1, p * 4),
            }}
          />
        ))}
      <div
        className="rounded-[26px] border-[3px] border-teal bg-surface px-[22px] py-[18px] shadow-[0_24px_50px_-20px_rgba(0,0,0,0.6)]"
        style={{ minHeight: height }}
      >
        <p className="font-display text-[30px] font-bold leading-[1.1] text-gold-ink">{PROMPT}</p>
        <p className="mt-[12px] font-sans text-[32px] leading-[1.2] text-ink">{MY_ANSWER}</p>
      </div>
    </div>
  );
}

const SEGMENTS = 20;
const NUMBER = pixelSize("80", 30, 6);

/** "80": the cap as a giant LED number over a bar of segments filling as the draft types. */
function Limit({
  start,
  slam,
  cap,
  leave,
}: {
  /** When the draft starts typing. */
  start: number;
  /** When "80" slams in. */
  slam: number;
  /** When the draft hits the cap. */
  cap: number;
  leave: number;
}) {
  const t = useLocalTime();
  const shown =
    progress(t, start - 0.2, 0.3, ease.out) * (1 - progress(t, leave - 0.05, 0.35, ease.in));
  if (shown <= 0) return null;
  const count = typed(t, RAMBLE.slice(0, MAX_CHARS), start, cap).length;
  const hot = count >= MAX_CHARS;
  const shake = shakeOffset(t, cap, 18, 0.5);
  const flash = hot ? 1 - progress(t, cap, 0.5, ease.out) : 0;
  const drop = spring(t - slam, SPRINGS.slam);
  return (
    <div
      className="absolute"
      style={{
        left: 1350,
        top: 470,
        opacity: shown,
        transform: `translate(-50%, -50%) translate(${shake.x + (1 - shown) * 120}px, ${shake.y}px)`,
      }}
    >
      <div className="flex flex-col items-center gap-[34px]">
        <div
          style={{
            width: NUMBER.width,
            height: NUMBER.height,
            opacity: progress(t, slam, 0.06),
            transform: `scale(${mix(2.2, 1, drop) * (1 + flash * 0.12)}) rotate(${mix(-8, 0, drop)}deg)`,
          }}
        >
          <PixelText text="80" cell={30} gap={6} color={hot ? "var(--fail)" : "var(--gold)"} flashAt={hot ? cap : undefined} />
        </div>
        <div className="flex gap-[6px]">
          {Array.from({ length: SEGMENTS }, (_, index) => {
            const filled = clamp(count / (MAX_CHARS / SEGMENTS) - index);
            const zone =
              (index + 1) * (MAX_CHARS / SEGMENTS) > COUNT_FROM ? "var(--gold)" : "var(--teal)";
            const tone = hot ? "var(--fail)" : zone;
            return (
              <span
                key={index}
                className="h-[58px] w-[26px] rounded-[6px]"
                style={{
                  background:
                    filled > 0
                      ? `color-mix(in srgb, ${tone} ${Math.round(40 + filled * 60)}%, transparent)`
                      : "color-mix(in srgb, var(--ink) 9%, transparent)",
                  boxShadow:
                    filled > 0.99 ? `0 0 14px color-mix(in srgb, ${tone} 50%, transparent)` : undefined,
                  transform: hot ? `scaleY(${1 + flash * 0.25})` : undefined,
                }}
              />
            );
          })}
        </div>
        <p className="font-display text-[40px] font-bold leading-none text-ink-dim">
          <span className={`font-mono ${hot ? "text-fail" : "text-ink"}`}>{count}</span>
          <span> / 80 characters</span>
        </p>
      </div>
    </div>
  );
}
