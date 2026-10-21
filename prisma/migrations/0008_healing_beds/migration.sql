-- Tente de soins : lits limités, blessés en file d attente
ALTER TABLE "WoundedUnit" ADD COLUMN "waiting" INTEGER NOT NULL DEFAULT 0;
