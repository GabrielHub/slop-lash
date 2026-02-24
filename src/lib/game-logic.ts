import { prisma } from "./db";
import { getRandomPrompts } from "./prompts";
import { generateJoke, aiVote } from "./ai";

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export interface PromptAssignment {
  promptText: string;
  playerIds: [string, string];
}

export function assignPrompts(
  playerIds: string[],
  count: number
): PromptAssignment[] {
  const promptTexts = getRandomPrompts(count);
  const assignments: PromptAssignment[] = [];

  for (let i = 0; i < count; i++) {
    const p1 = playerIds[i % playerIds.length];
    const p2 = playerIds[(i + 1) % playerIds.length];
    assignments.push({ promptText: promptTexts[i], playerIds: [p1, p2] });
  }

  return assignments;
}

export async function startRound(gameId: string, roundNumber: number): Promise<void> {
  const players = await prisma.player.findMany({ where: { gameId } });
  const playerIds = players.map((p) => p.id);
  const promptCount = playerIds.length;
  const assignments = assignPrompts(playerIds, promptCount);

  const round = await prisma.round.create({
    data: {
      gameId,
      roundNumber,
      prompts: {
        create: assignments.map((a) => ({ text: a.promptText })),
      },
    },
    include: { prompts: true },
  });

  await prisma.game.update({
    where: { id: gameId },
    data: { status: "WRITING", currentRound: roundNumber },
  });

  const aiPlayers = players.filter(
    (p): p is typeof p & { modelId: string } =>
      p.type === "AI" && p.modelId !== null
  );

  const aiResponsePromises = assignments.flatMap((assignment, i) => {
    const prompt = round.prompts[i];
    return assignment.playerIds
      .map((playerId) => aiPlayers.find((p) => p.id === playerId))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map(async (player) => {
        const jokeText = await generateJoke(player.modelId, prompt.text);
        await prisma.response.create({
          data: {
            promptId: prompt.id,
            playerId: player.id,
            text: jokeText,
          },
        });
      });
  });

  await Promise.all(aiResponsePromises);
}

export async function checkAllResponsesIn(gameId: string): Promise<boolean> {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: { include: { responses: true } },
    },
  });

  if (!round) return false;

  return round.prompts.every((p) => p.responses.length >= 2);
}

export async function startVoting(gameId: string): Promise<void> {
  await prisma.game.update({
    where: { id: gameId },
    data: { status: "VOTING" },
  });

  const players = await prisma.player.findMany({ where: { gameId } });
  const aiPlayers = players.filter(
    (p): p is typeof p & { modelId: string } =>
      p.type === "AI" && p.modelId !== null
  );

  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: { include: { responses: { include: { player: true } } } },
    },
  });

  if (!round) return;

  const votePromises = round.prompts.flatMap((prompt) => {
    if (prompt.responses.length < 2) return [];
    const [respA, respB] = prompt.responses;
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));

    return aiPlayers
      .filter((p) => !respondentIds.has(p.id))
      .map(async (aiPlayer) => {
        const choice = await aiVote(
          aiPlayer.modelId,
          prompt.text,
          respA.text,
          respB.text
        );
        const chosenResponse = choice === "A" ? respA : respB;
        await prisma.vote.create({
          data: {
            promptId: prompt.id,
            voterId: aiPlayer.id,
            responseId: chosenResponse.id,
          },
        });
      });
  });

  await Promise.all(votePromises);
}

export async function checkAllVotesIn(gameId: string): Promise<boolean> {
  const players = await prisma.player.findMany({ where: { gameId } });
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: { include: { responses: true, votes: true } },
    },
  });

  if (!round) return false;

  for (const prompt of round.prompts) {
    const respondentIds = new Set(prompt.responses.map((r) => r.playerId));
    const eligibleVoters = players.filter((p) => !respondentIds.has(p.id));
    if (prompt.votes.length < eligibleVoters.length) return false;
  }

  return true;
}

export async function calculateRoundScores(gameId: string): Promise<void> {
  const round = await prisma.round.findFirst({
    where: { gameId },
    orderBy: { roundNumber: "desc" },
    include: {
      prompts: { include: { responses: true, votes: true } },
    },
  });

  if (!round) return;

  const scoreUpdates: Record<string, number> = {};

  for (const prompt of round.prompts) {
    for (const response of prompt.responses) {
      const voteCount = prompt.votes.filter(
        (v) => v.responseId === response.id
      ).length;
      const totalVotes = prompt.votes.length;

      let points = voteCount * 100;
      if (totalVotes > 0 && voteCount === totalVotes) {
        points += 100;
      }

      scoreUpdates[response.playerId] =
        (scoreUpdates[response.playerId] ?? 0) + points;
    }
  }

  await Promise.all(
    Object.entries(scoreUpdates).map(([playerId, points]) =>
      prisma.player.update({
        where: { id: playerId },
        data: { score: { increment: points } },
      })
    )
  );

  await prisma.game.update({
    where: { id: gameId },
    data: { status: "ROUND_RESULTS" },
  });
}

export async function advanceGame(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) return;

  if (game.currentRound >= game.totalRounds) {
    await prisma.game.update({
      where: { id: gameId },
      data: { status: "FINAL_RESULTS" },
    });
  } else {
    await startRound(gameId, game.currentRound + 1);
  }
}
