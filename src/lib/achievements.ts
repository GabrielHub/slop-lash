import type { GameState } from "./types";

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

  // Per-prompt analysis: track votes received and running scores for underdog
  const totalVotesReceived = new Map<string, number>();
  const runningScores = new Map<string, number>();
  for (const p of game.players) {
    totalVotesReceived.set(p.id, 0);
    runningScores.set(p.id, 0);
  }

  const slopMasterIds = new Set<string>();
  const aiSlayerIds = new Set<string>();
  const clutchIds = new Set<string>();
  const sloppedIds = new Set<string>();
  const underdogIds = new Set<string>();

  for (const prompt of allPrompts) {
    const totalVotes = prompt.votes.length;
    if (totalVotes === 0 || prompt.responses.length < 2) continue;

    const voteCounts = prompt.responses.map((r) => ({
      playerId: r.playerId,
      playerType: r.player.type,
      count: prompt.votes.filter((v) => v.responseId === r.id).length,
    }));

    // Accumulate votes received
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
    const scoresAtPrompt = [...runningScores.entries()];
    const minRunningScore = Math.min(...scoresAtPrompt.map(([, s]) => s));
    const currentWinnerScore = runningScores.get(winner.playerId) ?? 0;
    if (
      winner.count > loser.count &&
      currentWinnerScore === minRunningScore &&
      scoresAtPrompt.some(([id, s]) => id !== winner.playerId && s > minRunningScore)
    ) {
      underdogIds.add(winner.playerId);
    }

    // Update running scores after this prompt
    for (const vc of voteCounts) {
      let points = vc.count * 100;
      if (totalVotes >= 2 && vc.count === totalVotes) points += 100;
      runningScores.set(
        vc.playerId,
        (runningScores.get(vc.playerId) ?? 0) + points,
      );
    }
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
      p.assignments.filter((a) => a.playerId === player.id),
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

  return results;
}
