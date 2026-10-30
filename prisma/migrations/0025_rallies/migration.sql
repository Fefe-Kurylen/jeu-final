-- Rassemblements d'alliance contre les donjons d'invasion (décision du 29 octobre 2026)
ALTER TABLE "Army" ADD COLUMN "rallyId" TEXT;
CREATE INDEX "Army_rallyId_idx" ON "Army"("rallyId");

CREATE TABLE "Rally" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "targetX" INTEGER NOT NULL,
    "targetY" INTEGER NOT NULL,
    "waitMinutes" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GATHERING',
    "launchAt" TIMESTAMP(3) NOT NULL,
    "arrivalAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rally_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Rally_status_launchAt_idx" ON "Rally"("status", "launchAt");
CREATE INDEX "Rally_allianceId_idx" ON "Rally"("allianceId");
