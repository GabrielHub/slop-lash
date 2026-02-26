# Slop-Lash

A Quiplash-inspired comedy party game where AI models play alongside humans. Everyone writes funny responses to prompts, votes on the best answers, and competes for the top score.

## How It Works

1. **Host** creates a game, picks which AI models to include, and optionally enables voice readout
2. **Players** join using a 4-character room code (up to 8 players, plus up to 20 spectators who can vote)
3. Everyone gets prompts and writes funny responses (90s time limit)
4. Players vote on the funniest response for each matchup (45s total, 20s per prompt)
5. Scores are tallied — see [Scoring](#scoring) below
6. Repeat for 3 rounds with escalating stakes — highest score wins

AI models generate responses and vote just like human players.

### Scoring

Points are based on **vote power**, not simple vote counts. Each voter's power is weighted by their type and their Humor Rating (HR):

| Voter Type | Weight |
|---|---|
| Human | 1.5x |
| AI | 1.0x |
| Spectator | 0.5x |

**Base points** = `floor(votePower² × 50 × roundMultiplier × streakMultiplier)`

**Round multiplier** doubles each round (1x → 2x → 4x), so later rounds are worth significantly more.

**Streak multiplier** rewards consecutive wins: 1.0x → 1.3x (2 wins) → 1.7x (3 wins) → 2.0x (4+ wins). Losing resets the streak.

**Bonuses:**
- **Flawless** — +25% bonus for winning unanimously
- **Upset** — 10% of the score deficit as bonus when the underdog wins (capped at 500 per round, scaled by round multiplier)

**Humor Rating (HR)** tracks each player's comedic momentum. Winning a matchup raises HR by +0.2, losing drops it by −0.1 (floor of 0.5). Higher HR means your votes carry more weight.

**Forfeit** — If an opponent doesn't submit, the other response is scored as if every eligible voter picked it unanimously. Abstaining when both responses are from AI penalises the AI respondents.

**Achievements** are awarded at the end of the game (MVP, Crowd Favorite, Iron Will, Slop Master, AI Slayer, Clutch, Underdog, Hot Streak, Comeback, and more).

### Voice Readout (TTS)

The host can enable text-to-speech during game creation:

- **Off** — No voice readout (default)
- **AI Voice** — Gemini TTS with game-show narrator energy. Pick from 30 voices or go random. Falls back to browser voice if Gemini is unavailable.
- **Browser Voice** — Uses the browser's built-in Web Speech API with distinct pitches for prompt vs responses.

## AI Models

AI players are served through the Vercel AI Gateway. The host picks which models to include (one per provider):

- Google (Gemini 3 Flash)
- Zhipu AI (GLM-5)
- MiniMax (M2.5)
- DeepSeek (V3.2)
- OpenAI (GPT-5.2 Chat)
- Moonshot AI (Kimi K2.5)
- Xiaomi (MiMo V2 Flash)
- xAI (Grok 4.1 Fast)
- Anthropic (Claude Sonnet 4.6)

## Tech Stack

- **Framework:** Next.js 16 / React 19 / TypeScript
- **Styling:** Tailwind CSS 4
- **Database:** Neon PostgreSQL + Prisma ORM
- **AI:** Vercel AI SDK + AI Gateway
- **TTS:** Google Gemini TTS + Web Speech API fallback

## Getting Started

### Prerequisites

- Node.js 20+
- A Neon PostgreSQL database
- AI Gateway API key
- Gemini API key (optional, for AI Voice TTS)

### Setup

```bash
# Install dependencies
pnpm install

# Pull env vars from Vercel (requires vercel link first)
npx vercel env pull .env.local

# Run database migrations
pnpm prisma migrate dev

# Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to play.

### Environment Variables

Set these in the Vercel dashboard (Neon vars are auto-injected via the integration):

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled connection string (auto-injected) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string (auto-injected) |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway API key |
| `GEMINI_API_KEY` | Google Gemini API key (for AI Voice TTS) |
| `HOST_SECRET` | Secret for host authentication |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm check` | Run lint + typecheck |
| `pnpm test` | Run tests |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
