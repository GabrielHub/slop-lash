import { ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import {
  listBoundaryActivePlayerIds,
  listGamePlayers,
  listQuestionsForTopic,
  loadQuizslopTopicForOwner,
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
  TOPIC_REVEAL_SECONDS,
} from "../src/games/quizslop/game-constants";
import { INITIAL_TIER } from "../src/games/quizslop/difficulty";
import { orderHomeTopics, selectFinalSlate, selectWarmUpTopic } from "../src/games/quizslop/deck";
import { QUIZSLOP_TOPIC_CATALOG } from "../src/games/quizslop/config/topic-catalog";
import { QUIZSLOP_TIERS } from "../src/games/quizslop/types";

/** Freezes the roster, topic packs, deck, and initial participant state. */
export async function startQuizslopGame(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  const { game, state } = bundle;
  if (game.status !== "LOBBY" || state.phase !== "LOBBY_SETUP") {
    throw new ConvexError("QuizSlop game already started");
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

  const topicRows = await Promise.all(
    startEligible.map(async (player) => {
      const topic = await loadQuizslopTopicForOwner(ctx, game._id, player._id);
      if (!topic || topic.setupState !== "READY") {
        throw new ConvexError(`${player.name} does not have a confirmed topic yet`);
      }
      const questions = await listQuestionsForTopic(ctx, topic._id);
      const tiers = new Set(questions.map((question) => question.tier));
      if (questions.length !== QUESTIONS_PER_PACK || tiers.size !== QUIZSLOP_TIERS.length) {
        throw new ConvexError(`${player.name}'s topic pack is incomplete`);
      }
      return { player, topic };
    }),
  );

  const claimedKeys = new Set(topicRows.map((entry) => entry.topic.canonicalKey));
  const claimedCatalogIds = new Set(
    topicRows.flatMap((entry) => (entry.topic.catalogTopicId ? [entry.topic.catalogTopicId] : [])),
  );
  const eligibleCatalog = availableCatalogTopics({
    canonicalKeys: claimedKeys,
    catalogTopicIds: claimedCatalogIds,
  });
  if (eligibleCatalog.length < 1 + FINAL_SLATE_SIZE) {
    throw new ConvexError("Not enough reviewed catalog topics remain to build the deck");
  }

  const rankedCatalog = eligibleCatalog.map((topic) => ({
    topicId: topic.id,
    category: topic.category,
    rank: Math.random(),
  }));
  const warmUpRanked = selectWarmUpTopic(rankedCatalog);
  if (!warmUpRanked) throw new ConvexError("Failed to select a warm-up topic");
  const finalistsRanked = selectFinalSlate(
    rankedCatalog.filter((topic) => topic.topicId !== warmUpRanked.topicId),
  );
  if (finalistsRanked.length !== FINAL_SLATE_SIZE) {
    throw new ConvexError("Failed to select the final House Choice slate");
  }

  const catalogById = new Map(QUIZSLOP_TOPIC_CATALOG.map((topic) => [topic.id, topic]));
  const warmUpCatalog = catalogById.get(warmUpRanked.topicId);
  if (!warmUpCatalog) throw new ConvexError("Warm-up topic disappeared from the catalog");
  const displayOrder = finalistsRanked
    .map((topic) => ({ topic, order: Math.random() }))
    .toSorted(
      (left, right) =>
        left.order - right.order || left.topic.topicId.localeCompare(right.topic.topicId),
    );
  const finalistCatalog = displayOrder.map((entry) => {
    const catalogTopic = catalogById.get(entry.topic.topicId);
    if (!catalogTopic) throw new ConvexError("Finalist topic disappeared from the catalog");
    return { catalogTopic, ranked: entry.topic };
  });
  const [warmUpTopicId, finalistTopicIds] = await Promise.all([
    materializeCatalogTopic(ctx, game._id, warmUpCatalog, {
      deckRole: "WARM_UP",
      setupState: "READY",
      selectionRank: warmUpRanked.rank,
      now,
    }),
    Promise.all(
      finalistCatalog.map(({ catalogTopic, ranked }, index) =>
        materializeCatalogTopic(ctx, game._id, catalogTopic, {
          deckRole: "FINALIST",
          setupState: "READY",
          selectionRank: ranked.rank,
          tieBreakRank: Math.random(),
          slateDisplayOrder: index,
          now,
        }),
      ),
    ),
  ]);

  const homeRanked = topicRows.map((entry) => ({
    topicId: entry.topic._id,
    category: entry.topic.category,
    rank: Math.random(),
  }));
  const orderedHome = orderHomeTopics(homeRanked);
  const homeByTopicId = new Map(topicRows.map((entry) => [entry.topic._id, entry]));
  const orderedHomeRows = orderedHome.map((ranked, index) => {
    const entry = homeByTopicId.get(ranked.topicId);
    if (!entry) throw new ConvexError("Home topic ordering lost a topic");
    return { deckOrdinal: index + 1, entry, rank: ranked.rank };
  });

  const totalRounds = startEligible.length + EXTRA_ROUNDS_BEYOND_HOME_TURF;
  await Promise.all([
    ctx.db.patch("quizSlopTopics", warmUpTopicId, { deckOrdinal: 0, updatedAt: now }),
    ctx.db.insert("quizSlopRounds", {
      gameId: game._id,
      deckOrdinal: 0,
      kind: "WARM_UP",
      topicId: warmUpTopicId,
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
    deadlineSeconds: TOPIC_REVEAL_SECONDS,
    deckPosition: 0,
    currentRound: 1,
    roundKind: "WARM_UP",
  });
}
