-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "votingPromptIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "votingRevealing" BOOLEAN NOT NULL DEFAULT false;
