export const MATCHSLOP_POINTS_PER_WEIGHTED_VOTE = 25;
export const MATCHSLOP_WINNER_BONUS = 50;

export const MATCHSLOP_WRITING_SECONDS = 120;
export const MATCHSLOP_VOTING_SECONDS = 60;
export const MATCHSLOP_RESULTS_SECONDS = 20;

export function getMatchSlopTimerTotal(status: string): number | undefined {
  if (status === "WRITING") return MATCHSLOP_WRITING_SECONDS;
  if (status === "VOTING") return MATCHSLOP_VOTING_SECONDS;
  if (status === "ROUND_RESULTS") return MATCHSLOP_RESULTS_SECONDS;
  return undefined;
}

export const MATCHSLOP_PHOTO_PROMPT_ID = "__photo__";
export const MATCHSLOP_PHOTO_PROMPT_TEXT = "Their photo";
