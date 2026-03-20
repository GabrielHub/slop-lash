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

export function getComebackRound(game: GameState): number | null {
  const modeState = game.modeState as { comebackRound?: number | null } | null;
  return modeState?.comebackRound ?? null;
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
  opts?: Partial<Pick<GameResponse, "failReason" | "metadata" | "reactions">>,
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
  details: {
    job: "Tattoo Apprentice",
    school: "CalArts",
    height: "5'6\"",
    languages: ["English", "Spanish"],
  },
};

const BASE_MATCHSLOP_MODE_STATE = {
  seekerIdentity: "MAN",
  personaIdentity: "WOMAN",
  outcome: "IN_PROGRESS",
  humanVoteWeight: 2,
  aiVoteWeight: 1,
  selectedPersonaExampleIds: ["vinyl-doomprep", "tarot-coder"],
  selectedPlayerExamples: [],
  comebackRound: null as number | null,
  profile: MOCK_NORA_PROFILE,
  personaImage: {
    status: "PENDING" as "NOT_REQUESTED" | "PENDING" | "READY" | "FAILED",
    imageUrl: null as string | null,
    updatedAt: "2026-03-19T00:00:00.000Z",
  },
  transcript: [] as Record<string, unknown>[],
  lastRoundResult: null as Record<string, unknown> | null,
  mood: 50,
};

const MATCHSLOP_OPENING_TEXT =
  "Write the funniest opener to send Nora based on one of her profile prompts.";
const MATCHSLOP_FOLLOW_UP_TEXT =
  "Coastal danger is my whole brand. Last Sunday I cured fish on my fire escape and the seagulls formed a queue.";
const MATCHSLOP_COMEBACK_TEXT =
  "She unmatched the room. One last follow-up can still save this. What do you send?";

const MATCHSLOP_ROUND_1_TRANSCRIPT: Record<string, unknown>[] = [
  {
    id: "mt-t1",
    speaker: "PLAYERS",
    text: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
    turn: 1,
    outcome: null,
    authorName: "Amy",
    selectedPromptText: "Most reckless thing I've done for love",
    selectedPromptId: "profile-prompt-1",
  },
  {
    id: "mt-t2",
    speaker: "PERSONA",
    text: MATCHSLOP_FOLLOW_UP_TEXT,
    turn: 1,
    outcome: "CONTINUE",
    authorName: "Nora, 29",
  },
];

const MATCHSLOP_UNMATCHED_TRANSCRIPT: Record<string, unknown>[] = [
  ...MATCHSLOP_ROUND_1_TRANSCRIPT,
  {
    id: "mt-u3",
    speaker: "PLAYERS",
    text: "Okay but seriously, do you like bread? Because I knead you in my life.",
    turn: 2,
    outcome: null,
    authorName: "Ong",
  },
  {
    id: "mt-u4",
    speaker: "PERSONA",
    text: "I'm going to be honest, I'd rather date the bread. Unmatched.",
    turn: 2,
    outcome: "UNMATCHED",
    authorName: "Nora, 29",
  },
];

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
    totalRounds: 2,
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

function matchSlopModeState(overrides: Partial<typeof BASE_MATCHSLOP_MODE_STATE> = {}) {
  return {
    ...BASE_MATCHSLOP_MODE_STATE,
    ...overrides,
  };
}

function buildMatchSlopWritingRound(players: GamePlayer[], roundNumber = 1): GameRound {
  const p = new Map(players.map((player) => [player.id, player]));
  const roundId = `m-writing-${roundNumber}`;
  const promptId = `match-prompt-${roundNumber}`;

  return round(roundId, roundNumber, [
    prompt(
      promptId,
      roundId,
      roundNumber === 1 ? MATCHSLOP_OPENING_TEXT : MATCHSLOP_FOLLOW_UP_TEXT,
      players.map((player) => player.id),
      [
        response(
          p,
          `match-ai-seed-${roundNumber}`,
          promptId,
          AI_ID,
          roundNumber === 1
            ? "Farmer's market menace seeks anchovy accomplice."
            : "Honestly, candle wax and limes sounds like a strong opener for Thursday.",
          0,
          {
            metadata: {
              selectedPromptId: roundNumber === 1 ? "m-p1" : null,
            },
          },
        ),
      ],
      [],
    ),
  ]);
}

function buildMatchSlopVotingRound(players: GamePlayer[], roundNumber = 1): GameRound {
  const p = new Map(players.map((player) => [player.id, player]));
  const roundId = `m-voting-${roundNumber}`;
  const promptId = `match-prompt-${roundNumber}`;

  return round(roundId, roundNumber, [
    prompt(
      promptId,
      roundId,
      roundNumber === 1 ? MATCHSLOP_OPENING_TEXT : MATCHSLOP_FOLLOW_UP_TEXT,
      players.map((player) => player.id),
      [
        response(
          p,
          `match-host-${roundNumber}`,
          promptId,
          HOST_ID,
          roundNumber === 1
            ? "You had me at reckless anchovies. I too enjoy flirting with coastal danger."
            : "Candle wax and limes says 'prepared' and 'slightly cursed' in the best way.",
          0,
          {
            metadata: {
              selectedPromptId: roundNumber === 1 ? "m-p1" : null,
            },
          },
        ),
        response(
          p,
          `match-amy-${roundNumber}`,
          promptId,
          HUMAN_2_ID,
          roundNumber === 1
            ? "If a man arrives with anchovies and confidence, I'm at least cancelling my other plans."
            : "I'd bring the limes and a fake backstory just to keep up.",
          0,
          {
            metadata: {
              selectedPromptId: roundNumber === 1 ? "m-p1" : null,
            },
          },
        ),
        response(
          p,
          `match-beau-${roundNumber}`,
          promptId,
          HUMAN_3_ID,
          roundNumber === 1
            ? "Live-blogging coyotes is hot. Want a field producer with excellent snacks?"
            : "That grocery list sounds like a séance with a dress code.",
          0,
          {
            metadata: {
              selectedPromptId: roundNumber === 1 ? "__photo__" : null,
            },
          },
        ),
        response(
          p,
          `match-ai-${roundNumber}`,
          promptId,
          AI_ID,
          roundNumber === 1
            ? "I'm emotionally available and lightly marinated."
            : "I support any romance that starts like a suspicious produce receipt.",
          0,
          {
            metadata: {
              selectedPromptId: roundNumber === 1 ? "m-p1" : null,
            },
          },
        ),
      ],
      roundNumber === 1
        ? [vote("match-vote-seed-1", promptId, AI_ID, "AI", `match-amy-${roundNumber}`)]
        : [vote("match-vote-seed-2", promptId, AI_ID, "AI", `match-host-${roundNumber}`)],
    ),
  ]);
}

function buildMatchSlopComebackWritingRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((player) => [player.id, player]));
  const roundId = "m-comeback-writing-3";
  const promptId = "match-prompt-3";

  return round(roundId, 3, [
    prompt(
      promptId,
      roundId,
      MATCHSLOP_COMEBACK_TEXT,
      players.map((player) => player.id),
      [
        response(
          p,
          "match-ai-seed-3",
          promptId,
          AI_ID,
          "Then let me be the jam. Two carbs this compatible don't just happen.",
          0,
          { metadata: null },
        ),
      ],
      [],
    ),
  ]);
}

function buildMatchSlopComebackVotingRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((player) => [player.id, player]));
  const roundId = "m-comeback-voting-3";
  const promptId = "match-prompt-3";

  return round(roundId, 3, [
    prompt(
      promptId,
      roundId,
      MATCHSLOP_COMEBACK_TEXT,
      players.map((player) => player.id),
      [
        response(
          p,
          "match-host-3",
          promptId,
          HOST_ID,
          "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
          0,
          { metadata: null },
        ),
        response(
          p,
          "match-amy-3",
          promptId,
          HUMAN_2_ID,
          "Then let me be the weird little olive plate that proves this date still has range.",
          0,
          { metadata: null },
        ),
        response(
          p,
          "match-beau-3",
          promptId,
          HUMAN_3_ID,
          "Bread can't text you back after 9, and I think that's where I separate myself.",
          0,
          { metadata: null },
        ),
        response(
          p,
          "match-ai-3",
          promptId,
          AI_ID,
          "Then let me be the jam. Two carbs this compatible don't just happen.",
          0,
          { metadata: null },
        ),
      ],
      [vote("match-vote-seed-3", promptId, AI_ID, "AI", "match-host-3")],
    ),
  ]);
}

function buildMatchSlopComebackResultsRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((player) => [player.id, player]));
  const roundId = "m-comeback-results-3";
  const promptId = "match-prompt-3";

  return round(roundId, 3, [
    prompt(
      promptId,
      roundId,
      MATCHSLOP_COMEBACK_TEXT,
      players.map((player) => player.id),
      [
        response(
          p,
          "match-response-host-3",
          promptId,
          HOST_ID,
          "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
          175,
          { metadata: null },
        ),
        response(
          p,
          "match-response-amy-3",
          promptId,
          HUMAN_2_ID,
          "Then let me be the weird little olive plate that proves this date still has range.",
          80,
          { metadata: null },
        ),
        response(
          p,
          "match-response-beau-3",
          promptId,
          HUMAN_3_ID,
          "Bread can't text you back after 9, and I think that's where I separate myself.",
          55,
          { metadata: null },
        ),
        response(
          p,
          "match-response-ai-3",
          promptId,
          AI_ID,
          "Then let me be the jam. Two carbs this compatible don't just happen.",
          30,
          { metadata: null },
        ),
      ],
      [
        vote("match-vote-5", promptId, HOST_ID, "HUMAN", "match-response-host-3"),
        vote("match-vote-6", promptId, HUMAN_2_ID, "HUMAN", "match-response-host-3"),
        vote("match-vote-7", promptId, HUMAN_3_ID, "HUMAN", "match-response-amy-3"),
        vote("match-vote-8", promptId, AI_ID, "AI", "match-response-host-3"),
      ],
    ),
  ]);
}

function buildMatchSlopResultsRound(players: GamePlayer[]): GameRound {
  const p = new Map(players.map((player) => [player.id, player]));
  const roundId = "m-results-1";
  const promptId = "match-prompt-1";

  return round(roundId, 1, [
    prompt(
      promptId,
      roundId,
      MATCHSLOP_OPENING_TEXT,
      players.map((player) => player.id),
      [
        response(
          p,
          "match-response-host-1",
          promptId,
          HOST_ID,
          "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
          90,
          { metadata: { selectedPromptId: "m-p1" } },
        ),
        response(
          p,
          "match-response-amy-1",
          promptId,
          HUMAN_2_ID,
          "If a man arrives with anchovies and confidence, I'm at least cancelling my other plans.",
          160,
          { metadata: { selectedPromptId: "m-p1" } },
        ),
        response(
          p,
          "match-response-beau-1",
          promptId,
          HUMAN_3_ID,
          "Live-blogging coyotes is hot. Want a field producer with excellent snacks?",
          60,
          { metadata: { selectedPromptId: "m-p2" } },
        ),
        response(
          p,
          "match-response-ai-1",
          promptId,
          AI_ID,
          "I'm emotionally available and lightly marinated.",
          40,
          { metadata: { selectedPromptId: "m-p1" } },
        ),
      ],
      [
        vote("match-vote-1", promptId, HOST_ID, "HUMAN", "match-response-amy-1"),
        vote("match-vote-2", promptId, HUMAN_2_ID, "HUMAN", "match-response-host-1"),
        vote("match-vote-3", promptId, HUMAN_3_ID, "HUMAN", "match-response-amy-1"),
        vote("match-vote-4", promptId, AI_ID, "AI", "match-response-amy-1"),
      ],
    ),
  ]);
}

function buildMatchSlopLobby(): MockScenario {
  return {
    slug: "matchslop-lobby",
    title: "MatchSlop Lobby",
    description: "Profile is ready, players are connected, and the phone controller host can start.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      status: "LOBBY",
      phaseDeadline: null,
    }),
  };
}

function buildMatchSlopWriting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "matchslop-writing",
    title: "MatchSlop Writing",
    description: "Round one opener writing with the real controller prompt-picker data wired in.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "WRITING",
      rounds: [buildMatchSlopWritingRound(players)],
      phaseDeadline: futureDeadline(52),
    }),
  };
}

function buildMatchSlopVoting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "matchslop-voting",
    title: "MatchSlop Voting",
    description: "Phone controller voting state with opener labels attached to each submitted line.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "VOTING",
      rounds: [buildMatchSlopVotingRound(players)],
      phaseDeadline: futureDeadline(36),
      currentRound: 1,
      votingPromptIndex: 0,
      votingRevealing: false,
    }),
  };
}

const MATCHSLOP_FOLLOW_UP_MODE_STATE = matchSlopModeState({
  personaImage: {
    status: "READY" as const,
    imageUrl: "/images/dev/matchslop-placeholder.jpg",
    updatedAt: "2026-03-19T00:00:00.000Z",
  },
  transcript: MATCHSLOP_ROUND_1_TRANSCRIPT,
  mood: 58,
});

const MATCHSLOP_COMEBACK_MODE_STATE = matchSlopModeState({
  personaImage: {
    status: "READY" as const,
    imageUrl: "/images/dev/matchslop-placeholder.jpg",
    updatedAt: "2026-03-19T00:00:00.000Z",
  },
  comebackRound: 3,
  transcript: MATCHSLOP_UNMATCHED_TRANSCRIPT,
  mood: 15,
});

function buildMatchSlopFollowUpWriting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "matchslop-follow-up-writing",
    title: "MatchSlop Follow-up Writing",
    description: "Round 2 reply writing — player replies to the persona's latest message.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "WRITING",
      currentRound: 2,
      rounds: [buildMatchSlopWritingRound(players, 2)],
      phaseDeadline: futureDeadline(52),
      modeState: MATCHSLOP_FOLLOW_UP_MODE_STATE,
    }),
  };
}

function buildMatchSlopFollowUpVoting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "matchslop-follow-up-voting",
    title: "MatchSlop Follow-up Voting",
    description: "Round 2 voting — flat list with no opener prompt grouping.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "VOTING",
      currentRound: 2,
      rounds: [buildMatchSlopVotingRound(players, 2)],
      phaseDeadline: futureDeadline(36),
      votingPromptIndex: 0,
      votingRevealing: false,
      modeState: MATCHSLOP_FOLLOW_UP_MODE_STATE,
    }),
  };
}

function buildMatchSlopResults(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HUMAN_2_ID) return { ...player, score: 132, humorRating: 1.24 };
    if (player.id === HOST_ID) return { ...player, score: 106, humorRating: 1.16 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 88, humorRating: 1.02 };
    if (player.id === AI_ID) return { ...player, score: 74, humorRating: 0.97 };
    return player;
  });

  return {
    slug: "matchslop-results",
    title: "MatchSlop Results",
    description: "Winning opener revealed and the persona replied.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "ROUND_RESULTS",
      rounds: [buildMatchSlopResultsRound(players)],
      currentRound: 1,
      phaseDeadline: futureDeadline(12),
      modeState: matchSlopModeState({
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
      }),
    }),
  };
}

function buildMatchSlopResultsUnmatched(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HUMAN_2_ID) return { ...player, score: 132, humorRating: 1.24 };
    if (player.id === HOST_ID) return { ...player, score: 106, humorRating: 1.16 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 88, humorRating: 1.02 };
    if (player.id === AI_ID) return { ...player, score: 74, humorRating: 0.97 };
    return player;
  });

  return {
    slug: "matchslop-results-unmatched",
    title: "MatchSlop Results (Unmatched)",
    description: "The round-winning line landed, but Nora unmatched the room and triggered the comeback round.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "ROUND_RESULTS",
      rounds: [buildMatchSlopResultsRound(players)],
      currentRound: 2,
      totalRounds: 2,
      phaseDeadline: futureDeadline(12),
      modeState: matchSlopModeState({
        transcript: MATCHSLOP_UNMATCHED_TRANSCRIPT,
        lastRoundResult: {
          promptId: "match-prompt-2",
          winnerResponseId: "match-response-u2",
          winnerPlayerId: HOST_ID,
          winnerText: "Okay but seriously, do you like bread? Because I knead you in my life.",
          authorName: "Ong",
          weightedVotes: 4,
          rawVotes: 3,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      }),
    }),
  };
}

function buildMatchSlopComebackWriting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "matchslop-comeback-writing",
    title: "MatchSlop Comeback Writing",
    description: "One last follow-up after getting unmatched. Win the room back or go home.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "WRITING",
      currentRound: 3,
      totalRounds: 2,
      rounds: [buildMatchSlopComebackWritingRound(players)],
      phaseDeadline: futureDeadline(52),
      modeState: MATCHSLOP_COMEBACK_MODE_STATE,
    }),
  };
}

function buildMatchSlopComebackVoting(): MockScenario {
  const players = basePlayers();
  return {
    slug: "matchslop-comeback-voting",
    title: "MatchSlop Comeback Voting",
    description: "The room votes on the one message that might rescue the match.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "VOTING",
      currentRound: 3,
      totalRounds: 2,
      rounds: [buildMatchSlopComebackVotingRound(players)],
      phaseDeadline: futureDeadline(36),
      votingPromptIndex: 0,
      votingRevealing: false,
      modeState: MATCHSLOP_COMEBACK_MODE_STATE,
    }),
  };
}

function buildMatchSlopComebackResults(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HOST_ID) return { ...player, score: 168, humorRating: 1.23 };
    if (player.id === HUMAN_2_ID) return { ...player, score: 144, humorRating: 1.18 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 96, humorRating: 1.05 };
    if (player.id === AI_ID) return { ...player, score: 87, humorRating: 0.99 };
    return player;
  });

  return {
    slug: "matchslop-comeback-results",
    title: "MatchSlop Comeback Results",
    description: "The winning rescue line is headed to Nora. Now the game reveals whether it worked.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "ROUND_RESULTS",
      currentRound: 3,
      totalRounds: 2,
      rounds: [buildMatchSlopComebackResultsRound(players)],
      phaseDeadline: futureDeadline(12),
      modeState: matchSlopModeState({
        ...MATCHSLOP_COMEBACK_MODE_STATE,
        lastRoundResult: {
          promptId: "match-prompt-3",
          winnerResponseId: "match-response-host-3",
          winnerPlayerId: HOST_ID,
          winnerText: "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
          authorName: "Ong",
          weightedVotes: 5,
          rawVotes: 3,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      }),
    }),
  };
}

function buildMatchSlopFinal(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HOST_ID) return { ...player, score: 224, humorRating: 1.41, winStreak: 3 };
    if (player.id === HUMAN_2_ID) return { ...player, score: 206, humorRating: 1.32 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 171, humorRating: 1.18 };
    if (player.id === AI_ID) return { ...player, score: 149, humorRating: 1.04 };
    return player;
  });

  return {
    slug: "matchslop-final",
    title: "MatchSlop Final",
    description: "Conversation finished with a sealed date.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "FINAL_RESULTS",
      currentRound: 2,
      modeState: matchSlopModeState({
        outcome: "DATE_SEALED",
        mood: 92,
        personaImage: {
          status: "READY",
          imageUrl: "/images/dev/matchslop-placeholder.jpg",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
        transcript: [
          {
            id: "mt-1",
            speaker: "PLAYERS",
            text: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
            turn: 1,
            outcome: null,
            authorName: "Amy",
            selectedPromptText: "Most reckless thing I've done for love",
            selectedPromptId: "profile-prompt-1",
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
      }),
    }),
  };
}

function buildMatchSlopFinalUnmatched(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HOST_ID) return { ...player, score: 98, humorRating: 0.88 };
    if (player.id === HUMAN_2_ID) return { ...player, score: 112, humorRating: 0.94 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 76, humorRating: 0.81 };
    if (player.id === AI_ID) return { ...player, score: 64, humorRating: 0.72 };
    return player;
  });

  return {
    slug: "matchslop-final-unmatched",
    title: "MatchSlop Comeback Failed",
    description: "The room used its last shot and still got unmatched.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "FINAL_RESULTS",
      currentRound: 3,
      totalRounds: 2,
      modeState: matchSlopModeState({
        outcome: "UNMATCHED",
        mood: 8,
        comebackRound: 3,
        personaImage: {
          status: "READY",
          imageUrl: "/images/dev/matchslop-placeholder.jpg",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
        transcript: [
          ...MATCHSLOP_UNMATCHED_TRANSCRIPT,
          {
            id: "mt-u5",
            speaker: "PLAYERS",
            text: "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
            turn: 3,
            outcome: null,
            authorName: "Ong",
          },
          {
            id: "mt-u6",
            speaker: "PERSONA",
            text: "Strong recovery, but no. I'm committing to the bread.",
            turn: 3,
            outcome: "UNMATCHED",
            authorName: "Nora, 29",
          },
        ],
        lastRoundResult: {
          promptId: "match-prompt-3",
          winnerResponseId: "match-response-host-3",
          winnerPlayerId: HOST_ID,
          winnerText: "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
          authorName: "Ong",
          weightedVotes: 5,
          rawVotes: 3,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      }),
    }),
  };
}

function buildMatchSlopFinalComeback(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HOST_ID) return { ...player, score: 196, humorRating: 1.29, winStreak: 2 };
    if (player.id === HUMAN_2_ID) return { ...player, score: 171, humorRating: 1.22 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 118, humorRating: 1.07 };
    if (player.id === AI_ID) return { ...player, score: 102, humorRating: 1.01 };
    return player;
  });

  return {
    slug: "matchslop-final-comeback",
    title: "MatchSlop Comeback",
    description: "The room pulled off the final save and earned the partial-win ending.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "FINAL_RESULTS",
      currentRound: 3,
      totalRounds: 2,
      modeState: matchSlopModeState({
        outcome: "COMEBACK",
        mood: 45,
        comebackRound: 3,
        personaImage: {
          status: "READY",
          imageUrl: "/images/dev/matchslop-placeholder.jpg",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
        transcript: [
          ...MATCHSLOP_UNMATCHED_TRANSCRIPT,
          {
            id: "mt-c5",
            speaker: "PLAYERS",
            text: "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
            turn: 3,
            outcome: null,
            authorName: "Ong",
          },
          {
            id: "mt-c6",
            speaker: "PERSONA",
            text: "Annoyingly good answer. You don't get the date, but you do get back on the maybe list.",
            turn: 3,
            outcome: "COMEBACK",
            authorName: "Nora, 29",
          },
        ],
        lastRoundResult: {
          promptId: "match-prompt-3",
          winnerResponseId: "match-response-host-3",
          winnerPlayerId: HOST_ID,
          winnerText: "Fair. But if the bread flakes on you, I make an incredible emotional support butter board.",
          authorName: "Ong",
          weightedVotes: 5,
          rawVotes: 3,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      }),
    }),
  };
}

function buildMatchSlopFinalTurnLimit(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HOST_ID) return { ...player, score: 156, humorRating: 1.12 };
    if (player.id === HUMAN_2_ID) return { ...player, score: 189, humorRating: 1.28 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 134, humorRating: 1.06 };
    if (player.id === AI_ID) return { ...player, score: 121, humorRating: 0.99 };
    return player;
  });

  return {
    slug: "matchslop-final-turn-limit",
    title: "MatchSlop Turn Limit",
    description: "Ran out of rounds without a clear outcome.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "FINAL_RESULTS",
      currentRound: 2,
      totalRounds: 2,
      modeState: matchSlopModeState({
        outcome: "TURN_LIMIT",
        mood: 55,
        personaImage: {
          status: "READY",
          imageUrl: "/images/dev/matchslop-placeholder.jpg",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
        transcript: [
          {
            id: "mt-t1",
            speaker: "PLAYERS",
            text: "I see you're into farmer's markets. I once bought a squash so large it got its own seat on the bus.",
            turn: 1,
            outcome: null,
            authorName: "Amy",
            selectedPromptText: "Their photo",
            selectedPromptId: "__photo__",
          },
          {
            id: "mt-t2",
            speaker: "PERSONA",
            text: "Respect for the squash. What happened next — did it pay for its own ticket?",
            turn: 1,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
          {
            id: "mt-t3",
            speaker: "PLAYERS",
            text: "It tried to tap its Oyster card but fumbled. We've been inseparable since the incident.",
            turn: 2,
            outcome: null,
            authorName: "Ong",
          },
          {
            id: "mt-t4",
            speaker: "PERSONA",
            text: "Okay, that's genuinely funny. I need to think about this one...",
            turn: 2,
            outcome: "TURN_LIMIT",
            authorName: "Nora, 29",
          },
        ],
        lastRoundResult: {
          promptId: "match-prompt-2",
          winnerResponseId: "match-response-t2",
          winnerPlayerId: HOST_ID,
          winnerText: "It tried to tap its Oyster card but fumbled. We've been inseparable since the incident.",
          authorName: "Ong",
          weightedVotes: 5,
          rawVotes: 3,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      }),
    }),
  };
}

function buildMatchSlopResultsLastTurnLong(): MockScenario {
  const players = basePlayers().map((player) => {
    if (player.id === HOST_ID) return { ...player, score: 412, humorRating: 1.38, winStreak: 2 };
    if (player.id === HUMAN_2_ID) return { ...player, score: 387, humorRating: 1.31 };
    if (player.id === HUMAN_3_ID) return { ...player, score: 294, humorRating: 1.14 };
    if (player.id === AI_ID) return { ...player, score: 261, humorRating: 1.01 };
    return player;
  });

  return {
    slug: "matchslop-results-last-turn-long",
    title: "MatchSlop Results (Last Turn, Long Convo)",
    description:
      "Final round results with a long transcript — 5 turns of back-and-forth, danger warning, high scores.",
    playerId: HOST_ID,
    game: makeMatchSlopGame({
      players,
      status: "ROUND_RESULTS",
      currentRound: 5,
      totalRounds: 5,
      rounds: [buildMatchSlopResultsRound(players)],
      phaseDeadline: futureDeadline(12),
      modeState: matchSlopModeState({
        personaImage: {
          status: "READY",
          imageUrl: "/images/dev/matchslop-placeholder.jpg",
          updatedAt: "2026-03-19T00:00:00.000Z",
        },
        transcript: [
          {
            id: "ml-1",
            speaker: "PLAYERS",
            text: "You had me at reckless anchovies. I too enjoy flirting with coastal danger.",
            turn: 1,
            outcome: null,
            authorName: "Amy",
          },
          {
            id: "ml-2",
            speaker: "PERSONA",
            text: "Coastal danger is my whole brand. Last Sunday I cured fish on my fire escape and the seagulls formed a queue.",
            turn: 1,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
          {
            id: "ml-3",
            speaker: "PLAYERS",
            text: "A seagull queue sounds like the start of a heist movie. Were you the ringleader or the distraction?",
            turn: 2,
            outcome: null,
            authorName: "Ong",
          },
          {
            id: "ml-4",
            speaker: "PERSONA",
            text: "Distraction, obviously. I was holding a baguette like a sword. The lead gull handled logistics.",
            turn: 2,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
          {
            id: "ml-5",
            speaker: "PLAYERS",
            text: "I respect anyone who outsources to seagulls. My management style is more 'negotiating with raccoons in the alley behind my apartment.'",
            turn: 3,
            outcome: null,
            authorName: "Beau",
          },
          {
            id: "ml-6",
            speaker: "PERSONA",
            text: "Raccoon diplomacy is underrated. Do they accept snacks as currency or are they strictly barter?",
            turn: 3,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
          {
            id: "ml-7",
            speaker: "PLAYERS",
            text: "Strictly barter. Last week I traded a rotisserie chicken leg for safe passage to the dumpster. Felt like a medieval toll road.",
            turn: 4,
            outcome: null,
            authorName: "Amy",
          },
          {
            id: "ml-8",
            speaker: "PERSONA",
            text: "A rotisserie toll road is the most romantic thing anyone has ever described to me. Keep going, you have one more chance to seal this.",
            turn: 4,
            outcome: "CONTINUE",
            authorName: "Nora, 29",
          },
          {
            id: "ml-9",
            speaker: "PLAYERS",
            text: "If the raccoons approve, I'd like to take you to the fire escape for a cured fish tasting and a seagull debrief. Thursday. I'll bring limes.",
            turn: 5,
            outcome: null,
            authorName: "Ong",
          },
        ],
        lastRoundResult: {
          promptId: "match-prompt-5",
          winnerResponseId: "match-response-5",
          winnerPlayerId: HOST_ID,
          winnerText:
            "If the raccoons approve, I'd like to take you to the fire escape for a cured fish tasting and a seagull debrief. Thursday. I'll bring limes.",
          authorName: "Ong",
          weightedVotes: 7,
          rawVotes: 4,
          selectedPromptId: null,
          selectedPromptText: null,
        },
      }),
    }),
  };
}

export const MATCHSLOP_SCENARIOS: MockScenario[] = [
  buildMatchSlopLobby(),
  buildMatchSlopWriting(),
  buildMatchSlopVoting(),
  buildMatchSlopResults(),
  buildMatchSlopFollowUpWriting(),
  buildMatchSlopFollowUpVoting(),
  buildMatchSlopResultsUnmatched(),
  buildMatchSlopComebackWriting(),
  buildMatchSlopComebackVoting(),
  buildMatchSlopComebackResults(),
  buildMatchSlopFinalComeback(),
  buildMatchSlopFinal(),
  buildMatchSlopFinalUnmatched(),
  buildMatchSlopFinalTurnLimit(),
  buildMatchSlopResultsLastTurnLong(),
];

export const MOCK_SCENARIOS: MockScenario[] = [
  ...SLOPLASH_SCENARIOS,
  ...CHATSLOP_SCENARIOS,
  ...MATCHSLOP_SCENARIOS,
];

export function getMockScenario(slug: string): MockScenario | undefined {
  return MOCK_SCENARIOS.find((scenario) => scenario.slug === slug);
}
