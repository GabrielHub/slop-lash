export interface QuizslopTutorialStep {
  title: string;
  body: string;
}

/**
 * Host-paced guidance for the cooperative exam. `phase` stays structural so
 * the tutorial remains usable while the Convex phase union is code-generated.
 */
export function getQuizslopTutorialStep({ phase }: { phase: string }): QuizslopTutorialStep {
  switch (phase) {
    case "LOBBY_SETUP":
      return {
        title: "Read the exam rules",
        body: "Answer privately, explain aloud, then let a rotated Proxy file your official answer.",
      };
    case "SECTION_INTRO":
      return {
        title: "Check your private role",
        body: "Keep your role secret. The same Saboteur remains hidden for the entire exam.",
      };
    case "SCRATCH":
      return {
        title: "Answer your scratch question",
        body: "Choose privately. Scratch work tunes hidden difficulty; it does not set the class grade.",
      };
    case "PROXY_ANSWER":
      return {
        title: "Explain, then hand it over",
        body: "Candidates explain aloud. Proxies—or the fallback committee—file official answers.",
      };
    case "ORAL_DEFENSE":
      return {
        title: "Compare the receipts",
        body: "For a wrong filing, Candidate and Proxy explain the scratch and official answers aloud.",
      };
    case "SECTION_RESULTS":
      return {
        title: "Read the raw grade",
        body: "The pass line is 70%. Integrity adjustments stay sealed until the final hearing.",
      };
    case "PROCTOR_REVIEW_VOTE":
      return {
        title: "Suspend one Proxy",
        body: "Vote privately. A strict majority removes one player’s Proxy privileges next section.",
      };
    case "PROCTOR_REVIEW_RESULT":
      return {
        title: "Read the suspension notice",
        body: "A suspended player still answers and discusses; the class votes on their Proxy task.",
      };
    case "FINAL_ACCUSATION":
      return {
        title: "Name the Saboteur",
        body: "A correct strict majority erases all sabotage deductions before the final grade.",
      };
    case "FINAL_RESULTS":
      return {
        title: "Read the final transcript",
        body: "The hearing result unlocks the integrity adjustment. The group passes at 70% or better.",
      };
    default:
      return {
        title: "Follow the proctor",
        body: "This retired fixture phase will disappear when the cooperative exam starts.",
      };
  }
}
