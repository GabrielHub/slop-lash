import { describe, expect, it } from "vite-plus/test";
import {
  addResult,
  EMPTY_RECORD,
  fighterSeats,
  fightLimitMs,
  fightSeed,
  finalRound,
  houseCount,
  podium,
  qualifierPairings,
  roundArena,
  seedOrder,
  TOTAL_FIGHTS,
  type SlotPairing,
} from "./tournament";

const key = ({ a, b }: SlotPairing) => [a, b].toSorted((x, y) => x - y).join("-");

describe("seats", () => {
  it("puts humans first in join order, then the house", () => {
    expect(fighterSeats(2)).toEqual([
      { slot: 0, human: 0 },
      { slot: 1, human: 1 },
      { slot: 2, human: null },
      { slot: 3, human: null },
    ]);
    expect([houseCount(2), houseCount(3), houseCount(4)]).toEqual([2, 1, 0]);
  });

  it("refuses a human count outside 2-4", () => {
    expect(() => fighterSeats(1)).toThrow();
    expect(() => qualifierPairings(5)).toThrow();
  });
});

describe("qualifierPairings", () => {
  it("matches the spec's table", () => {
    expect(qualifierPairings(4)).toEqual([
      [
        { a: 0, b: 1 },
        { a: 2, b: 3 },
      ],
      [
        { a: 0, b: 2 },
        { a: 1, b: 3 },
      ],
    ]);
    expect(qualifierPairings(3)).toEqual([
      [
        { a: 0, b: 1 },
        { a: 2, b: 3 },
      ],
      [
        { a: 0, b: 2 },
        { a: 1, b: 3 },
      ],
    ]);
    // Two humans: A-X and B-Y, then the house fight opens round 2 and A-B headlines it.
    expect(qualifierPairings(2)).toEqual([
      [
        { a: 0, b: 2 },
        { a: 1, b: 3 },
      ],
      [
        { a: 2, b: 3 },
        { a: 0, b: 1 },
      ],
    ]);
  });

  it.each([2, 3, 4])(
    "with %i humans everyone fights twice and nobody meets the same opponent twice",
    (humans) => {
      const fights = qualifierPairings(humans).flat();
      expect(new Set(fights.map(key)).size).toBe(fights.length);
      for (const slot of [0, 1, 2, 3]) {
        expect(fights.filter((fight) => fight.a === slot || fight.b === slot)).toHaveLength(2);
      }
      for (const round of qualifierPairings(humans)) {
        expect(new Set(round.flatMap((fight) => [fight.a, fight.b])).size).toBe(4);
      }
    },
  );

  it("every human fights at least one human in the qualifiers", () => {
    for (const humans of [2, 3, 4]) {
      const fights = qualifierPairings(humans).flat();
      for (let slot = 0; slot < humans; slot += 1) {
        expect(
          fights.some(
            (fight) =>
              (fight.a === slot && fight.b < humans) || (fight.b === slot && fight.a < humans),
          ),
        ).toBe(true);
      }
    }
  });
});

describe("fights", () => {
  it("shortens only house-versus-house fights", () => {
    expect(fightLimitMs(true, true)).toBe(20_000);
    expect(fightLimitMs(true, false)).toBe(30_000);
    expect(fightLimitMs(false, false)).toBe(30_000);
  });

  it("derives a distinct uint32 seed per fight, stable across calls", () => {
    const seeds = [1, 2, 3].flatMap((round) => [0, 1].map((step) => fightSeed(42, round, step)));
    expect(seeds).toHaveLength(TOTAL_FIGHTS);
    expect(new Set(seeds).size).toBe(TOTAL_FIGHTS);
    for (const seed of seeds) {
      expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
    }
    expect(fightSeed(42, 2, 1)).toBe(seeds[3]);
    expect(fightSeed(43, 2, 1)).not.toBe(seeds[3]);
  });

  it("fights each round in its arena, the Final round in the third", () => {
    const arenas = ["ROOFTOP", "FLOODED_GARAGE", "KITCHEN_COUNTER"] as const;
    expect(roundArena(arenas, 1)).toBe("ROOFTOP");
    expect(roundArena(arenas, 3)).toBe("KITCHEN_COUNTER");
    expect(() => roundArena(arenas, 4)).toThrow();
  });
});

describe("seeding", () => {
  const entry = (id: string, slot: number, wins: number, healthLeft: number) => ({
    id,
    slot,
    record: { wins, losses: 2 - wins, healthLeft },
  });

  it("ranks by wins, then health left", () => {
    const order = seedOrder(
      [entry("a", 0, 1, 50), entry("b", 1, 2, 10), entry("c", 2, 1, 90), entry("d", 3, 0, 200)],
      7,
    );
    expect(order.map((item) => item.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("breaks a full tie by the game seed, deterministically", () => {
    const tied = [entry("a", 0, 1, 50), entry("b", 1, 1, 50), entry("c", 2, 1, 50), entry("d", 3, 1, 50)];
    const first = seedOrder(tied, 11).map((item) => item.id);
    expect(seedOrder([...tied].reverse(), 11).map((item) => item.id)).toEqual(first);
    const orders = new Set(
      Array.from({ length: 12 }, (_, seed) =>
        seedOrder(tied, seed)
          .map((item) => item.id)
          .join(""),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("puts seeds 3-4 in the third-place fight and 1-2 in the Final", () => {
    const round = finalRound(
      [entry("a", 0, 0, 0), entry("b", 1, 2, 0), entry("c", 2, 1, 80), entry("d", 3, 1, 20)],
      1,
    );
    expect(round.seeding).toEqual(["b", "c", "d", "a"]);
    expect(round.final).toEqual({ a: "b", b: "c" });
    expect(round.thirdPlace).toEqual({ a: "d", b: "a" });
  });

  it("builds the podium from round 3", () => {
    expect(
      podium({ a: "d", b: "a", winner: "B" }, { a: "b", b: "c", winner: "B" }),
    ).toEqual(["c", "b", "a", "d"]);
    expect(podium({ a: "d", b: "a", winner: null }, { a: "b", b: "c", winner: "A" })).toBeNull();
  });

  it("adds results to a record", () => {
    const record = addResult(addResult(EMPTY_RECORD, true, 41.6), false, -5);
    expect(record).toEqual({ wins: 1, losses: 1, healthLeft: 42 });
  });
});
