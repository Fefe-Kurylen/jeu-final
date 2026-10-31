// ========== RESOURCE PRODUCTION, UPKEEP, REGENERATION ==========

const prisma = require('../../config/database');
const { Prisma } = require('@prisma/client');
const config = require('../../config');
const { unitsData, buildingsData } = require('../../config/gamedata');
const { getProductionAtLevel } = require('../../utils/calculations');
const { RES_FR } = require('../../utils/db');
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
// Ville dont un stock peut encore monter : une ville pleine garderait ses valeurs (GREATEST), on évite de la réécrire
const NOT_FULL = Prisma.sql`(c.wood < c."maxStorage" OR c.stone < c."maxStorage" OR c.iron < c."maxStorage" OR c.food < c."maxFoodStorage")`;

// Σ niveau × pct par ville pour des paires (clé, pct) de bâtiments à effet. Un bâtiment « capitale seulement » (décision du
// 30 octobre 2026 : Irrigation, Tente de guerre, Avant-poste…) se lit dans la capitale du joueur et vaut pour toutes ses
// villes ; les autres se lisent dans la ville (fx.withCapital, en SQL : les bâtiments de la ville, puis ceux de la capitale
// prêtés à chaque colonie). `only(colonne)` : filtre des villes demandées (bilan de nourriture)
function effectPctSql(pairs, only = () => Prisma.empty) {
  const table = Prisma.sql`(VALUES ${Prisma.join(pairs.map(([k, pct]) => Prisma.sql`(${k}, ${pct}::float, ${fx.capitalOnly(k)}::boolean)`))}) AS r(key, pct, capital)`;
  return Prisma.sql`
    SELECT e."cityId", SUM(e.level * e.pct) AS pct FROM (
      SELECT cb."cityId", cb.level, r.pct FROM "CityBuilding" cb JOIN "City" ci ON ci.id = cb."cityId"
        JOIN ${table} ON r.key = cb.key AND (NOT r.capital OR ci."isCapital") ${only('cb."cityId"')}
      UNION ALL
      SELECT ci.id, cb.level, r.pct FROM "City" ci JOIN "City" cap ON cap."playerId" = ci."playerId" AND cap."isCapital" AND cap.id <> ci.id
        JOIN "CityBuilding" cb ON cb."cityId" = cap.id JOIN ${table} ON r.key = cb.key AND r.capital ${only('ci.id')}
    ) e
    GROUP BY e."cityId"`;
}

// Spécialité des colonies selon leur gisement (décision du 31 octobre 2026, fx.colonyNodeBonusPct / colonyOtherResourcesPct) :
// niveau du gisement × 10 points de % sur sa ressource, −30 points sur les trois autres, ajoutés à ceux des bâtiments de
// production (Scierie…) ; rien pour la capitale ni la Ville Merveille. Une ligne par ville (GROUP BY : jamais une ville
// en double dans les jointures)
const NODE_TYPE = Object.fromEntries(Object.entries(fx.NODE_RESOURCE).map(([type, r]) => [r, type]));   // wood -> WOOD
function siteBonusSql(only) {
  const pct = (r) => Prisma.sql`MAX(CASE WHEN rn."resourceType" = ${NODE_TYPE[r]} THEN rn.level * ${fx.colonyNodeBonusPct(1)}::float ELSE ${fx.colonyOtherResourcesPct()}::float END)`;
  return Prisma.sql`
    SELECT rn."cityId", ${pct('wood')} AS w, ${pct('stone')} AS s, ${pct('iron')} AS i, ${pct('food')} AS f
    FROM "ResourceNode" rn JOIN "City" ci ON ci.id = rn."cityId" AND NOT ci."isCapital" AND NOT ci."isWonder"
      AND rn."resourceType" IN (${Prisma.join(Object.keys(fx.NODE_RESOURCE))})
    ${only('rn."cityId"')}
    GROUP BY rn."cityId"`;
}

// Production par heure de chaque ville, une ligne par ville ; seul calcul de la production (tick, bilan de nourriture,
// alerte « dépôt plein ») : (champs × (1 + bâtiments de production + gisement) + base 5/5/5/10) × abonnement Plus ×
// Irrigation de la capitale (50 % au plus) × Agronomie × colonie (secondaryCityBonusPct, 0 depuis le 31 octobre 2026) × Bastion.
// `only(colonne)` : filtre des villes demandées (bilan de nourriture)
function productionSql(only = () => Prisma.empty) {
  const prodTechTable = techTableSql('productionBonusPct');   // Agronomie : +0,5 %/niveau sur tous les champs (data/technologies.json)
  const colonyMult = 1 + fx.secondaryCityBonusPct() / 100;   // 0 depuis le 31 octobre 2026 (la spécialité vient du gisement)
  return Prisma.sql`
    SELECT x."cityId",
      (x.w * (1 + x.wb / 100.0) + 5)  * x.mult AS wood,
      (x.s * (1 + x.sb / 100.0) + 5)  * x.mult AS stone,
      (x.i * (1 + x.ib / 100.0) + 5)  * x.mult AS iron,
      (x.f * (1 + x.fb / 100.0) + 10) * x.mult AS food
    FROM (
      SELECT ct.id AS "cityId",
        COALESCE(p.w, 0) AS w, COALESCE(p.s, 0) AS s, COALESCE(p.i, 0) AS i, COALESCE(p.f, 0) AS f,
        COALESCE(p.wb, 0) + COALESCE(site.w, 0) AS wb, COALESCE(p.sb, 0) + COALESCE(site.s, 0) AS sb,
        COALESCE(p.ib, 0) + COALESCE(site.i, 0) AS ib, COALESCE(p.fb, 0) + COALESCE(site.f, 0) AS fb,
        (1 + COALESCE(p.prem, 0) * ${PREMIUM_BONUS}) * (1 + LEAST(50, COALESCE(gp.pct, 0)) / 100.0) * (1 + COALESCE(tp.pct, 0) / 100.0)
          * (CASE WHEN ct."isCapital" THEN 1 ELSE ${colonyMult} END) * (1 + COALESCE(p.bast, 0) * ${BASTION_PROD}::float) AS mult
      FROM "City" ct
      LEFT JOIN (
        SELECT cb."cityId",
          SUM(CASE WHEN cb.key = 'LUMBER'    THEN pt.prod ELSE 0 END) AS w,
          SUM(CASE WHEN cb.key = 'QUARRY'    THEN pt.prod ELSE 0 END) AS s,
          SUM(CASE WHEN cb.key = 'IRON_MINE' THEN pt.prod ELSE 0 END) AS i,
          SUM(CASE WHEN cb.key = 'FARM'      THEN pt.prod ELSE 0 END) AS f,
          SUM(CASE WHEN cb.key = ANY(${BONUS.wood.keys})  THEN cb.level * ${BONUS.wood.pct}  ELSE 0 END) AS wb,
          SUM(CASE WHEN cb.key = ANY(${BONUS.stone.keys}) THEN cb.level * ${BONUS.stone.pct} ELSE 0 END) AS sb,
          SUM(CASE WHEN cb.key = ANY(${BONUS.iron.keys})  THEN cb.level * ${BONUS.iron.pct}  ELSE 0 END) AS ib,
          SUM(CASE WHEN cb.key = ANY(${BONUS.food.keys})  THEN cb.level * ${BONUS.food.pct}  ELSE 0 END) AS fb,
          MAX(CASE WHEN pl."premiumUntil" > ${new Date()} THEN 1 ELSE 0 END) AS prem,
          MAX(CASE WHEN bst.id IS NOT NULL THEN 1 ELSE 0 END) AS bast
        FROM "CityBuilding" cb
        JOIN "City" ci ON ci.id = cb."cityId"
        LEFT JOIN "Player" pl ON pl.id = ci."playerId"
        LEFT JOIN "AllianceMember" am ON am."playerId" = ci."playerId"
        LEFT JOIN "Bastion" bst ON bst."allianceId" = am."allianceId" AND bst.status = 'ACTIVE'   -- Bastion d'alliance : +10 % de production
        LEFT JOIN (VALUES ${getProdTableSql()}) AS pt(key, level, prod) ON pt.key = cb.key AND pt.level = cb.level
        ${only('cb."cityId"')}
        GROUP BY cb."cityId"
      ) AS p ON p."cityId" = ct.id
      LEFT JOIN (
        SELECT ci.id AS "cityId", SUM(pt.level * tk.pct) AS pct FROM "City" ci JOIN "PlayerTechnology" pt ON pt."playerId" = ci."playerId"
        JOIN (VALUES ${prodTechTable}) AS tk(key, pct) ON tk.key = pt."techKey" ${only('ci.id')} GROUP BY ci.id
      ) AS tp ON tp."cityId" = ct.id
      LEFT JOIN (${effectPctSql(fx.productionBonusKeys(), only)}) AS gp ON gp."cityId" = ct.id
      LEFT JOIN (${siteBonusSql(only)}) AS site ON site."cityId" = ct.id
      ${only('ct.id')}
    ) AS x`;
}

async function processResourceProduction(TICK_HOURS) {
  // 100 % SQL : une seule requête pour toutes les villes (productionSql), aucune lecture côté Node
  await prisma.$executeRaw`
    UPDATE "City" AS c SET
      wood  = GREATEST(c.wood,  LEAST(c.wood  + pr.wood  * ${TICK_HOURS}, c."maxStorage")),
      stone = GREATEST(c.stone, LEAST(c.stone + pr.stone * ${TICK_HOURS}, c."maxStorage")),
      iron  = GREATEST(c.iron,  LEAST(c.iron  + pr.iron  * ${TICK_HOURS}, c."maxStorage")),
      food  = GREATEST(c.food,  LEAST(c.food  + pr.food  * ${TICK_HOURS}, c."maxFoodStorage"))
    FROM (${productionSql()}) AS pr
    WHERE c.id = pr."cityId" AND ${NOT_FULL}
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
// production/h des 4 ressources (productionSql ; bois, pierre et fer servent à l'alerte « dépôt plein ») et consommation/h de toutes
// les armées que la ville nourrit (en ville, en mission, en renfort) et de ses blessés qui attendent un soin
// (config.wounded.woundedPayUpkeep, décision du 30 octobre 2026), réductions d'entretien comprises (bâtiments de faction
// de la capitale + Intendance, 50 % au plus) ; siège (GDD economy_config.upkeep.siegeModifiersPct) : +10 % pour une armée
// qui campe devant une ville, −10 % pour les armées à l'arrêt dans leur ville assiégée.
// Entretien généralisé (décision du 30 octobre 2026 au soir, § 1 bis) : chaque ville paie d'abord ses propres troupes, le
// manque est pris dans les autres greniers du joueur ; alerte et famine portent sur le total du joueur (processUpkeep).
const SIEGE_UP = config.army.siegeUpkeepPct;
// Logistique du héros (GDD) : l'armée qui porte le héros consomme moins ; une ligne (armée, part réduite) par héros joint
// cityIds : armées de ces villes seulement (null = tout le monde) ; seuls les champs lus par statPct sont chargés
async function heroUpkeepTable(cityIds = null) {
  const armies = await prisma.army.findMany({
    where: { heroId: { not: null }, ...(cityIds ? { cityId: { in: cityIds } } : {}) },
    select: { id: true, hero: { select: { diedAt: true, logistics: true, logPoints: true, talents: true,
      items: { where: { slot: { not: 'inventory' } }, select: { slot: true, stats: true } } } } }
  });
  const HE = require('../../utils/heroEffects');
  const rows = armies.filter(a => a.hero && !a.hero.diedAt).map(a => [a.id, Math.max(0, Math.min(0.5, HE.statPct(a.hero, 'logistics')))]).filter(([, p]) => p > 0);
  return rows.length ? Prisma.join(rows.map(([id, p]) => Prisma.sql`(${id}, ${p}::float)`)) : Prisma.sql`('-', 0::float)`;
}
// ids : villes demandées, répétées dans chaque sous-requête (PostgreSQL n'y pousse pas un IN de plusieurs valeurs)
function foodBalanceSql(cityFilter = Prisma.sql`TRUE`, heroTable = Prisma.sql`('-', 0::float)`, ids = null) {
  const only = (col) => ids ? Prisma.sql`WHERE ${Prisma.raw(col)} IN (${Prisma.join(ids)})` : Prisma.empty;
  const upkeepTechTable = techTableSql('upkeepReductionPct');
  return Prisma.sql`
    SELECT c.id AS "cityId", c."playerId", c.name, c.wood, c.stone, c.iron, c.food, c."maxStorage", c."maxFoodStorage",
      pr.wood::float AS "prodWood", pr.stone::float AS "prodStone", pr.iron::float AS "prodIron", pr.food::float AS prod,
      ((COALESCE(cons.total, 0) + COALESCE(wd.total, 0)) * (1 - LEAST(50, COALESCE(red.pct, 0) + COALESCE(tech.pct, 0)) / 100.0))::float AS cons,
      (LEAST(50, COALESCE(red.pct, 0) + COALESCE(tech.pct, 0)))::float AS "reductionPct"
    FROM "City" c
    JOIN (${productionSql(only)}) AS pr ON pr."cityId" = c.id
    LEFT JOIN (
      SELECT a."cityId", SUM(au.count * ut.upkeep * (CASE WHEN a.status = 'BESIEGING' THEN ${1 + SIEGE_UP.attacker / 100}::float
        WHEN hc."isSieged" AND a.status = 'IDLE' AND a.x = hc.x AND a.y = hc.y THEN ${1 + SIEGE_UP.defender / 100}::float ELSE 1.0 END)
        * (1 - COALESCE(hl.pct, 0))) AS total
      FROM "Army" a JOIN "City" hc ON hc.id = a."cityId" JOIN "ArmyUnit" au ON au."armyId" = a.id
      JOIN (VALUES ${getUpkeepTableSql()}) AS ut(key, upkeep) ON ut.key = au."unitKey"
      LEFT JOIN (VALUES ${heroTable}) AS hl(army, pct) ON hl.army = a.id
      ${only('a."cityId"')}
      GROUP BY a."cityId"
    ) AS cons ON cons."cityId" = c.id
    LEFT JOIN (
      SELECT w."cityId", SUM(w.waiting * ut.upkeep) AS total
      FROM "WoundedUnit" w JOIN (VALUES ${getUpkeepTableSql()}) AS ut(key, upkeep) ON ut.key = w."unitKey" AND w.waiting > 0 AND ${config.wounded.woundedPayUpkeep}::boolean
      ${only('w."cityId"')}
      GROUP BY w."cityId"
    ) AS wd ON wd."cityId" = c.id
    LEFT JOIN (${effectPctSql(fx.upkeepReductionKeys(), only)}) AS red ON red."cityId" = c.id
    LEFT JOIN (
      SELECT ci.id AS "cityId", SUM(pt.level * tk.pct) AS pct FROM "City" ci JOIN "PlayerTechnology" pt ON pt."playerId" = ci."playerId"
      JOIN (VALUES ${upkeepTechTable}) AS tk(key, pct) ON tk.key = pt."techKey" ${only('ci.id')} GROUP BY ci.id
    ) AS tech ON tech."cityId" = c.id
    WHERE ${cityFilter}`;
}
async function foodBalance(cityIds) {
  const ids = cityIds.length ? cityIds : ['-'];
  const rows = await prisma.$queryRaw`SELECT * FROM (${foodBalanceSql(Prisma.sql`c.id IN (${Prisma.join(ids)})`, await heroUpkeepTable(ids), ids)}) b`;
  return new Map(rows.map(r => [r.cityId, { production: Math.round(r.prod), consumption: Math.round(r.cons), net: Math.round(r.prod - r.cons), reductionPct: r.reductionPct, hoursLeft: r.cons > r.prod ? Math.max(0, r.food / (r.cons - r.prod)) : null }]));
}
// Bilan de tout le joueur (§ 1 bis : l'entretien puise dans tous ses greniers, la famine ne vient qu'avec leur total vide) :
// `balances` : bilans de ses villes (foodBalance), `food` : nourriture de toutes ses villes réunies
function playerFoodBalance(balances, food) {
  const production = balances.reduce((s, b) => s + (b?.production || 0), 0);
  const consumption = balances.reduce((s, b) => s + (b?.consumption || 0), 0);
  return { production, consumption, net: production - consumption, hoursLeft: consumption > production ? Math.max(0, food) / (consumption - production) : null };
}

let lastStarvationAt = 0;
const RES_UP = config.army.upkeepPerTier;
// Ville qui nourrit quelqu'un : des armées, ou des blessés qui attendent un soin (`c` : alias de la ville)
const feeds = (c) => Prisma.sql`(EXISTS (SELECT 1 FROM "Army" a2 WHERE a2."cityId" = ${Prisma.raw(c)}.id) OR EXISTS (SELECT 1 FROM "WoundedUnit" w2 WHERE w2."cityId" = ${Prisma.raw(c)}.id AND w2.waiting > 0))`;
// Toutes les villes des joueurs dont une ville nourrit quelqu'un : leurs greniers paient l'entretien ensemble
const OF_FEEDING_PLAYERS = Prisma.sql`c."playerId" IN (SELECT f."playerId" FROM "City" f WHERE ${feeds('f')})`;

async function processUpkeep(TICK_HOURS, now = new Date()) {
  const heroTable = await heroUpkeepTable();   // une seule fois par tick, pour toutes les requêtes
  // 1) Entretien du tick, une seule requête pour tous les joueurs : chaque ville paie ses troupes avec son grenier (paid) ;
  //    le manque de tout le joueur (somme des lack) est pris dans ce qui reste aux autres villes (spare), la plus pleine
  //    d'abord (reste rapporté au plafond du Silo, à égalité la plus riche, comme les dépenses : utils/db.js planDebit) :
  //    chacune donne ce que les villes passées avant elle n'ont pas couvert. Écrit en différence (c.food − taken) : une
  //    écriture concurrente n'est pas perdue. Grenier vide et rien à donner : rien à écrire.
  await prisma.$executeRaw`
    WITH own AS (
      SELECT b."cityId" AS id, b."playerId",
        LEAST(GREATEST(b.food, 0), b.cons * ${TICK_HOURS}) AS paid,
        GREATEST(b.food - b.cons * ${TICK_HOURS}, 0) AS spare,
        GREATEST(b.food - b.cons * ${TICK_HOURS}, 0) / GREATEST(b."maxFoodStorage", 1) AS fill,
        GREATEST(b.cons * ${TICK_HOURS} - GREATEST(b.food, 0), 0) AS lack
      FROM (${foodBalanceSql(OF_FEEDING_PLAYERS, heroTable)}) AS b
    ), shared AS (
      SELECT id, paid + LEAST(spare, GREATEST(
          SUM(lack) OVER (PARTITION BY "playerId")
          - COALESCE(SUM(spare) OVER (PARTITION BY "playerId" ORDER BY fill DESC, spare DESC, id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0),
        0)) AS taken
      FROM own
    )
    UPDATE "City" AS c SET food = GREATEST(0, c.food - s.taken)
    FROM shared AS s
    WHERE c.id = s.id AND s.taken > 0
  `;
  // 2) Une fois par heure, sur le total de chaque joueur : alerte (greniers vides dans moins de config.army.famineAlertHours
  //    heures) et famine façon Travian (tous ses greniers vides). La réduction d'entretien est la même dans toutes ses
  //    villes (capitale, technologies). Puis l'alerte « dépôt plein » de chaque ville.
  if (now.getTime() - lastStarvationAt < config.army.starvationIntervalHours * 3600000) return;
  lastStarvationAt = now.getTime();
  const short = await prisma.$queryRaw`
    SELECT b."playerId", SUM(b.food)::float AS food, SUM(b.prod)::float AS prod, SUM(b.cons)::float AS cons, MAX(b."reductionPct")::float AS "reductionPct"
    FROM (${foodBalanceSql(OF_FEEDING_PLAYERS, heroTable)}) AS b
    GROUP BY b."playerId" HAVING SUM(b.cons) > SUM(b.prod)`;
  for (const r of short) {
    try {
      if (r.food > 1) await foodAlert(r, now);
      else await starve(r, now);
    } catch (e) { console.error('[STARVATION]', r.playerId, e.message); }
  }
  await storageAlerts(heroTable, now, TICK_HOURS).catch(e => console.error('[STORAGE ALERT]', e.message));
}

// Greniers du joueur vides dans moins de config.army.famineAlertHours heures (12, décision du 30 octobre 2026) : prévenu
// une fois par tel délai au plus, noté sur sa capitale
async function foodAlert(r, now) {
  const hours = r.food / Math.max(1e-9, r.cons - r.prod);
  if (hours > config.army.famineAlertHours) return;
  const capital = await prisma.city.findFirst({ where: { playerId: r.playerId, isCapital: true }, select: { id: true } });
  if (!capital) return;
  const ok = await prisma.city.updateMany({ where: { id: capital.id, OR: [{ foodAlertAt: null }, { foodAlertAt: { lt: new Date(now.getTime() - config.army.famineAlertHours * 3600000) } }] }, data: { foodAlertAt: now } });
  if (ok.count !== 1) return;
  require('../../services/pushService').notify(r.playerId, 'famine', '🌾 Grenier bientôt vide', `Vos greniers n'ont plus que ${Math.max(1, Math.round(hours * 10) / 10).toString().replace('.', ',')} h de nourriture : vos troupes consomment ${Math.round(r.cons)}/h pour ${Math.round(r.prod)}/h produites dans toutes vos villes. Sans nourriture, elles mourront de faim.`, { to: 'city', cityId: capital.id });
}

// Famine façon Travian : tous les greniers du joueur sont vides et la consommation dépasse la production ; meurent juste
// assez de bouches pour que la consommation repasse sous la production : d'abord les blessés qui attendent un soin (ils
// ne combattent pas), puis les soldats les plus gourmands, dans toutes les armées de toutes ses villes
async function starve(r, now) {
  const factor = 1 - (r.reductionPct || 0) / 100;
  const tierUpkeep = (unitKey) => RES_UP[unitsData.find(d => d.key === unitKey)?.tier] || RES_UP.base;
  const lost = await prisma.$transaction(async (tx) => {
    const cities = await require('../../utils/db').lockPlayerCities(tx, r.playerId);
    const empty = { killed: {}, wounded: 0, capitalId: (cities.find(c => c.isCapital) || cities[0])?.id };
    if (cities.reduce((s, c) => s + Math.max(0, c.food), 0) > 1) return empty;   // nourri entre-temps
    const ids = cities.map(c => c.id);
    const armies = await tx.army.findMany({ where: { cityId: { in: ids }, claimedAt: null }, include: { units: true, city: { select: { x: true, y: true, isSieged: true } } } });
    const groups = [];
    for (const a of armies) {
      const mult = a.status === 'BESIEGING' ? 1 + SIEGE_UP.attacker / 100 : a.city?.isSieged && a.status === 'IDLE' && a.x === a.city.x && a.y === a.city.y ? 1 + SIEGE_UP.defender / 100 : 1;
      for (const u of a.units) {
        if (u.count > 0) groups.push({ unitKey: u.unitKey, count: u.count, eat: tierUpkeep(u.unitKey) * mult * factor, kill: (n) => (n >= u.count ? tx.armyUnit.delete({ where: { id: u.id } }) : tx.armyUnit.update({ where: { id: u.id }, data: { count: { decrement: n } } })) });
      }
    }
    if (config.wounded.woundedPayUpkeep) {
      for (const w of await tx.woundedUnit.findMany({ where: { cityId: { in: ids }, waiting: { gt: 0 } } })) {
        groups.push({ unitKey: w.unitKey, count: w.waiting, wounded: true, eat: tierUpkeep(w.unitKey) * factor, kill: (n) => tx.woundedUnit.update({ where: { id: w.id }, data: { waiting: { decrement: n } } }) });
      }
    }
    groups.sort((x, y) => (!!y.wounded - !!x.wounded) || y.eat - x.eat || y.count - x.count);
    let deficit = r.cons - r.prod;
    const killed = {};
    let wounded = 0;
    const HS = require('../../services/heroService');
    const engaged = HS.fought(armies);
    for (const g of groups) {
      if (deficit <= 1e-6) break;
      const n = Math.min(g.count, Math.ceil(deficit / g.eat));
      if (n <= 0) continue;
      await g.kill(n);
      deficit -= n * g.eat;
      killed[g.unitKey] = (killed[g.unitKey] || 0) + n;
      if (g.wounded) wounded += n;
    }
    if (wounded) await tx.woundedUnit.deleteMany({ where: { cityId: { in: ids }, count: 0, waiting: 0 } });
    await HS.fallIfWiped(tx, engaged, now);   // une armée morte de faim perd son héros
    return { ...empty, killed, wounded };
  }, { timeout: 15000 });
  const total = Object.values(lost.killed).reduce((a, b) => a + b, 0);
  if (!total) return;
  const names = Object.entries(lost.killed).map(([k, n]) => `${n} ${unitsData.find(u => u.key === k)?.name || k}`).join(', ');
  console.log(`[STARVATION] joueur ${r.playerId} : ${total} soldats morts de faim`);
  require('../../services/pushService').notify(r.playerId, 'famine', '💀 Famine', `Vos greniers sont vides : ${names} ${total > 1 ? 'sont morts' : 'est mort'} de faim${lost.wounded ? ` (dont ${lost.wounded} blessé${lost.wounded > 1 ? 's' : ''} qui attendai${lost.wounded > 1 ? 'ent' : 't'} un soin)` : ''}. Produisez plus de nourriture, soignez vos blessés ou réduisez vos armées.`, { to: 'city', cityId: lost.capitalId });
}

// « [ville] : dépôt plein dans 1 h » (décision du 30 octobre 2026, aide au suivi) : une ressource qui atteindra son plafond
// dans moins de config.city.storageAlertLeadHours heures (pas une déjà pleine : la ville a été prévenue avant) ; céréales :
// production moins l'entretien des troupes de la ville. Un Silo plein reste sous son plafond de l'entretien que ses troupes
// viennent de payer à ce tick (`tickHours`) : il compte comme plein, à une unité près (sinon l'alerte reviendrait toutes
// les 12 h). Au plus une alerte par ville toutes les storageAlertHours heures.
const fullSoonSql = (stock, cap, gain) => Prisma.sql`(${gain} > 0 AND ${stock} < ${cap}
  AND ${cap} - ${stock} <= ${gain} * ${config.city.storageAlertLeadHours}::float)`;
async function storageAlerts(heroTable, now, tickHours) {
  const cutoff = new Date(now.getTime() - config.city.storageAlertHours * 3600000);
  const col = (name) => Prisma.raw(`b."${name}"`);
  const rows = await prisma.$queryRaw`
    SELECT * FROM (
      SELECT b."cityId", b."playerId", b.name,
        ${fullSoonSql(col('wood'), col('maxStorage'), col('prodWood'))} AS wood,
        ${fullSoonSql(col('stone'), col('maxStorage'), col('prodStone'))} AS stone,
        ${fullSoonSql(col('iron'), col('maxStorage'), col('prodIron'))} AS iron,
        ${fullSoonSql(Prisma.sql`(b.food + b.cons * ${tickHours}::float + 1)`, col('maxFoodStorage'), Prisma.sql`(b.prod - b.cons)`)} AS food
      FROM (${foodBalanceSql(Prisma.sql`(c."storageAlertAt" IS NULL OR c."storageAlertAt" < ${cutoff})`, heroTable)}) AS b
    ) s
    WHERE s.wood OR s.stone OR s.iron OR s.food`;
  for (const r of rows) {
    try {
      const noted = await prisma.city.updateMany({ where: { id: r.cityId, OR: [{ storageAlertAt: null }, { storageAlertAt: { lt: cutoff } }] }, data: { storageAlertAt: now } });
      if (noted.count === 1) require('../../services/pushService').notify(r.playerId, 'storage_full', '📦 Stock bientôt plein', storageAlertText(r), { to: 'city', cityId: r.cityId });
    } catch (e) { console.error('[STORAGE ALERT]', r.cityId, e.message); }
  }
}
// « Colonie 1 : dépôt plein dans 1 h (bois, fer) ; silo plein dans 1 h. » (`row` : nom de la ville, une case par ressource)
function storageAlertText(row) {
  const lead = `${String(config.city.storageAlertLeadHours).replace('.', ',')} h`;
  const depot = ['wood', 'stone', 'iron'].filter(r => row[r]).map(r => RES_FR[r]);
  const parts = [...(depot.length ? [`dépôt plein dans ${lead} (${depot.join(', ')})`] : []), ...(row.food ? [`silo plein dans ${lead}`] : [])];
  return `${row.name} : ${parts.join(' ; ')}. Dépensez ou agrandissez le stockage.`;
}

// Points de ressource : régénération linéaire depuis la dernière mise à jour (regenRate par heure),
// écrite seulement quand au moins 1 unité est gagnée (sinon FLOOR(…) = 0 à chaque tick de 30 s)
async function processResourceRegen(now) {
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

module.exports = { processResourceProduction, processUpkeep, processResourceRegen, processWallRegen, processGoldIncome, foodBalance, foodBalanceSql, productionSql, playerFoodBalance, storageAlertText, resetFamineClock: () => { lastStarvationAt = 0; } };
