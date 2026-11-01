-- Site de Merveille libéré : réservé 6 h à l'alliance qui a battu les Immortels (décision du 1er novembre 2026,
-- simulation de 200 jours, E6 ; config.world.wonderSiteReserveHours). L'alliance du vainqueur est notée sur le site au
-- moment de la victoire ; la réservation court depuis "lastDefeat". Idempotent : l'instruction peut être rejouée.
ALTER TABLE "ResourceNode" ADD COLUMN IF NOT EXISTS "reservedAllianceId" TEXT;
