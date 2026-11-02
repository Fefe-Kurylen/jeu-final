-- Mur du Bastion qui garde ses dégâts (décision du 2 novembre 2026, deuxième simulation de 200 jours, G2) : le mur n'est
-- plus remis à neuf à chaque assaut. "wallHp" = ses points de vie notés à "wallAt", l'instant du dernier dégât ; il se
-- répare peu à peu et redevient plein config.bastion.wallRepairHours (12 h) après ce dégât. NULL = mur plein.
-- Idempotent : l'instruction peut être rejouée.
ALTER TABLE "Bastion" ADD COLUMN IF NOT EXISTS "wallHp" DOUBLE PRECISION;
ALTER TABLE "Bastion" ADD COLUMN IF NOT EXISTS "wallAt" TIMESTAMP(3);
