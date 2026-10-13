# Architecture

Slop-Lash is a Next.js application backed by Convex. React consumes live state
directly through typed Convex hooks, while server-side actions integrate with AI
and media providers. This document records the durable boundaries; code and
checked-in schemas remain the source of truth for implementation details.

## Runtime Boundaries

### Next.js and React

Next.js 16.4 and React 19 own routing, rendering, layouts, and browser UI. The
root Convex provider creates the browser client from `NEXT_PUBLIC_CONVEX_URL`.
Every room screen reads one subscription, `views.room`, through the room
provider in `src/room/`, rather than keeping a parallel client cache.

Use the hook that matches the operation:

| Hook                | Use                                                                          |
| ------------------- | ---------------------------------------------------------------------------- |
| `useQuery`          | Bounded reactive reads that should update when Convex data changes           |
| `usePaginatedQuery` | Reactive collections that can outgrow one bounded page                       |
| `useMutation`       | Transactional, deterministic writes to Convex state                          |
| `useAction`         | External APIs, nondeterministic setup, media work, or Node.js-only execution |

Mutations guard capabilities and revalidate game phase, round, participant, and
generation identifiers at the write boundary. The UI may be optimistic, but
Convex remains authoritative.

Room creation and joining use actions because they generate or hash
cryptographic capability material, then delegate the durable write to an
internal mutation. Normal game transitions call public mutations directly.

## Rooms and the Game Engine

Every game mode runs on one engine (`convex/engine.ts`). A `games` row holds
the room's `status` (LOBBY, PLAYING, FINISHED), its `phase`, `step`, and
`round`, a `phaseGeneration` that increases on every transition, and an
optional `phaseDeadline`. `enterPhase` is the only code that changes a phase.

A mode (`convex/<mode>/mode.ts`, registered in `convex/modes.ts`) supplies:

- `start`, which picks the first phase;
- `isComplete`, which says whether everyone present has acted;
- `next`, which closes the current phase, filling gaps such as forfeits or
  timed-out votes, and returns the next phase or `FINISH`;
- optional `createRoom`, `onEnter`, `onFinish`, and `onPlayerRemoved` hooks;
- an optional `rematch` hook, which sets up the mode's own state when a
  finished game is played again (MatchSlop seeds a fresh persona);
- `keepsRecaps` when finished rooms should outlive the one-hour cleanup.

Scoring happens on the server as soon as the result is shown: SlopLash scores
each matchup when it is revealed, and QuizSlop marks answers and Slop Calls
when answers lock. Screens display those numbers rather than recomputing them.

A phase whose only wait is on AI (a MatchSlop persona writing its profile or a
reply) gets a watchdog deadline: the engine still advances when it passes, but
screens show no countdown.

Games advance in one of three ways:

- A player action calls `settle`, which advances when everyone present is done.
- A deadline fires `tick`.
- The host presses next.

Each path checks the phase generation, so a double tap, a late timer, or a
stale vote can never advance twice. A cron sweep every 15 seconds catches lost
ticks, rooms that are waiting only on absent players, and hosts who have been
gone for about 30 seconds; it hands host controls to a present player. The
sweep keeps doing that for a finished game for 30 minutes
(`REMATCH_WINDOW_MS`), while it is still the room's live game, so "Play again"
never leaves with a host who walked off at the results. If a mode throws while
advancing, the engine ends the game rather than leaving the room stuck.

### Play again

A room code is a chain of games. Each `games` row carries a `gameNumber` (1 for
a new room, +1 for each "Play again"), and the newest game for a code is the
live one: `findGameByCode` returns it, so joining and `views.watch` always land
there. `findGameByNumber` reaches an older one.

`rooms.playAgain` (host only, FINISHED only) inserts the next game with the same
code and settings, gives every carried player a fresh seat with a score of 0,
and moves their sessions to the new game in place. Capability strings don't
change, so every phone and TV follows through the subscription it already
holds. It carries AI seats, the caller, and humans whose tab is online or
dropped within a minute of the end; a player who left mid-game, or tapped Done
(`rooms.leave`), stays on the finished game, whose view then reports the
rematch in `room.next` so that seat can join it in one tap. Presence for the
old game is cleared, because the presence component refuses a tab that beats
into a second room. A Free Play rematch claims a daily slot in the same
transaction, and refuses with a readable message once the cap is spent.

The finished game is never touched, so its recap and leaderboard projection
stay valid. Recaps are addressed by number: `/game/CODE/recap` is game 1 and
`/game/CODE/recap?game=N` is game N (`views.recap` takes `gameNumber`).

AI work is a job (`convex/jobs.ts`). Each job has:

- a `prepare` step, which reads what the model needs;
- a Node.js runner (`convex/jobRunner.ts`);
- an `apply` step, which writes the result if the job is still current;
- a `fallback`, which writes a safe default if the call fails or times out.

A failed model call always yields a forfeit, an abstention, or a canned line,
so AI never blocks a phase.

Players hold a capability (session) per seat. A player whose tab is gone can
reclaim their seat from any device by joining again with the same name; a seat
held by a live tab cannot be taken. A TV can watch any room by its code
(`views.watch`), which shows only what the shared screen may show.

### Screens

A game's UI is a `GameUi` (`src/room/game-ui.ts`, registered in
`src/games/ui-registry.ts`) with two screens:

- `Stage` is the shared big screen.
- `Controller` is one player's phone.

Only the room shell imports the game UI registry. `RoomFrame` selects the UI
and supplies it through `GameUiProvider`; shared room components read it with
`useGameUi`. Games can reuse those components without a circular import back
through the registry. Keep that boundary intact: the former cycle broke
countdown imports in optimized production bundles even when dev fixtures passed.

The shared shell (`src/room/shell.tsx`) owns the header, countdown, lobby, host
controls, reconnects, and final-screen footer. It composes the screens on
three routes:

- `/stage/CODE` shows the stage only.
- `/controller/CODE` shows the controller only.
- `/game/CODE` docks the controller beside the stage for players on a desktop.

A game can take over parts of that frame. With `ownsLobby`, the shell renders
the game's `Stage` and `Controller` in the lobby too, keeps one stage scene
from the lobby into play (so a 3D canvas never remounts), and skips its
"Round 1" opener; the game then draws the join code, players and Start itself,
from `useLobby` and the parts exported by `src/room/lobby.tsx`. `chrome(view)`
hides the TV rail (with its countdown ring) or the phone bar for a view; mute
and the ⋯ menu stay reachable from a corner button, and the host dock is
unaffected. `HostExtras` adds game rows to the host section of the phone's ⋯
sheet. SlopFight uses all three; its 3D stage is the one `next/dynamic` import
in its `GameUi`, so `/controller` never loads three.js.

The recap page renders the same stage, read-only, for a finished game, through
`StaticRoomProvider`. Recaps are not `live`, so sounds, confetti, and narration
stay quiet there. Dev fixtures (`src/dev/fixtures/`) render static room views
through the same frame at `/dev/ui`.

Games share building blocks rather than copying them:

- `src/room/parts.tsx` holds `DoneTracker` (who is in, on the stage or a
  phone).
- `src/room/moment/` is the moment kit: `useMoment` (staged beats on one
  clock), `Stamp`, `CountUp`, `TypeOn`, confetti and haptics.
- `src/room/effects.ts` holds `useCue` (a sound when something changes).
- `src/lib/format.ts` formats places and signed points.

Shared parts draw with the base color tokens (`surface`, `edge`, `ink`, `win`,
and so on). A game's theme (`data-game` on the shell) remaps those tokens to
its own palette, so one component renders in each game's colors.

### Convex data and functions

Convex stores rooms, sessions, players, rounds, prompts, responses, votes,
reactions, generation jobs, usage, mode state, and leaderboard projections.
Queries use bounded indexed reads. Mutations keep related state transitions
atomic, and actions delegate persistence back to guarded mutations.

The deployment is greenfield. No legacy database records are imported or read
at runtime. Completed Slop-Lash data is retained for recap and leaderboard
history; scheduled cleanup targets expired credentials, stale lobbies,
abandoned games, and transient completed modes without deleting active rooms.

## Convex Components

The installed components have deliberately separate responsibilities:

| Component | Responsibility                                                       | Not responsible for                               |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Presence  | Ephemeral room membership and online/offline signals                 | Durable sessions, players, scores, or game phases |
| Workpool  | Bounded concurrency and completion callbacks for independent AI jobs | Game phases, which the engine owns                |

AI jobs use durable `generationJobs` rows, keyed per game, for idempotency and
stale-result guards. Workpool executes the external call, and its completion
callback applies the result, or the fallback, in one guarded mutation.

SlopFight's streaming forge uses the critical Workpool with automatic retries
disabled. Its forge wrapper owns repair and model fallback; generation tokens
guard partial updates and final writes to the fighter row. Drawing input is
bounded by shared stroke and point limits so a full room remains within
Convex's document and response budgets.

## AI Boundary

AI SDK 7 provides generation and streaming primitives. Models are selected
through the Vercel AI Gateway rather than hand-written provider transports. A
catalog model with an `anthropicModelId` is the one exception: it runs through
`@ai-sdk/anthropic` against the Anthropic API, so Claude Haiku bills the
owner's Claude Console credits. `src/lib/ai-gateway.ts` makes that choice in
one place. Decision models such as Jev use the Gateway's decision API
(`experimental_decide`) and answer fixed-choice questions instead of writing
text. Gateway, Anthropic, Fal, and host secrets live in the Convex deployment
environment and are available only to backend functions. Speech generation
stays on the Gateway.

Game code never calls the SDK directly: every model call goes through the task
layer in `src/lib/ai/` (`runStructured`, `runText`, `decideChoices`), which
handles instruction caching, retries, budgets, and the `aiCalls` log. See
[`docs/ai-calls.md`](./ai-calls.md).

Free Play rooms (`games.freePlay`) are created without the host password.
`rooms.create` pins them to Claude Haiku for writing and Jev for judging. It
also refuses the narrator and extra AI players, and Free Play MatchSlop rooms
skip portraits. A transactional `freePlayUsage` counter enforces the daily cap
inside room creation. Free Play SlopLash AI ballots go to Jev first when the
Gateway key is set; without it, or when Jev fails, Haiku casts them
(`castBallots` in `src/games/sloplash/ai.ts`). Each call records its usage
under the model that answered.

Slop-Lash narration is a hybrid pipeline: deterministic cues preserve prompts
and jokes verbatim, while selected transitions use a short bounded text-model
pass before speech synthesis. The host client queues complete speech clips in
event order and drops stale waiting work only when its bounded queue is full.

The browser receives no provider secrets. Its only required backend setting is
`NEXT_PUBLIC_CONVEX_URL`, which identifies the public Convex deployment.

## Deployment and Toolchain

Vercel hosts the Next.js application, and Convex hosts functions, components,
scheduled jobs, and data. Production secrets are configured independently in
Convex, including when the project is connected to Vercel.

Vite Plus is the repository toolchain:

- `vp install` installs with the pinned package manager and runtime.
- `vp check`, `vp lint`, and `vp test` run direct Vite Plus tooling.
- `vp exec` runs checked-in binaries such as TypeScript and Convex.
- `vp run <task>` runs package tasks.

Next.js lifecycle commands are package tasks: use `vp run dev`, `vp run build`,
and `vp run start`. Direct `vp dev`, `vp build`, and `vp preview` invoke Vite and
are not substitutes for the Next.js commands.

For setup, environment variables, and the full command table, see the
[project README](../README.md#getting-started).
