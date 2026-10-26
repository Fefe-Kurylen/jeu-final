-- Alliance (décision du 26 octobre 2026) : aide d'alliance (demandes, aides, points d'alliance), boutique d'alliance
-- (cosmétiques, plaque de nom, bannière), alliance entre alliances acceptée des deux côtés.

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "alliancePoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "banner" TEXT,
ADD COLUMN     "nameplate" TEXT,
ADD COLUMN     "shopCosmetics" JSONB;

-- CreateTable
CREATE TABLE "AllianceAllyRequest" (
    "id" TEXT NOT NULL,
    "fromAllianceId" TEXT NOT NULL,
    "toAllianceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceAllyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceHelpRequest" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helps" INTEGER NOT NULL DEFAULT 0,
    "maxHelps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "AllianceHelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllianceHelp" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "helperId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllianceHelp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AllianceAllyRequest_toAllianceId_idx" ON "AllianceAllyRequest"("toAllianceId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceAllyRequest_fromAllianceId_toAllianceId_key" ON "AllianceAllyRequest"("fromAllianceId", "toAllianceId");

-- CreateIndex
CREATE INDEX "AllianceHelpRequest_allianceId_closedAt_idx" ON "AllianceHelpRequest"("allianceId", "closedAt");

-- CreateIndex
CREATE INDEX "AllianceHelpRequest_playerId_kind_targetId_idx" ON "AllianceHelpRequest"("playerId", "kind", "targetId");

-- CreateIndex
CREATE INDEX "AllianceHelp_helperId_createdAt_idx" ON "AllianceHelp"("helperId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceHelp_requestId_helperId_key" ON "AllianceHelp"("requestId", "helperId");

-- AddForeignKey
ALTER TABLE "AllianceAllyRequest" ADD CONSTRAINT "AllianceAllyRequest_fromAllianceId_fkey" FOREIGN KEY ("fromAllianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceAllyRequest" ADD CONSTRAINT "AllianceAllyRequest_toAllianceId_fkey" FOREIGN KEY ("toAllianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpRequest" ADD CONSTRAINT "AllianceHelpRequest_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelpRequest" ADD CONSTRAINT "AllianceHelpRequest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelp" ADD CONSTRAINT "AllianceHelp_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AllianceHelpRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllianceHelp" ADD CONSTRAINT "AllianceHelp_helperId_fkey" FOREIGN KEY ("helperId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Une alliance déclarée d'un seul côté devient une proposition en attente : l'autre alliance l'accepte ou la refuse
INSERT INTO "AllianceAllyRequest" ("id", "fromAllianceId", "toAllianceId", "createdAt")
SELECT d."id", d."allianceId", d."targetAllianceId", d."changedAt"
FROM "AllianceDiplomacy" d
WHERE d."status" = 'ALLY'
  AND NOT EXISTS (SELECT 1 FROM "AllianceDiplomacy" r WHERE r."allianceId" = d."targetAllianceId" AND r."targetAllianceId" = d."allianceId" AND r."status" = 'ALLY')
ON CONFLICT DO NOTHING;
UPDATE "AllianceDiplomacy" d SET "status" = 'NEUTRAL'
WHERE d."status" = 'ALLY'
  AND NOT EXISTS (SELECT 1 FROM "AllianceDiplomacy" r WHERE r."allianceId" = d."targetAllianceId" AND r."targetAllianceId" = d."allianceId" AND r."status" = 'ALLY');
