/**
 * Deterministic QuizSlop stage/controller voice bank. Server code selects a
 * line per phase transition with a stable hash (see docs "Stage and Controller
 * Responsibilities"); clients never randomize. Every line roasts the quiz,
 * topic, or outcome, never a player, and carries a plain accessibleLabel for
 * screen readers plus draft comedy-review metadata.
 *
 * review is DRAFT for every line: enabling a joke line is a human comedy gate.
 * An implementation agent must never set approved to true.
 */
import type { QuizslopVoiceEventTag, QuizslopVoiceLine } from "../types";

/** Canonical ordered list of voice event tags (types.ts declares only the type). */
export const QUIZSLOP_VOICE_EVENT_TAGS: readonly QuizslopVoiceEventTag[] = [
  "LOBBY_SETUP",
  "HOUSE_VOTE",
  "HOUSE_VOTE_REVEAL",
  "TOPIC_REVEAL_WARM_UP",
  "TOPIC_REVEAL_HOME_TURF",
  "TOPIC_REVEAL_HOUSE_CHOICE",
  "SLOP_CALL",
  "SLOP_CALL_REVEAL",
  "ANSWER",
  "QUESTION_REVEAL",
  "DISPUTE_WINDOW",
  "DISPUTE_VOTE",
  "ROUND_RESULTS",
  "CONTINUITY_GRACE",
  "FINAL_RESULTS",
];

const DRAFT_REVIEW = { approved: false, reviewer: null, reviewedAt: null } as const;

export const QUIZSLOP_VOICE_LINES: readonly QuizslopVoiceLine[] = [
  // LOBBY_SETUP
  {
    id: "vl-lobby-setup-1",
    tag: "LOBBY_SETUP",
    text: "Pick a topic you'd defend in a bar argument. Gently.",
    accessibleLabel: "Choose your home topic to continue.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-lobby-setup-2",
    tag: "LOBBY_SETUP",
    text: "The quizmaster is warming up and already judging the topic list.",
    accessibleLabel: "Waiting for players to confirm their topics.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-lobby-setup-3",
    tag: "LOBBY_SETUP",
    text: "Lock in your specialist subject before second thoughts do it for you.",
    accessibleLabel: "Confirm your chosen topic.",
    review: DRAFT_REVIEW,
  },
  // HOUSE_VOTE
  {
    id: "vl-house-vote-1",
    tag: "HOUSE_VOTE",
    text: "Three topics enter. Democracy decides. Mostly.",
    accessibleLabel: "Vote for the final round topic.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-house-vote-2",
    tag: "HOUSE_VOTE",
    text: "Vote for the finale topic, or let the room choose your fate.",
    accessibleLabel: "Choose one of the three final topics.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-house-vote-3",
    tag: "HOUSE_VOTE",
    text: "One last topic to settle. Choose wisely, or at least loudly.",
    accessibleLabel: "Cast your vote for the final topic.",
    review: DRAFT_REVIEW,
  },
  // HOUSE_VOTE_REVEAL
  {
    id: "vl-house-vote-reveal-1",
    tag: "HOUSE_VOTE_REVEAL",
    text: "The people have spoken, and the tally is in.",
    accessibleLabel: "The winning final topic is shown.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-house-vote-reveal-2",
    tag: "HOUSE_VOTE_REVEAL",
    text: "Your finale topic, freshly elected.",
    accessibleLabel: "The final topic has been chosen.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-house-vote-reveal-3",
    tag: "HOUSE_VOTE_REVEAL",
    text: "The votes are counted. No recounts; this is a party game.",
    accessibleLabel: "Final topic vote result.",
    review: DRAFT_REVIEW,
  },
  // TOPIC_REVEAL_WARM_UP
  {
    id: "vl-topic-reveal-warm-up-1",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "We're easing in. Nobody panic just yet.",
    accessibleLabel: "Warm-up round topic revealed.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-topic-reveal-warm-up-2",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "A gentle warm-up topic, chosen to lull you into confidence.",
    accessibleLabel: "This is the warm-up topic.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-topic-reveal-warm-up-3",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "Round one, house pick. Save the sweating for later.",
    accessibleLabel: "Warm-up round begins.",
    review: DRAFT_REVIEW,
  },
  // TOPIC_REVEAL_HOME_TURF
  {
    id: "vl-topic-reveal-home-turf-1",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "Home turf. Someone in this room claimed to know this.",
    accessibleLabel: "Home turf round; the topic owner is shown.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-topic-reveal-home-turf-2",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "Time to find out whether that specialist subject was a bluff.",
    accessibleLabel: "This round is a player's home topic.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-topic-reveal-home-turf-3",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "This one's personal. The topic owner has opinions.",
    accessibleLabel: "Home turf round for the named player.",
    review: DRAFT_REVIEW,
  },
  // TOPIC_REVEAL_HOUSE_CHOICE
  {
    id: "vl-topic-reveal-house-choice-1",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "The finale topic you all voted for. No takebacks now.",
    accessibleLabel: "Final round topic revealed.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-topic-reveal-house-choice-2",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "Double points on the line, and the room asked for this.",
    accessibleLabel: "Final round; correct answers are worth 200 points.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-topic-reveal-house-choice-3",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "Last topic standing, and it's worth twice as much.",
    accessibleLabel: "Final topic; points are doubled.",
    review: DRAFT_REVIEW,
  },
  // SLOP_CALL
  {
    id: "vl-slop-call-1",
    tag: "SLOP_CALL",
    text: "Call someone's slop, or hold your token and your peace.",
    accessibleLabel: "Call one player or hold your token.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-slop-call-2",
    tag: "SLOP_CALL",
    text: "Feeling confident about someone else's downfall? Spend a token.",
    accessibleLabel: "Predict that another player will miss, or hold.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-slop-call-3",
    tag: "SLOP_CALL",
    text: "Two tokens, endless suspicion. Point one somewhere.",
    accessibleLabel: "You may spend one Call Slop token this round.",
    review: DRAFT_REVIEW,
  },
  // SLOP_CALL_REVEAL
  {
    id: "vl-slop-call-reveal-1",
    tag: "SLOP_CALL_REVEAL",
    text: "Calls are locked. Let's see who doubted whom.",
    accessibleLabel: "All calls are revealed.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-slop-call-reveal-2",
    tag: "SLOP_CALL_REVEAL",
    text: "The accusations are in. Awkward eye contact starts now.",
    accessibleLabel: "Revealing who called whom.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-slop-call-reveal-3",
    tag: "SLOP_CALL_REVEAL",
    text: "Every called-out player, revealed all at once.",
    accessibleLabel: "Call targets are now shown.",
    review: DRAFT_REVIEW,
  },
  // ANSWER
  {
    id: "vl-answer-1",
    tag: "ANSWER",
    text: "Answer in private. Poker faces on.",
    accessibleLabel: "Choose and lock your answer.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-answer-2",
    tag: "ANSWER",
    text: "Four choices, one clock, zero help from the room.",
    accessibleLabel: "Select one of the four answers before time runs out.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-answer-3",
    tag: "ANSWER",
    text: "Lock it in. The quizmaster is not accepting excuses.",
    accessibleLabel: "Lock your answer to submit it.",
    review: DRAFT_REVIEW,
  },
  // QUESTION_REVEAL
  {
    id: "vl-question-reveal-1",
    tag: "QUESTION_REVEAL",
    text: "Answers are in. Let's survey the damage.",
    accessibleLabel: "Revealing the question and correct answer.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-question-reveal-2",
    tag: "QUESTION_REVEAL",
    text: "Time to reveal who actually knew this one.",
    accessibleLabel: "Showing each player's result for this question.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-question-reveal-3",
    tag: "QUESTION_REVEAL",
    text: "The correct answer, plus everyone's brave guesses.",
    accessibleLabel: "The correct choice is now shown.",
    review: DRAFT_REVIEW,
  },
  // DISPUTE_WINDOW
  {
    id: "vl-dispute-window-1",
    tag: "DISPUTE_WINDOW",
    text: "Smell something wrong? You may challenge one question.",
    accessibleLabel: "You may dispute one revealed question.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-dispute-window-2",
    tag: "DISPUTE_WINDOW",
    text: "The dispute window is open. Bring evidence, not vibes.",
    accessibleLabel: "Open a dispute if you believe a question was wrong.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-dispute-window-3",
    tag: "DISPUTE_WINDOW",
    text: "Think the quizmaster slipped? Now's the moment to say so.",
    accessibleLabel: "Challenge a question now, or continue.",
    review: DRAFT_REVIEW,
  },
  // DISPUTE_VOTE
  {
    id: "vl-dispute-vote-1",
    tag: "DISPUTE_VOTE",
    text: "The room rules on the challenge. Majority wins.",
    accessibleLabel: "Vote to uphold or void the challenged question.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-dispute-vote-2",
    tag: "DISPUTE_VOTE",
    text: "Vote to uphold or void. The quizmaster awaits judgement.",
    accessibleLabel: "Cast your dispute vote.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-dispute-vote-3",
    tag: "DISPUTE_VOTE",
    text: "Democracy decides whether that question survives.",
    accessibleLabel: "Vote on the disputed question.",
    review: DRAFT_REVIEW,
  },
  // ROUND_RESULTS
  {
    id: "vl-round-results-1",
    tag: "ROUND_RESULTS",
    text: "Points tallied, egos adjusted.",
    accessibleLabel: "Round scores are shown.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-round-results-2",
    tag: "ROUND_RESULTS",
    text: "Here's where the round left everyone.",
    accessibleLabel: "Updated scoreboard for this round.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-round-results-3",
    tag: "ROUND_RESULTS",
    text: "The scoreboard shifts. Someone looks pleased.",
    accessibleLabel: "Round results and totals.",
    review: DRAFT_REVIEW,
  },
  // CONTINUITY_GRACE
  {
    id: "vl-continuity-grace-1",
    tag: "CONTINUITY_GRACE",
    text: "Hang tight, we're waiting on a reconnect.",
    accessibleLabel: "Paused while waiting for a player to reconnect.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-continuity-grace-2",
    tag: "CONTINUITY_GRACE",
    text: "The game paused for a missing player. Stretch a little.",
    accessibleLabel: "Waiting for players to return.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-continuity-grace-3",
    tag: "CONTINUITY_GRACE",
    text: "Holding the line for a moment. Back shortly.",
    accessibleLabel: "Game paused; it will resume soon.",
    review: DRAFT_REVIEW,
  },
  // FINAL_RESULTS
  {
    id: "vl-final-results-1",
    tag: "FINAL_RESULTS",
    text: "That's the game. Bragging rights are now official.",
    accessibleLabel: "Final results and winner.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-final-results-2",
    tag: "FINAL_RESULTS",
    text: "Final scores are locked. The quiz rests its case.",
    accessibleLabel: "The game is over; final standings are shown.",
    review: DRAFT_REVIEW,
  },
  {
    id: "vl-final-results-3",
    tag: "FINAL_RESULTS",
    text: "Winner declared, awards handed out, no refunds.",
    accessibleLabel: "Winner and end-of-game awards.",
    review: DRAFT_REVIEW,
  },
];

/** Every deterministic voice line carrying the given event tag, in bank order. */
export function getVoiceLinesForTag(tag: QuizslopVoiceEventTag): readonly QuizslopVoiceLine[] {
  return QUIZSLOP_VOICE_LINES.filter((line) => line.tag === tag);
}
