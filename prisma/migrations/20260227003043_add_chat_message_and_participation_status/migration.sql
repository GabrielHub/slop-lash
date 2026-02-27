-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('ACTIVE', 'DISCONNECTED');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "participationStatus" "ParticipationStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "roundNumber" INTEGER,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_gameId_createdAt_idx" ON "ChatMessage"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_gameId_roundNumber_idx" ON "ChatMessage"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "ChatMessage_playerId_idx" ON "ChatMessage"("playerId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
