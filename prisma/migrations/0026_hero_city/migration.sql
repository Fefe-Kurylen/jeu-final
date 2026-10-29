-- Héros joint à aucune armée : la ville où il attend, sans combattre (décision du 29 octobre 2026)
ALTER TABLE "Hero" ADD COLUMN "cityId" TEXT;
-- héros déjà joints : la ville de leur armée
UPDATE "Hero" h SET "cityId" = a."cityId" FROM "Army" a WHERE a."heroId" = h.id;
