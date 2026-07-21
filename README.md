# Slop-Lash

Slop-Lash is a comedy party game where humans and AI models write responses,
vote, react, and compete live in shared rooms. The repository also contains AI
Chat Showdown and MatchSlop modes built on the same room platform.

## How Slop-Lash Works

1. A host creates a room, chooses AI players, and optionally enables voice
   readout.
2. Players join with a six-character room code, with up to eight participants.
3. Everyone answers comedy prompts.
4. Eligible players vote on each matchup.
5. Scores, streaks, Humor Rating, and achievements update after each round.
6. After three rounds by default, the highest score wins and the final recap is
   retained.

AI models participate through the same durable response and vote lifecycle as
human players.

### Scoring

Points are based on vote power rather than simple vote counts. Each vote is
weighted by the voter type and Humor Rating (HR):

| Voter type | Weight |
| ---------- | -----: |
| Human      |   1.5x |
| AI         |   1.0x |

**Base points** = `floor(votePower² × 50 × roundMultiplier × streakMultiplier)`

The round multiplier doubles each round (1x → 2x → 4x). Consecutive wins add a
streak multiplier: 1.0x → 1.3x → 1.7x → 2.0x. Losing resets the streak.

Bonuses include:

- **Flawless** — 25% for a unanimous win.
- **Upset** — 10% of the score deficit when the underdog wins, capped at 500
  before the round multiplier.

Winning a matchup raises HR by 0.2; losing lowers it by 0.1, with a floor of
0.5. Forfeits, deliberate abstentions, and AI failures are tracked separately
so scoring and recaps can distinguish them.

### Voice Readout

Hosts can optionally enable low-latency speech through `openai/tts-1` on the
Vercel AI Gateway. Matchups and countdowns use deterministic verbatim scripts.
For transitions and results, `google/gemini-3.5-flash-lite` writes a short host
line with narrator-specific minimal reasoning before TTS. A bounded FIFO keeps
complete audio clips in event order. Narration does not participate in
authoritative game state.

## AI Models

AI players run through the Vercel AI Gateway, with at most one selected model
per provider. Gameplay uses the following reasoning budget policy:

| Gateway model                  | Reasoning |
| ------------------------------ | --------- |
| `google/gemini-3.5-flash-lite` | High      |
| `zai/glm-5.2`                  | Minimal   |
| `deepseek/deepseek-v4-flash`   | Max       |
| `openai/gpt-5.6-luna`          | Minimal   |
| `moonshotai/kimi-k2.5`         | Medium    |
| `xiaomi/mimo-v2.5-pro`         | High      |
| `xai/grok-4.5`                 | Low       |
| `alibaba/qwen3.5-flash`        | High      |
| `anthropic/claude-haiku-4.5`   | Low       |

The table describes AI-player reasoning. Narrator script generation overrides
Gemini to minimal reasoning because latency matters more than depth for a
24-word spoken transition.

## Architecture

| Layer             | Technology and responsibility                                                         |
| ----------------- | ------------------------------------------------------------------------------------- |
| Web               | Next.js 16.2, React 19, TypeScript, Tailwind CSS 4                                    |
| Client data       | Convex React hooks for reactive reads and writes                                      |
| Backend           | A fresh Convex deployment containing room, game, recap, and leaderboard state         |
| AI                | AI SDK 7 through the Vercel AI Gateway                                                |
| Async work        | Convex Workpool for bounded AI jobs and Workflow for durable multi-step orchestration |
| Realtime presence | Convex Presence for ephemeral online/offline room state                               |
| Toolchain         | Vite Plus for package installation, runtime selection, tasks, checks, lint, and tests |
| Hosting           | Vercel for the Next.js application; Convex for backend functions and data             |

The React application is hook-first:

- `useQuery` and `usePaginatedQuery` read reactive Convex data.
- `useMutation` performs transactional writes.
- `useAction` starts external work or nondeterministic session setup such as
  generating room capabilities; durable writes still flow through mutations.

Presence is not durable game state. Workpool controls concurrent AI generation,
while Workflow coordinates multi-step jobs that must survive retries and
restarts. See [Architecture](docs/architecture.md) for the full boundary map.

## Getting Started

### Prerequisites

- Vite Plus (`vp`)
- Access to the linked Convex project
- A Vercel AI Gateway key for AI generation and narration
- An optional Fal key for MatchSlop image generation

The repository pins Node 24 through `devEngines` and pnpm 11 through
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

### 3. Configure backend secrets

Secrets belong in the Convex deployment, not in browser environment variables.
Omitting the value prompts securely and avoids saving secrets in shell history:

```bash
vp exec convex env set AI_GATEWAY_API_KEY
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

| Convex variable      | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `AI_GATEWAY_API_KEY` | AI SDK 7 access through Vercel AI Gateway |
| `HOST_SECRET`        | Host room-creation authorization          |
| `FAL_KEY`            | Optional MatchSlop image generation       |

Do not prefix secrets with `NEXT_PUBLIC_` or put them in client code.

### Greenfield data

Convex is the source of truth, and its dataset starts fresh. Legacy database
records are intentionally not imported. Completed Slop-Lash games retain the
players, responses, votes, reactions, recaps, and exactly-once leaderboard
projections needed for historical views; scheduled maintenance removes expired
sessions and abandoned or transient rooms.

## Commands

Vite Plus has direct commands for checks and tools. Next.js lifecycle commands
must go through package tasks: direct `vp dev`, `vp build`, and `vp preview`
invoke Vite itself and are not the Next.js application commands.

| Command                         | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `vp install`                    | Install dependencies with the pinned package manager/runtime   |
| `vp run dev`                    | Start the Next.js development server                           |
| `vp run build`                  | Create the Next.js production build                            |
| `vp run start`                  | Serve the Next.js production build                             |
| `vp check`                      | Run the configured combined lint and type checks               |
| `vp fmt --check`                | Check repository formatting without changing files             |
| `vp lint`                       | Run the configured Vite Plus lint rules                        |
| `vp test`                       | Run the test suite                                             |
| `vp exec tsc --noEmit`          | Run TypeScript directly when a focused compiler pass is useful |
| `vp run convex:dev`             | Run and synchronize the development Convex deployment          |
| `vp run convex:codegen`         | Regenerate the typed Convex API without starting development   |
| `vp run test:ui:matchslop-sync` | Run the focused MatchSlop Playwright sync test                 |
| `vp run check:theme-colors`     | Check the theme-color guardrail                                |
