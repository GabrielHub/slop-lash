import type { Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { isPromptVotable } from "../src/games/core/votability";
import { getVotableSloplashPrompts } from "./sloplashEngine";
import { matchSlopModeStateValidator } from "./matchslopValidators";

const MAX_PLAYERS = 16;
const MAX_PROMPTS = 16;
const MAX_ASSIGNMENTS = 128;
const MAX_RESPONSES = 128;
const MAX_VOTES = 128;
const MAX_TRANSCRIPT_ENTRIES = 32;
const MAX_ROUNDS = 10;
const MAX_REACTIONS_PER_ROUND = 5_120;

export type CurrentRound = {
  assignments: Doc<"promptAssignments">[];
  prompts: Doc<"prompts">[];
  responses: Doc<"responses">[];
  round: Doc<"rounds">;
  votes: Doc<"votes">[];
};

type MatchSlopModeState = Infer<typeof matchSlopModeStateValidator>;

export function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export async function loadPlayers(ctx: QueryCtx, gameId: Id<"games">): Promise<Doc<"players">[]> {
  return ctx.db
    .query("players")
    .withIndex("by_gameId", (index) => index.eq("gameId", gameId))
    .take(MAX_PLAYERS);
}

export async function loadCurrentRound(
  ctx: QueryCtx,
  game: Doc<"games">,
): Promise<CurrentRound | null> {
  if (game.currentRound <= 0) return null;
  const round = await ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) =>
      index.eq("gameId", game._id).eq("roundNumber", game.currentRound),
    )
    .unique();
  if (!round) return null;

  const [prompts, assignments, responses, votes] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_PROMPTS),
    ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_ASSIGNMENTS),
    ctx.db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_RESPONSES),
    ctx.db
      .query("votes")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", game._id).eq("roundId", round._id),
      )
      .take(MAX_VOTES),
  ]);

  return {
    assignments,
    prompts: prompts.toSorted((left, right) => left.ordinal - right.ordinal),
    responses,
    round,
    votes,
  };
}

export async function loadModeState(
  ctx: QueryCtx,
  game: Doc<"games">,
): Promise<MatchSlopModeState | null> {
  if (game.gameType !== "MATCHSLOP") return null;
  const [state, transcript] = await Promise.all([
    ctx.db
      .query("matchSlopState")
      .withIndex("by_gameId", (index) => index.eq("gameId", game._id))
      .unique(),
    ctx.db
      .query("matchSlopTranscriptEntries")
      .withIndex("by_gameId_and_turn_and_ordinal", (index) => index.eq("gameId", game._id))
      .take(MAX_TRANSCRIPT_ENTRIES),
  ]);
  if (!state) return null;
  return {
    aiVoteWeight: state.aiVoteWeight,
    comebackRound: state.comebackRound ?? null,
    humanVoteWeight: state.humanVoteWeight,
    lastRoundResult: state.lastRoundResult ?? null,
    latestMoodDelta: state.latestMoodDelta ?? null,
    latestNextSignal: state.latestNextSignal ?? null,
    latestSideComment: state.latestSideComment ?? null,
    latestSignalCategory: state.latestSignalCategory ?? null,
    mood: state.mood,
    outcome: state.outcome,
    pendingPersonaReply: state.pendingPersonaReply ?? null,
    personaIdentity: state.personaIdentity,
    personaImage: state.personaImage ?? null,
    postMortem: state.postMortem ?? null,
    postMortemDraft: state.postMortemDraft ?? null,
    postMortemGeneration: state.postMortemGeneration ?? null,
    profile: state.profile ?? null,
    profileDraft: state.profileDraft ?? null,
    profileGeneration: state.profileGeneration ?? null,
    seekerIdentity: state.seekerIdentity,
    selectedPersonaExampleIds: state.selectedPersonaExampleIds,
    selectedPlayerExamples: state.selectedPlayerExamples,
    transcript: transcript.map((entry) => ({
      authorName: entry.authorName ?? null,
      id: entry._id,
      mood: entry.mood ?? null,
      outcome: entry.outcome ?? null,
      selectedPromptId: entry.selectedPromptId ?? null,
      selectedPromptText: entry.selectedPromptText ?? null,
      speaker: entry.speaker,
      text: entry.text,
      turn: entry.turn,
    })),
  };
}

export function mapPublicPlayer(player: Doc<"players">) {
  return {
    humorRating: player.humorRating,
    id: player._id,
    idleRounds: player.idleRounds,
    lastSeen: new Date(player.joinedAt).toISOString(),
    modelId: player.modelId ?? null,
    name: player.name,
    participationStatus: player.participationStatus,
    score: player.score,
    type: player.type,
    winStreak: player.winStreak,
  };
}

async function loadRoundData(ctx: QueryCtx, gameId: Id<"games">, roundId: Id<"rounds">) {
  const [prompts, assignments, responses, votes, reactions] = await Promise.all([
    ctx.db
      .query("prompts")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", roundId),
      )
      .take(MAX_PROMPTS),
    ctx.db
      .query("promptAssignments")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", roundId),
      )
      .take(MAX_ASSIGNMENTS),
    ctx.db
      .query("responses")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", roundId),
      )
      .take(MAX_RESPONSES),
    ctx.db
      .query("votes")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", roundId),
      )
      .take(MAX_VOTES),
    ctx.db
      .query("reactions")
      .withIndex("by_gameId_and_roundId", (index) =>
        index.eq("gameId", gameId).eq("roundId", roundId),
      )
      .take(MAX_REACTIONS_PER_ROUND),
  ]);
  return { assignments, prompts, reactions, responses, votes };
}

function redactWritingPrompts(prompts: MappedPrompt[], viewerPlayerId: Id<"players"> | null): void {
  for (const prompt of prompts) {
    const assignedToViewer =
      viewerPlayerId !== null &&
      prompt.assignments.some((assignment) => assignment.playerId === viewerPlayerId);
    prompt.votes = [];
    if (assignedToViewer) {
      prompt.assignments = prompt.assignments.filter(
        (assignment) => assignment.playerId === viewerPlayerId,
      );
      for (const response of prompt.responses) response.reactions = [];
      continue;
    }
    prompt.assignments = [];
    prompt.responses = [];
    prompt.text = "";
  }
}

function redactResponseAuthors(
  prompt: MappedPrompt,
  viewerPlayerId: Id<"players"> | null,
  preserveViewerIdentity: boolean,
): void {
  for (const response of prompt.responses) {
    if (preserveViewerIdentity && viewerPlayerId !== null && response.playerId === viewerPlayerId) {
      continue;
    }
    response.playerId = "";
    response.player = {
      humorRating: 1,
      id: "",
      idleRounds: 0,
      lastSeen: "",
      modelId: null,
      name: "",
      participationStatus: "ACTIVE",
      type: "HUMAN",
      winStreak: 0,
    };
  }
}

function redactVotingPrompts(
  game: Doc<"games">,
  prompts: Doc<"prompts">[],
  responses: Doc<"responses">[],
  mappedPrompts: MappedPrompt[],
  viewerPlayerId: Id<"players"> | null,
): void {
  const votablePromptIdsInOrder =
    game.gameType === "SLOPLASH"
      ? getVotableSloplashPrompts({ prompts, responses }).map((prompt) => prompt._id)
      : mappedPrompts
          .filter((prompt) => isPromptVotable(game.gameType, prompt.responses))
          .toSorted((left, right) => left.id.localeCompare(right.id))
          .map((prompt) => prompt.id);
  const promptsById = new Map(mappedPrompts.map((prompt) => [prompt.id, prompt]));
  const votablePrompts = votablePromptIdsInOrder.flatMap((promptId) => {
    const prompt = promptsById.get(promptId);
    return prompt ? [prompt] : [];
  });
  const votablePromptIds = new Set(votablePrompts.map((prompt) => prompt.id));

  for (const prompt of mappedPrompts) {
    if (votablePromptIds.has(prompt.id)) continue;
    prompt.assignments = [];
    prompt.responses = [];
    prompt.text = "";
    prompt.votes = [];
  }
  for (let index = 0; index < votablePrompts.length; index += 1) {
    const prompt = votablePrompts[index];
    if (!prompt) continue;
    const currentUnrevealed = index === game.votingPromptIndex && !game.votingRevealing;
    const future = index > game.votingPromptIndex;
    if (!currentUnrevealed && !future) continue;
    redactResponseAuthors(prompt, viewerPlayerId, !future);
    prompt.assignments = [];
    if (future) prompt.text = "";
    prompt.votes = currentUnrevealed
      ? prompt.votes.map((vote) => ({
          ...vote,
          failReason: null,
          id: "",
          responseId: null,
        }))
      : [];
    for (const response of prompt.responses) {
      response.reactions = [];
      if (!future) continue;
      response.failReason = null;
      response.metadata = null;
      response.pointsEarned = 0;
      response.text = "";
    }
  }
}

function mapRoundPrompts(
  game: Doc<"games">,
  round: Doc<"rounds">,
  playersById: Map<Id<"players">, Doc<"players">>,
  viewerPlayerId: Id<"players"> | null,
  data: Awaited<ReturnType<typeof loadRoundData>>,
) {
  const reactionsByResponse = new Map<Id<"responses">, Doc<"reactions">[]>();
  for (const reaction of data.reactions) {
    const grouped = reactionsByResponse.get(reaction.responseId) ?? [];
    grouped.push(reaction);
    reactionsByResponse.set(reaction.responseId, grouped);
  }

  return data.prompts
    .toSorted((left, right) => left.ordinal - right.ordinal)
    .map((prompt) => ({
      assignments: data.assignments
        .filter((assignment) => assignment.promptId === prompt._id)
        .map((assignment) => ({
          playerId: assignment.playerId,
          promptId: assignment.promptId,
        })),
      id: prompt._id,
      responses: data.responses
        .filter(
          (response) =>
            response.promptId === prompt._id &&
            (game.status !== "WRITING" ||
              game.gameType === "AI_CHAT_SHOWDOWN" ||
              game.gameType === "MATCHSLOP" ||
              response.playerId === viewerPlayerId),
        )
        .flatMap((response) => {
          const player = playersById.get(response.playerId);
          if (!player) return [];
          const concealWritingText =
            game.status === "WRITING" && response.playerId !== viewerPlayerId;
          return [
            {
              failReason: concealWritingText ? null : (response.failReason ?? null),
              id: response._id,
              metadata: concealWritingText ? null : (response.metadata ?? null),
              player: {
                humorRating: player.humorRating,
                id: `${player._id}`,
                idleRounds: player.idleRounds,
                lastSeen: new Date(player.joinedAt).toISOString(),
                modelId: player.modelId ?? null,
                name: player.name,
                participationStatus: player.participationStatus,
                type: player.type,
                winStreak: player.winStreak,
              },
              playerId: `${response.playerId}`,
              pointsEarned: response.pointsEarned,
              promptId: response.promptId,
              reactions: (reactionsByResponse.get(response._id) ?? []).map((reaction) => ({
                emoji: reaction.emoji,
                id: reaction._id,
                playerId: reaction.playerId,
                responseId: reaction.responseId,
              })),
              text: concealWritingText ? "" : response.text,
            },
          ];
        }),
      roundId: round._id,
      text: prompt.text,
      votes: data.votes
        .filter((vote) => vote.promptId === prompt._id)
        .flatMap((vote) => {
          const voter = playersById.get(vote.voterId);
          if (!voter) return [];
          return [
            {
              failReason: vote.failReason ?? null,
              id: `${vote._id}`,
              promptId: vote.promptId,
              responseId: vote.responseId ?? null,
              voter: { id: voter._id, type: voter.type },
              voterId: vote.voterId,
            },
          ];
        }),
    }));
}

type MappedPrompt = ReturnType<typeof mapRoundPrompts>[number];

export async function loadStageRounds(
  ctx: QueryCtx,
  game: Doc<"games">,
  players: Doc<"players">[],
  viewerPlayerId: Id<"players"> | null,
) {
  if (
    (game.gameType !== "SLOPLASH" &&
      game.gameType !== "AI_CHAT_SHOWDOWN" &&
      game.gameType !== "MATCHSLOP") ||
    game.status === "LOBBY"
  ) {
    return [];
  }
  const allRounds = await ctx.db
    .query("rounds")
    .withIndex("by_gameId_and_roundNumber", (index) => index.eq("gameId", game._id))
    .take(MAX_ROUNDS);
  const selectedRounds = (
    game.status === "FINAL_RESULTS"
      ? allRounds
      : allRounds.filter((round) => round.roundNumber === game.currentRound)
  ).toSorted((left, right) => left.roundNumber - right.roundNumber);
  const playersById = new Map(players.map((player) => [player._id, player]));

  return Promise.all(
    selectedRounds.map(async (round) => {
      const data = await loadRoundData(ctx, game._id, round._id);
      const mappedPrompts = mapRoundPrompts(game, round, playersById, viewerPlayerId, data);

      if (game.status === "WRITING" && game.gameType === "SLOPLASH") {
        redactWritingPrompts(mappedPrompts, viewerPlayerId);
      }
      if (game.status === "VOTING") {
        redactVotingPrompts(game, data.prompts, data.responses, mappedPrompts, viewerPlayerId);
      }

      return {
        gameId: game._id,
        id: round._id,
        prompts: mappedPrompts,
        roundNumber: round.roundNumber,
      };
    }),
  );
}
