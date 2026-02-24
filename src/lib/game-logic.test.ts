import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({ prisma: {} }));
vi.mock("./ai", () => ({ generateJoke: vi.fn(), aiVote: vi.fn() }));

import { generateRoomCode, assignPrompts } from "./game-logic";

describe("generateRoomCode", () => {
  it("returns a 4-character string", () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
  });

  it("only contains valid characters (no ambiguous chars like 0, O, 1, I)", () => {
    const valid = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(valid).toContain(char);
      }
    }
  });

  it("produces varying codes (not deterministic)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generateRoomCode());
    }
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("assignPrompts", () => {
  const players = ["alice", "bob", "carol", "dave"];

  it("returns the requested number of assignments", () => {
    const assignments = assignPrompts(players, 4);
    expect(assignments).toHaveLength(4);
  });

  it("assigns exactly 2 players per prompt", () => {
    const assignments = assignPrompts(players, 4);
    for (const a of assignments) {
      expect(a.playerIds).toHaveLength(2);
    }
  });

  it("assigns different players to each prompt (no self-pairing)", () => {
    const assignments = assignPrompts(players, 4);
    for (const a of assignments) {
      expect(a.playerIds[0]).not.toBe(a.playerIds[1]);
    }
  });

  it("pairs players in round-robin order", () => {
    const assignments = assignPrompts(players, 4);
    expect(assignments[0].playerIds).toEqual(["alice", "bob"]);
    expect(assignments[1].playerIds).toEqual(["bob", "carol"]);
    expect(assignments[2].playerIds).toEqual(["carol", "dave"]);
    expect(assignments[3].playerIds).toEqual(["dave", "alice"]); // wraps around
  });

  it("wraps around with fewer prompts than players", () => {
    const assignments = assignPrompts(players, 2);
    expect(assignments).toHaveLength(2);
    expect(assignments[0].playerIds).toEqual(["alice", "bob"]);
    expect(assignments[1].playerIds).toEqual(["bob", "carol"]);
  });

  it("wraps around with more prompts than players", () => {
    const assignments = assignPrompts(["a", "b", "c"], 5);
    expect(assignments).toHaveLength(5);
    // Player assignment cycles: a,b / b,c / c,a / a,b / b,c
    expect(assignments[3].playerIds).toEqual(["a", "b"]);
    expect(assignments[4].playerIds).toEqual(["b", "c"]);
  });

  it("each assignment has a unique prompt text", () => {
    const assignments = assignPrompts(players, 4);
    const texts = assignments.map((a) => a.promptText);
    expect(new Set(texts).size).toBe(4);
  });

  it("excludes prompts from the exclude set", () => {
    const first = assignPrompts(players, 4);
    const exclude = new Set(first.map((a) => a.promptText));
    const second = assignPrompts(players, 4, exclude);

    for (const a of second) {
      expect(exclude.has(a.promptText)).toBe(false);
    }
  });
});
