# AI Calls

Every model call goes through the task layer in `src/lib/ai/`:

- `runStructured(task, options)`: one structured call (`Output.object`,
  `Output.choice`, `Output.array`).
- `runText(task, options)`: one plain-text call. It succeeds only when the
  model stopped on its own (`finishReason: 'stop'`) with non-empty text.
- `decideChoices(questions, state, keys, options)`: one Jev
  (`experimental_decide`) call with a pick-one question per id.

None of them throws for a model or provider problem. Each one returns
`{ ok: true, output }` or `{ ok: false, failReason }`, together with `usage`,
`latencyMs`, `attempts`, `finishReason`, `promptVersion`, `budgetEndsAt` and
`call`. `call` is the call as an `aiCalls` row.

They do throw for caller bugs, because a bug should surface instead of
looking like a flaky provider:
- instruction blocks out of order (`buildInstructions`);
- a request the SDK rejects as invalid: `InvalidPromptError` (for example a
  `role: 'system'` message inside `messages`) or `InvalidArgumentError`;
- `decideChoices` with no questions. Skip the call when a voter has nothing
  to decide.

The task registry (`src/lib/ai/tasks.ts`) sets how each kind of call runs:
reasoning, output cap, SDK retries, workpool and timeout window. Prompts stay
with their game.

## Call topology

| Task | Fires when | Output | Reasoning | Pool | Cap / retries | Floor–cap |
|---|---|---|---|---|---|---|
| `sloplash.jokes` | WRITING starts; one call per AI seat per round | Every prompt for that seat: `answers: [{ prompt: P1…Pmax, text }]`. Code caps each answer at 80 characters | `minimal` | background | 8,000 / 2 | 5–45s |
| `sloplash.ballots` | WRITING closes; one call per AI voter per round | `ballots: [{ matchup: M1…Mmax, pick: 'A' \| 'B', reaction }]`, with A and B shuffled per voter | `none` | critical | 4,000 / 1 | 3–20s |
| `sloplash.tagline` | ROUND_RESULTS or FINAL starts; called for the leading AI | One line of 100 characters or fewer. An empty line is a failure | `none` | background | 2,000 / 1 | 2–10s |
| `matchslop.profile` | Room created | Profile with `imagePrompt` folded in | `minimal` | background | 12,000 / 2 | 10–45s |
| `matchslop.botLine` | WRITING starts; one call per AI seat | The seat's opener or line | `minimal` | background | 6,000 / 2 | 5–40s |
| `matchslop.vote` | VOTING starts; one call per AI voter | `Output.choice` over fixed labels, shuffled per voter in code. A failed call abstains | `none` | critical | 2,000 / 1 | 3–20s |
| `matchslop.reply` | SENT starts; the persona judges the sent line | `{ level, reply, ...signals }` | `minimal` | critical | 6,000 / 1 | 5–20s |
| `matchslop.postMortem` | FINAL starts | In-character recap, players named by fixed seat keys | `minimal` | background | 8,000 / 2 | 10–40s |
| `narrator.line` | Host screen cue (`convex/narrator.ts`) | One spoken line, used only on `stop` | `none` | runs in the action | 1,000 / 0 | 3s |

`P1…Pmax` means a fixed enum sized for the task's maximum, not this call's
count; see "Keep the schema fixed" below.

**Free Play SlopLash ballots** (`castBallots` in `src/games/sloplash/ai.ts`):
- When `AI_GATEWAY_API_KEY` is set, Jev goes first through `decideChoices`,
  timed and recorded as `sloplash.ballots`, with one choice question per
  matchup and no reactions.
- Without the key, or when Jev refuses or fails, Haiku casts the structured
  ballots instead. Pass the Jev result's `budgetEndsAt` to the Haiku call so
  the pair shares one budget.

Free Play itself needs only `ANTHROPIC_API_KEY`.

**Reasoning:**
- `'none'` turns thinking off.
- `'minimal'` is the lowest effort level the provider has. On Haiku 5.5 that
  is adaptive thinking at low effort.
- Thinking tokens count against `maxOutputTokens`, so every cap leaves room
  for thinking. Hitting a cap fails the call as `length`.

## Timeouts and retries

A call's budget is `deadline - now - 1.5s`, capped at the task's `capMs`.
Without a deadline (timers off, or the lobby), the budget is `capMs`. A call
never runs past the deadline: a result that lands after the phase is thrown
away but still billed.

- Pass the phase deadline: `deadline: game.phaseDeadline ?? null`.
- **The floor** (`floorMs`) is the least time worth a request. When the
  budget is under it, the call is skipped: `failReason: 'timeout'`,
  `attempts: 0`, and `error` starts with `skipped:`. No request is made.
- **Retries** run inside the same budget. The SDK waits before a retry
  (`retry-after` when under 60s, else 2s doubling). When that wait plus the
  floor does not fit in the time left, there is no retry: the call fails at
  once as `provider-error`, and `error` names the status and the wait. A 429
  with `retry-after: 30` on a 20s ballot call therefore fails in
  milliseconds instead of sleeping until the timeout.
- **Fallbacks share a budget.** Pass an earlier result's `budgetEndsAt` as
  the next call's `budgetEndsAt`, so a fallback gets only the time that
  first call left.
- A caller's `abortSignal` is merged with the budget. Running out of budget
  reports `timeout`, and the caller aborting reports `aborted`.
- `timeoutMs` replaces the budget and skips the floor check (tests, or a
  caller that has its own clock).

## Workpools

There are two workpools of 8 each, so 16 run in parallel in total, under the
free plan's 20 (`convex/components.ts`):

- **`critical`** (`aiCriticalWorkpool`) holds calls the room waits on: ballots,
  votes and persona replies.
- **`background`** (`aiGenerationWorkpool`, the original pool) holds calls
  hidden behind a timer or the lobby.

`enqueueJob(ctx, game, kind, key, payload, { pool })` picks the pool in this
order:
1. `options.pool`
2. the handler's `pool`
3. `background`

To follow the registry, set `pool: getAiTask(task).pool` on the handler.

## Prompt layout

Every prompt is ordered **static, then per-game, then per-call**, so that the
stable prefix can be cached:

- **static:** the house brief, style guide, rubric and fixed examples. It is
  identical across rooms for a task.
- **game:** the persona, room settings and content level.
- **call:** this round's prompts, answers and the transcript tail. Put the
  per-call part in `prompt` or `messages` when you can.

Never put timestamps, ids, random seeds or rotating examples in the static or
game blocks.

```ts
instructions: [
  { text: HOUSE_BRIEF, cache: "static" },
  { text: PLAYER_TEXT_IS_DATA, cache: "static" },
  { text: personaBlock(game), cache: "game" },
  { text: roundFacts, cache: false },
],
```

`buildInstructions` throws when a block comes after a less stable one.

**Per-turn state goes in the last user turn.** For a chat such as the
MatchSlop persona, send the transcript as alternating `messages` and put the
state that changes every turn (mood, round, provisional outcomes) at the end
of the last user turn. Do not put `role: 'system'` messages inside
`messages`: the layer does not enable that (Gateway models may not support
it), and the SDK rejects it with `InvalidPromptError`, which the layer
rethrows.

### Keep the schema fixed

Providers cache the output schema as part of the prompt prefix. Anthropic
sends it as `output_config.format`, and changing a structured-output format
breaks the cache. A schema that differs between calls of the same task
therefore means no cache reads, even with a perfect prefix.

- Use the same zod schema object on every call of a task, ideally a module
  constant.
- For per-call choices, use fixed positional keys sized for the task's
  maximum: `z.enum(slotKeys("M", MAX_MATCHUPS))`, not an enum of this call's
  matchups. Say in the prompt which keys apply to this call, then check each
  pick in code and map it back. This applies to SlopLash prompt and matchup
  keys, MatchSlop prompt ids, and post-mortem player names (use seat keys
  `S1…Smax` with the names in the prompt).
- Fixed vocabularies (`'A' | 'B'`, reaction keys, MatchSlop levels) are
  already stable.
- Bump the task's `promptVersion` when the schema changes.

**Player text is data:**
- Put `PLAYER_TEXT_IS_DATA` in the static instructions.
- Wrap every piece of player-written text with
  `xml("answer-A", text)`, `xml("candidate-2", text)`,
  `xml("context", text)` or `xmlBlock("transcript", lines)`.
- `xml()` drops control and bidi characters and collapses the text to one
  line. In element text it escapes `<` and `>`, plus any `&` that would read
  as an entity (`&lt;`, `&#60;`), so a player can neither close the tag nor
  fake a new speaker. Quotes, apostrophes and a plain `&` stay as typed.
  Attribute values are fully escaped.
- A model may still copy an entity back (`&lt;3`). Run
  `decodeXmlEntities(text)` on model text before showing it, speaking it, or
  comparing a quote with what a player actually sent.
- `sanitize()` already stores answers and replies as one line.

## Caching per provider

**Anthropic direct** (Claude models with an `anthropicModelId`, such as Free
Play Haiku):
- The last block of each cached tier gets
  `providerOptions.anthropic.cacheControl: { type: 'ephemeral' }`. That is at
  most two breakpoints, with the default 5-minute TTL.
- For a chat transcript, call `markCacheBreakpoint(message)` on the newest
  turn that will repeat in the next call. Usually that is the last turn before
  the new one.
- Anthropic allows 4 breakpoints per request. Message markers beyond what the
  instructions leave are dropped, oldest first.
- Haiku 5.5 caches a prefix of at least 512 tokens. This figure comes from
  Anthropic's prompt-caching documentation. Shorter prefixes silently skip
  the cache.
- Cache reads cost $0.01/MTok and 5-minute writes $0.125/MTok
  (`cacheReadPer1M` / `cacheWritePer1M` in `src/lib/models.ts`).
- Only mark a block that a later call will repeat within the TTL. A task that
  runs once per game (`matchslop.postMortem`) caches its static brief, which
  every room's post-mortem shares, but not its per-game persona block: that
  write would never be read. Live on DEV this took the
  post-mortem from 652 tokens written per game to 0 after the first room.

**Vercel AI Gateway** (every other model):
- Every call sends `providerOptions.gateway.caching: 'auto'`. Upstream
  providers then cache long prefixes automatically, as long as the layout
  rule holds and the schema stays fixed.
- Upstream minimums vary by provider, roughly 1–4k tokens, and were not
  verified here.
- The catalog has no cache prices for them. Cached tokens are priced at the
  input rate, which overestimates the cost, and the row carries
  `cachePriceKnown: false`.

**Jev** (decision model): no caching. `experimental_decide` has no timeout
option, so the budget is applied through its `abortSignal`.

## Fail reasons

| `failReason` | Meaning |
|---|---|
| `timeout` | The budget ran out mid-request, or was under the floor so no request was made (`attempts: 0`, `error` starts with `skipped:`) |
| `aborted` | The caller's `abortSignal` fired |
| `refused` | Finish reason `content-filter` (an Anthropic refusal), or a Jev refusal (`refusedQuestionIds`) |
| `invalid-output` | The reply did not parse, missed the schema, or was empty. `text` holds the raw reply when there was one |
| `length` | Hit `maxOutputTokens`, thinking included |
| `provider-error` | API, network or gateway error after the SDK retries, or a retryable error (429, 5xx) whose retry did not fit the budget. `error` carries the HTTP status |
| `missing-key` | The key the model's route needs is not set. No request was made |

## Recording

- **One row per call in `aiCalls`** (indexed `by_gameId`). Each row has
  `task`, `promptVersion`, `modelId`, `ok`, `failReason`, `finishReason`,
  `latencyMs`, `attempts` (SDK retries included), `usage`, `error`,
  `createdAt` (when the call started) and `jobId` when it came from a job.
- **`usage`:**
  - `inputTokens` counts every input token, cached or not.
  - `cacheReadTokens` and `cacheWriteTokens` split out the cached part.
  - `outputTokens` includes `reasoningTokens`.
  - `costUsd` is an estimate from the catalog prices.
- **Job runners:** return `jobResult(output, calls, failReason)` from
  `convex/jobs.ts`.
  - `calls` are the `result.call` records, one per call made (a fallback or
    retry adds its own).
  - `jobs.apply` inserts the rows and rolls their usage into `gameModelUsage`,
    which feeds the leaderboard spend.
  - With a non-null `failReason`, the job ends as `FAILED` with that reason,
    after `apply` has stored the fallback output.
- **Calls outside a job:** call
  `ctx.runMutation(internal.jobs.recordAiCalls, { gameId, calls })`. Narrator
  lines are recorded only this way, so they never count as player spend. The
  narrator records while speech is synthesized, and a failed write is logged,
  never fatal to the cue.
- **`generationJobs`** also records:
  - `startedAt`: when the runner picked the job up. `startedAt - createdAt` is
    the time spent queued.
  - `latencyMs`: the runner's whole run.
  - `failReason`: the runner's reason, or `action-error` when the action
    threw.

## Reading `aiCalls`

- **Dashboard:** in the dev deployment's Data tab, open `aiCalls` and filter by
  `gameId`.
- **CLI:** `vp exec convex data aiCalls --limit 50` (dev deployment).

What to look for:
- **Caching works** when the second and later calls of a task in one game show
  `usage.cacheReadTokens > 0`. On Anthropic, the first call also shows
  `cacheWriteTokens > 0`; most Gateway providers bill no writes. All zeros
  usually means the prefix is under the provider's minimum, something in the
  static or game blocks changes between calls, or the schema differs between
  calls.
- **Prompt changes:** compare `ok`, `failReason` and `latencyMs` across
  `promptVersion` values for the same `task`.
- **Retries and slow providers:** look for `attempts > 1`, for
  `failReason: "timeout"`, and for `provider-error` rows whose `error`
  mentions 429.
- **Queue pressure:** `generationJobs.startedAt - createdAt`, grouped by job
  kind.
- **Thinking cost:** `usage.reasoningTokens` against `outputTokens`, per task.

## Adding a task

1. Add an entry to `AI_TASKS` in `src/lib/ai/tasks.ts`. Fill in `summary`
   (when it fires and what it returns), `reasoning`, `maxOutputTokens` with
   thinking headroom, `maxRetries`, `pool` and `timeout` (`floorMs` is the
   least time worth a request). Add a row to the table above.
2. In the game's prompt module, export the instructions as
   `InstructionBlock[]` (static, then game, then call) and a `promptVersion`
   integer. Bump that integer on any change to the instructions, schema,
   examples or layout.
3. Call `runStructured` with a zod schema that is the same on every call. Use
   `z.enum` for every choice, with fixed keys (`slotKeys`) where the choices
   vary per call, and never a regex or "respond only with JSON". Use
   `runText` only for free text.
4. In the job runner, return `jobResult(output, [result.call], result.ok ? null
   : result.failReason)`, and set the handler's
   `pool: getAiTask(task).pool`.
5. Test with `MockLanguageModelV4` from `ai/test`, passed as `languageModel`,
   or with `Experimental_DecisionMockModelV4` passed as `decisionModel`. See
   `src/lib/ai/run.test.ts`.
