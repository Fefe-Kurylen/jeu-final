-- Index de l'audit : objets du héros et membres d'alliance lus par clé étrangère
CREATE INDEX IF NOT EXISTS "HeroItem_heroId_idx" ON "HeroItem"("heroId");
CREATE INDEX IF NOT EXISTS "AllianceMember_allianceId_idx" ON "AllianceMember"("allianceId");

-- Purge horaire par date de création : index BRIN (minuscules, tables en ajout seul)
CREATE INDEX IF NOT EXISTS "BattleReport_createdAt_idx" ON "BattleReport" USING BRIN ("createdAt");
CREATE INDEX IF NOT EXISTS "SpyReport_createdAt_idx" ON "SpyReport" USING BRIN ("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification" USING BRIN ("createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent" USING BRIN ("createdAt");
