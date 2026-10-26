-- Espions dédiés (décision du 26 octobre 2026) : 2 par compte, débloqués par la Tour de guet, missions vers une ville ou un point.

-- CreateTable
CREATE TABLE "Spy" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "mission" TEXT,
    "fromCityId" TEXT,
    "fromX" INTEGER,
    "fromY" INTEGER,
    "targetX" INTEGER,
    "targetY" INTEGER,
    "targetCityId" TEXT,
    "targetNodeId" TEXT,
    "departedAt" TIMESTAMP(3),
    "arrivalAt" TIMESTAMP(3),
    "returnAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Spy_status_arrivalAt_idx" ON "Spy"("status", "arrivalAt");

-- CreateIndex
CREATE INDEX "Spy_status_returnAt_idx" ON "Spy"("status", "returnAt");

-- CreateIndex
CREATE UNIQUE INDEX "Spy_playerId_slot_key" ON "Spy"("playerId", "slot");

-- AddForeignKey
ALTER TABLE "Spy" ADD CONSTRAINT "Spy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

