import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { timed, type GameMode, type Transition } from "../engine";
import { enqueueJob, jobAiPlayer, type JobHandlers, type PlayerJobPayload } from "../jobs";
import { loadActivePlayers, loadPlayers } from "../roster";
import {
  createRound,
  fillForfeits,
  fillTimedOutVotes,
  findResponse,
  findVote,
  insertReaction,
  insertResponse,
  insertVote,
  isForfeit,
  loadAllRounds,
  loadCurrentRound,
  responsesFor,
  votesFor,
  type RoundBundle,
} from "../rounds";
import { getRandomPrompts } from "../../src/games/core/prompts";
import { FORFEIT_MARKER } from "../../src/games/core/constants";
import { FREE_PLAY_JUDGE_MODEL_ID } from "../../src/lib/free-play";
import { isValidReactionEmoji } from "../../src/lib/reactions";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_SECONDS,
  ROUND_RESULTS_SECONDS,
  VOTE_PER_PROMPT_SECONDS,
  WRITING_DURATION_SECONDS,
} from "../../src/games/sloplash/game-constants";
import { applyScoreResult, scorePrompt, type PlayerState } from "../../src/games/sloplash/scoring";
import type { RoundHistoryEntry } from "../../src/games/sloplash/ai";

/**
 * SlopLash phases:
 *   WRITING → (VOTING(i) → REVEAL(i))* → ROUND_RESULTS → WRITING … → FINAL
 * `step` is the index of the matchup being voted on or revealed.
 */
export type SloplashPhase = "WRITING" | "VOTING" | "REVEAL" | "ROUND_RESULTS";

/** Matchups worth voting on: both players answered. In prompt order. */
export function votablePrompts(bundle: RoundBundle): Doc<"prompts">[] {
  return bundle.prompts.filter((prompt) => {
    const responses = responsesFor(bundle, prompt._id);
    return responses.length >= 2 && !responses.some(isForfeit);
  });
}

/** Pairs each player with the next one around the table: two answers per prompt. */
async function startRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  players: Doc<"players">[],
  roundNumber: number,
): Promise<Transition> {
  const used = await ctx.db
    .query("prompts")
    .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
    .take(256);
  const texts = getRandomPrompts(players.length, new Set(used.map((prompt) => prompt.text)));
  await createRound(
    ctx,
    game._id,
    roundNumber,
    players.map((player, index) => ({
      text: texts[index] ?? "Make us laugh!",
      assigneeIds: [player._id, players[(index + 1) % players.length]!._id],
    })),
  );
  return { phase: "WRITING", round: roundNumber, seconds: timed(game, WRITING_DURATION_SECONDS) };
}

/** Everyone in the game except the two players who wrote the matchup. */
function votersFor(prompt: Doc<"prompts">, players: Doc<"players">[]) {
  return players.filter((player) => !prompt.assigneeIds.includes(player._id));
}

/**
 * Puts matchups on the scoreboard, in order, each exactly once. A matchup is
 * scored when it is revealed, so every screen reads the same points.
 */
async function scorePrompts(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  prompts: Doc<"prompts">[],
) {
  const unscored = prompts.filter((prompt) => prompt.scoredAt === undefined);
  if (unscored.length === 0) return;
  const players = await loadPlayers(ctx, game._id);
  const states = new Map<string, PlayerState>(
    players.map((player) => [
      player._id,
      { score: player.score, humorRating: player.humorRating, winStreak: player.winStreak },
    ]),
  );
  const types = new Map(players.map((player) => [player._id as string, player.type]));
  const eligible = players.filter((player) => player.kickedAt === undefined);
  const now = Date.now();

  for (const prompt of unscored) {
    const responses = responsesFor(bundle, prompt._id);
    const result = scorePrompt(
      responses.map((response) => ({
        id: response._id,
        playerId: response.playerId,
        playerType: types.get(response.playerId) ?? "HUMAN",
        text: response.text,
      })),
      votesFor(bundle, prompt._id).map((vote) => ({
        id: vote.voterId,
        type: types.get(vote.voterId) ?? "HUMAN",
        responseId: vote.responseId ?? null,
      })),
      states,
      bundle.round.roundNumber,
      votersFor(prompt, eligible).length,
    );
    applyScoreResult(
      result,
      responses.map((r) => ({ id: r._id, playerId: r.playerId })),
      states,
    );
    for (const response of responses) {
      await ctx.db.patch("responses", response._id, {
        pointsEarned: result.points[response._id] ?? 0,
        penalty: result.penalties[response.playerId] ?? 0,
      });
    }
    for (const vote of votesFor(bundle, prompt._id)) {
      const penalty = result.penalties[vote.voterId];
      if (penalty) await ctx.db.patch("votes", vote._id, { penalty });
    }
    await ctx.db.patch("prompts", prompt._id, { scoredAt: now });
  }
  for (const player of players) {
    const state = states.get(player._id);
    if (state) await ctx.db.patch("players", player._id, state);
  }
}

/** Scores whatever is left (forfeited matchups, or all of them on an early end). */
async function scoreRound(ctx: MutationCtx, game: Doc<"games">, bundle: RoundBundle) {
  if (bundle.round.scoredAt !== undefined) return;
  await scorePrompts(ctx, game, bundle, bundle.prompts);
  await ctx.db.patch("rounds", bundle.round._id, { scoredAt: Date.now() });
}

function roundResults(game: Doc<"games">): Transition {
  return { phase: "ROUND_RESULTS", seconds: timed(game, ROUND_RESULTS_SECONDS) };
}

/** Queues the AI leader's victory line for a results screen. */
async function queueWinnerTagline(ctx: MutationCtx, game: Doc<"games">) {
  const players = await loadActivePlayers(ctx, game._id);
  const leader = players.toSorted((left, right) => right.score - left.score)[0];
  if (!leader || leader.type !== "AI" || leader.score <= 0) return;
  await ctx.db.insert("winnerTaglines", {
    gameId: game._id,
    phaseGeneration: game.phaseGeneration,
    playerId: leader._id,
  });
  await enqueueJob(ctx, game, "SLOPLASH_TAGLINE", `tagline:${game.phaseGeneration}`, {
    playerId: leader._id,
  });
}

export const sloplashMode: GameMode = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  keepsRecaps: true,

  async start(ctx, game, players) {
    return startRound(ctx, game, players, 1);
  },

  async onEnter(ctx, game) {
    switch (game.phase as SloplashPhase | "FINAL") {
      case "WRITING": {
        for (const player of await loadActivePlayers(ctx, game._id)) {
          if (player.type !== "AI") continue;
          await enqueueJob(ctx, game, "SLOPLASH_RESPONSE", `response:${game.round}:${player._id}`, {
            playerId: player._id,
          });
        }
        return;
      }
      case "VOTING": {
        const bundle = await loadCurrentRound(ctx, game);
        const prompt = bundle ? votablePrompts(bundle)[game.step] : undefined;
        if (!prompt) return;
        for (const player of votersFor(prompt, await loadActivePlayers(ctx, game._id))) {
          if (player.type !== "AI") continue;
          await enqueueJob(ctx, game, "SLOPLASH_VOTE", `vote:${prompt._id}:${player._id}`, {
            playerId: player._id,
            promptId: prompt._id,
          });
        }
        return;
      }
      case "ROUND_RESULTS":
        await queueWinnerTagline(ctx, game);
        return;
      case "FINAL":
        await queueWinnerTagline(ctx, game);
        await ctx.scheduler.runAfter(0, internal.leaderboards.projectGame, { gameId: game._id });
        return;
      default:
        return;
    }
  },

  async isComplete(ctx, game, connected) {
    const bundle = await loadCurrentRound(ctx, game);
    if (!bundle) return false;
    const here = new Set(connected.map((player) => player._id as Id<"players">));
    if (game.phase === "WRITING") {
      return bundle.prompts.every((prompt) => {
        const answered = new Set(responsesFor(bundle, prompt._id).map((r) => r.playerId));
        return prompt.assigneeIds.every((id) => answered.has(id) || !here.has(id));
      });
    }
    if (game.phase === "VOTING") {
      const prompt = votablePrompts(bundle)[game.step];
      if (!prompt) return true;
      const voted = new Set(votesFor(bundle, prompt._id).map((vote) => vote.voterId));
      return votersFor(prompt, connected).every((player) => voted.has(player._id));
    }
    return false;
  },

  async next(ctx, game) {
    const bundle = await loadCurrentRound(ctx, game);
    if (!bundle) return "FINISH";
    switch (game.phase as SloplashPhase) {
      case "WRITING": {
        // Forfeits never make a prompt votable, so the matchups are already known.
        const matchups = votablePrompts(bundle).length;
        await fillForfeits(ctx, bundle);
        if (matchups > 0) {
          return { phase: "VOTING", step: 0, seconds: timed(game, VOTE_PER_PROMPT_SECONDS) };
        }
        // Every matchup forfeited: nothing to vote on, go straight to results.
        await scoreRound(ctx, game, (await loadCurrentRound(ctx, game))!);
        return roundResults(game);
      }
      case "VOTING": {
        const prompt = votablePrompts(bundle)[game.step];
        if (prompt) {
          const voters = votersFor(prompt, await loadActivePlayers(ctx, game._id));
          await fillTimedOutVotes(
            ctx,
            bundle,
            prompt,
            voters.map((player) => player._id),
          );
          await scorePrompts(ctx, game, (await loadCurrentRound(ctx, game))!, [prompt]);
        }
        return { phase: "REVEAL", step: game.step, seconds: timed(game, REVEAL_SECONDS) };
      }
      case "REVEAL": {
        if (game.step + 1 < votablePrompts(bundle).length) {
          return {
            phase: "VOTING",
            step: game.step + 1,
            seconds: timed(game, VOTE_PER_PROMPT_SECONDS),
          };
        }
        await scoreRound(ctx, game, bundle);
        return roundResults(game);
      }
      case "ROUND_RESULTS": {
        const players = await loadActivePlayers(ctx, game._id);
        if (game.round >= game.totalRounds || players.length < 2) return "FINISH";
        return startRound(ctx, game, players, game.round + 1);
      }
      default:
        return "FINISH";
    }
  },

  async onFinish(ctx, game) {
    if (game.status !== "PLAYING") return;
    const bundle = await loadCurrentRound(ctx, game);
    if (!bundle || bundle.round.scoredAt !== undefined) return;
    // Ending mid-round still settles it, so the scoreboard reflects what was played.
    await fillForfeits(ctx, bundle);
    const players = await loadActivePlayers(ctx, game._id);
    for (const prompt of votablePrompts(bundle)) {
      const voters = votersFor(prompt, players).map((player) => player._id);
      await fillTimedOutVotes(ctx, bundle, prompt, voters);
    }
    await scoreRound(ctx, game, (await loadCurrentRound(ctx, game))!);
  },
};

// ---------------------------------------------------------------------------
// AI jobs
// ---------------------------------------------------------------------------

export type SloplashJobs = {
  SLOPLASH_RESPONSE: {
    input: {
      modelId: string;
      prompts: { promptId: Id<"prompts">; text: string }[];
      history: RoundHistoryEntry[];
    };
    output: { answers: { promptId: Id<"prompts">; text: string }[] };
  };
  SLOPLASH_VOTE: {
    input: {
      modelId: string;
      judgeModelId: string | null;
      promptText: string;
      a: { responseId: Id<"responses">; text: string };
      b: { responseId: Id<"responses">; text: string };
    };
    output: {
      responseId: Id<"responses"> | null;
      failed: boolean;
      reactions: { responseId: Id<"responses">; emoji: string }[];
    };
  };
  SLOPLASH_TAGLINE: {
    input: { modelId: string; leaderName: string; isFinal: boolean; context: string };
    output: { text: string };
  };
};

type VotePayload = PlayerJobPayload & { promptId: Id<"prompts"> };

const MAX_HISTORY_ROUNDS = 10;

async function unansweredPrompts(ctx: QueryCtx, game: Doc<"games">, playerId: Id<"players">) {
  const bundle = await loadCurrentRound(ctx, game);
  if (!bundle) return [];
  return bundle.prompts.filter(
    (prompt) =>
      prompt.assigneeIds.includes(playerId) &&
      !responsesFor(bundle, prompt._id).some((response) => response.playerId === playerId),
  );
}

/** What the AI wrote in earlier rounds and whether it won, for continuity. */
async function responseHistory(ctx: QueryCtx, game: Doc<"games">, playerId: Id<"players">) {
  const history: RoundHistoryEntry[] = [];
  for (const bundle of await loadAllRounds(ctx, game._id)) {
    const roundNumber = bundle.round.roundNumber;
    if (roundNumber >= game.round || roundNumber < game.round - MAX_HISTORY_ROUNDS) continue;
    for (const prompt of bundle.prompts) {
      const responses = responsesFor(bundle, prompt._id);
      const mine = responses.find((response) => response.playerId === playerId);
      if (!mine) continue;
      const opponent = responses.find((response) => response.playerId !== playerId);
      const votes = votesFor(bundle, prompt._id);
      const tally = (responseId: Id<"responses"> | undefined) =>
        votes.filter((vote) => vote.responseId !== undefined && vote.responseId === responseId)
          .length;
      const won =
        !isForfeit(mine) &&
        (!opponent || isForfeit(opponent) || tally(mine._id) > tally(opponent._id));
      history.push({
        round: roundNumber,
        prompt: prompt.text,
        yourJoke: mine.text,
        won,
        ...(!won && opponent && !isForfeit(opponent) ? { winningJoke: opponent.text } : {}),
      });
    }
  }
  return history;
}

async function forfeitPlayer(ctx: MutationCtx, game: Doc<"games">, playerId: Id<"players">) {
  for (const prompt of await unansweredPrompts(ctx, game, playerId)) {
    await insertResponse(ctx, prompt, playerId, FORFEIT_MARKER);
  }
}

async function taglineContext(ctx: QueryCtx, game: Doc<"games">, leader: Doc<"players">) {
  const players = (await loadActivePlayers(ctx, game._id)).toSorted((l, r) => r.score - l.score);
  const scoreboard = players
    .map((player, index) => `${index + 1}. ${player.name} (${player.type}) - ${player.score} pts`)
    .join("\n");
  const isFinal = game.phase === "FINAL";
  const rounds = isFinal ? await loadAllRounds(ctx, game._id) : [await loadCurrentRound(ctx, game)];
  const jokes: string[] = [];
  for (const bundle of rounds) {
    if (!bundle) continue;
    for (const prompt of bundle.prompts) {
      const mine = responsesFor(bundle, prompt._id).find((r) => r.playerId === leader._id);
      if (!mine || isForfeit(mine)) continue;
      jokes.push(
        `Round ${bundle.round.roundNumber}: Prompt: "${prompt.text}" -> Your answer: "${mine.text}"`,
      );
    }
  }
  return `Scores:\n${scoreboard}\n\nYour jokes this ${isFinal ? "game" : "round"}:\n${jokes.join("\n") || "(none)"}`;
}

export const sloplashJobHandlers: JobHandlers<SloplashJobs> = {
  SLOPLASH_RESPONSE: {
    phaseBound: true,
    async prepare(ctx, game, job) {
      const player = await jobAiPlayer(ctx, job);
      if (!player || game.phase !== "WRITING") return null;
      const prompts = await unansweredPrompts(ctx, game, player._id);
      if (prompts.length === 0) return null;
      return {
        modelId: player.modelId,
        prompts: prompts.map((prompt) => ({ promptId: prompt._id, text: prompt.text })),
        history: await responseHistory(ctx, game, player._id),
      };
    },
    async apply(ctx, game, job, output) {
      const { playerId } = job.payload as PlayerJobPayload;
      for (const answer of output.answers) {
        const prompt = await ctx.db.get("prompts", answer.promptId);
        if (!prompt || !prompt.assigneeIds.includes(playerId)) continue;
        if (await findResponse(ctx, prompt._id, playerId)) continue;
        await insertResponse(ctx, prompt, playerId, answer.text || FORFEIT_MARKER);
      }
      await forfeitPlayer(ctx, game, playerId);
    },
    async fallback(ctx, game, job) {
      await forfeitPlayer(ctx, game, (job.payload as PlayerJobPayload).playerId);
    },
  },

  SLOPLASH_VOTE: {
    phaseBound: true,
    async prepare(ctx, game, job) {
      const { promptId } = job.payload as VotePayload;
      const player = await jobAiPlayer(ctx, job);
      const bundle = await loadCurrentRound(ctx, game);
      if (!player || !bundle || game.phase !== "VOTING") return null;
      const prompt = votablePrompts(bundle)[game.step];
      if (!prompt || prompt._id !== promptId) return null;
      if (await findVote(ctx, prompt._id, player._id)) return null;
      const [a, b] = responsesFor(bundle, prompt._id);
      if (!a || !b) return null;
      return {
        modelId: player.modelId,
        judgeModelId: game.freePlay ? FREE_PLAY_JUDGE_MODEL_ID : null,
        promptText: prompt.text,
        a: { responseId: a._id, text: a.text },
        b: { responseId: b._id, text: b.text },
      };
    },
    async apply(ctx, _game, job, output) {
      const { playerId, promptId } = job.payload as VotePayload;
      const prompt = await ctx.db.get("prompts", promptId);
      if (!prompt || (await findVote(ctx, promptId, playerId))) return;
      await insertVote(ctx, prompt, playerId, output.responseId, output.failed);
      for (const reaction of output.reactions) {
        if (!isValidReactionEmoji(reaction.emoji)) continue;
        const response = await ctx.db.get("responses", reaction.responseId);
        if (response?.promptId === promptId) {
          await insertReaction(ctx, response, playerId, reaction.emoji);
        }
      }
    },
    async fallback(ctx, _game, job) {
      const { playerId, promptId } = job.payload as VotePayload;
      const prompt = await ctx.db.get("prompts", promptId);
      if (!prompt || (await findVote(ctx, promptId, playerId))) return;
      await insertVote(ctx, prompt, playerId, null, true);
    },
  },

  SLOPLASH_TAGLINE: {
    phaseBound: true,
    async prepare(ctx, game, job) {
      const leader = await jobAiPlayer(ctx, job);
      if (!leader) return null;
      return {
        modelId: leader.modelId,
        leaderName: leader.name,
        isFinal: game.phase === "FINAL",
        context: await taglineContext(ctx, game, leader),
      };
    },
    async apply(ctx, game, _job, output) {
      const row = await taglineRow(ctx, game);
      if (row) await ctx.db.patch("winnerTaglines", row._id, { text: output.text.trim() });
    },
    async fallback(ctx, game) {
      const row = await taglineRow(ctx, game);
      if (row && row.text === undefined) await ctx.db.delete("winnerTaglines", row._id);
    },
  },
};

export async function taglineRow(ctx: QueryCtx | MutationCtx, game: Doc<"games">) {
  return ctx.db
    .query("winnerTaglines")
    .withIndex("by_gameId_and_phaseGeneration", (index) =>
      index.eq("gameId", game._id).eq("phaseGeneration", game.phaseGeneration),
    )
    .unique();
}
