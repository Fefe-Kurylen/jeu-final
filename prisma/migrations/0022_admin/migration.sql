-- Administration (décision du 29 octobre 2026) : rôles de l'équipe, sanctions, journal, réglages du monde
ALTER TABLE "Account" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'PLAYER';
ALTER TABLE "Account" ADD COLUMN "suspendedUntil" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "suspendReason" TEXT;
ALTER TABLE "Account" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "banReason" TEXT;

ALTER TABLE "WorldConfig" ADD COLUMN "registrationDays" INTEGER;
ALTER TABLE "WorldConfig" ADD COLUMN "wonderSitesDay" INTEGER;
ALTER TABLE "WorldConfig" ADD COLUMN "wonderPlansDay" INTEGER;
ALTER TABLE "WorldConfig" ADD COLUMN "registrationClosed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorldConfig" ADD COLUMN "resetRequestedAt" TIMESTAMP(3);
ALTER TABLE "WorldConfig" ADD COLUMN "resetRequestedBy" TEXT;

CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");
CREATE INDEX "AdminLog_targetId_idx" ON "AdminLog"("targetId");
