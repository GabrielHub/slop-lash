-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "nextGameCode" TEXT,
ADD COLUMN     "phaseDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PromptAssignment" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,

    CONSTRAINT "PromptAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromptAssignment_promptId_idx" ON "PromptAssignment"("promptId");

-- CreateIndex
CREATE INDEX "PromptAssignment_playerId_idx" ON "PromptAssignment"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptAssignment_promptId_playerId_key" ON "PromptAssignment"("promptId", "playerId");

-- AddForeignKey
ALTER TABLE "PromptAssignment" ADD CONSTRAINT "PromptAssignment_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptAssignment" ADD CONSTRAINT "PromptAssignment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
