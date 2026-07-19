import type {
  QuizslopExamAssignment,
  QuizslopExamControllerView,
  QuizslopExamFinal,
  QuizslopExamPhase,
  QuizslopExamPlayer,
  QuizslopExamPublicAssignment,
  QuizslopExamReceipt,
  QuizslopExamScore,
  QuizslopExamStageView,
} from "@/games/quizslop/ui/quizslop-exam-contracts";

export const QUIZSLOP_EXAM_PLAYER_KEYS = ["P1", "P2", "P3", "P4"] as const;
export type QuizslopExamPlayerKey = (typeof QUIZSLOP_EXAM_PLAYER_KEYS)[number];

export interface QuizslopExamFixtureBeat {
  slug: string;
  title: string;
  description: string;
  stage: QuizslopExamStageView;
  controllers: Record<QuizslopExamPlayerKey, QuizslopExamControllerView>;
}

const SERVER_NOW = "2026-07-18T19:00:00.000Z";
const PLAYERS: Record<QuizslopExamPlayerKey, QuizslopExamPlayer> = {
  P1: { playerId: "p1", name: "Mara", seatOrder: 0, connected: true },
  P2: { playerId: "p2", name: "Dev", seatOrder: 1, connected: true },
  P3: { playerId: "p3", name: "Inez", seatOrder: 2, connected: true },
  P4: { playerId: "p4", name: "Graham", seatOrder: 3, connected: true },
};
const ROSTER = QUIZSLOP_EXAM_PLAYER_KEYS.map((key) => PLAYERS[key]);

const QUESTIONS = {
  cocktails: {
    topic: "Cocktails",
    prompt:
      "Which cocktail traditionally combines gin, lemon juice, sugar, and carbonated water—essentially lemonade with a tiny waistcoat?",
    choices: ["Tom Collins", "Manhattan", "Negroni", "Sazerac"],
    correctIndex: 0,
    explanation:
      "A Tom Collins is built with gin, lemon juice, sugar, and carbonated water. The waistcoat remains optional and difficult to launder.",
  },
  elevators: {
    topic: "Elevators",
    prompt:
      "In elevator terminology, what is the enclosed compartment that carries passengers called?",
    choices: ["The car", "The hoistway", "The machine room", "The vertical lobby"],
    correctIndex: 0,
    explanation:
      "The passenger compartment is the car; the hoistway is the shaft it travels through. ‘Vertical lobby’ was rejected by engineers and luxury developers alike.",
  },
  marsupials: {
    topic: "Marsupials",
    prompt:
      "Which marsupial produces cube-shaped droppings, proving geometry can become everybody’s problem?",
    choices: ["Wombat", "Quokka", "Sugar glider", "Tasmanian devil"],
    correctIndex: 0,
    explanation:
      "Wombats produce cube-shaped feces because of the varying elasticity and contractions in their intestines. Euclid declined comment.",
  },
  fermented: {
    topic: "Fermented Foods",
    prompt:
      "Tempeh is traditionally made by fermenting which legume into a firm cake that looks aggressively organized?",
    choices: ["Soybeans", "Chickpeas", "Lentils", "Peanuts"],
    correctIndex: 0,
    explanation:
      "Traditional tempeh is fermented soybeans bound by fungal mycelium. It is one of the few cakes that does not improve a birthday party.",
  },
  forklifts: {
    topic: "Forklift Certification",
    prompt:
      "A loaded forklift should generally travel with its forks in which position on level ground?",
    choices: [
      "Low, just above the floor",
      "At shoulder height",
      "Fully raised for visibility",
      "Dragging lightly for sparks",
    ],
    correctIndex: 0,
    explanation:
      "Loaded forks are kept low—just high enough to clear the floor—to improve stability and visibility. Sparks are not a certification pathway.",
  },
  pigeons: {
    topic: "Pigeons in War and Sport",
    prompt: "What navigational ability made homing pigeons useful military messengers?",
    choices: [
      "Returning to their home loft",
      "Reading magnetic street signs",
      "Recognizing military rank",
      "Filing tiny flight plans",
    ],
    correctIndex: 0,
    explanation:
      "Homing pigeons can return to their home loft over long distances. Their paperwork compliance remains classified.",
  },
  horology: {
    topic: "Horology",
    prompt: "In a mechanical watch, what component oscillates to regulate timekeeping?",
    choices: ["Balance wheel", "Crown", "Mainspring barrel", "Minute hand"],
    correctIndex: 0,
    explanation:
      "The balance wheel oscillates with the hairspring to regulate the movement. The minute hand mostly points and accepts credit.",
  },
  corporate: {
    topic: "Corporate Jargon",
    prompt: "In project management, what does ‘scope creep’ describe?",
    choices: [
      "Uncontrolled expansion of requirements",
      "A coworker near the printer",
      "Planned budget reduction",
      "A very slow rebrand",
    ],
    correctIndex: 0,
    explanation:
      "Scope creep is the uncontrolled expansion of project requirements. It often arrives disguised as one tiny follow-up.",
  },
} as const;

type QuestionKey = keyof typeof QUESTIONS;

function assignment(
  id: string,
  questionNumber: number,
  candidateKey: QuizslopExamPlayerKey,
  proxyKey: QuizslopExamPlayerKey | null,
  questionKey: QuestionKey,
  options: Partial<QuizslopExamAssignment> = {},
): QuizslopExamAssignment {
  const question = QUESTIONS[questionKey];
  const candidate = PLAYERS[candidateKey];
  const proxy = proxyKey ? PLAYERS[proxyKey] : null;
  return {
    id,
    candidate: { playerId: candidate.playerId, name: candidate.name },
    proxy: proxy ? { playerId: proxy.playerId, name: proxy.name } : null,
    topicLabel: question.topic,
    questionNumber,
    proxyMode: proxyKey ? "PLAYER" : "GROUP_VOTE",
    suspendedProxyName: proxyKey ? null : PLAYERS.P4.name,
    prompt: question.prompt,
    choices: [...question.choices],
    scratchIndex: null,
    scratchLocked: false,
    officialIndex: null,
    officialLocked: false,
    groupVoteIndex: null,
    groupVoteLocked: false,
    ...options,
  };
}

function publicAssignment(value: QuizslopExamAssignment): QuizslopExamPublicAssignment {
  return {
    id: value.id,
    candidate: value.candidate,
    proxy: value.proxy,
    topicLabel: value.topicLabel,
    questionNumber: value.questionNumber,
    proxyMode: value.proxyMode,
    suspendedProxyName: value.suspendedProxyName,
    scratchLocked: value.scratchLocked,
    officialLocked: value.officialLocked,
  };
}

function receipt(
  value: QuizslopExamAssignment,
  questionKey: QuestionKey,
  officialIndex: number,
  options: Partial<QuizslopExamReceipt> = {},
): QuizslopExamReceipt {
  const question = QUESTIONS[questionKey];
  const scratchIndex = value.scratchIndex ?? 0;
  return {
    assignmentId: value.id,
    candidateName: value.candidate.name,
    proxyName: value.proxy?.name ?? null,
    topicLabel: value.topicLabel,
    prompt: question.prompt,
    choices: [...question.choices],
    scratchIndex,
    officialIndex,
    correctIndex: question.correctIndex,
    officialCorrect: officialIndex === question.correctIndex,
    scratchCorrect: scratchIndex === question.correctIndex,
    changedCorrectToWrong: false,
    explanation: question.explanation,
    defenses: [],
    ...options,
  };
}

const SECTION_ONE = [
  assignment("s1-a1", 1, "P1", "P2", "cocktails"),
  assignment("s1-a2", 2, "P2", "P3", "elevators"),
  assignment("s1-a3", 3, "P3", "P4", "marsupials"),
  assignment("s1-a4", 4, "P4", "P1", "fermented"),
];

const SECTION_THREE = [
  assignment("s3-a1", 9, "P1", "P2", "forklifts", { scratchIndex: 0, scratchLocked: true }),
  assignment("s3-a2", 10, "P2", "P3", "pigeons", { scratchIndex: 0, scratchLocked: true }),
  assignment("s3-a3", 11, "P3", null, "horology", { scratchIndex: 0, scratchLocked: true }),
  assignment("s3-a4", 12, "P4", "P1", "corporate", { scratchIndex: 0, scratchLocked: true }),
];

const SECTION_ONE_RECEIPTS = [
  receipt({ ...SECTION_ONE[0]!, scratchIndex: 0 }, "cocktails", 0),
  receipt({ ...SECTION_ONE[1]!, scratchIndex: 0 }, "elevators", 0),
  receipt({ ...SECTION_ONE[2]!, scratchIndex: 0 }, "marsupials", 2, {
    changedCorrectToWrong: true,
  }),
  receipt({ ...SECTION_ONE[3]!, scratchIndex: 0 }, "fermented", 0),
];

const SECTION_THREE_RECEIPTS = [
  receipt({ ...SECTION_THREE[2]!, groupVoteIndex: 0 }, "horology", 0, {
    proxyName: null,
  }),
];

const EMPTY_SCORE: QuizslopExamScore = {
  rawCorrect: 0,
  totalQuestions: 0,
  passingScorePercent: 70,
  integrityAdjustmentSealed: true,
};
const SECTION_ONE_SCORE: QuizslopExamScore = {
  rawCorrect: 3,
  totalQuestions: 4,
  passingScorePercent: 70,
  integrityAdjustmentSealed: true,
};
const MID_SCORE: QuizslopExamScore = {
  rawCorrect: 7,
  totalQuestions: 8,
  passingScorePercent: 70,
  integrityAdjustmentSealed: true,
};
const LATE_SCORE: QuizslopExamScore = {
  rawCorrect: 10,
  totalQuestions: 12,
  passingScorePercent: 70,
  integrityAdjustmentSealed: true,
};

const FINAL: QuizslopExamFinal = {
  passed: true,
  saboteurName: PLAYERS.P4.name,
  identified: true,
  rawCorrect: 16,
  totalQuestions: 20,
  sabotagePoints: 3,
  deductionsRemoved: true,
  adjustedCorrect: 16,
  passingScorePercent: 70,
};

interface BeatOptions {
  phase: QuizslopExamPhase;
  sectionNumber?: number;
  assignments?: QuizslopExamAssignment[];
  score?: QuizslopExamScore;
  receipts?: QuizslopExamReceipt[];
  progress?: { locked: number; total: number } | null;
  suspended?: boolean;
  final?: QuizslopExamFinal | null;
  proctorVotes?: number;
  hearingVotes?: number;
}

function makeViews(options: BeatOptions): Pick<QuizslopExamFixtureBeat, "stage" | "controllers"> {
  const assignments = options.assignments ?? [];
  const score = options.score ?? EMPTY_SCORE;
  const suspended = options.suspended ?? false;
  const roster = ROSTER;
  const common = {
    roomCode: "SLOP",
    phase: options.phase,
    version: 40 + (options.sectionNumber ?? 0),
    sectionNumber: options.sectionNumber ?? 0,
    totalSections: options.phase === "LOBBY_SETUP" ? 0 : 5,
    phaseDeadline: null,
    serverNow: SERVER_NOW,
    timersDisabled: true,
    score,
    roster,
    sectionTopicLabels: assignments.map((value) => value.topicLabel),
    suspension: suspended ? { playerId: PLAYERS.P4.playerId, name: PLAYERS.P4.name } : null,
    receipts: options.receipts ?? [],
    final: options.final ?? null,
  };
  const lobby =
    options.phase === "LOBBY_SETUP"
      ? {
          canStart: true,
          content: {
            source: "AI" as const,
            generatorModelName: "Gemini 3.1 Flash Lite",
            packStatus: "READY" as const,
          },
        }
      : null;
  const stage: QuizslopExamStageView = {
    ...common,
    me: { isHost: true, playerId: PLAYERS.P1.playerId },
    lobby,
    assignments: assignments.map(publicAssignment),
    assignmentProgress: options.progress ?? null,
    proctorReview:
      options.phase === "PROCTOR_REVIEW_VOTE" || options.phase === "PROCTOR_REVIEW_RESULT"
        ? {
            suspendedPlayerName: suspended ? PLAYERS.P4.name : null,
            votesCast: options.proctorVotes ?? 0,
            votersTotal: ROSTER.length,
          }
        : null,
    hearing:
      options.phase === "FINAL_ACCUSATION"
        ? { votesCast: options.hearingVotes ?? 0, votersTotal: ROSTER.length }
        : null,
  };

  function controllerFor(key: QuizslopExamPlayerKey): QuizslopExamControllerView {
    const player = PLAYERS[key];
    const ownScratch =
      assignments.find((value) => value.candidate.playerId === player.playerId) ?? null;
    const ownProxy = assignments.find((value) => value.proxy?.playerId === player.playerId) ?? null;
    const groupAssignment = assignments.find((value) => value.proxyMode === "GROUP_VOTE") ?? null;
    return {
      ...common,
      me: {
        isHost: key === "P1",
        playerId: player.playerId,
        name: player.name,
      },
      lobby,
      role: options.phase === "LOBBY_SETUP" ? null : { kind: key === "P4" ? "SABOTEUR" : "CREW" },
      candidateAssignment:
        (options.phase === "SCRATCH" || options.phase === "PROXY_ANSWER") && ownScratch
          ? ownScratch
          : null,
      proxyAssignment:
        options.phase === "PROXY_ANSWER" && ownProxy
          ? { ...ownProxy, officialIndex: key === "P4" ? 2 : 0 }
          : null,
      groupVoteAssignment:
        options.phase === "PROXY_ANSWER" &&
        groupAssignment &&
        !(suspended && player.playerId === PLAYERS.P4.playerId)
          ? { ...groupAssignment, groupVoteIndex: key === "P4" ? 1 : 0, groupVoteLocked: false }
          : null,
      defenses:
        options.phase === "ORAL_DEFENSE" && (key === "P3" || key === "P4")
          ? [
              {
                assignmentId: SECTION_ONE[2]!.id,
                kind: key === "P3" ? "CANDIDATE" : "PROXY",
                candidateName: PLAYERS.P3.name,
                proxyName: PLAYERS.P4.name,
                prompt: QUESTIONS.marsupials.prompt,
                submittedText: null,
                locked: false,
              },
            ]
          : [],
      proctorReview:
        options.phase === "PROCTOR_REVIEW_VOTE" || options.phase === "PROCTOR_REVIEW_RESULT"
          ? {
              eligibleTargets: ROSTER.filter((target) => target.playerId !== player.playerId).map(
                (target) => ({ playerId: target.playerId, name: target.name }),
              ),
              votedPlayerId: options.phase === "PROCTOR_REVIEW_RESULT" ? PLAYERS.P4.playerId : null,
              abstained: false,
              locked: options.phase === "PROCTOR_REVIEW_RESULT",
              suspendedPlayerName: suspended ? PLAYERS.P4.name : null,
              votesCast: options.proctorVotes ?? 0,
              votersTotal: ROSTER.length,
            }
          : null,
      hearing:
        options.phase === "FINAL_ACCUSATION"
          ? {
              eligibleTargets: ROSTER.filter((target) => target.playerId !== player.playerId).map(
                (target) => ({ playerId: target.playerId, name: target.name }),
              ),
              accusedPlayerId: null,
              votesCast: options.hearingVotes ?? 0,
              votersTotal: ROSTER.length,
            }
          : null,
    };
  }
  const controllers = {
    P1: controllerFor("P1"),
    P2: controllerFor("P2"),
    P3: controllerFor("P3"),
    P4: controllerFor("P4"),
  };

  return { stage, controllers };
}

function beat(
  slug: string,
  title: string,
  description: string,
  options: BeatOptions,
): QuizslopExamFixtureBeat {
  return { slug, title, description, ...makeViews(options) };
}

export function createQuizslopExamFixtureBeats(): QuizslopExamFixtureBeat[] {
  const drafted = SECTION_ONE.map((value) => ({ ...value, scratchIndex: 0, scratchLocked: true }));
  const filed = drafted.map((value, index) => ({
    ...value,
    officialIndex: index === 2 ? 2 : 0,
    officialLocked: true,
  }));
  const filing = filed.map((value, index) =>
    index === filed.length - 1 ? { ...value, officialIndex: null, officialLocked: false } : value,
  );
  const sectionThreeVoting = SECTION_THREE.map((value) => ({
    ...value,
    officialIndex: value.proxyMode === "PLAYER" ? 0 : null,
    officialLocked: value.proxyMode === "PLAYER",
  }));
  return [
    beat(
      "exam-lobby",
      "Admissions and instructions",
      "AI pack ready; all four candidates are present.",
      { phase: "LOBBY_SETUP", sectionNumber: 0 },
    ),
    beat(
      "role-reveal",
      "Private role letters",
      "Player four sees the Saboteur appointment; everybody else sees Candidate.",
      { phase: "SECTION_INTRO", sectionNumber: 1, assignments: SECTION_ONE },
    ),
    beat(
      "scratch",
      "Private scratch work",
      "Every Candidate answers a different topic at hidden difficulty.",
      {
        phase: "SCRATCH",
        sectionNumber: 1,
        assignments: drafted,
        progress: { locked: 3, total: 4 },
      },
    ),
    beat(
      "proxy-handoff",
      "Proxy answer handoff",
      "Candidates explain; rotated Proxies file the official answers.",
      {
        phase: "PROXY_ANSWER",
        sectionNumber: 1,
        assignments: filing,
        progress: { locked: 3, total: 4 },
      },
    ),
    beat(
      "oral-defense",
      "Wrong answer oral defense",
      "A correct scratch answer was changed to a wrong official answer.",
      {
        phase: "ORAL_DEFENSE",
        sectionNumber: 1,
        assignments: filed,
        score: SECTION_ONE_SCORE,
        receipts: SECTION_ONE_RECEIPTS,
      },
    ),
    beat(
      "section-results",
      "Section transcript",
      "The class is below the 70 percent pass line after one deduction.",
      {
        phase: "SECTION_RESULTS",
        sectionNumber: 1,
        score: SECTION_ONE_SCORE,
        receipts: SECTION_ONE_RECEIPTS,
      },
    ),
    beat(
      "midpoint-vote",
      "Midpoint Proctor Review",
      "Private ballots choose one Proxy to suspend for a section.",
      { phase: "PROCTOR_REVIEW_VOTE", sectionNumber: 2, score: MID_SCORE, proctorVotes: 3 },
    ),
    beat(
      "suspension-result",
      "Suspension bulletin",
      "Graham loses Proxy privileges for the next section.",
      {
        phase: "PROCTOR_REVIEW_RESULT",
        sectionNumber: 2,
        score: MID_SCORE,
        suspended: true,
        proctorVotes: 4,
      },
    ),
    beat(
      "committee-fallback",
      "Suspended Proxy fallback",
      "Everyone keeps their own Proxy task and separately votes on the orphaned Horology answer.",
      {
        phase: "PROXY_ANSWER",
        sectionNumber: 3,
        assignments: sectionThreeVoting,
        score: MID_SCORE,
        progress: { locked: 3, total: 4 },
        suspended: true,
      },
    ),
    beat(
      "committee-receipt",
      "Committee answer receipt",
      "The group correctly handles the suspended Proxy assignment.",
      {
        phase: "ORAL_DEFENSE",
        sectionNumber: 3,
        assignments: sectionThreeVoting,
        score: LATE_SCORE,
        receipts: SECTION_THREE_RECEIPTS,
        suspended: true,
      },
    ),
    beat(
      "integrity-hearing",
      "Academic Integrity Hearing",
      "Private accusations can erase all sabotage deductions.",
      {
        phase: "FINAL_ACCUSATION",
        sectionNumber: 5,
        score: {
          rawCorrect: 16,
          totalQuestions: 20,
          passingScorePercent: 70,
          integrityAdjustmentSealed: true,
        },
        hearingVotes: 3,
      },
    ),
    beat(
      "final-transcript",
      "Final class transcript",
      "The class identifies Graham, restores the raw grade, and passes.",
      {
        phase: "FINAL_RESULTS",
        sectionNumber: 5,
        score: {
          rawCorrect: 16,
          totalQuestions: 20,
          passingScorePercent: 70,
          integrityAdjustmentSealed: false,
        },
        final: FINAL,
      },
    ),
  ];
}

export function clampQuizslopExamBeatIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.max(0, Math.min(Math.trunc(index), count - 1));
}
