// ========== ARMY MOVEMENT & COMBAT PROCESSOR ==========

const prisma = require('../../config/database');
const config = require('../../config');
const { unitsData, factionsData } = require('../../config/gamedata');
const { calculateTravelTime, getArmyTravelTime, getFactionBonus, getArmyCarryCapacity } = require('../../utils/calculations');
const { resolveCombat, resolveCombatDetailed, heroCombatStats } = require('../../services/combatService');
const { calculateWoundedUnits, addWoundedUnits } = require('../../services/woundedService');
const { awardHeroXp } = require('../../services/heroXpService');
const { resolveTribeCombat, collectResourceLoot } = require('../../services/armyService');
const { creditCity, plunderCity } = require('../../utils/db');

async function processArmyMovements(now) {
  const movingArmies = await prisma.army.findMany({
    where: { status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING'] }, arrivalAt: { lte: now } },
    include: { units: true, owner: true, city: true, hero: true },
    orderBy: { arrivalAt: 'asc' },
    take: 500
  });

  for (const army of movingArmies) {
    try {
      // Claim the arrival: a second executor (or a recall landing at the same time) must not process it twice
      const claimed = await prisma.army.updateMany({ where: { id: army.id, status: army.status, arrivalAt: army.arrivalAt }, data: { x: army.targetX, y: army.targetY } });
      if (claimed.count !== 1) continue;

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
  await creditCity(prisma, homeCity.id, { wood: army.carryWood, stone: army.carryStone, iron: army.carryIron, food: army.carryFood });
  if ((army.carryGold || 0) > 0) await prisma.player.update({ where: { id: army.ownerId }, data: { gold: { increment: army.carryGold } } });
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
  await prisma.$transaction(async (tx) => {
    const result = await resolveTribeCombat(army, node, army.ownerId, tx);
    if (result.success) await collectResourceLoot(army, node, army.ownerId, tx);
  });
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

// Losses are applied per unit row with the survival ratio of its unit type
function survivalRatio(finalUnits, key) {
  const r = finalUnits.find(u => u.key === key);
  return r && r.initial > 0 ? r.remaining / r.initial : 0;
}

async function applyLosses(tx, units, finalUnits) {
  for (const unit of units) {
    const newCount = Math.round(unit.count * survivalRatio(finalUnits, unit.unitKey));
    if (newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
    else if (newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
  }
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

  // GDD: only siege engines damage the wall (30% efficiency when the assault fails)
  const siegeSurvivors = result.attackerFinalUnits.reduce((sum, u) => (unitsData.find(x => x.key === u.key)?.class === 'SIEGE' ? sum + u.remaining : sum), 0);
  const siegeEngineBonus = 1 + (getFactionBonus(army.owner.faction, 'siegeEngineAttack', factionsData) || 0) / 100;
  const wallDamageDone = Math.floor(siegeSurvivors * config.combat.siegeWallDamagePerUnit * siegeEngineBonus * (result.attackerWon ? 1 : 0.3));

  await prisma.$transaction(async (tx) => {
    await applyLosses(tx, army.units, result.attackerFinalUnits);
    for (const defArmy of defenders) await applyLosses(tx, defArmy.units, result.defenderFinalUnits);
    if (wallDamageDone > 0) {
      const newHp = targetCity.wallHp - wallDamageDone;
      if (newHp <= 0) {
        // Breached: the wall loses one level and its HP is reset for the new level
        const wallBuilding = targetCity.buildings.find(b => b.key === 'WALL');
        if (wallBuilding && wallBuilding.level > 0) {
          await tx.cityBuilding.update({ where: { id: wallBuilding.id }, data: { level: wallBuilding.level - 1 } });
          console.log(`[SIEGE] Mur de ${targetCity.name} percé ! Niveau ${wallBuilding.level} -> ${wallBuilding.level - 1}`);
        }
        const newMax = config.combat.wallHpPerLevel * Math.max(1, (wallBuilding?.level || 1) - 1);
        await tx.city.update({ where: { id: targetCity.id }, data: { wallMaxHp: newMax, wallHp: newMax } });
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
      loot: { rounds: result.rounds, wallDamage: wallDamageDone, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, duration: result.rounds.length, type: 'ATTACK' }
    };
    await tx.battleReport.create({ data: { ...reportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...reportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    const winnerId = result.attackerWon ? army.ownerId : targetCity.playerId;
    const winField = result.attackerWon ? 'attacksWon' : 'defensesWon';
    await tx.playerStats.upsert({ where: { playerId: winnerId }, update: { [winField]: { increment: 1 } }, create: { playerId: winnerId, [winField]: 1 } });
    await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
    await tx.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
  });

  // Hero XP: GDD 0.25 per enemy unit destroyed (winner x1, loser x0.3)
  try {
    const atkXp = Math.floor(result.defenderTotalKilled * config.combat.heroXpPerKill * (result.attackerWon ? 1 : 0.3));
    const defXp = Math.floor(result.attackerTotalKilled * config.combat.heroXpPerKill * (result.attackerWon ? 0.3 : 1));
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

  const survivors = army.units.map(u => ({ ...u, newCount: Math.floor(u.count * (1 - result.attackerLossRate)) }));

  // GDD: the loot is at most 30% of what the SURVIVING raiders can carry, split by what the city
  // still has after the hideout; the stock is taken atomically at resolution time
  let loot = { wood: 0, stone: 0, iron: 0, food: 0 };
  if (result.attackerWon) {
    const transportMultiplier = 1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100;
    const carry = getArmyCarryCapacity(survivors.map(u => ({ unitKey: u.unitKey, count: u.newCount })), unitsData) * transportMultiplier;
    const budget = carry * config.combat.raidLootPctOfCarry;
    const hideout = targetCity.buildings.find(b => b.key === 'HIDEOUT');
    let hideoutProtection = (hideout?.level || 0) * config.hideout.protectionPerLevel;
    hideoutProtection *= (1 + getFactionBonus(targetCity.player.faction, 'hideoutCapacity', factionsData) / 100);
    hideoutProtection = Math.min(hideoutProtection, config.hideout.maxProtection);
    const available = {};
    for (const r of ['wood', 'stone', 'iron', 'food']) available[r] = Math.max(0, targetCity[r] * (1 - hideoutProtection) * config.hideout.raidStealRate);
    const totalAvailable = Object.values(available).reduce((s, v) => s + v, 0);
    const want = {};
    for (const r of Object.keys(available)) want[r] = totalAvailable > 0 ? Math.floor(Math.min(available[r], budget * available[r] / totalAvailable)) : 0;
    loot = want;
  }

  await prisma.$transaction(async (tx) => {
    for (const unit of survivors) {
      if (unit.newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
      else if (unit.newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: unit.newCount } });
    }
    for (const defArmy of defenders) {
      for (const unit of defArmy.units) {
        const newCount = Math.floor(unit.count * (1 - result.defenderLossRate));
        if (newCount <= 0) await tx.armyUnit.delete({ where: { id: unit.id } });
        else if (newCount < unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
      }
    }
    if (result.attackerWon) loot = await plunderCity(tx, targetCity.id, loot);
    const raidReportData = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })),
      defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })),
      attackerLosses: { rate: result.attackerLossRate, totalKilled: army.units.reduce((s, u) => s + Math.floor(u.count * result.attackerLossRate), 0) },
      defenderLosses: { rate: result.defenderLossRate, totalKilled: defenderUnits.reduce((s, u) => s + Math.floor(u.count * result.defenderLossRate), 0) },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { ...loot, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, type: 'RAID' }
    };
    await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    if (result.attackerWon) {
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { raidsWon: { increment: 1 } }, create: { playerId: army.ownerId, raidsWon: 1 } });
    }
  });

  console.log(`[RAID] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Raider won' : 'Defender won'}`);
  await sendArmyHome(army, army.targetX, army.targetY, { carryWood: loot.wood, carryStone: loot.stone, carryIron: loot.iron, carryFood: loot.food });
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
    await creditCity(prisma, targetCity.id, { wood: army.carryWood, stone: army.carryStone, iron: army.carryIron, food: army.carryFood });
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
