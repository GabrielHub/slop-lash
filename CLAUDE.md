# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

Uses **pnpm**.

## Development

- Never start the dev server (`pnpm dev`) or run builds (`pnpm build`). Assume the dev server is already running.
- Always run `pnpm check` after making changes to catch lint and type errors.

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
