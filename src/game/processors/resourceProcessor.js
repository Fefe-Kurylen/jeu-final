// ========== RESOURCE PRODUCTION & UPKEEP ==========

const prisma = require('../../config/database');
const { Prisma } = require('@prisma/client');
const config = require('../../config');
const { unitsData, buildingsData } = require('../../config/gamedata');
const { getProductionAtLevel } = require('../../utils/calculations');

// Table de production précalculée (clé, niveau 1-20) -> prod/h, envoyée une fois en VALUES SQL
let _prodTableSql = null;
function getProdTableSql() {
  if (_prodTableSql) return _prodTableSql;
  const rows = [];
  for (const key of ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM']) {
    for (let lvl = 1; lvl <= 25; lvl++) {
      rows.push(Prisma.sql`(${key}, ${lvl}, ${getProductionAtLevel(key, lvl, buildingsData)}::float)`);
    }
  }
  _prodTableSql = Prisma.join(rows);
  return _prodTableSql;
}

async function processResourceProduction(TICK_HOURS) {
  // 100% SQL : une seule requête pour toutes les villes, aucune lecture côté Node
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = LEAST(c.wood  + (COALESCE(p.w, 0) + 5)  * ${TICK_HOURS}, c."maxStorage"),
      stone = LEAST(c.stone + (COALESCE(p.s, 0) + 5)  * ${TICK_HOURS}, c."maxStorage"),
      iron  = LEAST(c.iron  + (COALESCE(p.i, 0) + 5)  * ${TICK_HOURS}, c."maxStorage"),
      food  = LEAST(c.food  + (COALESCE(p.f, 0) + 10) * ${TICK_HOURS}, c."maxFoodStorage")
    FROM (
      SELECT cb."cityId",
        SUM(CASE WHEN cb.key = 'LUMBER'    THEN pt.prod ELSE 0 END) AS w,
        SUM(CASE WHEN cb.key = 'QUARRY'    THEN pt.prod ELSE 0 END) AS s,
        SUM(CASE WHEN cb.key = 'IRON_MINE' THEN pt.prod ELSE 0 END) AS i,
        SUM(CASE WHEN cb.key = 'FARM'      THEN pt.prod ELSE 0 END) AS f
      FROM "CityBuilding" cb
      JOIN (VALUES ${getProdTableSql()}) AS pt(key, level, prod)
        ON pt.key = cb.key AND pt.level = cb.level
      GROUP BY cb."cityId"
    ) AS p
    WHERE c.id = p."cityId" AND c."isSieged" = false
  `;
  // Villes sans bâtiment de production : production de base uniquement
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = LEAST(c.wood  + 5  * ${TICK_HOURS}, c."maxStorage"),
      stone = LEAST(c.stone + 5  * ${TICK_HOURS}, c."maxStorage"),
      iron  = LEAST(c.iron  + 5  * ${TICK_HOURS}, c."maxStorage"),
      food  = LEAST(c.food  + 10 * ${TICK_HOURS}, c."maxFoodStorage")
    WHERE c."isSieged" = false AND NOT EXISTS (
      SELECT 1 FROM "CityBuilding" cb
      WHERE cb."cityId" = c.id AND cb.key IN ('LUMBER','QUARRY','IRON_MINE','FARM')
    )
  `;
}

// Table upkeep par unité (clé -> conso/h), envoyée une fois en VALUES SQL
let _upkeepTableSql = null;
function getUpkeepTableSql() {
  if (_upkeepTableSql) return _upkeepTableSql;
  const rows = unitsData.map(u => {
    const up = config.army.upkeepPerTier[u.tier] || config.army.upkeepPerTier.base;
    return Prisma.sql`(${u.key}, ${up}::float)`;
  });
  _upkeepTableSql = Prisma.join(rows);
  return _upkeepTableSql;
}

async function processUpkeep(TICK_HOURS) {
  // 1) Décrément de nourriture : une seule requête SQL pour toutes les villes
  await prisma.$executeRaw`
    UPDATE "City" AS c SET food = GREATEST(0, c.food - cons.total * ${TICK_HOURS})
    FROM (
      SELECT a."cityId", SUM(au.count * ut.upkeep) AS total
      FROM "Army" a
      JOIN "ArmyUnit" au ON au."armyId" = a.id
      JOIN (VALUES ${getUpkeepTableSql()}) AS ut(key, upkeep) ON ut.key = au."unitKey"
      WHERE a."cityId" IS NOT NULL
      GROUP BY a."cityId"
    ) AS cons
    WHERE c.id = cons."cityId" AND cons.total > 0
  `;

  // 2) Famine : traitée en 3 requêtes SQL fixes, quel que soit le nombre de villes affamées
  const starvedGroups = await prisma.$executeRaw`
    UPDATE "ArmyUnit" AS au
    SET count = au.count - CEIL(au.count * ${config.army.starvationLossRate})
    FROM "Army" a, "City" c
    WHERE au."armyId" = a.id AND a."cityId" = c.id AND c.food <= 0
  `;
  if (starvedGroups > 0) {
    const deleted = await prisma.armyUnit.deleteMany({ where: { count: { lte: 0 } } });
    console.log(`[STARVATION] ${starvedGroups} groupes d'unités affamés (${deleted.count} groupes anéantis)`);
  }
}

async function processResourceRegen(now, TICK_HOURS) {
  const regenCutoff = new Date(now.getTime() - config.tick.regenDelayMinutes * 60000);
  const regenResult = await prisma.$executeRaw`
    UPDATE "ResourceNode" SET amount = LEAST(amount + FLOOR("regenRate" / 2.0 * ${TICK_HOURS}), "maxAmount")
    WHERE amount < "maxAmount" AND "hasPlayerArmy" = false
      AND ("lastArmyDeparture" IS NULL OR "lastArmyDeparture" <= ${regenCutoff})
  `;
  if (regenResult > 0) console.log(`[REGEN] ${regenResult} resource nodes regenerated`);
}

module.exports = { processResourceProduction, processUpkeep, processResourceRegen };
