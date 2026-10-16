import { FIXTURE_NOW, fixtureView, type Fixture } from "./base";
import { EMPTY_RECORD } from "@/games/slopfight/tournament";
import {
  jo,
  priya,
  DUO,
  FOUR,
  ROOM,
  LARRY,
  LARRY_UNBOUND,
  JELLY,
  LARRY_STROKES,
  JETPACK_STROKES,
  SMUDGE_STROKES,
  doodle,
  ready,
  forging,
  mode,
  playing,
  NIGHT_DOODLES,
  nightView,
  patch,
  patches,
  buildView,
  fourBuild,
  fourFaceOff,
  faceOffRoom,
  fightRoom,
  resultRoom,
  withoutBets,
  onlyBets,
  simPending,
  bySeed,
  UPGRADE_ROOM,
  upgradeFighters,
  UPGRADE_CURSOR,
} from "./slopfight/night";

export { slopfightFixtureData } from "./slopfight/night";

// --- Fixtures ---

const lobbyMode = mode({ arenas: [], round: 0, doodles: null });

export const slopfightFixtures: Fixture[] = [
  {
    id: "slopfight-lobby",
    label: "Lobby: two players, host's view",
    view: fixtureView(DUO, ROOM, lobbyMode),
  },
  {
    id: "slopfight-lobby-four",
    label: "Lobby: four players, a guest's view",
    view: fixtureView(FOUR, ROOM, lobbyMode, { viewer: priya }),
  },
  {
    id: "slopfight-build-choosing",
    label: "Build: Draw it or Describe it",
    view: buildView({}),
  },
  {
    id: "slopfight-build-drawing",
    label: "Build: drawing, strokes on the server",
    view: buildView(
      { status: "DRAWING", inputKind: "DRAW" },
      { doodles: doodle("night", 0, 0, LARRY_STROKES.slice(0, 11)) },
    ),
  },
  {
    id: "slopfight-build-describing",
    label: "Build: describing (Priya)",
    view: buildView(
      { status: "DRAWING", inputKind: "DRAW" },
      {
        priya: { status: "DESCRIBING", inputKind: "DESCRIBE" },
        viewer: priya,
      },
    ),
  },
  {
    id: "slopfight-build-forging",
    label: "Build: submitted, the Foundry is forging",
    view: buildView(
      // Three parts in; Larry is a biped, so the soft target is a typical biped's 8.
      { inputKind: "DRAW", ...forging("SUBMIT", 0, 7_000, { streamed: 3, target: 8 }) },
      { doodles: doodle("night", 0, 0, LARRY_STROKES) },
    ),
  },
  {
    id: "slopfight-build-ready",
    label: "Build: forged, the champion card",
    view: buildView(
      {
        inputKind: "DRAW",
        ...ready(LARRY),
        forge: { kind: "SUBMIT", version: 0, startedAt: FIXTURE_NOW - 21_000 },
      },
      { doodles: doodle("night", 0, 0, LARRY_STROKES) },
    ),
  },
  {
    id: "slopfight-build-rejected",
    label: "Build: the drawing was rejected",
    view: buildView(
      {
        status: "REJECTED",
        inputKind: "DRAW",
        rejection: {
          reason: "The canvas is blank. The Foundry needs something to forge.",
          suggestion: "Draw your champion. A blob with eyes counts.",
        },
      },
      { doodles: doodle("night", 0, 0, SMUDGE_STROKES) },
    ),
  },
  {
    id: "slopfight-build-rejected-describe",
    label: "Build: the description was rejected (Priya)",
    view: buildView(
      { status: "DRAWING", inputKind: "DRAW" },
      {
        viewer: priya,
        priya: {
          status: "REJECTED",
          inputKind: "DESCRIBE",
          rejection: {
            reason: "That's a real person. The Foundry only forges made-up champions.",
            suggestion: "Try a creature inspired by them instead.",
          },
        },
      },
    ),
  },
  {
    id: "slopfight-build-four",
    label: "Build: four humans, one forged, Maximilian gone",
    view: fourBuild(),
  },
  {
    id: "slopfight-foundry",
    label: "Foundry: waiting on Priya's forge",
    view: nightView(
      { phase: "FOUNDRY", round: 1 },
      playing("FOUNDRY", 1, { phaseDeadline: null, awaitingAi: true }),
      {
        fighters: patches(
          patch(0, { version: 0, record: EMPTY_RECORD }),
          patch(1, { ...forging("LENIENT", 0, 12_000), champion: null, record: EMPTY_RECORD }),
          patch(2, { record: EMPTY_RECORD }),
          patch(3, { record: EMPTY_RECORD }),
        ),
      },
    ),
  },
  {
    id: "slopfight-foundry-parked",
    label: "Foundry: jammed, host retry",
    view: nightView(
      { phase: "FOUNDRY", round: 1 },
      playing("FOUNDRY", 1, { phaseDeadline: null }),
      {
        fighters: patch(1, {
          status: "FAILED",
          champion: null,
          failure: "timeout",
          forge: { kind: "LENIENT", version: 0, startedAt: FIXTURE_NOW - 70_000 },
        }),
        extra: { foundryParked: true },
      },
    ),
  },
  {
    id: "slopfight-foundry-parked-guest",
    label: "Foundry: jammed, Priya's view",
    view: nightView(
      { phase: "FOUNDRY", round: 1 },
      playing("FOUNDRY", 1, { phaseDeadline: null }),
      {
        viewer: priya,
        fighters: patch(1, {
          status: "FAILED",
          champion: null,
          failure: "timeout",
          forge: { kind: "LENIENT", version: 0, startedAt: FIXTURE_NOW - 70_000 },
        }),
        extra: { foundryParked: true },
      },
    ),
  },
  {
    id: "slopfight-roster",
    label: "Roster: get ready",
    view: nightView(
      { phase: "ROSTER", round: 1 },
      playing("ROSTER", 1, { phaseDeadline: FIXTURE_NOW + 12_000 }),
    ),
  },
  {
    id: "slopfight-face-off",
    label: "Face-off: your own fight, no bets yet",
    view: nightView({ phase: "FACE_OFF", round: 1, step: 0 }, faceOffRoom(1, 0), {
      fights: withoutBets(1, 0),
    }),
  },
  {
    id: "slopfight-face-off-bets",
    label: "Face-off: Priya bet on herself, Jo hasn't",
    view: nightView({ phase: "FACE_OFF", round: 1, step: 1 }, faceOffRoom(1, 1), {
      fights: onlyBets(1, 1, [priya], []),
    }),
  },
  {
    id: "slopfight-face-off-my-bet",
    label: "Face-off: Jo backs the shark",
    view: nightView({ phase: "FACE_OFF", round: 1, step: 1 }, faceOffRoom(1, 1)),
  },
  {
    id: "slopfight-face-off-four",
    label: "Face-off: four humans, Sam's view, Maximilian absent",
    view: fourFaceOff(),
  },
  {
    id: "slopfight-fight",
    label: "Fight: mid-fight, hype",
    view: nightView({ phase: "FIGHT", round: 1, step: 1 }, fightRoom(1, 1)),
  },
  {
    id: "slopfight-fight-owner",
    label: "Fight: your champion is fighting",
    view: nightView({ phase: "FIGHT", round: 1, step: 0 }, fightRoom(1, 0)),
  },
  {
    id: "slopfight-fight-waiting",
    label: "Fight: the sim is still running",
    view: nightView({ phase: "FIGHT", round: 1, step: 1 }, fightRoom(1, 1), {
      fights: simPending(1, 1),
    }),
  },
  {
    id: "slopfight-fight-seed",
    label: "Fight: the seed decides (coin flip)",
    view: nightView({ phase: "FIGHT", round: 2, step: 0 }, fightRoom(2, 0), {
      fights: bySeed(2, 0),
    }),
  },
  {
    id: "slopfight-result-ko",
    label: "Result: KO, your win",
    view: nightView({ phase: "RESULT", round: 1, step: 0 }, resultRoom(1, 0)),
  },
  {
    id: "slopfight-result-ringout",
    label: "Result: ring-out, bet won",
    view: nightView({ phase: "RESULT", round: 1, step: 1 }, resultRoom(1, 1)),
  },
  {
    id: "slopfight-result-bet-lost",
    label: "Result: ring-out, Priya's bet lost",
    view: nightView({ phase: "RESULT", round: 1, step: 1 }, resultRoom(1, 1), { viewer: priya }),
  },
  {
    id: "slopfight-result-decision",
    label: "Result: decision, house fight, bet won",
    view: nightView({ phase: "RESULT", round: 2, step: 0 }, resultRoom(2, 0)),
  },
  {
    id: "slopfight-result-seed",
    label: "Result: the seed decided",
    view: nightView({ phase: "RESULT", round: 2, step: 0 }, resultRoom(2, 0), {
      fights: bySeed(2, 0),
    }),
  },
  {
    id: "slopfight-standings",
    label: "Standings: after round 1",
    view: nightView(
      { phase: "STANDINGS", round: 1 },
      playing("STANDINGS", 1, { phaseDeadline: FIXTURE_NOW + 5_000 }),
    ),
  },
  {
    id: "slopfight-upgrade",
    label: "Upgrade: add one thing",
    view: nightView(UPGRADE_CURSOR, UPGRADE_ROOM, { fighters: upgradeFighters({}) }),
  },
  {
    id: "slopfight-upgrade-drawing",
    label: "Upgrade: drawing over the old layer",
    view: nightView(UPGRADE_CURSOR, UPGRADE_ROOM, {
      fighters: upgradeFighters({}),
      extra: { doodles: [...NIGHT_DOODLES, ...doodle("night", 0, 2, JETPACK_STROKES)] },
    }),
  },
  {
    id: "slopfight-upgrade-forging",
    label: "Upgrade: submitted, forging",
    view: nightView(UPGRADE_CURSOR, UPGRADE_ROOM, {
      fighters: upgradeFighters({
        // An upgrade's soft target is the old sheet's parts plus two.
        ...forging("UPGRADE", 2, 6_000, { streamed: 5, target: LARRY.parts.length + 2 }),
        addition: { round: 2, kind: "DESCRIBE", text: "a jetpack" },
      }),
    }),
  },
  {
    id: "slopfight-upgrade-forged",
    label: "Upgrade: old and new",
    view: nightView(
      { phase: "FOUNDRY", round: 2 },
      playing("FOUNDRY", 2, { phaseDeadline: null, awaitingAi: true }),
      {
        fighters: patches(
          upgradeFighters(
            {
              ...ready(LARRY_UNBOUND),
              previous: LARRY,
              version: 2,
              addition: { round: 2, kind: "DESCRIBE", text: "a jetpack" },
            },
            { ...forging("LENIENT_UPGRADE", 2, 3_000) },
          ),
        ),
      },
    ),
  },
  {
    id: "slopfight-upgrade-kept",
    label: "Upgrade: Priya added nothing",
    view: nightView(
      { phase: "FOUNDRY", round: 2 },
      playing("FOUNDRY", 2, { phaseDeadline: null, awaitingAi: true }),
      {
        viewer: priya,
        fighters: upgradeFighters(
          { ...forging("UPGRADE", 2, 5_000), addition: null },
          { ...ready(JELLY), previous: JELLY, version: 2 },
        ),
      },
    ),
  },
  {
    id: "slopfight-final-face-off",
    label: "Final: face-off, double points",
    view: nightView({ phase: "FACE_OFF", round: 3, step: 1 }, faceOffRoom(3, 1), {
      fights: onlyBets(3, 1, [priya], [jo]),
    }),
  },
  {
    id: "slopfight-final-fight",
    label: "Final: Larry fights for the trophy",
    view: nightView({ phase: "FIGHT", round: 3, step: 1 }, fightRoom(3, 1)),
  },
  {
    id: "slopfight-final-result",
    label: "Final: ring-out, Jo wins it all",
    view: nightView({ phase: "RESULT", round: 3, step: 1 }, resultRoom(3, 1)),
  },
  {
    id: "slopfight-finished",
    label: "Finished: podium, Jo's view",
    view: nightView(
      { phase: "FINISHED" },
      { status: "FINISHED", phase: "FINISHED", round: 3, step: 1, phaseDeadline: null },
    ),
  },
  {
    id: "slopfight-finished-guest",
    label: "Finished: podium, Priya's view",
    view: nightView(
      { phase: "FINISHED" },
      { status: "FINISHED", phase: "FINISHED", round: 3, step: 1, phaseDeadline: null },
      { viewer: priya },
    ),
  },
  {
    id: "slopfight-finished-recap",
    label: "Finished: the recap (no seat)",
    view: nightView(
      { phase: "FINISHED" },
      { status: "FINISHED", phase: "FINISHED", round: 3, step: 1, phaseDeadline: null },
      { viewer: null },
    ),
  },
];
