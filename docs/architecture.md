# Architecture

Slop-Lash is a Next.js application backed by Convex. React consumes live state
directly through typed Convex hooks, while server-side actions integrate with AI
and media providers. This document records the durable boundaries; code and
checked-in schemas remain the source of truth for implementation details.

## Runtime Boundaries

### Next.js and React

Next.js 16.2 and React 19 own routing, rendering, layouts, and browser UI. The
root Convex provider creates the browser client from `NEXT_PUBLIC_CONVEX_URL`.
Feature components subscribe to the smallest useful backend view rather than
maintaining a parallel client cache.

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

Room creation, join, and rejoin use actions because they generate or hash
cryptographic capability material, then delegate the durable write to an
internal mutation. Normal game transitions call public mutations directly.

### Convex data and functions

Convex stores rooms, sessions, players, rounds, prompts, responses, votes,
reactions, chat, generation jobs, usage, recaps, and leaderboard projections.
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
| Workpool  | Bounded concurrency and completion callbacks for independent AI jobs | Multi-step product workflow state                 |
| Workflow  | Durable orchestration of dependent, multi-step operations            | Browser presence or authoritative game tables     |

AI response, vote, chat-reply, and other generation records use durable
application job rows for idempotency and stale-result guards. Workpool executes
the external call, and guarded Convex mutations atomically persist the result
and usage. Workflow is reserved for sequences where later work depends on
earlier durable output.

## AI Boundary

AI SDK 7 provides generation and streaming primitives. Models are selected
through the Vercel AI Gateway rather than hand-written provider transports.
Gateway, Gemini, Fal, and host secrets live in the Convex deployment environment
and are available only to backend functions.

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
