import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { timed, type GameMode, type Transition } from "../engine";
import { enqueueJob, findJob, jobAiPlayer, type JobHandlers, type PlayerJobPayload } from "../jobs";
import { loadActivePlayers, loadPlayers } from "../roster";
import {
  createRound,
  fillForfeits,
  findResponse,
  findVote,
  insertReaction,
  insertResponse,
  insertVote,
  isForfeit,
  loadAllRounds,
  loadCurrentRound,
  loadRound,
  responsesFor,
  votesFor,
  type RoundBundle,
} from "../rounds";
import { getRandomPrompts } from "../../src/games/core/prompts";
import { FORFEIT_MARKER, isForfeitMarker } from "../../src/games/core/constants";
import { getAiTask } from "../../src/lib/ai/tasks";
import { stableHash } from "../../src/lib/hash";
import { isValidReactionEmoji } from "../../src/lib/reactions";
import { capAnswer } from "../../src/games/sloplash/answer";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_SECONDS,
  ROUND_RESULTS_SECONDS,
  SLOPLASH_MAX_ANSWER,
  TAGLINE_MAX,
  VOTE_PER_PROMPT_SECONDS,
  WALKOVER_REVEAL_SECONDS,
  WRITING_DURATION_SECONDS,
} from "../../src/games/sloplash/game-constants";
import type { JokeSeat, RoundHistoryEntry, TaglineFacts } from "../../src/games/sloplash/prompts";
import { orderMatchups, scoreMatchup } from "../../src/games/sloplash/scoring";

/**
 * SlopLash phases:
 *   WRITING → (REVEAL(walkover))* → (VOTING(i) → REVEAL(i))* → ROUND_RESULTS → WRITING … → FINAL
 * `step` indexes `matchupOrder`: walkovers first, then contested matchups.
 */
export type SloplashPhase = "WRITING" | "VOTING" | "REVEAL" | "ROUND_RESULTS";

export type Matchup = { prompt: Doc<"prompts">; kind: "vote" | "walkover" };

/**
 * The round's matchups in play order: walkovers first, then contested ones,
 * each in prompt order; voids dropped. `game.step` indexes this list. Only
 * meaningful after WRITING (after `fillForfeits`).
 */
export function matchupOrder(bundle: RoundBundle): Matchup[] {
  return orderMatchups(
    bundle.prompts.map((prompt) => ({
      item: prompt,
      present: responsesFor(bundle, prompt._id).filter((response) => !isForfeit(response)).length,
    })),
  ).map(({ item, kind }) => ({ prompt: item, kind }));
}

/**
 * Where matchup `position` stands while matchups play: already revealed (or
 * closing), on screen and open for votes, or still to come.
 */
export function matchupStage(
  game: Pick<Doc<"games">, "phase" | "step">,
  position: number,
): "past" | "live" | "future" {
  if (position < game.step || (position === game.step && game.phase === "REVEAL")) return "past";
  return position === game.step ? "live" : "future";
}

/** The contested matchup being voted on, or undefined outside VOTING. */
export function votingMatchup(game: Doc<"games">, bundle: RoundBundle): Matchup | undefined {
  if (game.phase !== "VOTING") return undefined;
  const matchup = matchupOrder(bundle)[game.step];
  return matchup?.kind === "vote" ? matchup : undefined;
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
 * Puts matchups on the scoreboard, each exactly once: every vote is worth
 * 100 × the round multiplier (see `scoreMatchup`). A matchup is scored when
 * it is revealed, so every screen reads the same points.
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
  const gains = new Map<Id<"players">, number>();
  const now = Date.now();

  for (const prompt of unscored) {
    const responses = responsesFor(bundle, prompt._id);
    const result = scoreMatchup(
      responses.map((response) => ({ id: response._id, forfeited: isForfeit(response) })),
      votesFor(bundle, prompt._id).map((vote) => vote.responseId ?? null),
      bundle.round.roundNumber,
    );
    for (const response of responses) {
      const points = result.points[response._id] ?? 0;
      await ctx.db.patch("responses", response._id, { pointsEarned: points });
      gains.set(response.playerId, (gains.get(response.playerId) ?? 0) + points);
    }
    await ctx.db.patch("prompts", prompt._id, { scoredAt: now });
  }
  for (const player of players) {
    const gain = gains.get(player._id) ?? 0;
    if (gain !== 0) await ctx.db.patch("players", player._id, { score: player.score + gain });
  }
}

/** Scores whatever is left (walkovers and voids, or everything on an early end). */
async function scoreRound(ctx: MutationCtx, game: Doc<"games">, bundle: RoundBundle) {
  if (bundle.round.scoredAt !== undefined) return;
  await scorePrompts(ctx, game, bundle, bundle.prompts);
  await ctx.db.patch("rounds", bundle.round._id, { scoredAt: Date.now() });
}

function roundResults(game: Doc<"games">): Transition {
  return { phase: "ROUND_RESULTS", seconds: timed(game, ROUND_RESULTS_SECONDS) };
}

/**
 * Opens matchup `step`: a vote, a walkover reveal, or the round's results when
 * none are left. `bundle` is the current round as it stands now.
 */
async function enterMatchup(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
  step: number,
): Promise<Transition> {
  const matchup = matchupOrder(bundle)[step];
  if (!matchup) {
    await scoreRound(ctx, game, bundle);
    return roundResults(game);
  }
  if (matchup.kind === "vote") {
    return { phase: "VOTING", step, seconds: timed(game, VOTE_PER_PROMPT_SECONDS) };
  }
  await scorePrompts(ctx, game, bundle, [matchup.prompt]);
  return { phase: "REVEAL", step, seconds: timed(game, WALKOVER_REVEAL_SECONDS) };
}

// ---------------------------------------------------------------------------
// AI ballots: decided when WRITING closes, staged out of sight, cast per matchup
// ---------------------------------------------------------------------------

const BALLOTS_KIND = "SLOPLASH_BALLOTS";
const ballotsJobKey = (round: number, voterId: Id<"players">) => `ballots:${round}:${voterId}`;
const AI_BALLOT_MIN_DELAY_MS = 1_000;
const AI_BALLOT_MAX_DELAY_MS = 6_000;

/**
 * How long after a matchup's VOTING starts an AI voter's staged ballot lands:
 * 1–6s, derived from a hash so AI voters light up naturally and reproducibly.
 */
export function aiBallotDelayMs(voterId: string, promptId: string): number {
  const span = AI_BALLOT_MAX_DELAY_MS - AI_BALLOT_MIN_DELAY_MS;
  return AI_BALLOT_MIN_DELAY_MS + (stableHash(`${voterId}:${promptId}`) % (span + 1));
}

async function stagedBallot(
  ctx: QueryCtx | MutationCtx,
  promptId: Id<"prompts">,
  voterId: Id<"players">,
) {
  return ctx.db
    .query("sloplashBallots")
    .withIndex("by_promptId_and_voterId", (index) =>
      index.eq("promptId", promptId).eq("voterId", voterId),
    )
    .unique();
}

async function stagedBallotsFor(ctx: QueryCtx | MutationCtx, promptId: Id<"prompts">) {
  return ctx.db
    .query("sloplashBallots")
    .withIndex("by_promptId_and_voterId", (index) => index.eq("promptId", promptId))
    .take(MAX_PLAYERS);
}

/** Records an AI ballot as a vote (plus its reaction), unless the voter already voted. */
async function castAiBallot(
  ctx: MutationCtx,
  prompt: Doc<"prompts">,
  voterId: Id<"players">,
  responseId: Id<"responses">,
  reaction: string | null | undefined,
) {
  if (await findVote(ctx, prompt._id, voterId)) return;
  await insertVote(ctx, prompt, voterId, responseId);
  const response = await ctx.db.get("responses", responseId);
  if (reaction && isValidReactionEmoji(reaction) && response?.promptId === prompt._id) {
    await insertReaction(ctx, response, voterId, reaction);
  }
}

/** Turns a staged ballot into a vote and removes it from the stage. */
export async function castStagedBallot(
  ctx: MutationCtx,
  prompt: Doc<"prompts">,
  ballot: Doc<"sloplashBallots">,
) {
  await castAiBallot(ctx, prompt, ballot.voterId, ballot.responseId, ballot.reaction);
  await ctx.db.delete("sloplashBallots", ballot._id);
}

/** Queues one ballots call per AI voter for the round's contested matchups. */
async function queueAiBallots(ctx: MutationCtx, game: Doc<"games">, bundle: RoundBundle) {
  const contested = matchupOrder(bundle).filter((matchup) => matchup.kind === "vote");
  if (contested.length === 0) return;
  for (const player of await loadActivePlayers(ctx, game._id)) {
    if (player.type !== "AI") continue;
    if (!contested.some((matchup) => !matchup.prompt.assigneeIds.includes(player._id))) continue;
    await enqueueJob(ctx, game, BALLOTS_KIND, ballotsJobKey(game.round, player._id), {
      playerId: player._id,
      round: game.round,
    } satisfies BallotsPayload);
  }
}

/**
 * Whether an AI voter is done with the matchup on screen: it voted, its
 * ballot is staged (it lands on close at the latest), or its ballots call is
 * no longer running (it failed, or skipped this matchup: either way it abstains).
 */
async function aiVoterDone(
  ctx: QueryCtx | MutationCtx,
  game: Doc<"games">,
  prompt: Doc<"prompts">,
  voterId: Id<"players">,
) {
  if (await stagedBallot(ctx, prompt._id, voterId)) return true;
  const job = await findJob(ctx, game._id, ballotsJobKey(game.round, voterId));
  return job?.status !== "QUEUED";
}

/**
 * Closes a contested matchup's ballot box. Staged AI ballots are cast when
 * `flushStaged`; any of the active `players` still missing gets an empty
 * ballot: timed out for a human who ran out the clock, a plain abstain for an AI.
 */
async function closeBallots(
  ctx: MutationCtx,
  players: Doc<"players">[],
  prompt: Doc<"prompts">,
  flushStaged: boolean,
) {
  if (flushStaged) {
    for (const ballot of await stagedBallotsFor(ctx, prompt._id)) {
      await castStagedBallot(ctx, prompt, ballot);
    }
  }
  for (const voter of votersFor(prompt, players)) {
    if (await findVote(ctx, prompt._id, voter._id)) continue;
    await insertVote(ctx, prompt, voter._id, null, voter.type === "HUMAN");
  }
}

// ---------------------------------------------------------------------------
// Tagline
// ---------------------------------------------------------------------------

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
          await enqueueJob(ctx, game, "SLOPLASH_JOKES", `jokes:${game.round}:${player._id}`, {
            playerId: player._id,
          });
        }
        return;
      }
      case "VOTING": {
        // Staged AI ballots land a few seconds in; late ones are cast on arrival.
        const bundle = await loadCurrentRound(ctx, game);
        const matchup = bundle ? votingMatchup(game, bundle) : undefined;
        if (!matchup) return;
        for (const ballot of await stagedBallotsFor(ctx, matchup.prompt._id)) {
          await ctx.scheduler.runAfter(
            aiBallotDelayMs(ballot.voterId, ballot.promptId),
            internal.sloplash.play.castStagedBallot,
            { ballotId: ballot._id, phaseGeneration: game.phaseGeneration },
          );
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
      const matchup = votingMatchup(game, bundle);
      if (!matchup) return true;
      const voted = new Set(votesFor(bundle, matchup.prompt._id).map((vote) => vote.voterId));
      for (const voter of votersFor(matchup.prompt, connected)) {
        if (voted.has(voter._id)) continue;
        if (voter.type === "AI" && (await aiVoterDone(ctx, game, matchup.prompt, voter._id))) {
          continue;
        }
        return false;
      }
      return true;
    }
    return false;
  },

  async next(ctx, game) {
    const bundle = await loadCurrentRound(ctx, game);
    if (!bundle) return "FINISH";
    switch (game.phase as SloplashPhase) {
      case "WRITING": {
        await fillForfeits(ctx, bundle);
        const answered = (await loadCurrentRound(ctx, game))!;
        // Every answer is final now, so AI voters can decide the whole round at once.
        await queueAiBallots(ctx, game, answered);
        return enterMatchup(ctx, game, answered, 0);
      }
      case "VOTING": {
        const matchup = votingMatchup(game, bundle);
        if (!matchup) return enterMatchup(ctx, game, bundle, game.step + 1);
        await closeBallots(ctx, await loadActivePlayers(ctx, game._id), matchup.prompt, true);
        await scorePrompts(ctx, game, (await loadCurrentRound(ctx, game))!, [matchup.prompt]);
        return { phase: "REVEAL", step: game.step, seconds: timed(game, REVEAL_SECONDS) };
      }
      case "REVEAL":
        return enterMatchup(ctx, game, bundle, game.step + 1);
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
    const settled = (await loadCurrentRound(ctx, game))!;
    const live = votingMatchup(game, settled);
    const players = await loadActivePlayers(ctx, game._id);
    for (const matchup of matchupOrder(settled)) {
      if (matchup.kind !== "vote") continue;
      await closeBallots(ctx, players, matchup.prompt, matchup.prompt._id === live?.prompt._id);
    }
    await scoreRound(ctx, game, (await loadCurrentRound(ctx, game))!);
  },
};

// ---------------------------------------------------------------------------
// AI jobs
// ---------------------------------------------------------------------------

export type SloplashJobs = {
  SLOPLASH_JOKES: {
    input: {
      modelId: string;
      seat: JokeSeat;
      prompts: { promptId: Id<"prompts">; text: string }[];
      history: RoundHistoryEntry[];
      deadline: number | null;
    };
    output: { answers: { promptId: Id<"prompts">; text: string }[] };
  };
  SLOPLASH_BALLOTS: {
    input: {
      voterId: Id<"players">;
      modelId: string;
      freePlay: boolean;
      matchups: {
        promptId: Id<"prompts">;
        prompt: string;
        a: { responseId: Id<"responses">; text: string };
        b: { responseId: Id<"responses">; text: string };
      }[];
    };
    output: {
      ballots: { promptId: Id<"prompts">; responseId: Id<"responses">; reaction: string | null }[];
    };
  };
  SLOPLASH_TAGLINE: {
    input: TaglineFacts & { modelId: string; deadline: number | null };
    output: { text: string | null };
  };
};

type BallotsPayload = PlayerJobPayload & { round: number };

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

/**
 * What the AI wrote in earlier rounds and whether it won, so it learns the
 * room. Earlier rounds are all scored, so a win is simply out-earning the
 * opponent (a walkover pays the winner a unit).
 */
async function responseHistory(ctx: QueryCtx, game: Doc<"games">, playerId: Id<"players">) {
  const first = Math.max(1, game.round - MAX_HISTORY_ROUNDS);
  const bundles = await Promise.all(
    Array.from({ length: Math.max(0, game.round - first) }, (_, index) =>
      loadRound(ctx, game._id, first + index),
    ),
  );
  const history: RoundHistoryEntry[] = [];
  for (const bundle of bundles) {
    if (!bundle) continue;
    const roundNumber = bundle.round.roundNumber;
    for (const prompt of bundle.prompts) {
      const responses = responsesFor(bundle, prompt._id);
      const mine = responses.find((response) => response.playerId === playerId);
      if (!mine || isForfeit(mine)) continue;
      const opponent = responses.find((response) => response.playerId !== playerId);
      const won = mine.pointsEarned > (opponent?.pointsEarned ?? 0);
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

async function taglineFacts(
  ctx: QueryCtx,
  game: Doc<"games">,
  leader: Doc<"players">,
): Promise<TaglineFacts> {
  const players = (await loadActivePlayers(ctx, game._id)).toSorted((l, r) => r.score - l.score);
  const isFinal = game.phase === "FINAL";
  const rounds = isFinal ? await loadAllRounds(ctx, game._id) : [await loadCurrentRound(ctx, game)];
  const jokes: TaglineFacts["jokes"] = [];
  for (const bundle of rounds) {
    if (!bundle) continue;
    for (const prompt of bundle.prompts) {
      const mine = responsesFor(bundle, prompt._id).find((r) => r.playerId === leader._id);
      if (mine && !isForfeit(mine)) jokes.push({ prompt: prompt.text, text: mine.text });
    }
  }
  return {
    isFinal,
    standings: players.map((player) => ({
      name: player.name,
      type: player.type,
      score: player.score,
      you: player._id === leader._id,
    })),
    jokes,
  };
}

export const sloplashJobHandlers: JobHandlers<SloplashJobs> = {
  SLOPLASH_JOKES: {
    phaseBound: true,
    pool: getAiTask("sloplash.jokes").pool,
    async prepare(ctx, game, job) {
      const player = await jobAiPlayer(ctx, job);
      if (!player || game.phase !== "WRITING") return null;
      const prompts = await unansweredPrompts(ctx, game, player._id);
      if (prompts.length === 0) return null;
      return {
        modelId: player.modelId,
        seat: {
          playerCount: (await loadActivePlayers(ctx, game._id)).length,
          totalRounds: game.totalRounds,
        },
        prompts: prompts.map((prompt) => ({ promptId: prompt._id, text: prompt.text })),
        history: await responseHistory(ctx, game, player._id),
        deadline: game.phaseDeadline ?? null,
      };
    },
    async apply(ctx, game, job, output) {
      const { playerId } = job.payload as PlayerJobPayload;
      for (const answer of output.answers) {
        const prompt = await ctx.db.get("prompts", answer.promptId);
        if (!prompt || !prompt.assigneeIds.includes(playerId)) continue;
        if (await findResponse(ctx, prompt._id, playerId)) continue;
        const text = capAnswer(answer.text, SLOPLASH_MAX_ANSWER);
        if (!text || isForfeitMarker(text)) continue;
        await insertResponse(ctx, prompt, playerId, text);
      }
      // Anything still unanswered is a walkover for the other player.
      await forfeitPlayer(ctx, game, playerId);
    },
    async fallback(ctx, game, job) {
      await forfeitPlayer(ctx, game, (job.payload as PlayerJobPayload).playerId);
    },
  },

  SLOPLASH_BALLOTS: {
    // Bound to the round, not a phase: ballots land across the round's matchups.
    phaseBound: false,
    pool: getAiTask("sloplash.ballots").pool,
    async prepare(ctx, game, job) {
      const { round } = job.payload as BallotsPayload;
      const player = await jobAiPlayer(ctx, job);
      if (!player || game.status !== "PLAYING" || game.round !== round) return null;
      if (game.phase !== "VOTING" && game.phase !== "REVEAL") return null;
      const bundle = await loadCurrentRound(ctx, game);
      if (!bundle) return null;
      const matchups: SloplashJobs["SLOPLASH_BALLOTS"]["input"]["matchups"] = [];
      for (const [order, matchup] of matchupOrder(bundle).entries()) {
        if (matchup.kind !== "vote" || matchupStage(game, order) === "past") continue;
        if (matchup.prompt.assigneeIds.includes(player._id)) continue;
        const [a, b] = responsesFor(bundle, matchup.prompt._id);
        if (!a || !b) continue;
        matchups.push({
          promptId: matchup.prompt._id,
          prompt: matchup.prompt.text,
          a: { responseId: a._id, text: a.text },
          b: { responseId: b._id, text: b.text },
        });
      }
      if (matchups.length === 0) return null;
      return { voterId: player._id, modelId: player.modelId, freePlay: game.freePlay, matchups };
    },
    async apply(ctx, game, job, output) {
      const { playerId, round } = job.payload as BallotsPayload;
      if (game.status !== "PLAYING" || game.round !== round) return;
      if (game.phase !== "VOTING" && game.phase !== "REVEAL") return;
      const bundle = await loadCurrentRound(ctx, game);
      if (!bundle) return;
      const order = matchupOrder(bundle);
      for (const ballot of output.ballots) {
        const position = order.findIndex((matchup) => matchup.prompt._id === ballot.promptId);
        const matchup = order[position];
        if (!matchup || matchup.kind !== "vote" || matchup.prompt.assigneeIds.includes(playerId)) {
          continue;
        }
        if (!responsesFor(bundle, ballot.promptId).some((r) => r._id === ballot.responseId)) {
          continue;
        }
        const stage = matchupStage(game, position);
        // Already revealed (or closing): too late for this one.
        if (stage === "past") continue;
        if (stage === "live") {
          // Its vote is live: a late ballot is cast on arrival.
          await castAiBallot(ctx, matchup.prompt, playerId, ballot.responseId, ballot.reaction);
          continue;
        }
        if (await stagedBallot(ctx, ballot.promptId, playerId)) continue;
        await ctx.db.insert("sloplashBallots", {
          gameId: game._id,
          roundId: bundle.round._id,
          promptId: ballot.promptId,
          voterId: playerId,
          responseId: ballot.responseId,
          ...(ballot.reaction ? { reaction: ballot.reaction } : {}),
          createdAt: Date.now(),
        });
      }
    },
  },

  SLOPLASH_TAGLINE: {
    phaseBound: true,
    pool: getAiTask("sloplash.tagline").pool,
    async prepare(ctx, game, job) {
      const leader = await jobAiPlayer(ctx, job);
      if (!leader) return null;
      return {
        modelId: leader.modelId,
        deadline: game.phaseDeadline ?? null,
        ...(await taglineFacts(ctx, game, leader)),
      };
    },
    async apply(ctx, game, _job, output) {
      const row = await taglineRow(ctx, game);
      if (!row) return;
      const text = output.text === null ? "" : capAnswer(output.text, TAGLINE_MAX);
      // An empty line is a failure: no row, so nothing is drawn.
      if (text) await ctx.db.patch("winnerTaglines", row._id, { text });
      else await ctx.db.delete("winnerTaglines", row._id);
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
