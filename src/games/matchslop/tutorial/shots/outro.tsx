"use client";

import { useCues, useTime } from "@/tutorial/clock";
import { Burst } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { COPY } from "../../ui/copy";
import { Sticker } from "../friend";
import { C, NeonHeart, alpha, fin, fout, heartbeat, neonLevel, sp, tf } from "../fx";
import { SignHeart, SignWord } from "../sign";

/**
 * OUTRO: five hearts strike on for five rounds (the last is the last
 * message); the neon heart comes back with a face that watches you, leans in
 * for the whisper, and winks on "weird"; the name lights up last.
 */
export function OutroShot() {
  const t = useTime();
  const cues = useCues();
  // The iris opens just after "Five" (see scene.tsx), so the hearts strike from there.
  const strikeAt = cues.word("outro", "five") + 0.35;
  const rounds = cues.word("outro", "rounds");
  const ill = cues.word("outro", "i'll");
  const watching = cues.word("outro", "watching");
  const and = cues.word("outro", "and");
  const weird = cues.word("outro", "weird");

  const up = sp(t, ill - 0.05, SPRINGS.gentle);
  const filled = progress(t, rounds + 0.1, 0.4);
  const roundsBeat = Math.max(0, 1 - Math.abs(t - (rounds + 0.25)) / 0.25);
  const wink = progress(t, weird + 0.05, 0.25);
  const tilt = spring(t - (weird + 0.05), SPRINGS.jelly);
  // Eyes glance left, right, then back at you on "watching".
  const look =
    progress(t, watching - 0.05, 0.18, ease.inOut) * -1 +
    progress(t, watching + 0.3, 0.25, ease.inOut) * 2 -
    progress(t, watching + 0.75, 0.2, ease.inOut);
  // The whisper: the room dims and the heart leans in.
  const hush = fin(t, and - 0.1, 0.4, ease.inOut) * fout(t, weird + 0.05, 0.3);

  return (
    <div className="absolute inset-0">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: hush,
          background: `radial-gradient(45% 50% at 50% 46%, transparent 30%, ${alpha(C.bg, 80)} 100%)`,
        }}
      />

      {/* Five rounds. */}
      <div className="absolute left-0 top-0" style={{ transform: tf(960, mix(470, 176, up), mix(1, 0.52, up)) }}>
        {[0, 1, 2, 3, 4].map((round) => {
          const at = strikeAt + round * 0.07;
          const level = neonLevel(t, at, 20 + round);
          const last = round === 4;
          const x = (round - 2) * 240;
          const pop = sp(t, at, SPRINGS.pop);
          const beat = heartbeat(t, 1.1, rounds + round * 0.04) * filled;
          return (
            <div
              key={round}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                transform: tf(x, 0, mix(0.6, 1, clamp(pop)) * (1 + roundsBeat * 0.12 + beat * 0.05)),
                opacity: 1 - hush * 0.6,
              }}
            >
              <div className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                <NeonHeart
                  size={150}
                  level={Math.max(level, 0.001)}
                  fill={filled * 0.75}
                  color={last ? C.coral : C.rose}
                />
                <span
                  className={`mt-[10px] whitespace-nowrap font-display text-[34px] font-black uppercase tracking-[0.06em] ${last ? "text-gold-ink" : "text-ink-dim"}`}
                  style={{ opacity: fin(t, at + 0.1, 0.2) * (1 - up) }}
                >
                  {last ? COPY.lastMessage : `Round ${round + 1}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* The heart, back to keep an eye on you. */}
      {t >= ill - 0.1 && (
        <>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: tf(960, 500, 1 + hush * 0.12, tilt * 10) }}
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <SignHeart strikeAt={ill - 0.05} size={280} face={fin(t, ill - 0.1, 0.25)} wink={wink} look={look} />
            </div>
          </div>
          <div className="absolute left-[1250px] top-[330px]">
            <Sticker at={watching} out={and - 0.1} tilt={12} size={80}>
              👀
            </Sticker>
          </div>
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: tf(960, 780, 1) }}>
            <div className="-translate-x-1/2 -translate-y-1/2">
              <SignWord strikeAt={weird + 0.35} size={150} />
            </div>
          </div>
          <div className="absolute left-[960px] top-[500px]">
            <Burst
              at={weird + 0.08}
              count={14}
              shape="heart"
              size={36}
              speed={700}
              gravity={600}
              colors={[C.rose, C.coral, C.violet]}
              seed={31}
            />
          </div>
        </>
      )}
    </div>
  );
}
