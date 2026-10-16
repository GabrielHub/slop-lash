# Convex usage audit — October 15, 2026

## Account evidence

The BreadBasket (Vercel) team dashboard showed 822.23 MB of monthly Database I/O
against a 1 GB allowance, with 210K of 1M function calls. Database I/O, rather
than storage (79.2 MB of 512 MB) or action compute (0.56 of 20 GB-hours), is the
immediate constraint. These are October-to-date totals, not a measured daily
rate or a forecast.

| Local project | Convex project       | Database I/O | Share |
| ------------- | -------------------- | -----------: | ----: |
| SlopLash      | convex-carmine-field |    518.03 MB | 63.0% |
| BreadBasket   | breadbasket-native   |    155.82 MB | 19.0% |
| Seasoning     | convex-coral-canvas  |    148.39 MB | 18.0% |

Source: the authenticated [team usage dashboard](https://dashboard.convex.dev/t/breadbasket/settings/usage),
checked October 15. Development and production deployments both consume the
team allowance. Convex [Database I/O](https://docs.convex.dev/production/state/limits)
counts document and index data transferred to and from the database. Reducing
the fields returned to the browser does not avoid reading the original document.

## SlopLash findings

- Development `views.room` used 202.55 MB and `views.watch` 116.08 MB. These
  queries read the room's fighters and fights, so writes to those documents
  invalidate the full query even when the returned fields do not change.
- Development `slopfight/play.hype` used 54.65 MB across about 1.1K calls.
  Every burst read fighter sheets and bets and patched a fight document that
  also contains frozen sheets and simulation results. Its changes then caused
  the room queries above to run again. The development Health insights showed
  33 hype calls with write-conflict retries in the preceding 72 hours.
- Development `slopfight/stage.strokes` used 22.62 MB. It first loaded fighter
  documents to find their strokes; typing and forge streaming therefore caused
  old drawing batches to be read again.
- Forge partial updates also wrote fighter documents. Excluding partial parts
  from a query's return value did not prevent its database reads from repeating.
- `engine.sweep` ran every 15 seconds even with no players. The dashboard showed
  about 34K calls on development and another 34K on production: roughly 68K of
  this project's 118K calls. A continuously enabled 15-second cron runs 5,760
  times per day per deployment before any game-specific work.
- `engine.maintain` cost 10.95 MB in development, including repeated roster and
  presence reads and maintenance of idle lobbies and recently finished rooms.
  Phase `tick` calls also used 10.94 MB; transitions do necessary game work, so
  that number alone is not evidence of a bug.

The live read-only diagnostics used `vp exec convex insights --details --json`
on development `resilient-ram-301` and `--prod` on production
`scrupulous-albatross-281`. Health insights describe threshold events over 72
hours; they do not replace the monthly usage breakdown.

## SlopLash changes

- Live hype uses a separate small counter row and stage subscription. Taps
  coalesce into at most one call per second while local feedback is immediate.
  Normal results and early endings freeze totals for recaps.
- Forge partials use a separate stream row. The stage and the forging player's
  progress query read it; full room views and drawing queries do not.
- Drawing queries read the existing game index directly, avoiding fighter
  document dependencies.
- Active-room heartbeats throttle maintenance to once per 15 seconds, with the
  throttle stored outside `games`. A five-minute indexed safety sweep recovers
  missed deadlines. Maintenance failure cannot roll back a successful heartbeat.
  Returning rooms get a short grace period for the other phones to reconnect.
- Cleanup removes the new per-game rows through the existing bounded lifecycle.

Before deployment, finish active SlopFight games: the new stream and counter
rows are initialized by new forge/fight creation. Retained finished games use
their existing snapshots. A bounded read on October 15 found only finished
games in both SlopLash deployments; recheck before a later production rollout.

## Audit of every game mode

The second pass covered every mode's public writes, AI preparation and result
paths, phase completion, room/stage/controller subscriptions, and retained
results. These are source and regression-test findings, not a claim that the
monthly dashboard attributed the original SlopFight totals to every mode.

| Mode      | Finding and fix                                                                                                                                                                          | Preserved behavior                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| SlopLash  | Live voting reactions now use a narrow child subscription. Full room views read only past matchup reactions while voting. History, writing, and completion paths skip unused vote reads. | Anonymous unrevealed authors, human-only live effects, revealed attribution, AI reactions, final scoring, and reload behavior. |
| MatchSlop | Submissions, votes, and AI jobs use the current prompt and exact indexed rows. Writing skips votes; views reuse the roster; reply scoring reads at most two current-turn messages.       | Duplicate and stale input handling, foreign-room rejection, self-vote restrictions, and later-turn author credit.              |
| QuizSlop  | Reveal reactions no longer invalidate the full room view. Per-player calls, answers, and house votes use exact indexes. Topic no-ops and transition read reuse avoid redundant work.     | Token accounting, kicked-seat and cross-room validation, phase boundaries, question reuse, and reload behavior.                |
| SlopFight | Separate hype counters and forge streams; direct drawing reads, as detailed above.                                                                                                       | Forge ownership and stale-token guards, live feedback, recap totals, and cleanup.                                              |

Shared leaderboards already use bounded indexed materialized records, and
cleanup uses bounded indexed batches. Workpool concurrency and job keys already
bound and deduplicate AI work. Their necessary behavior was retained.

## Other projects

BreadBasket's production `analytics.discoveryCandidatesPage` used 63.51 MB.
The initial source audit found directory search fetching every page before
sorting and selecting 12 suggestions, with substring filtering after reading
full player records. Its cleanup chat must preserve aliases and substring
matching while reducing that repeated scan. `analytics.seasonGamesPage` used
20.9 MB and already has revision-keyed server caching. The import (14.83 MB),
projection rebuild (14.1 MB), and rating replay (8.74 MB) are operator operations;
their historical totals do not prove recurring visitor traffic.

Seasoning's production seed clearing and reinsertion accounted for 100.06 MB
of its 148.39 MB. The audit found public `seed` and `clear` actions and no
unchanged-version early return in seeding. Its cleanup chat covers internal-only
operator entrypoints and idempotent seeding. There is no evidence of abuse.
Its `pvp.cleanupExpired` and `party.cleanupExpired` also accounted for roughly
30.4K of 35K calls. The follow-up audit found those jobs already use bounded
indexes and maintain gameplay expiry, so their cadence was preserved.

Separate cleanup chats were started for both repositories. Seasoning's operator
guards and narrower league reads were validated and deployed in that chat after
the user's explicit approval, without reseeding or clearing data. BreadBasket's
search and season-page improvements passed local validation and were pushed
after approval in its own chat; hosted release verification continues there.

A subsequent Seasoning all-mode audit completed in commit `7585ea0`: boards
stop after 25 visible rows, concurrent roster hydration shares pending reads,
matched PvP drops its queue subscription, and abandoned rooms stop heartbeats.
Its five CI jobs passed. That chat reports the newer Convex deployment still
pending its production approval; a pushed frontend alone does not publish backend changes.

## Validation and rollout

- `vp check`: passed, zero errors and 72 existing warnings.
- `vp test --run`: all 109 files and 1,189 tests passed. Regressions include
  disconnected voters, 20-second and 60-second returns, a continuously connected
  display host, stale forge callbacks, permissions, cleanup, and final hype totals.
- `vp run build`: passed. Independent review found no remaining blockers.
- Browser fixture checks covered the forging controller, foundry stage, fight
  stage, immediate hype feedback, finished recap, SlopLash voting reactions,
  MatchSlop voting, and QuizSlop reveal reactions, with no console errors.
- `vp exec convex dev --once` deployed the changes to `resilient-ram-301` on
  October 15. No active games existed before that deployment.
- One bounded live development game passed: the owner received three progress
  updates with up to five streamed parts, live hype reached A=3/B=0 while the main
  room mode stayed unchanged, and early ending preserved that total in the recap.
  The test ended its room, disconnected its sessions, and closed subscriptions.
- The broader live development check passed one bounded flow each for SlopLash
  responses/votes/reactions/reveal, MatchSlop responses/votes/persona reply, and
  QuizSlop calls/answers/isolated reveal reactions. Each room was ended and all
  test sessions and subscriptions were closed.
- Production publishing was explicitly authorized after review and simplification.
  The rollout deploys Convex before pushing the frontend, checks Vercel's exact
  commit and Ready state, and verifies the hosted app. No live data was cleared.

## Verification and operating practice

- Use `vp test` for backend regression tests and `/dev/ui` for static visual
  iteration. Neither requires a cloud game or real model calls.
- Run the live room and SlopFight integration scripts deliberately: a localhost
  frontend can still use the cloud development deployment, and a full game
  consumes database I/O and AI credits. Close test contexts and end test rooms.
- Validate a change with one representative live flow after offline tests;
  repeated cloud stress runs are unnecessary for ordinary visual edits.
- Compare the same functions and deployments over a fresh interval after
  deployment. The existing monthly usage will not decrease when code is fixed.
- Optional [deployment usage limits](https://docs.convex.dev/production/usage-limits)
  can bound development spending. A disable threshold stops that deployment;
  choose it deliberately rather than silently changing production availability.
- Production publishing still requires the confirmation described in
  [AGENTS.md](../AGENTS.md). A local code fix does not change a deployed cron.

Expected savings from isolating hype and removing unrelated drawing reads are
structural, not a claimed billing percentage. A five-minute safety sweep would
run 288 times per day, 95% fewer global sweeps than the old cadence; active-room
work and other crons remain additional usage.
