"use client";

import { useTime } from "@/tutorial/clock";
import { Burst, STAMP_IMPACT, Stamp, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, mix, wobble } from "@/tutorial/timeline";
import { COPY } from "../ui/copy";
import { MATCH } from "../tutorial/data";
import { C, Heart, alpha, fin, fout, sp } from "../tutorial/fx";
import { MatchFace } from "../tutorial/parts";
import { FEED, FLOAT, T } from "./beatsheet";
import { AVATAR } from "./chat";

/** The card, centred on the board while the feed frames "Impress me" (feed px). */
const CARD = { x: 960, y: 560 - FEED.ask, width: 640, height: 820 };
const PHOTO = 540;
const FACE = 330;
/** The face's centre, from the card's centre. */
const FACE_Y = PHOTO / 2 - CARD.height / 2;
const STAMP_AT = { x: 960, y: 520 - FEED.ask };

/**
 * The hook: Jules's card swoops in on a swipe tilt, "It's a match" slams
 * across it with a burst of hearts, then the card shrinks until only the face
 * is left, as Jules's avatar beside her first line. It follows her down when she types again.
 */
export function Jules() {
  const t = useTime();
  const enter = sp(t, T.cardIn, FLOAT);
  const shrink = sp(t, T.toAvatar, SPRINGS.smooth);
  const impact = T.stamp + STAMP_IMPACT;
  const shake = shakeOffset(t, impact, 12, 0.35);
  const end = AVATAR.size / FACE;
  const scale = mix(1, end, shrink);
  // A heartbeat bump as the stamp lands.
  const thump = Math.max(0, 1 - Math.abs(t - impact - 0.05) / 0.16);
  const x = mix(mix(CARD.x + 1150, CARD.x, enter) + shake.x, AVATAR.x, shrink);
  const avatarY = mix(AVATAR.y, AVATAR.replyY, sp(t, T.typing - 0.04, SPRINGS.smooth));
  const y = mix(mix(CARD.y + 320, CARD.y, enter) + shake.y, avatarY - FACE_Y * end, shrink);
  const sway = wobble(t * 1.6, 2) * 1.4 * (1 - shrink);
  const rotate = mix(mix(26, -3, enter) + sway, 0, shrink);
  const body = 1 - clamp(shrink * 2.2);
  // The swipe's heart grows on the card as it tilts in, and leaves when the match lands.
  const like = fin(t, T.cardIn + 0.12, 0.22) * fout(t, impact + 0.1, 0.25);

  return (
    <>
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rotate.toFixed(2)}deg) scale(${(scale * (1 + thump * 0.03)).toFixed(4)})`,
        }}
      >
        <div
          className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
          style={{ width: CARD.width, height: CARD.height }}
        >
          {body > 0 && (
            <div
              className="absolute inset-0 overflow-hidden rounded-[60px] border-[3px] border-edge bg-surface"
              style={{
                opacity: body,
                boxShadow: `0 60px 110px -50px rgba(0,0,0,0.65), 0 0 0 1px ${alpha(C.rose, 12)}, 0 0 80px ${alpha(C.rose, 14)}`,
              }}
            >
              <div
                className="absolute inset-x-0 top-0"
                style={{
                  height: PHOTO,
                  background: `radial-gradient(120% 90% at 30% 10%, ${alpha(C.rose, 26)}, transparent 60%), radial-gradient(100% 90% at 90% 100%, ${alpha(C.violet, 26)}, transparent 60%), var(--raised)`,
                }}
              />
              <span className="absolute right-[34px] top-[34px] rounded-full bg-ai px-[22px] py-[8px] font-display text-[52px] font-black leading-none text-accent-ink">
                AI
              </span>
              <p
                className="absolute inset-x-0 text-center font-display font-black leading-none text-ink"
                style={{ top: PHOTO + 72, fontSize: 124 }}
              >
                {MATCH.name}, <span className="text-punch">{MATCH.age}</span>
              </p>
              {like > 0.01 && (
                <div
                  className="absolute left-[40px] top-[40px]"
                  style={{ opacity: like, transform: `rotate(-14deg) scale(${mix(0.5, 1, like)})` }}
                >
                  <Heart size={150} color={C.rose} style={{ filter: `drop-shadow(0 0 22px ${alpha(C.rose, 80)})` }} />
                </div>
              )}
            </div>
          )}
          <div
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ top: CARD.height / 2 + FACE_Y }}
          >
            <MatchFace size={FACE} />
          </div>
        </div>
      </div>

      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${STAMP_AT.x}px, ${STAMP_AT.y}px)` }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <Stamp worn text={COPY.itsAMatch} at={T.stamp} rotate={-8} size={112} out={T.toAvatar - 0.2} />
        </div>
      </div>
      <div className="absolute" style={{ left: STAMP_AT.x, top: STAMP_AT.y }}>
        <Burst
          at={impact}
          count={26}
          shape="heart"
          size={58}
          speed={1350}
          gravity={1500}
          colors={[C.rose, C.coral, C.violet, C.rose]}
          seed={4}
        />
      </div>
    </>
  );
}
