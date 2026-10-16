"use client";

import { useCues, useTime } from "@/tutorial/clock";
import { Burst, STAMP_IMPACT, shakeOffset } from "@/tutorial/kit";
import { SPRINGS, clamp, ease, mix, progress, spring } from "@/tutorial/timeline";
import { COPY } from "../../ui/copy";
import { CAST, MATCH, type CastId } from "../data";
import { FRIEND, FriendText, GroupHeader, Sticker } from "../friend";
import { C, Heart, alpha, fin, fout, heartbeat, sp, tf } from "../fx";
import { MatchCard, MsStamp, PromptCard, Token } from "../parts";
import { SignHeart, SignKicker, SignWord } from "../sign";

/** Where each swiper's fingertip lands on the card, relative to its centre. */
const FINGERS: readonly { who: CastId; x: number; y: number; fromX: number }[] = [
  { who: "zoe", x: -150, y: -70, fromX: -620 },
  { who: "tess", x: 120, y: -170, fromX: 520 },
  { who: "remy", x: -70, y: 150, fromX: -260 },
  { who: "claude", x: 160, y: 80, fromX: 760 },
];

const CARD = { x: 960, y: 560, scale: 0.96 };
const CARD_LEFT = 545;

/**
 * Sting, intro, vet and profile: the neon sign strikes on; her voice note
 * lands in the group chat; the match's card rises and everyone's fingers
 * swipe it right at once; she sighs and lays down the rules; then the card
 * unblurs into Jules and their prompts deal in to be read, learned, loved.
 */
export function MeetShot() {
  const t = useTime();
  const cues = useCues();
  const intro = cues.at("intro");
  const hi = cues.word("intro", "hi");
  const best = cues.word("intro", "best");
  const and = cues.word("intro", "and");
  const friend = cues.word("intro", "friend", 1);
  const all = cues.word("intro", "all");
  const you = cues.word("intro", "you");
  const atW = cues.word("intro", "at");
  const once = cues.word("intro", "once");
  const fine = cues.at("vet");
  const sigh = fine - 0.55;
  const before = cues.word("vet", "before");
  const heres = cues.word("vet", "here's");
  const profile = cues.at("profile");
  const read = cues.word("profile", "read");
  const learn = cues.word("profile", "learn");
  const love = cues.word("profile", "love");

  // The sign: centre stage for the sting, then the name rises to the top.
  const lift = sp(t, intro - 0.65, SPRINGS.gentle);
  const signGone = fout(t, read - 0.15, 0.4);
  const extras = fout(t, intro - 0.65, 0.3);
  const chat = fin(t, intro - 0.45, 0.3) * fout(t, and - 0.05, 0.3);

  // The card rises on "my friend", is swiped right by all of you, and moves aside on "Fine".
  const rise = sp(t, friend - 0.3, SPRINGS.smooth);
  const drag = progress(t, you - 0.08, 0.5, ease.inOut) * (1 - spring(t - (atW - 0.2), SPRINGS.pop));
  const slide = sp(t, fine - 0.05, SPRINGS.smooth);
  const stampAt = once - STAMP_IMPACT + 0.04;
  const shake = shakeOffset(t, stampAt + STAMP_IMPACT, 16, 0.4);
  const slump = fin(t, sigh, 0.35, ease.inOut) * fout(t, fine - 0.05, 0.3);
  const beat = heartbeat(t, 1.1, love - 0.08) * fin(t, love - 0.1, 0.1);
  const cardX = mix(CARD.x, CARD_LEFT, slide) + drag * 200 + shake.x;
  const cardY = mix(1500, CARD.y, rise) + shake.y + slump * 16;
  const cardRotate = mix(8, 0, rise) + drag * 12 - slump * 2.5;

  const unblur = progress(t, profile + 0.05, 0.75, ease.out);
  const named = progress(t, profile + 0.3, 0.5);
  const placed = fin(t, profile + 0.8, 0.3);
  const tagged = fin(t, profile + 1.05, 0.35);
  const like = clamp(drag * 1.6);

  return (
    <div className="absolute inset-0">
      {/* The sign. */}
      <div className="absolute inset-0" style={{ opacity: signGone }}>
        <div
          className="absolute left-1/2 top-0"
          style={{
            transform: `translate(-50%, ${mix(352, 120, lift)}px) translate(0, -50%) scale(${mix(1, 0.62, lift)})`,
            opacity: extras,
          }}
        >
          <SignHeart strikeAt={0.15} />
        </div>
        <div
          className="absolute left-1/2 top-0"
          style={{ transform: `translate(-50%, -50%) translate(0, ${mix(578, 92, lift)}px) scale(${mix(1, 0.34, lift)})` }}
        >
          <SignWord strikeAt={0.45} />
        </div>
        <div
          className="absolute left-1/2 top-0"
          style={{ transform: `translate(-50%, -50%) translate(0, ${mix(740, 200, lift)}px)`, opacity: extras }}
        >
          <SignKicker strikeAt={1.15} text="How to play" />
        </div>
      </div>

      {/* The group chat she's sending to; her voice note itself is drawn by the scene. */}
      {chat > 0 && (
        <div className="absolute inset-0" style={{ opacity: chat }}>
          <div
            className="absolute left-1/2 top-[300px] -translate-x-1/2"
            style={{ transform: `translateY(${(1 - sp(t, intro - 0.45, SPRINGS.smooth)) * -30}px)` }}
          >
            <GroupHeader />
          </div>
          <p className="absolute left-[480px] top-[462px] font-sans text-[30px] font-bold text-teal">
            {FRIEND.label}
          </p>
          <div className="absolute left-[1395px] top-[470px]">
            <Sticker at={hi - 0.05} tilt={14} size={84}>
              👋
            </Sticker>
          </div>
          <div className="absolute left-[520px] top-[690px]">
            <Sticker at={best - 0.05} tilt={-6} size={52} tone={C.violet}>
              Best friend 🫶
            </Sticker>
          </div>
        </div>
      )}

      {/* Her rules, as texts. */}
      <div className="absolute left-[900px] top-[330px] flex flex-col items-start gap-[24px]">
        <p
          className="pl-[80px] font-sans text-[30px] font-bold text-teal"
          style={{ opacity: fin(t, before - 0.05, 0.2) * fout(t, profile - 0.2, 0.3) }}
        >
          {FRIEND.label}
        </p>
        <FriendText at={before - 0.05} out={profile - 0.2} size={56} face={false}>
          ✋ Hands off. For now.
        </FriendText>
        <FriendText at={heres - 0.05} out={profile - 0.15} size={56}>
          House rules 👇
        </FriendText>
      </div>

      {/* The prompts deal in on "Read it", then get highlighted on "Learn it". */}
      <div className="absolute left-[1255px] top-[552px] flex -translate-x-1/2 -translate-y-1/2 flex-col gap-[28px]">
        {MATCH.prompts.map((card, index) => {
          const at = read - 0.12 + index * 0.2;
          const deal = sp(t, at, SPRINGS.smooth);
          const tilt = index % 2 === 0 ? -4 : 4;
          return (
            <div
              key={card.prompt}
              style={{
                opacity: fin(t, at, 0.18),
                transform: tf(mix(220, 0, deal), 0, mix(0.94, 1, deal), mix(tilt, 0, deal)),
              }}
            >
              <PromptCard
                prompt={card.prompt}
                answer={card.answer}
                mark={card.mark}
                marked={progress(t, learn - 0.05 + index * 0.2, 0.45, ease.inOut)}
                width={830}
              />
            </div>
          );
        })}
      </div>

      {/* The card, the fingers and the stamps move as one. */}
      {t >= friend - 0.4 && (
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${cardX}px, ${cardY}px) rotate(${cardRotate}deg) scale(${CARD.scale * (1 + beat * 0.025)})` }}
        >
          <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
            <MatchCard blur={1 - unblur} named={named} placed={placed} tagged={tagged}>
              {/* The swipe's heart, growing with the drag. */}
              <div
                className="pointer-events-none absolute left-[34px] top-[34px]"
                style={{ opacity: like, transform: `rotate(-14deg) scale(${mix(0.6, 1, like)})` }}
              >
                <Heart size={150} color={C.rose} style={{ filter: `drop-shadow(0 0 22px ${alpha(C.rose, 80)})` }} />
              </div>
              {/* "Love it": a rose glow pulses round the card. */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[48px]"
                style={{ boxShadow: `inset 0 0 0 ${4 + beat * 4}px ${alpha(C.rose, beat * 90)}` }}
              />
            </MatchCard>
          </div>

          {/* "It's a match", across the photo. */}
          <div className="absolute left-0 top-[-20px] -translate-x-1/2 -translate-y-1/2">
            <MsStamp text={COPY.itsAMatch} at={stampAt} size={70} out={profile - 0.05} />
          </div>
          {/* All of you. At once. */}
          <div className="absolute left-[150px] top-[-330px]">
            <Sticker at={once + 0.3} out={fine + 0.2} tilt={10} size={70} tone={C.coral}>
              ×4
            </Sticker>
          </div>
          {/* The sigh. */}
          <div className="absolute left-[-300px] top-[-360px]">
            <Sticker at={sigh} out={before + 0.4} tilt={-12} size={78}>
              😮‍💨
            </Sticker>
          </div>
          {/* Love it. */}
          <div className="absolute left-[150px] top-[-360px]">
            <Sticker at={love} tilt={12} size={80}>
              😍
            </Sticker>
          </div>

          {/* Everyone's fingertips, on the same card. */}
          {FINGERS.map((finger, index) => {
            const at = all - 0.15 + index * 0.09;
            if (t < at - 0.05) return null;
            const land = sp(t, at, SPRINGS.smooth);
            const lifted = progress(t, atW - 0.2 + index * 0.05, 0.3, ease.in);
            if (lifted >= 1) return null;
            const ring = progress(t, at + 0.25, 0.5, ease.out);
            return (
              <div
                key={finger.who}
                className="absolute left-0 top-0"
                style={{
                  transform: `translate(${mix(finger.fromX, finger.x, land)}px, ${mix(820, finger.y, land)}px) rotate(${-cardRotate}deg)`,
                  opacity: 1 - lifted,
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2 size-[96px] rounded-full border-[5px] border-ink"
                  style={{
                    opacity: ring > 0 && ring < 1 ? (1 - ring) * 0.6 : 0,
                    transform: `translate(-50%, -50%) scale(${1 + ring * 1.2})`,
                  }}
                />
                <div style={{ transform: `translate(-50%, -50%) scale(${1 + lifted * 0.3})` }}>
                  <Token who={CAST[finger.who]} size={88} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hearts burst as the match lands. */}
      <div className="absolute" style={{ left: CARD.x, top: CARD.y - 40 }}>
        <Burst
          at={stampAt + STAMP_IMPACT}
          count={30}
          shape="heart"
          size={40}
          speed={1250}
          gravity={1500}
          colors={[C.rose, C.coral, C.violet, C.rose]}
          seed={4}
        />
      </div>

      {/* Little hearts float off the card on "Love it". */}
      <div className="absolute" style={{ left: CARD_LEFT, top: CARD.y - 120 }}>
        <Burst
          at={love}
          count={12}
          shape="heart"
          size={34}
          speed={330}
          gravity={-120}
          spread={120}
          duration={1.3}
          colors={[C.rose, C.coral]}
          seed={9}
        />
      </div>
    </div>
  );
}
