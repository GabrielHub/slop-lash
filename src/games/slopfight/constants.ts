// SlopFight timers, budgets and limits. Pure numbers: no imports, safe for the
// Convex backend, the forge prompts, the sim, the renderer and the phone UI.

// Seats: 2-4 humans; the house fills the bracket to four champions.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const CHAMPIONS = 4;

// Phase timers, in seconds.
export const BUILD_SECONDS = 90;
export const ROSTER_SECONDS = 20;
export const FACE_OFF_SECONDS = 15;
/** Face-off never settles early before this many seconds, so the notes read. */
export const FACE_OFF_MIN_SECONDS = 8;
export const RESULT_SECONDS = 6;
export const STANDINGS_SECONDS = 8;
export const UPGRADE_SECONDS = 30;
/** Foundry waits this long for an in-flight forge before it parks. */
export const FOUNDRY_WATCHDOG_SECONDS = 60;

// Fight clock, in milliseconds of sim time.
export const FIGHT_LIMIT_MS = 30_000;
/** House-versus-house fights are bets only and shorter. */
export const HOUSE_FIGHT_LIMIT_MS = 20_000;
/** After a tied timeout, the first hit wins inside this window. */
export const SUDDEN_DEATH_MS = 10_000;
/** Playback lead between the FIGHT phase start and the sim's t = 0. */
export const FIGHT_LEAD_MS = 1_500;
/** Time after the decisive moment for the ring-out drop or the winner pose. */
export const FIGHT_OUTRO_MS = 3_500;

// Champion sheet budgets, enforced in code by balanceChampion().
export const STAT_MIN = 1;
export const STAT_MAX = 5;
export const STAT_SUM = 9;
export const POWER_MIN = 1;
export const POWER_MAX = 5;
export const POWER_SUM = 9;
export const MOVE_COUNT = 3;
/** A champion's three moves must cover at least this many move types. */
export const MIN_MOVE_TYPES = 2;
export const TRAITS_MIN = 2;
export const TRAITS_MAX = 4;
export const PARTS_MAX = 40;
/** maxHealth = HEALTH_BASE + HEALTH_PER_HEFT * heft. */
export const HEALTH_BASE = 80;
export const HEALTH_PER_HEFT = 10;

// Sheet string limits (characters).
export const NAME_MAX = 24;
export const BIO_MAX = 120;
export const MOVE_NAME_MAX = 28;
export const PART_ID_MAX = 16;
export const NARRATION_LINE_MAX = 60;
export const REJECTION_TEXT_MAX = 80;
export const NOTE_REASON_MAX = 60;

// Matchup notes per fight (the model writes 2-4; code applies at most the first 4).
export const MATCHUP_NOTES_MIN = 2;
export const MATCHUP_NOTES_MAX = 4;

// Points.
export const WIN_POINTS = 200;
export const FINAL_WIN_POINTS = 400;
/** Owner bonus for winning by KO or ring-out. */
export const FINISH_BONUS_POINTS = 100;
export const BET_POINTS = 100;
export const FINAL_BET_POINTS = 200;

// Strokes: coalescing and size caps for live drawing.
/** A phone sends at most one stroke batch per this many milliseconds (4 Hz). */
export const STROKE_COALESCE_MS = 250;
export const STROKES_PER_BATCH = 8;
export const POINTS_PER_STROKE = 256;
export const STROKES_PER_DOODLE = 400;
/** Stroke coordinates are integers in a 0..STROKE_GRID square. */
export const STROKE_GRID = 1000;

// Text input limits (characters).
export const DESCRIBE_TEXT_MAX = 280;
export const UPGRADE_TEXT_MAX = 120;
