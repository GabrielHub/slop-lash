-- AlterTable
ALTER TABLE "Game"
ADD COLUMN "hostControlTokenHash" TEXT,
ADD COLUMN "hostControlLastSeen" TIMESTAMP(3);
