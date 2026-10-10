import { fixturePlayer, fixtureView, type Fixture } from "./base";

// Foundation fixtures for the shell flags (ownsLobby, chrome). The Controller
// and Stage workstreams replace them with real SlopFight moments.

const cast = [fixturePlayer("sf-jo", "Jo"), fixturePlayer("sf-priya", "Priya")];
const room = { gameType: "SLOPFIGHT", minPlayers: 2, maxPlayers: 4 } as const;
const mode = { kind: "SLOPFIGHT" } as const;

export const slopfightFixtures: Fixture[] = [
  {
    id: "slopfight-lobby",
    label: "Lobby: two players, host's view",
    view: fixtureView(cast, room, mode),
  },
  {
    id: "slopfight-build",
    label: "Build: the stub phase",
    view: fixtureView(cast, { ...room, status: "PLAYING", phase: "BUILD", round: 1 }, mode),
  },
];
