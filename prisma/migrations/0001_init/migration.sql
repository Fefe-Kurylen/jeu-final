-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "faction" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "population" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "premiumUntil" TIMESTAMP(3),
    "cosmetics" JSONB,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "attacksWon" INTEGER NOT NULL DEFAULT 0,
    "defensesWon" INTEGER NOT NULL DEFAULT 0,
    "unitsKilled" INTEGER NOT NULL DEFAULT 0,
    "unitsLost" INTEGER NOT NULL DEFAULT 0,
    "raidsWon" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "isCapital" BOOLEAN NOT NULL DEFAULT false,
    "wood" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "stone" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "iron" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "food" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "maxStorage" INTEGER NOT NULL DEFAULT 1000,
    "maxFoodStorage" INTEGER NOT NULL DEFAULT 1000,
    "wallHp" INTEGER NOT NULL DEFAULT 1000,
    "wallMaxHp" INTEGER NOT NULL DEFAULT 1000,
    "isSieged" BOOLEAN NOT NULL DEFAULT false,
    "siegeStarted" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityBuilding" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL DEFAULT 'BASE',
    "prodPerHour" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CityBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildQueueItem" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "buildingKey" TEXT NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',

    CONSTRAINT "BuildQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruitQueueItem" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "buildingKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "RecruitQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Army" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "playerId" TEXT,
    "cityId" TEXT,
    "name" TEXT NOT NULL,
    "slot" INTEGER NOT NULL DEFAULT 0,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "heroId" TEXT,
    "isGarrison" BOOLEAN NOT NULL DEFAULT false,
    "targetX" INTEGER,
    "targetY" INTEGER,
    "targetCityId" TEXT,
    "targetResourceId" TEXT,
    "arrivesAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "returnsAt" TIMESTAMP(3),
    "mission" TEXT,
    "missionType" TEXT,
    "carryWood" INTEGER NOT NULL DEFAULT 0,
    "carryStone" INTEGER NOT NULL DEFAULT 0,
    "carryIron" INTEGER NOT NULL DEFAULT 0,
    "carryFood" INTEGER NOT NULL DEFAULT 0,
    "carryGold" INTEGER NOT NULL DEFAULT 0,
    "harvestStartedAt" TIMESTAMP(3),
    "harvestResourceType" TEXT,

    CONSTRAINT "Army_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArmyUnit" (
    "id" TEXT NOT NULL,
    "armyId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'base',
    "count" INTEGER NOT NULL,

    CONSTRAINT "ArmyUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hero" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "xpToNextLevel" INTEGER NOT NULL DEFAULT 100,
    "attack" INTEGER NOT NULL DEFAULT 5,
    "defense" INTEGER NOT NULL DEFAULT 5,
    "logistics" INTEGER NOT NULL DEFAULT 5,
    "speed" INTEGER NOT NULL DEFAULT 5,
    "atkPoints" INTEGER NOT NULL DEFAULT 0,
    "defPoints" INTEGER NOT NULL DEFAULT 0,
    "spdPoints" INTEGER NOT NULL DEFAULT 0,
    "logPoints" INTEGER NOT NULL DEFAULT 0,
    "statPoints" INTEGER NOT NULL DEFAULT 5,
    "freePoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Hero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroItem" (
    "id" TEXT NOT NULL,
    "heroId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "stats" JSONB,

    CONSTRAINT "HeroItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WoundedUnit" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "healsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WoundedUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleReport" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "attackerId" TEXT,
    "defenderId" TEXT,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "result" TEXT,
    "winner" TEXT,
    "attackerUnits" JSONB,
    "defenderUnits" JSONB,
    "attackerLosses" JSONB,
    "defenderLosses" JSONB,
    "attackerLost" JSONB,
    "defenderLost" JSONB,
    "loot" JSONB,
    "rounds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpyReport" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "ownerId" TEXT,
    "targetPlayerId" TEXT,
    "targetCityId" TEXT,
    "targetType" TEXT,
    "targetX" INTEGER NOT NULL,
    "targetY" INTEGER NOT NULL,
    "targetName" TEXT,
    "cityName" TEXT,
    "success" BOOLEAN NOT NULL,
    "buildings" JSONB,
    "armies" JSONB,
    "resources" JSONB,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceNode" (
    "id" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "resourceType" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL DEFAULT 1000,
    "maxAmount" INTEGER NOT NULL DEFAULT 1000,
    "regenRate" INTEGER NOT NULL DEFAULT 10,
    "lastRegen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "biome" TEXT NOT NULL DEFAULT 'forest',
    "hasDefenders" BOOLEAN NOT NULL DEFAULT true,
    "defenderPower" INTEGER NOT NULL DEFAULT 100,
    "defenderUnits" JSONB,
    "lastDefeat" TIMESTAMP(3),
    "respawnMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastArmyDeparture" TIMESTAMP(3),
    "hasPlayerArmy" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ResourceNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOffer" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "sellerId" TEXT,
    "buyerId" TEXT,
    "cityId" TEXT,
    "sellResource" TEXT NOT NULL,
    "sellAmount" INTEGER NOT NULL,
    "buyResource" TEXT NOT NULL,
    "buyAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alliance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "leaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceMember" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "ownerId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceDiplomacy" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "targetAllianceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceDiplomacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expedition" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "ownerId" TEXT,
    "armyId" TEXT,
    "difficulty" INTEGER NOT NULL,
    "enemyPower" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 1800,
    "lootTier" TEXT NOT NULL DEFAULT 'COMMON',
    "rewards" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "won" BOOLEAN,
    "xpGained" INTEGER,
    "lootGained" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expedition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TickLock" (
    "id" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TickLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceInvite" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "store" TEXT NOT NULL DEFAULT 'app_store',
    "productId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "event" TEXT NOT NULL,
    "props" JSONB,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Player_accountId_key" ON "Player"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_name_key" ON "Player"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStats_playerId_key" ON "PlayerStats"("playerId");

-- CreateIndex
CREATE INDEX "City_playerId_idx" ON "City"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "City_x_y_key" ON "City"("x", "y");

-- CreateIndex
CREATE INDEX "CityBuilding_cityId_key_idx" ON "CityBuilding"("cityId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CityBuilding_cityId_slot_key" ON "CityBuilding"("cityId", "slot");

-- CreateIndex
CREATE INDEX "BuildQueueItem_cityId_status_idx" ON "BuildQueueItem"("cityId", "status");

-- CreateIndex
CREATE INDEX "BuildQueueItem_status_endsAt_idx" ON "BuildQueueItem"("status", "endsAt");

-- CreateIndex
CREATE INDEX "RecruitQueueItem_cityId_idx" ON "RecruitQueueItem"("cityId");

-- CreateIndex
CREATE INDEX "RecruitQueueItem_status_endsAt_idx" ON "RecruitQueueItem"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Army_heroId_key" ON "Army"("heroId");

-- CreateIndex
CREATE INDEX "Army_ownerId_idx" ON "Army"("ownerId");

-- CreateIndex
CREATE INDEX "Army_ownerId_status_idx" ON "Army"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Army_cityId_idx" ON "Army"("cityId");

-- CreateIndex
CREATE INDEX "Army_status_arrivalAt_idx" ON "Army"("status", "arrivalAt");

-- CreateIndex
CREATE INDEX "Army_targetCityId_idx" ON "Army"("targetCityId");

-- CreateIndex
CREATE UNIQUE INDEX "ArmyUnit_armyId_unitKey_key" ON "ArmyUnit"("armyId", "unitKey");

-- CreateIndex
CREATE UNIQUE INDEX "Hero_playerId_key" ON "Hero"("playerId");

-- CreateIndex
CREATE INDEX "WoundedUnit_healsAt_idx" ON "WoundedUnit"("healsAt");

-- CreateIndex
CREATE UNIQUE INDEX "WoundedUnit_cityId_unitKey_key" ON "WoundedUnit"("cityId", "unitKey");

-- CreateIndex
CREATE INDEX "BattleReport_playerId_createdAt_idx" ON "BattleReport"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "SpyReport_playerId_createdAt_idx" ON "SpyReport"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "ResourceNode_hasDefenders_lastDefeat_idx" ON "ResourceNode"("hasDefenders", "lastDefeat");

-- CreateIndex
CREATE INDEX "ResourceNode_hasPlayerArmy_idx" ON "ResourceNode"("hasPlayerArmy");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceNode_x_y_key" ON "ResourceNode"("x", "y");

-- CreateIndex
CREATE INDEX "MarketOffer_status_createdAt_idx" ON "MarketOffer"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketOffer_sellerId_idx" ON "MarketOffer"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_name_key" ON "Alliance"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_tag_key" ON "Alliance"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceMember_playerId_key" ON "AllianceMember"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceDiplomacy_allianceId_targetAllianceId_key" ON "AllianceDiplomacy"("allianceId", "targetAllianceId");

-- CreateIndex
CREATE INDEX "Expedition_playerId_status_idx" ON "Expedition"("playerId", "status");

-- CreateIndex
CREATE INDEX "Expedition_status_endsAt_idx" ON "Expedition"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Expedition_status_expiresAt_idx" ON "Expedition"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AllianceInvite_playerId_idx" ON "AllianceInvite"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceInvite_allianceId_playerId_key" ON "AllianceInvite"("allianceId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_playerId_idx" ON "PushToken"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_transactionId_key" ON "Purchase"("transactionId");

-- CreateIndex
CREATE INDEX "Purchase_playerId_idx" ON "Purchase"("playerId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_event_createdAt_idx" ON "AnalyticsEvent"("event", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_playerId_createdAt_idx" ON "AnalyticsEvent"("playerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CityBuilding" ADD CONSTRAINT "CityBuilding_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildQueueItem" ADD CONSTRAINT "BuildQueueItem_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitQueueItem" ADD CONSTRAINT "RecruitQueueItem_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Army" ADD CONSTRAINT "Army_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Army" ADD CONSTRAINT "Army_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Army" ADD CONSTRAINT "Army_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "Hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArmyUnit" ADD CONSTRAINT "ArmyUnit_armyId_fkey" FOREIGN KEY ("armyId") REFERENCES "Army"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hero" ADD CONSTRAINT "Hero_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeroItem" ADD CONSTRAINT "HeroItem_heroId_fkey" FOREIGN KEY ("heroId") REFERENCES "Hero"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleReport" ADD CONSTRAINT "BattleReport_attackerId_fkey" FOREIGN KEY ("attackerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleReport" ADD CONSTRAINT "BattleReport_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpyReport" ADD CONSTRAINT "SpyReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOffer" ADD CONSTRAINT "MarketOffer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceMember" ADD CONSTRAINT "AllianceMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceDiplomacy" ADD CONSTRAINT "AllianceDiplomacy_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceDiplomacy" ADD CONSTRAINT "AllianceDiplomacy_targetAllianceId_fkey" FOREIGN KEY ("targetAllianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expedition" ADD CONSTRAINT "Expedition_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceInvite" ADD CONSTRAINT "AllianceInvite_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

