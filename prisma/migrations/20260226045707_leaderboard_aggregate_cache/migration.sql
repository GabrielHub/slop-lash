-- CreateTable
CREATE TABLE "LeaderboardAggregate" (
    "id" TEXT NOT NULL,
    "leaderboard" JSONB NOT NULL,
    "headToHead" JSONB NOT NULL,
    "bestResponses" JSONB NOT NULL,
    "modelUsage" JSONB NOT NULL,
    "stats" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardProcessedGame" (
    "gameId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardProcessedGame_pkey" PRIMARY KEY ("gameId")
);

-- CreateIndex
CREATE INDEX "Game_status_createdAt_idx" ON "Game"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GameModelUsage_modelId_idx" ON "GameModelUsage"("modelId");
