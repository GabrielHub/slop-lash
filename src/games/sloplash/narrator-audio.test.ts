import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

type FakeSource = {
  buffer: { duration: number } | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const audio = vi.hoisted(() => {
  const sources: FakeSource[] = [];
  return {
    busNode: {},
    ctx: {
      createBufferSource: vi.fn(() => {
        const source: FakeSource = {
          buffer: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
          start: vi.fn(),
          stop: vi.fn(),
        };
        sources.push(source);
        return source;
      }),
      currentTime: 0,
      decodeAudioData: vi.fn(async () => ({ duration: 1 })),
    },
    sources,
  };
});

vi.mock("@/lib/sounds", () => ({
  activateAudio: async () => true,
  getAudioContext: () => ({ ctx: audio.ctx, gain: {} }),
  getNarratorBusNode: () => audio.busNode,
}));

import { NarratorPlaybackQueue } from "./narrator-audio";

beforeEach(() => {
  audio.sources.length = 0;
  audio.ctx.createBufferSource.mockClear();
  audio.ctx.decodeAudioData.mockClear();
});

describe("NarratorPlaybackQueue", () => {
  test("ignores stale ended events after clearing and starting a new clip", async () => {
    const activity: boolean[] = [];
    const queue = new NarratorPlaybackQueue((active) => activity.push(active));

    await queue.enqueueEncoded("YQ==");
    const staleSource = audio.sources[0];
    expect(staleSource).toBeDefined();
    queue.clear();
    await queue.enqueueEncoded("Yg==");

    staleSource?.onended?.();
    expect(activity).toEqual([true, false, true]);

    audio.sources[1]?.onended?.();
    expect(activity).toEqual([true, false, true, false]);
  });

  test("drops a clip whose decode was still in flight when the queue was cleared", async () => {
    const activity: boolean[] = [];
    const queue = new NarratorPlaybackQueue((active) => activity.push(active));

    let releaseDecode: ((buffer: { duration: number }) => void) | undefined;
    audio.ctx.decodeAudioData.mockImplementationOnce(
      () =>
        new Promise<{ duration: number }>((resolve) => {
          releaseDecode = resolve;
        }),
    );

    const pending = queue.enqueueEncoded("YQ==");
    await Promise.resolve();
    queue.clear();
    releaseDecode?.({ duration: 1 });
    await pending;

    expect(audio.ctx.createBufferSource).not.toHaveBeenCalled();
    expect(activity).toEqual([]);
  });
});
