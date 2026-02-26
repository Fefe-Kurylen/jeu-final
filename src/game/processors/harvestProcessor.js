// ========== HARVEST & TRIBE RESPAWN PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData } = require('../../config/gamedata');
const { calculateTravelTime, getArmyCarryCapacity } = require('../../utils/calculations');
const { generateTribeDefenders } = require('../../utils/tribeDefenders');

async function processHarvesting(now) {
  const harvestingArmies = await prisma.army.findMany({ where: { status: 'HARVESTING', missionType: 'HARVEST' }, include: { units: true, city: true } });
  for (const army of harvestingArmies) {
    try {
      if (!army.targetResourceId) continue;
      const node = await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } });
      if (!node) { await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, targetResourceId: null, harvestStartedAt: null, harvestResourceType: null } }); continue; }
      if (node.hasDefenders && node.defenderPower > 0) {
        await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
        if (army.cityId && army.city) {
          const travelTime = calculateTravelTime(node.x, node.y, army.city.x, army.city.y, 50);
          await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: army.city.x, targetY: army.city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), harvestStartedAt: null, harvestResourceType: null } });
        } else {
          await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, harvestStartedAt: null, harvestResourceType: null } });
        }
        continue;
      }
      const carryCapacity = getArmyCarryCapacity(army.units, unitsData);
      const currentCarry = army.carryWood + army.carryStone + army.carryIron + army.carryFood;
      const remainingCapacity = carryCapacity - currentCarry;
      const toHarvest = Math.min(config.tick.harvestPerTick, remainingCapacity, node.amount);
      if (toHarvest <= 0 || node.amount <= 0 || remainingCapacity <= 0) {
        await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
        if (army.cityId && army.city) {
          const travelTime = calculateTravelTime(node.x, node.y, army.city.x, army.city.y, 50);
          await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: army.city.x, targetY: army.city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), targetResourceId: null, harvestStartedAt: null, harvestResourceType: null } });
        } else {
          await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, harvestStartedAt: null, harvestResourceType: null } });
        }
        continue;
      }
      const resourceType = node.resourceType.toLowerCase();
      await prisma.resourceNode.update({ where: { id: node.id }, data: { amount: { decrement: toHarvest } } });
      const updateData = {};
      if (resourceType === 'wood') updateData.carryWood = army.carryWood + toHarvest;
      else if (resourceType === 'stone') updateData.carryStone = army.carryStone + toHarvest;
      else if (resourceType === 'iron') updateData.carryIron = army.carryIron + toHarvest;
      else if (resourceType === 'food') updateData.carryFood = army.carryFood + toHarvest;
      await prisma.army.update({ where: { id: army.id }, data: updateData });
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
