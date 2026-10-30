-- Famine façon Travian (décision du 28 octobre 2026) : alerte « grenier bientôt vide »
ALTER TABLE "City" ADD COLUMN "foodAlertAt" TIMESTAMP(3);
