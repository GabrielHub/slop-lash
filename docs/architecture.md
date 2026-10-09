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
gone for about 30 seconds; it hands host controls to a present player. If a
mode throws while advancing, the engine ends the game rather than leaving the
room stuck.

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

The shared shell (`src/room/shell.tsx`) owns the header, countdown, lobby, host
controls, reconnects, and final-screen footer. It composes the screens on
three routes:

- `/stage/CODE` shows the stage only.
- `/controller/CODE` shows the controller only.
- `/game/CODE` docks the controller beside the stage for players on a desktop.

The recap page renders the same stage, read-only, for a finished room, through
`StaticRoomProvider`. Recaps are not `live`, so sounds, confetti, and narration
stay quiet there. Dev fixtures (`src/dev/fixtures/`) render static room views
through the same frame at `/dev/ui`.

Games share building blocks rather than copying them:

- `src/room/parts.tsx` holds components such as `PlayerProgress` and
  `StatusCard`.
- `src/room/effects.ts` holds `useCue` (a sound when something changes) and
  `useCelebration` (a sound plus confetti, once).
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

Free Play rooms (`games.freePlay`) are created without the host password.
`rooms.create` pins them to Claude Haiku for writing and Jev for judging. It
also refuses the narrator and extra AI players, and Free Play MatchSlop rooms
skip portraits. A transactional `freePlayUsage` counter enforces the daily cap
inside room creation. Free Play AI votes record their usage under the Jev model
ID.

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
