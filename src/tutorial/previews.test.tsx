import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { GAME_TYPES } from "@/games/core/types";
import { ClockProvider, TutorialClock } from "./clock";
import { PREVIEWS } from "./previews";

describe("preview spots", () => {
  for (const game of GAME_TYPES) {
    it(`${game} loops in 9–12 s and draws any frame`, { timeout: 20_000 }, async () => {
      const spot = await PREVIEWS[game]();
      expect(spot.duration).toBeGreaterThanOrEqual(9);
      expect(spot.duration).toBeLessThanOrEqual(12);
      expect(spot.poster).toBeGreaterThanOrEqual(0);
      expect(spot.poster).toBeLessThan(spot.duration);

      // Spots are pure functions of time with no voice track (a cue hook
      // throws without one): every frame, including the seam either side of
      // the wrap, must render on its own.
      const times = [spot.poster, spot.duration - 0.05, spot.duration];
      for (let t = 0; t < spot.duration; t += 0.5) times.push(t);
      const clock = new TutorialClock();
      for (const t of times) {
        clock.set(t);
        const frame = renderToStaticMarkup(
          <ClockProvider clock={clock}>
            <spot.Scene />
          </ClockProvider>,
        );
        expect(frame.length, `${game} at ${t}s`).toBeGreaterThan(0);
      }
    });
  }
});
