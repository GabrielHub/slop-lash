import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  listBoundaryActivePlayerIds,
  listGamePlayers,
  listQuestionsForTopic,
  listQuizslopTopics,
} from "./quizslopData";
import { materializeCatalogTopic } from "./quizslopMaterialization";
import { transitionQuizslopPhase, type QuizslopEngineBundle } from "./quizslopLifecycle";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { availableCatalogTopics } from "../src/games/quizslop/catalog";
import {
  CALL_SLOP_TOKENS_PER_GAME,
  EXTRA_ROUNDS_BEYOND_HOME_TURF,
  FINAL_QUIZ_CORRECT_POINTS,
  FINAL_SLATE_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  QUESTIONS_PER_PACK,
  QUIZ_CORRECT_POINTS,
} from "../src/games/quizslop/game-constants";
import { INITIAL_TIER } from "../src/games/quizslop/difficulty";
import { orderHomeTopics, selectFinalSlate, selectWarmUpTopic } from "../src/games/quizslop/deck";
import { QUIZSLOP_TIERS } from "../src/games/quizslop/types";

const PLAYABLE_PACK_STATUSES = new Set(["CATALOG_READY", "READY", "FALLBACK"]);

async function requireCompletePack(ctx: MutationCtx, topic: Doc<"quizSlopTopics">): Promise<void> {
  const questions = await listQuestionsForTopic(ctx, topic._id);
  const tiers = new Set(questions.map((question) => question.tier));
  if (
    questions.length !== QUESTIONS_PER_PACK ||
    tiers.size !== QUIZSLOP_TIERS.length ||
    QUIZSLOP_TIERS.some((tier) => !tiers.has(tier))
  ) {
    throw new ConvexError(`${topic.label}'s question pack is incomplete`);
  }
}

async function ensureEnoughFrozenTopics(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  required: number,
  now: number,
): Promise<Doc<"quizSlopTopics">[]> {
  let topics = await listQuizslopTopics(ctx, bundle.game._id);
  if (topics.length >= required) return topics;
  if (bundle.state.contentSource !== "CATALOG") {
    throw new ConvexError("The frozen QuizSlop pack does not contain enough topic banks");
  }

  const existingKeys = new Set(topics.map((topic) => topic.canonicalKey));
  const existingCatalogIds = new Set(
    topics.flatMap((topic) => (topic.catalogTopicId ? [topic.catalogTopicId] : [])),
  );
  const candidates = availableCatalogTopics({
    canonicalKeys: existingKeys,
    catalogTopicIds: existingCatalogIds,
  });
  const needed = required - topics.length;
  if (candidates.length < needed) {
    throw new ConvexError("Not enough reviewed catalog topics remain to build the deck");
  }
  await Promise.all(
    candidates.slice(0, needed).map((topic) =>
      materializeCatalogTopic(ctx, bundle.game._id, topic, {
        setupState: "READY",
        now,
      }),
    ),
  );
  topics = await listQuizslopTopics(ctx, bundle.game._id);
  return topics;
}

async function freezeTopicRoles(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  players: readonly Doc<"players">[],
  now: number,
) {
  const playerIds = new Set(players.map((player) => player._id));
  const existingTopics = await listQuizslopTopics(ctx, bundle.game._id);
  const unavailableOwnedTopics = existingTopics.filter(
    (topic) => topic.ownerPlayerId !== undefined && !playerIds.has(topic.ownerPlayerId),
  ).length;
  const requiredTopics = players.length + 1 + FINAL_SLATE_SIZE + unavailableOwnedTopics;
  const topics = await ensureEnoughFrozenTopics(ctx, bundle, requiredTopics, now);
  if (new Set(topics.map((topic) => topic.canonicalKey)).size !== topics.length) {
    throw new ConvexError("The frozen QuizSlop pack contains duplicate topics");
  }
  await Promise.all(topics.map((topic) => requireCompletePack(ctx, topic)));

  const ownedTopics = topics.filter((topic) => topic.ownerPlayerId !== undefined);
  const claimedByPlayer = new Map(
    ownedTopics.map((topic) => [topic.ownerPlayerId!, topic] as const),
  );
  if (claimedByPlayer.size !== ownedTopics.length) {
    throw new ConvexError("A player has more than one confirmed Home Topic");
  }

  const homeRows: Array<{ player: Doc<"players">; topic: Doc<"quizSlopTopics"> }> = [];
  for (const player of players) {
    const topic = claimedByPlayer.get(player._id);
    if (!topic || topic.setupState !== "READY") {
      throw new ConvexError(`${player.name} does not have a confirmed topic yet`);
    }
    homeRows.push({ player, topic });
  }

  const homeIds = new Set(homeRows.map((entry) => entry.topic._id));
  const deckCandidates = topics.filter(
    (topic) => !homeIds.has(topic._id) && topic.ownerPlayerId === undefined,
  );
  const ranked = deckCandidates.map((topic) => ({
    topicId: topic._id,
    category: topic.category,
    rank: Math.random(),
  }));
  const warmUp = selectWarmUpTopic(ranked);
  if (!warmUp) throw new ConvexError("Failed to select a warm-up topic");
  const finalists = selectFinalSlate(ranked.filter((topic) => topic.topicId !== warmUp.topicId));
  if (finalists.length !== FINAL_SLATE_SIZE) {
    throw new ConvexError("Failed to select the final House Choice slate");
  }

  const topicById = new Map(topics.map((topic) => [topic._id, topic]));
  const warmUpTopic = topicById.get(warmUp.topicId);
  if (!warmUpTopic) throw new ConvexError("Warm-up topic disappeared from the frozen pack");
  const finalistRows = finalists
    .map((entry) => {
      const topic = topicById.get(entry.topicId);
      if (!topic) throw new ConvexError("Finalist topic disappeared from the frozen pack");
      return { entry, topic, displayRank: Math.random() };
    })
    .toSorted(
      (left, right) =>
        left.displayRank - right.displayRank || left.topic._id.localeCompare(right.topic._id),
    );

  await Promise.all([
    ctx.db.patch("quizSlopTopics", warmUpTopic._id, {
      deckRole: "WARM_UP",
      deckOrdinal: 0,
      selectionRank: warmUp.rank,
      updatedAt: now,
    }),
    ...finalistRows.map(({ entry, topic }, index) =>
      ctx.db.patch("quizSlopTopics", topic._id, {
        deckRole: "FINALIST",
        selectionRank: entry.rank,
        tieBreakRank: Math.random(),
        slateDisplayOrder: index,
        updatedAt: now,
      }),
    ),
  ]);

  return {
    homeRows,
    warmUpTopic,
    finalistTopicIds: finalistRows.map(({ topic }) => topic._id),
  };
}

/** Freezes the roster, fresh pack, deck, and initial participant state. */
export async function startQuizslopGame(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const { game, state } = bundle;
  if (game.status !== "LOBBY" || state.phase !== "LOBBY_SETUP") {
    throw new ConvexError("QuizSlop game already started");
  }
  if (!PLAYABLE_PACK_STATUSES.has(state.packStatus)) {
    throw new ConvexError("The QuizSlop question pack is not ready");
  }

  const [players, boundaryActive] = await Promise.all([
    listGamePlayers(ctx, game._id),
    listBoundaryActivePlayerIds(ctx, game._id),
  ]);
  const startEligible = players
    .filter(isActiveCompetitor)
    .filter((player) => player.type === "HUMAN" && boundaryActive.has(player._id))
    .toSorted((left, right) => left.joinedAt - right.joinedAt || left._id.localeCompare(right._id));
  if (startEligible.length < MIN_PLAYERS || startEligible.length > MAX_PLAYERS) {
    throw new ConvexError(
      `QuizSlop needs ${MIN_PLAYERS}-${MAX_PLAYERS} connected players to start`,
    );
  }

  const { homeRows, warmUpTopic, finalistTopicIds } = await freezeTopicRoles(
    ctx,
    bundle,
    startEligible,
    now,
  );
  const homeRanked = homeRows.map((entry) => ({
    topicId: entry.topic._id,
    category: entry.topic.category,
    rank: Math.random(),
  }));
  const orderedHome = orderHomeTopics(homeRanked);
  const homeByTopicId = new Map(homeRows.map((entry) => [entry.topic._id, entry]));
  const orderedHomeRows = orderedHome.map((ranked, index) => {
    const entry = homeByTopicId.get(ranked.topicId);
    if (!entry) throw new ConvexError("Home topic ordering lost a topic");
    return { deckOrdinal: index + 1, entry, rank: ranked.rank };
  });

  const totalRounds = startEligible.length + EXTRA_ROUNDS_BEYOND_HOME_TURF;
  await Promise.all([
    ctx.db.insert("quizSlopRounds", {
      gameId: game._id,
      deckOrdinal: 0,
      kind: "WARM_UP",
      topicId: warmUpTopic._id,
      pointValue: QUIZ_CORRECT_POINTS,
    }),
    ...orderedHomeRows.map(async ({ deckOrdinal, entry, rank }) => {
      await Promise.all([
        ctx.db.patch("quizSlopTopics", entry.topic._id, {
          deckRole: "HOME_TURF",
          deckOrdinal,
          selectionRank: rank,
          updatedAt: now,
        }),
        ctx.db.insert("quizSlopRounds", {
          gameId: game._id,
          deckOrdinal,
          kind: "HOME_TURF",
          topicId: entry.topic._id,
          pointValue: QUIZ_CORRECT_POINTS,
        }),
      ]);
    }),
    ctx.db.insert("quizSlopRounds", {
      gameId: game._id,
      deckOrdinal: totalRounds - 1,
      kind: "HOUSE_CHOICE",
      pointValue: FINAL_QUIZ_CORRECT_POINTS,
      finalistTopicIds,
    }),
    ...startEligible.map(async (player, seatOrder) => {
      await Promise.all([
        ctx.db.insert("quizSlopParticipants", {
          gameId: game._id,
          playerId: player._id,
          seatOrder,
          hiddenTier: INITIAL_TIER,
          callTokens: CALL_SLOP_TOKENS_PER_GAME,
          disputeAvailable: true,
          quizSubtotal: 0,
          callSubtotal: 0,
          total: 0,
          correctAnswers: 0,
          successfulCalls: 0,
          incorrectCalls: 0,
        }),
        ...(player.score !== 0 ? [ctx.db.patch("players", player._id, { score: 0 })] : []),
      ]);
    }),
  ]);

  const gamePatch = { totalRounds, playerCount: startEligible.length };
  await ctx.db.patch("games", game._id, gamePatch);
  bundle.game = { ...game, ...gamePatch };
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "TOPIC_REVEAL",
    now,
    // The opening explanation is always host-paced so every room sees the
    // rules before the first timed action. Later topic reveals use the normal
    // readable timer in quizslopGameplay.
    deadlineSeconds: null,
    deckPosition: 0,
    currentRound: 1,
    roundKind: "WARM_UP",
  });
}
