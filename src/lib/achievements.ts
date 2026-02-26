import { filterCastVotes } from "./types";
import type { GameState } from "./types";
import { scorePrompt, applyScoreResult, FORFEIT_MARKER, type PlayerState, type ScorePromptResult } from "./scoring";

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

const ACHIEVEMENTS: Record<string, Achievement> = {
  mvp: {
    id: "mvp",
    name: "MVP",
    description: "Highest total score",
    icon: "\u{1F3C6}",
  },
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
    icon: "\u{2694}\uFE0F",
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
    description: "Submitted all responses (no placeholders)",
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
};

function pushForIds(
  results: PlayerAchievement[],
  ids: Set<string>,
  achievement: Achievement,
  playerMap: Map<string, GameState["players"][0]>,
): void {
  for (const id of ids) {
    const player = playerMap.get(id);
    if (player) {
      results.push({ playerId: id, playerName: player.name, achievement });
    }
  }
}

/** Apply scorePrompt result deltas and track max streaks for Hot Streak achievement. */
function applyScoreResultWithStreaks(
  result: ScorePromptResult,
  responses: { id: string; playerId: string }[],
  playerStates: Map<string, PlayerState>,
  maxStreaks: Map<string, number>,
): void {
  applyScoreResult(result, responses, playerStates);
  for (const [playerId, newStreak] of Object.entries(result.streakUpdates)) {
    const prev = maxStreaks.get(playerId) ?? 0;
    if (newStreak > prev) maxStreaks.set(playerId, newStreak);
  }
}

export function computeAchievements(game: GameState): PlayerAchievement[] {
  const results: PlayerAchievement[] = [];
  const playerMap = new Map(game.players.map((p) => [p.id, p]));
  const allPrompts = game.rounds.flatMap((r) => r.prompts);

  // MVP: highest total score (no tie)
  const maxScore = Math.max(...game.players.map((p) => p.score));
  if (maxScore > 0) {
    const mvps = game.players.filter((p) => p.score === maxScore);
    if (mvps.length === 1) {
      results.push({
        playerId: mvps[0].id,
        playerName: mvps[0].name,
        achievement: ACHIEVEMENTS.mvp,
      });
    }
  }

  // Per-prompt analysis: track votes received, running scores, and Comedy Heat states
  const totalVotesReceived = new Map<string, number>();
  const playerStates = new Map<string, PlayerState>(
    game.players.map((p) => [p.id, { score: 0, humorRating: 1.0, winStreak: 0 }]),
  );
  // Track max streak per player for Hot Streak achievement
  const maxStreaks = new Map<string, number>();

  const slopMasterIds = new Set<string>();
  const aiSlayerIds = new Set<string>();
  const clutchIds = new Set<string>();
  const sloppedIds = new Set<string>();
  const underdogIds = new Set<string>();
  const hotStreakIds = new Set<string>();
  const comebackIds = new Set<string>();

  for (const p of game.players) {
    totalVotesReceived.set(p.id, 0);
    maxStreaks.set(p.id, 0);
  }

  for (const round of game.rounds) {
    for (const prompt of round.prompts) {
      const actualVotes = filterCastVotes(prompt.votes);
      const totalVotes = actualVotes.length;
      const isForfeit = prompt.responses.some((r) => r.text === FORFEIT_MARKER);
      if (totalVotes === 0 && !isForfeit) continue;
      if (prompt.responses.length < 2) continue;

      const voteCounts = prompt.responses.map((r) => ({
        playerId: r.playerId,
        playerType: r.player.type,
        count: actualVotes.filter((v) => v.responseId === r.id).length,
      }));

      for (const vc of voteCounts) {
        totalVotesReceived.set(
          vc.playerId,
          (totalVotesReceived.get(vc.playerId) ?? 0) + vc.count,
        );
      }

      const sorted = [...voteCounts].sort((a, b) => b.count - a.count);
      const winner = sorted[0];
      const loser = sorted[sorted.length - 1];

      // Slop Master (unanimous win) and Slopped (unanimously beaten)
      if (totalVotes >= 2 && winner.count === totalVotes) {
        slopMasterIds.add(winner.playerId);
        if (loser.count === 0) sloppedIds.add(loser.playerId);
      }

      // Clutch: won by exactly 1 vote
      if (sorted.length >= 2 && winner.count - sorted[1].count === 1) {
        clutchIds.add(winner.playerId);
      }

      // AI Slayer: human beat AI in a head-to-head prompt
      if (
        prompt.responses.length === 2 &&
        winner.count > loser.count &&
        winner.playerType === "HUMAN" &&
        loser.playerType === "AI"
      ) {
        aiSlayerIds.add(winner.playerId);
      }

      // Underdog: won a prompt while having the lowest running score
      const scoresAtPrompt = [...playerStates.entries()].map(([id, s]) => [id, s.score] as const);
      const minRunningScore = Math.min(...scoresAtPrompt.map(([, s]) => s));
      const currentWinnerScore = playerStates.get(winner.playerId)?.score ?? 0;
      if (
        winner.count > loser.count &&
        currentWinnerScore === minRunningScore &&
        scoresAtPrompt.some(([id, s]) => id !== winner.playerId && s > minRunningScore)
      ) {
        underdogIds.add(winner.playerId);
      }

      // Use scorePrompt to update running scores/HR/streak (matches game-logic.ts)
      const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
      const eligibleVoterCount = game.players.filter((p) => !respondentIds.has(p.id)).length;

      const result = scorePrompt(
        prompt.responses.map((r) => ({ id: r.id, playerId: r.playerId, playerType: r.player.type, text: r.text })),
        prompt.votes.map((v) => ({ id: v.voter.id, type: v.voter.type, responseId: v.responseId })),
        playerStates,
        round.roundNumber,
        eligibleVoterCount,
      );

      // Comeback: upset bonus triggered
      for (const respId of result.upsetResponseIds) {
        const resp = prompt.responses.find((r) => r.id === respId);
        if (resp) comebackIds.add(resp.playerId);
      }

      applyScoreResultWithStreaks(result, prompt.responses, playerStates, maxStreaks);
    }
  }

  // Hot Streak: max streak >= 3
  for (const [playerId, streak] of maxStreaks) {
    if (streak >= 3) hotStreakIds.add(playerId);
  }

  // Crowd Favorite: most total votes (no tie)
  const maxVotes = Math.max(...totalVotesReceived.values());
  if (maxVotes > 0) {
    const favorites = [...totalVotesReceived.entries()].filter(
      ([, v]) => v === maxVotes,
    );
    if (favorites.length === 1) {
      const [playerId] = favorites[0];
      const player = playerMap.get(playerId);
      if (player) {
        results.push({
          playerId,
          playerName: player.name,
          achievement: ACHIEVEMENTS.crowdFavorite,
        });
      }
    }
  }

  // Iron Will: submitted all responses (no placeholders)
  for (const player of game.players) {
    if (player.type !== "HUMAN") continue;
    const responses = allPrompts.flatMap((p) =>
      p.responses.filter((r) => r.playerId === player.id),
    );
    const assignments = allPrompts.flatMap((p) =>
      (p.assignments ?? []).filter((a) => a.playerId === player.id),
    );
    if (
      assignments.length > 0 &&
      responses.length === assignments.length &&
      responses.every((r) => r.text !== "...")
    ) {
      results.push({
        playerId: player.id,
        playerName: player.name,
        achievement: ACHIEVEMENTS.ironWill,
      });
    }
  }

  pushForIds(results, slopMasterIds, ACHIEVEMENTS.slopMaster, playerMap);
  pushForIds(results, aiSlayerIds, ACHIEVEMENTS.aiSlayer, playerMap);
  pushForIds(results, clutchIds, ACHIEVEMENTS.clutch, playerMap);
  pushForIds(results, sloppedIds, ACHIEVEMENTS.slopped, playerMap);
  pushForIds(results, underdogIds, ACHIEVEMENTS.underdog, playerMap);
  pushForIds(results, hotStreakIds, ACHIEVEMENTS.hotStreak, playerMap);
  pushForIds(results, comebackIds, ACHIEVEMENTS.comeback, playerMap);

  return results;
}
