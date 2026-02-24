-- CreateEnum
CREATE TYPE "TtsMode" AS ENUM ('OFF', 'AI_VOICE', 'BROWSER_VOICE');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "ttsMode" "TtsMode" NOT NULL DEFAULT 'OFF';
