import { describe, expect, it } from "vite-plus/test";
import { computeAwards } from "@/games/sloplash/awards";
import { matchupOutcome } from "@/games/sloplash/outcomes";
import type { RoomView } from "@/room/context";
import { sloplashFixtureData, sloplashFixtures } from "./sloplash";

const fixture = (id: string) => {
  const found = sloplashFixtures.find((candidate) => candidate.id === `sloplash-${id}`);
  if (!found) throw new Error(`No fixture sloplash-${id}`);
  return found.view;
};

const scores = (players: { name: string; score: number }[]) =>
  Object.fromEntries(players.map((player) => [player.name, player.score]));

function mode(view: RoomView) {
  if (view.mode.kind !== "SLOPLASH") throw new Error("Not a SlopLash view");
  return view.mode;
}

function awardsOf(view: RoomView) {
  const byId = new Map(view.players.map((player) => [player.id as string, player.name]));
  return computeAwards(mode(view).rounds, view.players).map(
    (award) => `${award.title} (${byId.get(award.playerId)})`,
  );
}

function outcomeOf(view: RoomView) {
  const { round, currentPromptId } = mode(view);
  const prompt = round?.prompts.find((candidate) => candidate.id === currentPromptId);
  if (!prompt) throw new Error("No matchup on screen");
  const types = new Map(view.players.map((player) => [player.id as string, player.type]));
  return { prompt, ...matchupOutcome(prompt, view.room.round, (id) => types.get(id)) };
}

describe("SlopLash fixtures", () => {
  it("round one pays a walkover, a tie, a slop, no votes and an AI win", () => {
    expect(scores(sloplashFixtureData.afterOne.players)).toEqual({
      Ong: 200,
      Amy: 100,
      Beau: 100,
      "GPT Slopbot": 450,
      "Haiku Hank": 200,
    });
  });

  it("the five-player game ends 1,050 / 1,000 / 800 / 600 / 500", () => {
    expect(scores(fixture("final").players)).toEqual({
      "GPT Slopbot": 1050,
      Beau: 1000,
      Ong: 800,
      "Haiku Hank": 600,
      Amy: 500,
    });
  });

  it("final: Flawless (Beau), Bot Slayer (Ong), MVP (GPT Slopbot)", () => {
    expect(awardsOf(fixture("final")).toSorted()).toEqual(
      ["MVP (GPT Slopbot)", "Bot Slayer (Ong)", "Flawless (Beau)"].toSorted(),
    );
  });

  it("final-human: Ong sweeps the funeral and wins", () => {
    expect(scores(fixture("final-human").players)).toEqual({
      Ong: 1300,
      "GPT Slopbot": 1050,
      Beau: 1000,
      Amy: 500,
      "Haiku Hank": 400,
    });
    expect(awardsOf(fixture("final-human")).toSorted()).toEqual(
      ["Flawless (Beau)", "Crowd Favorite (GPT Slopbot)", "MVP (Ong)"].toSorted(),
    );
  });

  it("final-tie: no MVP on a tied top score", () => {
    const view = fixture("final-tie");
    expect(scores(view.players)).toMatchObject({ Ong: 1050, "GPT Slopbot": 1050 });
    expect(awardsOf(view).toSorted()).toEqual(
      ["Flawless (Beau)", "Bot Slayer (Ong)", "Crowd Favorite (GPT Slopbot)"].toSorted(),
    );
  });

  it("round-results-long: the eight-player round totals", () => {
    expect(scores(fixture("round-results-long").players)).toEqual({
      Gemini: 1400,
      "GPT Slopbot": 1100,
      "Bartholomew Fizzwick": 900,
      Ong: 500,
      Amy: 500,
      "Haiku Hank": 500,
      Beau: 300,
      "Priyanka Ramaswamy": 200,
    });
  });

  it("final-long: five awards and a tie for second", () => {
    const view = fixture("final-long");
    expect(scores(view.players)).toEqual({
      Beau: 1200,
      Ong: 1000,
      Gemini: 1000,
      "GPT Slopbot": 700,
      "Bartholomew Fizzwick": 600,
      "Haiku Hank": 400,
      "Priyanka Ramaswamy": 400,
      Amy: 100,
    });
    expect(awardsOf(view)).toEqual([
      "MVP (Beau)",
      "Crowd Favorite (Ong)",
      "Bot Slayer (Bartholomew Fizzwick)",
      "Flawless (Gemini)",
      "Slopped (Priyanka Ramaswamy)",
    ]);
  });

  it("each reveal fixture's outcome matches its name", () => {
    expect(outcomeOf(fixture("reveal")).stamp).toBe("slopped");
    expect(outcomeOf(fixture("reveal-tie")).stamp).toBe("tie");
    expect(outcomeOf(fixture("reveal-no-votes")).stamp).toBe("noVotes");
    expect(outcomeOf(fixture("reveal-flawless")).stamp).toBe("flawless");
    expect(outcomeOf(fixture("reveal-long")).stamp).toBe("flawless");
    expect(outcomeOf(fixture("reveal-walkover")).score.outcome).toBe("walkover");
    expect(outcomeOf(fixture("reveal-walkover-forfeit")).score.outcome).toBe("walkover");

    const win = outcomeOf(fixture("reveal-win"));
    expect(win.score.outcome).toBe("win");
    expect(win.stamp).toBeNull();
    expect(win.aiWon).toBe(false);

    const split = outcomeOf(fixture("reveal-split"));
    expect(split.score.outcome).toBe("win");
    expect(Object.values(split.score.points).toSorted((a, b) => a - b)).toEqual([800, 1600]);
  });

  it("the worst-case reveal pays +3,600 for a 6-0 sweep at ×4", () => {
    const { prompt, score } = outcomeOf(fixture("reveal-long"));
    expect(score.points[prompt.answers[0]!.id]).toBe(3600);
  });

  it("walkovers come first, so voting starts after them", () => {
    expect(mode(fixture("voting-own")).round?.prompts.map((prompt) => prompt.kind)).toEqual([
      "walkover",
      "vote",
      "vote",
      "vote",
      "vote",
    ]);
    expect(fixture("reveal-walkover").room.step).toBe(0);
  });

  it("every human reaction is on that player's own pick", () => {
    for (const { view } of sloplashFixtures) {
      if (view.mode.kind !== "SLOPLASH") continue;
      const humans = new Set(
        view.players.filter((player) => player.type === "HUMAN").map((player) => player.id as string),
      );
      for (const round of [...view.mode.rounds, view.mode.round]) {
        for (const prompt of round?.prompts ?? []) {
          for (const answer of prompt.answers) {
            for (const reaction of answer.reactions) {
              if (!humans.has(reaction.playerId)) continue;
              const vote = prompt.votes.find((row) => row.voterId === reaction.playerId);
              expect(vote?.responseId, `${prompt.id} ${reaction.playerId}`).toBe(answer.id);
            }
          }
        }
      }
    }
  });
});
