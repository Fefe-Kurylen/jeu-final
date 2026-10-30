-- Marché (décision du 27 octobre 2026) : échanges livrés par armées de transport, offres de 48 h, routes commerciales
ALTER TABLE "MarketOffer" ADD COLUMN "armyId" TEXT;
ALTER TABLE "MarketOffer" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "MarketOffer" ADD COLUMN "buyerCityId" TEXT;
ALTER TABLE "MarketOffer" ADD COLUMN "acceptedAt" TIMESTAMP(3);
UPDATE "MarketOffer" SET "expiresAt" = "createdAt" + interval '48 hours' WHERE status = 'ACTIVE';
CREATE INDEX "MarketOffer_status_expiresAt_idx" ON "MarketOffer"("status", "expiresAt");

CREATE TABLE "TradeRoute" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fromCityId" TEXT NOT NULL,
    "toCityId" TEXT NOT NULL,
    "wood" BOOLEAN NOT NULL DEFAULT false,
    "stone" BOOLEAN NOT NULL DEFAULT false,
    "iron" BOOLEAN NOT NULL DEFAULT false,
    "food" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextSendAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeRoute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TradeRoute_active_nextSendAt_idx" ON "TradeRoute"("active", "nextSendAt");
CREATE INDEX "TradeRoute_playerId_idx" ON "TradeRoute"("playerId");
ALTER TABLE "TradeRoute" ADD CONSTRAINT "TradeRoute_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TradeConvoy" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "routeId" TEXT,
    "fromCityId" TEXT NOT NULL,
    "toCityId" TEXT NOT NULL,
    "wood" INTEGER NOT NULL DEFAULT 0,
    "stone" INTEGER NOT NULL DEFAULT 0,
    "iron" INTEGER NOT NULL DEFAULT 0,
    "food" INTEGER NOT NULL DEFAULT 0,
    "departedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrivalAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TradeConvoy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TradeConvoy_arrivalAt_idx" ON "TradeConvoy"("arrivalAt");
CREATE INDEX "TradeConvoy_playerId_idx" ON "TradeConvoy"("playerId");
ALTER TABLE "TradeConvoy" ADD CONSTRAINT "TradeConvoy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
