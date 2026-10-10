# QuizSlop: Adaptive Party Trivia

> Status: implementation-ready prototype specification 1.0. This document
> defines the first playable version and its implementation path. Defaults
> marked as tuning hypotheses remain authoritative until playtest evidence
> explicitly replaces them.
>
> Display name: **QuizSlop**
>
> Internal game type: **QUIZSLOP**

> **What shipped (October 2026).** The engine rewrite cut this spec down to
> the core game. The code is authoritative where the two disagree.
>
> - Questions come only from the static, human-reviewed catalog
>   (`src/games/quizslop/config/`). There are no AI-generated packs, no custom
>   topics, and no disputes; every ruling is final.
> - Each player picks a catalog Home Topic in the lobby. A player who doesn't
>   pick gets a random one at the start.
> - Each round runs CALL (bets; the TV shows the round's topic while phones
>   bet), ANSWER, REVEAL (one question group per step), and ROUND_RESULTS.
>   HOUSE_VOTE opens the last round, and the last round's final reveal goes
>   straight to the final screen with no ROUND_RESULTS. There is no separate
>   topic phase. A round where no connected player has a bet left opens at
>   ANSWER. See [Standard Round](#standard-round) and
>   [Timers](#timers-advancement-and-disconnects).
> - Rounds run on the shared engine (`convex/quizslop/mode.ts`), with the same
>   deadlines, host controls, and host failover as every other mode.
> - Players only ever read **"bet"**. Internal names (`quizSlopCalls`,
>   `callTokens`, `SLOP_CALL_SECONDS`, the `CALL` phase) keep "call"; screens
>   never say "Call Slop", "hold", "token", "tier", "Home Turf" or "finale".
>   A Home Turf round is "{Name}'s topic"; the House Choice is "the last topic".
> - There are no voice lines: screens use fixed, short copy.
> - "Play again" keeps the room code and players (scores 0) in a fresh game.
>   The new game avoids the topics and questions the room saw in the previous
>   game when the catalog allows.
> - The rejoin and continuity rules below are replaced by the shared
>   rejoin-by-name flow.
>
> The sections on packs, disputes, verification, and continuity grace are kept
> as history and future direction.

## Decision Summary

QuizSlop is human party trivia that quietly adapts each player's questions as
the game progresses. Players bring a topic they claim to know, answer private
multiple-choice questions, and predict when a friend will miss.

The short pitch is:

> **Bring your niche. Call your friends' slop. See who can keep up.**

The first prototype uses these locked rules:

- 2-8 human players; 4-6 is the intended center.
- AI builds and verifies question packs before play. It is never a contestant
  and never decides truth or score during a live round.
- Every player confirms one private **Home Topic**, which receives one
  guaranteed shuffled **Home Turf** round.
- A standard game begins with one server-selected catalog warm-up, continues
  through every Home Turf round, and ends with one player-voted catalog topic.
- Every topic pack contains one four-choice question at each internal tier:
  Easy, Medium, Hard, and Insane.
- Each player begins every game at hidden Easy difficulty. A valid correct
  answer raises their next question one tier; an incorrect answer lowers it one
  tier. The player never selects or sees the tier.
- A normal correct answer earns 100 points and an incorrect answer earns zero.
  The final-round correct answer earns 200 points.
- Before questions appear, a player may spend one of two **Call Slop** tokens
  to predict that another player will miss. A correct call earns 150 points and
  an incorrect call loses 150 points.
- The catalog and generated packs use a sharp comedy-game voice: witty question
  framing, playful but fair distractors, and factual explanations with a short
  punchline. Correctness and answer clarity always outrank a joke.
- Questions, choices, keys, explanations, and source evidence are frozen before
  the host starts the game. No scored phase waits on a model call.

These are explicit non-goals for the first version:

- visible difficulty labels, difficulty selection, or player-facing ratings;
- hidden roles, sabotage abilities, elimination, or team deduction;
- AI players, AI fill, or solo play;
- built-in text chat, voice rooms, transcription, or AI player dialogue;
- free-response grading;
- live current-events questions;
- persistent difficulty or skill ratings across games;
- multilingual question generation;
- AI narration or open-ended AI banter;
- a production web admin/content-moderation console;
- global leaderboard projection or a shareable historical recap.

## Complexity Budget

The normal round must feel like four beats, not a rules checklist:

**Bets -> Answer -> Reveal -> Results**

The stage and every controller follow this same four-beat loop. The screen
itself says what to do; there is no step counter or help text. Internal substates
such as the simultaneous call reveal, one-question-at-a-time receipts, and a
rare factual dispute must not make the player wonder whether a new rule has
appeared.

There is no tutorial round: the round opener on the TV and the phone screens
carry the rules, and nothing waits for the host to explain them. Players make
only two decisions before the reveal: optionally bet that one friend misses,
then answer one question. Hidden adaptation, question assignment, scoring, and
settlement are server behavior and require no explanation during play.

Comedy comes from question writing, deterministic game-show copy, reveals, and
the players' reactions. It must not add another input, phase, or scoring rule.

The final topic vote is the only standard-game vote outside a factual dispute.
A dispute is an exceptional safety valve, not a normal round phase players must
study in advance. Do not add visible tier choices, confidence inputs, chat,
power-ups, category vetoes, or extra host settings to the first prototype.

## Why This Should Be Fun

1. **Personal ownership:** everyone gets a round built around a topic they
   chose, and the room sees whose Home Turf it is.
2. **A challenge that keeps moving:** early questions are welcoming, then the
   hidden ladder finds the edge of each player's knowledge without exposing a
   rating system.
3. **Social prediction:** Call Slop lets players act on what they know about
   their friends' interests, confidence, and bluffing.
4. **Shared reveals:** players may receive different questions, but the room
   sees every selected question and result together after answers lock.
5. **A clear comeback:** the final neutral topic awards double quiz points
   without changing Call Slop values.
6. **The quiz itself has jokes:** prompts and explanations should create laughs
   even before the room starts roasting one another.

The AI feature exists to make unusual player topics playable and to build a
credible four-step difficulty ladder. It should not become the main character.

## Comedy and Voice Contract

QuizSlop is a comedy party game that happens to require exact factual answers.
Its benchmark is the read-aloud laugh density of the other Slop games and the
best Jackbox-style trivia: authored specificity, quick setups, and clean buttons,
not textbook stems wearing one quirky adjective. Do not copy existing prompts
or another game's proprietary voice.
Its content priority is:

1. the keyed fact is correct and source-supported;
2. the question and all choices are unambiguous;
3. the wording is as funny as those constraints allow.

Use the specificity, variety, funny-word discipline, and read-aloud checks in
the [Prompt Design Guide](prompt-design-guide.md). Adapt them to factual trivia:
do not import its fill-in-the-blank structures, current-events suggestions, or
shock-value guidance when they conflict with this document's answer-safety,
evergreen, and party-safe rules.

A funnier line never rescues a weak fact, leaks the answer, changes the meaning
of a choice, or makes a question harder to parse. If a joke conflicts with
truth or clarity, reject the joke and try another framing.

Every playable question contains both a neutral factual form and player-facing
comedy copy:

- `neutralQuestion`: the plain question used to verify factual equivalence;
- `displayPrompt`: the concise, witty version shown to players;
- `choices`: four semantically parallel options in frozen order. The catalog
  may store the correct answer first: players never see this order. Each game
  shows the choices in a stable per-game permutation (`presentChoices` in
  `src/games/quizslop/shuffle.ts`, seeded by game and question id), and
  `selectedIndex` / `correctIndex` in views and scoring use that order;
- `explanation`: the supporting fact first, followed by at most one short
  comedic button;
- `comedyDevices`: one or two ordered, bounded tags describing the intended
  device, with the primary device first, such as `UNEXPECTED_SPECIFICITY`,
  `DRY_ASIDE`, `INCONGRUITY`, `ANTHROPOMORPHISM`, `AFFECTIONATE_ROAST`, or
  `UNDERSTATEMENT`.

For example:

| Part             | Example                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| Neutral question | Which planet has the shortest day?                                                                 |
| Display prompt   | Which planet spins like it just remembered the oven is on, finishing a day in roughly ten hours?   |
| Correct answer   | Jupiter                                                                                            |
| Explanation      | Jupiter rotates once in just under ten hours. The largest planet is apparently late for something. |

The joke adds voice without changing the tested fact. By contrast, one absurd
gag choice beside three plausible choices is invalid because it gives away free
information.

### Voice rules

- Prefer one unexpected concrete detail over a pile of quirky adjectives.
- Keep wording short enough to read aloud naturally in a noisy room.
- Use specificity, incongruity, dry confidence, affectionate subject-matter
  roasts, and occasional wordplay.
- Vary comedy devices across a pack. Do not make every question a simile, every
  explanation sarcastic, or every noun a goblin.
- A selected four-question pack uses at least three distinct primary comedy
  devices and cannot reuse the same joke template twice.
- Keep all four choices similar in grammatical form, semantic type, length, and
  joke/clue density. Plain choices are better than unfair funny choices.
- Make explanations satisfying even when the player missed: state why the
  answer is right, then land one quick joke and leave.
- Joke about the topic, institution, object, or situation. Never ridicule a
  player's intelligence, identity, body, trauma, or unfamiliarity with a topic.
- Favor evergreen humor. Avoid memes, scandals, slang, or topical references
  likely to age before the pack is retired.
- Avoid generic AI-comedy sludge: `chaos`, `unhinged`, `plot twist`, `because of
  course`, therapy-speak, and self-aware robot jokes are not substitutes for a
  specific observation.
- Keep the party-safe rating. Light edge is welcome; cruelty, sexual content,
  hate, and shock without structure are not.

### Catalog and generated-content standard

Every reviewed catalog question must receive separate factual and comedy
approval. Comedy review includes a read-aloud pass, answer-leak check, choice
parity check, and one of `WITTY` or `BIG_LAUGH`; `FLAT`, `TRY_HARD`, `MEAN`, or
`ANSWER_LEAK` cannot ship. Store the comedy review state and reviewer alongside
the factual review metadata.

The checked-in calibration examples are themselves voice exemplars, not dry
placeholders. Include rejected examples for technically correct but painfully
flat wording, forced jokes, repetitive devices, and jokes that reveal the key.

These illustrative voice examples show the target. They are not playable
catalog records until their complete choices, sources, and human review metadata
exist:

| Neutral fact                                  | Player-facing catalog voice                                                                                     | Fact-first reveal with comedic button                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| An octopus has three hearts.                  | How many hearts does an octopus keep on payroll, as if eight arms were not already an administrative nightmare? | An octopus has three hearts. Apparently eight arms come with executive-level cardiovascular benefits.                                         |
| Canberra is the capital of Australia.         | Which city is Australia's capital, after Sydney and Melbourne apparently required adult supervision?            | Canberra is Australia's capital, selected as a compromise between rivals Sydney and Melbourne. The civic version of "neither of you gets it." |
| Mascarpone is traditionally used in tiramisu. | Which cheese holds tiramisu together while espresso and cocoa take all the glamour shots?                       | Mascarpone gives tiramisu its creamy layers. The structural engineer gets no credit.                                                          |

The real catalog should be at least this authored and specific. A flat factual
stem with a random quirky adjective does not satisfy the comedy requirement.

The rejected voice set should be equally concrete:

| Rating        | Rejected example                                                          | Why it fails                                                    |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `FLAT`        | Which cheese is traditionally used in tiramisu?                           | Correct, but it supplies no authored comedy voice.              |
| `TRY_HARD`    | Which unhinged chaos-cheese goblin yeets itself into tiramisu?            | Generic internet slang piles up without a specific observation. |
| `ANSWER_LEAK` | Which creamy Italian cheese beginning with "mascar-" belongs in tiramisu? | The joke-shaped clue gives away the key.                        |
| `MEAN`        | Only an idiot misses this: which cheese goes in tiramisu?                 | It targets the player instead of the subject.                   |

Generated packs receive the same contract in their prompts. The generation
prompt must:

- identify the product as a fast comedy party game, not an exam;
- provide reviewed category- or structure-relevant voice examples from the
  catalog, plus nearby rejected examples;
- instruct the model to ground only in supplied evidence;
- keep neutral fact construction separate from comedy rewriting;
- request three distinct comedy variants rather than accepting the first
  joke-shaped sentence;
- forbid changes to the canonical fact, correct index, or choice meaning during
  comedy rewriting;
- ask the verifier to check factual equivalence, answer leakage, choice parity,
  clarity, meanness, repetitiveness, and comedy quality.

Use comedy ratings only to rank candidates that already passed factual and
safety checks. Model-rated humor is not a substitute for the human-reviewed
catalog or the launch-sample comedy review.

The comedy rewriter is a separate structured call. Its immutable input includes
the shell ID, neutral question, canonical fact, frozen choices and correct index,
fact-first explanation, topic/category, reviewed positive and rejected voice
examples, and the pack-level device-diversity target. For each shell, its
Zod-constrained output is exactly three records shaped like:

```ts
{
  shellId: string;
  variants: Array<{
    displayPrompt: string;
    comedyButton: string | null;
    comedyDevices: ComedyDevice[];
  }>; // exactly three
}
```

The rewriter does not output choices, a correct index, a canonical fact, or a
replacement fact-first explanation. Server code appends at most one accepted
`comedyButton` to the immutable explanation and enforces final length bounds.
This keeps "make it funnier" from silently becoming "change the trivia." The
independent verifier sees all three variants; deterministic gates discard unsafe
or leaky variants. The verifier emits one bounded comedy rating per survivor;
`FLAT`, `TRY_HARD`, `MEAN`, and `ANSWER_LEAK` are rejected, while `BIG_LAUGH`
ranks above `WITTY` only after every factual and fairness gate passes.

## Players, Length, and Host

| Item                   | First-prototype rule                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| Supported players      | 2-8 active humans                                                    |
| Intended room          | 4-6 active humans                                                    |
| Host participation     | The host may play or use a display-only stage                        |
| Standard length        | One warm-up, one Home Turf per frozen player, one final House Choice |
| Expected play time     | Approximately 12-18 minutes at 4-6 players, excluding lobby setup    |
| Large-room expectation | Up to approximately 25 minutes at 8 players                          |
| Winner                 | Highest total score after the final round                            |

There are no AI roster slots in QuizSlop. The host UI must hide the AI picker,
round-count control, and narrator controls for this mode. The server must also
reject nonempty AI rosters, enabled TTS or a supplied narrator voice, and
caller-supplied round counts. Omitted TTS or explicit `OFF` normalizes to the
stored off state; client hiding is not an authority boundary.

The host's display-only session does not count as a player and does not submit a
Home Topic. A playing host behaves exactly like every other human participant.

QuizSlop is always a shared-stage-plus-private-controllers game. After creation,
a display-only host routes to `/stage/{code}`; a playing host routes to
`/controller/{code}` and receives a host-only `Open stage` action that opens the
authenticated stage in a separate tab/window or supports the existing secure TV
handoff. The host surface must explain this two-surface requirement before room
creation. Never render a playing host's private topic or question inside the
shared stage merely because both capabilities belong to one browser session.

After roster freeze, **boundary-active** means a frozen player who has not been kicked
(no `kickedAt`) and for whom Presence reports at least one
online, unexpired player session at the exact server transition. Each interactive
phase snapshots its eligible roster into application tables. Presence changes
afterward do not add or remove eligibility for that open phase; a reconnecting
player can act only if already snapshotted, but can re-enter future snapshots.
If the Presence read itself fails, abort and idempotently retry the transition
instead of treating everyone as offline.

## Topic Setup and Deck Freeze

### Home Topic submission

Every active player confirms one topic they believe they know well. Custom
input is free text when source-backed generation is configured. Otherwise the
controller immediately offers three unused topics from the reviewed catalog.

Good custom submissions are:

- publicly verifiable;
- specific enough to feel personal;
- broad enough to support four distinct internal difficulty tiers;
- stable enough that the answer is unlikely to change during the retained life
  of the question pack.

Examples:

- `Taylor Swift albums through 2024`
- `1990s NBA`
- `Studio Ghibli movies`
- `The Legend of Zelda mainline games`
- `introductory astronomy`

Reject or revise submissions that are:

- facts about the submitting player or their friend group;
- subjective, such as `the best horror movies`;
- commands, prompt-injection attempts, or abusive content;
- so broad that difficulty is meaningless, such as `everything`;
- so narrow that four fair questions cannot be sourced;
- dependent on live standings, prices, officeholders, patches, or other facts
  that change frequently;
- not suitable for the fixed party-safe content rating;
- non-English beyond names, titles, and other necessary proper nouns;
- topics the bounded semantic verifier identifies as equivalent to another
  confirmed Home Topic.

Normalization returns a bounded record containing:

- a short display label;
- a parent-category ID from `SPORTS`, `MUSIC`, `FILM_TV`, `GAMES`,
  `SCIENCE_NATURE`, `HISTORY`, `GEOGRAPHY`, `FOOD_DRINK`, `BOOKS_LANGUAGE`,
  `INTERNET_TECH`, `ARTS_CULTURE`, or `OTHER`;
- a one-sentence scope definition;
- explicit exclusions or a time boundary when needed;
- a stable server-derived `canonicalKey` used for deduplication;
- an optional matching catalog topic ID;
- `ACCEPT`, `REVISE`, or `REJECT`;
- up to three nearby alternatives when revision is required.

Use these initial Unicode-character bounds in both Zod and Convex validators:

| Topic field                      |                                            Bound |
| -------------------------------- | -----------------------------------------------: |
| Trimmed raw submission           |                                            1-120 |
| Display label                    |                                             1-56 |
| Parent-category ID               |    Exactly one value from the bounded enum above |
| Scope definition                 |                                            1-180 |
| Exclusions/time-boundary entries |                       At most 3 entries, 80 each |
| Canonical key                    |      Exactly 64 lowercase hexadecimal characters |
| Alternatives                     | At most 3, each with the same label/scope bounds |

Treat all fields as plain text. The server trims input, rejects control
characters or invalid Unicode, and never stores rendered player HTML.

The model does not author the final key. Trusted backend code builds a canonical
basis from the confirmed display label, scope, exclusions, and time boundary
using NFKC normalization, locale-stable lowercase, whitespace collapse, and
punctuation normalization, then stores its SHA-256 hex digest as `canonicalKey`.
Exact key equality is authoritative for atomic collision rejection; the bounded
semantic-duplicate verifier may still reject differently worded equivalent
topics before confirmation.

Do not claim semantic equivalence is transactionally provable. Two concurrently
normalized topics with different keys may pass the first version if neither
verifier saw the other; exact-key collisions still cannot commit. Record these
rare near-duplicate escapes for catalog/normalization tuning rather than adding
an unbounded synchronous model call to confirmation.

Show the normalized label and scope to that player and require confirmation.
Editing the raw submission creates a new server-assigned, monotonically
increasing revision and
cancels or invalidates every job for the prior revision. Confirmation must
atomically reject a `canonicalKey` already claimed by another active player.

The raw submission is always private to its owner, capability-authorized server
functions, and content jobs. The normalized label and scope remain private
until that topic's Home Turf reveal. They never appear in a shared lobby or a
future-round preview.

Use these per-topic setup states:

- `NEEDS_TOPIC`
- `NORMALIZING`
- `AWAITING_CONFIRMATION`
- `BUILDING`
- `READY`
- `NEEDS_REVISION`
- `NEEDS_FALLBACK`

The shared lobby shows only the state and player name. The owning controller may
see its raw input, normalized scope, alternatives, generation progress, and
failure reason.

Bound setup work per player and game:

- the edit mutation requires a client-generated UUID `clientRequestId`; the
  first `(game, player, clientRequestId)` commit atomically reserves the room
  budget and assigns the next revision, while retries return that revision;
- at most three custom raw-topic revisions;
- at most 24 custom revision reservations across the entire room, including
  players later excluded or disconnected;
- at most one active normalization or pack Workflow for that player;
- repeated submissions with the same revision/idempotency key return the
  existing state and do not reserve new work;
- the single missing-tier/comedy retry belongs to its confirmed revision and
  does not grant another player edit;
- after the third revision is rejected, canceled by another edit, or fails to
  produce a complete pack, move to `NEEDS_FALLBACK` and require a catalog choice;
- after the room-wide reservation budget is exhausted, every new custom attempt
  goes directly to catalog fallback;
- a player may choose catalog fallback earlier without spending remaining
  revisions.

These bounds cap one lobby at 24 custom revisions and prevent an open controller
from creating unbounded model jobs or audit rows.

### Reviewed topic catalog

The checked-in catalog serves three purposes:

1. the opening warm-up and final House Choice;
2. a complete curated-only game when custom generation is disabled;
3. immediate fallback when a custom topic cannot produce a reliable pack.

The first launch catalog must contain at least 12 distinct playable topics
across at least six parent categories. Twelve is the minimum that supports eight
catalog-backed Home Topics, one warm-up, and three distinct finale options.
Every catalog topic must include a versioned, human-approved four-question pack
with retained sources. AI-authored drafts remain `DRAFT` until a human explicitly
approves them; an implementation agent must not mark its own output as reviewed.
Catalog `canonicalKey` values use the same trusted canonicalization/hash helper
as custom topics and are validated when the catalog module loads in tests.

Suggested catalog categories are Sports, Music, Film & TV, Games, Science &
Nature, History, Geography, Food & Drink, Books & Language, Internet & Tech, and
Arts & Culture. `OTHER` is allowed for custom normalization but does not count
toward the launch catalog's six-category minimum. A launch catalog does not need
every category, but its distribution must leave enough variety for eight-player
fallback games.

When offering three catalog topics, treat the offers as suggestions rather than
reservations. Confirmation atomically claims the topic's `canonicalKey`. If
another player claimed it first, refresh that controller with three currently
available choices and do not consume or alter the other player's selection.

When a player confirms a catalog Home Topic, copy the exact approved pack
version into game-owned topic, question, and source records before marking it
`READY`. Never serve an active game from a mutable in-code catalog lookup: a
deploy, retirement, or catalog edit must affect only future snapshots.

### Roster and deck freeze

The global QuizSlop lobby phase covers topic entry, normalization, confirmation,
and pack building concurrently. Do not model `TOPIC_SETUP` and `PACK_BUILD` as
exclusive global phases; different players may be in different setup states.

The host can start only when:

- 2-8 humans have durable `ACTIVE` participation status and at least one online
  Presence session at the start transition;
- each start-eligible human owns exactly one confirmed `READY` topic revision;
- every included ready topic has exactly one frozen question per internal tier;
- at least four distinct reviewed catalog topics remain after excluding the
  start-eligible Home Topic `canonicalKey` and catalog-ID matches.

Starting the game is one atomic server transition:

1. Freeze the start-eligible human roster and stable seat order.
2. Exclude lobby players who are inactive or offline, remove their topics from
   the deck, and cancel their outstanding jobs.
3. Set `totalRounds` to the frozen player count plus two. This yields 4-10
   rounds and fits the shared ten-round limit.
4. Assign persisted server-generated selection ranks to the eligible reviewed
   catalog topics and use the lowest-ranked topic as the warm-up, breaking an
   exact rank tie by stable topic ID.
5. From the remaining ranked topics, choose the lowest-ranked topic from three
   different parent categories when at least three categories remain; otherwise
   fill the slate by rank. Freeze both a shuffled display order and a separate
   server-generated tie-break rank for the three finalists.
6. Materialize the selected warm-up and all three final-slate catalog pack
   versions into game-owned frozen records.
7. Assign each Home Topic one server-generated random rank, then feed the
   persisted ranks into a pure category-aware greedy ordering function. At each
   slot choose the lowest-ranked remaining topic whose category differs from the
   prior slot; if none exists, choose the lowest-ranked remaining topic. Break a
   rank tie by stable topic ID. Never reshuffle after this transition commits.
8. Persist the complete deck as warm-up, shuffled Home Turf rounds, then final
   House Choice.
9. Set the shared game `round` from its lobby value of zero to one, set the
   zero-based mode deck position to zero, move the shared game out of `LOBBY`,
   and open the warm-up topic reveal.

On every later round transition, increment both values together so
`round === deckPosition + 1`; the final House Choice therefore opens at
`round === totalRounds`. Never derive one from the number of child rows.

The warm-up and final slate must be distinct from each other and from every Home
Topic match. Future Home Topics and the final slate remain server-only until
their reveal boundary.

After the roster freezes, new players cannot join. A frozen player who
disconnects keeps their Home Turf round in the deck but may not answer until a
later answer phase opens while they are active again.

### Final House Choice

Only the final round has a topic vote. Reveal its pre-frozen slate of three
topics. At vote opening, persist the boundary-active voter roster and let each
eligible player vote for one.

- The plurality winner becomes the final topic.
- Missing votes are abstentions.
- A tie, including a zero-vote tie, resolves to the tied topic with the best
  pre-frozen tie-break rank.
- Persist the result before a short reveal animation.
- Never call a model or use client randomness to resolve the vote.

The stage must announce that a correct final answer is worth 200 points. Call
Slop still settles at +/-150.

## Hidden Adaptive Difficulty

The internal tiers are content-calibration anchors, not player-facing labels:

| Internal tier | Calibration target                                               |
| ------------- | ---------------------------------------------------------------- |
| `EASY`        | Foundational, iconic, or directly inferable by a newcomer        |
| `MEDIUM`      | Familiar but not automatic for a casual fan                      |
| `HARD`        | Requires real subject knowledge or committed enthusiasm          |
| `INSANE`      | Specialist knowledge that remains fair, sourced, and unambiguous |

Harder questions must be harder because of required knowledge, never because of
trick wording, obscurity without significance, or difficult syntax.

Every frozen player begins each new game with hidden tier `EASY`. After a round
settles:

- a valid correct answer moves the tier up one step;
- a valid incorrect answer, including an accountable timeout, moves it down one
  step;
- `EASY` and `INSANE` clamp at their respective bounds;
- a voided question, pre-answer disconnect exemption, or server-detected
  question fault does not change it.

Apply the update only after disputes close. Use one ladder per player for the
entire game, regardless of topic category. Home Turf does not change the
assigned tier. No difficulty state persists into a new game.

Players never select, receive, or see their tier, including after the reveal.
Do not send it in stage or controller views. AI creates questions calibrated to
the four tiers before play; deterministic server code selects the question from
the player's current hidden tier.

At answer opening, all players assigned the same topic and internal tier receive
the same frozen question and choice order. The system must not personalize two
different questions behind the same tier within one round.

Flat points across personalized tiers are an intentional party-game tradeoff,
not a standardized knowledge ranking. The winner performed best against the
challenge the game served them plus Call Slop outcomes; the product must not
claim that every player answered equally difficult material. Do not add hidden
tier-weighted points to "fix" this before playtesting whether the inclusive,
quietly adaptive experience feels fair enough for the room.

## Standard Round

The loop is **CALL → ANSWER → REVEAL(step)\* → ROUND_RESULTS**. Players read
it as bet, answer, reveal, scores. The last round is
**HOUSE_VOTE → CALL → ANSWER → REVEAL(step)\* → final screen**: there is no
ROUND_RESULTS after the last round, so nothing spoils the winner before the
final screen.

### 1. Bets (CALL)

There is no separate topic phase. The TV shows the round's topic (kicker
"Warm-up", "{Name}'s topic" or "Last round") while phones bet.

Each player starts the game with two bets. During CALL a player may bet that
one other player will miss their question, or pass ("Skip, no bet"). One tap on
a player places the bet; while CALL is still open the player can take it back
(`uncall`, which refunds the token). At most one bet per round. Several players
may bet on the same target. Bets stay secret until CALL closes; anyone who
didn't decide passes.

- **Players with no bets left are never asked and never waited on.** They are
  left out of `calls.eligiblePlayerIds` (and so out of the stage tracker), and
  CALL closes early once every connected player has bet, passed, or has no bets
  left (`callDecided` in `scoring.ts`). Their pass row is written when CALL
  closes.
- **A round where no connected player has a bet left skips CALL** and opens
  straight at ANSWER (`openRound` in `mode.ts`).

Bet settlement:

- target answers correctly: the bettor loses 150;
- target misses or runs out of time: the bettor wins 150;
- target had no question (not in the room when answers opened): the bet is
  refunded with zero points. A target removed during ANSWER or REVEAL still has
  a question and counts as a timeout, so the bet wins.

Being bet on never changes the target's own score.

### 2. Answer

When ANSWER opens, every active player gets one question from the round's topic
at their hidden tier. Each phone shows only its own question.

**One tap locks.** Tapping a choice locks it; there is no Lock button and an
answer can never change (`lockAnswer` ignores a second tap). Phones ignore taps
in the first 400ms so a stray tap can't lock. ANSWER closes early once every
connected player has locked; an unlocked answer at the deadline is a miss.

The TV shows the topic, "Answer on your phone", the bets on the board, and who
has locked. Bets are public during ANSWER: being bet on is the pressure.

### 3. Reveal

Players who got the same question form a group; each group gets its own
15-second reveal step (one to four per round). The order is a stable shuffle,
except that **on a player's topic the group holding the topic owner reveals
last** (`revealOrder` in `deck.ts`), so the owner's question closes the round.

Each step shows the question, the four choices, who picked what, the correct
answer, the bets on that group's players with their ±150, and the
explanation. A correct answer earns 100 (200 in the last round); a wrong
answer earns 0 and never subtracts.

### 4. Results (ROUND_RESULTS)

After every round but the last, a 12-second leaderboard shows each player's
round delta and new total. The last round's final reveal settles and goes
straight to the final screen.

### Factual dispute

During the shared reveal, persist one boundary-active challenge roster. Each
eligible player may successfully initiate at most one dispute per game and must
select an already-revealed question plus one reason:

- wrong answer key;
- multiple defensible answers;
- source does not support the answer.

The first committed challenge for a question creates its ballot and consumes
that initiator's dispute token. A duplicate challenge returns `ALREADY_OPEN`
without consuming a token, allowing that player to challenge a different
question while the shared reveal remains open.

A `SYSTEM_VOID` question cannot be challenged. If a server integrity fault is
detected after a ballot was accepted but before settlement, close that ballot as
`SYSTEM_VOID` and restore its initiator's dispute token exactly once; do not ask
players to vote on a known broken record.

After the final answer group closes, settle immediately when no challenge was
filed. Otherwise freeze a new boundary-active voter roster and open one
`DISPUTE_VOTE` turn per challenged question. Every eligible voter, including
initiators and people who did not receive that question, submits `UPHOLD` or
`VOID` only for the ballot currently on screen.

- A strict majority of the frozen voter roster is required to void each
  question.
- Missing votes are abstentions.
- A tie or timeout upholds.
- Disconnecting after vote opening does not shrink the denominator.
- Every ballot receives its own readable 30-second ruling turn.
- Outcomes remain provisional until the last ruling settles the round atomically.

Question and call outcomes remain provisional until the shared reveal and any
ruling turns close. An unchallenged question is valid; a challenged question is
valid only when upheld. The settlement transaction applies every valid answer,
Call Slop delta, token refund, and hidden-tier update exactly once. A voided
question contributes no quiz points, causes no difficulty updates for assigned
players, neutralizes every related call, and refunds those Call Slop tokens.

Persist one of `UNCHALLENGED_VALID`, `UPHELD`, `PLAYER_VOIDED`, or `SYSTEM_VOID`
as the question's round ruling. The unique-key QuizSlop score-event ledger and
mode-participant quiz/call subtotals are scoring authority. In the same
settlement transaction, maintain
`total === quizSubtotal + callSubtotal` and mirror that total to the shared
`players.score` field for platform compatibility. QuizSlop rules and views never
reconstruct score from generic prompts/responses or treat the mirror as an
independent authority.

Persist question identity, sources, initiator, reason, voter roster, votes, and
ruling for content QA. Gameplay disputes are separate records from a question's
content lifecycle; do not overwrite a frozen question's review state with a
gameplay phase label.

### Round results and winner

After settlement, the stage shows final round deltas, total score, quiz and Call
Slop subtotals, and remaining Call Slop tokens. Do not preview the next Home
Topic or owner.

The final winner is the highest total score among frozen participants. Resolve
ties by:

1. highest quiz subtotal before Call Slop adjustments;
2. most successful Call Slop predictions;
3. otherwise declare co-winners.

Do not use hidden difficulty or randomness as a final tie-breaker.

"Play again" keeps the room code and the players in a fresh game, resetting
topics, scores, bets, and hidden difficulty. The new game's lobby and the
house's deals leave out the topics whose questions the room was asked in the
previous game, and a question the room already saw is swapped for the nearest
fresh tier, whenever the catalog has enough left.

The mode-local final screen is the first version's complete results surface. It
does not link to the generic prompt/response recap and does not project QuizSlop
into the SlopLash AI leaderboard. A direct recap-route visit returns an explicit
unsupported-mode state instead of an empty or misleading generic recap. Do not
schedule an AI winner tagline; use the deterministic awards below.

Final comedy awards are non-scoring and use only visible facts. The initial set
is `CALLED IT` for most bets won ("2 bets won"), `FALSE ALARM DEPARTMENT` for
most bets lost ("1 bet lost"), and `SUSPICIOUSLY WELL-READ` for most correct
answers ("3 correct answers"). Omit an
award when its count is zero, show co-recipients on ties, and always show the
underlying stat so the joke never obscures the result. Never base an award on
hidden tier.

## Timers, Advancement, and Disconnects

These defaults live in `src/games/quizslop/game-constants.ts`:

| Phase         | Default              | Closes early when                          | Timeout behavior                           |
| ------------- | -------------------- | ------------------------------------------ | ------------------------------------------ |
| CALL (bets)   | 30 seconds           | every connected player decided or has none | Undecided players pass                     |
| ANSWER        | 30 seconds           | every connected player locked              | An unlocked answer is a miss               |
| REVEAL        | 15 seconds per group | never                                      | Next group, then results or final          |
| ROUND_RESULTS | 12 seconds           | never                                      | Next round (or HOUSE_VOTE before the last) |
| HOUSE_VOTE    | 30 seconds           | every connected player voted               | Plurality; ties go to slate order          |

A round takes at most 30 + 30 + 4 × 15 + 12 = 132 seconds, and about 75–90
seconds with early closes. With timers disabled, every phase waits for the
host. The rest of this section is the original design, kept as history.

With Tutorial Mode or timers disabled:

- every phase includes one short `Now / Do / Next` instruction;
- all-resolved submission phases show `Everyone ready` and wait for the host;
- the host receives `Close phase` controls that apply documented defaults to
  missing submissions;
- passive reveal and results phases advance only when the host continues;
- every host action still requires the expected round, mode phase, and phase
  generation.

Presence is sampled only while creating a persisted phase or continuity
snapshot. Raw heartbeat changes are never read afterward as scoring or voting
authority. Final-topic voters, callers/targets, answer assignments, dispute
initiators, and dispute voters each use their documented immutable roster.

Do not immediately abandon a game because of a transient heartbeat loss. At the
end of each non-final round and before opening the next one, take a
boundary-active snapshot. If fewer than two players qualify, move to
`CONTINUITY_GRACE`, persist a 15-second deadline, and schedule exactly one
guarded recheck in the shared `games.phaseDeadline`. Open the next round when at
least two qualify at recheck; otherwise move
to `ABANDONED`, mirror shared `FINAL_RESULTS`, and declare no winner. A player
who reconnects before the recheck may continue. Once the final House Choice has
opened, finish and finalize it even if participation later drops below two.
Already settled scores and audit records remain retained.

The continuity recheck runs even when gameplay timers are disabled. A host may
wait for reconnects before closing results, but cannot force the next round to
open with fewer than two boundary-active players.

For QuizSlop, run this continuing-player guard only at those round boundaries,
not between substates of a round already in progress. Finish or safely void the
current round before abandonment so a mid-round disconnect cannot strand calls,
answers, or provisional settlement records.

## Question Content Contract

### Frozen playable question

Every playable question persists at least:

| Field             | Requirement                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Stable identity   | Question ID, topic ID, pack version, and candidate revision                                                                |
| Internal tier     | Exactly `EASY`, `MEDIUM`, `HARD`, or `INSANE`; server-only                                                                 |
| Neutral question  | Plain factual form used for evidence and equivalence checks                                                                |
| Display prompt    | Witty player-facing form, at most 220 characters, with no trick wording                                                    |
| Choices           | Exactly four distinct, semantically parallel choices, at most 80 characters each, in frozen order                          |
| Correct choice    | Server-only index until reveal                                                                                             |
| Canonical fact    | Compact statement of the fact being tested                                                                                 |
| Explanation       | Fact-first reveal text with at most one comedic button, at most 320 characters                                             |
| Comedy metadata   | Bounded device tags, model quality flags, and catalog human-review state when applicable                                   |
| Sources           | One to three records with URL, title, retrieval time, locator, content hash, bounded support excerpt, and one primary flag |
| Provenance        | Generator model, verifier model, prompt/schema version, and generation time                                                |
| Safety            | Content rating, language, and time-sensitivity classification                                                              |
| Content lifecycle | `DRAFT`, `CANDIDATE`, `ACCEPTED`, `REJECTED`, `FROZEN`, or `RETIRED`                                                       |

Reject questions that:

- use `all of the above` or `none of the above`;
- depend on a negative such as `Which is NOT...`;
- have overlapping or partially correct choices;
- rely on disputed superlatives or subjective rankings;
- quote copyrighted text beyond a short identifying phrase;
- reveal unsafe, sexual, hateful, or graphic material outside the party-safe
  rating;
- require a fact likely to change during the retained pack's life;
- repeat a canonical fact, normalized prompt, or normalized choice set already
  frozen in the game;
- use humor that leaks the correct answer, makes one choice conspicuously silly,
  changes the neutral question's meaning, or targets a player.

Exact duplicate checks are deterministic after Unicode normalization,
case-folding, whitespace collapse, and punctuation normalization. Semantic
duplicate and ambiguity checks belong to the bounded verifier; do not describe
them as mathematically deterministic.

### Truth and evidence authority

Model agreement is not proof. A generated answer becomes playable only when its
canonical fact is supported by retained source evidence and passes deterministic
shape and safety validation.

AI SDK `result.sources` entries may discover candidate URLs, but a URL alone is
not evidence. An approved server retrieval adapter must fetch the referenced
public page, extract inert text, and retain only the smallest useful support
excerpt. For the first version:

- allow public HTTP(S) only;
- block private, loopback, link-local, and metadata-service address ranges;
- bound DNS resolution, redirects, response size, content type, and duration;
- reject active or unsupported content rather than executing it;
- prefer primary, institutional, official, or reputable reference sources;
- reject a fact when the retained evidence is ambiguous or insufficient;
- retain at least one and at most three sources per question, with exactly one
  primary source that directly supports the keyed fact;
- retain at most 320 Unicode characters of support text per source;
- retain URL, title, locator, retrieval time, and content hash with the excerpt;
- discard full retrieved page bodies after candidate processing;
- show source title/link after reveal, but keep support excerpts in server-side
  audit records and dev/internal QA tooling.

Use these initial retrieval bounds rather than leaving them to each implementer:

| Limit                                           |                                                         Default |
| ----------------------------------------------- | --------------------------------------------------------------: |
| Candidate URLs fetched per topic revision       |                                                               8 |
| URL length                                      |                                                2,048 characters |
| Redirects                                       | 3, revalidating scheme, port, DNS, and resolved IP at every hop |
| Allowed ports                                   |                                                      80 and 443 |
| Total duration per fetch                        |                                                       8 seconds |
| Response body                                   |                                                           1 MiB |
| Inert extracted text retained during processing |                                       20,000 Unicode characters |
| Accepted content types                          |         UTF-8 `text/html`, `text/plain`, and `application/json` |

Send no cookies, credentials, ambient authorization, or user-controlled request
headers. Fetch candidates with bounded Workpool concurrency; exceeding any limit
rejects that source rather than weakening the bound.

Treat URLs and retrieved text as untrusted data, never instructions. A source
that contains prompt injection does not change the generation task.

The implementation must run a current Gateway capability spike before enabling
custom topics. Select current generator and verifier model IDs through backend
mode configuration, validate them against the current project/Gateway catalog,
and persist the actual IDs used. Do not hardcode a model ID in this plan.

If current source discovery, retrieval, structured output, or evidence support
cannot meet the launch gate, leave custom topics disabled and ship the complete
catalog-backed mode. Never fall back to unsourced model memory for scored facts.

### Pack generation pipeline

Custom work happens in the lobby and is bound to one confirmed topic revision.
Use a 15-second normalization deadline and a 60-second post-confirmation pack
deadline as initial constants. Missing either deadline moves the player to a
clear revision or catalog-fallback state; stale late completions cannot revive
the job.

For each confirmed revision:

1. **Normalize and moderate.** Produce the bounded normalization record. Treat
   raw input as data and never pass it as instructions.
2. **Discover and retrieve evidence.** Gather stable candidate facts, fetch
   approved public sources through the retrieval adapter, and retain bounded
   evidence records.
3. **Generate factual shells.** In one bounded structured generation, request
   exactly two evidence-grounded neutral questions per internal tier, including
   canonical fact, four choices, correct index, and fact-first explanation. Use
   AI SDK 7 `generateText` with `Output.object` and a narrow Zod schema.
4. **Prevalidate facts and shape.** Before spending another model call on
   comedy, enforce bounds, four unique choices, one correct index, evidence
   presence, exact duplicate rules, language, and safe content.
5. **Write comedy variants.** In one bounded pack-level generation, give the
   surviving factual shells and reviewed positive/rejected voice examples to a
   comedy prompt. Request exactly three materially different `displayPrompt` and
   `comedyButton` variants per shell. The output repeats immutable shell IDs and
   cannot rewrite choices or other authority fields.
6. **Verify independently.** A separate bounded generation receives the neutral
   shells, comedy variants, and retained evidence, without generator rationale.
   It returns factual support, display-to-neutral equivalence, ambiguity,
   answer-leakage, choice-parity, tier-calibration, time-sensitivity, safety,
   comedy-quality, and rejection results. A separate invocation is mandatory;
   a second provider is optional and must be chosen by measured quality and
   cost.
7. **Select and freeze.** Among candidates that pass factual, fairness, safety,
   and comedy gates, deterministically choose one question per tier. Maximize
   the bounded verifier rating (`BIG_LAUGH` above `WITTY`) while requiring at
   least three distinct primary devices across the four questions; break equal
   combinations by stable candidate ID tuple. Freeze neutral and display
   wording, choice order, key, explanation, comedy metadata, evidence,
   provenance, and reveal metadata.
8. **Retry or fall back.** Retry once for missing tiers or an unsatisfied comedy
   diversity constraint. If the pack still lacks any tier or valid diverse
   combination, set `NEEDS_FALLBACK` and offer three currently unused reviewed
   catalog topics. Never start with a partial or comedy-invalid pack.

Batch factual generation, comedy writing, and verification at the pack level
where schema and context bounds allow; do not create an unbounded autonomous
agent or one model call per candidate by default. Persist tokens, cost, latency,
retries, and failure reasons through the existing game-model-usage and
generation-job patterns.

A Home Topic becomes `READY` only when all four questions, verified comedy copy,
and supporting evidence are frozen. The game cannot start while any included
topic is partial.

### Catalog and calibration responsibilities

The checked-in catalog is source-controlled product content. Each topic pack
stores its own facts and sources; category guidance is never answer authority.

The 12-topic launch minimum provides at least 48 accepted factual and comedy
examples across four internal tiers. In addition, keep a small boundary catalog
with rejected examples for each tier: too easy, too hard, ambiguous, flat,
forced/try-hard, repetitive, and answer-leaking. These are prompt and regression
guidance, not playable content.

Every catalog change must preserve stable IDs and increment the pack version.
An AI agent may draft, source, validate, and render catalog content for review,
but a human approval field is required before production use.

Generated custom packs are game-owned and the first version does not reuse them
across games. They follow the room's existing stale-game retention and cleanup
path. Versioned catalog source remains available for audit even after a pack is
retired from future selection; already materialized game snapshots remain
unchanged.

## Communication Boundary

QuizSlop assumes players can already hear each other in person or through an
existing voice call. The product provides timing cues to:

- react to the topic and Home Turf owner;
- make and react to Call Slop predictions;
- stay quiet while private questions are live;
- react to shared answers;
- debate a factual dispute.

Do not implement room chat, voice capture, transcription, AI accusations, AI
defenses, or AI contestants. The game must remain mechanically understandable
if nobody speaks, while its social energy comes from communication outside the
application.

## Stage and Controller Responsibilities

### Shared stage

The stage is a fixed 16:9 artboard that never scrolls, with one scene per round.

| Phase         | Stage responsibility                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Lobby         | Each player's avatar with their picked topic, or "Picking…"                                              |
| CALL          | The round's topic as the hero, "Pick who gets it wrong", the ±150 stakes, and who decided               |
| ANSWER        | Topic docked, "Answer on your phone", "Right answer +100", the bet board, and who has locked             |
| REVEAL        | One question group: prompt, 2×2 choices, pickers, correct answer, that group's bets, explanation         |
| ROUND_RESULTS | Leaderboard with round deltas, re-sorting, and the leader's crown                                        |
| HOUSE_VOTE    | "Vote for the last topic", three topic cards, and who has voted; votes stay secret until the vote closes |
| Last round    | The vote tally, then the winning topic becomes the round's hero with "Double points"                     |
| Final         | Towers worst-first, the winner(s), and the comedy awards                                                 |

Copy is fixed and short; there is no voice bank and no rotating joke lines.

### Player controller

- pick a Home Topic from a deal of six (with "Shuffle"), or change it;
- bet on one other player or pass (never asked with no bets left);
- tap one choice to lock the answer;
- vote for the last topic;
- see their own result at each reveal and their placement at the end.

The controller never displays or receives hidden difficulty.

### Accessibility

- Never encode correctness, vote state, score movement, call state, or topic
  ownership by color alone.
- Keep question text and four choices readable at narrow controller widths and
  browser zoom.
- Honor reduced motion for vote results, score movement, calls, and reveals.
- Provide timers-off host controls for reading and motor access.
- Do not make harder internal tiers use lower readability or unnecessarily
  academic wording.
- Provide text equivalents for every sound cue.
- Keep the first release English-only so content validation and controller
  layout have one explicit contract.

## Visual and Audio Direction

QuizSlop should feel like an energetic, slightly unreliable AI-built game show,
not a school exam or corporate dashboard.

Visual priorities:

- one oversized topic marquee per round;
- a clear spotlight on the Home Topic owner;
- physical-feeling Call Slop tokens and stamps;
- large, private four-choice answer controls;
- paced shared question receipts;
- restrained glitches only while the quizmaster builds or corrects content;
- readable source labels and links during reveals;
- no visible difficulty meters, labels, lanes, or recommendation UI.

Suggested sound moments:

- topic marquee hit;
- simultaneous Call Slop stamp;
- answer lock click;
- correct reveal hit and incorrect drop;
- record-scratch pause for a dispute;
- final double-points siren used once.

## Architecture and Data Boundaries

QuizSlop uses the existing Next.js, Convex, AI SDK, Gateway, Presence, Workpool,
and Workflow boundaries. Keep game rules typed, mode-local, and deterministic.

### Repository touchpoints

QuizSlop lives in these modules:

- `src/games/quizslop/`: rules and content (`game-constants.ts`, `types.ts`,
  `difficulty.ts`, `scoring.ts`, `deck.ts`, `catalog.ts`,
  `content-validation.ts`, `canonical-key.ts`, `shuffle.ts`) and the reviewed
  catalog under `config/`.
- `src/games/quizslop/ui/`: the stage and controller screens (`stage.tsx`,
  `controller.tsx`, `shared.tsx`, `beats.ts`), registered in
  `src/games/ui-registry.ts`.
- `convex/quizslop/`: the mode's rules for the engine (`mode.ts`), player
  mutations (`play.ts`), tables (`tables.ts`), and view (`view.ts`).
- `scripts/quizslop/`: catalog validation and the review render.
- `src/dev/fixtures/quizslop.ts`: the `/dev/ui` fixtures.

Shared surfaces (`src/games/meta.ts`, `convex/validators.ts`,
`convex/schema.ts`, `convex/rooms.ts`, `convex/cleanup.ts`, the host page)
carry the `QUIZSLOP` game type. Adding a game type is a closed-world change:
search every literal union, `Record<GameType, ...>`, and switch on the game type.

Do not hand-edit `convex/_generated/`. After schema/API changes, run the checked
`vp run convex:codegen` task.

Do not force topics, questions, assignments, answers, calls, disputes, or score
events into the existing comedy `prompts`, `responses`, and `votes` tables. They
have different redaction, evidence, and authority rules.

### Mode-local records

Add bounded, indexed records for:

- QuizSlop state: game, exact mode phase, custom-revision reservations used,
  selected voice-line ID, deck position, current reveal ordinal, and terminal
  outcome;
- frozen participants: player, stable seat order, hidden tier, Call Slop stock,
  dispute availability, quiz subtotal, call subtotal, and total;
- rounds: deck ordinal, kind, topic or final slate, selected topic, point value,
  reveal order, and settlement state;
- topics: owner when applicable, source type, raw revision, private raw text,
  normalized scope, canonical key, category, build state, and deck ordinal;
- questions: topic, internal tier, neutral question, frozen comedy display copy,
  choices, server-only key, explanation, comedy metadata, provenance, content
  lifecycle, and safety metadata;
- question sources: question, URL, title, retrieval time, bounded excerpt,
  locator, hash, and evidence metadata;
- question assignments: round, player, question, eligibility snapshot, and
  assignment time;
- phase eligibility snapshots: round, phase generation, roster kind, player,
  and boundary time for final votes, calls, answers, challenges, and dispute
  votes;
- final-topic votes: round, eligible player, selected slate topic, lock state,
  and resolution metadata;
- Call Slop predictions: caller, target, token ordinal, provisional/final
  outcome, refund state, and point delta;
- answers: assignment, selected choice, locked/timeout state, correctness, and
  provisional quiz delta;
- disputes, frozen dispute voter rosters, and per-question votes;
- immutable score events or an equivalent unique-key ledger supporting exact,
  idempotent round settlement;
- QuizSlop generation-job kinds and usage through the existing shared job and
  game-model-usage tables.

Keep child collections in their own tables unless the bound is structurally
small, such as the three final slate IDs or at most four reveal question IDs.
Add an index for every game/round/topic/player read used by stage, controller,
settlement, cleanup, and job guards. Use stable composite index names containing
all indexed fields.

Encode and reuse structural query caps: 8 frozen players, 10 rounds, 12 frozen
topics/packs in an eight-player game (8 Home, 1 warm-up, 3 finalists), 4 question
groups, 8 assignments, 8 calls, 4 ballots, 32 dispute votes, and 3 sources per
question. Read `cap + 1` when validating an invariant and fail closed on the
extra row; do not silently truncate or use an unbounded `.collect()`. Paginate
dev/internal candidate-history views separately from live game views.

Register every new game-owned QuizSlop table with the existing bounded,
continuation-safe stale-game cleanup. Cleanup must also cancel or clean component
Workflow and Workpool handles through the existing generation-job path before
deleting their owning rows.

### Authoritative mode phase

> History: the shipped phases are `CALL`, `ANSWER`, `REVEAL`, `ROUND_RESULTS`
> and `HOUSE_VOTE` (see [Standard Round](#standard-round)). The phase list and
> transition table below are the original design.

Use one exact mode-local phase:

- `LOBBY_SETUP`
- `HOUSE_VOTE`
- `HOUSE_VOTE_REVEAL`
- `TOPIC_REVEAL`
- `SLOP_CALL`
- `SLOP_CALL_REVEAL`
- `ANSWER`
- `QUESTION_REVEAL`
- `DISPUTE_VOTE`
- `ROUND_RESULTS`
- `CONTINUITY_GRACE`
- `FINAL_RESULTS`
- `ABANDONED`

`QUESTION_REVEAL` stores the current bounded question ordinal, and
`DISPUTE_VOTE` reuses that ordinal for the current challenged question. Do not
create one database phase name per question group or ballot.

### Transition table

Every arrow is a guarded server transaction. "Settle" below is work inside the
transition, not another persisted phase.

| From                | Condition                                                                                                        | To                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `LOBBY_SETUP`       | Atomic start succeeds                                                                                            | Host-paced `TOPIC_REVEAL` tutorial for warm-up |
| `HOUSE_VOTE`        | Everyone resolves or deadline/host close applies abstentions                                                     | `HOUSE_VOTE_REVEAL`                            |
| `HOUSE_VOTE_REVEAL` | Reveal beat closes                                                                                               | `TOPIC_REVEAL`                                 |
| `TOPIC_REVEAL`      | First-round host tutorial closes, or a later reveal beat closes                                                  | `SLOP_CALL`                                    |
| `SLOP_CALL`         | Everyone resolves or deadline/host close applies holds                                                           | `SLOP_CALL_REVEAL`                             |
| `SLOP_CALL_REVEAL`  | Reveal beat closes                                                                                               | `ANSWER` and immutable assignments             |
| `ANSWER`            | Everyone locks or deadline/host close applies timeouts; one or more valid or system-void assignment groups exist | `QUESTION_REVEAL` at ordinal zero              |
| `ANSWER`            | No eligible assignment exists because every player was exempt                                                    | Settle, then `ROUND_RESULTS`                   |
| `QUESTION_REVEAL`   | More groups remain                                                                                               | `QUESTION_REVEAL` at next ordinal              |
| `QUESTION_REVEAL`   | Last group closes with no challenge                                                                              | Settle, then `ROUND_RESULTS`                   |
| `QUESTION_REVEAL`   | Last group closes with one or more challenges                                                                    | `DISPUTE_VOTE` at ordinal zero                 |
| `DISPUTE_VOTE`      | Current ruling closes and more challenged questions remain                                                       | `DISPUTE_VOTE` at next ordinal                 |
| `DISPUTE_VOTE`      | Final ruling closes                                                                                              | Settle, then `ROUND_RESULTS`                   |
| `ROUND_RESULTS`     | Final round                                                                                                      | `FINAL_RESULTS`                                |
| `ROUND_RESULTS`     | Non-final, fewer than two boundary-active                                                                        | `CONTINUITY_GRACE`                             |
| `ROUND_RESULTS`     | Next round is Home Turf and 2+ boundary-active                                                                   | Increment round/deck, then `TOPIC_REVEAL`      |
| `ROUND_RESULTS`     | Next round is House Choice and 2+ boundary-active                                                                | Increment round/deck, then `HOUSE_VOTE`        |
| `CONTINUITY_GRACE`  | Recheck finds fewer than two boundary-active                                                                     | `ABANDONED`                                    |
| `CONTINUITY_GRACE`  | Recheck finds 2+ and next round is Home Turf                                                                     | Increment round/deck, then `TOPIC_REVEAL`      |
| `CONTINUITY_GRACE`  | Recheck finds 2+ and next round is House Choice                                                                  | Increment round/deck, then `HOUSE_VOTE`        |

`FINAL_RESULTS` and `ABANDONED` are terminal. A `SYSTEM_VOID` is a per-question
ruling and never becomes a game phase.

Mirror the existing shared lifecycle only at coarse boundaries:

| QuizSlop phase                                                         | Shared status   |
| ---------------------------------------------------------------------- | --------------- |
| `LOBBY_SETUP`                                                          | `LOBBY`         |
| `HOUSE_VOTE`, `HOUSE_VOTE_REVEAL`                                      | `VOTING`        |
| `TOPIC_REVEAL`, `SLOP_CALL`, `SLOP_CALL_REVEAL`, `ANSWER`              | `WRITING`       |
| `QUESTION_REVEAL`, `DISPUTE_VOTE`, `ROUND_RESULTS`, `CONTINUITY_GRACE` | `ROUND_RESULTS` |
| `FINAL_RESULTS`, `ABANDONED`                                           | `FINAL_RESULTS` |

The QuizSlop shells render from the mode phase. Never infer exact state from the
coarse shared status.

Use the existing shared `games.phaseGeneration` and `games.phaseDeadline` as the
single generation/deadline authority; do not duplicate them on QuizSlop state.
The authoritative transition tuple is exact mode phase plus shared generation.
Increment the shared generation for every mode-phase or reveal-ordinal change,
and set/clear the shared deadline in that same transaction. The continuity grace
is the one exception that sets a deadline even when gameplay timers are disabled.

Entering either terminal mode phase atomically sets shared `finishedAt` if it is
unset and clears `games.phaseDeadline`. After terminalization, all
gameplay/deadline mutations are stale no-ops. Only cleanup and read-only results
access remain. `ABANDONED` stores no winner
and is never projected as a completed competitive result.

Every public mutation validates capability, game ID, frozen participant when
required, round ID/ordinal, expected exact phase, and expected shared
`games.phaseGeneration`. Scheduled deadline work carries the same expected
identifiers and becomes a no-op when stale.

### Public and private views

Construct separate bounded server views for the stage and a
capability-authorized controller.

Before a topic's reveal:

- raw topics remain private forever;
- future normalized Home Topics and the final slate remain server-only.

Before a question's shared reveal:

- the stage receives no prompt, choices, key, explanation, internal tier, or
  sources;
- during `ANSWER`, a controller receives only its own assigned prompt and
  choices;
- no client receives the correct index, canonical fact, verifier result, or
  retained evidence;
- one controller cannot request another player's question;
- Call Slop targets remain private until `SLOP_CALL_REVEAL`.

After reveal, send only the public explanation and source title/link. Retained
support excerpts and verifier output remain in server-side audit records. No
player or room-host capability may query them; the first version uses Convex
dashboard access or dev-only internal tooling rather than a production admin
route. Hidden difficulty is never returned to a player-facing client.

Render every player-, model-, and source-derived string as text, never trusted
HTML. Source anchors accept only the already-validated public HTTP(S) URLs and
use `rel="noopener noreferrer"` when opened in a new context.

Focused answer-key, future-topic, hidden-tier, and cross-controller redaction
tests are release blockers.

### AI jobs

QuizSlop makes no model calls: every question comes from the reviewed catalog.
The generated-pack pipeline described in this document (topic normalization,
evidence, comedy variants, verification) was cut. If it returns, it runs as
bounded jobs on the shared AI job runner (`convex/jobs.ts`), and its results are
applied only while the phase that asked for them is still current.

### Room-creation and rollout guards

For `QUIZSLOP`, room creation must:

- accept a playing or display-only host;
- reject AI player model IDs;
- accept only omitted or explicit `OFF` TTS with no supplied voice, then store
  the existing canonical off-state values;
- reject a caller-provided `totalRounds` and initialize it as zero until roster
  freeze derives the real value;
- create the mode-state record atomically with the room;
- use mode limits of 2-8 humans.

The two-player minimum is a start/frozen-roster constraint, not a room-creation
constraint: a display-only host may initially create an empty lobby and a
playing host may initially be its only player. Enforce the eight-player maximum
on joins and enforce 2-8 again in the atomic start transition.

`totalRounds === 0` is an unset sentinel allowed only for a QuizSlop game still
in shared `LOBBY`. Shared lobby views show the derived-length description instead
of `0 rounds`. Roster freeze must atomically replace it with 4-10 before leaving
`LOBBY`; any non-lobby QuizSlop game with zero rounds violates an invariant.


## Host Surface

Keep the first host surface small:

| Setting            | First-version behavior                                            |
| ------------------ | ----------------------------------------------------------------- |
| Host participation | Play or display-only                                              |
| Length             | Derived: one warm-up, one round per frozen player, one finale     |
| Timers             | On by default; may be disabled                                    |
| Content rating     | Party-safe and fixed                                              |
| Language           | English only                                                      |
| AI contestants     | Unavailable                                                       |
| Narrator           | Unavailable                                                       |
| Custom topics      | System capability, not a host knob; curated fallback is automatic |

For `Play`, the setting copy says that the host answers on a private controller
and must open the shared stage separately. For `Display-only`, creation opens the
stage directly. Other human joins route to the controller regardless of screen
width; QuizSlop never routes a player into a combined generic game shell.

Later versions may add Quick mode, localization, stricter family filters, or
alternate Call Slop stock. Do not expose scoring, adaptation, source thresholds,
or retry counts as host settings before playtesting the default.

## Verification Matrix

> History: this is the original test plan, including cut features. The tests
> next to each module are authoritative.

### Pure rules tests

- all players start each game at `EASY`;
- correct raises, incorrect lowers, bounds clamp, and void/exemption is
  unchanged;
- Home Turf and category do not alter hidden tier;
- standard deck contains warm-up, every frozen Home Topic once, and finale;
- 12 catalog topics can support the maximum curated roster and final slate;
- equal-category adjacency avoidance is deterministic and best effort;
- final vote plurality, abstention, zero-vote tie, and frozen-rank tie-break;
- normal +100/0 and final +200/0 quiz scoring;
- Call Slop win, loss, hold, refund, multiple callers, and two-token stock;
- answer eligibility before versus after disconnect;
- duplicate dispute challenge does not consume a token;
- several challenged questions share one voter snapshot and deadline;
- strict-majority dispute outcomes and idempotent settlement;
- system voids bypass player voting, neutralize scoring/calls, and restore an
  already-consumed dispute token exactly once;
- total, quiz-subtotal, successful-call, and co-winner tie order;
- exact duplicate normalization and semantic-verifier boundaries;
- source validation requires 1-3 records and exactly one directly supporting
  primary source;
- raw and normalized topic bounds reject empty, oversized, control-character,
  and invalid-Unicode input;
- display prompt remains factually equivalent to the neutral question;
- comedy variants preserve the correct index and all choice meanings;
- answer-leaking and asymmetrically silly distractors are rejected;
- pack selection enforces comedy rating, device diversity, and stable-ID ties;
- generic prompt votability returns `false` for QuizSlop;
- voice-line selection avoids immediate repetition.

### Convex tests

- room creation rejects AI model IDs, enabled/supplied narrator configuration,
  and explicit round counts for QuizSlop;
- zero `totalRounds` is accepted only for a QuizSlop lobby and becomes 4-10
  before the game leaves `LOBBY`;
- display-only host is not a participant or topic owner;
- topic revision invalidates stale normalization and pack jobs;
- custom revision reservation is idempotent and atomically enforces three per
  player and 24 per room under concurrency;
- duplicate canonical-key confirmation is atomic;
- host cannot start until every included topic is ready;
- roster freeze excludes inactive/offline lobby players, derives 4-10 rounds,
  and opens at shared round one/mode deck position zero;
- every later transition preserves `round === deckPosition + 1`;
- phase, round, participant, and generation guards on every mutation;
- timeout defaults for final vote, calls, answers, challenges, and disputes;
- corrupt assignment/question integrity produces `SYSTEM_VOID` and never
  reveals or scores a key;
- caller disconnect does not cancel a locked call;
- final-vote, call, answer, challenge, and dispute-voter eligibility remain
  snapshotted after phase opening;
- a Presence read failure aborts a boundary transition rather than exempting
  players;
- the 15-second continuity recheck resumes with 2+ players and otherwise
  abandons exactly once;
- duplicate answers, calls, votes, deadlines, and settlement are idempotent;
- score-event sums, mode subtotals/total, and the shared `players.score` mirror
  remain equal after normal, voided, duplicate, and retried settlement;
- stage/controller redaction before every reveal boundary;
- one controller cannot read another player's assigned question;
- hidden tier is absent from every player-facing result validator;
- stale Workflow completion cannot freeze a replaced pack;
- retrieval adapter scheme/port/IP/redirect/size/time/content-type bounds,
  credential stripping, provider failure, and catalog fallback;
- stale-game cleanup covers all QuizSlop tables and component job handles;
- finalization does not schedule SlopLash leaderboard or winner-tagline work and
  the generic recap returns its explicit unsupported-mode result;
- finalization/abandonment sets `finishedAt` once and every later gameplay or
  deadline mutation is a stale no-op;
- generic prompt, response, chat, reaction, and other-mode mutations reject a
  QuizSlop game;
- reconnect, abandonment, and fresh-game behavior.

### Fixture and browser coverage

- stage and controller for every mode-local phase;
- 2-player, 5-player, and 8-player layouts;
- long names, topics, questions, choices, explanations, and source labels;
- neutral-versus-display question QA and varied comedy devices;
- one through four distinct question groups in a reveal;
- a separate `Question N of M` fixture beat and fresh 30-second budget for every
  group in a multi-question reveal;
- no calls, one call, reciprocal calls, and several calls on one target;
- duplicate, upheld, voided, and several simultaneous disputes;
- disconnected Home Topic owner;
- light, dark, reduced motion, narrow width, and browser zoom;
- the host-paced first-round tutorial, timers on, and host-controlled Tutorial
  Mode;
- stored-session parsing, join-to-controller routing, and dedicated shell
  resolution for QuizSlop;
- display-only creation opens the stage, while playing-host creation opens a
  private controller with a separate authenticated stage action;
- live deterministic start-to-final and abandonment paths.

## Metrics and Playtest Gates

Instrument:

- normalization accept, revise, reject, deadline, and fallback rates;
- exact/semantic topic-duplicate rejection and reviewed near-duplicate escapes;
- pack-build duration from confirmation;
- candidates generated and rejected by internal tier and reason;
- comedy-device distribution, verifier humor flags, and human comedy-review
  ratings for catalog and launch samples;
- dispute, uphold, and void rate by category, internal tier, and model;
- answer accuracy by internal tier, category, Home Topic ownership, and round;
- hidden-tier transitions and time spent at each tier;
- Call Slop use, accuracy, repeated targeting, and share of total score;
- normal versus final comeback frequency;
- round, game, and lobby duration;
- timeout, durable disconnect, and reconnect rate;
- model tokens, cost, retry rate, and provider/retrieval failures;
- abandonment, new-game, and quit rate.

Telemetry contains stable IDs, bounded enums, counts, timings, and model usage;
it does not copy private raw topics, support excerpts, player names, or full
question/source text into third-party analytics. Content QA reads the protected
game-owned records through the internal path described above.

Ask players after each prototype:

1. Was the quiz's own writing genuinely funny, or only the players' reactions?
2. Which questions got a laugh, and which felt flat, forced, or try-hard?
3. Did the questions become more challenging without feeling arbitrary?
4. Did Call Slop create funny pressure or feel mean and repetitive?
5. Did you care when another player's Home Topic appeared?
6. Did any round feel like it had too many steps?
7. Did you trust every answer and visible source?
8. Did topic setup or pack generation take too long?
9. Was the final double-point question exciting or too swingy?
10. Did the winner feel legitimate even though players sometimes saw different
    questions?
11. Would you immediately start a fresh game with new topics?

The first difficulty requirement is monotonic calibration: aggregated accuracy
must descend from internal Easy through Insane. Set narrower numeric bands only
after the approved catalog and initial playtests provide evidence.

Before enabling custom topics in production, run at least 20 representative
topic builds across the supported category shapes. The initial technical gate
is:

- zero accepted questions whose retained evidence fails human support review;
- at least 90% of topics produce a complete four-tier pack within 60 seconds;
- at least 90% of generated launch-sample questions receive a human rating of
  `WITTY` or `BIG_LAUGH`, and none ship with `ANSWER_LEAK`, `MEAN`, or
  `TRY_HARD`;
- every failed or timed-out topic reaches a usable catalog fallback;
- no unsafe URL, private-network request, partial pack, or stale revision enters
  playable state.

If the gate fails, ship or keep the curated-only mode and retain the measured
failure data. Custom generation is optional to the correctness of the base game.

## Risks and Guardrails

| Risk                                                       | Guardrail                                                                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The game has too many steps                                | Four-beat round, no visible tiers, no warm-up vote, one optional call, and only actual challenges add a ruling turn     |
| The trivia feels like homework                             | Comedy-reviewed catalog, neutral/display split, varied voice examples, witty deterministic copy, and human comedy gate  |
| AI comedy becomes generic or cringe                        | Multiple variants, specific device tags, rejected flat/try-hard examples, repetition checks, and human launch sampling  |
| A joke leaks the answer or distorts a fact                 | Immutable factual shell, equivalence and choice-parity verification, and correctness-first rejection                    |
| Generated trivia is wrong or ambiguous                     | Retrieved evidence, independent verification, deterministic validation, frozen packs, visible sources, and disputes     |
| Hidden adaptation feels arbitrary                          | Easy start, one-step deterministic ladder, flat quiz points, no secret owner/category modifiers, telemetry              |
| Strong players feel punished by harder questions           | Honest party-game framing, no miss penalty, no hidden tier-weighted scoring, and an explicit fairness playtest question |
| Call Slop becomes dogpiling                                | Two-token limit, target score unaffected, caller bears equal loss, repeated-target telemetry                            |
| A niche Home Topic excludes everyone else                  | Fair Easy question, one round per player, and two neutral catalog rounds                                                |
| Topic setup kills momentum                                 | Concurrent lobby jobs, explicit progress, hard deadlines, and immediate catalog fallback                                |
| A client burns unbounded model work                        | One active job, idempotent reservations, three revisions per player, 24 per room, and bounded retry/fallback            |
| Provider latency pauses play                               | Complete freeze before start; no model call after roster freeze                                                         |
| AI output races topic edits                                | Monotonic revisions, idempotency keys, cancellation, and stale-completion guards                                        |
| Source URLs target internal systems or inject instructions | Public-network retrieval adapter, bounded inert extraction, and data-only prompting                                     |
| Players disconnect to avoid a miss or call                 | Persisted phase-boundary rosters; an answer-eligible player remains accountable after later disconnect                  |
| Competitive rooms manipulate dispute turnout               | Frozen voter denominator and strict majority of all eligible voters                                                     |
| Current facts age badly                                    | Stable-topic rules, time boundaries, retrieval timestamps, evidence retention, and retirement tooling                   |
| Final round erases the rest of the game                    | Double only one +100 quiz reward; Call Slop remains fixed                                                               |
| Questions or hidden tiers leak                             | Separate stage/controller views and release-blocking redaction tests                                                    |

## Locked Defaults and Tuning Gates

An implementation agent must use these defaults unless later evidence and an
explicit product decision replace them:

- hidden global tier starts at Easy, moves one step per valid result, and is
  never shown;
- normal quiz score is +100/0 and final quiz score is +200/0;
- each player has two Call Slop tokens worth +/-150;
- Home Topic owner is revealed before calls but receives no modifier;
- warm-up is preselected, scored, and adaptive;
- only the finale has a three-topic vote;
- all distinct question disputes are batched;
- every interactive phase uses a fixed boundary-active roster;
- a 15-second continuity grace runs before round-boundary abandonment;
- custom pack deadline is 60 seconds, then catalog fallback;
- custom setup allows three revisions per player and 24 reservations per room;
- first release is English-only and party-safe;
- four choices remain the authoritative answer format;
- every catalog and generated question follows the factual-shell plus comedy-copy
  contract; the AI writes exactly three comedy variants per factual shell and a
  valid four-question pack uses at least three primary comedy devices;
- the reviewed catalog has at least 12 topics across at least six non-`OTHER`
  categories;
- generated packs are game-owned and are not reused across games;
- QuizSlop always uses a shared stage plus private controllers; joiners and a
  playing host route to a controller, while a display-only host routes to stage;
- no global leaderboard, AI winner tagline, or generic shareable recap ships in
  the first version;
- one Home Topic per player is sufficient for the first version;
- 8-player games retain every Home Turf round even if they run longer;
- no category-veto UI ships initially.

Call Slop values, timer lengths, final points, pack deadline, and large-room
duration remain tuning hypotheses, but they are not open implementation
questions. Build the documented values, instrument them, and change them only
after playtest evidence is reviewed.
