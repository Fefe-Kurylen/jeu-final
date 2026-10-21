-- CreateTable
CREATE TABLE "PlayerTechnology" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "techKey" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerTechnology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchQueueItem" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "techKey" TEXT NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "cost" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "ResearchQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTechnology_playerId_techKey_key" ON "PlayerTechnology"("playerId", "techKey");

-- CreateIndex
CREATE INDEX "ResearchQueueItem_playerId_status_idx" ON "ResearchQueueItem"("playerId", "status");

-- CreateIndex
CREATE INDEX "ResearchQueueItem_status_endsAt_idx" ON "ResearchQueueItem"("status", "endsAt");

-- AddForeignKey
ALTER TABLE "PlayerTechnology" ADD CONSTRAINT "PlayerTechnology_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQueueItem" ADD CONSTRAINT "ResearchQueueItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchQueueItem" ADD CONSTRAINT "ResearchQueueItem_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

