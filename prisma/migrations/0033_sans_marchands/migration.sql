-- Plus de marchands ni de routes commerciales entre ses villes (décision du 31 octobre 2026, rapport de vérification) :
-- le stock du joueur est commun, et les échanges entre joueurs sont de nouveau portés par des armées. Idempotent : chaque
-- instruction peut être rejouée.

-- Offres : l'armée du vendeur est de nouveau réservée avec les marchandises (colonne armyId). Les offres actives sans armée
-- (celles des marchands) sont annulées : marchandises rendues à leur ville, jusqu'à son plafond, comme le retrait d'une
-- offre (creditCity : jamais un stock qui baisse, jamais au-dessus du dépôt ou du silo).
ALTER TABLE "MarketOffer" ADD COLUMN IF NOT EXISTS "armyId" TEXT;
UPDATE "City" c SET
  wood  = GREATEST(c.wood,  LEAST(c.wood  + o.wood,  c."maxStorage")),
  stone = GREATEST(c.stone, LEAST(c.stone + o.stone, c."maxStorage")),
  iron  = GREATEST(c.iron,  LEAST(c.iron  + o.iron,  c."maxStorage")),
  food  = GREATEST(c.food,  LEAST(c.food  + o.food,  c."maxFoodStorage"))
FROM (SELECT "cityId",
        SUM(CASE WHEN "sellResource" = 'wood'  THEN "sellAmount" ELSE 0 END) AS wood,
        SUM(CASE WHEN "sellResource" = 'stone' THEN "sellAmount" ELSE 0 END) AS stone,
        SUM(CASE WHEN "sellResource" = 'iron'  THEN "sellAmount" ELSE 0 END) AS iron,
        SUM(CASE WHEN "sellResource" = 'food'  THEN "sellAmount" ELSE 0 END) AS food
      FROM "MarketOffer" WHERE status = 'ACTIVE' AND "armyId" IS NULL GROUP BY "cityId") o
WHERE c.id = o."cityId";
UPDATE "MarketOffer" SET status = 'CANCELLED' WHERE status = 'ACTIVE' AND "armyId" IS NULL;
ALTER TABLE "MarketOffer" DROP COLUMN IF EXISTS "merchants";

-- Une armée n'attend au marché (statut MARKET) qu'avec une offre active : les autres sont libérées
UPDATE "Army" SET status = 'IDLE', "missionType" = NULL
WHERE status = 'MARKET' AND id NOT IN (SELECT "armyId" FROM "MarketOffer" WHERE status = 'ACTIVE' AND "armyId" IS NOT NULL);

-- Marchands en route : leur chargement revient à leur ville de départ (la capitale si elle n'est plus au joueur), jusqu'à
-- son plafond comme ci-dessus, puis la table disparaît ; les routes commerciales aussi, avec la cadence de leurs envois
DO $$
BEGIN
  IF to_regclass('"TradeConvoy"') IS NOT NULL THEN
    UPDATE "City" c SET
      wood  = GREATEST(c.wood,  LEAST(c.wood  + t.wood,  c."maxStorage")),
      stone = GREATEST(c.stone, LEAST(c.stone + t.stone, c."maxStorage")),
      iron  = GREATEST(c.iron,  LEAST(c.iron  + t.iron,  c."maxStorage")),
      food  = GREATEST(c.food,  LEAST(c.food  + t.food,  c."maxFoodStorage"))
    FROM (SELECT COALESCE(src.id, cap.id) AS "cityId", SUM(v.wood) AS wood, SUM(v.stone) AS stone, SUM(v.iron) AS iron, SUM(v.food) AS food
          FROM "TradeConvoy" v
          LEFT JOIN "City" src ON src.id = v."fromCityId" AND src."playerId" = v."playerId"
          LEFT JOIN "City" cap ON cap."playerId" = v."playerId" AND cap."isCapital"
          GROUP BY COALESCE(src.id, cap.id)) t
    WHERE c.id = t."cityId";
    DROP TABLE "TradeConvoy";
  END IF;
END $$;
DROP TABLE IF EXISTS "TradeRoute";
DELETE FROM "RateLimitBucket" WHERE key LIKE 'route:%';
