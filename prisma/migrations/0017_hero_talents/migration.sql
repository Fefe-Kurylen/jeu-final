-- Héros (décision du 27 octobre 2026) : talents à 3 branches, chute au combat et résurrection au Domus
ALTER TABLE "Hero" ADD COLUMN "talents" JSONB;
ALTER TABLE "Hero" ADD COLUMN "talentResets" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Hero" ADD COLUMN "diedAt" TIMESTAMP(3);
ALTER TABLE "Hero" ADD COLUMN "reviveEndsAt" TIMESTAMP(3);
