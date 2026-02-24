-- CreateTable
CREATE TABLE "GameModelUsage" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "GameModelUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameModelUsage_gameId_idx" ON "GameModelUsage"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameModelUsage_gameId_modelId_key" ON "GameModelUsage"("gameId", "modelId");

-- AddForeignKey
ALTER TABLE "GameModelUsage" ADD CONSTRAINT "GameModelUsage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
