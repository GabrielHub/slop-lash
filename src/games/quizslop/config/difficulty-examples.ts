/**
 * QuizSlop rejected boundary catalog: concrete examples of questions that must
 * NOT ship, one or more per rejection reason (see docs "Catalog and calibration
 * responsibilities" and the rejected-voice table under "Catalog and
 * generated-content standard"). These are prompt and regression guidance for
 * the generator and reviewers, not playable content.
 */
import type { QuizslopRejectedExample } from "../types";

export const QUIZSLOP_REJECTED_EXAMPLES: readonly QuizslopRejectedExample[] = [
  {
    id: "rej-too-easy-common-knowledge",
    tier: "EASY",
    reason: "TOO_EASY",
    text: "Which animal is commonly called 'man's best friend'? Choices: Dog, Cat, Horse, Rabbit.",
    whyItFails:
      "The answer is universal common knowledge, so it tests no subject expertise even at the Easy tier.",
  },
  {
    id: "rej-too-easy-mislabeled-insane",
    tier: "INSANE",
    reason: "TOO_EASY",
    text: "Insane tier: How many legs does a typical dog have? Choices: Four, Two, Six, Eight.",
    whyItFails:
      "Trivial content mislabeled as the hardest tier collapses the hidden difficulty ladder.",
  },
  {
    id: "rej-too-hard-obscure-sigillography",
    tier: "INSANE",
    reason: "TOO_HARD",
    text: "In which year does a genikos logothetes first appear in surviving Byzantine seal evidence? Choices: 681, 692, 700, 717.",
    whyItFails:
      "It demands hyper-specialist, hard-to-verify minutiae far beyond the Insane tier's fair-but-hard bar.",
  },
  {
    id: "rej-too-hard-mislabeled-hard",
    tier: "HARD",
    reason: "TOO_HARD",
    text: "Give the exact catalogue number of the third oboe part in a rarely performed 1723 cantata. Choices: BWV 63, BWV 64, BWV 65, BWV 66.",
    whyItFails:
      "Needlessly obscure trivia rather than fair enthusiast knowledge, so it misses the Hard calibration target.",
  },
  {
    id: "rej-ambiguous-superlative",
    tier: null,
    reason: "AMBIGUOUS",
    text: "Which is the best Beatles album? Choices: Abbey Road, Revolver, Rubber Soul, The White Album.",
    whyItFails:
      "It rests on a subjective superlative with several defensible answers, so no single key can be correct.",
  },
  {
    id: "rej-ambiguous-overlapping-choices",
    tier: "EASY",
    reason: "AMBIGUOUS",
    text: "Which of these is a citrus fruit? Choices: Orange, Lemon, Lime, Tangerine.",
    whyItFails:
      "All four choices are correct, leaving overlapping keys and no single defensible answer.",
  },
  {
    id: "rej-ambiguous-shifting-count",
    tier: "MEDIUM",
    reason: "AMBIGUOUS",
    text: "Which country has the most islands? Choices: Sweden, Finland, Norway, Canada.",
    whyItFails:
      "The count depends on the definition and source used, so multiple answers are defensible.",
  },
  {
    id: "rej-flat-tiramisu-stem",
    tier: "MEDIUM",
    reason: "FLAT",
    text: "Which cheese is traditionally used in tiramisu? Choices: Mascarpone, Ricotta, Parmesan, Provolone.",
    whyItFails:
      "Factually fine but supplies no authored comedy voice, exactly the dry stem the mode rejects.",
  },
  {
    id: "rej-flat-capital-stem",
    tier: "EASY",
    reason: "FLAT",
    text: "What is the capital of Japan? Choices: Tokyo, Kyoto, Osaka, Seoul.",
    whyItFails: "Correct and clear, but joke-free wording never earns the required comedy pass.",
  },
  {
    id: "rej-try-hard-chaos-cheese",
    tier: "MEDIUM",
    reason: "TRY_HARD",
    text: "Which unhinged chaos-cheese goblin absolutely yeets itself into tiramisu? Choices: Mascarpone, Ricotta, Parmesan, Provolone.",
    whyItFails:
      "Generic internet slang piles up with no specific observation, and reads as forced rather than funny.",
  },
  {
    id: "rej-try-hard-slang-pileup",
    tier: "EASY",
    reason: "TRY_HARD",
    text: "Which absolutely feral, no-cap, main-character cheese slaps hardest in tiramisu? Choices: Mascarpone, Ricotta, Parmesan, Provolone.",
    whyItFails: "Piled-on slang substitutes for a specific, observed joke about the subject.",
  },
  {
    id: "rej-repetitive-template",
    tier: null,
    reason: "REPETITIVE",
    text: "A four-question pack where every prompt is 'Which X spins like it forgot the oven is on?' with only the noun swapped.",
    whyItFails:
      "Reusing one joke template across the pack breaks the required device-diversity rule.",
  },
  {
    id: "rej-answer-leak-mascarpone",
    tier: "MEDIUM",
    reason: "ANSWER_LEAK",
    text: "Which creamy Italian cheese beginning with 'mascar-' belongs in tiramisu? Choices: Mascarpone, Ricotta, Parmesan, Provolone.",
    whyItFails: "The joke-shaped clue spells out the key, handing the answer to every reader.",
  },
  {
    id: "rej-answer-leak-jupiter",
    tier: "EASY",
    reason: "ANSWER_LEAK",
    text: "Which planet, whose name starts with 'Jupi-', is the largest in the Solar System? Choices: Jupiter, Saturn, Neptune, Uranus.",
    whyItFails: "The prompt reveals the answer's spelling before the player thinks.",
  },
  {
    id: "rej-mean-idiot",
    tier: "MEDIUM",
    reason: "MEAN",
    text: "Only an idiot misses this: which cheese goes in tiramisu? Choices: Mascarpone, Ricotta, Parmesan, Provolone.",
    whyItFails: "It targets the player's intelligence instead of roasting the subject.",
  },
  {
    id: "rej-mean-sit-this-out",
    tier: "EASY",
    reason: "MEAN",
    text: "If you don't know France's capital, maybe sit this one out. Choices: Paris, Lyon, Nice, Marseille.",
    whyItFails: "It belittles the player rather than making a joke about the topic.",
  },
];
