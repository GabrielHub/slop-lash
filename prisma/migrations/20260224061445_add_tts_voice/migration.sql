-- CreateEnum
CREATE TYPE "TtsVoice" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "ttsVoice" "TtsVoice" NOT NULL DEFAULT 'MALE';
