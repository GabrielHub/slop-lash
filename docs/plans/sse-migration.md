# SSE Migration Plan (Reviewed and Corrected)

## Decision Summary

SSE is the right near-term transport change for this app, but the previous plan had correctness bugs and one major architectural gap:

- It reduced HTTP invocation churn, but still did N-per-client database polling and duplicated server-side phase enforcement work.
- It mixed control-plane side effects (deadline enforcement, safety net transitions, host promotion) into every stream connection loop.

This revision keeps SSE, fixes the plan bugs, and defines when to move to a pub/sub architecture.

## Review Findings (Issues in Previous Plan)

1. Critical: the sample stream loop used `now` outside the scope where it was declared.
- Consequence: compile/runtime failure in the route implementation.

1. Critical: the client hook used `addEventListener("error", ...)` for both native transport errors and app-level server errors.
- Consequence: app cannot reliably distinguish reconnect noise from real server errors.

1. High: plan contradiction on middleware matcher ("add matcher" and "no change needed").
- Consequence: implementation ambiguity and unnecessary churn.

1. High: proposed controller stream route depended on `findControllerMeta` / `findControllerPayload` from another route file where they are private, not shared.
- Consequence: copy/paste drift or compile failure.

1. High: host control token moved to plain query params without mitigation.
- Consequence: token exposure in logs/history/referrer surfaces.

1. High: side effects were placed inside each open stream loop.
- Consequence: duplicated writes/checks under multi-tab and multi-player load.

1. Medium: hardcoded 55s lifetime assumption can be outdated and causes excessive reconnect churn.
- Consequence: unnecessary reconnects and extra warm starts.

1. Medium: `EventSource` reconnection behavior was described as exponential.
- Consequence: incorrect expectations during incident debugging.

## Correct Method

Use SSE for fanout transport, but keep stream routes read-focused. Treat orchestration (phase deadlines, safety checks, host promotion) as a separate concern.

### Data plane (SSE)

- Add:
  - `GET /api/games/[code]/stream`
  - `GET /api/games/[code]/controller/stream`
- Event names:
  - `state`
  - `server-error` (not `error`)
  - `done`
- Keep ETag/version semantics server-side; only emit when version changes.
- Keep keepalive comments for intermediaries (`: ping`).

### Control plane (game progression side effects)

- Do not run heavy progression checks in every connected stream loop.
- Keep existing mutation-triggered checks (`respond`, `vote`, etc.) and existing fallback GET behavior during migration.
- If a periodic safety ticker is still needed, run it as a single-owner tick (lease/lock), not per connection.

### Auth for stream routes

- Do not place long-lived host control secret directly in SSE URL.
- Add a short-lived stream token bootstrap endpoint:
  - `POST /api/games/[code]/stream-token` with existing auth (`playerId` or host token header).
  - Return signed token with short TTL (example: 60s).
  - SSE URL uses only this short-lived token query param.

## Recommended Architecture by Scale

### Default recommendation now

SSE + DB version checks is appropriate if concurrent active rooms are modest and the main pain is polling invocation overhead.

### Recommended next architecture if room count grows

Move fanout onto managed pub/sub (Ably/Pusher/Upstash Realtime/etc.) and publish from mutation routes.

- Benefits:
  - removes per-client DB polling loop
  - lower tail latency
  - lower duplicated read load
- Tradeoff:
  - external dependency and publish integration in each mutation path

## Implementation Plan

### Phase 0: Baseline metrics (required)

- Measure before changes:
  - `/api/games/[code]` and `/controller` request rate
  - DB query counts per active room
  - median and P95 "mutation -> UI visible" latency
  - out-of-sync incidence (TV/controller mismatch reports)

### Phase 1: Extract shared query/shape code

- Create shared modules for route data (do not import private functions from route handlers):
  - `src/app/api/games/[code]/stream-data.ts` for game route
  - `src/app/api/games/[code]/controller/controller-data.ts` for controller route
- Reuse existing payload normalization and vote/reaction stripping helpers.

### Phase 2: Build stream routes

- Create:
  - `src/app/api/games/[code]/stream/route.ts`
  - `src/app/api/games/[code]/controller/stream/route.ts`
- Route characteristics:
  - read-focused loop
  - `request.signal.aborted` handling
  - keepalive comments
  - emits only on version change
  - closes on `FINAL_RESULTS` with `done`
- Keep middleware matcher unchanged (`/api/games/:path*` already covers stream routes).

### Phase 3: Add client hooks

- Add:
  - `src/hooks/use-game-stream.ts`
  - `src/hooks/use-controller-stream.ts`
- Hook rules:
  - one `EventSource` per shell
  - explicit listeners for `state`, `server-error`, `done`
  - pause/resume on visibility for non-stage mode
  - `refresh()` forces reconnect

### Phase 4: Integrate shells

- Replace:
  - `useGamePoller` -> `useGameStream`
  - `useControllerPoller` -> `useControllerStream`
- Remove dedicated reaction polling path from `game-shell.tsx`; rely on main state stream updates.
- Keep existing non-stream GET routes as fallback/debug and for one-shot recovery paths.

### Phase 5: Guardrails and rollout

- Feature flag stream usage (`NEXT_PUBLIC_USE_SSE=1`).
- Roll out to stage view first, then game/controller clients.
- Keep rollback simple: flip feature flag to return to existing polling codepaths.

## Correctness Notes for Implementation

- Use separate heartbeat timers if both player and host heartbeats are supported in one loop.
- Prefer `server-error` event payload shape: `{ code: string; message: string }`.
- Do not claim reconnection policy details not guaranteed by platform; treat reconnect delay as browser-managed.
- Choose `maxDuration` from current project/platform limits rather than fixed 55s.

## Test Plan

1. `pnpm check`
1. Verify lobby, writing, voting, round results, final results transitions via stream.
1. Verify reactions update via main stream without `/reactions` polling.
1. Verify reconnection on tab sleep/wake and temporary network loss.
1. Verify no duplicate control-plane side effects under multiple tabs.
1. Validate fallback: disable SSE flag and confirm old polling still works.

## Success Criteria

- 70%+ reduction in `/api/games/[code]` + `/controller` request volume during active play.
- No increase in DB query rate per active room beyond agreed budget.
- No regression in phase-advance correctness.
- Reduced out-of-sync reports between stage and controllers.
