-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reaction_responseId_idx" ON "Reaction"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_responseId_playerId_emoji_key" ON "Reaction"("responseId", "playerId", "emoji");

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
