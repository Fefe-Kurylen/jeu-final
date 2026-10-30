-- Rôle des colonies (décisions du 30 octobre 2026) ; idempotent : chaque instruction peut être rejouée. Le monde n'est
-- pas encore ouvert : rien n'est remboursé.

-- Alertes d'aide au suivi, au plus une par ville et par délai : « File de construction vide » et « dépôt plein dans 1 h »
ALTER TABLE "City" ADD COLUMN IF NOT EXISTS "idleAlertAt" TIMESTAMP(3);
ALTER TABLE "City" ADD COLUMN IF NOT EXISTS "storageAlertAt" TIMESTAMP(3);

-- Mur sur l'enceinte : sa place fixe est l'emplacement 20 (config.city.wallSlot), hors de l'anneau 1-19 et des champs
-- 101-118 ; l'emplacement qu'il occupait dans l'anneau se libère.
-- 1) un autre bâtiment posé sur l'emplacement 20 (cas d'erreur ancien) rejoint le premier emplacement libre de l'anneau
UPDATE "CityBuilding" b SET slot = f.slot
FROM (
  SELECT o.id, (SELECT MIN(s) FROM generate_series(1, 19) s
    WHERE NOT EXISTS (SELECT 1 FROM "CityBuilding" x WHERE x."cityId" = o."cityId" AND x.slot = s)) AS slot
  FROM "CityBuilding" o WHERE o.slot = 20 AND o.key <> 'WALL'
) f
WHERE b.id = f.id AND f.slot IS NOT NULL;
-- 2) le Mur de chaque ville (le plus haut s'il y en avait deux) passe sur l'emplacement 20
UPDATE "CityBuilding" b SET slot = 20
WHERE b.key = 'WALL' AND b.slot <> 20
  AND b.id = (SELECT w.id FROM "CityBuilding" w WHERE w."cityId" = b."cityId" AND w.key = 'WALL' ORDER BY w.level DESC, w.id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "CityBuilding" o WHERE o."cityId" = b."cityId" AND o.slot = 20);
-- 3) les chantiers de Mur en file aussi
UPDATE "BuildQueueItem" SET slot = 20 WHERE "buildingKey" = 'WALL' AND slot <> 20;

-- Académie et Tente de soins réservées à la capitale (migration 0030) : ce qui restait en cours dans une colonie est
-- retiré, sans remboursement. Les recherches lancées depuis une colonie disparaissent (la suivante du joueur démarre au
-- tick) ; les soins en cours dans une colonie s'arrêtent : ses blessés au lit repassent en attente d'un soin, qu'on
-- relance depuis la tente de la capitale.
DELETE FROM "ResearchQueueItem" q USING "City" c WHERE c.id = q."cityId" AND NOT c."isCapital";
UPDATE "WoundedUnit" w SET waiting = w.waiting + w.count, count = 0, "healsAt" = '9999-01-01 00:00:00'
FROM "City" c
WHERE c.id = w."cityId" AND NOT c."isCapital" AND w.count > 0;
