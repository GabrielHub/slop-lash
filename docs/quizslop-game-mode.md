# QuizSlop: Standardized Learning & Occupational Proficiency

QuizSlop is a cooperative trivia test for 3–8 human players. The class needs a
70% adjusted score to pass. One permanent, hidden Saboteur is trying to make the
class fail without being identified at the final Academic Integrity Hearing.

The central joke is not merely that somebody lies. Every player first answers a
private question as its Candidate, then becomes the official Proxy answering a
different Candidate's question. A wrong official answer creates two plausible
stories: the Candidate did not know it, or the Proxy changed it.

This document is the product and privacy contract for the implemented mode. Code,
schemas, tests, and reviewed catalog fixtures remain the source of truth when an
implementation detail changes.

## Non-negotiable rules

- One Saboteur is assigned at roster freeze and keeps the role for the whole test.
- The Saboteur is also a normal Candidate and Proxy. There is no early elimination.
- Every player receives a distinct topic and question in every section.
- Every player is the Proxy for a different Candidate in every section.
- Candidate scratch work is private until the section receipt is revealed.
- The Candidate scratch answer drives hidden adaptive difficulty.
- The Proxy's official answer drives the class score.
- AI content is generated and frozen before scored play. No model call may change
  a live question or answer key.
- Hidden roles, difficulty tiers, answer keys, private votes, and unrevealed
  scratch work never enter a stage or another player's controller payload.

## Test length

The section count keeps the exam between 18 and 24 official questions:

| Players | Sections | Questions |
| ------- | -------- | --------- |
| 3       | 6        | 18        |
| 4       | 5        | 20        |
| 5       | 4        | 20        |
| 6       | 4        | 24        |
| 7       | 3        | 21        |
| 8       | 3        | 24        |

Pairings are deterministic from the frozen roster and section index. Each section is
a derangement: nobody proxies for themselves. Rotation should maximize different
Candidate–Proxy pairings before repeating one.

## Roles

### Class member

A class member wants the adjusted score to reach 70%. They answer their scratch
question honestly, discuss everybody's questions, proxy an official answer, use
the Proctor Review carefully, and identify the Saboteur at the final hearing.

### Saboteur

The Saboteur wants the adjusted score below 70%. They may answer any question in
any way; the game does not expose a special sabotage button. Their scoring rewards
wrong official answers submitted while they are the Proxy:

- 1 sabotage point for a wrong official answer;
- 1 additional sabotage point when the Candidate's scratch answer was correct and
  the Saboteur changed it to a wrong official answer.

The extra point makes a clean override valuable while keeping every action
plausibly deniable.

## Section loop

### 1. Section intro

The stage shows the section number, pass line, current raw trajectory, and
public Candidate–Proxy pairings. Controllers show the player's own assignment.
The first intro also reveals the player's role privately.

Each Candidate receives a topic and question different from every other Candidate
in that section. Difficulty is never shown.

### 2. Scratch

Each Candidate privately locks one of four choices. The stage shows progress only.
No Proxy, host display, or other player receives the selected choice.

Timeout/default: an unanswered scratch response is recorded as neutral and does
not move hidden difficulty.

### 3. Proxy answer

The room discusses the questions. Each Proxy sees the Candidate's prompt and
choices, but not the Candidate's scratch choice. The Proxy locks the official
answer that will count on the exam.

When a Proxy is suspended, the affected question uses a private class ballot. Only
a strict majority among eligible, non-suspended players becomes the official
answer. A split or tied ballot uses the Candidate's scratch answer as the
deterministic fallback; a missing scratch answer uses a deterministic seeded choice.

### 4. Oral defense and receipts

Questions whose official answer is wrong receive an oral-defense beat. The
Candidate explains their reasoning and the Proxy explains the official answer.
The stage then reveals a receipt containing:

- Candidate scratch choice;
- Proxy or class-ballot official choice;
- correct choice and concise explanation;
- whether the official answer earned a raw point;
- any visible score movement, without revealing who earned hidden sabotage
  points.

Correct questions may use a compact receipt so a successful section does not
become a meeting that should have been an email.

### 5. Section results

The stage updates raw correct, official questions attempted, and the raw grade
trajectory. Sabotage deductions and the adjusted grade stay sealed until the
terminal result: revealing a deduction beside one wrong Proxy answer would reveal
the Saboteur with all the subtlety of a fire alarm in a library.

## Dynamic difficulty

Every participant has a server-only tier: EASY, MEDIUM, HARD, or INSANE. New
players begin at MEDIUM.

After a section:

- correct scratch answer: move up one tier;
- incorrect scratch answer: move down one tier;
- timeout, void, or missing evidence: no movement.

The next section materializes a question at the updated tier. Because only
scratch work moves the ladder, a malicious Proxy cannot alter the Candidate's
future difficulty. The client never receives the tier or a value from which it
can be reliably inferred.

## Proctor Review

The Proctor Review occurs at the midpoint, after a completed section. Every
active participant privately votes for one player to suspend, or abstains.

A target is suspended only with a strict majority of the frozen roster. Split or
insufficient votes suspend nobody. The result is public, but individual ballots
remain private.

Suspension lasts for the next section only:

- the suspended player still receives and discusses their Candidate question;
- they still submit private scratch work;
- they cannot act as a Proxy;
- their would-be official answer is replaced by the private class ballot.

Suspending the Saboteur removes one direct sabotage opportunity. Suspending an
innocent player wastes the class's only defensive intervention.

## Academic Integrity Hearing

After the final section, every participant privately accuses one player. An
accusation cannot be changed after it is locked.

If a strict majority accuses the Saboteur, every sabotage deduction is removed.
Otherwise the deductions remain. Individual accusations stay private. The
terminal result reveals only the majority target, when one exists.

## Scoring and outcomes

Definitions:

- `rawCorrect`: number of correct official answers;
- `totalQuestions`: number of valid official answers;
- `sabotagePoints`: hidden deductions earned by the Saboteur;
- `deductionsRemoved`: true when a strict majority identifies the Saboteur;
- `adjustedCorrect`: `rawCorrect - (deductionsRemoved ? 0 : sabotagePoints)`;
- `grade`: `max(0, adjustedCorrect) / totalQuestions`.

The class passes when `grade >= 0.70`. The Saboteur wins when the class fails. A
successful accusation can therefore rescue an exam that would otherwise fail.

Settlement is phase-generation guarded and idempotent; replaying a deadline or
submission cannot double-score a question.

## Content sources

The host chooses one of two modes.

### Reviewed Catalog

The server selects from checked-in, structurally validated, human-approved topic
packs. The start transaction freezes the exact questions, choice order, answer
keys, explanations, sources, assignments, and pairings.

New question content remains unplayable until a named human approves both factual
and comedy review fields. Agents may add drafts and topic seeds, but must not set
human approval.

### Fresh AI Pack

The host selects the generator model from the server allowlist. The server owns
the verifier model, prompt version, schema version, evidence policy, retry policy,
and fallback behavior.

Generation is a durable pre-game job:

1. choose 25 distinct, human-reviewed topic banks for the maximum exam;
2. load only their trusted, retained evidence records—never arbitrary model-provided
   URLs;
3. generate structured questions with AI SDK object output;
4. verify answer-key support, uniqueness, ambiguity, safety, and factual
   equivalence against a separate verifier pass;
5. persist the accepted immutable pack with generator/verifier provenance;
6. mark the pack READY, or freeze a reviewed catalog fallback.

The host cannot start while an AI pack is pending or generating. A missing API
key, absent trusted evidence, malformed output, failed verification, or exhausted
retry budget fails closed to the reviewed catalog. A warning may be shown in the
lobby; play should remain available.

There are no AI calls after `SECTION_INTRO` begins.

## Topic seeds and safety

The draft seed catalog is intentionally broader than the reviewed playable catalog. It
includes the requested subjects such as cocktails, horology, cryptids,
marsupials, reality dating shows, anime, hair products, MMA, horse racing,
cryptocurrencies, machine learning, pharmaceuticals, deep-sea fishing, deep-sea
oil drilling, fermented foods, competitive dog grooming, elevators, forklift
certification, port logistics, vending machines, military pigeons, bird
courtship, medieval medicine, military rations, taxidermy, high-end furniture,
sleep science, ergonomics, germ theory, and office supplies.

Content boundaries:

- conspiracy topics cover famous claims, origins, and debunking—not advocacy;
- dictators cover history, propaganda, and institutions; atrocities and victims
  are never punchlines;
- furry culture is respectful and nonsexual;
- liquor and cocktails are distinct domains;
- medicine, pharmaceuticals, sleep, and ergonomics never give personal medical
  advice;
- humor targets objects, systems, jargon, and absurd specificity—not protected
  groups or victims.

## Timing and Tutorial Mode

With timers enabled, submission phases settle when every snapshotted eligible
participant resolves or when the server deadline applies documented defaults.
Short reveal phases remain long enough for a shared room to read them.

With Tutorial Mode enabled:

- every phase includes one short instruction and consequence;
- quorum does not auto-advance a phase;
- the host explicitly reveals/closes submission phases;
- missing submissions receive the same deterministic defaults;
- passive results wait for the host;
- every host action still supplies expected phase generation and becomes stale
  safely after a concurrent transition.

## View and privacy contract

The shared stage receives:

- room code and public roster;
- exact public phase and section number;
- Candidate–Proxy pairings and topic labels;
- submission counts, not selections;
- receipts only after their reveal phase;
- team score, suspension result, and final hearing result.

A participant controller receives:

- its own role;
- its Candidate question during scratch;
- its assigned Candidate's question during proxy answering;
- its own locked selections;
- eligible suspension/accusation targets and its own locked vote;
- revealed receipts and final facts at the same time as the stage.

It does not receive another player's scratch choice before receipts, hidden tier,
answer keys before reveal, another player's private ballots, or hidden sabotage
attribution.

A display-only host is not a participant and cannot submit scratch work, proxy
answers, suspension votes, group ballots, or accusations. Host capability grants
pacing authority, not access to private gameplay fields.

## Visual direction

The stage resembles an aggressively official test broadcast: institutional paper,
fluorescent status marks, red-pen annotations, candidate numbers, answer-sheet
handoffs, stamped receipts, and suspension tape. The current question, proxy
handoff, grade trajectory, and pass line receive visual priority.

Controllers stay compact and action-first. Comedy lives in prompts, labels, and
receipts; it must never obscure choices or consequences. Motion honors reduced
motion, and every sound cue has a text equivalent.

## Verification checklist

At minimum, automated tests cover:

- 3–8 player section counts and rotating derangements;
- one and only one hidden Saboteur;
- unique topic/question assignments per section;
- scratch-driven tier movement and proxy-independent difficulty;
- raw score and both sabotage point cases;
- strict-majority suspension, abstention, tie, and one-section expiry;
- class-ballot official answers while a Proxy is suspended;
- strict-majority final accusation and deduction restoration;
- redaction for stage, host, Candidate, Proxy, and reconnect views;
- duplicate mutation/deadline idempotency;
- AI pack ready, verifier rejection, missing evidence, missing key, and catalog
  fallback paths;
- timers on and host-paced Tutorial Mode;
- narrow controller, shared stage, reduced motion, and live end-to-end flow.
