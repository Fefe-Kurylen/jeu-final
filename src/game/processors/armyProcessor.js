// ========== ARMY MOVEMENT & COMBAT PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData, factionsData } = require('../../config/gamedata');
const { calculateTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../../utils/calculations');
const { resolveCombat, resolveCombatDetailed } = require('../../services/combatService');
const { calculateWoundedUnits, addWoundedUnits } = require('../../services/woundedService');
const { resolveTribeCombat, collectResourceLoot } = require('../../services/armyService');

async function processArmyMovements(now) {
  const movingArmies = await prisma.army.findMany({
    where: { status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING'] }, arrivalAt: { lte: now } },
    include: { units: true, owner: true, city: true, hero: true }
  });

  for (const army of movingArmies) {
    try {
      await prisma.army.update({ where: { id: army.id }, data: { x: army.targetX, y: army.targetY } });

      if (army.missionType === 'MOVE_TO_HARVEST') {
        await handleMoveToHarvest(army);
      } else if (army.missionType === 'RAID_RESOURCE') {
        await handleRaidResource(army);
      } else if (army.missionType === 'MOVE' || army.status === 'MOVING') {
        await setArmyIdle(army.id);
      } else if (army.missionType === 'RETURN' || army.status === 'RETURNING') {
        await handleReturn(army);
      } else if (army.missionType === 'ATTACK' || army.status === 'ATTACKING') {
        await handleAttack(army, now);
      } else if (army.missionType === 'RAID' || army.status === 'RAIDING') {
        await handleRaid(army, now);
      } else if (army.missionType === 'SPY' || army.status === 'SPYING') {
        await handleSpy(army, now);
      } else if (army.missionType === 'TRANSPORT' || army.status === 'TRANSPORTING') {
        await handleTransport(army, now);
      } else if (army.missionType === 'COLLECT_RESOURCE') {
        await handleCollectResource(army);
      }
    } catch (armyError) {
      console.error(`[ARMY ERROR] ${army.id}:`, armyError.message);
    }
  }
}

async function setArmyIdle(armyId, extraData = {}) {
  await prisma.army.update({ where: { id: armyId }, data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null, ...extraData } });
}

async function sendArmyHome(army, fromX, fromY, speed = 50, extraData = {}) {
  if (!army.cityId) {
    await setArmyIdle(army.id, extraData);
    return;
  }
  const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
  if (!homeCity) {
    await setArmyIdle(army.id, extraData);
    return;
  }
  const travelTime = calculateTravelTime(fromX, fromY, homeCity.x, homeCity.y, speed);
  await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), ...extraData } });
}

async function handleMoveToHarvest(army) {
  const harvestNode = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  if (harvestNode && !harvestNode.hasDefenders) {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: harvestNode.resourceType } });
    await prisma.resourceNode.update({ where: { id: harvestNode.id }, data: { hasPlayerArmy: true } }).catch(e => console.error(`[HARVEST ARRIVE] Failed:`, e.message));
  } else {
    await setArmyIdle(army.id, { targetResourceId: null, harvestStartedAt: null, harvestResourceType: null });
  }
}

async function handleRaidResource(army) {
  const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  if (node) {
    const result = await resolveTribeCombat(army, node, army.ownerId);
    if (result.success) {
      await collectResourceLoot(army, node, army.ownerId);
    }
    const minSpeed = army.units.reduce((min, u) => Math.min(min, 50), 50);
    await sendArmyHome(army, node.x, node.y, minSpeed, { targetResourceId: null });
  } else {
    await setArmyIdle(army.id, { targetResourceId: null });
  }
}

async function handleReturn(army) {
  if (army.cityId) {
    const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
    if (homeCity) {
      await prisma.city.update({ where: { id: homeCity.id }, data: { wood: Math.min(homeCity.wood + army.carryWood, homeCity.maxStorage), stone: Math.min(homeCity.stone + army.carryStone, homeCity.maxStorage), iron: Math.min(homeCity.iron + army.carryIron, homeCity.maxStorage), food: Math.min(homeCity.food + army.carryFood, homeCity.maxFoodStorage) } });
    }
  }
  await setArmyIdle(army.id, { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 });
}

async function handleAttack(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId }, include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true } });
  if (!targetCity) return;
  const defenderUnits = targetCity.armies.flatMap(a => a.units);
  const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
  const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;
  const garrisonArmy = targetCity.armies.find(a => a.isGarrison);
  const result = resolveCombatDetailed(army.units, defenderUnits, wallLevel, moatLevel, army.owner.name, targetCity.player.name, army.hero, garrisonArmy?.hero);

  // Apply all combat effects atomically
  await prisma.$transaction(async (tx) => {
    // Apply attacker losses
    for (const unit of army.units) {
      const unitResult = result.attackerFinalUnits.find(u => u.key === unit.unitKey);
      const newCount = unitResult ? unitResult.remaining : 0;
      if (newCount <= 0) { await tx.armyUnit.delete({ where: { id: unit.id } }); }
      else { await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
    }
    // Apply defender losses
    for (const defArmy of targetCity.armies) {
      for (const unit of defArmy.units) {
        const unitResult = result.defenderFinalUnits.find(u => u.key === unit.unitKey);
        const newCount = unitResult ? unitResult.remaining : 0;
        if (newCount <= 0) { await tx.armyUnit.delete({ where: { id: unit.id } }); }
        else { await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
      }
    }
    // Wall damage
    if (result.attackerWon) {
      const wallDamage = Math.floor(targetCity.wallMaxHp * 0.1 * (1 + result.rounds.length * 0.05));
      await tx.city.update({ where: { id: targetCity.id }, data: { wallHp: Math.max(0, targetCity.wallHp - wallDamage) } });
    }
    // Battle reports (attacker + defender)
    const reportData = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: result.attackerInitialUnits, defenderUnits: result.defenderInitialUnits,
      attackerLosses: { rate: result.attackerLossRate, units: result.attackerFinalUnits, totalKilled: result.attackerTotalKilled },
      defenderLosses: { rate: result.defenderLossRate, units: result.defenderFinalUnits, totalKilled: result.defenderTotalKilled },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { rounds: result.rounds, wallDamage: result.attackerWon ? Math.floor(targetCity.wallMaxHp * 0.1) : 0, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, duration: result.rounds.length }
    };
    await tx.battleReport.create({ data: { ...reportData, playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...reportData, playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    // Stats
    if (result.attackerWon) {
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { attacksWon: { increment: 1 }, unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, attacksWon: 1, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
      await tx.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
    } else {
      await tx.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { defensesWon: { increment: 1 }, unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, defensesWon: 1, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
    }
  });

  // Wounded units (outside transaction - uses its own prisma client)
  const defenderWounded = await calculateWoundedUnits(targetCity.id, result.defenderFinalUnits, targetCity.player.faction);
  if (defenderWounded.length > 0) await addWoundedUnits(targetCity.id, defenderWounded);
  if (army.cityId) {
    const attackerWounded = await calculateWoundedUnits(army.cityId, result.attackerFinalUnits, army.owner.faction);
    if (attackerWounded.length > 0) await addWoundedUnits(army.cityId, attackerWounded);
  }

  console.log(`[ATTACK] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'}`);
  await sendArmyHome(army, army.targetX, army.targetY);
}

async function handleRaid(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId }, include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true } });
  if (!targetCity) return;
  const defenderUnits = targetCity.armies.flatMap(a => a.units);
  const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
  const garrisonArmy = targetCity.armies.find(a => a.isGarrison);
  const result = resolveCombat(army.units, defenderUnits, wallLevel, army.hero, garrisonArmy?.hero);

  // Calculate loot before transaction
  let carryWood = 0, carryStone = 0, carryIron = 0, carryFood = 0;
  if (result.attackerWon) {
    let totalCarry = 0;
    for (const unit of army.units) { const unitDef = unitsData.find(u => u.key === unit.unitKey); if (unitDef) totalCarry += (unitDef.stats.transport || 50) * unit.count; }
    const hideout = targetCity.buildings.find(b => b.key === 'HIDEOUT');
    let hideoutProtection = (hideout?.level || 0) * config.hideout.protectionPerLevel;
    const gaulBonus = getFactionBonus(targetCity.player.faction, 'hideoutCapacity', factionsData);
    hideoutProtection *= (1 + gaulBonus / 100);
    hideoutProtection = Math.min(hideoutProtection, config.hideout.maxProtection);
    const stealRate = config.hideout.raidStealRate;
    carryWood = Math.floor(Math.min(targetCity.wood * (1 - hideoutProtection) * stealRate, totalCarry * 0.25));
    carryStone = Math.floor(Math.min(targetCity.stone * (1 - hideoutProtection) * stealRate, totalCarry * 0.25));
    carryIron = Math.floor(Math.min(targetCity.iron * (1 - hideoutProtection) * stealRate, totalCarry * 0.25));
    carryFood = Math.floor(Math.min(targetCity.food * (1 - hideoutProtection) * stealRate, totalCarry * 0.25));
  }

  // Apply all raid effects atomically
  await prisma.$transaction(async (tx) => {
    // Apply attacker losses
    for (const unit of army.units) {
      const newCount = Math.floor(unit.count * (1 - result.attackerLossRate * 0.5));
      if (newCount <= 0) { await tx.armyUnit.delete({ where: { id: unit.id } }); }
      else { await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
    }
    // Apply defender losses
    for (const defArmy of targetCity.armies) {
      for (const unit of defArmy.units) {
        const newCount = Math.floor(unit.count * (1 - result.defenderLossRate * 0.3));
        if (newCount <= 0) { await tx.armyUnit.delete({ where: { id: unit.id } }); }
        else if (newCount < unit.count) { await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
      }
    }
    // Steal resources
    if (result.attackerWon) {
      await tx.city.update({ where: { id: targetCity.id }, data: {
        wood: Math.max(0, targetCity.wood - carryWood),
        stone: Math.max(0, targetCity.stone - carryStone),
        iron: Math.max(0, targetCity.iron - carryIron),
        food: Math.max(0, targetCity.food - carryFood)
      } });
    }
    // Reports
    const raidReportData = { x: targetCity.x, y: targetCity.y, attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })), attackerLosses: { rate: result.attackerLossRate }, defenderLosses: { rate: result.defenderLossRate }, winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER', loot: result.attackerWon ? { wood: carryWood, stone: carryStone, iron: carryIron, food: carryFood } : null };
    await tx.battleReport.create({ data: { ...raidReportData, playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...raidReportData, playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    // Stats
    if (result.attackerWon) {
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { raidsWon: { increment: 1 } }, create: { playerId: army.ownerId, raidsWon: 1 } });
    }
  });

  console.log(`[RAID] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Raider won' : 'Defender won'}`);
  await sendArmyHome(army, army.targetX, army.targetY, 50, { carryWood, carryStone, carryIron, carryFood });
}

async function handleSpy(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId }, include: { armies: { include: { units: true } }, buildings: true, player: true } });
  if (targetCity) {
    const spyPower = army.units.reduce((sum, u) => sum + u.count, 0);
    const defenderPower = targetCity.armies.flatMap(a => a.units).reduce((sum, u) => sum + u.count, 0);
    const successChance = Math.min(0.9, 0.5 + (spyPower / Math.max(1, defenderPower)) * 0.3);
    const success = Math.random() < successChance;
    if (success) {
      await prisma.spyReport.create({ data: { playerId: army.ownerId, targetPlayerId: targetCity.playerId, targetCityId: targetCity.id, targetX: targetCity.x, targetY: targetCity.y, targetType: 'CITY', targetName: targetCity.name, cityName: targetCity.name, buildings: targetCity.buildings.map(b => ({ key: b.key, level: b.level })), armies: targetCity.armies.map(a => ({ name: a.name, units: a.units.map(u => ({ key: u.unitKey, count: u.count })) })), resources: { wood: Math.floor(targetCity.wood), stone: Math.floor(targetCity.stone), iron: Math.floor(targetCity.iron), food: Math.floor(targetCity.food) }, success: true } });
    } else {
      await prisma.spyReport.create({ data: { playerId: army.ownerId, targetPlayerId: targetCity.playerId, targetCityId: targetCity.id, targetX: targetCity.x, targetY: targetCity.y, targetType: 'CITY', targetName: targetCity.name, cityName: targetCity.name, buildings: [], armies: [], resources: {}, success: false } });
    }
  }
  await sendArmyHome(army, army.targetX, army.targetY, 80);
}

async function handleTransport(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId } });
  if (targetCity) {
    await prisma.city.update({ where: { id: targetCity.id }, data: { wood: Math.min(targetCity.wood + army.carryWood, targetCity.maxStorage), stone: Math.min(targetCity.stone + army.carryStone, targetCity.maxStorage), iron: Math.min(targetCity.iron + army.carryIron, targetCity.maxStorage), food: Math.min(targetCity.food + army.carryFood, targetCity.maxFoodStorage) } });
  }
  await sendArmyHome(army, army.targetX, army.targetY, 50, { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 });
}

async function handleCollectResource(army) {
  const node = await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } });
  if (node && !node.hasDefenders) {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType, arrivalAt: null } });
    await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: true } });
  } else {
    await setArmyIdle(army.id, { targetResourceId: null });
  }
}

module.exports = { processArmyMovements };
