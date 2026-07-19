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
  start = vi.fn();
}

let resumeSucceeds = true;
const contexts: FakeAudioContext[] = [];

class FakeAudioContext {
  currentTime = 0;
  destination = new FakeAudioNode();
  state: AudioContextState = "suspended";
  readonly sources: FakeBufferSourceNode[] = [];
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
    return new FakeGainNode();
  }

  async decodeAudioData(): Promise<{ duration: number }> {
    return { duration: 0.25 };
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

  test("migrates legacy preferences into versioned storage", async () => {
    const { storage } = installBrowser();
    storage.setItem("soundsMuted", "true");
    storage.setItem("soundsVolume", "0.2");
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
});
