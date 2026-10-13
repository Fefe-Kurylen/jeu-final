// ========== ARMY MOVEMENT & COMBAT PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData, factionsData } = require('../../config/gamedata');
const { calculateTravelTime, getArmyTravelTime, getFactionBonus } = require('../../utils/calculations');
const { resolveCombat, resolveCombatDetailed, heroCombatStats } = require('../../services/combatService');
const { calculateWoundedUnits, addWoundedUnits } = require('../../services/woundedService');
const { awardHeroXp } = require('../../services/heroXpService');
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
  await prisma.army.update({ where: { id: armyId }, data: { status: 'IDLE', targetX: null, targetY: null, targetCityId: null, arrivalAt: null, missionType: null, ...extraData } });
}

// Sends the army back to its city at the speed of its surviving units (owner faction bonus applied).
// An army with no unit left has nothing to march with: it is put back in its city immediately.
async function sendArmyHome(army, fromX, fromY, extraData = {}, fixedSpeed = null) {
  const homeCity = army.cityId ? await prisma.city.findUnique({ where: { id: army.cityId } }) : null;
  if (!homeCity) {
    await setArmyIdle(army.id, extraData);
    return;
  }
  const units = await prisma.armyUnit.findMany({ where: { armyId: army.id } });
  if (units.length === 0) {
    await setArmyIdle(army.id, { x: homeCity.x, y: homeCity.y, ...extraData });
    await depositCarry({ ...army, ...extraData }, homeCity);
    return;
  }
  const faction = army.owner?.faction;
  const travelTime = fixedSpeed
    ? calculateTravelTime(fromX, fromY, homeCity.x, homeCity.y, fixedSpeed, faction, factionsData)
    : getArmyTravelTime(units, fromX, fromY, homeCity.x, homeCity.y, faction);
  await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), ...extraData } });
}

// Armies physically standing in the city defend it; armies away on missions do not
function defendingArmies(city) {
  return city.armies.filter(a => a.status === 'IDLE' && a.x === city.x && a.y === city.y);
}

async function depositCarry(army, homeCity) {
  const carryGold = army.carryGold || 0;
  await prisma.city.update({ where: { id: homeCity.id }, data: {
    wood: Math.min(homeCity.wood + (army.carryWood || 0), homeCity.maxStorage),
    stone: Math.min(homeCity.stone + (army.carryStone || 0), homeCity.maxStorage),
    iron: Math.min(homeCity.iron + (army.carryIron || 0), homeCity.maxStorage),
    food: Math.min(homeCity.food + (army.carryFood || 0), homeCity.maxFoodStorage)
  } });
  if (carryGold > 0) await prisma.player.update({ where: { id: army.ownerId }, data: { gold: { increment: carryGold } } });
  await prisma.army.update({ where: { id: army.id }, data: { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, carryGold: 0 } });
}

async function handleMoveToHarvest(army) {
  const harvestNode = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  if (harvestNode && !harvestNode.hasDefenders && !harvestNode.hasPlayerArmy) {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', missionType: 'HARVEST', arrivalAt: null, harvestStartedAt: new Date(), harvestResourceType: harvestNode.resourceType } });
    await prisma.resourceNode.update({ where: { id: harvestNode.id }, data: { hasPlayerArmy: true } }).catch(e => console.error(`[HARVEST ARRIVE] Failed:`, e.message));
  } else {
    await setArmyIdle(army.id, { targetResourceId: null, harvestStartedAt: null, harvestResourceType: null });
  }
}

async function handleRaidResource(army) {
  const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  if (!node) {
    await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null });
    return;
  }
  const result = await resolveTribeCombat(army, node, army.ownerId);
  if (result.success) await collectResourceLoot(army, node, army.ownerId);
  await sendArmyHome(army, node.x, node.y, { targetResourceId: null });
}

async function handleReturn(army) {
  const homeCity = army.cityId ? await prisma.city.findUnique({ where: { id: army.cityId } }) : null;
  if (homeCity) await depositCarry(army, homeCity);
  await setArmyIdle(army.id);
}

function reportResult(reportOwnerIsAttacker, attackerWon) {
  return reportOwnerIsAttacker === attackerWon ? 'WIN' : 'LOSE';
}

async function handleAttack(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId || '' }, include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true } });
  if (!targetCity) {
    await sendArmyHome(army, army.targetX, army.targetY);
    return;
  }
  const defenders = defendingArmies(targetCity);
  const defenderUnits = defenders.flatMap(a => a.units);
  const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
  const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;
  const defenderHero = defenders.find(a => a.hero)?.hero || null;
  const result = resolveCombatDetailed(army.units, defenderUnits, wallLevel, moatLevel, army.owner.name, targetCity.player.name, heroCombatStats(army.hero), heroCombatStats(defenderHero), army.owner.faction, targetCity.player.faction);

  // Losses are applied per unit row: each row gets the survival ratio of its unit type
  const survivalRatio = (finalUnits, key) => {
    const r = finalUnits.find(u => u.key === key);
    return r && r.initial > 0 ? r.remaining / r.initial : 0;
  };

  let wallDamageDone = 0;
  await prisma.$transaction(async (tx) => {
    for (const unit of army.units) {
      const newCount = Math.round(unit.count * survivalRatio(result.attackerFinalUnits, unit.unitKey));
      if (newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
      else if (newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
    }
    for (const defArmy of defenders) {
      for (const unit of defArmy.units) {
        const newCount = Math.round(unit.count * survivalRatio(result.defenderFinalUnits, unit.unitKey));
        if (newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
        else if (newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
      }
    }
    // Wall damage: base on victory + contribution of surviving siege engines (30% even on defeat)
    const siegeSurvivors = result.attackerFinalUnits.reduce((sum, u) => (unitsData.find(x => x.key === u.key)?.class === 'SIEGE' ? sum + u.remaining : sum), 0);
    const siegeEngineBonus = 1 + (getFactionBonus(army.owner.faction, 'siegeEngineAttack', factionsData) || 0) / 100;
    const perUnit = config.combat.siegeWallDamagePerUnit || 40;
    const baseDamage = result.attackerWon ? Math.floor(targetCity.wallMaxHp * 0.1 * (1 + result.rounds.length * 0.05)) : 0;
    const siegeDamage = Math.floor(siegeSurvivors * perUnit * siegeEngineBonus * (result.attackerWon ? 1 : 0.3));
    wallDamageDone = baseDamage + siegeDamage;
    if (wallDamageDone > 0) {
      const newHp = targetCity.wallHp - wallDamageDone;
      if (newHp <= 0) {
        const wallBuilding = targetCity.buildings.find(b => b.key === 'WALL');
        if (wallBuilding && wallBuilding.level > 0) {
          await tx.cityBuilding.update({ where: { id: wallBuilding.id }, data: { level: wallBuilding.level - 1 } });
          console.log(`[SIEGE] Mur de ${targetCity.name} percé ! Niveau ${wallBuilding.level} -> ${wallBuilding.level - 1}`);
        }
        await tx.city.update({ where: { id: targetCity.id }, data: { wallHp: targetCity.wallMaxHp } });
      } else {
        await tx.city.update({ where: { id: targetCity.id }, data: { wallHp: newHp } });
      }
    }
    const reportData = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: result.attackerInitialUnits, defenderUnits: result.defenderInitialUnits,
      attackerLosses: { rate: result.attackerLossRate, units: result.attackerFinalUnits, totalKilled: result.attackerTotalKilled },
      defenderLosses: { rate: result.defenderLossRate, units: result.defenderFinalUnits, totalKilled: result.defenderTotalKilled },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { rounds: result.rounds, wallDamage: wallDamageDone, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, duration: result.rounds.length }
    };
    await tx.battleReport.create({ data: { ...reportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...reportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    const winnerId = result.attackerWon ? army.ownerId : targetCity.playerId;
    const winField = result.attackerWon ? 'attacksWon' : 'defensesWon';
    await tx.playerStats.upsert({ where: { playerId: winnerId }, update: { [winField]: { increment: 1 } }, create: { playerId: winnerId, [winField]: 1 } });
    await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
    await tx.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
  });

  // Hero XP proportional to enemy units killed (winner x1, loser x0.3)
  try {
    const atkXp = Math.floor(result.defenderTotalKilled * 2 * (result.attackerWon ? 1 : 0.3));
    const defXp = Math.floor(result.attackerTotalKilled * 2 * (result.attackerWon ? 0.3 : 1));
    if (army.heroId) await awardHeroXp(army.heroId, atkXp);
    if (defenderHero) await awardHeroXp(defenderHero.id, defXp);
  } catch (xpErr) { console.error('[HERO XP]', xpErr.message); }

  try {
    const defenderWounded = await calculateWoundedUnits(targetCity.id, result.defenderFinalUnits, targetCity.player.faction);
    if (defenderWounded.length > 0) await addWoundedUnits(targetCity.id, defenderWounded);
    if (army.cityId) {
      const attackerWounded = await calculateWoundedUnits(army.cityId, result.attackerFinalUnits, army.owner.faction);
      if (attackerWounded.length > 0) await addWoundedUnits(army.cityId, attackerWounded);
    }
  } catch (woundErr) { console.error('[WOUNDED]', woundErr.message); }

  console.log(`[ATTACK] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'}`);
  await sendArmyHome(army, army.targetX, army.targetY);
}

async function handleRaid(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId || '' }, include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true } });
  if (!targetCity) {
    await sendArmyHome(army, army.targetX, army.targetY);
    return;
  }
  const defenders = defendingArmies(targetCity);
  const defenderUnits = defenders.flatMap(a => a.units);
  const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
  const defenderHero = defenders.find(a => a.hero)?.hero || null;
  const result = resolveCombat(army.units, defenderUnits, wallLevel, heroCombatStats(army.hero), heroCombatStats(defenderHero));

  const survivors = army.units.map(u => ({ ...u, newCount: Math.floor(u.count * (1 - result.attackerLossRate * 0.5)) }));

  // Loot is limited by what the SURVIVING raiders can carry
  let carryWood = 0, carryStone = 0, carryIron = 0, carryFood = 0;
  if (result.attackerWon) {
    const transportMultiplier = 1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100;
    const totalCarry = survivors.reduce((sum, u) => sum + (unitsData.find(d => d.key === u.unitKey)?.stats?.transport || 50) * u.newCount, 0) * transportMultiplier;
    const hideout = targetCity.buildings.find(b => b.key === 'HIDEOUT');
    let hideoutProtection = (hideout?.level || 0) * config.hideout.protectionPerLevel;
    hideoutProtection *= (1 + getFactionBonus(targetCity.player.faction, 'hideoutCapacity', factionsData) / 100);
    hideoutProtection = Math.min(hideoutProtection, config.hideout.maxProtection);
    const stealRate = config.hideout.raidStealRate;
    const take = (stock) => Math.floor(Math.min(stock * (1 - hideoutProtection) * stealRate, totalCarry * 0.25));
    carryWood = take(targetCity.wood); carryStone = take(targetCity.stone); carryIron = take(targetCity.iron); carryFood = take(targetCity.food);
  }

  await prisma.$transaction(async (tx) => {
    for (const unit of survivors) {
      if (unit.newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
      else if (unit.newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: unit.newCount } });
    }
    for (const defArmy of defenders) {
      for (const unit of defArmy.units) {
        const newCount = Math.floor(unit.count * (1 - result.defenderLossRate * 0.3));
        if (newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
        else if (newCount < unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
      }
    }
    if (result.attackerWon) {
      await tx.city.update({ where: { id: targetCity.id }, data: {
        wood: Math.max(0, targetCity.wood - carryWood), stone: Math.max(0, targetCity.stone - carryStone),
        iron: Math.max(0, targetCity.iron - carryIron), food: Math.max(0, targetCity.food - carryFood)
      } });
    }
    const raidReportData = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })),
      defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })),
      attackerLosses: { rate: result.attackerLossRate }, defenderLosses: { rate: result.defenderLossRate },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { wood: carryWood, stone: carryStone, iron: carryIron, food: carryFood, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, type: 'RAID' }
    };
    await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    if (result.attackerWon) {
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { raidsWon: { increment: 1 } }, create: { playerId: army.ownerId, raidsWon: 1 } });
    }
  });

  console.log(`[RAID] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Raider won' : 'Defender won'}`);
  await sendArmyHome(army, army.targetX, army.targetY, { carryWood, carryStone, carryIron, carryFood });
}

async function handleSpy(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId || '' }, include: { armies: { include: { units: true } }, buildings: true, player: true } });
  if (targetCity) {
    const present = defendingArmies(targetCity);
    const spyPower = army.units.reduce((sum, u) => sum + u.count, 0);
    const defenderPower = present.flatMap(a => a.units).reduce((sum, u) => sum + u.count, 0);
    const successChance = Math.min(0.9, 0.5 + (spyPower / Math.max(1, defenderPower)) * 0.3);
    const success = Math.random() < successChance;
    const base = { playerId: army.ownerId, targetPlayerId: targetCity.playerId, targetCityId: targetCity.id, targetX: targetCity.x, targetY: targetCity.y, targetType: 'CITY', targetName: targetCity.name, cityName: targetCity.name };
    if (success) {
      await prisma.spyReport.create({ data: { ...base, success: true,
        buildings: targetCity.buildings.map(b => ({ key: b.key, level: b.level })),
        armies: present.map(a => ({ name: a.name, units: a.units.map(u => ({ key: u.unitKey, count: u.count })) })),
        resources: { wood: Math.floor(targetCity.wood), stone: Math.floor(targetCity.stone), iron: Math.floor(targetCity.iron), food: Math.floor(targetCity.food) } } });
    } else {
      await prisma.spyReport.create({ data: { ...base, success: false, buildings: [], armies: [], resources: {} } });
    }
  }
  await sendArmyHome(army, army.targetX, army.targetY, {}, 80);
}

async function handleTransport(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId || '' } });
  if (targetCity) {
    await prisma.city.update({ where: { id: targetCity.id }, data: { wood: Math.min(targetCity.wood + army.carryWood, targetCity.maxStorage), stone: Math.min(targetCity.stone + army.carryStone, targetCity.maxStorage), iron: Math.min(targetCity.iron + army.carryIron, targetCity.maxStorage), food: Math.min(targetCity.food + army.carryFood, targetCity.maxFoodStorage) } });
    await sendArmyHome(army, army.targetX, army.targetY, { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 });
  } else {
    // Destination vanished: the convoy brings its cargo back
    await sendArmyHome(army, army.targetX, army.targetY);
  }
}

async function handleCollectResource(army) {
  const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  if (node && !node.hasDefenders && !node.hasPlayerArmy) {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType, arrivalAt: null } });
    await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: true } });
  } else {
    await setArmyIdle(army.id, { targetResourceId: null });
  }
}

module.exports = { processArmyMovements };
