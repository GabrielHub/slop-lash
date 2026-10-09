# Agent Instructions

Durable project rules for coding agents. `CLAUDE.md` imports this file, so edit
only this one. Put setup, architecture, and feature documentation in
`README.md` or `docs/`. Direct instructions from the user in the conversation
take precedence over this file.

## Working Rules

- Code, tests, schemas, fixtures, and checked-in configuration are the source of
  truth for implemented behavior. Sibling repositories are references, not
  product truth.
- Prefer the smallest change that follows existing patterns. Avoid speculative
  abstractions, duplicate helpers, unrelated refactors, and formatting churn.
- Keep game and domain behavior in typed, testable modules instead of UI
  components.
- Do not silently decide expensive or irreversible product questions. State the
  smallest reversible assumption, or ask when a wrong choice would be costly.
- The worktree often holds the user's uncommitted work. Leave changes you did
  not make alone.

## Architecture

- Convex is the backend and source of truth. The dataset is greenfield, so do
  not add migration or compatibility paths for older databases.
- Read and write application data through Convex React hooks rather than
  REST-style routes: `useQuery`/`usePaginatedQuery` for reactive reads,
  `useMutation` for transactional writes, and `useAction` for external services
  or Node.js-only work.
- Presence owns ephemeral online/offline state, Workpool owns bounded concurrent
  jobs, and Workflow owns durable multi-step orchestration. Durable game state
  stays in application tables.
- AI calls go through AI SDK via the Vercel AI Gateway. Secrets
  (`AI_GATEWAY_API_KEY`, `HOST_SECRET`, `FAL_KEY`) live in Convex; the browser
  only receives `NEXT_PUBLIC_CONVEX_URL`.
- Before changing `convex/`, read `convex/_generated/ai/guidelines.md`. Do not
  hand-edit `convex/_generated/`; regenerate it with `vp run convex:codegen`.

## Toolchain

- Vite Plus owns installs, checks, lint, and tests: `vp install`, `vp check`,
  `vp lint`, `vp test`, and `vp exec <binary>`. Run `package.json` scripts with
  `vp run <script>`.
- Use `vp run dev`, `vp run build`, and `vp run start` for Next.js. Bare
  `vp dev`, `vp build`, and `vp preview` are Vite commands and skip the Next.js
  lifecycle.

## Reference Docs

Read the matching doc before working in its area:

- `docs/architecture.md`: runtime boundaries and data flow.
- `docs/prompt-design-guide.md`: writing SlopLash prompts that produce funny
  answers.
- `docs/matchslop-persona-guide.md`: MatchSlop persona seed examples.
- `docs/quizslop-game-mode.md`: QuizSlop specification.

## Guardrails

- Iterate game-flow UI through `/dev/ui` and isolated components through
  `/dev/components`, then verify meaningful changes in the live flow.
- Every push to `master` deploys to production through Vercel. Treat pushes,
  deployment configuration, Convex production deployments, and
  environment-variable changes as production changes and confirm them first.

## Verification

- Run `vp check` after settled code changes. Also run `vp test` and
  `vp run build` when changing runtime behavior, integration boundaries, or
  user-facing flows.
- Use browser automation when interactive or visual behavior needs verification.
- For docs-only changes, verify touched links, anchors, commands, and
  cross-references.
- Fix failures before claiming completion. If concurrent work makes a check
  temporarily invalid, say so and include the failing output.
