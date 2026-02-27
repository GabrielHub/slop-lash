import { describe, expect, it } from "vitest";
import { FORFEIT_MARKER } from "@/games/core/constants";
import { isDeadlineExpired, isVersionUnchanged, stripUnrevealedVotes } from "./route-helpers";

describe("isVersionUnchanged", () => {
  it("returns true when client version query matches", () => {
    expect(
      isVersionUnchanged({
        clientVersion: "42",
        ifNoneMatch: null,
        version: 42,
      }),
    ).toBe(true);
  });

  it("returns true when If-None-Match matches the ETag", () => {
    expect(
      isVersionUnchanged({
        clientVersion: null,
        ifNoneMatch: "\"7\"",
        version: 7,
      }),
    ).toBe(true);
  });

  it("returns false for mismatched version and ETag", () => {
    expect(
      isVersionUnchanged({
        clientVersion: "8",
        ifNoneMatch: "\"9\"",
        version: 10,
      }),
    ).toBe(false);
  });
});

describe("isDeadlineExpired", () => {
  it("returns false when deadline is null", () => {
    expect(isDeadlineExpired(null, 1_000)).toBe(false);
  });

  it("returns false before the deadline and true at the deadline", () => {
    const deadline = new Date(5_000);
    expect(isDeadlineExpired(deadline, 4_999)).toBe(false);
    expect(isDeadlineExpired(deadline, 5_000)).toBe(true);
  });
});

describe("stripUnrevealedVotes", () => {
  function makePrompt(id: string, responseCount: number, forfeit = false) {
    return {
      id,
      votes: [{ id: `vote-${id}`, voterId: `voter-${id}`, responseId: `resp-${id}`, failReason: null, voter: { id: `voter-${id}`, type: "HUMAN" } }],
      responses: Array.from({ length: responseCount }, (_, idx) => ({
        text: forfeit && idx === 0 ? FORFEIT_MARKER : `response-${id}-${idx}`,
        reactions: [{ id: `reaction-${id}-${idx}` }],
      })),
    };
  }

  it("does nothing outside the voting phase", () => {
    const game = {
      status: "WRITING",
      votingPromptIndex: 0,
      votingRevealing: false,
      rounds: [{ prompts: [makePrompt("a", 2)] }],
    };

    stripUnrevealedVotes(game);

    expect(game.rounds[0].prompts[0].votes).toHaveLength(1);
    expect(game.rounds[0].prompts[0].responses[0].reactions).toHaveLength(1);
  });

  it("strips current unrevealed and future votable prompts only", () => {
    const nonVotable = makePrompt("zzz", 1);
    const past = makePrompt("a", 2);
    const current = makePrompt("b", 2);
    const future = makePrompt("c", 2);
    const game = {
      status: "VOTING",
      votingPromptIndex: 1,
      votingRevealing: false,
      rounds: [{ prompts: [future, current, nonVotable, past] }],
    };

    stripUnrevealedVotes(game);

    expect(past.votes).toHaveLength(1);
    expect(past.responses[0].reactions).toHaveLength(1);

    // Current prompt preserves voter IDs but hides choices
    expect(current.votes).toHaveLength(1);
    expect((current.votes[0] as { responseId: unknown }).responseId).toBeNull();
    expect((current.votes[0] as { voterId: string }).voterId).toBe(`voter-b`);
    expect(current.responses.every((r) => r.reactions.length === 0)).toBe(true);

    expect(future.votes).toHaveLength(0);
    expect(future.responses.every((r) => r.reactions.length === 0)).toBe(true);

    // Non-votable prompts are ignored by the stripping logic.
    expect(nonVotable.votes).toHaveLength(1);
    expect(nonVotable.responses[0].reactions).toHaveLength(1);
  });

  it("preserves the current prompt once revealing has started", () => {
    const current = makePrompt("a", 2);
    const future = makePrompt("b", 2);
    const game = {
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: true,
      rounds: [{ prompts: [future, current] }],
    };

    stripUnrevealedVotes(game);

    expect(current.votes).toHaveLength(1);
    expect(current.responses[0].reactions).toHaveLength(1);
    expect(future.votes).toHaveLength(0);
    expect(future.responses.every((r) => r.reactions.length === 0)).toBe(true);
  });

  it("excludes forfeited prompts from votable list", () => {
    const normal = makePrompt("a", 2);
    const forfeited = makePrompt("b", 2, true);
    const game = {
      status: "VOTING",
      votingPromptIndex: 0,
      votingRevealing: true,
      rounds: [{ prompts: [normal, forfeited] }],
    };

    stripUnrevealedVotes(game);

    // Forfeited prompt is not votable, so its votes/reactions are untouched
    expect(forfeited.votes).toHaveLength(1);
    expect(forfeited.responses[0].reactions).toHaveLength(1);
  });
});
