// ========== HARVEST & TRIBE RESPAWN PROCESSOR ==========
// Harvesting is one set-based statement for every army at once (no query per army); only the armies
// that must leave their node (empty node, full cargo, tribe back, node gone) are handled one by one.

const prisma = require('../../config/database');
const { Prisma } = require('@prisma/client');
const config = require('../../config');
const { unitsData, factionsData } = require('../../config/gamedata');
const fx = require('../../utils/buildingEffects');
const { getFactionBonus, getArmyTravelTime } = require('../../utils/calculations');
const T = require('../../utils/techEffects');
const { talent } = require('../../utils/heroEffects');
const { generateTribeDefenders, targetSoldiers, campDifficultyAt, tribeFactionOf } = require('../../utils/tribeDefenders');
const { findRoute } = require('../../utils/pathfinding');

// Carry capacity per unit key, sent once as a VALUES table
let _carryTableSql = null;
function getCarryTableSql() {
  if (_carryTableSql) return _carryTableSql;
  _carryTableSql = Prisma.join(unitsData.map(u => Prisma.sql`(${u.key}, ${u.stats?.carry || u.stats?.transport || 50}::int)`));
  return _carryTableSql;
}
// Transport bonuses, as for raids and convoys: civilization (Egypt, Sultanate), Market / Trade Office of the home city and
// Desert Outpost of the capital (bâtiment « capitale seulement » : lu dans la capitale du joueur, quelle que soit la ville)
const factionTransportSql = () => Prisma.join(Object.keys(factionsData).map(f => Prisma.sql`(${f}, ${getFactionBonus(f, 'transportCapacity', factionsData) || 0}::float)`));
const transportBuildingsSql = (capital) => {
  const rows = fx.transportBonusKeys().filter(([k]) => fx.capitalOnly(k) === capital);
  return rows.length ? Prisma.join(rows.map(([k, pct]) => Prisma.sql`(${k}, ${pct}::float)`)) : Prisma.sql`(NULL::text, 0::float)`;
};

async function leaveNode(army, node) {
  // Allies may share a node: it is released only when the last harvesting army leaves
  if (node) {
    const others = await prisma.army.count({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id, id: { not: army.id } } });
    if (others === 0) await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: true }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
  }
  const reset = { harvestResourceType: null, targetResourceId: null, claimedAt: null };
  if (army.city && army.units.length > 0) {
    const route = await findRoute(army.x, army.y, army.city.x, army.city.y, army.owner?.faction).catch(() => null);
    const speedPct = T.techPct(army.owner?.technologies, 'armySpeedBonusPct') + (await require('../../services/bastionService').speedPct(army.ownerId)) + fx.marchSpeedBonusPct(fx.capitalOf(army.owner));   // + Bastion d'alliance, Irrigation de la capitale, comme sendArmyHome
    const travelTime = getArmyTravelTime(army.units, army.x, army.y, army.city.x, army.city.y, army.owner?.faction, army.hero, route ? route.length : null, speedPct);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: army.city.x, targetY: army.city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), departedAt: new Date(), ...reset } });
  } else {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, arrivalAt: null, ...reset } });
  }
}

async function processHarvesting(now) {
  const perTick = config.tick.harvestPerTick;
  // talents d'Intendance du héros (Quartier-maître, Grand intendant), comme getArmyCarryCapacity : un multiplicateur par armée
  const heroed = await prisma.army.findMany({ where: { status: 'HARVESTING', missionType: 'HARVEST', heroId: { not: null } }, select: { id: true, hero: { select: { talents: true } } } });
  const heroRows = heroed.map(a => [a.id, 1 + talent(a.hero, 'carryPct') / 100]).filter(([, m]) => m !== 1);
  const heroSql = heroRows.length ? Prisma.join(heroRows.map(([id, m]) => Prisma.sql`(${id}::text, ${m}::float)`)) : Prisma.sql`(NULL::text, 1.0::float)`;
  // 1) Every harvesting army takes min(rate, room left in its cargo, stock of the node), in one statement.
  //    The node rows are locked for the statement so a concurrent fight or claim waits.
  const harvested = await prisma.$queryRaw`
    WITH cap AS (
      SELECT a.id AS army_id, FLOOR(COALESCE(SUM(au.count * COALESCE(ut.carry, 50)), 0) * (1 + COALESCE(fb.pct, 0) / 100.0) * (1 + LEAST(200, COALESCE(tb.pct, 0) + COALESCE(tc.pct, 0)) / 100.0) * (CASE WHEN MAX(bst.id) IS NOT NULL THEN ${1 + config.bastion.bonuses.carryPct / 100}::float ELSE 1.0 END) * COALESCE(hm.mult, 1.0))::int AS capacity
      FROM "Army" a
      LEFT JOIN "ArmyUnit" au ON au."armyId" = a.id
      LEFT JOIN (VALUES ${getCarryTableSql()}) AS ut(key, carry) ON ut.key = au."unitKey"
      LEFT JOIN "Player" pl ON pl.id = a."ownerId"
      LEFT JOIN "AllianceMember" am ON am."playerId" = a."ownerId"
      LEFT JOIN "Bastion" bst ON bst."allianceId" = am."allianceId" AND bst.status = 'ACTIVE'   -- Bastion d'alliance : +10 % de transport
      LEFT JOIN (VALUES ${factionTransportSql()}) AS fb(faction, pct) ON fb.faction = pl.faction
      LEFT JOIN (SELECT cb."cityId", SUM(cb.level * r.pct) AS pct FROM "CityBuilding" cb JOIN (VALUES ${transportBuildingsSql(false)}) AS r(key, pct) ON r.key = cb.key GROUP BY cb."cityId") AS tb ON tb."cityId" = a."cityId"
      LEFT JOIN (SELECT c."playerId", SUM(cb.level * r.pct) AS pct FROM "CityBuilding" cb JOIN "City" c ON c.id = cb."cityId" AND c."isCapital" JOIN (VALUES ${transportBuildingsSql(true)}) AS r(key, pct) ON r.key = cb.key GROUP BY c."playerId") AS tc ON tc."playerId" = a."ownerId"
      LEFT JOIN (VALUES ${heroSql}) AS hm(army_id, mult) ON hm.army_id = a.id   -- talents de transport du héros
      WHERE a.status = 'HARVESTING' AND a."missionType" = 'HARVEST'
      GROUP BY a.id, fb.pct, tb.pct, tc.pct, hm.mult
    ), take AS (
      SELECT a.id AS army_id, n.id AS node_id, n."resourceType" AS rt,
        GREATEST(0, LEAST(${perTick}, FLOOR(n.amount / GREATEST(1, (SELECT COUNT(*) FROM "Army" a2 WHERE a2.status = 'HARVESTING' AND a2."missionType" = 'HARVEST' AND a2."targetResourceId" = n.id))), cap.capacity - (a."carryWood" + a."carryStone" + a."carryIron" + a."carryFood" + a."carryGold")))::int AS qty
      FROM "Army" a
      JOIN cap ON cap.army_id = a.id
      JOIN "ResourceNode" n ON n.id = a."targetResourceId"
      WHERE a.status = 'HARVESTING' AND a."missionType" = 'HARVEST' AND n."hasDefenders" = false AND n."cityId" IS NULL
      FOR UPDATE OF n
    ), upd_node AS (
      UPDATE "ResourceNode" n SET amount = GREATEST(0, n.amount - s.q) FROM (SELECT node_id, SUM(qty) AS q FROM take GROUP BY node_id) s WHERE n.id = s.node_id AND s.q > 0
      RETURNING n.id
    )
    UPDATE "Army" a SET
      "carryWood"  = a."carryWood"  + CASE WHEN t.rt = 'WOOD'  THEN t.qty ELSE 0 END,
      "carryStone" = a."carryStone" + CASE WHEN t.rt = 'STONE' THEN t.qty ELSE 0 END,
      "carryIron"  = a."carryIron"  + CASE WHEN t.rt = 'IRON'  THEN t.qty ELSE 0 END,
      "carryFood"  = a."carryFood"  + CASE WHEN t.rt = 'FOOD'  THEN t.qty ELSE 0 END,
      "carryGold"  = a."carryGold"  + CASE WHEN t.rt = 'GOLD'  THEN t.qty ELSE 0 END
    FROM take t WHERE a.id = t.army_id AND t.qty > 0
    RETURNING a.id, a."ownerId" AS owner, t.qty`;
  const busy = new Set(harvested.map(r => r.id));
  // quêtes : ressources récoltées par joueur
  const byOwner = {};
  for (const r of harvested) byOwner[r.owner] = (byOwner[r.owner] || 0) + Number(r.qty || 0);
  for (const [owner, qty] of Object.entries(byOwner)) require('../../services/questService').bumpLater(owner, 'harvested', qty);

  // 2) The armies that took nothing have finished here (full, node empty or gone, tribe back): they leave
  const all = await prisma.army.findMany({ where: { status: 'HARVESTING', missionType: 'HARVEST' }, select: { id: true } });
  const leavers = all.filter(a => !busy.has(a.id));
  for (const { id } of leavers) {
    try {
      const army = await prisma.army.findUnique({ where: { id }, include: { units: true, city: true, owner: { include: { technologies: true, cities: fx.CAPITAL_BUILDINGS } }, hero: { include: { items: true } } } });
      if (!army || army.status !== 'HARVESTING') continue;
      const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
      await leaveNode(army, node);
    } catch (harvestError) {
      console.error(`[HARVEST ERROR] ${id}:`, harvestError.message);
    }
  }
}

let lastReinforceAt = 0;

// Camps grow back as their node refills: a tribe left weak (respawn on a depleted node, failed assault) is reinforced to
// the strength of the current stock, keeping its people, so a refilled node is never guarded by a handful of soldiers
async function reinforceTribes(now) {
  if (now.getTime() - lastReinforceAt < config.tick.tribeReinforceMinutes * 60000) return 0;
  lastReinforceAt = now.getTime();
  const guarded = await prisma.resourceNode.findMany({ where: { hasDefenders: true, hasPlayerArmy: false, lastDefeat: null, cityId: null, resourceType: { notIn: ['WONDER', 'PLAN', 'HORDE'] } }, select: { id: true, x: true, y: true, level: true, amount: true, maxAmount: true, resourceType: true, defenderUnits: true } });
  let reinforced = 0;
  for (const node of guarded) {
    const soldiers = Object.values(node.defenderUnits || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const percent = node.maxAmount > 0 ? node.amount / node.maxAmount : 0;
    const difficulty = campDifficultyAt(node.x, node.y);
    // Below 70 % of the target (the ± 20 % variation between camps never triggers it)
    if (soldiers >= targetSoldiers(node.level || 1, percent, difficulty) * 0.7) continue;
    const tribe = generateTribeDefenders(node.level || 1, node.resourceType === 'GOLD', percent, tribeFactionOf(node.defenderUnits), difficulty);
    const r = await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: false, hasDefenders: true }, data: { defenderPower: tribe.power, defenderUnits: tribe.units } });
    reinforced += r.count;
  }
  if (reinforced) console.log(`[TRIBES] ${reinforced} camps renforcés`);
  return reinforced;
}

async function processTribeRespawn(now) {
  await reinforceTribes(now);
  const defeatedNodes = await prisma.resourceNode.findMany({ where: { hasDefenders: false, lastDefeat: { not: null }, hasPlayerArmy: false, cityId: null, resourceType: { notIn: ['WONDER', 'PLAN', 'HORDE'] } } });   // les Immortels reviennent par wonderService
  for (const node of defeatedNodes) {
    let respawnTime;
    if (node.lastArmyDeparture) {
      respawnTime = new Date(new Date(node.lastArmyDeparture).getTime() + config.tick.tribeRespawnDelayMinutes * 60000);
    } else {
      respawnTime = new Date(node.lastDefeat.getTime() + node.respawnMinutes * 60000);
    }
    if (now >= respawnTime) {
      const resourcePercent = node.maxAmount > 0 ? node.amount / node.maxAmount : 0;
      const tribe = generateTribeDefenders(node.level || 1, node.resourceType === 'GOLD', resourcePercent, null, campDifficultyAt(node.x, node.y));
      // Only if no army settled on the node meanwhile
      await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: false }, data: { hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, lastDefeat: null, lastArmyDeparture: null } });
    }
  }
}

module.exports = { processHarvesting, processTribeRespawn };
