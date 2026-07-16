import type { GamePrompt, GameState } from "@/lib/types";
import { filterCastVotes } from "@/lib/types";
import { isPromptVotable } from "@/games/core/votability";

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

/** Derive the sorted votable prompts from the current round. */
export function getVotablePrompts(game: GameState): GamePrompt[] {
  const currentRound = game.rounds[0];
  if (!currentRound) return [];
  return [...currentRound.prompts]
    .filter((prompt) => isPromptVotable(game.gameType, prompt.responses))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildGameStartNarration(game: GameState): NarrationCue {
  const fallbackText = `Welcome to Slop-Lash. Round one of ${game.totalRounds} starts now. Write your funniest answers.`;
  const competitorCount = game.players.filter((player) => player.type !== "SPECTATOR").length;
  return generatedCue("game_start", fallbackText, {
    round: 1,
    totalRounds: game.totalRounds,
    competitorCount,
  });
}

export function buildHurryUpNarration(secondsLeft: number): NarrationCue {
  return verbatimCue("hurry_up", `${secondsLeft} seconds left. Finish the joke.`);
}

export function buildVotingStartNarration(game: GameState): NarrationCue {
  const matchupCount = getVotablePrompts(game).length;
  const label = matchupCount === 1 ? "matchup" : "matchups";
  return verbatimCue("voting_start", `Writing is over. Time to vote on ${matchupCount} ${label}.`);
}

export function buildMatchupNarration(
  game: GameState,
  votablePrompts: GamePrompt[],
): NarrationCue | null {
  const prompt = votablePrompts[game.votingPromptIndex];
  if (!prompt || prompt.responses.length < 2) return null;
  const [first, second] = prompt.responses;
  const promptText = normalizeForSpeech(formatBlanksForNarrator(prompt.text));
  return verbatimCue(
    "matchup",
    `The prompt is: ${endSentence(promptText)} First joke: ${endSentence(normalizeForSpeech(first.text))} Second joke: ${endSentence(normalizeForSpeech(second.text))}`,
  );
}

export function buildVoteResultNarration(
  game: GameState,
  votablePrompts: GamePrompt[],
): NarrationCue | null {
  const prompt = votablePrompts[game.votingPromptIndex];
  if (!prompt || prompt.responses.length < 2) return null;

  const castVotes = filterCastVotes(prompt.votes);
  const [first, second] = prompt.responses;
  const firstVotes = castVotes.filter((vote) => vote.responseId === first.id).length;
  const secondVotes = castVotes.filter((vote) => vote.responseId === second.id).length;
  if (firstVotes === secondVotes) {
    return generatedCue("vote_result", "It's a tie. Split crowd.", {
      outcome: "tie",
      margin: "split",
    });
  }

  const winner = firstVotes > secondVotes ? first : second;
  const winnerName = boundedFact(
    game.players.find((player) => player.id === winner.playerId)?.name ?? "The winner",
  );
  const unanimous = Math.min(firstVotes, secondVotes) === 0 && castVotes.length > 0;
  if (unanimous) {
    return generatedCue("vote_result", `${winnerName} wins unanimously. No debate at all.`, {
      outcome: "winner",
      winnerName,
      margin: "unanimous",
    });
  }

  const spread = Math.abs(firstVotes - secondVotes);
  const margin = spread <= 1 ? "razor close" : spread <= 3 ? "comfortable" : "landslide";
  const fallbackText =
    margin === "razor close"
      ? `${winnerName} steals it by a hair.`
      : margin === "comfortable"
        ? `${winnerName} wins comfortably.`
        : `${winnerName} wins in a landslide.`;
  return generatedCue("vote_result", fallbackText, {
    outcome: "winner",
    winnerName,
    margin,
  });
}

export function buildRoundOverNarration(game: GameState): NarrationCue {
  const rankedPlayers = [...game.players]
    .filter((player) => player.type !== "SPECTATOR")
    .sort((a, b) => b.score - a.score);
  const leader = rankedPlayers[0];
  if (!leader) return verbatimCue("round_over", `Round ${game.currentRound} is over.`);

  const leaderName = boundedFact(leader.name);
  const isFinal = game.currentRound >= game.totalRounds;
  if (isFinal) {
    return generatedCue("round_over", `Game over. ${leaderName} wins Slop-Lash.`, {
      final: true,
      winnerName: leaderName,
      round: game.currentRound,
      totalRounds: game.totalRounds,
    });
  }

  const trailer = rankedPlayers.at(-1);
  if (!trailer || trailer.id === leader.id) {
    return generatedCue("round_over", `Round ${game.currentRound} is over. ${leaderName} leads.`, {
      final: false,
      leaderName,
      round: game.currentRound,
      totalRounds: game.totalRounds,
    });
  }

  const trailerName = boundedFact(trailer.name);
  return generatedCue(
    "round_over",
    `Round ${game.currentRound} is over. ${leaderName} leads, while ${trailerName} brings up the rear.`,
    {
      final: false,
      leaderName,
      trailerName,
      round: game.currentRound,
      totalRounds: game.totalRounds,
    },
  );
}

export function buildNextRoundNarration(game: GameState): NarrationCue {
  const multiplier = 2 ** (game.currentRound - 1);
  return generatedCue(
    "next_round",
    `Round ${game.currentRound} starts now. Points are worth ${multiplier} times as much.`,
    { round: game.currentRound, totalRounds: game.totalRounds, multiplier },
  );
}
