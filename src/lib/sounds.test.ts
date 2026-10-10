import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FakeAudioParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  linearRampToValueAtTime = vi.fn();
  setValueAtTime = vi.fn();
}

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeCompressorNode extends FakeAudioNode {
  attack = new FakeAudioParam();
  knee = new FakeAudioParam();
  ratio = new FakeAudioParam();
  release = new FakeAudioParam();
  threshold = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: { duration: number } | null = null;
  onended: (() => void) | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = new FakeAudioParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakeStereoPannerNode extends FakeAudioNode {
  pan = new FakeAudioParam();
}

let resumeSucceeds = true;
const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeAudioNode();
  state: AudioContextState = "suspended";
  readonly sources: FakeBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly panners: FakeStereoPannerNode[] = [];
  private readonly stateListeners = new Set<() => void>();

  constructor() {
    contexts.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === "statechange") this.stateListeners.add(listener);
  }

  createBufferSource(): FakeBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  createDynamicsCompressor(): FakeCompressorNode {
    return new FakeCompressorNode();
  }

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createStereoPanner(): FakeStereoPannerNode {
    const panner = new FakeStereoPannerNode();
    this.panners.push(panner);
    return panner;
  }

  async decodeAudioData(): Promise<{ duration: number }> {
    return { duration: 4.5 };
  }

  async resume(): Promise<void> {
    if (!resumeSucceeds) return;
    this.state = "running";
    this.stateListeners.forEach((listener) => listener());
  }
}

function installBrowser({ reducedMotion = false }: { reducedMotion?: boolean } = {}) {
  const storage = new MemoryStorage();
  const matchMedia = vi.fn(() => ({ matches: reducedMotion }));
  const windowStub = {
    addEventListener: vi.fn(),
    matchMedia,
    removeEventListener: vi.fn(),
  };
  const fetchMock = vi.fn(async () => ({
    arrayBuffer: async () => new ArrayBuffer(8),
    ok: true,
  }));

  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("AudioContext", FakeAudioContext as unknown as typeof AudioContext);
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, matchMedia, storage, windowStub };
}

/** The gain nodes the runtime builds, in creation order. */
function graph(context: FakeAudioContext) {
  const [master, sfx, narrator, bedNarratorDuck, bedMomentDuck, music, ambience] = context.gains;
  return { master, sfx, narrator, bedNarratorDuck, bedMomentDuck, music, ambience };
}

const fetchedUrls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.map((call) => String(call[0]));

beforeEach(() => {
  contexts.length = 0;
  resumeSucceeds = true;
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared audio runtime", () => {
  test("plays sound when the OS requests reduced motion", async () => {
    const { matchMedia } = installBrowser({ reducedMotion: true });
    const { getAudioStatus, playSoundAndWait } = await import("./sounds");

    await expect(playSoundAndWait("phase-transition")).resolves.toBe(true);
    expect(contexts[0]?.sources[0]?.start).toHaveBeenCalledOnce();
    expect(getAudioStatus()).toBe("ready");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  test("reports when browser autoplay still needs a user interaction", async () => {
    installBrowser();
    resumeSucceeds = false;
    const { activateAudio, getAudioStatus } = await import("./sounds");

    await expect(activateAudio()).resolves.toBe(false);
    expect(getAudioStatus()).toBe("blocked");
  });

  test("keeps the first-interaction unlock armed after a rejected gesture", async () => {
    const { windowStub } = installBrowser();
    resumeSucceeds = false;
    const { listenForAudioUnlock } = await import("./sounds");
    const release = listenForAudioUnlock();
    const pointerHandler = windowStub.addEventListener.mock.calls.find(
      ([type]) => type === "pointerdown",
    )?.[1];

    expect(pointerHandler).toBeTypeOf("function");
    (pointerHandler as () => void)();
    await vi.waitFor(() => {
      expect(
        windowStub.addEventListener.mock.calls.filter(([type]) => type === "pointerdown"),
      ).toHaveLength(2);
    });
    release();
  });

  test("restores and persists versioned audio preferences", async () => {
    const { storage } = installBrowser();
    storage.setItem(
      "audioPreferences:v1",
      JSON.stringify({ muted: true, version: 1, volume: 0.2 }),
    );
    const { getVolume, isMuted, toggleMute } = await import("./sounds");

    expect(isMuted()).toBe(true);
    expect(getVolume()).toBe(0.2);
    toggleMute();

    expect(JSON.parse(storage.getItem("audioPreferences:v1") ?? "null")).toEqual({
      muted: false,
      version: 1,
      volume: 0.2,
    });
  });

  test("surfaces asset failures instead of swallowing them", async () => {
    const { fetchMock } = installBrowser();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const { getAudioIssue, playSoundAndWait } = await import("./sounds");

    await expect(playSoundAndWait("game-start")).resolves.toBe(false);
    expect(getAudioIssue()).toBe("network down");
  });

  test("applies per-call pitch, gain, pan and delay", async () => {
    installBrowser();
    const { playSoundAndWait } = await import("./sounds");

    await expect(
      playSoundAndWait("phase-transition", { semitones: 12, gain: 0.5, pan: -1, delay: 0.2 }),
    ).resolves.toBe(true);
    const context = contexts[0]!;
    const source = context.sources[0]!;
    expect(source.playbackRate.value).toBe(2);
    expect(context.panners[0]?.pan.value).toBe(-1);
    expect(source.start).toHaveBeenCalledWith(0.2);
  });

  test("seeded jitter repeats per seed and stays within its spread", async () => {
    installBrowser();
    const { playbackRateFor } = await import("./sounds");

    const a = playbackRateFor({ jitter: 2, seed: "strike:1" });
    expect(playbackRateFor({ jitter: 2, seed: "strike:1" })).toBe(a);
    const rates = Array.from({ length: 20 }, (_, index) =>
      playbackRateFor({ jitter: 2, seed: `strike:${index}` }),
    );
    expect(new Set(rates).size).toBeGreaterThan(15);
    for (const rate of rates) {
      expect(rate).toBeGreaterThanOrEqual(2 ** (-2 / 12));
      expect(rate).toBeLessThanOrEqual(2 ** (2 / 12));
    }
    expect(playbackRateFor({})).toBe(1);
  });

  test("a sound bank loads nothing until its game uses it", async () => {
    const { fetchMock } = installBrowser();
    const { createSoundBank, preloadSounds, playSoundAndWait } = await import("./sounds");
    const bank = createSoundBank("test", {
      hit: { src: "/sfx/test/hit.mp3" },
      bed: { src: "/sfx/test/bed.mp3", loop: { start: 0.1, end: 4.1 } },
    });

    preloadSounds();
    await playSoundAndWait("game-start");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchedUrls(fetchMock).filter((url) => url.startsWith("/sfx/test/"))).toEqual([]);

    await expect(bank.playAndWait("hit")).resolves.toBe(true);
    expect(fetchedUrls(fetchMock)).toContain("/sfx/test/hit.mp3");
    expect(fetchedUrls(fetchMock)).not.toContain("/sfx/test/bed.mp3");

    bank.preload();
    expect(fetchedUrls(fetchMock)).toContain("/sfx/test/bed.mp3");
  });

  test("preloading before audio exists fetches now and decodes once audio starts", async () => {
    const { fetchMock } = installBrowser();
    const { activateAudio, createSoundBank } = await import("./sounds");
    const bank = createSoundBank("test", { hit: { src: "/sfx/test/hit.mp3" } });

    bank.preload();
    expect(contexts).toHaveLength(0);
    expect(fetchedUrls(fetchMock)).toEqual(["/sfx/test/hit.mp3"]);

    await activateAudio();
    await expect(bank.load("hit")).resolves.toEqual({ duration: 4.5 });
    expect(fetchedUrls(fetchMock)).toEqual(["/sfx/test/hit.mp3"]);
  });

  test("loading a prefetched bank can create audio without fetching the sound twice", async () => {
    const { fetchMock } = installBrowser();
    const { createSoundBank } = await import("./sounds");
    const bank = createSoundBank("test", { hit: { src: "/sfx/test/hit.mp3" } });
    bank.preload();
    await expect(bank.load("hit")).resolves.toEqual({ duration: 4.5 });
    expect(contexts).toHaveLength(1);
    expect(fetchedUrls(fetchMock)).toEqual(["/sfx/test/hit.mp3"]);
  });

  test("bank sounds keep mute and cooldown semantics", async () => {
    const { storage } = installBrowser();
    storage.setItem(
      "audioPreferences:v1",
      JSON.stringify({ muted: true, version: 1, volume: 0.5 }),
    );
    const { createSoundBank, toggleMute } = await import("./sounds");
    const bank = createSoundBank("test", { tap: { src: "/sfx/test/tap.mp3", cooldownMs: 10_000 } });

    await expect(bank.playAndWait("tap")).resolves.toBe(false);
    toggleMute();
    await expect(bank.playAndWait("tap")).resolves.toBe(true);
    await expect(bank.playAndWait("tap")).resolves.toBe(false);
  });

  test("loops play between their loop points on their bus and stop with a fade", async () => {
    installBrowser();
    const { activateAudio, createSoundBank } = await import("./sounds");
    const bank = createSoundBank("test", {
      bed: { src: "/sfx/test/bed.mp3", gain: 0.5, loop: { start: 0.1, end: 4.1 } },
    });
    await activateAudio();

    const handle = bank.loop("bed", { bus: "music" });
    const context = contexts[0]!;
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const source = context.sources[0]!;
    expect(source.loop).toBe(true);
    expect(source.loopStart).toBe(0.1);
    expect(source.loopEnd).toBe(4.1);
    expect(source.start).toHaveBeenCalledWith(0, 0.1);
    const loopGain = context.gains.at(-1)!;
    expect(loopGain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.05);
    expect(loopGain.connect).toHaveBeenCalledWith(graph(context).music);

    handle.stop(0.5);
    expect(handle.stopped).toBe(true);
    expect(loopGain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.5);
    expect(source.stop).toHaveBeenCalledWith(0.51);
  });

  test("a loop stopped before its file loads never starts", async () => {
    installBrowser();
    const { activateAudio, createSoundBank } = await import("./sounds");
    const bank = createSoundBank("test", { bed: { src: "/sfx/test/bed.mp3" } });
    await activateAudio();

    const handle = bank.loop("bed");
    handle.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(contexts[0]!.sources).toHaveLength(0);
  });

  test("the narrator ducks music and ambience as well as SFX", async () => {
    installBrowser();
    const { activateAudio, setNarratorDucking } = await import("./sounds");
    await activateAudio();
    const { sfx, bedNarratorDuck } = graph(contexts[0]!);

    setNarratorDucking(true);
    expect(sfx!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.35, 0.03);
    expect(bedNarratorDuck!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.3, 0.03);
    setNarratorDucking(false);
    expect(sfx!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.25);
    expect(bedNarratorDuck!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 0.25);
  });

  test("a duck requested before audio exists applies when it starts", async () => {
    installBrowser();
    const { activateAudio, setNarratorDucking } = await import("./sounds");
    setNarratorDucking(true);
    await activateAudio();
    const { sfx, bedNarratorDuck } = graph(contexts[0]!);
    expect(sfx!.gain.value).toBe(0.35);
    expect(bedNarratorDuck!.gain.value).toBe(0.3);
  });

  test("duck() dips the beds for a moment and keeps the deepest overlapping dip", async () => {
    installBrowser();
    const { activateAudio, duck } = await import("./sounds");
    await activateAudio();
    const context = contexts[0]!;
    const { bedMomentDuck, sfx } = graph(context);
    const ramp = bedMomentDuck!.gain.linearRampToValueAtTime;

    duck(0.4, 500);
    expect(ramp).toHaveBeenNthCalledWith(1, 0.4, 0.04);
    expect(ramp).toHaveBeenNthCalledWith(2, 1, 0.85);

    context.currentTime = 0.2;
    duck(0.6, 100);
    // Still inside the first dip: the depth stays 0.4 and the end stays at 0.5 s.
    expect(ramp).toHaveBeenNthCalledWith(3, 0.4, expect.closeTo(0.24));
    expect(ramp).toHaveBeenNthCalledWith(4, 1, 0.85);
    expect(sfx!.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  test("bed bus levels are adjustable", async () => {
    installBrowser();
    const { activateAudio, getBusGain, setBusGain } = await import("./sounds");
    await activateAudio();
    const { music } = graph(contexts[0]!);
    expect(music!.gain.value).toBe(getBusGain("music"));

    setBusGain("music", 0.2, 0.1);
    expect(getBusGain("music")).toBe(0.2);
    expect(music!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.2, 0.1);
  });
});
