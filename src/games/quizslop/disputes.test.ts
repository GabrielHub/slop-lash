import { describe, expect, test } from "vite-plus/test";
import { resolveDisputeBallot, resolveDisputeBallots, type DisputeBallotTally } from "./disputes";
import type { QuizslopDisputeVoteChoice } from "./types";

function votes(voidCount: number, upholdCount = 0): QuizslopDisputeVoteChoice[] {
  return [
    ...Array.from({ length: voidCount }, (): QuizslopDisputeVoteChoice => "VOID"),
    ...Array.from({ length: upholdCount }, (): QuizslopDisputeVoteChoice => "UPHOLD"),
  ];
}

describe("resolveDisputeBallot strict majority", () => {
  test("with 8 frozen voters, 5 VOID votes is a strict majority and voids the question", () => {
    expect(resolveDisputeBallot(votes(5, 3), 8)).toBe("PLAYER_VOIDED");
  });

  test("with 8 frozen voters, 4 VOID votes is a tie and a tie upholds", () => {
    expect(resolveDisputeBallot(votes(4, 4), 8)).toBe("UPHELD");
  });

  test("abstentions count against voiding: 3 VOID of 5 frozen (2 abstain) still voids because 3*2 > 5", () => {
    expect(resolveDisputeBallot(votes(3), 5)).toBe("PLAYER_VOIDED");
  });

  test("abstentions count against voiding: 2 VOID of 5 frozen upholds", () => {
    expect(resolveDisputeBallot(votes(2), 5)).toBe("UPHELD");
  });

  test("disconnecting after vote opening does not shrink the denominator: 4 VOID with 4 abstentions of 8 upholds", () => {
    expect(resolveDisputeBallot(votes(4), 8)).toBe("UPHELD");
  });

  test("zero votes (everyone abstains or the vote times out) upholds", () => {
    expect(resolveDisputeBallot([], 5)).toBe("UPHELD");
    expect(resolveDisputeBallot(votes(0, 0), 8)).toBe("UPHELD");
  });

  test("UPHOLD votes never help voiding: 3 VOID and 4 UPHOLD of 7 frozen still meets the strict majority", () => {
    // 3 * 2 = 6 is not > 7, so this one upholds ...
    expect(resolveDisputeBallot(votes(3, 4), 7)).toBe("UPHELD");
    // ... while 4 * 2 = 8 > 7 voids regardless of the 3 UPHOLD votes.
    expect(resolveDisputeBallot(votes(4, 3), 7)).toBe("PLAYER_VOIDED");
  });
});

describe("resolveDisputeBallots batched vote", () => {
  test("several ballots resolve independently against one shared frozen voter denominator", () => {
    const ballots: DisputeBallotTally[] = [
      { ballotId: "ballot-voided", votes: votes(5, 3) },
      { ballotId: "ballot-tied", votes: votes(4, 4) },
      { ballotId: "ballot-silent", votes: [] },
    ];
    const rulings = resolveDisputeBallots(ballots, 8);
    expect(rulings.size).toBe(3);
    expect(rulings.get("ballot-voided")).toBe("PLAYER_VOIDED");
    expect(rulings.get("ballot-tied")).toBe("UPHELD");
    expect(rulings.get("ballot-silent")).toBe("UPHELD");
  });

  test("an empty ballot batch settles to an empty ruling map", () => {
    expect(resolveDisputeBallots([], 8).size).toBe(0);
  });
});
