// ========== HARVEST & TRIBE RESPAWN PROCESSOR ==========
// Harvesting is one set-based statement for every army at once (no query per army); only the armies
// that must leave their node (empty node, full cargo, tribe back, node gone) are handled one by one.

const prisma = require('../../config/database');
const { Prisma } = require('@prisma/client');
const config = require('../../config');
const { unitsData } = require('../../config/gamedata');
const { getArmyTravelTime } = require('../../utils/calculations');
const { generateTribeDefenders } = require('../../utils/tribeDefenders');
const { findRoute } = require('../../utils/pathfinding');

// Carry capacity per unit key, sent once as a VALUES table
let _carryTableSql = null;
function getCarryTableSql() {
  if (_carryTableSql) return _carryTableSql;
  _carryTableSql = Prisma.join(unitsData.map(u => Prisma.sql`(${u.key}, ${u.stats?.carry || u.stats?.transport || 50}::int)`));
  return _carryTableSql;
}

async function leaveNode(army, node) {
  if (node) await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: true }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
  const reset = { harvestResourceType: null, targetResourceId: null, claimedAt: null };
  if (army.city && army.units.length > 0) {
    const route = await findRoute(army.x, army.y, army.city.x, army.city.y).catch(() => null);
    const travelTime = getArmyTravelTime(army.units, army.x, army.y, army.city.x, army.city.y, army.owner?.faction, army.hero, route ? route.length : null);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: army.city.x, targetY: army.city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), departedAt: new Date(), ...reset } });
  } else {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, arrivalAt: null, ...reset } });
  }
}

async function processHarvesting(now) {
  const perTick = config.tick.harvestPerTick;
  // 1) Every harvesting army takes min(rate, room left in its cargo, stock of the node), in one statement.
  //    The node rows are locked for the statement so a concurrent fight or claim waits.
  const harvested = await prisma.$queryRaw`
    WITH cap AS (
      SELECT a.id AS army_id, COALESCE(SUM(au.count * COALESCE(ut.carry, 50)), 0)::int AS capacity
      FROM "Army" a
      LEFT JOIN "ArmyUnit" au ON au."armyId" = a.id
      LEFT JOIN (VALUES ${getCarryTableSql()}) AS ut(key, carry) ON ut.key = au."unitKey"
      WHERE a.status = 'HARVESTING' AND a."missionType" = 'HARVEST'
      GROUP BY a.id
    ), take AS (
      SELECT a.id AS army_id, n.id AS node_id, n."resourceType" AS rt,
        GREATEST(0, LEAST(${perTick}, n.amount, cap.capacity - (a."carryWood" + a."carryStone" + a."carryIron" + a."carryFood" + a."carryGold")))::int AS qty
      FROM "Army" a
      JOIN cap ON cap.army_id = a.id
      JOIN "ResourceNode" n ON n.id = a."targetResourceId"
      WHERE a.status = 'HARVESTING' AND a."missionType" = 'HARVEST' AND n."hasDefenders" = false
      FOR UPDATE OF n
    ), upd_node AS (
      UPDATE "ResourceNode" n SET amount = GREATEST(0, n.amount - t.qty) FROM take t WHERE n.id = t.node_id AND t.qty > 0
      RETURNING n.id
    )
    UPDATE "Army" a SET
      "carryWood"  = a."carryWood"  + CASE WHEN t.rt = 'WOOD'  THEN t.qty ELSE 0 END,
      "carryStone" = a."carryStone" + CASE WHEN t.rt = 'STONE' THEN t.qty ELSE 0 END,
      "carryIron"  = a."carryIron"  + CASE WHEN t.rt = 'IRON'  THEN t.qty ELSE 0 END,
      "carryFood"  = a."carryFood"  + CASE WHEN t.rt = 'FOOD'  THEN t.qty ELSE 0 END,
      "carryGold"  = a."carryGold"  + CASE WHEN t.rt = 'GOLD'  THEN t.qty ELSE 0 END
    FROM take t WHERE a.id = t.army_id AND t.qty > 0
    RETURNING a.id`;
  const busy = new Set(harvested.map(r => r.id));

  // 2) The armies that took nothing have finished here (full, node empty or gone, tribe back): they leave
  const all = await prisma.army.findMany({ where: { status: 'HARVESTING', missionType: 'HARVEST' }, select: { id: true } });
  const leavers = all.filter(a => !busy.has(a.id));
  for (const { id } of leavers) {
    try {
      const army = await prisma.army.findUnique({ where: { id }, include: { units: true, city: true, owner: true, hero: { include: { items: true } } } });
      if (!army || army.status !== 'HARVESTING') continue;
      const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
      await leaveNode(army, node);
    } catch (harvestError) {
      console.error(`[HARVEST ERROR] ${id}:`, harvestError.message);
    }
  }
}

async function processTribeRespawn(now) {
  const defeatedNodes = await prisma.resourceNode.findMany({ where: { hasDefenders: false, lastDefeat: { not: null }, hasPlayerArmy: false } });
  for (const node of defeatedNodes) {
    let respawnTime;
    if (node.lastArmyDeparture) {
      respawnTime = new Date(new Date(node.lastArmyDeparture).getTime() + config.tick.tribeRespawnDelayMinutes * 60000);
    } else {
      respawnTime = new Date(node.lastDefeat.getTime() + node.respawnMinutes * 60000);
    }
    if (now >= respawnTime) {
      const resourcePercent = node.maxAmount > 0 ? node.amount / node.maxAmount : 0;
      const tribe = generateTribeDefenders(node.level || 1, node.resourceType === 'GOLD', resourcePercent);
      // Only if no army settled on the node meanwhile
      await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: false }, data: { hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, lastDefeat: null, lastArmyDeparture: null } });
    }
  }
}

module.exports = { processHarvesting, processTribeRespawn };
