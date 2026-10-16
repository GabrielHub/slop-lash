"use client";

import { useTime } from "@/tutorial/clock";
import { STAMP_IMPACT } from "@/tutorial/kit";
import type { PreviewSpot } from "@/tutorial/preview";
import { C, Shot, fin, fout } from "../tutorial/fx";
import { DURATION, MOOD_Y, POSTER, T, feedY } from "./beatsheet";
import { Chat } from "./chat";
import { Jules } from "./hook";
import { Mood } from "./mood";
import { Room } from "./room";
import { Seam, Slate } from "./slate";

/** A quick flash on a stamp's impact frame. */
const impact = (t: number, at: number) => Math.max(0, 1 - Math.abs(t - at - STAMP_IMPACT - 0.02) / 0.14);

/**
 * MatchSlop's host-page spot: it's a match with Jules, the room's lines go
 * head to head and the boat line wins the vote, it's sent and lands, the mood
 * swings to a date, and the neon sign winks before a heart iris closes on the
 * loop. The chat and the meter share one feed that scrolls to the newest thing.
 */
function Scene() {
  const t = useTime();
  // The room warms as Jules melts, then washes mint for the date.
  const warm = fin(t, T.tapback, 0.5) * fout(t, T.slate + 0.4, 0.8);
  const mint = fin(t, T.dateStamp, 0.4) * fout(t, T.slate, 0.6) * 0.8;
  // The chat fades as the meter comes up under it.
  const chat = fout(t, T.scroll + 0.05, 0.35);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "var(--bg)" }}>
      <Room
        warm={warm}
        mint={mint}
        hit={Math.max(impact(t, T.stamp), impact(t, T.dateStamp))}
        hitColor={t < T.scroll ? C.rose : C.mint}
      />
      <Shot from={0} to={T.slate + 0.8}>
        <div className="absolute inset-0" style={{ transform: `translateY(${feedY(t).toFixed(1)}px)` }}>
          {chat > 0 && (
            <div className="absolute inset-0" style={{ opacity: chat }}>
              <Chat />
              {/* Over the chat, so Jules's face lands in front of her first bubble. */}
              <Jules />
            </div>
          )}
          {t >= T.scroll && (
            <div className="absolute inset-x-0 h-[1080px]" style={{ top: MOOD_Y }}>
              <Mood />
            </div>
          )}
        </div>
      </Shot>
      <Shot from={T.slate} to={DURATION}>
        <Slate />
      </Shot>
      <Seam />
    </div>
  );
}

export const spot: PreviewSpot = { Scene, duration: DURATION, poster: POSTER };
