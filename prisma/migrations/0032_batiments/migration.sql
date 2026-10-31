-- Revue des bâtiments (décisions du 31 octobre 2026) ; idempotent : chaque instruction peut être rejouée. Le monde n'est
-- pas encore ouvert : rien n'est remboursé.

-- Bâtiment principal : niveau 20 au plus partout, capitale comprise (avant : 30). Les chantiers au-delà disparaissent.
DELETE FROM "BuildQueueItem" WHERE "buildingKey" = 'MAIN_HALL' AND "targetLevel" > 20;
UPDATE "CityBuilding" SET level = 20 WHERE key = 'MAIN_HALL' AND level > 20;

-- Mur d'une colonie (ou de la Ville Merveille) : niveau 15 au plus (WALL.effects.colonyMaxLevel) ; ses points de vie
-- suivent son niveau, dans la même proportion
DELETE FROM "BuildQueueItem" q USING "City" c
WHERE c.id = q."cityId" AND NOT c."isCapital" AND q."buildingKey" = 'WALL' AND q."targetLevel" > 15;
UPDATE "City" c SET "wallMaxHp" = ROUND(c."wallMaxHp" * 15.0 / w.level), "wallHp" = c."wallHp" * 15.0 / w.level
FROM "CityBuilding" w
WHERE w."cityId" = c.id AND w.key = 'WALL' AND w.level > 15 AND NOT c."isCapital";
UPDATE "CityBuilding" b SET level = 15
FROM "City" c
WHERE c.id = b."cityId" AND NOT c."isCapital" AND b.key = 'WALL' AND b.level > 15;

-- Place du marché et Comptoir de commerce réservés à la capitale : ceux des colonies (et leurs chantiers) disparaissent
DELETE FROM "BuildQueueItem" q USING "City" c
WHERE c.id = q."cityId" AND NOT c."isCapital" AND q."buildingKey" IN ('MARKET', 'TRADE_OFFICE');
DELETE FROM "CityBuilding" b USING "City" c
WHERE c.id = b."cityId" AND NOT c."isCapital" AND b.key IN ('MARKET', 'TRADE_OFFICE');

-- Emplacements de l'anneau (config.city.ringSlots) : capitale 1 à 18, colonie et Ville Merveille 1 à 12. Un bâtiment posé
-- au-delà (avec ses chantiers), ou le chantier d'un bâtiment qui n'existe pas encore, passe sur un emplacement libre sous
-- la limite : le k-ième déplacé d'une ville prend son k-ième emplacement libre. Le Mur (20), le Bâtiment principal (0) et
-- les champs (101-118) ne bougent pas.
WITH lim AS (
  SELECT id, CASE WHEN "isCapital" THEN 18 ELSE 12 END AS n FROM "City"
), placed AS (
  SELECT "cityId", key, slot FROM "CityBuilding"
  UNION
  SELECT "cityId", "buildingKey", slot FROM "BuildQueueItem"
), moving AS (
  SELECT p."cityId", p.key, p.slot, ROW_NUMBER() OVER (PARTITION BY p."cityId" ORDER BY p.slot, p.key) AS k
  FROM placed p JOIN lim ON lim.id = p."cityId"
  WHERE p.slot > lim.n AND p.slot < 20
), free AS (
  SELECT lim.id AS "cityId", s.slot, ROW_NUMBER() OVER (PARTITION BY lim.id ORDER BY s.slot) AS k
  FROM lim CROSS JOIN LATERAL generate_series(1, lim.n) AS s(slot)
  WHERE NOT EXISTS (SELECT 1 FROM placed p WHERE p."cityId" = lim.id AND p.slot = s.slot)
), moves AS (
  SELECT m."cityId", m.key, m.slot AS old, f.slot AS new
  FROM moving m JOIN free f ON f."cityId" = m."cityId" AND f.k = m.k
), built AS (
  UPDATE "CityBuilding" b SET slot = mv.new FROM moves mv
  WHERE b."cityId" = mv."cityId" AND b.key = mv.key AND b.slot = mv.old
  RETURNING b.id
)
UPDATE "BuildQueueItem" q SET slot = mv.new FROM moves mv
WHERE q."cityId" = mv."cityId" AND q."buildingKey" = mv.key AND q.slot = mv.old;

-- Marchands (Place du marché de la capitale) : toutes les livraisons du marché passent par eux, plus par les armées.
-- Les offres actives qui retenaient une armée sont annulées : marchandises rendues à leur ville, armée libérée.
ALTER TABLE "MarketOffer" ADD COLUMN IF NOT EXISTS "merchants" INTEGER NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'MarketOffer' AND column_name = 'armyId') THEN
    UPDATE "City" c SET wood = c.wood + o.wood, stone = c.stone + o.stone, iron = c.iron + o.iron, food = c.food + o.food
    FROM (SELECT "cityId",
            SUM(CASE WHEN "sellResource" = 'wood'  THEN "sellAmount" ELSE 0 END) AS wood,
            SUM(CASE WHEN "sellResource" = 'stone' THEN "sellAmount" ELSE 0 END) AS stone,
            SUM(CASE WHEN "sellResource" = 'iron'  THEN "sellAmount" ELSE 0 END) AS iron,
            SUM(CASE WHEN "sellResource" = 'food'  THEN "sellAmount" ELSE 0 END) AS food
          FROM "MarketOffer" WHERE status = 'ACTIVE' AND "armyId" IS NOT NULL GROUP BY "cityId") o
    WHERE c.id = o."cityId";
    UPDATE "MarketOffer" SET status = 'CANCELLED' WHERE status = 'ACTIVE' AND "armyId" IS NOT NULL;
    ALTER TABLE "MarketOffer" DROP COLUMN "armyId";
  END IF;
END $$;
UPDATE "Army" SET status = 'IDLE', "missionType" = NULL WHERE status = 'MARKET';

-- Marchands en route (TradeConvoy) : nature de la livraison, marchands occupés, livraison puis retour. Les convois des
-- routes déjà en chemin rentrent après autant de temps qu'à l'aller.
ALTER TABLE "TradeConvoy" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'ROUTE';
ALTER TABLE "TradeConvoy" ADD COLUMN IF NOT EXISTS "merchants" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TradeConvoy" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "TradeConvoy" ADD COLUMN IF NOT EXISTS "returnAt" TIMESTAMP(3);
UPDATE "TradeConvoy" SET "returnAt" = "arrivalAt" + ("arrivalAt" - "departedAt") WHERE "returnAt" IS NULL;
ALTER TABLE "TradeConvoy" ALTER COLUMN "returnAt" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "TradeConvoy_returnAt_idx" ON "TradeConvoy"("returnAt");
