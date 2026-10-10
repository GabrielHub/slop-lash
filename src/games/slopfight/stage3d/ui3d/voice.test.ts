import { describe, expect, it } from "vite-plus/test";
import type { VoiceLine } from "../../narration";
import { CAPTION_MIN_MS, SAY_GAP_MS, SAY_LEAD_MS, VoiceService } from "./voice";

const line = (key: string, text = "A short line.", priority = 10): VoiceLine => ({ key, text, speak: true, priority, beat: "build" });

function service() {
  const clock = { now: 1_000 };
  const voice = new VoiceService(() => clock.now);
  const advance = (ms: number, step = 50) => {
    for (let t = 0; t < ms; t += step) {
      clock.now += step;
      voice.tick();
    }
  };
  return { clock, voice, advance };
}

describe("VoiceService", () => {
  it("captions a said line after the lead, for at least the minimum time", () => {
    const { voice, advance, clock } = service();
    voice.say(line("a"));
    voice.tick();
    expect(voice.caption).toBeNull();
    advance(SAY_LEAD_MS + 50);
    expect(voice.caption?.line.key).toBe("a");
    expect(voice.caption!.until - voice.caption!.shownAt).toBeGreaterThanOrEqual(CAPTION_MIN_MS);
    expect(voice.caption!.shownAt).toBeLessThanOrEqual(clock.now);
  });

  it("never talks over itself: a second line waits for the first to finish", () => {
    const { voice, advance } = service();
    voice.say([line("a"), line("b")]);
    advance(SAY_LEAD_MS + 100);
    expect(voice.caption?.line.key).toBe("a");
    advance(400);
    expect(voice.caption?.line.key).toBe("a");
    advance(CAPTION_MIN_MS + SAY_GAP_MS + SAY_LEAD_MS + 3_000);
    expect(voice.caption?.line.key).toBe("b");
  });

  it("does not repeat a line that was already shown", () => {
    const { voice, advance } = service();
    voice.say(line("a"));
    advance(SAY_LEAD_MS + 100);
    const seq = voice.caption!.seq;
    advance(CAPTION_MIN_MS + 2_000);
    voice.say(line("a"));
    advance(SAY_LEAD_MS + 2_000);
    expect(voice.caption!.seq).toBe(seq);
  });

  it("shows scheduled lines at their moment and feeds the narrator", () => {
    const { voice, advance, clock } = service();
    voice.schedule([{ ...line("f1"), at: clock.now + 2_000 }]);
    expect(voice.getSnapshot().lines.map((l) => l.key)).toContain("f1");
    advance(1_500);
    expect(voice.caption).toBeNull();
    advance(700);
    expect(voice.caption?.line.key).toBe("f1");
  });

  it("prefetches without captioning", () => {
    const { voice, advance } = service();
    voice.prefetch(line("p"));
    advance(3_000);
    expect(voice.caption).toBeNull();
    expect(voice.getSnapshot().prefetch.map((l) => l.key)).toEqual(["p"]);
  });

  it("starts fresh for a new game", () => {
    const { voice, advance } = service();
    voice.setGame("game-1");
    const first = voice.voice;
    voice.say(line("a"));
    advance(SAY_LEAD_MS + 100);
    voice.setGame("game-2");
    expect(voice.voice).not.toBe(first);
    expect(voice.caption).toBeNull();
    expect(voice.waiting).toBe(0);
    voice.setGame("game-2");
    expect(voice.gameSeed).toBe("game-2");
  });
});
