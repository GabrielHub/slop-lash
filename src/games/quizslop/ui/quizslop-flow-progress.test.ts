import { describe, expect, test } from "vite-plus/test";
import {
  getQuizslopAdvanceLabel,
  getQuizslopFirstRoundHelp,
  getQuizslopFlowBeatIndex,
  getQuizslopPhaseTimerTotal,
  getQuizslopPhaseAnnouncement,
} from "./quizslop-flow-progress";

describe("QuizSlop round flow", () => {
  test.each([
    ["TOPIC_REVEAL", 0],
    ["SLOP_CALL", 1],
    ["SLOP_CALL_REVEAL", 1],
    ["ANSWER", 2],
    ["QUESTION_REVEAL", 3],
    ["ROUND_RESULTS", 3],
  ] as const)("maps %s to beat %i", (phase, beat) => {
    expect(getQuizslopFlowBeatIndex(phase)).toBe(beat);
  });

  test("keeps the lobby outside the round roadmap", () => {
    expect(getQuizslopFlowBeatIndex("LOBBY_SETUP")).toBeNull();
  });

  test("keeps reconnecting timers anchored to the full phase duration", () => {
    expect(getQuizslopPhaseTimerTotal("ANSWER")).toBe(60);
    expect(getQuizslopPhaseTimerTotal("QUESTION_REVEAL")).toBe(30);
    expect(getQuizslopPhaseTimerTotal("DISPUTE_VOTE")).toBe(30);
    expect(getQuizslopPhaseTimerTotal("FINAL_RESULTS")).toBeUndefined();
  });

  test("gives every first-round subphase accurate, readable help", () => {
    for (const phase of [
      "TOPIC_REVEAL",
      "SLOP_CALL",
      "SLOP_CALL_REVEAL",
      "ANSWER",
      "QUESTION_REVEAL",
      "DISPUTE_VOTE",
      "ROUND_RESULTS",
    ] as const) {
      const help = getQuizslopFirstRoundHelp(phase);
      expect(help).not.toBeNull();
      expect(help?.length).toBeLessThanOrEqual(160);
    }
    expect(getQuizslopFirstRoundHelp("SLOP_CALL_REVEAL")).not.toContain("predict");
    expect(getQuizslopFirstRoundHelp("ROUND_RESULTS")).not.toContain("landing");
  });

  test("names one-at-a-time reveal actions explicitly", () => {
    expect(getQuizslopAdvanceLabel("QUESTION_REVEAL", 0, 3, 1, 4)).toBe("Reveal next question");
    expect(getQuizslopAdvanceLabel("QUESTION_REVEAL", 2, 3, 1, 4)).toBe("Finish reveal");
  });

  test("gives every challenged question its own ruling turn", () => {
    expect(getQuizslopAdvanceLabel("DISPUTE_VOTE", 0, 2, 1, 4)).toBe("Next ruling");
    expect(getQuizslopAdvanceLabel("DISPUTE_VOTE", 1, 2, 1, 4)).toBe("Finish rulings");
    expect(getQuizslopPhaseAnnouncement("DISPUTE_VOTE", 2, 4, 1, 2)).toContain("question 2 of 2");
  });

  test("labels the final results transition honestly", () => {
    expect(getQuizslopAdvanceLabel("ROUND_RESULTS", 0, 0, 3, 4)).toBe("Next round");
    expect(getQuizslopAdvanceLabel("ROUND_RESULTS", 0, 0, 4, 4)).toBe("Show final scores");
  });

  test("announces exact substates instead of only the coarse beat", () => {
    expect(getQuizslopPhaseAnnouncement("SLOP_CALL", 1, 4, 0, 0)).toContain("Call Slop");
    expect(getQuizslopPhaseAnnouncement("SLOP_CALL_REVEAL", 1, 4, 0, 0)).toContain(
      "Calls revealed",
    );
    expect(getQuizslopPhaseAnnouncement("QUESTION_REVEAL", 2, 4, 1, 3)).toContain(
      "question 2 of 3",
    );
  });
});
