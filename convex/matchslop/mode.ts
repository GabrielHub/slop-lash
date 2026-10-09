import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
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
  insertResponse,
  insertVote,
  isForfeit,
  loadCurrentRound,
  type RoundBundle,
} from "../rounds";
import { FORFEIT_MARKER, MAX_ANSWER_LENGTH } from "../../src/games/core/constants";
import { sanitize } from "../../src/lib/sanitize";
import {
  MATCHSLOP_PHOTO_PROMPT_ID,
  MATCHSLOP_PHOTO_PROMPT_TEXT,
  MATCHSLOP_POINTS_PER_WEIGHTED_VOTE,
  MATCHSLOP_RESULTS_SECONDS,
  MATCHSLOP_VOTING_SECONDS,
  MATCHSLOP_WINNER_BONUS,
  MATCHSLOP_WRITING_SECONDS,
} from "../../src/games/matchslop/config/game-config";
import {
  MATCHSLOP_PERSONA_EXAMPLES,
  type MatchSlopPersonaSeed,
} from "../../src/games/matchslop/config/persona-examples";
import { MATCHSLOP_PLAYER_EXAMPLES } from "../../src/games/matchslop/config/player-examples";
import { MAX_PLAYERS, MIN_PLAYERS } from "../../src/games/matchslop/game-constants";
import {
  AI_VOTE_WEIGHT,
  HUMAN_VOTE_WEIGHT,
  applyPersonaMood,
  conversationContext,
  fallbackPersonaReply,
  fallbackSignal,
  pickWinner,
  profileFromSeed,
  resolveAdvancePlan,
  roundPromptText,
  type TranscriptLine,
} from "../../src/games/matchslop/rules";
import {
  MATCHSLOP_INITIAL_MOOD,
  type MatchSlopIdentity,
  type MatchSlopPostMortem,
  type MatchSlopProfile,
} from "../../src/games/matchslop/types";

/**
 * MatchSlop phases, one round per message in the chat:
 *   [PROFILE] → WRITING → [VOTING] → SENT → REPLY → WRITING … → FINAL
 * PROFILE only appears if the persona was not ready by the time the host
 * started. VOTING is skipped when only one message was written. SENT waits for
 * the persona's answer; REPLY shows it.
 */
export type MatchslopPhase = "PROFILE" | "WRITING" | "VOTING" | "SENT" | "REPLY";

/** AI waits are bounded even in rooms without timers. */
const PROFILE_WAIT_SECONDS = 45;
const REPLY_WAIT_SECONDS = 30;
const MAX_REPLY_LENGTH = 500;
const MAX_MESSAGES = 64;
const PLAYER_EXAMPLE_COUNT = 4;

type DatabaseCtx = QueryCtx | MutationCtx;

function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, count);
}

export async function loadState(ctx: DatabaseCtx, gameId: Id<"games">) {
  const state = await ctx.db
    .query("matchSlopState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
  if (!state) throw new ConvexError("MatchSlop state is missing");
  return state;
}

export async function loadMessages(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("matchSlopMessages")
    .withIndex("by_gameId_and_turn", (index) => index.eq("gameId", gameId))
    .take(MAX_MESSAGES);
}

function transcriptOf(messages: Doc<"matchSlopMessages">[]): TranscriptLine[] {
  return messages.map((message) => ({
    speaker: message.speaker,
    text: message.text,
    authorName: message.authorName ?? null,
  }));
}

export function personaSeed(state: Doc<"matchSlopState">): MatchSlopPersonaSeed {
  return (
    MATCHSLOP_PERSONA_EXAMPLES.find((seed) => seed.id === state.personaSeedId) ??
    MATCHSLOP_PERSONA_EXAMPLES[0]!
  );
}

/** The text of the profile prompt (or photo) an opener answered. */
export function openerPromptText(
  profile: MatchSlopProfile | undefined,
  openerPromptId: string | undefined,
): string | null {
  if (!openerPromptId) return null;
  if (openerPromptId === MATCHSLOP_PHOTO_PROMPT_ID) return MATCHSLOP_PHOTO_PROMPT_TEXT;
  return profile?.prompts.find((prompt) => prompt.id === openerPromptId)?.prompt ?? null;
}

/** Who can vote: anyone with someone else's message to pick. */
export function canVote(bundle: RoundBundle, playerId: Id<"players">): boolean {
  return bundle.responses.some(
    (response) => !isForfeit(response) && response.playerId !== playerId,
  );
}

export type ScoredMessage = {
  response: Doc<"responses">;
  id: string;
  submittedAt: number;
  weightedVotes: number;
  rawVotes: number;
};

/** Tallies the round's votes, human votes weighted double. */
export function tallyRound(bundle: RoundBundle, players: Doc<"players">[]): ScoredMessage[] {
  const types = new Map(players.map((player) => [player._id as string, player.type]));
  return bundle.responses
    .filter((response) => !isForfeit(response))
    .map((response) => {
      const votes = bundle.votes.filter((vote) => vote.responseId === response._id);
      return {
        response,
        id: response._id,
        submittedAt: response.submittedAt,
        rawVotes: votes.length,
        weightedVotes: votes.reduce(
          (sum, vote) =>
            sum + (types.get(vote.voterId) === "AI" ? AI_VOTE_WEIGHT : HUMAN_VOTE_WEIGHT),
          0,
        ),
      };
    });
}

async function setProfile(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: Doc<"matchSlopState">,
  profile: MatchSlopProfile,
) {
  if (state.profile) return;
  // Portraits bill Fal, which Free Play rooms do not get.
  const wantsPortrait = !game.freePlay && state.portrait === undefined;
  await ctx.db.patch("matchSlopState", state._id, {
    profile,
    ...(wantsPortrait ? { portrait: { status: "PENDING" as const } } : {}),
  });
  if (wantsPortrait) await enqueueJob(ctx, game, "MATCHSLOP_PORTRAIT", "portrait");
}

async function startRound(
  ctx: MutationCtx,
  game: Doc<"games">,
  roundNumber: number,
): Promise<Transition> {
  const [players, state, messages] = await Promise.all([
    loadActivePlayers(ctx, game._id),
    loadState(ctx, game._id),
    loadMessages(ctx, game._id),
  ]);
  await createRound(ctx, game._id, roundNumber, [
    {
      text: roundPromptText(roundNumber, state.profile ?? null, transcriptOf(messages)),
      assigneeIds: players.map((player) => player._id),
    },
  ]);
  return {
    phase: "WRITING",
    round: roundNumber,
    seconds: timed(game, MATCHSLOP_WRITING_SECONDS),
  };
}

/** Scores the round and posts the winning message to the chat. */
async function sendWinner(
  ctx: MutationCtx,
  game: Doc<"games">,
  bundle: RoundBundle,
): Promise<Transition> {
  const players = await loadPlayers(ctx, game._id);
  const tally = tallyRound(bundle, players);
  const winner = pickWinner(tally);
  if (!winner) throw new ConvexError("No message to send");
  for (const entry of tally) {
    const points =
      entry.weightedVotes * MATCHSLOP_POINTS_PER_WEIGHTED_VOTE +
      (entry === winner && entry.weightedVotes > 0 ? MATCHSLOP_WINNER_BONUS : 0);
    if (points === 0) continue;
    await ctx.db.patch("responses", entry.response._id, { pointsEarned: points });
    const author = players.find((player) => player._id === entry.response.playerId);
    if (author) await ctx.db.patch("players", author._id, { score: author.score + points });
  }
  await ctx.db.patch("rounds", bundle.round._id, { scoredAt: Date.now() });

  const state = await loadState(ctx, game._id);
  const author = players.find((player) => player._id === winner.response.playerId);
  const opener = openerPromptText(state.profile, winner.response.openerPromptId);
  await ctx.db.insert("matchSlopMessages", {
    gameId: game._id,
    turn: game.round,
    speaker: "PLAYERS",
    text: winner.response.text,
    ...(author ? { authorName: author.name } : {}),
    ...(opener ? { openerPromptText: opener } : {}),
  });
  return { phase: "SENT", seconds: REPLY_WAIT_SECONDS, watchdog: true };
}

/** Posts the persona's answer and decides whether the chat goes on. */
async function postReply(ctx: MutationCtx, game: Doc<"games">): Promise<Transition> {
  const state = await loadState(ctx, game._id);
  const forceContinue = game.round === 1;
  const reply = state.reply ?? fallbackPersonaReply(forceContinue);
  const { mood, outcome } = applyPersonaMood(
    state.mood,
    reply.moodDelta,
    reply.outcome,
    forceContinue,
  );
  const plan = resolveAdvancePlan({
    currentRound: game.round,
    totalRounds: game.totalRounds,
    comebackRound: state.comebackRound ?? null,
    personaOutcome: outcome,
  });
  const fallback = fallbackSignal(reply.moodDelta, mood, outcome);
  await ctx.db.insert("matchSlopMessages", {
    gameId: game._id,
    turn: game.round,
    speaker: "PERSONA",
    text: reply.text,
    ...(state.profile ? { authorName: state.profile.displayName } : {}),
    mood,
    outcome: plan.messageOutcome,
  });
  await ctx.db.patch("matchSlopState", state._id, {
    mood,
    outcome: plan.outcome,
    comebackRound: plan.comebackRound ?? undefined,
    reply: undefined,
    signal: {
      category: reply.signalCategory ?? fallback.category,
      sideComment: reply.sideComment,
      nextSignal: reply.nextSignal ?? fallback.nextSignal,
      moodDelta: reply.moodDelta,
    },
  });
  return { phase: "REPLY", seconds: timed(game, MATCHSLOP_RESULTS_SECONDS) };
}

async function setOutcome(
  ctx: MutationCtx,
  game: Doc<"games">,
  outcome: Doc<"matchSlopState">["outcome"],
) {
  const state = await loadState(ctx, game._id);
  if (state.outcome === "IN_PROGRESS") {
    await ctx.db.patch("matchSlopState", state._id, { outcome });
  }
}

export const matchslopMode: GameMode = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  async createRoom(ctx, game, settings) {
    const config = settings.matchslop;
    if (!config) throw new ConvexError("MatchSlop needs persona settings");
    const pool = MATCHSLOP_PERSONA_EXAMPLES.filter(
      (seed) => seed.identity === config.personaIdentity,
    );
    const [seed] = sample(pool.length > 0 ? pool : MATCHSLOP_PERSONA_EXAMPLES, 1);
    await ctx.db.insert("matchSlopState", {
      gameId: game._id,
      seekerIdentity: config.seekerIdentity,
      personaIdentity: config.personaIdentity,
      personaModelId: config.personaModelId,
      personaSeedId: seed!.id,
      playerExamples: sample(MATCHSLOP_PLAYER_EXAMPLES, PLAYER_EXAMPLE_COUNT),
      mood: MATCHSLOP_INITIAL_MOOD,
      outcome: "IN_PROGRESS",
    });
    // The persona is written while the lobby fills, so the game can open on it.
    await enqueueJob(ctx, game, "MATCHSLOP_PROFILE", "profile");
  },

  async start(ctx, game) {
    const state = await loadState(ctx, game._id);
    if (!state.profile) {
      return { phase: "PROFILE", seconds: PROFILE_WAIT_SECONDS, watchdog: true };
    }
    return startRound(ctx, game, 1);
  },

  async onEnter(ctx, game) {
    switch (game.phase as MatchslopPhase | "FINAL") {
      case "WRITING":
      case "VOTING": {
        const kind = game.phase === "WRITING" ? "MATCHSLOP_RESPONSE" : "MATCHSLOP_VOTE";
        for (const player of await loadActivePlayers(ctx, game._id)) {
          if (player.type !== "AI") continue;
          await enqueueJob(ctx, game, kind, `${kind}:${game.round}:${player._id}`, {
            playerId: player._id,
          });
        }
        return;
      }
      case "SENT":
        await enqueueJob(ctx, game, "MATCHSLOP_REPLY", `reply:${game.round}`);
        return;
      case "FINAL": {
        const [state, messages] = await Promise.all([
          loadState(ctx, game._id),
          loadMessages(ctx, game._id),
        ]);
        if (state.profile && messages.length > 0) {
          await enqueueJob(ctx, game, "MATCHSLOP_POST_MORTEM", "postmortem");
        } else {
          await ctx.db.patch("matchSlopState", state._id, { postMortem: null });
        }
        return;
      }
      default:
        return;
    }
  },

  async isComplete(ctx, game, connected) {
    switch (game.phase as MatchslopPhase) {
      case "PROFILE":
        return (await loadState(ctx, game._id)).profile !== undefined;
      case "SENT":
        return (await loadState(ctx, game._id)).reply !== undefined;
      case "WRITING": {
        const bundle = await loadCurrentRound(ctx, game);
        if (!bundle) return false;
        const answered = new Set(bundle.responses.map((response) => response.playerId));
        return connected.every((player) => answered.has(player._id));
      }
      case "VOTING": {
        const bundle = await loadCurrentRound(ctx, game);
        if (!bundle) return false;
        const voted = new Set(bundle.votes.map((vote) => vote.voterId));
        return connected.every((player) => voted.has(player._id) || !canVote(bundle, player._id));
      }
      default:
        return false;
    }
  },

  async next(ctx, game) {
    switch (game.phase as MatchslopPhase) {
      case "PROFILE": {
        const state = await loadState(ctx, game._id);
        await setProfile(ctx, game, state, profileFromSeed(personaSeed(state)));
        return startRound(ctx, game, 1);
      }
      case "WRITING": {
        const bundle = await loadCurrentRound(ctx, game);
        if (!bundle) return "FINISH";
        // Forfeits never count toward the tally, so the bundle stays valid after this.
        await fillForfeits(ctx, bundle);
        const written = bundle.responses.filter((response) => !isForfeit(response));
        if (written.length === 0) {
          // Nobody said anything, so the persona moved on.
          await setOutcome(ctx, game, "UNMATCHED");
          return "FINISH";
        }
        if (written.length === 1) return sendWinner(ctx, game, bundle);
        return { phase: "VOTING", seconds: timed(game, MATCHSLOP_VOTING_SECONDS) };
      }
      case "VOTING": {
        const bundle = await loadCurrentRound(ctx, game);
        if (!bundle) return "FINISH";
        const prompt = bundle.prompts[0];
        if (prompt) {
          // Empty ballots never count toward the tally either.
          const voters = (await loadActivePlayers(ctx, game._id))
            .filter((player) => canVote(bundle, player._id))
            .map((player) => player._id);
          await fillTimedOutVotes(ctx, bundle, prompt, voters);
        }
        return sendWinner(ctx, game, bundle);
      }
      case "SENT":
        return postReply(ctx, game);
      case "REPLY": {
        const state = await loadState(ctx, game._id);
        if (state.outcome !== "IN_PROGRESS") return "FINISH";
        if ((await loadActivePlayers(ctx, game._id)).length < 2) {
          await setOutcome(ctx, game, "TURN_LIMIT");
          return "FINISH";
        }
        return startRound(ctx, game, game.round + 1);
      }
      default:
        return "FINISH";
    }
  },

  async onFinish(ctx, game) {
    await setOutcome(ctx, game, "TURN_LIMIT");
  },
};

// ---------------------------------------------------------------------------
// AI jobs
// ---------------------------------------------------------------------------

type PersonaBrief = {
  modelId: string;
  seekerIdentity: MatchSlopIdentity;
  personaIdentity: MatchSlopIdentity;
  seed: MatchSlopPersonaSeed;
};

export type MatchslopJobs = {
  MATCHSLOP_PROFILE: { input: PersonaBrief; output: { profile: MatchSlopProfile } };
  MATCHSLOP_PORTRAIT: {
    input: PersonaBrief & { profile: MatchSlopProfile };
    output: { url: string };
  };
  MATCHSLOP_RESPONSE: {
    input: {
      modelId: string;
      opener: boolean;
      profile: MatchSlopProfile;
      examples: string[];
      context: string;
    };
    output: { text: string; openerPromptId: string | null };
  };
  MATCHSLOP_VOTE: {
    input: {
      modelId: string;
      context: string;
      seedKey: string;
      responses: { id: Id<"responses">; text: string }[];
    };
    output: { responseId: Id<"responses"> | null; failed: boolean };
  };
  MATCHSLOP_REPLY: {
    input: PersonaBrief & {
      profile: MatchSlopProfile;
      mood: number;
      forceContinue: boolean;
      transcript: TranscriptLine[];
    };
    output: NonNullable<Doc<"matchSlopState">["reply"]>;
  };
  MATCHSLOP_POST_MORTEM: {
    input: PersonaBrief & {
      profile: MatchSlopProfile;
      outcome: string;
      playerNames: string[];
      transcript: TranscriptLine[];
    };
    output: { postMortem: MatchSlopPostMortem };
  };
};

function brief(state: Doc<"matchSlopState">): PersonaBrief {
  return {
    modelId: state.personaModelId,
    seekerIdentity: state.seekerIdentity,
    personaIdentity: state.personaIdentity,
    seed: personaSeed(state),
  };
}

async function forfeit(ctx: MutationCtx, game: Doc<"games">, playerId: Id<"players">) {
  const bundle = await loadCurrentRound(ctx, game);
  const prompt = bundle?.prompts[0];
  if (!prompt || (await findResponse(ctx, prompt._id, playerId))) return;
  await insertResponse(ctx, prompt, playerId, FORFEIT_MARKER);
}

async function abstain(ctx: MutationCtx, game: Doc<"games">, playerId: Id<"players">) {
  const bundle = await loadCurrentRound(ctx, game);
  const prompt = bundle?.prompts[0];
  if (!bundle || !prompt || (await findVote(ctx, prompt._id, playerId))) return;
  await fillTimedOutVotes(ctx, bundle, prompt, [playerId]);
}

/** Checks a client- or model-chosen opener prompt; null when it isn't on the profile. */
export function validOpenerPromptId(
  profile: MatchSlopProfile | undefined,
  openerPromptId: string | null,
): string | null {
  if (openerPromptId === MATCHSLOP_PHOTO_PROMPT_ID) return openerPromptId;
  return profile?.prompts.some((prompt) => prompt.id === openerPromptId) ? openerPromptId : null;
}

export const matchslopJobHandlers: JobHandlers<MatchslopJobs> = {
  MATCHSLOP_PROFILE: {
    phaseBound: false,
    async prepare(ctx, game) {
      const state = await loadState(ctx, game._id);
      return state.profile ? null : brief(state);
    },
    async apply(ctx, game, _job, output) {
      await setProfile(ctx, game, await loadState(ctx, game._id), output.profile);
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      await setProfile(ctx, game, state, profileFromSeed(personaSeed(state)));
    },
  },

  MATCHSLOP_PORTRAIT: {
    phaseBound: false,
    async prepare(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (!state.profile || state.portrait?.status !== "PENDING") return null;
      return { ...brief(state), profile: state.profile };
    },
    async apply(ctx, game, _job, output) {
      const state = await loadState(ctx, game._id);
      await ctx.db.patch("matchSlopState", state._id, {
        portrait: { status: "READY", url: output.url },
      });
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (state.portrait?.status === "PENDING") {
        await ctx.db.patch("matchSlopState", state._id, { portrait: { status: "FAILED" } });
      }
    },
  },

  MATCHSLOP_RESPONSE: {
    phaseBound: true,
    async prepare(ctx, game, job) {
      const player = await jobAiPlayer(ctx, job);
      if (!player || game.phase !== "WRITING") return null;
      const [state, bundle, messages] = await Promise.all([
        loadState(ctx, game._id),
        loadCurrentRound(ctx, game),
        loadMessages(ctx, game._id),
      ]);
      const prompt = bundle?.prompts[0];
      if (!state.profile || !prompt || (await findResponse(ctx, prompt._id, player._id))) {
        return null;
      }
      return {
        modelId: player.modelId,
        opener: game.round === 1,
        profile: state.profile,
        examples: state.playerExamples,
        context: conversationContext(state.profile, transcriptOf(messages), prompt.text),
      };
    },
    async apply(ctx, game, job, output) {
      const { playerId } = job.payload as PlayerJobPayload;
      const bundle = await loadCurrentRound(ctx, game);
      const prompt = bundle?.prompts[0];
      if (!prompt || (await findResponse(ctx, prompt._id, playerId))) return;
      const text = sanitize(output.text, MAX_ANSWER_LENGTH);
      if (!text || text === FORFEIT_MARKER) {
        await insertResponse(ctx, prompt, playerId, FORFEIT_MARKER);
        return;
      }
      const state = await loadState(ctx, game._id);
      const opener =
        game.round === 1
          ? (validOpenerPromptId(state.profile, output.openerPromptId) ??
            state.profile?.prompts[0]?.id)
          : undefined;
      await insertResponse(ctx, prompt, playerId, text, opener);
    },
    async fallback(ctx, game, job) {
      await forfeit(ctx, game, (job.payload as PlayerJobPayload).playerId);
    },
  },

  MATCHSLOP_VOTE: {
    phaseBound: true,
    async prepare(ctx, game, job) {
      const player = await jobAiPlayer(ctx, job);
      if (!player || game.phase !== "VOTING") return null;
      const [state, bundle, messages] = await Promise.all([
        loadState(ctx, game._id),
        loadCurrentRound(ctx, game),
        loadMessages(ctx, game._id),
      ]);
      const prompt = bundle?.prompts[0];
      if (!bundle || !prompt || (await findVote(ctx, prompt._id, player._id))) return null;
      const responses = bundle.responses
        .filter((response) => !isForfeit(response) && response.playerId !== player._id)
        .map((response) => ({ id: response._id, text: response.text }));
      if (responses.length === 0) return null;
      return {
        modelId: player.modelId,
        context: conversationContext(state.profile ?? null, transcriptOf(messages), prompt.text),
        seedKey: `${game._id}:${game.round}:${player._id}`,
        responses,
      };
    },
    async apply(ctx, game, job, output) {
      const { playerId } = job.payload as PlayerJobPayload;
      const bundle = await loadCurrentRound(ctx, game);
      const prompt = bundle?.prompts[0];
      if (!bundle || !prompt || (await findVote(ctx, prompt._id, playerId))) return;
      const choice = bundle.responses.find(
        (response) =>
          response._id === output.responseId &&
          !isForfeit(response) &&
          response.playerId !== playerId,
      );
      if (output.failed || !choice) {
        await fillTimedOutVotes(ctx, bundle, prompt, [playerId]);
      } else {
        await insertVote(ctx, prompt, playerId, choice._id);
      }
    },
    async fallback(ctx, game, job) {
      await abstain(ctx, game, (job.payload as PlayerJobPayload).playerId);
    },
  },

  MATCHSLOP_REPLY: {
    phaseBound: true,
    async prepare(ctx, game) {
      if (game.phase !== "SENT") return null;
      const [state, messages] = await Promise.all([
        loadState(ctx, game._id),
        loadMessages(ctx, game._id),
      ]);
      if (!state.profile || state.reply) return null;
      return {
        ...brief(state),
        profile: state.profile,
        mood: state.mood,
        forceContinue: game.round === 1,
        transcript: transcriptOf(messages),
      };
    },
    async apply(ctx, game, _job, output) {
      const state = await loadState(ctx, game._id);
      const text = sanitize(output.text, MAX_REPLY_LENGTH);
      if (state.reply || !text) return;
      await ctx.db.patch("matchSlopState", state._id, {
        reply: {
          ...output,
          text,
          outcome: game.round === 1 ? "CONTINUE" : output.outcome,
          moodDelta: Math.max(-50, Math.min(50, Math.round(output.moodDelta))),
        },
      });
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (state.reply) return;
      await ctx.db.patch("matchSlopState", state._id, {
        reply: fallbackPersonaReply(game.round === 1),
      });
    },
  },

  MATCHSLOP_POST_MORTEM: {
    phaseBound: true,
    async prepare(ctx, game) {
      const [state, messages, players] = await Promise.all([
        loadState(ctx, game._id),
        loadMessages(ctx, game._id),
        loadActivePlayers(ctx, game._id),
      ]);
      if (!state.profile || state.postMortem !== undefined) return null;
      return {
        ...brief(state),
        profile: state.profile,
        outcome: state.outcome,
        playerNames: players.map((player) => player.name).sort(),
        transcript: transcriptOf(messages),
      };
    },
    async apply(ctx, game, _job, output) {
      const state = await loadState(ctx, game._id);
      await ctx.db.patch("matchSlopState", state._id, { postMortem: output.postMortem });
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (state.postMortem === undefined) {
        await ctx.db.patch("matchSlopState", state._id, { postMortem: null });
      }
    },
  },
};
