# Slop-Lash

Slop-Lash is a comedy party game where humans and AI models write responses,
vote, react, and compete live in shared rooms. The repository also contains
MatchSlop, QuizSlop, and SlopFight modes built on the same room platform.

## SlopFight

Two to four players draw or describe a champion on their phones, then watch
their creations fight on a shared 3D stage. House champions fill the four
seats. Six fights span three arenas, with drawing or text upgrades between
rounds, betting, audience hype, a podium, and replayable results.

The server freezes each matchup and computes its deterministic outcome. The
TV replays that simulation and verifies its hash; phone controllers load no
Three.js or Rapier. Free Play supports the full game without narration.
See the [game specification](docs/plans/slopfight.md) and
[integration runbook](scripts/slopfight/e2e/README.md).

## How Slop-Lash Works

1. A host creates a room, chooses AI players, and optionally enables voice
   readout.
2. Players join with a six-character room code, with up to eight participants.
3. Everyone answers comedy prompts.
4. Eligible players vote on each matchup.
5. Each vote pays points to the answer it names, and scores update after each
   matchup.
6. After three rounds by default, the highest score wins and the final recap is
   retained.

AI models participate through the same durable response and vote lifecycle as
human players.

### Scoring

Scoring lives in `src/games/sloplash/scoring.ts`:

- Every vote is worth 100 points times the round multiplier, which doubles each
  round (×1, ×2, ×4, …). Human and AI votes count the same.
- A unanimous win (every cast vote, at least two) earns +50%.
- A walkover (only one answer arrived) pays one vote's worth, the smallest real
  win. A matchup with no answers is skipped.
- Ties and matchups with no votes still pay each answer its own votes.

### Voice Readout

Hosts can optionally enable speech through `google/gemini-3.8-flash-lite-tts`
on the Vercel AI Gateway, using Google voices and WAV audio. Matchups and
countdowns use deterministic verbatim scripts.
For transitions and results, `google/gemini-3.5-flash-lite` writes a short host
line before TTS. A bounded FIFO keeps complete audio clips in event order. Narration does not participate in
authoritative game state.

## AI Models

AI players run through the Vercel AI Gateway, with at most one selected model
per provider. Claude Haiku is the exception: it calls the Anthropic API directly
with `ANTHROPIC_API_KEY`, so it bills the owner's Claude Console credits.
Each model call sets its own reasoning effort per task in
`src/lib/ai/tasks.ts`.

MatchSlop generates portrait images through Fal's `recraft/v4.1/flash/text-to-image` endpoint.

### Free Play

Anyone can host without the host password. Free Play rooms are pinned on the
server, whatever the client sends:

- Claude Haiku writes every line: the Slop-Lash bot's answers and the MatchSlop
  persona.
- `typesafe-ai/jev`, a Vercel AI Gateway decision model, casts the Haiku bot's
  votes and reactions in Slop-Lash.
- Slop-Lash allows one AI player. MatchSlop has no AI teammates and no
  portraits. The narrator needs the host password.
- `FREE_PLAY_DAILY_GAME_LIMIT` caps free rooms per UTC day (default 50; `0`
  turns Free Play off). Free Play is also off until `ANTHROPIC_API_KEY` is set.

## Architecture

| Layer             | Technology and responsibility                                                         |
| ----------------- | ------------------------------------------------------------------------------------- |
| Web               | Next.js 16.4, React 19, TypeScript, Tailwind CSS 4                                    |
| Client data       | Convex React hooks for reactive reads and writes                                      |
| Backend           | A fresh Convex deployment; one game engine runs every mode                            |
| AI                | AI SDK 7 through the Vercel AI Gateway; Claude direct through the Anthropic API       |
| Async work        | Convex Workpool for bounded AI jobs, each with a fallback so AI never blocks a phase  |
| Realtime presence | Convex Presence for ephemeral online/offline room state                               |
| Toolchain         | Vite Plus for package installation, runtime selection, tasks, checks, lint, and tests |
| Hosting           | Vercel for the Next.js application; Convex for backend functions and data             |

The React application is hook-first:

- `useQuery` and `usePaginatedQuery` read reactive Convex data.
- `useMutation` performs transactional writes.
- `useAction` starts external work or nondeterministic session setup such as
  generating room capabilities; durable writes still flow through mutations.

Presence is not durable game state. Workpool controls concurrent AI generation.
Each game draws a shared `Stage` and a per-player `Controller` inside one room
shell. See [Architecture](docs/architecture.md) for the engine and the full
boundary map.

## Getting Started

### Prerequisites

- Vite Plus (`vp`)
- Access to the linked Convex project
- A Vercel AI Gateway key for AI generation, judging, and narration
- A Claude Console API key for Claude Haiku and Free Play
- An optional Fal key for MatchSlop image generation

The repository pins Node 24 through `devEngines` and pnpm 12 through
`packageManager`; use Vite Plus to select the runtime and install packages.

### 1. Install dependencies

```bash
vp install
```

### 2. Connect the development Convex deployment

```bash
vp run convex:dev
```

On first run, Convex links or creates a development deployment, generates the
typed API, and writes the browser-safe deployment values to `.env.local`.
Keep this process running while developing backend functions.

Cloud development deployments share the team's Convex usage allowance. Use
`vp test` and the static `/dev/ui` fixtures for routine iteration, then run a
bounded live integration check. A frontend on localhost may still be using
the cloud backend. See the [Convex usage audit](docs/convex-usage-audit.md) for
the measured hotspots and ways to avoid unnecessary development I/O.

### 3. Configure backend secrets

Secrets belong in the Convex deployment, not in browser environment variables.
Omitting the value prompts securely and avoids saving secrets in shell history:

```bash
vp exec convex env set AI_GATEWAY_API_KEY
vp exec convex env set ANTHROPIC_API_KEY
vp exec convex env set HOST_SECRET
vp exec convex env set FAL_KEY
```

Use the `--prod` option when configuring the production Convex deployment.

### 4. Start Next.js

In a separate terminal:

```bash
vp run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment split

The Next.js browser bundle receives only the public Convex URL:

| Local or Vercel variable | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Browser connection to the selected Convex deployment                      |
| `CONVEX_DEPLOYMENT`      | Local Convex CLI deployment reference; normally generated by `convex dev` |

These server-side values are configured with `convex env set`:

| Convex variable              | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`         | AI SDK 7 access through Vercel AI Gateway                |
| `ANTHROPIC_API_KEY`          | Direct Claude API access for Haiku; enables Free Play    |
| `HOST_SECRET`                | Host room-creation authorization for full rooms          |
| `FREE_PLAY_DAILY_GAME_LIMIT` | Optional free rooms per UTC day (default 50, `0` is off) |
| `FAL_KEY`                    | Optional MatchSlop image generation                      |

Do not prefix secrets with `NEXT_PUBLIC_` or put them in client code.

### Greenfield data

Convex is the source of truth, and its dataset starts fresh. Legacy database
records are intentionally not imported. Completed Slop-Lash games retain the
players, responses, votes, reactions, and exactly-once leaderboard
projections needed for recaps and historical views; scheduled maintenance removes expired
sessions and abandoned or transient rooms.

## Commands

Vite Plus has direct commands for checks and tools. Next.js lifecycle commands
must go through package tasks: direct `vp dev`, `vp build`, and `vp preview`
invoke Vite itself and are not the Next.js application commands.

| Command                     | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `vp install`                | Install dependencies with the pinned package manager/runtime   |
| `vp run dev`                | Start the Next.js development server                           |
| `vp run build`              | Create the Next.js production build                            |
| `vp run start`              | Serve the Next.js production build                             |
| `vp check`                  | Run the configured combined lint and type checks               |
| `vp fmt --check`            | Check repository formatting without changing files             |
| `vp lint`                   | Run the configured Vite Plus lint rules                        |
| `vp test`                   | Run the test suite                                             |
| `vp exec tsc --noEmit`      | Run TypeScript directly when a focused compiler pass is useful |
| `vp run convex:dev`         | Run and synchronize the development Convex deployment          |
| `vp run convex:codegen`     | Regenerate the typed Convex API without starting development   |
| `vp run check:theme-colors` | Check the theme-color guardrail                                |

### Production room-start smoke test

Build with the development Convex URL, then run `vp run start` and, in a
second terminal, `vp exec node scripts/room-start-smoke.mjs`. Requires an
installed Google Chrome and the workspace's transitive `playwright-core`
(or `PLAYWRIGHT_CORE` pointing to its package directory).

The test creates a Free Play room for each of the four modes, joins two
phone browsers and a stage, starts play, and checks that every screen survives
both the transition and a reload. It spends normal AI credits and daily Free
Play slots, and ends its started games afterward. Reports and screenshots go
to `output/playwright/room-start/`. Use `--base=http://localhost:3001`,
`--games=SLOPFIGHT,SLOPLASH`, `--layout=game` for docked players, or
`--out=output/playwright/another-run` as needed.

Run this against the **production build**, even when development fixtures
pass. A circular import between the game registry and shared room components
caused undefined countdown imports in optimized live SlopFight and SlopLash
builds. The shell now supplies the selected game through `GameUiProvider`, so
shared components do not import the registry. Production optimizations stay on.
