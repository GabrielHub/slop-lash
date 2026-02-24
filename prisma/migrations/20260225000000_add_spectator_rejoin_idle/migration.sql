-- AlterEnum
ALTER TYPE "PlayerType" ADD VALUE 'SPECTATOR';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "idleRounds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejoinToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Player_gameId_rejoinToken_key" ON "Player"("gameId", "rejoinToken");
