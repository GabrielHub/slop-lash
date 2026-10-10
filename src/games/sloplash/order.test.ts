import { describe, expect, it } from "vite-plus/test";
import { mixedHash } from "../../lib/hash";
import { presentationOrder } from "./order";

/** Convex-style ids: a shared prefix with a few changing characters, like real rows created in a burst. */
const id = (n: number) => `k57${n.toString(36).padStart(4, "0")}aqz9vb`;

describe("presentationOrder", () => {
  it("is stable for a prompt and keeps every answer", () => {
    const answers = [{ _id: id(1) }, { _id: id(2) }];
    const once = presentationOrder("prompt-1", answers);
    expect(presentationOrder("prompt-1", answers)).toEqual(once);
    expect(presentationOrder("prompt-1", [...answers].reverse())).toEqual(once);
    expect(once.map((a) => a._id).toSorted()).toEqual(answers.map((a) => a._id).toSorted());
  });

  it("does not keep creation order: the AI's earlier answer is not always on the left", () => {
    let aiFirst = 0;
    const trials = 400;
    for (let n = 0; n < trials; n += 1) {
      // The AI writes first, so its row id is the earlier one.
      const ai = { _id: id(2 * n), author: "ai" };
      const human = { _id: id(2 * n + 1), author: "human" };
      if (presentationOrder(`prompt${id(n)}`, [ai, human])[0]!.author === "ai") aiFirst += 1;
    }
    expect(aiFirst / trials).toBeGreaterThan(0.4);
    expect(aiFirst / trials).toBeLessThan(0.6);
  });
});

describe("mixedHash", () => {
  it("spreads its top bit independently of the input's low bits", () => {
    // Inputs that differ only in a character's high bits: FNV-1a's low bit would never change.
    const bits = ["a", "c", "e", "g", "i", "k", "m", "o", "q", "s", "u", "w"].map(
      (letter) => mixedHash(`voter:${letter}`) >>> 31,
    );
    expect(new Set(bits).size).toBe(2);
  });
});
