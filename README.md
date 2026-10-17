# SlopBox Party Pack

SlopBox Party Pack (repo name `slop-lash`) is a set of party games where humans
and AI models play together in shared rooms. A host opens a room on a TV or
laptop (the stage), and players join from their phones (the controllers) with a
room code.

## Games

| Game      | Players | Pitch                                                                  |
| --------- | ------- | ---------------------------------------------------------------------- |
| SlopLash  | 3-8     | Out-funny the AI. Everyone answers comedy prompts; the room votes.     |
| MatchSlop | 2-8     | Charm an AI date, together.                                            |
| QuizSlop  | 2-8     | Trivia where you bet on friends. Questions come from a static catalog. |
| SlopFight | 2-4     | Doodle a fighter. Watch it brawl on a shared 3D stage.                 |

Player limits come from each game's constants in `src/games/`. AI players are
available in SlopLash and MatchSlop; QuizSlop has none. The SlopLash narrator
is optional and needs the host password.

Game specs: [QuizSlop](docs/quizslop-game-mode.md),
[SlopFight](docs/plans/slopfight.md). Each game also has a narrated
how-to-play video at `/how-to-play`.

### Free Play

Anyone can host without the host password. Free Play limits are enforced on the
server (`src/lib/free-play.ts`, `convex/freePlay.ts`): Claude Haiku writes every
AI line, SlopLash allows one AI player, MatchSlop has no portraits, and there is
no narrator. `FREE_PLAY_DAILY_GAME_LIMIT` caps free rooms per UTC day (default
50; `0` turns Free Play off). Free Play needs `ANTHROPIC_API_KEY`.

## Stack

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- Convex for the backend, database, and realtime data (with the Presence and
  Workpool components)
- AI SDK through the Vercel AI Gateway; Claude models call the Anthropic API
  directly (`src/lib/ai-gateway.ts`)
- Fal for MatchSlop portraits; Three.js, React Three Fiber, and Rapier for
  SlopFight
- Vite Plus (`vp`) for installs, checks, lint, and tests

## Running locally

### Prerequisites

- Vite Plus (`vp`). The repo pins Node 24 (`devEngines`)
  and pnpm (`packageManager`); `vp` selects both.
- A Convex account. The first `vp run convex:dev` links or creates a
  development deployment.

### Setup

1. Install dependencies:

   ```bash
   vp install
   ```

2. Connect a development Convex deployment. This generates the typed API in
   `convex/_generated/` and writes `CONVEX_DEPLOYMENT` and
   `NEXT_PUBLIC_CONVEX_URL` to `.env.local` (see `.env.example`). Leave it
   running while you work on backend code:

   ```bash
   vp run convex:dev
   ```

3. Set backend secrets on the Convex deployment (not in `.env.local`). Omit the
   value to be prompted:

   ```bash
   vp exec convex env set AI_GATEWAY_API_KEY
   vp exec convex env set ANTHROPIC_API_KEY
   vp exec convex env set HOST_SECRET
   vp exec convex env set FAL_KEY
   ```

   | Variable                     | Purpose                                                         |
   | ---------------------------- | --------------------------------------------------------------- |
   | `AI_GATEWAY_API_KEY`         | Vercel AI Gateway: AI players, judging, and narration           |
   | `ANTHROPIC_API_KEY`          | Direct Claude (Haiku) calls; required for Free Play             |
   | `HOST_SECRET`                | Host password for full (non-Free Play) rooms                    |
   | `FAL_KEY`                    | Optional. MatchSlop portrait generation                         |
   | `FREE_PLAY_DAILY_GAME_LIMIT` | Optional. Free rooms per UTC day (default 50, `0` turns it off) |

   The browser only receives `NEXT_PUBLIC_CONVEX_URL`. Never prefix secrets
   with `NEXT_PUBLIC_`.

4. Start Next.js in a second terminal and open <http://localhost:3000>:

   ```bash
   vp run dev
   ```

Development Convex deployments share the team's usage allowance. For routine UI
work, use the fixtures at `/dev/ui` (add `?layout=` to pick the stage,
controller, or docked view) instead of live rooms. See the
[Convex usage audit](docs/convex-usage-audit.md).

### Commands

Run `package.json` scripts with `vp run <script>`. Bare `vp dev`, `vp build`, and
`vp preview` are Vite commands and skip the Next.js lifecycle.

| Command                     | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `vp run dev`                | Next.js development server                      |
| `vp run build`              | Production build                                |
| `vp run start`              | Serve the production build                      |
| `vp check`                  | Lint and type checks                            |
| `vp lint`                   | Lint only                                       |
| `vp test`                   | Run the tests                                   |
| `vp run typecheck`          | `tsc --noEmit`                                  |
| `vp run convex:dev`         | Sync the development Convex deployment          |
| `vp run convex:codegen`     | Regenerate `convex/_generated/` without syncing |
| `vp run check:theme-colors` | Theme-color guardrail                           |

`scripts/room-start-smoke.mjs` is a browser smoke test that creates a Free Play
room for each game against a production build. It spends real AI credits and
daily Free Play slots; read the header of the script before running it.

## Architecture

Convex is the source of truth. React reads and writes through Convex hooks
(`useQuery`, `useMutation`, `useAction`) rather than REST routes, and every room
screen subscribes to a single `views.room` query.

- `convex/engine.ts` runs every game: it owns the room lifecycle and every phase
  change. A game supplies its rules in `convex/<game>/mode.ts` (registered in
  `convex/modes.ts`).
- `src/games/<game>/` holds each game's shared logic and its screens: a `Stage`
  for the TV and a `Controller` for phones, registered through
  `src/games/ui-registry.ts` and described in `src/games/meta.ts`.
- AI calls go through `src/lib/ai/` and `src/lib/ai-gateway.ts`. Workpool bounds
  concurrent AI jobs, and every job has a fallback so AI never blocks a phase.
- Presence tracks who is online; it is not durable game state.
- `convex/crons.ts` recovers missed phase deadlines and deletes stale rooms.

More detail:

- [docs/architecture.md](docs/architecture.md): runtime boundaries and data flow
- [docs/ai-calls.md](docs/ai-calls.md): how model calls are made, cached, and retried
- [docs/prompt-design-guide.md](docs/prompt-design-guide.md): SlopLash prompt writing
- [docs/matchslop-persona-guide.md](docs/matchslop-persona-guide.md): MatchSlop personas

## Deployment

Pushing to `master` deploys to production through Vercel. The Vercel build runs
`convex deploy`, so the same push ships the Convex functions and schema, and
existing production data must validate against the new schema. Backend secrets
live in the Convex production deployment (`vp exec convex env set <NAME> --prod`).

## Contributing

Agent and contributor rules are in [AGENTS.md](AGENTS.md). Run `vp check` after
code changes, and `vp test` and `vp run build` when changing runtime behavior.
