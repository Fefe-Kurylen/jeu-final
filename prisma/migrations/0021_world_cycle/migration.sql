-- Cycle du serveur (décision du 28 octobre 2026) : calendrier du monde, Merveille gardée par les Immortels, Panthéon
ALTER TABLE "WorldConfig" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WorldConfig" ADD COLUMN "sitesSpawnedAt" TIMESTAMP(3);
ALTER TABLE "WorldConfig" ADD COLUMN "plansSpawnedAt" TIMESTAMP(3);
ALTER TABLE "WorldConfig" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "WorldConfig" ADD COLUMN "winnerAllianceId" TEXT;
ALTER TABLE "WorldConfig" ADD COLUMN "winnerName" TEXT;

ALTER TABLE "City" ADD COLUMN "isWonder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "City" ADD COLUMN "wonderLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "City" ADD COLUMN "wonderBuildEndsAt" TIMESTAMP(3);
ALTER TABLE "City" ADD COLUMN "wonderWood" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "City" ADD COLUMN "wonderStone" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "City" ADD COLUMN "wonderIron" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "City" ADD COLUMN "wonderFood" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "City" ADD COLUMN "lastImmortalWave" TIMESTAMP(3);

ALTER TABLE "Account" ADD COLUMN "titles" JSONB;

CREATE TABLE "WonderPlan" (
    "id" TEXT NOT NULL,
    "holderId" TEXT,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WonderPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WonderPlan_holderId_idx" ON "WonderPlan"("holderId");

CREATE TABLE "HallOfFame" (
    "id" TEXT NOT NULL,
    "world" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HallOfFame_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HallOfFame_world_idx" ON "HallOfFame"("world");
CREATE INDEX "HallOfFame_accountId_idx" ON "HallOfFame"("accountId");
