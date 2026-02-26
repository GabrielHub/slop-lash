-- Live Narrator: simplify TtsMode enum and drop ttsAudio column

-- First, update existing rows to use new enum values
UPDATE "Game" SET "ttsMode" = 'OFF' WHERE "ttsMode" = 'BROWSER_VOICE';
UPDATE "Game" SET "ttsMode" = 'OFF' WHERE "ttsMode" = 'AI_VOICE';

-- AlterEnum: OFF/AI_VOICE/BROWSER_VOICE → OFF/ON
BEGIN;
CREATE TYPE "TtsMode_new" AS ENUM ('OFF', 'ON');
ALTER TABLE "Game" ALTER COLUMN "ttsMode" DROP DEFAULT;
ALTER TABLE "Game" ALTER COLUMN "ttsMode" TYPE "TtsMode_new" USING ("ttsMode"::text::"TtsMode_new");
ALTER TYPE "TtsMode" RENAME TO "TtsMode_old";
ALTER TYPE "TtsMode_new" RENAME TO "TtsMode";
DROP TYPE "TtsMode_old";
ALTER TABLE "Game" ALTER COLUMN "ttsMode" SET DEFAULT 'OFF';
COMMIT;

-- Drop the per-prompt cached TTS audio column (no longer needed with Live API)
ALTER TABLE "Prompt" DROP COLUMN "ttsAudio";
