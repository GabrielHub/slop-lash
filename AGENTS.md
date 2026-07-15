# Agent Instructions

Keep this file limited to durable project facts and operating rules. Put setup,
architecture, and feature documentation in `README.md` or focused files under
`docs/`.

## Read First

- Use code, tests, schemas, fixtures, and checked-in configuration as the source
  of truth for implemented behavior.
- Read the relevant implementation and nearby tests before editing. Treat
  sibling repositories as references, not product truth.
- `CLAUDE.md` points here; update this file when project-wide rules change.

## Working Rules

- Prefer the smallest change that follows existing patterns. Avoid speculative
  abstractions, duplicate helpers, unrelated refactors, and formatting churn.
- Keep game and domain behavior in typed, testable modules instead of UI
  components. Keep TypeScript explicit and narrow; avoid `any` and `as any`.
- Do not silently decide expensive or irreversible product questions. State the
  smallest reversible assumption or ask when a wrong choice would be costly.
- Preserve unrelated work in dirty worktrees.

## Architecture

- The web application uses Next.js 16.2, React 19, and AI SDK 7 through the
  Vercel AI Gateway.
- Convex is the backend and source of truth. The dataset is greenfield; do not
  add legacy-database migration or compatibility paths.
- Prefer Convex React hooks over REST-style application data routes:
  `useQuery`/`usePaginatedQuery` for reactive reads, `useMutation` for
  transactional writes, and `useAction` for external-service or Node.js work.
- Presence owns ephemeral online/offline state. Workpool owns bounded concurrent
  jobs. Workflow owns durable multi-step orchestration. Durable game state stays
  in application tables, not component presence records.
- Browser code receives `NEXT_PUBLIC_CONVEX_URL`. Configure secrets such as
  `AI_GATEWAY_API_KEY`, `HOST_SECRET`, `GEMINI_API_KEY`, and `FAL_KEY` in Convex.
- Before changing `convex/`, read its generated AI guidelines when present. Do
  not hand-edit `convex/_generated/`; regenerate it through the checked-in task.

## Toolchain

- Vite Plus owns dependency installation, runtime selection, tasks, checks,
  lint, and tests. Use `vp install`, `vp check`, `vp lint`, `vp test`, and
  `vp exec <binary>` directly.
- This is a Next.js application. Use `vp run dev`, `vp run build`, and
  `vp run start`; direct `vp dev`, `vp build`, and `vp preview` are Vite
  commands and do not run the Next.js lifecycle.
- Check `vite.config.ts` tasks and `package.json` scripts before assuming a
  command.
- Do not start the development server; assume it is already running.

## Project Guardrails

- Iterate game-flow UI through `/dev/ui` and isolated components through
  `/dev/components`, then verify meaningful changes in the live flow.
- Vercel deploys pushes to `master`; treat deployment configuration, Convex
  production changes, and environment-variable changes as production changes.

## Verification

- Run `vp check` after settled code changes. Run `vp test` and `vp run build`
  when changing runtime behavior, integration boundaries, or user-facing flows.
- Use browser automation when interactive or visual behavior needs verification.
- For docs-only changes, verify touched links, anchors, commands, and
  cross-references.
- Fix failures before claiming completion unless concurrent work makes a check
  temporarily invalid.
