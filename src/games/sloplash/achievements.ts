import type { RoomPlayer } from "@/room/context";
import type { SloplashRound } from "../../../convex/sloplash/view";
import { applyScoreResult, scorePrompt, type PlayerState } from "./scoring";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface PlayerAchievement {
  playerId: string;
  playerName: string;
  achievement: Achievement;
}

type AchievementPlayer = Pick<RoomPlayer, "id" | "name" | "type" | "score">;

const ACHIEVEMENTS = {
  mvp: { id: "mvp", name: "MVP", description: "Highest total score", icon: "\u{1F3C6}" },
  slopMaster: {
    id: "slopMaster",
    name: "Slop Master",
    description: "Won a prompt unanimously",
    icon: "\u{1F451}",
  },
  aiSlayer: {
    id: "aiSlayer",
    name: "AI Slayer",
    description: "Beat an AI opponent head-to-head",
    icon: "\u{2694}️",
  },
  crowdFavorite: {
    id: "crowdFavorite",
    name: "Crowd Favorite",
    description: "Most total votes received",
    icon: "\u{2B50}",
  },
  clutch: {
    id: "clutch",
    name: "Clutch",
    description: "Won a prompt by exactly 1 vote",
    icon: "\u{1F3AF}",
  },
  slopped: {
    id: "slopped",
    name: "Slopped",
    description: "Got unanimously beaten",
    icon: "\u{1F4A9}",
  },
  ironWill: {
    id: "ironWill",
    name: "Iron Will",
    description: "Answered every prompt",
    icon: "\u{1F4AA}",
  },
  underdog: {
    id: "underdog",
    name: "Underdog",
    description: "Won a prompt while having the lowest score",
    icon: "\u{1F415}",
  },
  hotStreak: {
    id: "hotStreak",
    name: "Hot Streak",
    description: "Won 3+ prompts in a row",
    icon: "\u{1F525}",
  },
  comeback: {
    id: "comeback",
    name: "Comeback",
    description: "Beat a higher-scoring opponent",
    icon: "\u{1F4AA}",
  },
} satisfies Record<string, Achievement>;

/** Awards for a finished game, replaying every round through the scoring engine. */
export function computeAchievements(
  rounds: readonly SloplashRound[],
  players: readonly AchievementPlayer[],
): PlayerAchievement[] {
  const results: PlayerAchievement[] = [];
  const byId = new Map(players.map((player) => [player.id as string, player]));
  const award = (playerIds: Iterable<string>, achievement: Achievement) => {
    for (const playerId of playerIds) {
      const player = byId.get(playerId);
      if (player) results.push({ playerId, playerName: player.name, achievement });
    }
  };

  const maxScore = Math.max(...players.map((player) => player.score));
  const mvps = players.filter((player) => player.score === maxScore);
  if (maxScore > 0 && mvps.length === 1) award([mvps[0]!.id], ACHIEVEMENTS.mvp);

  const votesReceived = new Map<string, number>(players.map((player) => [player.id, 0]));
  const maxStreaks = new Map<string, number>();
  const states = new Map<string, PlayerState>(
    players.map((player) => [player.id, { score: 0, humorRating: 1, winStreak: 0 }]),
  );
  const slopMasters = new Set<string>();
  const aiSlayers = new Set<string>();
  const clutch = new Set<string>();
  const slopped = new Set<string>();
  const underdogs = new Set<string>();
  const comebacks = new Set<string>();

  for (const round of rounds) {
    for (const prompt of round.prompts) {
      const answers = prompt.answers.flatMap((answer) =>
        answer.playerId ? [{ ...answer, playerId: answer.playerId as string }] : [],
      );
      const cast = prompt.votes.filter((vote) => vote.responseId !== null);
      const forfeited = answers.some((answer) => answer.forfeited);
      if ((cast.length === 0 && !forfeited) || answers.length < 2) continue;

      const tallies = answers
        .map((answer) => ({
          playerId: answer.playerId,
          type: byId.get(answer.playerId)?.type,
          count: cast.filter((vote) => vote.responseId === answer.id).length,
        }))
        .toSorted((left, right) => right.count - left.count);
      for (const tally of tallies) {
        votesReceived.set(tally.playerId, (votesReceived.get(tally.playerId) ?? 0) + tally.count);
      }
      const winner = tallies[0]!;
      const runnerUp = tallies[1]!;
      const loser = tallies.at(-1)!;

      if (cast.length >= 2 && winner.count === cast.length) {
        slopMasters.add(winner.playerId);
        if (loser.count === 0) slopped.add(loser.playerId);
      }
      if (winner.count - runnerUp.count === 1) clutch.add(winner.playerId);
      if (winner.count > loser.count && winner.type === "HUMAN" && loser.type === "AI") {
        aiSlayers.add(winner.playerId);
      }

      const running = [...states].map(([id, state]) => ({ id, score: state.score }));
      const lowest = Math.min(...running.map((entry) => entry.score));
      if (
        winner.count > loser.count &&
        states.get(winner.playerId)?.score === lowest &&
        running.some((entry) => entry.id !== winner.playerId && entry.score > lowest)
      ) {
        underdogs.add(winner.playerId);
      }

      const result = scorePrompt(
        answers.map((answer) => ({
          id: answer.id,
          playerId: answer.playerId,
          playerType: byId.get(answer.playerId)?.type ?? "HUMAN",
          text: answer.text,
        })),
        prompt.votes.map((vote) => ({
          id: vote.voterId,
          type: byId.get(vote.voterId)?.type ?? "HUMAN",
          responseId: vote.responseId,
        })),
        states,
        round.number,
        players.filter((player) => !prompt.assigneeIds.includes(player.id)).length,
      );
      for (const responseId of result.upsetResponseIds) {
        const answer = answers.find((candidate) => candidate.id === responseId);
        if (answer) comebacks.add(answer.playerId);
      }
      applyScoreResult(result, answers, states);
      for (const [playerId, streak] of Object.entries(result.streakUpdates)) {
        maxStreaks.set(playerId, Math.max(maxStreaks.get(playerId) ?? 0, streak));
      }
    }
  }

  const mostVotes = Math.max(...votesReceived.values());
  const favorites = [...votesReceived].filter(([, count]) => count === mostVotes);
  if (mostVotes > 0 && favorites.length === 1) {
    award([favorites[0]![0]], ACHIEVEMENTS.crowdFavorite);
  }

  const prompts = rounds.flatMap((round) => round.prompts);
  award(
    players
      .filter((player) => {
        if (player.type !== "HUMAN") return false;
        const mine = prompts.filter((prompt) => prompt.assigneeIds.includes(player.id));
        return (
          mine.length > 0 &&
          mine.every((prompt) =>
            prompt.answers.some((answer) => answer.playerId === player.id && !answer.forfeited),
          )
        );
      })
      .map((player) => player.id),
    ACHIEVEMENTS.ironWill,
  );

  award(slopMasters, ACHIEVEMENTS.slopMaster);
  award(aiSlayers, ACHIEVEMENTS.aiSlayer);
  award(clutch, ACHIEVEMENTS.clutch);
  award(slopped, ACHIEVEMENTS.slopped);
  award(underdogs, ACHIEVEMENTS.underdog);
  award(
    [...maxStreaks].filter(([, streak]) => streak >= 3).map(([playerId]) => playerId),
    ACHIEVEMENTS.hotStreak,
  );
  award(comebacks, ACHIEVEMENTS.comeback);
  return results;
}
