import type {
  GameModelUsage,
  GamePlayer,
  GamePrompt,
  GameReaction,
  GameResponse,
  GameRound,
  GameState,
  PlayerType,
} from "@/lib/types";

export interface MockScenario {
  slug: string;
  title: string;
  description: string;
  playerId: string | null;
  game: GameState;
}

const HOST_ID = "p-host";
const HUMAN_2_ID = "p-amy";
const HUMAN_3_ID = "p-beau";
const AI_ID = "p-ai";
const SPECTATOR_ID = "p-spec";

const NOW = "2026-02-25T12:00:00.000Z";

function futureDeadline(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function player(
  id: string,
  name: string,
  type: PlayerType,
  opts: Partial<GamePlayer> = {},
): GamePlayer {
  return {
    id,
    name,
    type,
    modelId: type === "AI" ? "openai/gpt-5.2-chat" : null,
    idleRounds: 0,
    score: 0,
    humorRating: 1.0,
    winStreak: 0,
    lastSeen: NOW,
    ...opts,
  };
}

function basePlayers(): GamePlayer[] {
  return [
    player(HOST_ID, "Ong", "HUMAN", { score: 84, humorRating: 1.12, winStreak: 2 }),
    player(HUMAN_2_ID, "Amy", "HUMAN", { score: 72, humorRating: 1.06 }),
    player(HUMAN_3_ID, "Beau", "HUMAN", { score: 68, humorRating: 0.98 }),
    player(AI_ID, "GPT Slopbot", "AI", {
      score: 77,
      humorRating: 1.02,
      modelId: "openai/gpt-5.2-chat",
    }),
    player(SPECTATOR_ID, "Kai (spectator)", "SPECTATOR", { score: 0 }),
  ];
}

function modelUsages(): GameModelUsage[] {
  return [
    {
      modelId: "openai/gpt-5.2-chat",
      inputTokens: 8421,
      outputTokens: 3912,
      costUsd: 0.0724,
    },
  ];
}

function responsePlayer(playerMap: Map<string, GamePlayer>, id: string): GameResponse["player"] {
  const p = playerMap.get(id);
  if (!p) {
    throw new Error(`Unknown player ${id}`);
  }
  const { score, ...rest } = p;
  void score;
  return rest;
}

function reaction(id: string, responseId: string, playerId: string, emoji: string): GameReaction {
  return { id, responseId, playerId, emoji };
}

function response(
  playerMap: Map<string, GamePlayer>,
  id: string,
  promptId: string,
  playerId: string,
  text: string,
  pointsEarned: number,
  opts?: Partial<Pick<GameResponse, "failReason" | "reactions">>,
): GameResponse {
  return {
    id,
    promptId,
    playerId,
    text,
    pointsEarned,
    failReason: null,
    reactions: [],
    player: responsePlayer(playerMap, playerId),
    ...opts,
  };
}

function vote(
  id: string,
  promptId: string,
  voterId: string,
  voterType: PlayerType,
  responseId: string | null,
  failReason: string | null = null,
) {
  return {
    id,
    promptId,
    voterId,
    responseId,
    failReason,
    voter: { id: voterId, type: voterType },
  };
}

function prompt(
  id: string,
  roundId: string,
  text: string,
  assignments: string[],
  responses: GameResponse[],
  votes: GamePrompt["votes"],
): GamePrompt {
  return {
    id,
    roundId,
    text,
    assignments: assignments.map((playerId) => ({ promptId: id, playerId })),
    responses,
    votes,
  };
}

function round(id: string, roundNumber: number, prompts: GamePrompt[]): GameRound {
  return {
    id,
    gameId: "game-mock-1",
    roundNumber,
    prompts,
  };
}

function makeGame(overrides: Partial<GameState>): GameState {
  const players = overrides.players ?? basePlayers();
  return {
    id: "game-mock-1",
    roomCode: "SLOP",
    status: "LOBBY",
    currentRound: 1,
    totalRounds: 2,
    hostPlayerId: HOST_ID,
    phaseDeadline: null,
    timersDisabled: false,
    ttsMode: "OFF",
    ttsVoice: "RANDOM",
    votingPromptIndex: 0,
    votingRevealing: false,
    nextGameCode: null,
    version: 1,
    aiInputTokens: 8421,
    aiOutputTokens: 3912,
    aiCostUsd: 0.0724,
    modelUsages: modelUsages(),
    players,
    rounds: [],
    ...overrides,
  };
}

function buildRound1(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "r1";

  const p1 = prompt(
    "prompt-r1-1",
    roundId,
    "A terrible slogan for a dentist who only works at night:",
    [HOST_ID, AI_ID],
    [
      response(p, "resp-r1-1-a", "prompt-r1-1", HOST_ID, "We drill after dark, baby.", 160, {
        reactions: [reaction("rx-1", "resp-r1-1-a", HUMAN_2_ID, "😂")],
      }),
      response(p, "resp-r1-1-b", "prompt-r1-1", AI_ID, "Midnight molars, maximum mystery.", 80),
    ],
    [
      vote("vote-r1-1", "prompt-r1-1", HUMAN_2_ID, "HUMAN", "resp-r1-1-a"),
      vote("vote-r1-2", "prompt-r1-1", HUMAN_3_ID, "HUMAN", "resp-r1-1-a"),
    ],
  );

  const p2 = prompt(
    "prompt-r1-2",
    roundId,
    "The worst thing to hear from your rideshare driver:",
    [HUMAN_2_ID, HUMAN_3_ID],
    [
      response(p, "resp-r1-2-a", "prompt-r1-2", HUMAN_2_ID, "Good news, I watched one drifting video.", 100),
      response(p, "resp-r1-2-b", "prompt-r1-2", HUMAN_3_ID, "Seatbelts are optional if you trust me.", 120),
    ],
    [
      vote("vote-r1-3", "prompt-r1-2", HOST_ID, "HUMAN", "resp-r1-2-b"),
      vote("vote-r1-4", "prompt-r1-2", AI_ID, "AI", "resp-r1-2-a"),
    ],
  );

  return round(roundId, 1, [p1, p2]);
}

function buildRound2(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "r2";

  const p1 = prompt(
    "prompt-r2-1",
    roundId,
    "A bad app notification to get during a first date:",
    [HOST_ID, HUMAN_2_ID],
    [
      response(p, "resp-r2-1-a", "prompt-r2-1", HOST_ID, "Your fridge has posted a subtweet about you.", 140),
      response(p, "resp-r2-1-b", "prompt-r2-1", HUMAN_2_ID, "Reminder: practice eye contact before 7 PM.", 90),
    ],
    [
      vote("vote-r2-1", "prompt-r2-1", HUMAN_3_ID, "HUMAN", "resp-r2-1-a"),
      vote("vote-r2-2", "prompt-r2-1", AI_ID, "AI", "resp-r2-1-a"),
    ],
  );

  const p2 = prompt(
    "prompt-r2-2",
    roundId,
    "The least inspiring gym motivational quote:",
    [AI_ID, HUMAN_3_ID],
    [
      response(p, "resp-r2-2-a", "prompt-r2-2", AI_ID, "Pain is temporary, membership fees are forever.", 70),
      response(p, "resp-r2-2-b", "prompt-r2-2", HUMAN_3_ID, "Just stand near the weights and look busy.", 130, {
        reactions: [reaction("rx-2", "resp-r2-2-b", HOST_ID, "🔥")],
      }),
    ],
    [
      vote("vote-r2-3", "prompt-r2-2", HOST_ID, "HUMAN", "resp-r2-2-b"),
      vote("vote-r2-4", "prompt-r2-2", HUMAN_2_ID, "HUMAN", "resp-r2-2-b"),
    ],
  );

  return round(roundId, 2, [p1, p2]);
}

function buildWritingRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "r-writing";
  return round(roundId, 1, [
    prompt(
      "prompt-w-1",
      roundId,
      "A terrible thing to yell after winning a spelling bee:",
      [HOST_ID, AI_ID],
      [],
      [],
    ),
    prompt(
      "prompt-w-2",
      roundId,
      "The weirdest item on a luxury hotel room service menu:",
      [HOST_ID, HUMAN_2_ID],
      [
        response(
          p,
          "resp-w-2-a",
          "prompt-w-2",
          HUMAN_2_ID,
          "Twelve artisanal ice cubes, chef's choice.",
          0,
        ),
      ],
      [],
    ),
    prompt(
      "prompt-w-3",
      roundId,
      "A bad catchphrase for a superhero accountant:",
      [HUMAN_3_ID, AI_ID],
      [],
      [],
    ),
  ]);
}

function buildVotingRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "r-voting";
  return round(roundId, 1, [
    prompt(
      "prompt-v-1",
      roundId,
      "What not to say when the waiter asks 'sparkling or still?'",
      [HOST_ID, AI_ID],
      [
        response(p, "resp-v-1-a", "prompt-v-1", HOST_ID, "Surprise me with something crunchy.", 90),
        response(p, "resp-v-1-b", "prompt-v-1", AI_ID, "Whichever one screams less when poured.", 140),
      ],
      [
        vote("vote-v-1", "prompt-v-1", HUMAN_2_ID, "HUMAN", "resp-v-1-b"),
        vote("vote-v-2", "prompt-v-1", HUMAN_3_ID, "HUMAN", "resp-v-1-a"),
        vote("vote-v-2b", "prompt-v-1", SPECTATOR_ID, "SPECTATOR", "resp-v-1-b"),
      ],
    ),
    prompt(
      "prompt-v-2",
      roundId,
      "An awful name for a meditation app:",
      [HUMAN_2_ID, HUMAN_3_ID],
      [
        response(p, "resp-v-2-a", "prompt-v-2", HUMAN_2_ID, "Panic+ Premium", 0),
        response(p, "resp-v-2-b", "prompt-v-2", HUMAN_3_ID, "Breathe Maybe", 0, {
          reactions: [reaction("rx-v-1", "resp-v-2-b", SPECTATOR_ID, "😵")],
        }),
      ],
      [
        vote("vote-v-3", "prompt-v-2", HOST_ID, "HUMAN", "resp-v-2-b"),
        vote("vote-v-4", "prompt-v-2", AI_ID, "AI", "resp-v-2-b"),
      ],
    ),
  ]);
}

function buildLobbyHostReady(): MockScenario {
  const players = basePlayers();
  return {
    slug: "lobby-host-ready",
    title: "Lobby (Host Ready)",
    description: "Host view with enough players to start.",
    playerId: HOST_ID,
    game: makeGame({
      status: "LOBBY",
      players,
      rounds: [],
      phaseDeadline: null,
    }),
  };
}

function buildLobbyPlayerWaiting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "lobby-player-waiting",
    title: "Lobby (Player Waiting)",
    description: "Non-host player waiting for the host to start.",
    playerId: HUMAN_2_ID,
    game: makeGame({
      status: "LOBBY",
      players,
      rounds: [],
      phaseDeadline: null,
    }),
  };
}

function buildWritingPlayer(): MockScenario {
  const players = basePlayers();
  return {
    slug: "writing-player",
    title: "Writing (Player)",
    description: "Player has one prompt answered and one prompt left.",
    playerId: HOST_ID,
    game: makeGame({
      status: "WRITING",
      players,
      rounds: [buildWritingRound(players)],
      phaseDeadline: futureDeadline(78),
      currentRound: 1,
    }),
  };
}

function buildWritingSpectator(): MockScenario {
  const players = basePlayers();
  return {
    slug: "writing-spectator",
    title: "Writing (Spectator)",
    description: "Spectator read-only prompt assignment view.",
    playerId: SPECTATOR_ID,
    game: makeGame({
      status: "WRITING",
      players,
      rounds: [buildWritingRound(players)],
      phaseDeadline: futureDeadline(71),
      currentRound: 1,
    }),
  };
}

function buildVotingPlayer(): MockScenario {
  const players = basePlayers().map((pl) =>
    pl.id === HOST_ID ? { ...pl, score: 96, humorRating: 1.18 } : pl,
  );
  return {
    slug: "voting-player",
    title: "Voting (Player)",
    description: "Active voting prompt (before reveal) for a non-respondent player.",
    playerId: HUMAN_2_ID,
    game: makeGame({
      status: "VOTING",
      players,
      rounds: [buildVotingRound(players)],
      phaseDeadline: futureDeadline(26),
      currentRound: 1,
      votingPromptIndex: 0,
      votingRevealing: false,
    }),
  };
}

function buildVotingReveal(): MockScenario {
  const players = basePlayers();
  return {
    slug: "voting-reveal",
    title: "Voting (Reveal)",
    description: "Reveal state in voting with progress dots and scoreboard updates.",
    playerId: HOST_ID,
    game: makeGame({
      status: "VOTING",
      players,
      rounds: [buildVotingRound(players)],
      phaseDeadline: futureDeadline(8),
      currentRound: 1,
      votingPromptIndex: 1,
      votingRevealing: true,
    }),
  };
}

function buildVotingRespondent(): MockScenario {
  const players = basePlayers();
  return {
    slug: "voting-respondent",
    title: "Voting (Respondent)",
    description: "Player is one of the respondents and cannot vote on this prompt.",
    playerId: HOST_ID,
    game: makeGame({
      status: "VOTING",
      players,
      rounds: [buildVotingRound(players)],
      phaseDeadline: futureDeadline(21),
      currentRound: 1,
      votingPromptIndex: 0,
      votingRevealing: false,
    }),
  };
}

function buildRoundResults(): MockScenario {
  const players = basePlayers().map((pl) => {
    if (pl.id === HOST_ID) return { ...pl, score: 146, humorRating: 1.31, winStreak: 3 };
    if (pl.id === HUMAN_3_ID) return { ...pl, score: 118, humorRating: 1.13 };
    if (pl.id === AI_ID) return { ...pl, score: 111, humorRating: 1.07 };
    if (pl.id === HUMAN_2_ID) return { ...pl, score: 105, humorRating: 1.01 };
    return pl;
  });

  return {
    slug: "results-round",
    title: "Round Results",
    description: "End-of-round standings and prompt outcomes.",
    playerId: HOST_ID,
    game: makeGame({
      status: "ROUND_RESULTS",
      players,
      rounds: [buildRound1(players)],
      currentRound: 1,
      totalRounds: 2,
    }),
  };
}

function buildFinalResults(): MockScenario {
  const players = basePlayers().map((pl) => {
    if (pl.id === HOST_ID) return { ...pl, score: 228, humorRating: 1.46, winStreak: 4 };
    if (pl.id === HUMAN_3_ID) return { ...pl, score: 193, humorRating: 1.27 };
    if (pl.id === HUMAN_2_ID) return { ...pl, score: 176, humorRating: 1.19 };
    if (pl.id === AI_ID) return { ...pl, score: 168, humorRating: 1.11 };
    return pl;
  });

  return {
    slug: "results-final",
    title: "Final Results",
    description: "End-of-game final standings, achievements, and recap UI.",
    playerId: HOST_ID,
    game: makeGame({
      status: "FINAL_RESULTS",
      players,
      rounds: [buildRound2(players), buildRound1(players)],
      currentRound: 2,
      totalRounds: 2,
      nextGameCode: "NEXT",
      aiInputTokens: 16842,
      aiOutputTokens: 7824,
      aiCostUsd: 0.1448,
      modelUsages: [
        {
          modelId: "openai/gpt-5.2-chat",
          inputTokens: 16842,
          outputTokens: 7824,
          costUsd: 0.1448,
        },
      ],
    }),
  };
}

function buildWritingAiWaiting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "writing-ai-waiting",
    title: "Writing (AI / Passive)",
    description: "Passive writing screen shown for AI or no local player session.",
    playerId: AI_ID,
    game: makeGame({
      status: "WRITING",
      players,
      rounds: [buildWritingRound(players)],
      phaseDeadline: futureDeadline(64),
      currentRound: 1,
    }),
  };
}

export const MOCK_SCENARIOS: MockScenario[] = [
  buildLobbyHostReady(),
  buildLobbyPlayerWaiting(),
  buildWritingPlayer(),
  buildWritingSpectator(),
  buildWritingAiWaiting(),
  buildVotingPlayer(),
  buildVotingRespondent(),
  buildVotingReveal(),
  buildRoundResults(),
  buildFinalResults(),
];

export function getMockScenario(slug: string): MockScenario | undefined {
  return MOCK_SCENARIOS.find((scenario) => scenario.slug === slug);
}
