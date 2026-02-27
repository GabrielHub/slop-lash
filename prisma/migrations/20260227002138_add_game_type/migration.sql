-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('SLOPLASH', 'AI_CHAT_SHOWDOWN');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "gameType" "GameType" NOT NULL DEFAULT 'SLOPLASH';
