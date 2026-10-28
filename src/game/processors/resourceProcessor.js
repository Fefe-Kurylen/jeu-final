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
// Bastion d'alliance actif : +10 % de production pour tous les membres (décision du 26 octobre 2026)
const BASTION_PROD = config.bastion.bonuses.productionPct / 100;

async function processResourceProduction(TICK_HOURS) {
  // 100% SQL : une seule requête pour toutes les villes (base 5/5/5/10 + champs × bonus), aucune lecture côté Node.
  // Multiplicateurs par ville : abonnement Plus, et bonus global de production des bâtiments (Irrigation égyptienne)
  const [globalKey, globalPct] = fx.productionBonusKeys()[0];
  const prodTechTable = techTableSql('productionBonusPct');   // Agronomie : +1 %/niveau sur tous les champs
  const colonyMult = 1 + fx.secondaryCityBonusPct() / 100;   // GDD: a secondary city produces +20 %
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = GREATEST(c.wood, LEAST(c.wood  + (COALESCE(p.w, 0) * (1 + COALESCE(p.wb, 0) / 100.0) + 5)  * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END) * (1 + COALESCE(p.bast, 0) * ${BASTION_PROD}::float), c."maxStorage")),
      stone = GREATEST(c.stone, LEAST(c.stone + (COALESCE(p.s, 0) * (1 + COALESCE(p.sb, 0) / 100.0) + 5)  * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END) * (1 + COALESCE(p.bast, 0) * ${BASTION_PROD}::float), c."maxStorage")),
      iron  = GREATEST(c.iron, LEAST(c.iron  + (COALESCE(p.i, 0) * (1 + COALESCE(p.ib, 0) / 100.0) + 5)  * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END) * (1 + COALESCE(p.bast, 0) * ${BASTION_PROD}::float), c."maxStorage")),
      food  = GREATEST(c.food, LEAST(c.food  + (COALESCE(p.f, 0) * (1 + COALESCE(p.fb, 0) / 100.0) + 10) * ${TICK_HOURS} * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END) * (1 + COALESCE(p.bast, 0) * ${BASTION_PROD}::float), c."maxFoodStorage"))
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
        MAX(CASE WHEN pl."premiumUntil" > ${new Date()} THEN 1 ELSE 0 END) AS prem,
        MAX(CASE WHEN bst.id IS NOT NULL THEN 1 ELSE 0 END) AS bast
      FROM "CityBuilding" cb
      JOIN "City" ci ON ci.id = cb."cityId"
      LEFT JOIN "Player" pl ON pl.id = ci."playerId"
      LEFT JOIN "AllianceMember" am ON am."playerId" = ci."playerId"
      LEFT JOIN "Bastion" bst ON bst."allianceId" = am."allianceId" AND bst.status = 'ACTIVE'   -- Bastion d'alliance : +10 % de production
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
    WHERE c.id = p."cityId"
  `;
  // Villes sans aucun bâtiment : production de base uniquement
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = GREATEST(c.wood, LEAST(c.wood  + 5  * ${TICK_HOURS}, c."maxStorage")),
      stone = GREATEST(c.stone, LEAST(c.stone + 5  * ${TICK_HOURS}, c."maxStorage")),
      iron  = GREATEST(c.iron, LEAST(c.iron  + 5  * ${TICK_HOURS}, c."maxStorage")),
      food  = GREATEST(c.food, LEAST(c.food  + 10 * ${TICK_HOURS}, c."maxFoodStorage"))
    WHERE NOT EXISTS (SELECT 1 FROM "CityBuilding" cb WHERE cb."cityId" = c.id)
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

// ---- bilan de nourriture d'une ville (décision du 28 octobre 2026) ----
// production/h (champs, bonus, Plus, Irrigation, Agronomie, colonie, Bastion) et consommation/h de toutes les armées que la
// ville nourrit (en ville, en mission, en renfort), réductions d'entretien comprises (bâtiments de faction + Intendance,
// 50 % au plus) ; siège (GDD economy_config.upkeep.siegeModifiersPct) : +10 % pour une armée qui campe devant une ville,
// −10 % pour les armées à l'arrêt dans leur ville assiégée
const SIEGE_UP = config.army.siegeUpkeepPct;
function foodBalanceSql(cityFilter = Prisma.sql`TRUE`) {
  const [globalKey, globalPct] = fx.productionBonusKeys()[0];
  const prodTechTable = techTableSql('productionBonusPct');
  const colonyMult = 1 + fx.secondaryCityBonusPct() / 100;
  const upkeepKeys = fx.upkeepReductionKeys();
  const reductionTable = Prisma.join(upkeepKeys.map(([k, pct]) => Prisma.sql`(${k}, ${pct}::float)`));
  const upkeepTechTable = techTableSql('upkeepReductionPct');
  return Prisma.sql`
    SELECT c.id AS "cityId", c."playerId", c.name, c.food, c."maxFoodStorage",
      ((COALESCE(p.f, 0) * (1 + COALESCE(p.fb, 0) / 100.0) + 10) * (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(p.gb, 0)) / 100.0)
        * (1 + COALESCE(tp.pct, 0) / 100.0) * (CASE WHEN c."isCapital" THEN 1 ELSE ${colonyMult} END) * (1 + COALESCE(p.bast, 0) * ${BASTION_PROD}::float))::float AS prod,
      (COALESCE(cons.total, 0) * (1 - LEAST(50, COALESCE(red.pct, 0) + COALESCE(tech.pct, 0)) / 100.0))::float AS cons,
      (LEAST(50, COALESCE(red.pct, 0) + COALESCE(tech.pct, 0)))::float AS "reductionPct"
    FROM "City" c
    LEFT JOIN (
      SELECT cb."cityId",
        SUM(CASE WHEN cb.key = 'FARM' THEN pt.prod ELSE 0 END) AS f,
        SUM(CASE WHEN cb.key = ANY(${BONUS.food.keys}) THEN cb.level * ${BONUS.food.pct} ELSE 0 END) AS fb,
        SUM(CASE WHEN cb.key = ${globalKey} THEN cb.level * ${globalPct} ELSE 0 END) AS gb,
        MAX(CASE WHEN pl."premiumUntil" > ${new Date()} THEN 1 ELSE 0 END) AS prem,
        MAX(CASE WHEN bst.id IS NOT NULL THEN 1 ELSE 0 END) AS bast
      FROM "CityBuilding" cb JOIN "City" ci ON ci.id = cb."cityId" LEFT JOIN "Player" pl ON pl.id = ci."playerId"
      LEFT JOIN "AllianceMember" am ON am."playerId" = ci."playerId" LEFT JOIN "Bastion" bst ON bst."allianceId" = am."allianceId" AND bst.status = 'ACTIVE'
      LEFT JOIN (VALUES ${getProdTableSql()}) AS pt(key, level, prod) ON pt.key = cb.key AND pt.level = cb.level
      GROUP BY cb."cityId"
    ) AS p ON p."cityId" = c.id
    LEFT JOIN (
      SELECT ci.id AS "cityId", SUM(pt.level * tk.pct) AS pct FROM "City" ci JOIN "PlayerTechnology" pt ON pt."playerId" = ci."playerId"
      JOIN (VALUES ${prodTechTable}) AS tk(key, pct) ON tk.key = pt."techKey" GROUP BY ci.id
    ) AS tp ON tp."cityId" = c.id
    LEFT JOIN (
      SELECT a."cityId", SUM(au.count * ut.upkeep * (CASE WHEN a.status = 'BESIEGING' THEN ${1 + SIEGE_UP.attacker / 100}::float
        WHEN hc."isSieged" AND a.status = 'IDLE' AND a.x = hc.x AND a.y = hc.y THEN ${1 + SIEGE_UP.defender / 100}::float ELSE 1.0 END)) AS total
      FROM "Army" a JOIN "City" hc ON hc.id = a."cityId" JOIN "ArmyUnit" au ON au."armyId" = a.id
      JOIN (VALUES ${getUpkeepTableSql()}) AS ut(key, upkeep) ON ut.key = au."unitKey"
      GROUP BY a."cityId"
    ) AS cons ON cons."cityId" = c.id
    LEFT JOIN (
      SELECT cb."cityId", SUM(cb.level * r.pct) AS pct FROM "CityBuilding" cb JOIN (VALUES ${reductionTable}) AS r(key, pct) ON r.key = cb.key GROUP BY cb."cityId"
    ) AS red ON red."cityId" = c.id
    LEFT JOIN (
      SELECT ci.id AS "cityId", SUM(pt.level * tk.pct) AS pct FROM "City" ci JOIN "PlayerTechnology" pt ON pt."playerId" = ci."playerId"
      JOIN (VALUES ${upkeepTechTable}) AS tk(key, pct) ON tk.key = pt."techKey" GROUP BY ci.id
    ) AS tech ON tech."cityId" = c.id
    WHERE ${cityFilter}`;
}
async function foodBalance(cityIds) {
  const rows = await prisma.$queryRaw`SELECT * FROM (${foodBalanceSql(Prisma.sql`c.id IN (${Prisma.join(cityIds.length ? cityIds : ['-'])})`)}) b`;
  return new Map(rows.map(r => [r.cityId, { production: Math.round(r.prod), consumption: Math.round(r.cons), net: Math.round(r.prod - r.cons), reductionPct: r.reductionPct, hoursLeft: r.cons > r.prod ? Math.max(0, r.food / (r.cons - r.prod)) : null }]));
}

let lastStarvationAt = 0;
const RES_UP = config.army.upkeepPerTier;

async function processUpkeep(TICK_HOURS, now = new Date()) {
  // 1) Décrément de nourriture : une seule requête pour toutes les villes (bilan ci-dessus)
  await prisma.$executeRaw`
    UPDATE "City" AS c SET food = GREATEST(0, c.food - b.cons * ${TICK_HOURS})
    FROM (${foodBalanceSql(Prisma.sql`EXISTS (SELECT 1 FROM "Army" a2 WHERE a2."cityId" = c.id)`)}) AS b
    WHERE c.id = b."cityId" AND b.cons > 0
  `;
  // 2) Une fois par heure : alertes (grenier vide dans moins de 6 h) et famine façon Travian
  if (now.getTime() - lastStarvationAt < config.army.starvationIntervalHours * 3600000) return;
  lastStarvationAt = now.getTime();
  const short = await prisma.$queryRaw`SELECT * FROM (${foodBalanceSql(Prisma.sql`EXISTS (SELECT 1 FROM "Army" a2 WHERE a2."cityId" = c.id)`)}) b WHERE b.cons > b.prod`;
  for (const r of short) {
    try {
      if (r.food > 1) await foodAlert(r, now);
      else await starve(r, now);
    } catch (e) { console.error('[STARVATION]', r.cityId, e.message); }
  }
}

// Grenier vide dans moins de 6 h : prévenu (une fois toutes les 6 h au plus)
async function foodAlert(r, now) {
  const hours = r.food / Math.max(1e-9, r.cons - r.prod);
  if (hours > config.army.famineAlertHours) return;
  const ok = await prisma.city.updateMany({ where: { id: r.cityId, OR: [{ foodAlertAt: null }, { foodAlertAt: { lt: new Date(now.getTime() - config.army.famineAlertHours * 3600000) } }] }, data: { foodAlertAt: now } });
  if (ok.count !== 1) return;
  require('../../services/pushService').notify(r.playerId, 'famine', '🌾 Grenier bientôt vide', `${r.name} n'a plus que ${Math.max(1, Math.round(hours * 10) / 10).toString().replace('.', ',')} h de nourriture : vos troupes consomment ${Math.round(r.cons)}/h pour ${Math.round(r.prod)}/h produites. Sans nourriture, elles mourront de faim.`, { to: 'city', cityId: r.cityId });
}

// Famine façon Travian : le grenier est vide et la consommation dépasse la production ; meurent juste assez de soldats
// pour que la consommation repasse sous la production, d'abord les plus gourmands, dans toutes les armées de la ville
async function starve(r, now) {
  const factor = 1 - (r.reductionPct || 0) / 100;
  const lost = await prisma.$transaction(async (tx) => {
    await require('../../utils/db').lockCity(tx, r.cityId);
    const armies = await tx.army.findMany({ where: { cityId: r.cityId, claimedAt: null }, include: { units: true, city: { select: { x: true, y: true, isSieged: true } } } });
    const groups = [];
    for (const a of armies) {
      const mult = a.status === 'BESIEGING' ? 1 + SIEGE_UP.attacker / 100 : a.city?.isSieged && a.status === 'IDLE' && a.x === a.city.x && a.y === a.city.y ? 1 + SIEGE_UP.defender / 100 : 1;
      for (const u of a.units) if (u.count > 0) groups.push({ u, a, eat: (RES_UP[unitsData.find(d => d.key === u.unitKey)?.tier] || RES_UP.base) * mult * factor });
    }
    groups.sort((x, y) => y.eat - x.eat || y.u.count - x.u.count);
    let deficit = r.cons - r.prod;
    const killed = {};
    const HS = require('../../services/heroService');
    const engaged = HS.fought(armies);
    for (const g of groups) {
      if (deficit <= 1e-6) break;
      const n = Math.min(g.u.count, Math.ceil(deficit / g.eat));
      if (n <= 0) continue;
      if (n >= g.u.count) await tx.armyUnit.delete({ where: { id: g.u.id } }); else await tx.armyUnit.update({ where: { id: g.u.id }, data: { count: { decrement: n } } });
      deficit -= n * g.eat;
      killed[g.u.unitKey] = (killed[g.u.unitKey] || 0) + n;
    }
    await HS.fallIfWiped(tx, engaged, now);   // une armée morte de faim perd son héros
    return killed;
  }, { timeout: 15000 });
  const total = Object.values(lost).reduce((a, b) => a + b, 0);
  if (!total) return;
  const names = Object.entries(lost).map(([k, n]) => `${n} ${unitsData.find(u => u.key === k)?.name || k}`).join(', ');
  console.log(`[STARVATION] ${r.name} : ${total} soldats morts de faim`);
  require('../../services/pushService').notify(r.playerId, 'famine', '💀 Famine', `${r.name} n'a plus de nourriture : ${names} ${total > 1 ? 'sont morts' : 'est mort'} de faim. Produisez plus de nourriture ou réduisez vos armées.`, { to: 'city', cityId: r.cityId });
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

// Vies de la ville (décision du 25 octobre 2026) : elles remontent de 0 à toutes en 48 h, et les PV du mur suivent la même
// part (une vie perdue ôte la même part des PV). À 0, la chute est en attente : rien ne remonte.
async function processWallRegen(TICK_HOURS) {
  await prisma.$executeRaw`
    UPDATE "City" c SET "wallStructure" = LEAST(1, c."wallStructure" + ${TICK_HOURS} / ${config.combat.fall.regenHours}::float)
    WHERE c."wallStructure" < 1 AND c."wallStructure" > 0
  `;
  await prisma.$executeRaw`
    UPDATE "City" c SET "wallHp" = c."wallMaxHp" * c."wallStructure"
    WHERE abs(c."wallHp" - c."wallMaxHp" * c."wallStructure") > 0.5
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
      WHERE cb."cityId" = c.id AND cb.key = 'TREASURE_CHAMBER'`,
    prisma.$executeRaw`
      UPDATE "Player" p SET gold = p.gold + sub.coins
      FROM (SELECT "playerId", SUM(FLOOR("goldAccrued"))::int AS coins FROM "City" WHERE "goldAccrued" >= 1 GROUP BY "playerId") sub
      WHERE p.id = sub."playerId"`,
    prisma.$executeRaw`UPDATE "City" SET "goldAccrued" = "goldAccrued" - FLOOR("goldAccrued") WHERE "goldAccrued" >= 1`
  ]);
}

module.exports = { processResourceProduction, processUpkeep, processResourceRegen, processWallRegen, processGoldIncome, foodBalance, foodBalanceSql, resetFamineClock: () => { lastStarvationAt = 0; } };
