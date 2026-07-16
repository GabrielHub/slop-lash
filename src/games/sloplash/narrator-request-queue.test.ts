import { describe, expect, test, vi } from "vite-plus/test";
import { BoundedSerialQueue } from "./narrator-request-queue";

describe("BoundedSerialQueue", () => {
  test("processes narration requests in insertion order", async () => {
    const processed: string[] = [];
    let finish: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const queue = new BoundedSerialQueue<string>(
      4,
      async (item) => {
        processed.push(item);
        if (processed.length === 3) finish?.();
      },
      vi.fn(),
    );

    queue.enqueue("voting-start");
    queue.enqueue("first-matchup");
    queue.enqueue("vote-result");
    await finished;

    expect(processed).toEqual(["voting-start", "first-matchup", "vote-result"]);
  });

  test("drops the stalest waiting request when the pending bound is reached", async () => {
    const processed: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let finish: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const queue = new BoundedSerialQueue<string>(
      1,
      async (item) => {
        processed.push(item);
        if (item === "first") await firstGate;
        if (item === "third") finish?.();
      },
      vi.fn(),
    );

    queue.enqueue("first");
    expect(queue.enqueue("second")).toBeUndefined();
    expect(queue.enqueue("third")).toBe("second");
    releaseFirst?.();
    await finished;

    expect(processed).toEqual(["first", "third"]);
  });
});
