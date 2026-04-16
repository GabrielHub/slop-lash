import type { GameResponse, GameState } from "@/lib/types";
import { getComebackRound, getMockScenario } from "./scenarios";
import type { MatchSlopOutcome } from "@/games/matchslop/types";

export type MockMatchSlopSharedState = {
  actionLog: string[];
  game: GameState;
  lastAction: string | null;
  revision: number;
  updatedAt: string;
};

type StoredMockMatchSlopSharedState = MockMatchSlopSharedState & {
  storageVersion: 1;
};

type JsonObject = Record<string, unknown>;
type VoteResult =
  | { error: string; game: null }
  | { error: null; game: GameState | null };

const MAX_ACTION_LOG = 12;
const STORAGE_VERSION = 1;

function cloneGame(game: GameState): GameState {
  return structuredClone(game);
}

function nowIso() {
  return new Date().toISOString();
}

function storageKey(slug: string) {
  return `mock-matchslop:${slug}:shared-state`;
}

function eventName(slug: string) {
  return `mock-matchslop:update:${slug}`;
}

function channelName(slug: string) {
  return `mock-matchslop:${slug}:shared-state`;
}

function createStoredState(game: GameState): StoredMockMatchSlopSharedState {
  return {
    storageVersion: STORAGE_VERSION,
    actionLog: [],
    game: cloneGame(game),
    lastAction: null,
    revision: 0,
    updatedAt: nowIso(),
  };
}

function futureDeadline(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function withScenarioGame(
  slug: string,
  patch?: (game: GameState) => GameState,
): GameState | null {
  const found = getMockScenario(slug);
  if (!found) return null;
  const next = cloneGame(found.game);
  return patch ? patch(next) : next;
}

function asOutcome(game: GameState): MatchSlopOutcome {
  const outcome = (game.modeState as { outcome?: unknown } | null)?.outcome;
  if (
    outcome === "IN_PROGRESS" ||
    outcome === "DATE_SEALED" ||
    outcome === "UNMATCHED" ||
    outcome === "TURN_LIMIT" ||
    outcome === "COMEBACK"
  ) {
    return outcome;
  }
  return "IN_PROGRESS";
}

function finalScenarioSlugForOutcome(outcome: Exclude<MatchSlopOutcome, "IN_PROGRESS">) {
  switch (outcome) {
    case "DATE_SEALED":
      return "matchslop-final";
    case "UNMATCHED":
      return "matchslop-final-unmatched";
    case "COMEBACK":
      return "matchslop-final-comeback";
    case "TURN_LIMIT":
      return "matchslop-final-turn-limit";
  }
}

function omitScore(player: GameState["players"][number]): GameResponse["player"] {
  const { score, ...rest } = player;
  void score;
  return rest;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value != null;
}

function parseStoredState(raw: string | null, fallbackGame: GameState): StoredMockMatchSlopSharedState {
  if (!raw) return createStoredState(fallbackGame);

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.storageVersion !== STORAGE_VERSION) {
      return createStoredState(fallbackGame);
    }
    if (!isRecord(parsed.game) || typeof parsed.game.status !== "string") {
      return createStoredState(fallbackGame);
    }

    return {
      storageVersion: STORAGE_VERSION,
      actionLog: Array.isArray(parsed.actionLog)
        ? parsed.actionLog.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_ACTION_LOG)
        : [],
      game: cloneGame(parsed.game as unknown as GameState),
      lastAction: typeof parsed.lastAction === "string" ? parsed.lastAction : null,
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    };
  } catch {
    return createStoredState(fallbackGame);
  }
}

function persistSharedState(slug: string, state: MockMatchSlopSharedState) {
  if (typeof window === "undefined") return;

  const stored: StoredMockMatchSlopSharedState = {
    storageVersion: STORAGE_VERSION,
    ...state,
  };

  window.localStorage.setItem(storageKey(slug), JSON.stringify(stored));
  window.dispatchEvent(new CustomEvent(eventName(slug), { detail: state }));

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName(slug));
    channel.postMessage(state);
    channel.close();
  }
}

function mergeRoundResponses(currentGame: GameState, fixture: GameState) {
  const currentPrompt = currentGame.rounds[0]?.prompts[0];
  const fixturePrompt = fixture.rounds[0]?.prompts[0];
  if (!currentPrompt || !fixturePrompt || currentPrompt.responses.length === 0) {
    return fixture;
  }

  const responseIds = new Set(currentPrompt.responses.map((response) => response.playerId));
  fixturePrompt.responses = [
    ...currentPrompt.responses,
    ...fixturePrompt.responses.filter((response) => !responseIds.has(response.playerId)),
  ];
  return fixture;
}

export function createMockMatchSlopSharedState(game: GameState): MockMatchSlopSharedState {
  const { storageVersion, ...state } = createStoredState(game);
  void storageVersion;
  return state;
}

export function readSharedMatchSlopState(
  slug: string,
  fallbackGame: GameState,
): MockMatchSlopSharedState {
  if (typeof window === "undefined") {
    return createMockMatchSlopSharedState(fallbackGame);
  }

  const { storageVersion, ...state } = parseStoredState(
    window.localStorage.getItem(storageKey(slug)),
    fallbackGame,
  );
  void storageVersion;
  return state;
}

export function subscribeToSharedMatchSlopState(
  slug: string,
  fallbackGame: GameState,
  onState: (state: MockMatchSlopSharedState) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleState = (state?: MockMatchSlopSharedState) => {
    onState(state ?? readSharedMatchSlopState(slug, fallbackGame));
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey(slug)) return;
    handleState();
  };

  const handleCustom = (event: Event) => {
    handleState((event as CustomEvent<MockMatchSlopSharedState>).detail);
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(eventName(slug), handleCustom as EventListener);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(channelName(slug));
    channel.addEventListener("message", (event: MessageEvent<MockMatchSlopSharedState>) => {
      handleState(event.data);
    });
  }

  handleState();

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(eventName(slug), handleCustom as EventListener);
    channel?.close();
  };
}

export function resetSharedMatchSlopState(
  slug: string,
  fallbackGame: GameState,
): MockMatchSlopSharedState {
  const next = createMockMatchSlopSharedState(fallbackGame);
  persistSharedState(slug, next);
  return next;
}

export function mutateSharedMatchSlopState(
  slug: string,
  fallbackGame: GameState,
  actionLabel: string | null,
  mutate: (game: GameState) => GameState | null,
): MockMatchSlopSharedState {
  const current = readSharedMatchSlopState(slug, fallbackGame);
  const nextGame = mutate(cloneGame(current.game));
  if (nextGame == null) return current;

  const next: MockMatchSlopSharedState = {
    actionLog:
      actionLabel == null
        ? current.actionLog
        : [`${new Date().toLocaleTimeString()}: ${actionLabel}`, ...current.actionLog].slice(
            0,
            MAX_ACTION_LOG,
          ),
    game: nextGame,
    lastAction: actionLabel ?? current.lastAction,
    revision: current.revision + 1,
    updatedAt: nowIso(),
  };

  persistSharedState(slug, next);
  return next;
}

export function makeMockCode(slug: string): string {
  return `mock-${slug}`;
}

export function startMockMatchSlopGame(currentGame: GameState): GameState | null {
  return withScenarioGame("matchslop-writing", (fixture) => ({
    ...fixture,
    currentRound: currentGame.currentRound,
    totalRounds: currentGame.totalRounds,
  }));
}

export function advanceMockMatchSlopGame(currentGame: GameState): GameState | null {
  const comebackRound = getComebackRound(currentGame);
  const isComebackRound = comebackRound != null && currentGame.currentRound === comebackRound;

  if (currentGame.status === "WRITING") {
    const votingSlug = isComebackRound
      ? "matchslop-comeback-voting"
      : currentGame.currentRound === 1
        ? "matchslop-voting"
        : "matchslop-follow-up-voting";

    return withScenarioGame(votingSlug, (fixture) =>
      mergeRoundResponses(currentGame, {
        ...fixture,
        currentRound: currentGame.currentRound,
        totalRounds: currentGame.totalRounds,
        modeState: {
          ...fixture.modeState,
          comebackRound,
        },
      }),
    );
  }

  if (currentGame.status === "VOTING" && !currentGame.votingRevealing) {
    return {
      ...cloneGame(currentGame),
      phaseDeadline: futureDeadline(8),
      version: currentGame.version + 1,
      votingRevealing: true,
    };
  }

  if (currentGame.status === "VOTING") {
    return withScenarioGame(
      isComebackRound
        ? "matchslop-comeback-results"
        : currentGame.currentRound >= currentGame.totalRounds
          ? "matchslop-results-unmatched"
          : "matchslop-results",
      (fixture) => ({
        ...fixture,
        currentRound: currentGame.currentRound,
        totalRounds: currentGame.totalRounds,
        modeState: {
          ...fixture.modeState,
          comebackRound,
        },
      }),
    );
  }

  if (currentGame.status === "ROUND_RESULTS") {
    return withScenarioGame(
      isComebackRound
        ? "matchslop-final-comeback"
        : currentGame.currentRound >= currentGame.totalRounds
          ? "matchslop-comeback-writing"
          : "matchslop-follow-up-writing",
      (fixture) => ({
        ...fixture,
        currentRound:
          isComebackRound || currentGame.currentRound >= currentGame.totalRounds
            ? currentGame.currentRound
            : currentGame.currentRound + 1,
        totalRounds: currentGame.totalRounds,
        modeState: {
          ...fixture.modeState,
          comebackRound: isComebackRound ? comebackRound : currentGame.currentRound + 1,
        },
      }),
    );
  }

  if (currentGame.status === "FINAL_RESULTS") {
    return withScenarioGame("matchslop-final");
  }

  return null;
}

export function endMockMatchSlopGame(currentGame: GameState): GameState | null {
  if (currentGame.status === "LOBBY" || currentGame.status === "FINAL_RESULTS") {
    return null;
  }

  const currentOutcome = asOutcome(currentGame);
  const terminalOutcome =
    currentOutcome === "IN_PROGRESS" ? "TURN_LIMIT" : currentOutcome;
  const slug = finalScenarioSlugForOutcome(terminalOutcome);

  return withScenarioGame(slug, (fixture) => ({
    ...fixture,
    currentRound: currentGame.currentRound,
    totalRounds: currentGame.totalRounds,
    modeState: {
      ...fixture.modeState,
      outcome: terminalOutcome,
      comebackRound:
        (currentGame.modeState as { comebackRound?: number | null } | null)?.comebackRound ?? null,
    },
  }));
}

export function recordMockMatchSlopResponse(
  currentGame: GameState,
  promptId: string,
  responderId: string,
  text: string,
  selectedPromptId: string | null,
): GameState | null {
  if (!promptId || !responderId || !text) return null;

  const next = cloneGame(currentGame);
  const prompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
  const player = next.players.find((entry) => entry.id === responderId);
  if (!prompt || !player) return null;
  if (prompt.responses.some((response) => response.playerId === responderId)) {
    return null;
  }

  prompt.responses.push({
    id: `match-response-${Date.now()}`,
    promptId,
    playerId: responderId,
    metadata: { selectedPromptId },
    text,
    pointsEarned: 0,
    failReason: null,
    reactions: [],
    player: omitScore(player),
  });
  next.version += 1;
  return next;
}

export function voteMockMatchSlopResponse(
  currentGame: GameState,
  promptId: string,
  voterId: string,
  responseId: string | null,
): VoteResult {
  if (!promptId || !voterId) {
    return { error: "Invalid vote payload", game: null };
  }

  const prompt = currentGame.rounds[0]?.prompts.find((entry) => entry.id === promptId);
  const ownResponse = prompt?.responses.find((response) => response.playerId === voterId) ?? null;
  if (ownResponse && ownResponse.id === responseId) {
    return { error: "Cannot vote for yourself", game: null };
  }

  const next = cloneGame(currentGame);
  const nextPrompt = next.rounds[0]?.prompts.find((entry) => entry.id === promptId);
  const voter = next.players.find((entry) => entry.id === voterId);
  if (!nextPrompt || !voter) {
    return { error: null, game: null };
  }
  if (nextPrompt.votes.some((vote) => vote.voterId === voterId)) {
    return { error: null, game: null };
  }

  nextPrompt.votes.push({
    id: `match-vote-${Date.now()}`,
    promptId,
    voterId,
    responseId,
    failReason: null,
    voter: { id: voterId, type: voter.type },
  });
  next.version += 1;
  return { error: null, game: next };
}
