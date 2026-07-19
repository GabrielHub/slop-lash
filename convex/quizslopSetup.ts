import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  listBoundaryActivePlayerIds,
  listGamePlayers,
  listQuestionsForTopic,
  listQuizslopParticipants,
  listQuizslopTopics,
  loadQuizslopRoundBySection,
} from "./quizslopData";
import { assertFrozenQuestionIntegrity } from "./quizslopIntegrity";
import { transitionQuizslopPhase, type QuizslopEngineBundle } from "./quizslopLifecycle";
import { materializeCatalogTopic } from "./quizslopMaterialization";
import { isActiveCompetitor } from "../src/games/core/game-rules";
import { proxySeatForCandidate, topicIndexForAssignment } from "../src/games/quizslop/cooperative";
import { QUIZSLOP_TOPIC_CATALOG } from "../src/games/quizslop/config/topic-catalog";
import { INITIAL_TIER } from "../src/games/quizslop/difficulty";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  proctorReviewAfterSection,
  SECTION_INTRO_SECONDS,
  sectionsForPlayerCount,
} from "../src/games/quizslop/game-constants";
import { QUIZSLOP_TIERS } from "../src/games/quizslop/types";

const PLAYABLE_PACK_STATUSES = new Set(["CATALOG_READY", "READY", "FALLBACK"]);

function randomSeat(count: number): number {
  // Convex seeds Math.random inside mutations so retries stay deterministic.
  return Math.floor(Math.random() * count);
}

function catalogTopicsForPlay() {
  return QUIZSLOP_TOPIC_CATALOG.filter(
    (topic) => !topic.retired && topic.review.approved && topic.review.factualState === "APPROVED",
  );
}

async function ensureCatalogPack(ctx: MutationCtx, bundle: QuizslopEngineBundle): Promise<void> {
  const existing = await listQuizslopTopics(ctx, bundle.game._id);
  if (existing.length > 0) return;
  const catalog = catalogTopicsForPlay();
  if (catalog.length < MIN_PLAYERS) {
    throw new ConvexError("The reviewed QuizSlop catalog is not large enough to start");
  }
  await Promise.all(catalog.map((topic) => materializeCatalogTopic(ctx, bundle.game._id, topic)));
}

async function validateFrozenPack(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  requiredTopicCount: number,
): Promise<Doc<"quizSlopTopics">[]> {
  const topics = await listQuizslopTopics(ctx, bundle.game._id);
  if (topics.length < requiredTopicCount) {
    throw new ConvexError(
      `The frozen question pack needs ${requiredTopicCount} unique topics for this exam`,
    );
  }
  if (new Set(topics.map((topic) => topic.canonicalKey)).size !== topics.length) {
    throw new ConvexError("The frozen question pack contains duplicate topics");
  }
  await Promise.all(
    topics.map(async (topic) => {
      const questions = await listQuestionsForTopic(ctx, topic._id);
      const tiers = new Set(questions.map((question) => question.tier));
      if (
        questions.length !== QUIZSLOP_TIERS.length ||
        tiers.size !== QUIZSLOP_TIERS.length ||
        QUIZSLOP_TIERS.some((tier) => !tiers.has(tier))
      ) {
        throw new ConvexError(`${topic.label} must have exactly one question per difficulty tier`);
      }
      await Promise.all(
        questions.map((question) =>
          assertFrozenQuestionIntegrity(ctx, {
            gameId: bundle.game._id,
            topicId: topic._id,
            question,
          }),
        ),
      );
    }),
  );
  return topics.toSorted(
    (left, right) => left.label.localeCompare(right.label) || left._id.localeCompare(right._id),
  );
}

/** Materializes one section after the previous scratch results have updated tiers. */
export async function materializeSectionAssignments(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  sectionIndex: number,
  now: number,
): Promise<void> {
  const round = await loadQuizslopRoundBySection(ctx, bundle.game._id, sectionIndex);
  if (!round) throw new ConvexError("QuizSlop section is missing");
  if (round.assignmentsMaterializedAt !== undefined) return;
  const [participants, topics] = await Promise.all([
    listQuizslopParticipants(ctx, bundle.game._id),
    listQuizslopTopics(ctx, bundle.game._id),
  ]);
  const readyTopics = topics.toSorted(
    (left, right) => left.label.localeCompare(right.label) || left._id.localeCompare(right._id),
  );
  const roster = participants.toSorted((left, right) => left.seatOrder - right.seatOrder);
  if (roster.some((participant, seatOrder) => participant.seatOrder !== seatOrder)) {
    throw new ConvexError("The frozen QuizSlop roster has invalid seat ordering");
  }
  if (readyTopics.length < roster.length) {
    throw new ConvexError("Not enough frozen topics remain for unique section assignments");
  }

  const assignmentSpecs = await Promise.all(
    roster.map(async (candidate) => {
      const topic =
        readyTopics[
          topicIndexForAssignment(
            sectionIndex,
            candidate.seatOrder,
            roster.length,
            readyTopics.length,
          )
        ];
      if (!topic) throw new ConvexError("Topic rotation failed");
      const tierQuestions = (await listQuestionsForTopic(ctx, topic._id)).filter(
        (question) => question.tier === candidate.hiddenTier,
      );
      const question =
        tierQuestions[(sectionIndex + candidate.seatOrder) % Math.max(1, tierQuestions.length)];
      if (!question)
        throw new ConvexError(`${topic.label} has no ${candidate.hiddenTier} question`);
      const proxySeat = proxySeatForCandidate(candidate.seatOrder, sectionIndex, roster.length);
      const proxy = roster[proxySeat];
      if (!proxy) throw new ConvexError("Proxy rotation failed");
      const groupOwnsAnswer =
        bundle.state.suspensionAppliedSection === sectionIndex &&
        bundle.state.suspendedPlayerId === proxy.playerId;
      return { candidate, groupOwnsAnswer, proxy, question, topic };
    }),
  );
  await Promise.all(
    assignmentSpecs.map(({ candidate, groupOwnsAnswer, proxy, question, topic }) =>
      ctx.db.insert("quizSlopAssignments", {
        gameId: bundle.game._id,
        roundId: round._id,
        candidatePlayerId: candidate.playerId,
        proxyPlayerId: proxy.playerId,
        answerAuthority: groupOwnsAnswer ? "GROUP" : "PROXY",
        topicId: topic._id,
        questionId: question._id,
        tierAtAssignment: candidate.hiddenTier,
      }),
    ),
  );
  await ctx.db.patch("quizSlopRounds", round._id, { assignmentsMaterializedAt: now });
}

/** Freezes the roster, permanent role, content pack, sections, and first assignments. */
export async function startQuizslopGame(
  ctx: MutationCtx,
  bundle: QuizslopEngineBundle,
  now: number,
): Promise<void> {
  if (bundle.game.status !== "LOBBY" || bundle.state.phase !== "LOBBY_SETUP") {
    throw new ConvexError("QuizSlop game already started");
  }
  if (!PLAYABLE_PACK_STATUSES.has(bundle.state.packStatus)) {
    throw new ConvexError("The QuizSlop question pack is not ready");
  }
  const [players, boundaryActive] = await Promise.all([
    listGamePlayers(ctx, bundle.game._id),
    listBoundaryActivePlayerIds(ctx, bundle.game._id),
  ]);
  const eligible = players
    .filter(isActiveCompetitor)
    .filter((player) => player.type === "HUMAN" && boundaryActive.has(player._id))
    .toSorted((left, right) => left.joinedAt - right.joinedAt || left._id.localeCompare(right._id));
  if (eligible.length < MIN_PLAYERS || eligible.length > MAX_PLAYERS) {
    throw new ConvexError(
      `QuizSlop needs ${MIN_PLAYERS}-${MAX_PLAYERS} connected players to start`,
    );
  }

  if (bundle.state.contentSource === "CATALOG" || bundle.state.packStatus === "FALLBACK") {
    await ensureCatalogPack(ctx, bundle);
  }
  const sectionCount = sectionsForPlayerCount(eligible.length);
  await validateFrozenPack(ctx, bundle, eligible.length * sectionCount);
  const saboteurSeat = randomSeat(eligible.length);
  await Promise.all([
    ...eligible.map(async (player, seatOrder) => {
      await Promise.all([
        ctx.db.insert("quizSlopParticipants", {
          gameId: bundle.game._id,
          playerId: player._id,
          seatOrder,
          role: seatOrder === saboteurSeat ? "SABOTEUR" : "CREW",
          hiddenTier: INITIAL_TIER,
        }),
        player.score === 0 ? Promise.resolve() : ctx.db.patch("players", player._id, { score: 0 }),
      ]);
    }),
    ...Array.from({ length: sectionCount }, (_, sectionIndex) =>
      ctx.db.insert("quizSlopRounds", { gameId: bundle.game._id, sectionIndex }),
    ),
  ]);

  const statePatch = {
    sectionCount,
    reviewAfterSection: proctorReviewAfterSection(sectionCount),
    rawCorrect: 0,
    attempted: 0,
    sabotagePoints: 0,
  };
  const gamePatch = { totalRounds: sectionCount, playerCount: eligible.length };
  await Promise.all([
    ctx.db.patch("quizSlopState", bundle.state._id, statePatch),
    ctx.db.patch("games", bundle.game._id, gamePatch),
  ]);
  bundle.state = { ...bundle.state, ...statePatch };
  bundle.game = { ...bundle.game, ...gamePatch };
  await materializeSectionAssignments(ctx, bundle, 0, now);
  await transitionQuizslopPhase(ctx, bundle, {
    phase: "SECTION_INTRO",
    now,
    deadlineSeconds: SECTION_INTRO_SECONDS,
    deckPosition: 0,
    currentRound: 1,
  });
}
