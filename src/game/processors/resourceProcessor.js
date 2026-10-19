// ========== RESOURCE PRODUCTION, UPKEEP, REGENERATION ==========

const prisma = require('../../config/database');
const { Prisma } = require('@prisma/client');
const config = require('../../config');
const { unitsData, buildingsData } = require('../../config/gamedata');
const { getProductionAtLevel } = require('../../utils/calculations');
const fx = require('../../utils/buildingEffects');
const T = require('../../utils/techEffects');
// (techKey, pctPerLevel) VALUES table for an effect; a harmless row when no technology carries it
const techTableSql = (effect) => { const keys = T.sqlKeys(effect); return Prisma.join((keys.length ? keys : [['__none__', 0]]).map(([k, pct]) => Prisma.sql`(${k}, ${pct}::float)`)); };

// Table de production précalculée (clé, niveau 1-25) -> prod/h, envoyée une fois en VALUES SQL
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

// Production bonus buildings (buildings.json effects: *ProdBonusPctL1 = % per level)
const bonusPct = (key, effect) => Number(buildingsData.find(b => b.key === key)?.effects?.[effect]) || 5;
const BONUS = {
  wood: { keys: ['SAWMILL'], pct: bonusPct('SAWMILL', 'woodProdBonusPctL1') },
  stone: { keys: ['STONEMASON'], pct: bonusPct('STONEMASON', 'stoneProdBonusPctL1') },
  iron: { keys: ['FOUNDRY'], pct: bonusPct('FOUNDRY', 'ironProdBonusPctL1') },
  food: { keys: ['MILL', 'BAKERY'], pct: bonusPct('MILL', 'foodProdBonusPctL1') }
};

// Bonus de production de l'abonnement « Plus » (vérifié côté serveur)
const PREMIUM_BONUS = config.purchases.perks.productionBonus;

async function processResourceProduction(TICK_HOURS) {
  // 100% SQL : une seule requête pour toutes les villes (base 5/5/5/10 + champs × bonus), aucune lecture côté Node.
  // Multiplicateurs par ville : abonnement Plus, et bonus global de production des bâtiments (Irrigation égyptienne)
  const [globalKey, globalPct] = fx.productionBonusKeys()[0];
  const prodTechTable = techTableSql('productionBonusPct');   // Agronomie : +1 %/niveau sur tous les champs
  const colonyMult = 1 + fx.secondaryCityBonusPct() / 100;   // GDD: a secondary city produces +20 %
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = GREATEST(c.wood, LEAST(c.wood  + (COALESCE(p.w, 0) * (1 + COALESCE(p.wb, 0) / 100.0) + 5)  * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END), c."maxStorage")),
      stone = GREATEST(c.stone, LEAST(c.stone + (COALESCE(p.s, 0) * (1 + COALESCE(p.sb, 0) / 100.0) + 5)  * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END), c."maxStorage")),
      iron  = GREATEST(c.iron, LEAST(c.iron  + (COALESCE(p.i, 0) * (1 + COALESCE(p.ib, 0) / 100.0) + 5)  * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END), c."maxStorage")),
      food  = GREATEST(c.food, LEAST(c.food  + (COALESCE(p.f, 0) * (1 + COALESCE(p.fb, 0) / 100.0) + 10) * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END), c."maxFoodStorage"))
    FROM (
      SELECT cb."cityId",
        SUM(CASE WHEN cb.key = 'LUMBER'    THEN pt.prod ELSE 0 END) AS w,
        SUM(CASE WHEN cb.key = 'QUARRY'    THEN pt.prod ELSE 0 END) AS s,
        SUM(CASE WHEN cb.key = 'IRON_MINE' THEN pt.prod ELSE 0 END) AS i,
        SUM(CASE WHEN cb.key = 'FARM'      THEN pt.prod ELSE 0 END) AS f,
        SUM(CASE WHEN cb.key = ANY(${BONUS.wood.keys})  THEN cb.level * ${BONUS.wood.pct}  ELSE 0 END) AS wb,
        SUM(CASE WHEN cb.key = ANY(${BONUS.stone.keys}) THEN cb.level * ${BONUS.stone.pct} ELSE 0 END) AS sb,
        SUM(CASE WHEN cb.key = ANY(${BONUS.iron.keys})  THEN cb.level * ${BONUS.iron.pct}  ELSE 0 END) AS ib,
        SUM(CASE WHEN cb.key = ANY(${BONUS.food.keys})  THEN cb.level * ${BONUS.food.pct}  ELSE 0 END) AS fb,
        SUM(CASE WHEN cb.key = ${globalKey} THEN cb.level * ${globalPct} ELSE 0 END) AS gb,
        MAX(CASE WHEN pl."premiumUntil" > ${new Date()} THEN 1 ELSE 0 END) AS prem
      FROM "CityBuilding" cb
      JOIN "City" ci ON ci.id = cb."cityId"
      LEFT JOIN "Player" pl ON pl.id = ci."playerId"
      LEFT JOIN (VALUES ${getProdTableSql()}) AS pt(key, level, prod)
        ON pt.key = cb.key AND pt.level = cb.level
      GROUP BY cb."cityId"
    ) AS p
    LEFT JOIN (
      SELECT ci.id AS "cityId", SUM(pt.level * tk.pct) AS pct
      FROM "City" ci JOIN "PlayerTechnology" pt ON pt."playerId" = ci."playerId"
      JOIN (VALUES ${prodTechTable}) AS tk(key, pct) ON tk.key = pt."techKey"
      GROUP BY ci.id
    ) AS tp ON tp."cityId" = p."cityId"
    WHERE c.id = p."cityId" AND c."isSieged" = false
  `;
  // Villes sans aucun bâtiment : production de base uniquement
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = GREATEST(c.wood, LEAST(c.wood  + 5  * ${TICK_HOURS}, c."maxStorage")),
      stone = GREATEST(c.stone, LEAST(c.stone + 5  * ${TICK_HOURS}, c."maxStorage")),
      iron  = GREATEST(c.iron, LEAST(c.iron  + 5  * ${TICK_HOURS}, c."maxStorage")),
      food  = GREATEST(c.food, LEAST(c.food  + 10 * ${TICK_HOURS}, c."maxFoodStorage"))
    WHERE c."isSieged" = false AND NOT EXISTS (SELECT 1 FROM "CityBuilding" cb WHERE cb."cityId" = c.id)
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

let lastStarvationAt = 0;

async function processUpkeep(TICK_HOURS, now = new Date()) {
  // 1) Décrément de nourriture : une seule requête SQL pour toutes les villes, réduction d'entretien des
  //    bâtiments de faction (Tente de guerre hun, Avant-poste du désert) comprise
  const upkeepKeys = fx.upkeepReductionKeys();
  const reductionTable = Prisma.join(upkeepKeys.map(([k, pct]) => Prisma.sql`(${k}, ${pct}::float)`));
  const upkeepTechTable = techTableSql('upkeepReductionPct');   // Intendance : −1 %/niveau, même plafond que les bâtiments
  // Siège (GDD foodUpkeepModifierPct) : l'armée qui assiège consomme plus, la ville assiégée et ses armées moins
  const besiegerMult = 1 + config.combat.siege.upkeepAttackerPct / 100, besiegedMult = 1 + config.combat.siege.upkeepDefenderPct / 100;
  await prisma.$executeRaw`
    UPDATE "City" AS c SET food = GREATEST(0, c.food - cons.total * (1 - LEAST(50, COALESCE(red.pct, 0) + COALESCE(tech.pct, 0)) / 100.0) * ${TICK_HOURS})
    FROM (
      SELECT a."cityId", SUM(au.count * ut.upkeep * CASE WHEN a.status = 'BESIEGING' THEN ${besiegerMult}::float WHEN hc."isSieged" THEN ${besiegedMult}::float ELSE 1 END) AS total
      FROM "Army" a
      JOIN "City" hc ON hc.id = a."cityId"
      JOIN "ArmyUnit" au ON au."armyId" = a.id
      JOIN (VALUES ${getUpkeepTableSql()}) AS ut(key, upkeep) ON ut.key = au."unitKey"
      WHERE a."cityId" IS NOT NULL
      GROUP BY a."cityId"
    ) AS cons
    LEFT JOIN (
      SELECT cb."cityId", SUM(cb.level * r.pct) AS pct
      FROM "CityBuilding" cb JOIN (VALUES ${reductionTable}) AS r(key, pct) ON r.key = cb.key
      GROUP BY cb."cityId"
    ) AS red ON red."cityId" = cons."cityId"
    LEFT JOIN (
      SELECT ci.id AS "cityId", SUM(pt.level * tk.pct) AS pct
      FROM "City" ci JOIN "PlayerTechnology" pt ON pt."playerId" = ci."playerId"
      JOIN (VALUES ${upkeepTechTable}) AS tk(key, pct) ON tk.key = pt."techKey"
      GROUP BY ci.id
    ) AS tech ON tech."cityId" = cons."cityId"
    WHERE c.id = cons."cityId" AND cons.total > 0
  `;

  // 2) Famine : taux horaire, appliqué une fois par heure aux unités présentes dans une ville sans nourriture
  if (now.getTime() - lastStarvationAt < config.army.starvationIntervalHours * 3600000) return;
  lastStarvationAt = now.getTime();
  const rate = config.army.starvationLossRate;
  const starvedGroups = await prisma.$executeRaw`
    UPDATE "ArmyUnit" AS au
    SET count = au.count - GREATEST(1, FLOOR(au.count * ${rate}))
    FROM "Army" a, "City" c
    WHERE au."armyId" = a.id AND a."cityId" = c.id AND a.x = c.x AND a.y = c.y AND a.status = 'IDLE' AND c.food <= 0
  `;
  if (starvedGroups > 0) {
    const deleted = await prisma.armyUnit.deleteMany({ where: { count: { lte: 0 } } });
    console.log(`[STARVATION] ${starvedGroups} groupes d'unités affamés (${deleted.count} groupes anéantis)`);
  }
}

// Points de ressource : régénération linéaire depuis la dernière mise à jour (regenRate par heure),
// écrite seulement quand au moins 1 unité est gagnée (sinon FLOOR(…) = 0 à chaque tick de 30 s)
async function processResourceRegen(now, TICK_HOURS) {
  const regenCutoff = new Date(now.getTime() - config.tick.regenDelayMinutes * 60000);
  const regenResult = await prisma.$executeRaw`
    UPDATE "ResourceNode" SET
      amount = LEAST(amount + FLOOR("regenRate" * EXTRACT(EPOCH FROM (${now}::timestamp - "lastRegen")) / 3600.0), "maxAmount"),
      "lastRegen" = ${now}::timestamp
    WHERE amount < "maxAmount" AND "hasPlayerArmy" = false AND "cityId" IS NULL
      AND ("lastArmyDeparture" IS NULL OR "lastArmyDeparture" <= ${regenCutoff})
      AND FLOOR("regenRate" * EXTRACT(EPOCH FROM (${now}::timestamp - "lastRegen")) / 3600.0) >= 1
  `;
  if (regenResult > 0) console.log(`[REGEN] ${regenResult} resource nodes regenerated`);
}

// GDD: a damaged wall fully regenerates in 24h, 1 % faster per wall level
async function processWallRegen(TICK_HOURS) {
  const bonusPerLevel = fx.wallRegenBonusPctPerLevel();
  await prisma.$executeRaw`
    UPDATE "City" c SET "wallHp" = LEAST(c."wallHp" + c."wallMaxHp" * ${TICK_HOURS} / ${config.combat.wallRegenHours}
        * (1 + COALESCE((SELECT MAX(cb.level) FROM "CityBuilding" cb WHERE cb."cityId" = c.id AND cb.key = 'WALL'), 0) * ${bonusPerLevel} / 100.0), c."wallMaxHp")
    WHERE c."wallHp" < c."wallMaxHp" AND c."isSieged" = false
  `;
  // Santé de la muraille (chute des villes) : un assaut gagné s'efface toutes les 24 h hors siège
  const fall = config.combat.fall;
  const extra = Prisma.join(Object.entries({ _: 0, ...fall.extraAssaults }).map(([k, n]) => Prisma.sql`(${k}, ${n}::int)`));
  await prisma.$executeRaw`
    UPDATE "City" c SET "wallStructure" = LEAST(1, c."wallStructure" + ${TICK_HOURS} / ${fall.regenHours}::float
        / (CASE WHEN c."isCapital" THEN ${fall.assaults.capital}::int ELSE ${fall.assaults.secondary}::int END + COALESCE(ex.n, 0)))
    FROM "Player" p LEFT JOIN (VALUES ${extra}) AS ex(faction, n) ON ex.faction = p.faction
    WHERE p.id = c."playerId" AND c."wallStructure" < 1 AND c."isSieged" = false
  `;
}

// Treasure Chamber: gold per day, accrued continuously and paid to the player coin by coin
let _goldTableSql = null;
function getGoldTableSql() {
  if (_goldTableSql) return _goldTableSql;
  const rows = [];
  for (let lvl = 1; lvl <= 25; lvl++) rows.push(Prisma.sql`(${lvl}, ${fx.goldPerDayAtLevel(Math.min(20, lvl))}::float)`);
  _goldTableSql = Prisma.join(rows);
  return _goldTableSql;
}
async function processGoldIncome(TICK_HOURS) {
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "City" c SET "goldAccrued" = c."goldAccrued" + g.perday * ${TICK_HOURS} / 24.0
      FROM "CityBuilding" cb JOIN (VALUES ${getGoldTableSql()}) AS g(level, perday) ON g.level = cb.level
      WHERE cb."cityId" = c.id AND cb.key = 'TREASURE_CHAMBER' AND c."isSieged" = false`,
    prisma.$executeRaw`
      UPDATE "Player" p SET gold = p.gold + sub.coins
      FROM (SELECT "playerId", SUM(FLOOR("goldAccrued"))::int AS coins FROM "City" WHERE "goldAccrued" >= 1 GROUP BY "playerId") sub
      WHERE p.id = sub."playerId"`,
    prisma.$executeRaw`UPDATE "City" SET "goldAccrued" = "goldAccrued" - FLOOR("goldAccrued") WHERE "goldAccrued" >= 1`
  ]);
}

module.exports = { processResourceProduction, processUpkeep, processResourceRegen, processWallRegen, processGoldIncome };
