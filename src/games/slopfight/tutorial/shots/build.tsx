"use client";

import { Camera, PhoneMock, Tap, Words } from "@/tutorial/kit";
import { SPRINGS, ease, mix, progress, spring, springTo, wobble } from "@/tutorial/timeline";
import { Doodle, Easel, SHARK_DOODLE, TOASTER_BROWS, TOASTER_DOODLE, TOASTER_STEAM, TUX_DOODLE } from "../doodles";
import { FREDOKA, INK, NIGHT, Slam, Spotlight, TOY, useBeat } from "../look";
import { ChoiceScreen, DescribeScreen, DrawScreen } from "../phone";

// "Every champion starts on your phone. Draw it, or just describe it."
// "A shark in a tuxedo. A toaster with anger issues. We don't judge."
// The phone draws a shark that the easel mirrors big; the phone switches to
// typing; then a two-easel gallery and three deadpan judges' cards.

const PHONE_W = 360;

/** A judge's scorecard on a stick. */
function Scorecard({ x, y, rotate }: { x: number; y: number; rotate: number }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: x - 105, top: y - 80, width: 210, transform: `rotate(${rotate}deg)`, transformOrigin: "105px 300px" }}
    >
      <div className="absolute left-[92px] top-[140px] h-[320px] w-[26px] rounded-[8px]" style={{ background: TOY.cocoa.hex, border: `5px solid ${INK}` }} />
      <div
        className="relative grid h-[160px] place-items-center rounded-[22px]"
        style={{ background: "#FFFDF7", border: `7px solid ${INK}`, boxShadow: "0 18px 30px -16px rgba(0,0,0,0.55)" }}
      >
        <span style={{ fontFamily: FREDOKA, fontWeight: 700, fontSize: 118, lineHeight: 1, color: INK, letterSpacing: "-0.02em" }}>10</span>
      </div>
    </div>
  );
}

export function BuildShot() {
  const b = useBeat();
  const t = b.t;
  const build = b.at("build");
  const champion = b.word("build", "champion");
  const starts = b.word("build", "starts");
  const draw = b.word("build", "draw");
  const describe = b.word("build", "describe");
  const ideas = b.at("ideas");
  const tuxedo = b.word("ideas", "tuxedo");
  const toaster = b.word("ideas", "toaster");
  const anger = b.word("ideas", "anger");
  const issues = b.word("ideas", "issues");
  const we = b.word("ideas", "we");
  const judge = b.word("ideas", "judge");
  const end = b.at("foundry") - 0.12;

  // Phone: in on "starts on your phone", out as the gallery opens.
  const phoneIn = spring(t - (starts - 0.12), SPRINGS.smooth);
  const phoneOut = progress(t, ideas - 0.15, 0.5, ease.in);
  const phoneX = 600 - phoneOut * 900;
  const phoneY = 150 + (1 - phoneIn) * 1000 + phoneOut * 120;

  // Fast-forwarded: the doodle zips on at "4x" until the gallery opens.
  const sharkDrawn = progress(t, draw + 0.2, ideas + 0.05 - (draw + 0.2), ease.inOut);
  const tuxDrawn = progress(t, tuxedo - 0.15, 0.85, ease.inOut);
  const toasterDrawn = progress(t, toaster - 0.2, anger - toaster + 0.05, ease.inOut);
  const browsDrawn = progress(t, anger, 0.3, ease.out);
  const steamDrawn = progress(t, issues, 0.55, ease.out);
  const typed = progress(t, describe + 0.2, 1.05);

  const screen =
    t < draw + 0.16 ? (
      <ChoiceScreen pressDraw={t > draw ? 1 - progress(t, draw + 0.05, 0.15) : 0} />
    ) : t < describe + 0.12 ? (
      <DrawScreen title="Draw your champion" layers={[{ strokes: SHARK_DOODLE, progress: sharkDrawn }]} />
    ) : (
      <DescribeScreen text="a toaster with anger issues" shown={typed} />
    );

  // Easels: the shark mirrors the phone, then both take the gallery.
  const easelIn = spring(t - (starts + 0.15), SPRINGS.smooth);
  const toGallery = spring(t - (ideas - 0.1), SPRINGS.gentle);
  const sharkX = mix(mix(2300, 1300, easelIn), 640, toGallery);
  const sharkScale = mix(1, 0.86, toGallery);
  const toasterIn = spring(t - (toaster - 0.75), SPRINGS.smooth);
  const toasterX = mix(2400, 1290, toasterIn);
  const canvas = 560;

  const whip = progress(t, end - 0.28, 0.28, ease.inExpo);
  const spotX = t < ideas ? mix(960, 1300, easelIn) : mix(1300, 960, toGallery);

  return (
    <div className="absolute inset-0" style={{ transform: `translateX(${-whip * 2300}px)`, filter: whip > 0.05 ? `blur(${whip * 14}px)` : undefined }}>
      <Spotlight x={spotX} width={1100} floor={900} intensity={0.85} />
      <Camera
        keys={[
          { at: 0 },
          { at: describe - 0.02 },
          { at: describe + 0.3, x: 620, y: 400, zoom: 1.55 },
          { at: ideas - 0.22, x: 620, y: 400, zoom: 1.55 },
          { at: ideas + 0.2 },
        ]}
      >
        {/* The title, slammed on "champion". */}
        {t < starts + 0.3 && (
          <div className="absolute inset-0" style={{ transform: `translateY(${-progress(t, starts - 0.08, 0.3, ease.inExpo) * 900}px)` }}>
            <div
              className="pointer-events-none absolute inset-x-0 text-center uppercase text-ink"
              style={{ top: 300, fontFamily: FREDOKA, fontWeight: 700, fontSize: 92, letterSpacing: "0.04em" }}
            >
              <Words text="Build your" at={build - 0.05} stagger={0.1} />
            </div>
            <Slam text="Champion!" at={champion - 0.06} x={960} y={540} size={190} rotate={-3} burst={TOY.butter.hex} burstSize={0.82} />
          </div>
        )}

        {/* Easels. */}
        {t > starts && (
          <div
            className="absolute"
            style={{ left: sharkX - canvas / 2, top: 190, transform: `scale(${sharkScale}) rotate(${wobble(t, 1) * 0.8}deg)`, transformOrigin: `${canvas / 2}px 0px` }}
          >
            <Easel size={canvas}>
              <Doodle
                size={canvas - 12}
                layers={[
                  { strokes: SHARK_DOODLE, progress: sharkDrawn },
                  { strokes: TUX_DOODLE, progress: tuxDrawn },
                ]}
              />
              {sharkDrawn > 0 && sharkDrawn < 1 && (
                <span
                  className="absolute right-[18px] top-[16px] rounded-[10px] px-[14px] py-[4px] font-mono text-[30px] font-bold"
                  style={{ background: NIGHT, color: "#FFF4DC", opacity: Math.floor(t * 4) % 2 === 0 ? 1 : 0.7 }}
                >
                  ▶▶ 4×
                </span>
              )}
            </Easel>
          </div>
        )}
        {t > toaster - 0.8 && (
          <div
            className="absolute"
            style={{ left: toasterX - canvas / 2, top: 190, transform: `scale(0.86) rotate(${wobble(t, 4) * 0.8 + 1.5}deg)`, transformOrigin: `${canvas / 2}px 0px` }}
          >
            <Easel size={canvas}>
              <Doodle
                size={canvas - 12}
                layers={[
                  { strokes: TOASTER_DOODLE, progress: toasterDrawn },
                  { strokes: TOASTER_BROWS, progress: browsDrawn },
                  { strokes: TOASTER_STEAM, progress: steamDrawn },
                ]}
              />
            </Easel>
          </div>
        )}

        {/* The phone. */}
        {t > starts - 0.2 && phoneOut < 1 && (
          <div className="absolute" style={{ left: phoneX - PHONE_W / 2, top: phoneY, transform: "rotate(-3deg)" }}>
            <PhoneMock width={PHONE_W}>
              {screen}
              <div className="absolute" style={{ left: 195 - 40, top: 298 - 40 }}>
                <Tap at={draw} size={80} />
              </div>
              <div className="absolute" style={{ left: 300 - 40, top: 556 - 40 }}>
                <Tap at={describe} size={80} />
              </div>
            </PhoneMock>
          </div>
        )}

        {/* "We don't judge." */}
        {t > we - 0.1 &&
          [
            { x: 760, rotate: -9 },
            { x: 960, rotate: 2 },
            { x: 1160, rotate: 8 },
          ].map((card, index) => {
            const at = we + index * 0.13;
            const rise = springTo(t, at, 700, 0, SPRINGS.pop);
            const nod = Math.sin(Math.max(0, t - judge - index * 0.08) * 9) * 4 * Math.exp(-Math.max(0, t - judge) * 3);
            return t > at ? <Scorecard key={index} x={card.x} y={790 + rise} rotate={card.rotate + nod} /> : null;
          })}
      </Camera>
    </div>
  );
}
