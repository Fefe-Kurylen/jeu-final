-- Équilibrage du 30 octobre 2026 (idempotent : chaque instruction peut être rejouée)

-- Invasions : âge du monde noté au lancement (D7), × ageMult^((niveau − 1)/4) sur les étages et les ressources du trésor
ALTER TABLE "Invasion" ADD COLUMN IF NOT EXISTS "ageMult" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Rassemblements : nature de la cible (HORDE, WONDER, PLAN, BASTION), sites et plans de Merveille ouverts (D4)
ALTER TABLE "Rally" ADD COLUMN IF NOT EXISTS "targetKind" TEXT;

-- Héros (D9) : 100 XP pour le niveau 2, puis × 1,25 par niveau (× 1,5 avant) ; seuil recalculé au niveau actuel de
-- chaque héros, son XP gardée (au-delà du nouveau seuil, il monte au prochain gain d'XP)
WITH RECURSIVE chain(level, need) AS (
  SELECT 1, 100
  UNION ALL
  SELECT level + 1, FLOOR(need * 1.25)::int FROM chain WHERE level < 30
)
UPDATE "Hero" h SET "xpToNextLevel" = c.need
FROM chain c
WHERE c.level = h.level AND h."xpToNextLevel" <> c.need;

-- Index de l'audit : notifications non lues d'un joueur, fil d'un canal sans les auteurs bloqués, armées d'une case
CREATE INDEX IF NOT EXISTS "Notification_playerId_readAt_idx" ON "Notification"("playerId", "readAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_channel_createdAt_senderId_idx" ON "ChatMessage"("channel", "createdAt", "senderId");
DROP INDEX IF EXISTS "ChatMessage_channel_createdAt_idx";   -- couvert par le précédent
CREATE INDEX IF NOT EXISTS "Army_x_y_idx" ON "Army"("x", "y");
CREATE INDEX IF NOT EXISTS "Army_targetX_targetY_idx" ON "Army"("targetX", "targetY");
