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
    modelId: type === "AI" ? "openai/gpt-5.4-mini" : null,
    idleRounds: 0,
    score: 0,
    humorRating: 1.0,
    winStreak: 0,
    participationStatus: "ACTIVE",
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
      modelId: "openai/gpt-5.4-mini",
    }),
  ];
}

function modelUsages(): GameModelUsage[] {
  return [
    {
      modelId: "openai/gpt-5.4-mini",
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
    metadata: null,
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
    gameType: "SLOPLASH",
    personaModelId: null,
    modeState: null,
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
          reactions: [reaction("rx-v-1", "resp-v-2-b", HOST_ID, "😵")],
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
          modelId: "openai/gpt-5.4-mini",
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

const CHAT_HOST_ID = "cp-host";
const CHAT_HUMAN_2_ID = "cp-dana";
const CHAT_HUMAN_3_ID = "cp-eli";
const CHAT_AI_ID = "cp-ai";

function chatPlayer(
  id: string,
  name: string,
  type: PlayerType,
  opts: Partial<GamePlayer> = {},
): GamePlayer {
  return {
    id,
    name,
    type,
    modelId: type === "AI" ? "openai/gpt-5.4-mini" : null,
    idleRounds: 0,
    score: 0,
    humorRating: 1.0,
    winStreak: 0,
    participationStatus: "ACTIVE",
    lastSeen: NOW,
    ...opts,
  };
}

function chatBasePlayers(): GamePlayer[] {
  return [
    chatPlayer(CHAT_HOST_ID, "Ong", "HUMAN", { score: 60, humorRating: 1.1, winStreak: 1 }),
    chatPlayer(CHAT_HUMAN_2_ID, "Dana", "HUMAN", { score: 50, humorRating: 1.05 }),
    chatPlayer(CHAT_HUMAN_3_ID, "Eli", "HUMAN", { score: 45, humorRating: 0.95 }),
    chatPlayer(CHAT_AI_ID, "Claude Bot", "AI", {
      score: 55,
      humorRating: 1.0,
      modelId: "openai/gpt-5.4-mini",
    }),
  ];
}

function makeChatGame(overrides: Partial<GameState>): GameState {
  const players = overrides.players ?? chatBasePlayers();
  return {
    id: "game-chat-mock",
    roomCode: "CHAT",
    gameType: "AI_CHAT_SHOWDOWN",
    personaModelId: null,
    modeState: null,
    status: "LOBBY",
    currentRound: 1,
    totalRounds: 3,
    hostPlayerId: CHAT_HOST_ID,
    phaseDeadline: null,
    timersDisabled: true,
    ttsMode: "OFF",
    ttsVoice: "RANDOM",
    votingPromptIndex: 0,
    votingRevealing: false,
    nextGameCode: null,
    version: 1,
    aiInputTokens: 4200,
    aiOutputTokens: 1900,
    aiCostUsd: 0.035,
    modelUsages: [
      {
        modelId: "openai/gpt-5.4-mini",
        inputTokens: 4200,
        outputTokens: 1900,
        costUsd: 0.035,
      },
    ],
    players,
    rounds: [],
    ...overrides,
  };
}

function buildChatWritingRound(players: GamePlayer[], submitted: string[] = []): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "cr-writing";
  const allActive = players.filter(
    (pl) => pl.type !== "SPECTATOR" && pl.participationStatus === "ACTIVE",
  );
  const allIds = allActive.map((pl) => pl.id);

  const responses: GameResponse[] = submitted
    .filter((id) => p.has(id))
    .map((id, i) => ({
      id: `cresp-w-${i}`,
      promptId: "cprompt-w-1",
      playerId: id,
      metadata: null,
      text: id === CHAT_AI_ID
        ? "It judges you silently via Bluetooth."
        : `Response from ${p.get(id)!.name}`,
      pointsEarned: 0,
      failReason: null,
      reactions: [],
      player: (() => {
        const { score, ...rest } = p.get(id)!;
        void score;
        return rest;
      })(),
    }));

  return round(roundId, 1, [
    prompt(
      "cprompt-w-1",
      roundId,
      "A feature your smart fridge definitely does NOT need:",
      allIds,
      responses,
      [],
    ),
  ]);
}

function buildChatVotingRound(players: GamePlayer[], voted: string[] = []): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "cr-voting";
  const allActive = players.filter(
    (pl) => pl.type !== "SPECTATOR" && pl.participationStatus === "ACTIVE",
  );
  const allIds = allActive.map((pl) => pl.id);

  const responses: GameResponse[] = allActive.map((pl, i) => ({
    id: `cresp-v-${i}`,
    promptId: "cprompt-v-1",
    playerId: pl.id,
    metadata: null,
    text: [
      "It texts your ex when it detects loneliness.",
      "A passive-aggressive sticky note generator.",
      "Calorie-shaming every time you open the door.",
      "Milk futures trading without your consent.",
    ][i] ?? `Answer ${i + 1}`,
    pointsEarned: 0,
    failReason: null,
    reactions: [],
    player: (() => {
      const { score, ...rest } = p.get(pl.id)!;
      void score;
      return rest;
    })(),
  }));

  const votes = voted.map((voterId, i) => {
    const voter = p.get(voterId)!;
    const ownRespIdx = allActive.findIndex((pl) => pl.id === voterId);
    const voteTargetIdx = ownRespIdx === 0 ? 1 : 0;
    return vote(
      `cvote-v-${i}`,
      "cprompt-v-1",
      voterId,
      voter.type,
      responses[voteTargetIdx]?.id ?? responses[0]!.id,
    );
  });

  return round(roundId, 1, [
    prompt("cprompt-v-1", roundId, "A feature your smart fridge definitely does NOT need:", allIds, responses, votes),
  ]);
}

function buildChatRoundResultsRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((pl) => [pl.id, pl]));
  const roundId = "cr-results";
  const allActive = players.filter(
    (pl) => pl.type !== "SPECTATOR" && pl.participationStatus === "ACTIVE",
  );
  const allIds = allActive.map((pl) => pl.id);

  const responses: GameResponse[] = allActive.map((pl, i) => ({
    id: `cresp-r-${i}`,
    promptId: "cprompt-r-1",
    playerId: pl.id,
    metadata: null,
    text: [
      "It texts your ex when it detects loneliness.",
      "A passive-aggressive sticky note generator.",
      "Calorie-shaming every time you open the door.",
      "Milk futures trading without your consent.",
    ][i] ?? `Answer ${i + 1}`,
    pointsEarned: [160, 120, 80, 40][i] ?? 0,
    failReason: null,
    reactions: [],
    player: (() => {
      const { score, ...rest } = p.get(pl.id)!;
      void score;
      return rest;
    })(),
  }));

  const votes = [
    vote("cvote-r-1", "cprompt-r-1", allActive[1]!.id, allActive[1]!.type, responses[0]!.id),
    vote("cvote-r-2", "cprompt-r-1", allActive[2]!.id, allActive[2]!.type, responses[0]!.id),
    vote("cvote-r-3", "cprompt-r-1", allActive[3]!.id, allActive[3]!.type, responses[1]!.id),
    vote("cvote-r-4", "cprompt-r-1", allActive[0]!.id, allActive[0]!.type, responses[1]!.id),
  ];

  return round(roundId, 1, [
    prompt("cprompt-r-1", roundId, "A feature your smart fridge definitely does NOT need:", allIds, responses, votes),
  ]);
}

function buildChatLobby(): MockScenario {
  return {
    slug: "chat-lobby",
    title: "ChatSlop Lobby",
    description: "ChatSlop lobby with 4 players, no spectators allowed.",
    playerId: CHAT_HOST_ID,
    game: makeChatGame({ status: "LOBBY", rounds: [] }),
  };
}

function buildChatWriting(): MockScenario {
  const players = chatBasePlayers();
  return {
    slug: "chat-writing",
    title: "ChatSlop Writing",
    description: "Single shared prompt, 1/4 submitted. Chat visible alongside prompt.",
    playerId: CHAT_HOST_ID,
    game: makeChatGame({
      status: "WRITING",
      players,
      rounds: [buildChatWritingRound(players, [CHAT_AI_ID])],
      currentRound: 1,
    }),
  };
}

function buildChatWritingDisconnect(): MockScenario {
  const players = chatBasePlayers().map((pl) =>
    pl.id === CHAT_HUMAN_3_ID
      ? { ...pl, participationStatus: "DISCONNECTED" as const, lastSeen: new Date(Date.now() - 150_000).toISOString() }
      : pl,
  );
  return {
    slug: "chat-writing-disconnect",
    title: "ChatSlop Writing (Disconnect)",
    description: "One player disconnected mid-writing. Quorum shrinks: 1/3 submitted.",
    playerId: CHAT_HOST_ID,
    game: makeChatGame({
      status: "WRITING",
      players,
      rounds: [buildChatWritingRound(players, [CHAT_AI_ID])],
      currentRound: 1,
    }),
  };
}

function buildChatVoting(): MockScenario {
  const players = chatBasePlayers();
  return {
    slug: "chat-voting",
    title: "ChatSlop Voting",
    description: "All responses in, voting in progress. Self-vote blocked, no abstains.",
    playerId: CHAT_HUMAN_2_ID,
    game: makeChatGame({
      status: "VOTING",
      players,
      rounds: [buildChatVotingRound(players, [CHAT_AI_ID])],
      currentRound: 1,
    }),
  };
}

function buildChatRejoin(): MockScenario {
  const players = chatBasePlayers().map((pl) =>
    pl.id === CHAT_HUMAN_2_ID
      ? { ...pl, participationStatus: "DISCONNECTED" as const, lastSeen: new Date(Date.now() - 130_000).toISOString() }
      : pl,
  );
  return {
    slug: "chat-rejoin",
    title: "ChatSlop Rejoin",
    description: "Viewer is disconnected and will attempt rejoin-to-active on load.",
    playerId: CHAT_HUMAN_2_ID,
    game: makeChatGame({
      status: "VOTING",
      players,
      rounds: [buildChatVotingRound(players, [CHAT_AI_ID, CHAT_HOST_ID])],
      currentRound: 1,
    }),
  };
}

function buildChatRoundResults(): MockScenario {
  const players = chatBasePlayers().map((pl) => {
    if (pl.id === CHAT_HOST_ID) return { ...pl, score: 220, humorRating: 1.3, winStreak: 2 };
    if (pl.id === CHAT_HUMAN_2_ID) return { ...pl, score: 170, humorRating: 1.15 };
    if (pl.id === CHAT_HUMAN_3_ID) return { ...pl, score: 125, humorRating: 1.0 };
    if (pl.id === CHAT_AI_ID) return { ...pl, score: 95, humorRating: 0.95 };
    return pl;
  });
  return {
    slug: "chat-results-round",
    title: "ChatSlop Round Results",
    description: "Round results with vote bars and standings inside chat layout.",
    playerId: CHAT_HOST_ID,
    game: makeChatGame({
      status: "ROUND_RESULTS",
      players,
      rounds: [buildChatRoundResultsRound(players)],
      currentRound: 2,
      totalRounds: 3,
    }),
  };
}

function buildChatFinalResults(): MockScenario {
  const players = chatBasePlayers().map((pl) => {
    if (pl.id === CHAT_HOST_ID) return { ...pl, score: 340, humorRating: 1.45, winStreak: 3 };
    if (pl.id === CHAT_HUMAN_2_ID) return { ...pl, score: 280, humorRating: 1.25 };
    if (pl.id === CHAT_HUMAN_3_ID) return { ...pl, score: 210, humorRating: 1.08 };
    if (pl.id === CHAT_AI_ID) return { ...pl, score: 170, humorRating: 0.92 };
    return pl;
  });
  return {
    slug: "chat-results-final",
    title: "ChatSlop Final Results",
    description: "Game over with score chart and AI cost inside chat layout.",
    playerId: CHAT_HOST_ID,
    game: makeChatGame({
      status: "FINAL_RESULTS",
      players,
      rounds: [buildChatRoundResultsRound(players)],
      currentRound: 3,
      totalRounds: 3,
      nextGameCode: "NEXT",
      aiInputTokens: 12600,
      aiOutputTokens: 5700,
      aiCostUsd: 0.105,
      modelUsages: [
        {
          modelId: "openai/gpt-5.4-mini",
          inputTokens: 12600,
          outputTokens: 5700,
          costUsd: 0.105,
        },
      ],
    }),
  };
}

export const SLOPLASH_SCENARIOS: MockScenario[] = [
  buildLobbyHostReady(),
  buildLobbyPlayerWaiting(),
  buildWritingPlayer(),
  buildWritingAiWaiting(),
  buildVotingPlayer(),
  buildVotingRespondent(),
  buildVotingReveal(),
  buildRoundResults(),
  buildFinalResults(),
];

export const CHATSLOP_SCENARIOS: MockScenario[] = [
  buildChatLobby(),
  buildChatWriting(),
  buildChatWritingDisconnect(),
  buildChatVoting(),
  buildChatRejoin(),
  buildChatRoundResults(),
  buildChatFinalResults(),
];

const MOCK_NORA_PROFILE = {
  displayName: "Nora, 29",
  age: 29,
  location: "Echo Park",
  bio: "Tarot decks, bike grease, and the kind of confidence that gets you banned from trivia night.",
  tagline: "Looking for someone funny enough to survive brunch.",
  prompts: [
    { id: "m-p1", prompt: "Typical Sunday", answer: "Farmer's market, then a reckless amount of anchovies." },
    { id: "m-p2", prompt: "The most unhinged thing about me", answer: "I once live-blogged a neighborhood coyote." },
    { id: "m-p3", prompt: "We will get along if", answer: "You can commit to a bit longer than a situationship." },
  ],
};

const BASE_MATCHSLOP_MODE_STATE = {
  seekerIdentity: "MAN",
  personaIdentity: "WOMAN",
  outcome: "IN_PROGRESS",
  humanVoteWeight: 2,
  aiVoteWeight: 1,
  selectedPersonaExampleIds: ["vinyl-doomprep", "tarot-coder"],
  selectedPlayerExampleIds: ["museum-feral", "mall-mystic"],
  profile: MOCK_NORA_PROFILE,
  personaImage: { status: "PENDING", imageUrl: null },
  transcript: [] as Record<string, unknown>[],
  lastRoundResult: null as Record<string, unknown> | null,
};

function makeMatchSlopGame(overrides: Partial<GameState>): GameState {
  const players = overrides.players ?? basePlayers();
  return {
    id: "game-match-mock",
    roomCode: "DATE",
    gameType: "MATCHSLOP",
    personaModelId: "openai/gpt-5.4-mini",
    modeState: { ...BASE_MATCHSLOP_MODE_STATE },
    status: "LOBBY",
    currentRound: 1,
    totalRounds: 4,
    hostPlayerId: null,
    phaseDeadline: null,
    timersDisabled: false,
    ttsMode: "OFF",
    ttsVoice: "RANDOM",
    votingPromptIndex: 0,
    votingRevealing: false,
    nextGameCode: null,
    version: 1,
    aiInputTokens: 900,
    aiOutputTokens: 420,
    aiCostUsd: 0.011,
    modelUsages: [
      {
        modelId: "openai/gpt-5.4-mini",
        inputTokens: 900,
        outputTokens: 420,
        costUsd: 0.011,
      },
    ],
    players,
    rounds: [],
    ...overrides,
  };
}

function buildMatchSlopWriting(): MockScenario {
  return {
    slug: "matchslop-writing",
    title: "MatchSlop Writing",
    description: "TV-first profile view with the first opener round ready.",
    playerId: null,
    game: makeMatchSlopGame({
      status: "WRITING",
      phaseDeadline: futureDeadline(52),
    }),
  };
}

function buildMatchSlopResults(): MockScenario {
  return {
    slug: "matchslop-results",
    title: "MatchSlop Results",
    description: "Winning opener revealed and the persona replied.",
    playerId: null,
    game: makeMatchSlopGame({
      status: "ROUND_RESULTS",
      currentRound: 1,
      phaseDeadline: futureDeadline(12),
      modeState: {
        ...BASE_MATCHSLOP_MODE_STATE,
        transcript: [
          {
            id: "mt-1",
            speaker: "PLAYERS",
            text: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
            turn: 1,
            outcome: null,
            authorName: "Amy",
          },
          {
            id: "mt-2",
            speaker: "PERSONA",
            text: "Finally, a man who respects the fish. What's your most suspicious grocery-store purchase?",
            turn: 1,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
        ],
        lastRoundResult: {
          promptId: "match-prompt-1",
          winnerResponseId: "match-response-1",
          winnerPlayerId: HUMAN_2_ID,
          winnerText: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
          authorName: "Amy",
          weightedVotes: 5,
          rawVotes: 3,
          selectedPromptId: "m-p1",
          selectedPromptText: "Typical Sunday",
        },
      },
    }),
  };
}

function buildMatchSlopFinal(): MockScenario {
  return {
    slug: "matchslop-final",
    title: "MatchSlop Final",
    description: "Conversation finished with a sealed date.",
    playerId: null,
    game: makeMatchSlopGame({
      status: "FINAL_RESULTS",
      currentRound: 2,
      modeState: {
        ...BASE_MATCHSLOP_MODE_STATE,
        outcome: "DATE_SEALED",
        personaImage: {
          status: "READY",
          imageUrl: "/images/dev/matchslop-placeholder.jpg",
        },
        transcript: [
          {
            id: "mt-1",
            speaker: "PLAYERS",
            text: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
            turn: 1,
            outcome: null,
            authorName: "Amy",
          },
          {
            id: "mt-2",
            speaker: "PERSONA",
            text: "Finally, a man who respects the fish. What's your most suspicious grocery-store purchase?",
            turn: 1,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
          {
            id: "mt-3",
            speaker: "PLAYERS",
            text: "Candle wax and limes. I like my dinner plans to feel like a minor prophecy.",
            turn: 2,
            outcome: null,
            authorName: "Ong",
          },
          {
            id: "mt-4",
            speaker: "PERSONA",
            text: "Insane answer. Thursday, 7 PM. Bring the limes and no further explanation.",
            turn: 2,
            outcome: "DATE_SEALED",
            authorName: "Nora, 29",
          },
        ],
        lastRoundResult: {
          promptId: "match-prompt-2",
          winnerResponseId: "match-response-2",
          winnerPlayerId: HOST_ID,
          winnerText: "Candle wax and limes. I like my dinner plans to feel like a minor prophecy.",
          authorName: "Ong",
          weightedVotes: 6,
          rawVotes: 4,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      },
    }),
  };
}

export const MATCHSLOP_SCENARIOS: MockScenario[] = [
  buildMatchSlopWriting(),
  buildMatchSlopResults(),
  buildMatchSlopFinal(),
];

export const MOCK_SCENARIOS: MockScenario[] = [
  ...SLOPLASH_SCENARIOS,
  ...CHATSLOP_SCENARIOS,
  ...MATCHSLOP_SCENARIOS,
];

export function getMockScenario(slug: string): MockScenario | undefined {
  return MOCK_SCENARIOS.find((scenario) => scenario.slug === slug);
}
