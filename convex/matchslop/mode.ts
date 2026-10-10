import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { timed, type GameMode, type Transition } from "../engine";
import { enqueueJob, jobAiPlayer, type JobHandlers, type PlayerJobPayload } from "../jobs";
import { findGameByNumber, loadActivePlayers, loadPlayers } from "../roster";
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
import { FORFEIT_MARKER } from "../../src/games/core/constants";
import { getAiTask } from "../../src/lib/ai/tasks";
import type {
  BotLineInput,
  GeneratedPersona,
  PostMortemInput,
  ReplyInput,
  ReplyOutput,
} from "../../src/games/matchslop/ai-calls";
import type { AiVoteInput } from "../../src/games/matchslop/ai-voting";
import type { PostMortemPlayer, ProfileAvoid } from "../../src/games/matchslop/prompts";
import {
  MATCHSLOP_MAX_PARTING_LENGTH,
  MATCHSLOP_MAX_PROMPT_ANSWER_LENGTH,
  MATCHSLOP_MAX_REPLY_LENGTH,
  MATCHSLOP_MAX_THOUGHT_LENGTH,
  MATCHSLOP_MAX_VERDICT_LENGTH,
  MATCHSLOP_OPENER_SECONDS,
  MATCHSLOP_PHOTO_PROMPT_ID,
  MATCHSLOP_PHOTO_PROMPT_TEXT,
  MATCHSLOP_POINTS_PER_WEIGHTED_VOTE,
  MATCHSLOP_REPLY_SECONDS,
  MATCHSLOP_REPLY_WRITING_SECONDS,
  MATCHSLOP_SENT_MIN_MS,
  MATCHSLOP_VOTING_SECONDS,
  MATCHSLOP_WINNER_BONUS,
} from "../../src/games/matchslop/config/game-config";
import {
  MATCHSLOP_PERSONA_EXAMPLES,
  type MatchSlopPersonaSeed,
} from "../../src/games/matchslop/config/persona-examples";
import { MATCHSLOP_PLAYER_EXAMPLES } from "../../src/games/matchslop/config/player-examples";
import { MAX_PLAYERS, MIN_PLAYERS } from "../../src/games/matchslop/game-constants";
import { chatContextXml, type PersonaBrief } from "../../src/games/matchslop/prompts";
import {
  AI_VOTE_WEIGHT,
  HUMAN_VOTE_WEIGHT,
  cannedReply,
  cleanLine,
  clip,
  levelConsequences,
  pickWinner,
  profileFromSeed,
  resolveTurn,
  roundPromptText,
  standInReply,
  trimAtWord,
  verdictOf,
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
 * the persona's answer (and holds at least MATCHSLOP_SENT_MIN_MS); REPLY
 * shows it. The code, not the model, decides what each reply does: see
 * `resolveTurn` in src/games/matchslop/rules.ts.
 */
export type MatchslopPhase = "PROFILE" | "WRITING" | "VOTING" | "SENT" | "REPLY";

/** AI waits are bounded even in rooms without timers. */
const PROFILE_WAIT_SECONDS = 45;
const REPLY_WAIT_SECONDS = 30;
const MAX_MESSAGES = 64;
const PLAYER_EXAMPLE_COUNT = 4;

type DatabaseCtx = QueryCtx | MutationCtx;

/** Which persona to write: the room's settings. */
export type PersonaConfig = Pick<
  Doc<"matchSlopState">,
  "seekerIdentity" | "personaIdentity" | "personaModelId"
>;

function sample<T>(items: readonly T[], count: number): T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, count);
}

export async function findState(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("matchSlopState")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .unique();
}

export async function loadState(ctx: DatabaseCtx, gameId: Id<"games">) {
  const state = await findState(ctx, gameId);
  if (!state) throw new ConvexError("MatchSlop state is missing");
  return state;
}

export async function loadMessages(ctx: DatabaseCtx, gameId: Id<"games">) {
  return ctx.db
    .query("matchSlopMessages")
    .withIndex("by_gameId_and_turn", (index) => index.eq("gameId", gameId))
    .take(MAX_MESSAGES);
}

export function transcriptOf(messages: Doc<"matchSlopMessages">[]): TranscriptLine[] {
  return messages.map((message) => ({
    speaker: message.speaker,
    text: message.text,
    authorName: message.authorName ?? null,
    level: message.level ?? null,
    openerPromptText: message.openerPromptText ?? null,
  }));
}

/** The same lines without authors, for every prompt but the post-mortem. */
function anonymous(transcript: TranscriptLine[]): TranscriptLine[] {
  return transcript.map((line) => ({ ...line, authorName: null }));
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
  /** Who picked this line, in voting order. */
  voterIds: Id<"players">[];
};

/** Tallies the round's votes, human votes weighted double. Abstains count for nobody. */
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
        voterIds: votes.map((vote) => vote.voterId),
        weightedVotes: votes.reduce(
          (sum, vote) =>
            sum + (types.get(vote.voterId) === "AI" ? AI_VOTE_WEIGHT : HUMAN_VOTE_WEIGHT),
          0,
        ),
      };
    });
}

/** The hand-written seed as a ready persona, for when generation fails. */
function seedProfile(seed: MatchSlopPersonaSeed): GeneratedPersona {
  return {
    profile: profileFromSeed(seed),
    textingStyle: seed.textingStyle,
    imagePrompt: seed.imagePrompt,
  };
}

function portraitPromptFor(persona: GeneratedPersona, seed: MatchSlopPersonaSeed): string {
  if (persona.imagePrompt) return persona.imagePrompt;
  const appearance = persona.profile.appearance;
  return appearance
    ? `Photorealistic candid phone portrait for a dating app: ${appearance}. Natural ambient light.`
    : seed.imagePrompt;
}

async function setProfile(
  ctx: MutationCtx,
  game: Doc<"games">,
  state: Doc<"matchSlopState">,
  persona: GeneratedPersona,
) {
  if (state.profile) return;
  const seed = personaSeed(state);
  const profile: MatchSlopProfile = {
    ...persona.profile,
    prompts: persona.profile.prompts.map((prompt) => ({
      ...prompt,
      answer: trimAtWord(prompt.answer, MATCHSLOP_MAX_PROMPT_ANSWER_LENGTH),
    })),
  };
  // Portraits bill Fal, which Free Play rooms do not get.
  const wantsPortrait = !game.freePlay && state.portrait === undefined;
  await ctx.db.patch("matchSlopState", state._id, {
    profile,
    textingStyle: persona.textingStyle ?? seed.textingStyle,
    imagePrompt: portraitPromptFor(persona, seed),
    ...(wantsPortrait ? { portrait: { status: "PENDING" as const } } : {}),
  });
  if (wantsPortrait) await enqueueJob(ctx, game, "MATCHSLOP_PORTRAIT", "portrait");
}

/** Earlier games in the room this many back are checked for repeats. */
const HISTORY_GAMES = 12;

/** The MatchSlop states of this room's earlier games, most recent first. */
async function earlierStates(
  ctx: DatabaseCtx,
  game: Doc<"games">,
): Promise<Doc<"matchSlopState">[]> {
  const oldest = Math.max(1, game.gameNumber - HISTORY_GAMES);
  const numbers = Array.from(
    { length: game.gameNumber - oldest },
    (_, k) => game.gameNumber - 1 - k,
  );
  const states = await Promise.all(
    numbers.map(async (number) => {
      const earlier = await findGameByNumber(ctx, game.roomCode, number);
      return earlier ? findState(ctx, earlier._id) : null;
    }),
  );
  return states.filter((state) => state !== null);
}

/**
 * The seeds this room has not played yet. When every seed has been played,
 * the ones played longest ago come back first, never the one just played.
 */
export function freshSeeds<T extends { id: string }>(
  pool: readonly T[],
  playedSeedIds: readonly string[],
): T[] {
  const played = new Set(playedSeedIds);
  const unplayed = pool.filter((seed) => !played.has(seed.id));
  if (unplayed.length > 0) return unplayed;
  const recent = new Set(playedSeedIds.slice(0, Math.max(1, Math.floor(pool.length / 2))));
  const older = pool.filter((seed) => !recent.has(seed.id));
  return older.length > 0 ? older : pool.filter((seed) => seed.id !== playedSeedIds[0]);
}

/**
 * Picks a persona seed for `game` (one the room has not played, when the pool
 * allows), stores fresh state and queues the profile, which is written while
 * the lobby fills.
 */
export async function seedPersona(
  ctx: MutationCtx,
  game: Doc<"games">,
  config: PersonaConfig,
  /** Seeds this room already played, most recent first. */
  playedSeedIds: readonly string[] = [],
): Promise<void> {
  if (await findState(ctx, game._id)) return;
  const matching = MATCHSLOP_PERSONA_EXAMPLES.filter(
    (seed) => seed.identity === config.personaIdentity,
  );
  const pool = matching.length > 0 ? matching : MATCHSLOP_PERSONA_EXAMPLES;
  const [seed] = sample(freshSeeds(pool, playedSeedIds), 1);
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
  await enqueueJob(ctx, game, "MATCHSLOP_PROFILE", "profile");
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
    seconds: timed(
      game,
      roundNumber === 1 ? MATCHSLOP_OPENER_SECONDS : MATCHSLOP_REPLY_WRITING_SECONDS,
    ),
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
    ...(author ? { authorName: author.name, authorId: author._id } : {}),
    ...(opener ? { openerPromptText: opener } : {}),
  });
  return { phase: "SENT", seconds: REPLY_WAIT_SECONDS, watchdog: true };
}

/**
 * Posts the persona's answer and lets the code decide what it does. Only a
 * model reply carries a level; a stand-in leaves mood and points untouched.
 */
async function postReply(ctx: MutationCtx, game: Doc<"games">): Promise<Transition> {
  const state = await loadState(ctx, game._id);
  const comeback = state.comebackRound === game.round;
  const reply: ReplyOutput = state.reply ?? standInReply();
  const level = reply.source === "model" ? reply.level : null;
  const turn = resolveTurn({
    mood: state.mood,
    level,
    round: game.round,
    totalRounds: game.totalRounds,
    comeback,
  });
  const ending = turn.outcome !== "IN_PROGRESS";
  const text =
    reply.source === "model" && reply.text
      ? reply.text
      : cannedReply(reply.source, !ending ? "continue" : comeback ? "comeback" : "ending");

  // Credit the sent line's author, recorded when sendWinner posted it.
  const sent = (await loadMessages(ctx, game._id)).findLast(
    (message) => message.speaker === "PLAYERS" && message.turn === game.round,
  );
  const author = sent?.authorId ? await ctx.db.get("players", sent.authorId) : null;
  if (author && turn.points !== 0) {
    await ctx.db.patch("players", author._id, { score: author.score + turn.points });
  }

  await ctx.db.insert("matchSlopMessages", {
    gameId: game._id,
    turn: game.round,
    speaker: "PERSONA",
    text,
    mood: turn.mood,
    outcome: turn.message,
    ...(level ? { level } : {}),
  });
  await ctx.db.patch("matchSlopState", state._id, {
    mood: turn.mood,
    outcome: turn.outcome,
    comebackRound: turn.comebackRound ?? state.comebackRound,
    reply: undefined,
    signal: {
      level,
      delta: level ? turn.delta : 0,
      points: turn.points,
      thought: reply.source === "model" ? reply.thought : null,
      source: reply.source,
      authorId: author?._id ?? null,
    },
  });
  return { phase: "REPLY", seconds: timed(game, MATCHSLOP_REPLY_SECONDS) };
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

/** Active players' names, each once, for the post-mortem. */
async function postMortemNames(ctx: DatabaseCtx, game: Doc<"games">): Promise<string[]> {
  const players = await loadActivePlayers(ctx, game._id);
  return [...new Set(players.map((player) => player.name))].sort();
}

/**
 * Each active player's record for the post-mortem: lines written (forfeits
 * excluded) and lines the room sent. Without it the persona sees only sent
 * lines and calls players who kept losing the vote "silent".
 */
async function postMortemPlayers(
  ctx: DatabaseCtx,
  game: Doc<"games">,
  messages: Doc<"matchSlopMessages">[],
): Promise<PostMortemPlayer[]> {
  const [players, responses] = await Promise.all([
    loadActivePlayers(ctx, game._id),
    ctx.db
      .query("responses")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .take(MAX_PLAYERS * MAX_MESSAGES),
  ]);
  const records = new Map<string, PostMortemPlayer>();
  for (const player of players) {
    const record = records.get(player.name) ?? { name: player.name, wrote: 0, sent: 0 };
    record.wrote += responses.filter(
      (response) => response.playerId === player._id && !isForfeit(response),
    ).length;
    records.set(player.name, record);
  }
  for (const message of messages) {
    const record = message.authorName ? records.get(message.authorName) : undefined;
    if (message.speaker === "PLAYERS" && record) record.sent += 1;
  }
  return [...records.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export const matchslopMode: GameMode = {
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,

  async createRoom(ctx, game, settings) {
    const config = settings.matchslop;
    if (!config) throw new ConvexError("MatchSlop needs persona settings");
    await seedPersona(ctx, game, config);
  },

  async rematch(ctx, previous, next) {
    // A new persona from the same settings, one this room has not met yet.
    const state = await loadState(ctx, previous._id);
    const played = (await earlierStates(ctx, next)).map((entry) => entry.personaSeedId);
    await seedPersona(ctx, next, state, played.length > 0 ? played : [state.personaSeedId]);
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
        // Only here: finishGame cancels queued jobs before FINAL, and job keys dedupe.
        const [state, messages, names] = await Promise.all([
          loadState(ctx, game._id),
          loadMessages(ctx, game._id),
          postMortemNames(ctx, game),
        ]);
        if (state.profile && messages.length > 0 && names.length > 0) {
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
        // The send animation always gets its beat, even when the reply is instant.
        return (
          (await loadState(ctx, game._id)).reply !== undefined &&
          Date.now() >= game.phaseStartedAt + MATCHSLOP_SENT_MIN_MS
        );
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
        await setProfile(ctx, game, state, seedProfile(personaSeed(state)));
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
          await setOutcome(ctx, game, "UNMATCHED");
          return "FINISH";
        }
        return startRound(ctx, game, game.round + 1);
      }
      default:
        return "FINISH";
    }
  },

  async onFinish(ctx, game) {
    // Ended before a verdict (host End, silence): below the date line, so no date.
    await setOutcome(ctx, game, "UNMATCHED");
  },
};

// ---------------------------------------------------------------------------
// AI jobs
// ---------------------------------------------------------------------------

type PersonaSeedBrief = {
  modelId: string;
  seekerIdentity: MatchSlopIdentity;
  personaIdentity: MatchSlopIdentity;
  seed: MatchSlopPersonaSeed;
  avoid?: ProfileAvoid;
};

export type MatchslopJobs = {
  MATCHSLOP_PROFILE: { input: PersonaSeedBrief; output: { persona: GeneratedPersona | null } };
  MATCHSLOP_PORTRAIT: { input: { imagePrompt: string }; output: { url: string } };
  MATCHSLOP_RESPONSE: {
    input: BotLineInput;
    /** `text: null` when the call failed: the seat forfeits. */
    output: { text: string | null; openerPromptId: string | null };
  };
  MATCHSLOP_VOTE: {
    input: AiVoteInput;
    output: { responseId: string | null; failed: boolean };
  };
  MATCHSLOP_REPLY: { input: ReplyInput; output: ReplyOutput };
  MATCHSLOP_POST_MORTEM: {
    input: PostMortemInput;
    output: { postMortem: MatchSlopPostMortem | null };
  };
};

/** The persona as every call about her sees it; null before the profile exists. */
function personaBrief(state: Doc<"matchSlopState">): PersonaBrief | null {
  if (!state.profile) return null;
  return {
    seekerIdentity: state.seekerIdentity,
    personaIdentity: state.personaIdentity,
    profile: state.profile,
    textingStyle: state.textingStyle ?? personaSeed(state).textingStyle,
  };
}

const deadlineOf = (game: Doc<"games">) => game.phaseDeadline ?? null;

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

/**
 * Checks a client- or model-chosen opener prompt; null when it isn't on the
 * profile. The photo counts only once the portrait is ready.
 */
export function validOpenerPromptId(
  profile: MatchSlopProfile | undefined,
  openerPromptId: string | null,
  portraitReady: boolean,
): string | null {
  if (openerPromptId === MATCHSLOP_PHOTO_PROMPT_ID) return portraitReady ? openerPromptId : null;
  return profile?.prompts.some((prompt) => prompt.id === openerPromptId) ? openerPromptId : null;
}

/** Holds SENT until the send animation has played, then re-checks the room. */
async function scheduleSentHold(ctx: MutationCtx, game: Doc<"games">) {
  const releaseAt = game.phaseStartedAt + MATCHSLOP_SENT_MIN_MS;
  if (Date.now() < releaseAt) {
    await ctx.scheduler.runAt(releaseAt, internal.engine.maintain, { gameId: game._id });
  }
}

export const matchslopJobHandlers: JobHandlers<MatchslopJobs> = {
  MATCHSLOP_PROFILE: {
    phaseBound: false,
    pool: getAiTask("matchslop.profile").pool,
    async prepare(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (state.profile) return null;
      // Earlier personas in this room, so the model invents someone new.
      const met = (await earlierStates(ctx, game)).flatMap((entry) =>
        entry.profile ? [entry.profile] : [],
      );
      return {
        modelId: state.personaModelId,
        seekerIdentity: state.seekerIdentity,
        personaIdentity: state.personaIdentity,
        seed: personaSeed(state),
        avoid: {
          names: [...new Set(met.map((profile) => profile.displayName))],
          locations: [...new Set(met.flatMap((profile) => profile.location ?? []))],
        },
      };
    },
    async apply(ctx, game, _job, output) {
      const state = await loadState(ctx, game._id);
      await setProfile(ctx, game, state, output.persona ?? seedProfile(personaSeed(state)));
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      await setProfile(ctx, game, state, seedProfile(personaSeed(state)));
    },
  },

  MATCHSLOP_PORTRAIT: {
    phaseBound: false,
    async prepare(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (!state.profile || state.portrait?.status !== "PENDING") return null;
      return { imagePrompt: state.imagePrompt ?? personaSeed(state).imagePrompt };
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
    pool: getAiTask("matchslop.botLine").pool,
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
        deadline: deadlineOf(game),
        opener: game.round === 1,
        profile: state.profile,
        examples: state.playerExamples,
        context: chatContextXml(state.profile, anonymous(transcriptOf(messages))),
      };
    },
    async apply(ctx, game, job, output) {
      const { playerId } = job.payload as PlayerJobPayload;
      const bundle = await loadCurrentRound(ctx, game);
      const prompt = bundle?.prompts[0];
      if (!prompt || (await findResponse(ctx, prompt._id, playerId))) return;
      const text = cleanLine(output.text ?? "");
      if (!text || text === FORFEIT_MARKER) {
        await insertResponse(ctx, prompt, playerId, FORFEIT_MARKER);
        return;
      }
      const state = await loadState(ctx, game._id);
      // The AI is never offered the photo.
      const opener =
        game.round === 1
          ? (validOpenerPromptId(state.profile, output.openerPromptId, false) ??
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
    pool: getAiTask("matchslop.vote").pool,
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
        .map((response) => ({ id: response._id as string, text: response.text }));
      if (responses.length === 0) return null;
      return {
        modelId: player.modelId,
        context: chatContextXml(state.profile ?? null, anonymous(transcriptOf(messages))),
        seedKey: `${game._id}:${game.round}:${player._id}`,
        responses,
        deadline: deadlineOf(game),
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
      // A failed call abstains; it never becomes a picked vote.
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
    pool: getAiTask("matchslop.reply").pool,
    async prepare(ctx, game) {
      if (game.phase !== "SENT") return null;
      const [state, messages] = await Promise.all([
        loadState(ctx, game._id),
        loadMessages(ctx, game._id),
      ]);
      const brief = personaBrief(state);
      if (!brief || state.reply) return null;
      const turnState = {
        mood: state.mood,
        round: game.round,
        totalRounds: game.totalRounds,
        comeback: state.comebackRound === game.round,
      };
      return {
        ...brief,
        modelId: state.personaModelId,
        deadline: deadlineOf(game),
        transcript: anonymous(transcriptOf(messages)),
        state: turnState,
        consequences: levelConsequences(turnState),
      };
    },
    async apply(ctx, game, _job, output) {
      const state = await loadState(ctx, game._id);
      if (state.reply) return;
      let reply = standInReply(output.source === "model" ? "fallback" : output.source);
      if (output.source === "model") {
        const text = clip(output.text ?? "", MATCHSLOP_MAX_REPLY_LENGTH) || null;
        const thought = clip(output.thought ?? "", MATCHSLOP_MAX_THOUGHT_LENGTH) || null;
        // An empty reply is no reply: it is shown canned and never scores.
        if (text && output.level) reply = { source: "model", level: output.level, text, thought };
      }
      await ctx.db.patch("matchSlopState", state._id, { reply });
      await scheduleSentHold(ctx, game);
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (state.reply) return;
      await ctx.db.patch("matchSlopState", state._id, {
        reply: standInReply(),
      });
      await scheduleSentHold(ctx, game);
    },
  },

  MATCHSLOP_POST_MORTEM: {
    phaseBound: true,
    pool: getAiTask("matchslop.postMortem").pool,
    async prepare(ctx, game) {
      const [state, messages] = await Promise.all([
        loadState(ctx, game._id),
        loadMessages(ctx, game._id),
      ]);
      const players = await postMortemPlayers(ctx, game, messages);
      const brief = personaBrief(state);
      if (!brief || state.postMortem !== undefined || players.length === 0) return null;
      return {
        ...brief,
        modelId: state.personaModelId,
        deadline: null,
        verdict: verdictOf(state),
        players,
        transcript: transcriptOf(messages),
      };
    },
    async apply(ctx, game, _job, output) {
      const state = await loadState(ctx, game._id);
      if (state.postMortem !== undefined) return;
      if (!output.postMortem) {
        await ctx.db.patch("matchSlopState", state._id, { postMortem: null });
        return;
      }
      const names = new Set(await postMortemNames(ctx, game));
      const seen = new Set<string>();
      const verdicts = [];
      for (const entry of output.postMortem.verdicts) {
        const verdict = clip(entry.verdict, MATCHSLOP_MAX_VERDICT_LENGTH);
        if (!names.has(entry.playerName) || seen.has(entry.playerName) || !verdict) continue;
        seen.add(entry.playerName);
        verdicts.push({ playerName: entry.playerName, verdict });
      }
      await ctx.db.patch("matchSlopState", state._id, {
        postMortem: {
          verdicts,
          parting: clip(output.postMortem.parting, MATCHSLOP_MAX_PARTING_LENGTH),
        },
      });
    },
    async fallback(ctx, game) {
      const state = await loadState(ctx, game._id);
      if (state.postMortem === undefined) {
        await ctx.db.patch("matchSlopState", state._id, { postMortem: null });
      }
    },
  },
};
