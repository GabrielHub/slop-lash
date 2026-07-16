# QuizSlop: Hidden-Role Trivia Benchmark

> Status: workshop draft 0.1. This is a product and implementation direction,
> not a locked specification.
>
> Working display name: **QuizSlop**
>
> Working internal game type: **QUIZSLOP**
>
> Related project boundary: [Architecture](architecture.md)

## Recommendation

Build the mode around an AI quality-control fiction instead of copying the
school setting.

The players are **Validators** trying to certify a dangerously confident model.
One hidden **Hallucinator** wants enough benchmark batches to fail. Every batch
combines personalized trivia with a shared decision about whether an AI answer
is fact or slop. After the report, the group temporarily sandboxes its prime
suspect.

The short pitch is:

> **Trust the facts. Suspect the confidence.**

This keeps the strongest parts of the inspiration—hidden sabotage, individual
knowledge tests, a collective pass threshold, and temporary suspension—while
giving Slop-Lash its own AI-native interaction in place of parkour.

## Naming Workshop

| Name           | Strength                                                         | Concern                                                 |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| **QuizSlop**   | Immediately explains the mode and matches ChatSlop and MatchSlop | Less distinctive without the benchmark fiction          |
| **Slop Audit** | Best expression of the quality-control theme                     | Does not immediately read as trivia                     |
| **Slopaganda** | Funny and memorable                                              | Sounds political and may incorrectly narrow the content |

**Recommendation:** use QuizSlop as the picker name and “The Bad Benchmark” as
the internal visual/theme brief. Keep Slop Audit available as a possible title
if playtests show the quiz framing is already obvious.

Suggested host-picker copy:

> Hidden-role trivia: pass the benchmark and sandbox the Hallucinator.

## What We Borrow and What We Change

| Source idea                                           | QuizSlop treatment                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| One hidden saboteur intentionally hurts a group score | The Hallucinator can miss personal questions and secretly corrupt shared model memos |
| Every player receives an individual knowledge test    | Personal Checks are selected from each player's interests and calibrated difficulty  |
| The team passes or fails each quiz together           | Every Benchmark Batch receives a 0–110 grade                                         |
| The group votes to suspend one suspect for a round    | The suspect is Sandboxed but still plays diagnostically, so nobody has dead time     |
| A perfect round helps the next round                  | A 100 earns a 10-point Checksum bonus for the next batch                             |
| Parkour creates uncertainty and active sabotage       | A shared Slop Check creates discussion, persuasion, and a secret Prompt Injection    |
| School and graduation theme                           | AI model certification, error reports, sandboxes, and corrupted benchmark visuals    |

## Design Pillars

1. **Trivia creates evidence; conversation creates suspicion.** Missing a hard
   question is not proof. Confidence, topic history, public reasoning, voting,
   and repeated behavior are the real social signals.
2. **AI players are full participants.** They receive private roles, answer
   questions, bluff, accuse, get sandboxed, and can win. They remain visibly
   labeled as AI.
3. **No one gets eliminated.** A Sandboxed player still answers, talks, reacts,
   and votes in the accusation. Only their benchmark influence is temporarily
   removed.
4. **AI may add personality, never truth.** Scoring answers come from a reviewed
   question source. A model may write a rationale or recap, but cannot invent
   the authoritative answer during a live game.
5. **The room should be fun with one or two humans.** AI fill is a first-class
   setup, not a compromised fallback.
6. **Every phase produces a stage-worthy reveal.** The mode should feel like a
   game show, not a sequence of forms on phones.

## Player and Role Model

### Starting recommendation

- Supported room size: 3–8 active participants.
- Designed center: 5 participants.
- Small Room Assist: offer to fill any room below 5 with AI players.
- MVP role count: 1 Hallucinator at every room size.
- Revisit a second Hallucinator for 7–8 players only after balance testing.
- With exactly one human, guarantee that an AI is the Hallucinator on the
  player's first game. A solo human should learn the deduction loop before
  being asked to deceive four bots.

### Validator

> Pass four benchmark batches. Answer honestly, audit the model, and sandbox
> the Hallucinator.

Validators share a team result. Their individual accuracy is evidence and an
end-game accolade, not a separate mid-game score.

### Hallucinator

> Cause three failed benchmark batches without becoming obvious. You have two
> secret Prompt Injections.

The Hallucinator may:

- deliberately miss a Personal Check;
- answer correctly to build trust or deny a perfect round later;
- lie about confidence or reasoning;
- influence the shared Slop Check;
- misdirect the Sandbox vote;
- spend up to two Prompt Injections during the game.

Prompt Injections remain usable while Sandboxed. This keeps the hidden role
engaged and means a correct vote reduces sabotage without completely disabling
the player.

## Full Game Flow

**Calibration Blitz → Role Reveal → up to six Benchmark Batches → Final Reveal**

Each Benchmark Batch is:

**Slop Check → Personal Check → Audit Report → Sandbox Vote**

### 0. Calibration Blitz

Calibration happens before roles are assigned, so the future Hallucinator
cannot intentionally poison it.

Each participant:

- picks two **Know It** topic tags and one **No Clue** tag;
- answers three fast, unscored questions from the reviewed bank;
- receives a hidden starting difficulty by category.

The game may show playful public badges such as “Movie Goblin” or “Sports
Liability,” but it should not expose a precise skill rating. The selection
director can start with a proposed mix of 60% strength, 30% neutral, and 10%
weak-spot questions. Those percentages are tuning knobs.

AI players complete the same calibration naturally. This gives stronger models
harder questions without assigning difficulty solely from their provider name.

### 1. Role Reveal

Roles appear only on each player's controller. The stage explains both
objectives without revealing the assignment.

The Hallucinator sees:

- remaining Prompt Injections;
- the current team pass/fail race;
- an **Inject** or **Hold** decision before each shared memo is prepared.

No player sees another player's role until the final reveal.

### 2. Slop Check

The stage presents:

- one reviewed trivia question;
- the model's chosen answer;
- a short, confident rationale.

The room gets roughly 30 seconds to discuss. A human may post one short hot take
for remote play, and every AI player contributes at most one short public
position. These statements are claims, not locked ballots; the Hallucinator may
bluff or reverse course.

Each scoring player privately chooses:

- **Ship It** — the model is correct; or
- **That's Slop** — the model is wrong.

The majority classification is worth 20 points in the batch grade. Individual
ballots remain hidden until the Audit Report.

If the binding ballots tie, the room defaults to **That's Slop**. “Do not ship
on a split decision” is predictable, thematic, and safer than a random
tiebreaker.

The Director, not the language model, chooses whether the memo is correct or a
plausible wrong answer. The model supplies the rationale and voice. This keeps
the correct answer deterministic and lets us tune the natural mix of good and
bad memos. A starting hypothesis is roughly 65% correct and 35% slop.

If the Hallucinator spends a Prompt Injection, the Director forces a plausible
wrong memo for that batch. The Hallucinator knows the injection succeeded but
still has to persuade the room to ship it. An injection changes the puzzle; it
does not automatically cause a failure.

If memo generation fails, the game shows a deterministic fallback such as
“The model selected B.” The round never waits on flavor text.

### 3. Personal Check

Every player receives one private, four-choice question on their controller.
The assignment uses their topic tags, calibration result, recent categories,
and no-repeat rules.

They submit:

- one answer;
- **Locked**, **Leaning**, or **Wild Guess** confidence;
- an optional short “receipt” explaining why they chose it.

Answers and confidence remain private until everyone locks or the timer ends.
The stage shows submission status, not the private questions.

AI players submit the same bounded shape: selected option, confidence, and one
short receipt. They should not receive the correct answer, other roles, private
human answers, or unrevealed ballots.

### 4. Audit Report

The stage reveals:

1. whether the room correctly shipped or flagged the model memo;
2. each player's question, answer, confidence, and result;
3. the final Benchmark grade;
4. the cumulative race to four passes or three failures.

The reveal should be paced for reactions instead of dumping a spreadsheet.
Incorrect high-confidence answers deserve visual emphasis, but the game should
not label them as sabotage.

After the results, allow roughly 30–40 seconds of table talk. Humans can speak
in the room or submit one short controller statement for remote play. AI
players generate at most one brief accusation or defense so four bots do not
drown out the humans.

### 5. Sandbox Vote

Every participant, including the currently Sandboxed player, accuses one other
participant. The top vote-getter is Sandboxed for the next batch only.

For a tie, run a short vote among the tied candidates. Do not use an unexplained
random tiebreaker.

If the Audit Report has already ended the pass/fail race, this becomes a final
non-scoring **Root Cause** accusation. It does not reverse the team result, but
it completes the deduction arc and feeds the final reveal and Bloodhound award.

In the next batch, a Sandboxed player:

- still receives a diagnostic Personal Check;
- still submits a Ship It or That's Slop ballot;
- still talks, reacts, and casts a Sandbox accusation;
- has their Personal Check excluded from the grade;
- has their Slop Check ballot shown as non-binding.

This preserves participation and creates more evidence. A Hallucinator may
answer correctly while Sandboxed to manufacture an alibi.

## Scoring and End Game

The starting grade model gives Personal Checks most of the weight while making
the shared Slop Check consequential:

    personalScore = 80 × correctScoringPersonalChecks ÷ scoringPersonalChecks
    slopCheckScore = 20 when the majority classification is correct, otherwise 0
    checksumBonus = 10 when the previous batch earned a natural 100, otherwise 0
    benchmarkGrade = personalScore + slopCheckScore + checksumBonus

- A batch passes at 60 or higher.
- A natural 100 earns one Checksum. Checksum does not stack beyond the next
  batch.
- A Sandboxed or system-failed AI slot is excluded from both the Personal Check
  numerator and denominator.
- The Validators win immediately on the fourth passed batch.
- The Hallucinator wins immediately on the third failed batch.
- Therefore a standard game lasts no more than six scored batches.

The 80/20 split and 60-point threshold are balance hypotheses, not promises.
A raw “ceil 60% of available slots” rule has sharp roster-size cliffs. Before
implementation constants are locked, simulate and playtest the grade at every
scoring roster size, including Sandboxed and disconnected states.

### End-game awards

Keep the main outcome cooperative versus hidden role, then add low-stakes
individual awards:

- **Human Firewall** — most correct Personal Checks;
- **Bloodhound** — most Sandbox votes placed on the Hallucinator;
- **Confidently Incorrect** — most memorable high-confidence miss;
- **Clean Hands** — fewest votes received;
- **Chaos ROI** — Hallucinator's failed batches while not Sandboxed.

## Why the Slop Check Is the Signature Mechanic

The individual questions produce suspicion, but the Slop Check produces a
shared argument. It replaces dexterity with something native to this project:
deciding whether a confident AI output deserves trust.

It also gives the Hallucinator active sabotage that is not just “tap the wrong
answer.” The ability creates a known falsehood, but the room can still catch
it. That makes the sabotage powerful, social, and counterplayable.

The first prototype should test this mechanic before investing in a large
question bank. If Ship It versus That's Slop does not create debate, the mode
needs a different shared phase.

## AI Features

### 1. AI contestants

AI contestants should participate through the same durable phase lifecycle as
humans:

- complete calibration;
- receive a private Validator or Hallucinator role;
- answer and state confidence;
- use or hold Prompt Injections when applicable;
- publish a bounded Slop Check hot take and cast a private ballot;
- produce a short receipt;
- reason from the public Audit Report;
- accuse another player;
- remember public behavior across batches.

Their private state belongs in Convex, not in an ever-growing client prompt.
Each phase should use a bounded structured generation rather than one
open-ended autonomous conversation.

For implementation, the current AI SDK supports schema-validated structured
output through generateText and Output.object. A quiz answer job and an
accusation job can each return a narrow Zod-validated object. This matches the
repository's current Gateway and durable-job patterns.

An AI Hallucinator is instructed to blend or sabotage strategically based on
its own question and public history. It may accidentally answer correctly; that
is legitimate play. Its Prompt Injection is the guaranteed sabotage tool.

### 2. Model memo voice

The model writes a maximum two-sentence rationale for the Director-selected
answer. Different host personalities could make it sound:

- overconfident and corporate;
- defensive and passive-aggressive;
- terminally online;
- dry and bureaucratic.

The selected answer and its correctness remain deterministic. On failure, use
a template rather than blocking the phase.

### 3. Compliance narrator

A later narrator can read deterministic questions and answers verbatim, then
generate only short transitions such as:

> Three people shipped the slop. Legal has left the building.

This should follow the existing hybrid narration principle: game facts remain
verbatim and AI supplies bounded flavor.

### 4. Recap and replay

The final recap can identify:

- the Hallucinator's most effective lie;
- which Prompt Injections fooled the room;
- the most suspicious honest miss;
- the accusation timeline;
- the group's best and worst knowledge categories.

The recap describes persisted facts. It does not judge ambiguous intent.

## Dynamic Quizzing Strategy

The guiding rule is:

> **Personalize selection and presentation before inventing facts.**

### Tier 1: Verified Adaptive Director — MVP

Use a checked-in, reviewed question bank. Selection is dynamic, but truth is
not generated at runtime.

Each question should carry at least:

| Field                       | Purpose                              |
| --------------------------- | ------------------------------------ |
| id and version              | Stable identity and safe corrections |
| prompt                      | Exact player-facing question         |
| choices                     | Four bounded answer choices          |
| correct choice              | Server-only scoring authority        |
| explanation                 | Short reveal receipt                 |
| category and tags           | Player-interest matching             |
| difficulty                  | Calibration and assignment           |
| content rating              | Host filtering                       |
| source label and provenance | Review and dispute handling          |
| reviewed date               | Staleness management                 |

Avoid current-events questions in the first bank. A single debatable answer can
destroy trust in a social-deduction game.

### Tier 2: Friend Facts — best dynamic expansion

During setup, each player supplies one oddly specific true fact about
themselves. The player supplies the authoritative truth; AI turns it into a
clean question and plausible decoys.

Examples:

- a first job;
- a bizarre injury;
- a childhood obsession;
- a place they have visited;
- a food they refuse to eat.

The source player does not receive their own question. This creates genuinely
personal trivia without asking a model to invent factual knowledge. Generated
questions require schema validation, content filtering, and either source-player
or host confirmation before entering the scored pool.

### Tier 3: Live Niche Packs — later experiment

Players could request topics such as “2010s Formula 1” or “horror movies before
1980.” Do not score raw model-generated questions.

A safe live pack needs:

1. retrieval from approved sources;
2. a structured candidate question;
3. answer and citation validation;
4. ambiguity and duplicate checks;
5. host preview or a strict confidence gate;
6. a reviewed-bank fallback when any step fails;
7. the final question frozen before the round begins.

Current events, politics, health, legal claims, and contested facts should stay
out until that pipeline has explicit sourcing and moderation.

## Small-Group and Solo Play

Small Room Assist should be prominent in host setup:

- **1 human:** suggest 4 AI players and force an AI Hallucinator for the first
  game.
- **2 humans:** suggest 3 AI players.
- **3–4 humans:** suggest filling to 5 but allow the group to continue as-is.
- **5+ humans:** AI players are optional personalities, not required filler.

AI behavior must create useful social texture without becoming an AI transcript
viewer:

- one short pre-vote hot take per bot;
- one short receipt per bot;
- at most one post-report statement per bot;
- statements ordered around human interaction, not emitted as a wall;
- visible AI badges at all times;
- no claim or implication that a bot is human.

If an AI answer job fails, mark a visible **System Fault** and exclude that slot
from the grade. A provider outage must not look like hidden-role sabotage.

## Theme and Design Language

### Visual brief: The Bad Benchmark

QuizSlop should feel like a cheap corporate certification lab being run as a
live game show.

Use the existing Electric Punch language as the foundation:

- bold display typography for declarations;
- monospaced telemetry for grades, confidence, and audit history;
- thick edges, rounded controls, direct labels, and oversized results;
- punch coral for danger and accusations;
- teal for verified facts;
- gold for Checksum and certification;
- an optional mode accent such as toxic chartreuse for corrupted output.

Motifs:

- benchmark meters and checksum grids;
- misaligned printouts and redaction bars;
- rubber-stamp **CERTIFIED** and **SLOP DETECTED** reveals;
- subtle data corruption, scan jumps, and error bars;
- receipt strips instead of generic cards;
- a restrained amount of pixel rain or terminal noise.

Avoid a generic neon cyberpunk dashboard. The visual joke is failing corporate
quality control, not “hacker UI.”

Suggested sound language:

- dot-matrix printer chatter;
- scanner chirps;
- a heavy certification stamp;
- a short error buzzer;
- corrupted modem stutters used sparingly.

### Stage responsibilities

| Phase          | Stage                                                |
| -------------- | ---------------------------------------------------- |
| Calibration    | Progress, topic badges, and playful diagnostics      |
| Role Reveal    | Neutral mission briefing only                        |
| Slop Check     | Question, model memo, discussion timer, locked count |
| Personal Check | Private-answer status and category animation         |
| Audit Report   | Paged reveals, grade meter, pass/fail race           |
| Sandbox Vote   | Nominees, runoff, and temporary Sandbox stamp        |
| Final          | Role reveal, injection timeline, awards, rematch     |

### Controller responsibilities

- private role and objective;
- Prompt Injection action for the Hallucinator;
- Ship It or That's Slop ballot;
- private four-choice question;
- confidence and optional short receipt;
- short remote-play statement;
- Sandbox accusation and runoff;
- clear reconnect state without re-revealing secrets publicly.

### Accessibility requirements

- Never encode correct, incorrect, shipped, flagged, or Sandboxed by color
  alone.
- Preserve reduced-motion behavior for glitches, stamps, and shaking.
- Keep private questions readable at narrow controller widths.
- Provide text equivalents for sound cues.
- Do not let narration read private questions or roles on the shared stage.

## Architecture Fit

This mode should use the existing room platform while keeping quiz semantics in
typed, mode-local modules.

### Proposed boundaries

| Area           | Direction                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Shared room    | Reuse games, players, sessions, presence, capabilities, and rounds                                                    |
| Game type      | Add QUIZSLOP to the shared GameType and Convex validator                                                              |
| Mode UI        | Add dedicated QuizSlop stage/game and controller shells                                                               |
| Mode state     | Add typed QuizSlop state rather than packing complex data into an untyped metadata record                             |
| Questions      | Keep the source bank checked in; persist frozen per-game instances with server-only keys                              |
| Submissions    | Use QuizSlop-specific answer and ballot records instead of forcing trivia into comedy responses and votes             |
| AI work        | Reuse durable generation jobs and Workpool for independent player and memo calls                                      |
| Long pipelines | Reserve Workflow for multi-step Friend Facts or verified live-pack creation                                           |
| Authority      | Keep role assignment, answer grading, Injection effects, scoring, and phase changes deterministic in Convex mutations |

Likely mode-local records:

- QuizSlop state: detailed phase, pass/fail race, Checksum, current Sandbox,
  and phase generation;
- private role assignment: player role and remaining ability stock;
- frozen question instances: prompt, choices, source version, and hidden key;
- Personal Check submissions: choice, confidence, receipt, eligibility, and
  result;
- Slop Check ballots: classification and whether the ballot counts;
- Sandbox accusations and runoff ballots.

The public stage view and viewer-specific controller view must be constructed
separately. Do not rely on the client to hide role or answer-key fields it has
already received.

### Phase mapping

QuizSlop needs more detail than the shared outer game statuses. Keep a
mode-local authoritative phase such as:

- CALIBRATION;
- ROLE_REVEAL;
- SLOP_CHECK;
- PERSONAL_CHECK;
- AUDIT_REPORT;
- SANDBOX_VOTE;
- SANDBOX_RUNOFF;
- FINAL_REVEAL.

The outer games.status can continue mirroring broad room lifecycle for cleanup,
routing, and shared infrastructure. The QuizSlop shell reads the mode-local
phase for exact rendering and mutation guards.

### AI job shape

Use idempotent generation keys containing game, batch, phase generation,
player, and task. The minimum runtime jobs are:

- one memo rationale per batch;
- one Slop Check ballot/hot take per AI player per batch;
- one Personal Check answer/receipt per AI player per batch;
- one accusation/statement per AI player per batch;
- one Prompt Injection decision for an AI Hallucinator when needed.

If latency or cost is too high, the Slop Check and Personal Check outputs may be
prepared in one schema-validated batch-participation call and released only in
their correct phases. The post-Audit accusation still needs the newly revealed
public evidence.

Persist the generated output only after revalidating game, batch, phase,
participant, and generation identifiers. Stale completions must not advance the
game.

### Secret and answer redaction

Focused tests must prove that:

- a player can read only their own role;
- the stage never receives any private role;
- correct choices remain server-only until the relevant reveal;
- an AI contestant never receives other roles or unrevealed human answers;
- Prompt Injection use stays secret until the final recap;
- reconnecting returns the same role and ability stock;
- spectators cannot obtain controller-only state.

## Host Settings

Start with a small setup surface:

| Setting      | Recommended default                       |
| ------------ | ----------------------------------------- |
| Length       | Standard: first to 4 passes or 3 failures |
| Categories   | Balanced                                  |
| Difficulty   | Standard, with Calibration enabled        |
| AI fill      | Suggest fill to 5                         |
| Timers       | On                                        |
| Friend Facts | Off until the post-MVP pipeline exists    |
| Narrator     | Off for MVP                               |

Later options:

- Quick and Long race targets;
- Chill, Standard, and Sweaty difficulty;
- family-friendly content filtering;
- category inclusion/exclusion;
- human-only Hallucinator eligibility when at least four humans are present;
- Wild Model, where the model chooses its own memo answer instead of the
  Director selecting the candidate.

Avoid exposing Prompt Injection count, scoring weights, natural slop rate, or
role count as host knobs until the standard rules are balanced.

## MVP Scope

### Milestone 1: fixture prototype

Build the entire five-player flow in /dev/ui before backend integration:

- private role cards;
- one Slop Check;
- five Personal Check controller states;
- paged Audit Report;
- Sandbox vote and runoff;
- next-batch Sandboxed diagnostic state;
- final Validator and Hallucinator outcomes.

Use deterministic fixture content and fake AI receipts. The goal is to learn
whether the conversation loop works.

### Milestone 2: deterministic playable mode

- Add QUIZSLOP routing and typed mode state.
- Implement phase guards, timers, reconnect, scoring, Checksum, Sandbox, and
  end conditions.
- Start with a small reviewed bank for internal testing.
- Use deterministic memo templates.
- Add focused engine and redaction tests.

### Milestone 3: AI contestants

- Connect selected Gateway models through the existing durable job pattern.
- Add structured AI answers, confidence, receipts, accusations, and hidden-role
  strategy.
- Add provider-failure exclusion and deterministic fallbacks.
- Validate cost and latency with four AI players.

### Milestone 4: presentation AI and content depth

- Add generated memo rationale and bounded compliance narration.
- Expand the reviewed question bank.
- Add final recaps and awards.
- Add Small Room Assist defaults.

### Milestone 5: dynamic packs

- Add adaptive category/difficulty selection.
- Add confirmed Friend Facts.
- Prototype sourced and host-reviewed niche packs only after the core mode is
  balanced.

## Verification Plan

Focused rules tests:

- role counts and role privacy;
- role assignment after Calibration;
- exact grade calculation at every roster size;
- natural 100 and one-round Checksum;
- Sandboxed numerator and denominator behavior;
- non-binding Sandboxed Slop Check ballot;
- Prompt Injection stock, secrecy, and forced-wrong memo;
- vote ties and runoff;
- early Validator and Hallucinator end conditions;
- disconnect, timeout, AI failure, and reconnect behavior;
- duplicate submissions and stale AI completion rejection;
- question no-repeat and difficulty bounds;
- source-bank schema and unique IDs.

Fixture and browser coverage:

- stage and controller for every mode-local phase;
- one-human/four-AI game;
- Sandboxed Hallucinator and Sandboxed Validator;
- light, dark, narrow controller, and reduced motion;
- long questions, choices, names, receipts, and translated-looking text;
- live start-to-final flow after fixture screens settle.

After settled runtime changes, run the repository-required vp check, vp test,
and vp run build passes. Do not start a second development server.

## Playtest Questions and Metrics

### Questions

1. Does the Slop Check reliably start a conversation?
2. Is confidence useful evidence, or does it make the Hallucinator too obvious?
3. Are two Prompt Injections enough to feel active without deciding the game?
4. Does Sandbox feel powerful when correct and harmless enough when wrong?
5. Does a diagnostic Sandboxed turn remain fun?
6. Can humans distinguish AI bluffing styles without bots dominating the room?
7. Do players trust every revealed answer and explanation?
8. Does Calibration improve fairness enough to justify its setup time?

### Instrumentation

- pass rate by total and scoring roster size;
- Validator/Hallucinator win rate;
- Prompt Injection use round and detection rate;
- natural versus injected Slop Check success;
- Hallucinator Sandbox rate;
- accusation accuracy over time;
- Personal Check accuracy by category, difficulty, and player type;
- phase timeout and disconnect rate;
- disputed-question reports;
- AI job latency, failure rate, tokens, and cost;
- rematch rate by human count.

Initial balance target: both teams should win roughly 40–60% of complete games
at the designed center of five participants. More important than the exact win
rate, a losing team should usually be able to name a decision that might have
changed the outcome.

## Risks and Guardrails

| Risk                                         | Guardrail                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Wrong or ambiguous trivia destroys trust     | Reviewed bank, provenance, reveal explanation, dispute tooling, no live factual generation in MVP |
| Hallucinator is obvious from repeated misses | Personalized difficulty, confidence bluffing, shared sabotage, and incentives to answer correctly |
| Hallucinator cannot affect strong groups     | Prompt Injections and the shared 20-point decision                                                |
| Small groups feel like watching bots talk    | Fill to five, cap bot statements, prioritize human pacing                                         |
| AI failure looks like sabotage               | Explicit System Fault and exclusion from the grade                                                |
| Bots leak roles or keys                      | Viewer-specific contexts, schema-bounded output, redaction tests                                  |
| Live AI creates phase latency                | Precompute when safe, Workpool concurrency, deterministic fallback, never block scoring on flavor |
| Sandboxed humans become spectators           | Diagnostic answers, public receipts, reactions, and accusation vote remain active                 |
| Large rooms become too easy                  | Measure by roster size before adding a second Hallucinator or changing weights                    |
| Current facts age badly                      | Versioned question bank, reviewed date, no current-events pack initially                          |

## Open Decisions

The next workshop should settle:

1. Is QuizSlop the right name, or is Slop Audit stronger?
2. Does the Slop Check use only Ship It/That's Slop, or should Flag voters also
   choose the corrected answer?
3. Should Prompt Injection remain usable while Sandboxed? This draft recommends
   yes.
4. Is one Hallucinator enough at 7–8 players?
5. Are three confidence levels sufficient?
6. Is one Personal Check per batch enough evidence?
7. Should remote human statements be free text, canned phrases, or both?
8. How many Calibration questions are worth the setup time?
9. Should the first content expansion be Friend Facts or a larger core bank?

## Recommended Next Step

Prototype one complete five-player batch in /dev/ui with:

- three human Validators;
- one AI Validator;
- one AI Hallucinator;
- an injected but catchable Slop Check;
- one honest high-confidence miss;
- one suspicious correct answer from the Hallucinator;
- a tied Sandbox vote and runoff.

That single scenario exercises the mode's thesis. If the Audit Report makes
people argue about the right suspect, continue into the deterministic engine.
If it does not, revise the shared phase before building the content pipeline.
