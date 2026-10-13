// ========== HARVEST & TRIBE RESPAWN PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData } = require('../../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity } = require('../../utils/calculations');
const { generateTribeDefenders } = require('../../utils/tribeDefenders');

const CARRY_FIELD = { wood: 'carryWood', stone: 'carryStone', iron: 'carryIron', food: 'carryFood', gold: 'carryGold' };

async function leaveNode(army, node, clearTarget) {
  await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
  const reset = { harvestStartedAt: null, harvestResourceType: null, ...(clearTarget ? { targetResourceId: null } : {}) };
  if (army.city) {
    const travelTime = getArmyTravelTime(army.units, node.x, node.y, army.city.x, army.city.y, army.owner?.faction);
    await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: army.city.x, targetY: army.city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), ...reset } });
  } else {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, ...reset } });
  }
}

async function processHarvesting(now) {
  const harvestingArmies = await prisma.army.findMany({ where: { status: 'HARVESTING', missionType: 'HARVEST' }, include: { units: true, city: true, owner: true } });
  for (const army of harvestingArmies) {
    try {
      if (!army.targetResourceId) continue;
      const node = await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } });
      if (!node) { await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, targetResourceId: null, harvestStartedAt: null, harvestResourceType: null } }); continue; }
      if (node.hasDefenders && node.defenderPower > 0) { await leaveNode(army, node, false); continue; }
      const carryCapacity = getArmyCarryCapacity(army.units, unitsData);
      const currentCarry = army.carryWood + army.carryStone + army.carryIron + army.carryFood + (army.carryGold || 0);
      const remainingCapacity = carryCapacity - currentCarry;
      const toHarvest = Math.min(config.tick.harvestPerTick, remainingCapacity, node.amount);
      const field = CARRY_FIELD[node.resourceType.toLowerCase()];
      if (!field || toHarvest <= 0) { await leaveNode(army, node, true); continue; }
      await prisma.resourceNode.update({ where: { id: node.id }, data: { amount: { decrement: toHarvest } } });
      await prisma.army.update({ where: { id: army.id }, data: { [field]: { increment: toHarvest } } });
    } catch (harvestError) {
      console.error(`[HARVEST ERROR] ${army.id}:`, harvestError.message);
    }
  }
}

async function processTribeRespawn(now) {
  const defeatedNodes = await prisma.resourceNode.findMany({ where: { hasDefenders: false, lastDefeat: { not: null } } });
  for (const node of defeatedNodes) {
    if (node.hasPlayerArmy) continue;
    let respawnTime;
    if (node.lastArmyDeparture) {
      respawnTime = new Date(new Date(node.lastArmyDeparture).getTime() + config.tick.tribeRespawnDelayMinutes * 60000);
    } else {
      respawnTime = new Date(node.lastDefeat.getTime() + node.respawnMinutes * 60000);
    }
    if (now >= respawnTime) {
      const resourcePercent = node.maxAmount > 0 ? node.amount / node.maxAmount : 0;
      const tribe = generateTribeDefenders(node.level || 1, node.resourceType === 'GOLD', resourcePercent);
      await prisma.resourceNode.update({ where: { id: node.id }, data: { hasDefenders: true, defenderPower: tribe.power, defenderUnits: tribe.units, lastDefeat: null, lastArmyDeparture: null } });
    }
  }
}

module.exports = { processHarvesting, processTribeRespawn };
