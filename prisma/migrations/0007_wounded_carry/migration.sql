-- Blessés qui rentrent avec leur armée (déposés à la Tente de soins au retour)
ALTER TABLE "Army" ADD COLUMN "woundedCarry" JSONB NOT NULL DEFAULT '[]';
