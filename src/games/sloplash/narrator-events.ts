import type { RoomInfo, RoomPlayer } from "@/room/context";
import { sortPlayersByScore } from "@/games/core/player-rankings";
import type { SloplashPrompt, SloplashView } from "../../../convex/sloplash/view";
import { matchupOutcome } from "./outcomes";
import { roundMultiplier } from "./scoring";
import { currentPrompt, typeOfPlayer, walkoverCount } from "./ui/data";

const NARRATION_EVENT_TYPES = [
  "game_start",
  "hurry_up",
  "voting_start",
  "matchup",
  "vote_result",
  "round_over",
  "next_round",
] as const;

export type NarrationEventType = (typeof NARRATION_EVENT_TYPES)[number];

export interface NarrationCue {
  eventType: NarrationEventType;
  /** Always-valid script used directly or when optional host writing fails. */
  fallbackText: string;
  /** Safe factual context for the narrator text model. Omitted for verbatim cues. */
  generationContext?: string;
}

function generatedCue(
  eventType: NarrationEventType,
  fallbackText: string,
  facts: Record<string, string | number | boolean>,
): NarrationCue {
  return { eventType, fallbackText, generationContext: JSON.stringify(facts) };
}

function verbatimCue(eventType: NarrationEventType, fallbackText: string): NarrationCue {
  return { eventType, fallbackText };
}

/**
 * Replace prompt blanks with phrasing that speech synthesis reads naturally.
 * Trailing blanks become a pause; other blanks are spoken as the word "blank".
 */
function formatBlanksForNarrator(text: string): string {
  const blanks = [...text.matchAll(/_{3,}/g)];
  if (blanks.length === 0) return text;
  const endsWithBlank = /_{3,}['"'\u2018\u2019\u201C\u201D.?!)\]]*\s*$/.test(text);

  let result = text;
  for (let index = blanks.length - 1; index >= 0; index--) {
    const blank = blanks[index];
    const replacement = index === blanks.length - 1 && endsWithBlank ? "..." : "blank";
    result =
      result.slice(0, blank.index) + replacement + result.slice(blank.index + blank[0].length);
  }
  return result;
}

function normalizeForSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function boundedFact(text: string, maxChars = 80): string {
  return normalizeForSpeech(text).slice(0, maxChars);
}

function endSentence(text: string): string {
  return /[.!?\u2026]$/.test(text) ? text : `${text}.`;
}

export function buildGameStartNarration(
  totalRounds: number,
  competitorCount: number,
): NarrationCue {
  const fallbackText = `Welcome to Slop-Lash. Round one of ${totalRounds} starts now. Write your funniest answers.`;
  return generatedCue("game_start", fallbackText, { round: 1, totalRounds, competitorCount });
}

export function buildHurryUpNarration(secondsLeft: number): NarrationCue {
  return verbatimCue("hurry_up", `${secondsLeft} seconds left. Finish the joke.`);
}

export function buildVotingStartNarration(matchupCount: number): NarrationCue {
  const label = matchupCount === 1 ? "matchup" : "matchups";
  return verbatimCue("voting_start", `Writing is over. Time to vote on ${matchupCount} ${label}.`);
}

export function buildMatchupNarration(prompt: SloplashPrompt): NarrationCue | null {
  const [first, second] = prompt.answers;
  if (!first || !second) return null;
  const promptText = normalizeForSpeech(formatBlanksForNarrator(prompt.text));
  return verbatimCue(
    "matchup",
    `The prompt is: ${endSentence(promptText)} First joke: ${endSentence(normalizeForSpeech(first.text))} Second joke: ${endSentence(normalizeForSpeech(second.text))}`,
  );
}

export function buildVoteResultNarration(
  prompt: SloplashPrompt,
  players: readonly RoomPlayer[],
): NarrationCue | null {
  // Votes and outcome don't depend on the round; only points do.
  const { score } = matchupOutcome(prompt, 1, typeOfPlayer(players));
  const nameOf = (answerId: string | null, fallback: string) =>
    boundedFact(
      players.find(
        (player) => player.id === prompt.answers.find((answer) => answer.id === answerId)?.playerId,
      )?.name ?? fallback,
    );

  switch (score.outcome) {
    case "void":
      return null;
    case "walkover": {
      const winnerName = nameOf(score.winnerId, "The other player");
      return generatedCue("vote_result", `No answer. ${winnerName} wins by default.`, {
        outcome: "walkover",
        winnerName,
      });
    }
    case "noVotes":
      return generatedCue("vote_result", "Nobody voted. Nobody scores.", { outcome: "no_votes" });
    case "tie":
      return generatedCue("vote_result", "It's a tie. Split crowd.", {
        outcome: "tie",
        margin: "split",
      });
    case "win":
      break;
  }

  const winnerName = nameOf(score.winnerId, "The winner");
  if (score.unanimous) {
    return generatedCue("vote_result", `${winnerName} wins unanimously. No debate at all.`, {
      outcome: "winner",
      winnerName,
      margin: "unanimous",
    });
  }

  const counts = Object.values(score.votes);
  const spread = Math.max(...counts) - Math.min(...counts);
  const margin = spread <= 1 ? "razor close" : spread <= 3 ? "comfortable" : "landslide";
  const fallbackText =
    margin === "razor close"
      ? `${winnerName} steals it by a hair.`
      : margin === "comfortable"
        ? `${winnerName} wins comfortably.`
        : `${winnerName} wins in a landslide.`;
  return generatedCue("vote_result", fallbackText, { outcome: "winner", winnerName, margin });
}

type NarrationRoom = Pick<RoomInfo, "round" | "totalRounds">;

export function buildRoundOverNarration(
  room: NarrationRoom,
  players: readonly RoomPlayer[],
): NarrationCue {
  const ranked = sortPlayersByScore(players);
  const leader = ranked[0];
  const { round, totalRounds } = room;
  if (!leader) return verbatimCue("round_over", `Round ${round} is over.`);

  const leaderName = boundedFact(leader.name);
  if (round >= totalRounds) {
    return generatedCue("round_over", `Game over. ${leaderName} wins Slop-Lash.`, {
      final: true,
      winnerName: leaderName,
      round,
      totalRounds,
    });
  }

  const trailer = ranked.at(-1);
  if (!trailer || trailer.id === leader.id) {
    return generatedCue("round_over", `Round ${round} is over. ${leaderName} leads.`, {
      final: false,
      leaderName,
      round,
      totalRounds,
    });
  }

  const trailerName = boundedFact(trailer.name);
  return generatedCue(
    "round_over",
    `Round ${round} is over. ${leaderName} leads, while ${trailerName} brings up the rear.`,
    { final: false, leaderName, trailerName, round, totalRounds },
  );
}

export function buildNextRoundNarration(room: NarrationRoom): NarrationCue {
  const multiplier = roundMultiplier(room.round);
  return generatedCue(
    "next_round",
    `Round ${room.round} starts now. Points are worth ${multiplier} times as much.`,
    { round: room.round, totalRounds: room.totalRounds, multiplier },
  );
}

/**
 * What the narrator says on entering the room's current phase. `previousPhase`
 * is null when the narrator first tunes in mid-game: it then only greets a
 * game that is still in its first writing phase.
 */
export function phaseNarration(
  room: Pick<RoomInfo, "phase" | "round" | "totalRounds" | "step">,
  mode: SloplashView,
  players: readonly RoomPlayer[],
  previousPhase: string | null,
): NarrationCue[] {
  const prompts = mode.round?.prompts ?? [];
  const current = currentPrompt(mode);
  const cues: (NarrationCue | null)[] = [];
  switch (room.phase) {
    case "WRITING":
      if (room.round === 1) cues.push(buildGameStartNarration(room.totalRounds, players.length));
      else if (previousPhase !== null) cues.push(buildNextRoundNarration(room));
      break;
    case "VOTING": {
      // Walkovers play first, so the round's first vote is at step `walkovers`.
      if (previousPhase !== null && room.step === walkoverCount(mode)) {
        cues.push(
          buildVotingStartNarration(prompts.filter((prompt) => prompt.kind === "vote").length),
        );
      }
      if (previousPhase !== null && current) cues.push(buildMatchupNarration(current));
      break;
    }
    case "REVEAL":
      if (previousPhase !== null && current) cues.push(buildVoteResultNarration(current, players));
      break;
    case "ROUND_RESULTS":
      if (previousPhase !== null) cues.push(buildRoundOverNarration(room, players));
      break;
  }
  return cues.filter((cue) => cue !== null);
}
