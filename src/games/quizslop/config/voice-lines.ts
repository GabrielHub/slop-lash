/**
 * Deterministic QuizSlop stage/controller voice bank. Server code selects a
 * line per phase transition with a stable hash (see docs "Stage and Controller
 * Responsibilities"); clients never randomize. Every line roasts the quiz,
 * topic, or outcome, never a player, and carries a plain accessibleLabel for
 * screen readers plus draft comedy-review metadata.
 *
 * These lines were approved for production by a named human reviewer (Gabriel
 * Ong) on 2026-07-18; the shared approval metadata below is recorded on every
 * line. An implementation agent must never flip approval on its own, only at a
 * reviewer's explicit direction.
 */
import type { QuizslopVoiceEventTag, QuizslopVoiceLine } from "../types";

const APPROVED_REVIEW = {
  approved: true,
  reviewer: "Gabriel Ong",
  reviewedAt: "2026-07-18T20:00:00.000Z",
} as const;

export const QUIZSLOP_VOICE_LINES: readonly QuizslopVoiceLine[] = [
  // LOBBY_SETUP
  {
    id: "vl-lobby-setup-1",
    tag: "LOBBY_SETUP",
    text: "Pick a topic you would defend in a bar argument. Calmly, ideally.",
    accessibleLabel: "Choose your home topic to continue.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-lobby-setup-2",
    tag: "LOBBY_SETUP",
    text: "The quizmaster is warming up and already side-eyeing the topic list.",
    accessibleLabel: "Waiting for players to confirm their topics.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-lobby-setup-3",
    tag: "LOBBY_SETUP",
    text: "Lock in your specialist subject before your second thoughts do it for you.",
    accessibleLabel: "Confirm your chosen topic.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-lobby-setup-4",
    tag: "LOBBY_SETUP",
    text: "Choose the thing you know far too much about. That is the whole pitch.",
    accessibleLabel: "Select a topic you know well.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-lobby-setup-5",
    tag: "LOBBY_SETUP",
    text: "Name your home turf now. Bluffing is allowed and quietly encouraged.",
    accessibleLabel: "Enter your home topic.",
    review: APPROVED_REVIEW,
  },
  // HOUSE_VOTE
  {
    id: "vl-house-vote-1",
    tag: "HOUSE_VOTE",
    text: "Three topics enter. Democracy decides. Mostly.",
    accessibleLabel: "Vote for the final round topic.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-house-vote-2",
    tag: "HOUSE_VOTE",
    text: "Vote for the finale topic, or let the room pick your fate for you.",
    accessibleLabel: "Choose one of the three final topics.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-house-vote-3",
    tag: "HOUSE_VOTE",
    text: "One last topic to settle. Choose wisely, or at least loudly.",
    accessibleLabel: "Cast your vote for the final topic.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-house-vote-4",
    tag: "HOUSE_VOTE",
    text: "Pick the closing topic. This is the only vote that pays double later.",
    accessibleLabel: "Select the final round topic.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-house-vote-5",
    tag: "HOUSE_VOTE",
    text: "Three finalists, one winner. Campaign quickly.",
    accessibleLabel: "Vote for one of three finalist topics.",
    review: APPROVED_REVIEW,
  },
  // TOPIC_REVEAL_WARM_UP
  {
    id: "vl-topic-reveal-warm-up-1",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "We are easing in. Nobody panic just yet.",
    accessibleLabel: "Warm-up round topic revealed.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-warm-up-2",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "A gentle warm-up topic, picked to lull you into confidence.",
    accessibleLabel: "This is the warm-up topic.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-warm-up-3",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "Round one, house pick. Save the sweating for later.",
    accessibleLabel: "Warm-up round begins.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-warm-up-4",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "Stretch first. The hard questions are patient.",
    accessibleLabel: "The warm-up topic is shown.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-warm-up-5",
    tag: "TOPIC_REVEAL_WARM_UP",
    text: "The quizmaster starts kind. It will not last.",
    accessibleLabel: "Warm-up round topic.",
    review: APPROVED_REVIEW,
  },
  // TOPIC_REVEAL_HOME_TURF
  {
    id: "vl-topic-reveal-home-turf-1",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "Home turf. Someone in this room claimed to know this.",
    accessibleLabel: "Home turf round; the topic owner is shown.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-home-turf-2",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "Time to find out whether that specialist subject was a bluff.",
    accessibleLabel: "This round is a player's home topic.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-home-turf-3",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "This one is personal. The topic owner has opinions.",
    accessibleLabel: "Home turf round for the named player.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-home-turf-4",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "The spotlight swings to one player's chosen ground.",
    accessibleLabel: "A player's home topic is revealed.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-home-turf-5",
    tag: "TOPIC_REVEAL_HOME_TURF",
    text: "Someone requested this topic. The receipts are about to arrive.",
    accessibleLabel: "Home turf round begins.",
    review: APPROVED_REVIEW,
  },
  // TOPIC_REVEAL_HOUSE_CHOICE
  {
    id: "vl-topic-reveal-house-choice-1",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "The finale topic you all voted for. No takebacks now.",
    accessibleLabel: "Final round topic revealed.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-house-choice-2",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "Double points on the line, and the room asked for this.",
    accessibleLabel: "Final round; correct answers are worth 200 points.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-house-choice-3",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "Last topic standing, and it is worth twice as much.",
    accessibleLabel: "Final topic; points are doubled.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-house-choice-4",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "You voted for this. The scoreboard is listening carefully.",
    accessibleLabel: "The voted final topic is shown.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-topic-reveal-house-choice-5",
    tag: "TOPIC_REVEAL_HOUSE_CHOICE",
    text: "Final round. Correct answers now pay double, so aim well.",
    accessibleLabel: "Final round begins; answers score double.",
    review: APPROVED_REVIEW,
  },
  // SLOP_CALL
  {
    id: "vl-slop-call-1",
    tag: "SLOP_CALL",
    text: "Call someone's slop, or hold your token and your peace.",
    accessibleLabel: "Call one player or hold your token.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-slop-call-2",
    tag: "SLOP_CALL",
    text: "Feeling confident about someone else's downfall? Spend a token.",
    accessibleLabel: "Predict that another player will miss, or hold.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-slop-call-3",
    tag: "SLOP_CALL",
    text: "Two tokens, endless suspicion. Point one somewhere.",
    accessibleLabel: "You may spend one Call Slop token this round.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-slop-call-4",
    tag: "SLOP_CALL",
    text: "Bet on a friend to miss, or keep your hands clean this round.",
    accessibleLabel: "Choose a player to call, or hold.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-slop-call-5",
    tag: "SLOP_CALL",
    text: "Predict a wipeout. Correct calls pay well; wrong ones sting.",
    accessibleLabel: "Spend a token to call a player, or keep it.",
    review: APPROVED_REVIEW,
  },
  // ANSWER
  {
    id: "vl-answer-1",
    tag: "ANSWER",
    text: "Answer in private. Poker faces on.",
    accessibleLabel: "Choose and lock your answer.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-answer-2",
    tag: "ANSWER",
    text: "Four choices, one clock, zero help from the room.",
    accessibleLabel: "Select one of the four answers before time runs out.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-answer-3",
    tag: "ANSWER",
    text: "Lock it in. The quizmaster is not accepting excuses.",
    accessibleLabel: "Lock your answer to submit it.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-answer-4",
    tag: "ANSWER",
    text: "Pick one. The confident and the doomed look identical from here.",
    accessibleLabel: "Pick one answer and lock it in.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-answer-5",
    tag: "ANSWER",
    text: "Your answer is between you and the timer. Choose.",
    accessibleLabel: "Choose your answer privately before time runs out.",
    review: APPROVED_REVIEW,
  },
  // QUESTION_REVEAL
  {
    id: "vl-question-reveal-1",
    tag: "QUESTION_REVEAL",
    text: "Answers are in. Let's survey the damage.",
    accessibleLabel: "Revealing the question and correct answer.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-question-reveal-2",
    tag: "QUESTION_REVEAL",
    text: "Time to reveal who actually knew this one.",
    accessibleLabel: "Showing each player's result for this question.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-question-reveal-3",
    tag: "QUESTION_REVEAL",
    text: "The correct answer, plus everyone's brave guesses.",
    accessibleLabel: "The correct choice is now shown.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-question-reveal-4",
    tag: "QUESTION_REVEAL",
    text: "Here is the key. Hold your celebrations or condolences.",
    accessibleLabel: "The correct answer and results are revealed.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-question-reveal-5",
    tag: "QUESTION_REVEAL",
    text: "The truth arrives, and so do the results.",
    accessibleLabel: "Question results are shown.",
    review: APPROVED_REVIEW,
  },
  // ROUND_RESULTS
  {
    id: "vl-round-results-1",
    tag: "ROUND_RESULTS",
    text: "Points tallied, egos adjusted.",
    accessibleLabel: "Round scores are shown.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-round-results-2",
    tag: "ROUND_RESULTS",
    text: "Here is where the round left everyone.",
    accessibleLabel: "Updated scoreboard for this round.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-round-results-3",
    tag: "ROUND_RESULTS",
    text: "The scoreboard shifts. Someone looks pleased.",
    accessibleLabel: "Round results and totals.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-round-results-4",
    tag: "ROUND_RESULTS",
    text: "Round settled. The math is not up for negotiation.",
    accessibleLabel: "The round scoreboard is displayed.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-round-results-5",
    tag: "ROUND_RESULTS",
    text: "Fresh totals. Some points earned, some merely survived.",
    accessibleLabel: "Scores after this round.",
    review: APPROVED_REVIEW,
  },
  // FINAL_RESULTS
  {
    id: "vl-final-results-1",
    tag: "FINAL_RESULTS",
    text: "That is the game. Bragging rights are now official.",
    accessibleLabel: "Final standings.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-final-results-2",
    tag: "FINAL_RESULTS",
    text: "Final scores are locked. The quiz rests its case.",
    accessibleLabel: "The game is over; final standings are shown.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-final-results-3",
    tag: "FINAL_RESULTS",
    text: "Final standings declared, awards handed out, no refunds.",
    accessibleLabel: "Final standings and end-of-game awards.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-final-results-4",
    tag: "FINAL_RESULTS",
    text: "The scoreboard is final. Screenshots are strongly encouraged.",
    accessibleLabel: "Final standings are displayed.",
    review: APPROVED_REVIEW,
  },
  {
    id: "vl-final-results-5",
    tag: "FINAL_RESULTS",
    text: "Game over. Bragging rights secured; rematch demands pending.",
    accessibleLabel: "The game has ended; final standings are shown.",
    review: APPROVED_REVIEW,
  },
];

/** Every deterministic voice line carrying the given event tag, in bank order. */
export function getVoiceLinesForTag(tag: QuizslopVoiceEventTag): readonly QuizslopVoiceLine[] {
  return QUIZSLOP_VOICE_LINES.filter((line) => line.tag === tag);
}
