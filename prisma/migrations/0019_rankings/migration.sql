-- Classements (décision du 27 octobre 2026) : points de combat, semaine, médailles
ALTER TABLE "PlayerStats" ADD COLUMN "attackPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerStats" ADD COLUMN "defensePoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlayerStats" ADD COLUMN "loot" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "PlayerStats_attackPoints_idx" ON "PlayerStats"("attackPoints");
CREATE INDEX "PlayerStats_defensePoints_idx" ON "PlayerStats"("defensePoints");
CREATE INDEX "PlayerStats_loot_idx" ON "PlayerStats"("loot");

CREATE TABLE "PlayerWeekStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "attackPoints" INTEGER NOT NULL DEFAULT 0,
    "defensePoints" INTEGER NOT NULL DEFAULT 0,
    "loot" INTEGER NOT NULL DEFAULT 0,
    "popStart" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PlayerWeekStats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlayerWeekStats_playerId_week_key" ON "PlayerWeekStats"("playerId", "week");
CREATE INDEX "PlayerWeekStats_week_idx" ON "PlayerWeekStats"("week");

CREATE TABLE "Medal" (
    "id" TEXT NOT NULL,
    "playerId" TEXT,
    "allianceId" TEXT,
    "week" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Medal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Medal_playerId_idx" ON "Medal"("playerId");
CREATE INDEX "Medal_allianceId_idx" ON "Medal"("allianceId");
CREATE INDEX "Medal_week_idx" ON "Medal"("week");

CREATE TABLE "RankingWeek" (
    "week" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankingWeek_pkey" PRIMARY KEY ("week")
);
