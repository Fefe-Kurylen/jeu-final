-- Quêtes (décision du 26 octobre 2026) : compteurs d'actions par jour et au total, récompenses prises, tutoriel terminé.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "tutorialDone" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "QuestCounter" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestClaim" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "questKey" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestCounter_playerId_period_key_key" ON "QuestCounter"("playerId", "period", "key");

-- CreateIndex
CREATE INDEX "QuestClaim_playerId_idx" ON "QuestClaim"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestClaim_playerId_questKey_period_key" ON "QuestClaim"("playerId", "questKey", "period");

-- AddForeignKey
ALTER TABLE "QuestCounter" ADD CONSTRAINT "QuestCounter_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestClaim" ADD CONSTRAINT "QuestClaim_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

