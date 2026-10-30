-- Rassemblement d'alliance aussi contre un Bastion ennemi (décision du 29 octobre 2026)
ALTER TABLE "Rally" ALTER COLUMN "targetNodeId" DROP NOT NULL;
ALTER TABLE "Rally" ADD COLUMN "targetBastionId" TEXT;
