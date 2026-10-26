-- Bastion d'alliance (décision du 26 octobre 2026) : un par alliance, convois de ressources, chantier, bonus, siège.

-- AlterTable
ALTER TABLE "Army" ADD COLUMN     "targetBastionId" TEXT;

-- CreateTable
CREATE TABLE "Bastion" (
    "id" TEXT NOT NULL,
    "allianceId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FUNDING',
    "wood" INTEGER NOT NULL DEFAULT 0,
    "stone" INTEGER NOT NULL DEFAULT 0,
    "iron" INTEGER NOT NULL DEFAULT 0,
    "food" INTEGER NOT NULL DEFAULT 0,
    "buildEndsAt" TIMESTAMP(3),
    "structure" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "structureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSieged" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "destroyedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bastion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bastion_allianceId_key" ON "Bastion"("allianceId");

-- CreateIndex
CREATE INDEX "Bastion_x_y_idx" ON "Bastion"("x", "y");

-- CreateIndex
CREATE INDEX "Army_targetBastionId_idx" ON "Army"("targetBastionId");

-- AddForeignKey
ALTER TABLE "Bastion" ADD CONSTRAINT "Bastion_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

