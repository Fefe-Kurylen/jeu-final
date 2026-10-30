-- Invasions barbares (décision du 29 octobre 2026) : donjons d'alliance à 3 étages, chaque week-end
CREATE TABLE "Invasion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "hordes" INTEGER NOT NULL DEFAULT 0,
    "destroyed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Invasion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invasion_key_key" ON "Invasion"("key");
CREATE INDEX "Invasion_endedAt_idx" ON "Invasion"("endedAt");

CREATE TABLE "Horde" (
    "id" TEXT NOT NULL,
    "invasionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "floor" INTEGER NOT NULL DEFAULT 1,
    "floors" JSONB NOT NULL,
    "destroyedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Horde_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Horde_nodeId_key" ON "Horde"("nodeId");
CREATE INDEX "Horde_invasionId_idx" ON "Horde"("invasionId");

CREATE TABLE "HordeDamage" (
    "id" TEXT NOT NULL,
    "hordeId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "allianceId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "attacks" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "HordeDamage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HordeDamage_hordeId_playerId_key" ON "HordeDamage"("hordeId", "playerId");
CREATE INDEX "HordeDamage_playerId_idx" ON "HordeDamage"("playerId");
ALTER TABLE "HordeDamage" ADD CONSTRAINT "HordeDamage_hordeId_fkey" FOREIGN KEY ("hordeId") REFERENCES "Horde"("id") ON DELETE CASCADE ON UPDATE CASCADE;
