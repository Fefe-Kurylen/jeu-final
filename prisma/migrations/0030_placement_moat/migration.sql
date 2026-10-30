-- Placement des bâtiments et Douves (décision du 30 octobre 2026, rapport économie) ; idempotent : chaque instruction
-- peut être rejouée. Le monde n'est pas encore ouvert : rien n'est remboursé.

-- Douves supprimées du jeu : bâtiments et chantiers en file
DELETE FROM "BuildQueueItem" WHERE "buildingKey" = 'MOAT';
DELETE FROM "CityBuilding" WHERE key = 'MOAT';

-- Bâtiments « capitale seulement » (data/buildings.json effects.capitalOnly) hors d'une capitale (colonies, Ville Merveille)
DELETE FROM "BuildQueueItem" q USING "City" c
WHERE c.id = q."cityId" AND NOT c."isCapital" AND q."buildingKey" IN ('RALLY_POINT', 'ACADEMY', 'HEALING_TENT', 'WATCHTOWER', 'BARRACKS', 'STABLE', 'WORKSHOP', 'FORGE', 'EMBASSY', 'TREASURE_CHAMBER', 'HERO_MANSION', 'RESIDENCE', 'ROMAN_THERMAE', 'GALLIC_BREWERY', 'GREEK_TEMPLE', 'EGYPTIAN_IRRIGATION', 'HUN_WAR_TENT', 'SULTAN_DESERT_OUTPOST');
DELETE FROM "CityBuilding" b USING "City" c
WHERE c.id = b."cityId" AND NOT c."isCapital" AND b.key IN ('RALLY_POINT', 'ACADEMY', 'HEALING_TENT', 'WATCHTOWER', 'BARRACKS', 'STABLE', 'WORKSHOP', 'FORGE', 'EMBASSY', 'TREASURE_CHAMBER', 'HERO_MANSION', 'RESIDENCE', 'ROMAN_THERMAE', 'GALLIC_BREWERY', 'GREEK_TEMPLE', 'EGYPTIAN_IRRIGATION', 'HUN_WAR_TENT', 'SULTAN_DESERT_OUTPOST');

-- Bâtiments « colonies seulement » (effects.notInCapital) dans une capitale
DELETE FROM "BuildQueueItem" q USING "City" c
WHERE c.id = q."cityId" AND c."isCapital" AND q."buildingKey" IN ('MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'TRADE_OFFICE', 'GREAT_WAREHOUSE', 'GREAT_SILO', 'GREAT_BARRACKS', 'GREAT_STABLE');
DELETE FROM "CityBuilding" b USING "City" c
WHERE c.id = b."cityId" AND c."isCapital" AND b.key IN ('MILL', 'BAKERY', 'SAWMILL', 'STONEMASON', 'FOUNDRY', 'TRADE_OFFICE', 'GREAT_WAREHOUSE', 'GREAT_SILO', 'GREAT_BARRACKS', 'GREAT_STABLE');

-- Plafonds des capitales qui ont perdu un Grand dépôt ou un Grand silo, comme utils/calculations.js cityStorageCaps :
-- somme des dépôts (des silos), jamais sous 1 000 ; niveau L : L1 × (L20 / L1)^((L − 1) / 19), L20 dès le niveau 20.
-- Un stock au-dessus du nouveau plafond est gardé (la production s'arrête). Le démarrage du serveur resynchronise aussi
-- les plafonds (buildProcessor.syncAllCityStorage).
WITH caps AS (
  SELECT c.id,
    GREATEST(1000, COALESCE(SUM(lvl.cap) FILTER (WHERE b.key = 'WAREHOUSE'), 0))::int AS storage,
    GREATEST(1000, COALESCE(SUM(lvl.cap) FILTER (WHERE b.key = 'SILO'), 0))::int AS food
  FROM "City" c
  LEFT JOIN "CityBuilding" b ON b."cityId" = c.id AND b.key IN ('WAREHOUSE', 'SILO')
  LEFT JOIN LATERAL (SELECT CASE WHEN b.level >= 20 THEN 160000 WHEN b.level <= 0 THEN 0
    ELSE ROUND(1200 * POWER(160000.0 / 1200, (b.level - 1) / 19.0)) END AS cap) lvl ON true
  WHERE c."isCapital"
  GROUP BY c.id
)
UPDATE "City" c SET "maxStorage" = caps.storage, "maxFoodStorage" = caps.food
FROM caps
WHERE caps.id = c.id AND (c."maxStorage" <> caps.storage OR c."maxFoodStorage" <> caps.food);

-- Invasions : avant-poste du niveau 1 d'après la puissance médiane des joueurs actifs (recommandation 9) ; nul pour les
-- invasions d'avant (formule de l'âge du monde)
ALTER TABLE "Invasion" ADD COLUMN IF NOT EXISTS "basePower" DOUBLE PRECISION;
