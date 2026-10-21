-- Hardening migration: cascades on everything a player owns, dead columns removed, fractional wall HP,
-- token versioning, activity marker, claimed arrivals, tick timestamp, missing indexes.
-- Generated with "prisma migrate diff" from the previous schema, plus the data fixes marked "-- Data:".
-- Every statement tolerates a database that already carries part of these changes (prisma db push drift).

-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT IF EXISTS "Player_accountId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerStats" DROP CONSTRAINT IF EXISTS "PlayerStats_playerId_fkey";

-- DropForeignKey
ALTER TABLE "City" DROP CONSTRAINT IF EXISTS "City_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Army" DROP CONSTRAINT IF EXISTS "Army_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Hero" DROP CONSTRAINT IF EXISTS "Hero_playerId_fkey";

-- DropForeignKey
ALTER TABLE "SpyReport" DROP CONSTRAINT IF EXISTS "SpyReport_playerId_fkey";

-- DropForeignKey
ALTER TABLE "MarketOffer" DROP CONSTRAINT IF EXISTS "MarketOffer_playerId_fkey";

-- DropForeignKey
ALTER TABLE "AllianceMember" DROP CONSTRAINT IF EXISTS "AllianceMember_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Expedition" DROP CONSTRAINT IF EXISTS "Expedition_playerId_fkey";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "City" ALTER COLUMN "wallHp" SET DEFAULT 1000,
ALTER COLUMN "wallHp" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CityBuilding" DROP COLUMN IF EXISTS "category",
DROP COLUMN IF EXISTS "prodPerHour";

-- AlterTable
ALTER TABLE "Army" DROP COLUMN IF EXISTS "arrivesAt",
DROP COLUMN IF EXISTS "harvestStartedAt",
DROP COLUMN IF EXISTS "mission",
DROP COLUMN IF EXISTS "playerId",
DROP COLUMN IF EXISTS "returnsAt",
ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Hero" DROP COLUMN IF EXISTS "freePoints",
DROP COLUMN IF EXISTS "ownerId";

-- AlterTable
ALTER TABLE "BattleReport" DROP COLUMN IF EXISTS "attackerLost",
DROP COLUMN IF EXISTS "defenderLost";

-- AlterTable
ALTER TABLE "SpyReport" DROP COLUMN IF EXISTS "ownerId";

-- Data: older offers only carried playerId; offers without a living seller cannot get a foreign key
UPDATE "MarketOffer" SET "sellerId" = "playerId" WHERE "sellerId" IS NULL AND "playerId" IS NOT NULL;
DELETE FROM "MarketOffer" m WHERE m."sellerId" IS NULL OR NOT EXISTS (SELECT 1 FROM "Player" p WHERE p.id = m."sellerId");

-- AlterTable
ALTER TABLE "MarketOffer" DROP COLUMN IF EXISTS "playerId",
ALTER COLUMN "sellerId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AllianceMember" DROP COLUMN IF EXISTS "ownerId";

-- AlterTable
ALTER TABLE "Expedition" DROP COLUMN IF EXISTS "ownerId",
DROP COLUMN IF EXISTS "rewards";

-- AlterTable
ALTER TABLE "TickLock" ADD COLUMN IF NOT EXISTS "lastTickAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Player_lastSeenAt_idx" ON "Player"("lastSeenAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Army_targetResourceId_idx" ON "Army"("targetResourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BattleReport_attackerId_defenderId_createdAt_idx" ON "BattleReport"("attackerId", "defenderId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SpyReport_targetPlayerId_idx" ON "SpyReport"("targetPlayerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketOffer_buyerId_idx" ON "MarketOffer"("buyerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Expedition_armyId_idx" ON "Expedition"("armyId");

-- AddForeignKey
ALTER TABLE "Player" DROP CONSTRAINT IF EXISTS "Player_accountId_fkey";
ALTER TABLE "Player" ADD CONSTRAINT "Player_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStats" DROP CONSTRAINT IF EXISTS "PlayerStats_playerId_fkey";
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" DROP CONSTRAINT IF EXISTS "City_playerId_fkey";
ALTER TABLE "City" ADD CONSTRAINT "City_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Army" DROP CONSTRAINT IF EXISTS "Army_ownerId_fkey";
ALTER TABLE "Army" ADD CONSTRAINT "Army_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hero" DROP CONSTRAINT IF EXISTS "Hero_playerId_fkey";
ALTER TABLE "Hero" ADD CONSTRAINT "Hero_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: wounded groups of cities that no longer exist
DELETE FROM "WoundedUnit" w WHERE NOT EXISTS (SELECT 1 FROM "City" c WHERE c.id = w."cityId");

-- AddForeignKey
ALTER TABLE "WoundedUnit" DROP CONSTRAINT IF EXISTS "WoundedUnit_cityId_fkey";
ALTER TABLE "WoundedUnit" ADD CONSTRAINT "WoundedUnit_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: report copies whose owner no longer exists
DELETE FROM "BattleReport" b WHERE b."playerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Player" p WHERE p.id = b."playerId");

-- AddForeignKey
ALTER TABLE "BattleReport" DROP CONSTRAINT IF EXISTS "BattleReport_playerId_fkey";
ALTER TABLE "BattleReport" ADD CONSTRAINT "BattleReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpyReport" DROP CONSTRAINT IF EXISTS "SpyReport_playerId_fkey";
ALTER TABLE "SpyReport" ADD CONSTRAINT "SpyReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOffer" DROP CONSTRAINT IF EXISTS "MarketOffer_sellerId_fkey";
ALTER TABLE "MarketOffer" ADD CONSTRAINT "MarketOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMember" DROP CONSTRAINT IF EXISTS "AllianceMember_playerId_fkey";
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" DROP CONSTRAINT IF EXISTS "Expedition_playerId_fkey";
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

