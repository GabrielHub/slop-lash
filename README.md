# Slop-Lash

A Quiplash-inspired AI vs. Humans comedy party game. Players compete against AI models to write the funniest responses to prompts, then vote on the best answers.

## How It Works

1. **Host** creates a game and picks which AI models to play against
2. **Players** join using a 4-character room code
3. Everyone gets prompts and writes funny responses within a time limit
4. Players vote on the funniest response for each prompt
5. Scores are tallied (100 pts per vote, +100 bonus for unanimous wins)
6. Repeat for 3 rounds — highest score wins

AI models generate responses and vote just like human players.

## AI Models

Opponents are served through the Vercel AI Gateway and include:

- OpenAI (GPT-5 Mini)
- Anthropic (Claude Sonnet 4.6)
- Google (Gemini 3 Flash)
- DeepSeek
- xAI (Grok)
- and more

## Tech Stack

- **Framework:** Next.js 16 / React 19 / TypeScript
- **Styling:** Tailwind CSS 4
- **Database:** Neon PostgreSQL + Prisma ORM
- **AI:** Vercel AI SDK + AI Gateway

## Getting Started

### Prerequisites

- Node.js 20+
- A Neon PostgreSQL database
- AI Gateway API key

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
| `HOST_SECRET` | Secret for host authentication |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm check` | Run lint + typecheck |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
