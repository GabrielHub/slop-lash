# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

Uses **pnpm**.

## Development

- Never start the dev server (`pnpm dev`) or run builds (`pnpm build`). Assume the dev server is already running.
- Always run `pnpm check` after making changes to catch lint and type errors.

## UI Iteration Routes

- Use `/dev/ui` for fixture-driven mock game flow routes that render the real game screens (`Lobby`, `Writing`, `Voting`, `Results`) with local mock actions.
- The `/dev/ui/*` routes support local-only interactions (start, submit, vote, reactions, next, play again) so UI transitions and animations can be iterated without playing a real game.
- Use `/dev/components` for the isolated component playground (timers, player list, score chart, reaction bar, results components, etc.).
- Prefer iterating UI styling/layout in these dev routes first, then verify in the live game flow.

## Database

- **Single Neon PostgreSQL database** shared across local dev and production (no separate environments).
- Managed via the Vercel + Neon integration. Connection strings are auto-injected as Vercel env vars.
- ORM: **Prisma 7** with the Neon serverless adapter (`@neondatabase/serverless` + `@prisma/adapter-pg`).
- Schema: `prisma/schema.prisma`. Config: `prisma.config.ts`.
- Migrations: `pnpm prisma migrate dev` — runs against the single production database. Never run `prisma migrate reset`.
- The `prisma.config.ts` loads env vars from `.env.local` (pulled via `npx vercel env pull .env.local`).

## Deployment

- Hosted on **Vercel**. Pushes to `master` trigger deployments.
- Neon database is connected via Vercel's native Neon integration (Storage tab).
