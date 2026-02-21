// ========== GAME TICK PROCESSOR ==========
// Runs every 30 seconds to process all game events

const prisma = require('../config/database');
const config = require('../config');
const { unitsData, buildingsData, factionsData } = require('../config/gamedata');
const { getProductionAtLevel, calculateTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { resolveCombat, resolveCombatDetailed } = require('../services/combatService');
const { calculateWoundedUnits, addWoundedUnits, processHealedUnits } = require('../services/woundedService');
const { createExpedition } = require('../services/expeditionService');
const { generateTribeDefenders } = require('../utils/tribeDefenders');

let tickRunning = false;

async function gameTick() {
  if (tickRunning) return;
  tickRunning = true;

  const now = new Date();
  const TICK_HOURS = config.tick.tickHours;

  try {
    // ========== HEAL WOUNDED UNITS ==========
    const healedCount = await processHealedUnits();
    if (healedCount > 0) console.log(`[TICK] ${healedCount} wounded unit groups healed`);

    // ========== RESOURCE PRODUCTION ==========
    const cities = await prisma.city.findMany({ where: { isSieged: false }, include: { buildings: true } });
    const cityUpdates = cities.map(city => {
      let wood = 5, stone = 5, iron = 5, food = 10;
      for (const b of city.buildings) {
        if (b.key === 'LUMBER') wood += getProductionAtLevel('LUMBER', b.level, buildingsData);
        else if (b.key === 'QUARRY') stone += getProductionAtLevel('QUARRY', b.level, buildingsData);
        else if (b.key === 'IRON_MINE') iron += getProductionAtLevel('IRON_MINE', b.level, buildingsData);
        else if (b.key === 'FARM') food += getProductionAtLevel('FARM', b.level, buildingsData);
      }
      return prisma.city.update({
        where: { id: city.id },
        data: {
          wood: Math.min(city.wood + wood * TICK_HOURS, city.maxStorage),
          stone: Math.min(city.stone + stone * TICK_HOURS, city.maxStorage),
          iron: Math.min(city.iron + iron * TICK_HOURS, city.maxStorage),
          food: Math.min(city.food + food * TICK_HOURS, city.maxFoodStorage)
        }
      });
    });
    await Promise.all(cityUpdates);

    // ========== UPKEEP (food consumption) ==========
    // Group armies by city to avoid race conditions with concurrent food deductions
    const allArmies = await prisma.army.findMany({ where: { cityId: { not: null } }, include: { units: true } });
    const armiesByCity = {};
    for (const army of allArmies) {
      if (!army.cityId) continue;
      if (!armiesByCity[army.cityId]) armiesByCity[army.cityId] = [];
      armiesByCity[army.cityId].push(army);
    }
    for (const [cityId, cityArmies] of Object.entries(armiesByCity)) {
      let totalFoodConsumption = 0;
      for (const army of cityArmies) {
        for (const unit of army.units) {
          const unitDef = unitsData.find(u => u.key === unit.unitKey);
          const upkeep = config.army.upkeepPerTier[unitDef?.tier] || config.army.upkeepPerTier.base;
          totalFoodConsumption += unit.count * upkeep;
        }
      }
      const consumption = totalFoodConsumption * TICK_HOURS;
      if (consumption > 0) {
        const city = await prisma.city.findUnique({ where: { id: cityId } });
        if (city) {
          const newFood = Math.max(0, city.food - consumption);
          await prisma.city.update({ where: { id: cityId }, data: { food: newFood } });
          if (newFood <= 0) {
            for (const army of cityArmies) {
              for (const unit of army.units) {
                const losses = Math.ceil(unit.count * config.army.starvationLossRate);
                if (losses > 0) {
                  const remaining = Math.max(0, unit.count - losses);
                  if (remaining > 0) { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: remaining } }); }
                  else { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
                  console.log(`[STARVATION] ${losses}x ${unit.unitKey} morts de faim!`);
                }
              }
            }
          }
        }
      }
    }

    // ========== CONSTRUCTION DONE ==========
    const builds = await prisma.buildQueueItem.findMany({
      where: { status: 'RUNNING', endsAt: { lte: now } },
      include: { city: { include: { buildings: true, buildQueue: true } } }
    });
    const buildsByCityId = {};
    for (const b of builds) {
      if (!buildsByCityId[b.cityId]) buildsByCityId[b.cityId] = [];
      buildsByCityId[b.cityId].push(b);
    }
    for (const cityId of Object.keys(buildsByCityId)) {
      const cityBuilds = buildsByCityId[cityId];
      for (const b of cityBuilds) {
        try {
          const freshBuildings = await prisma.cityBuilding.findMany({ where: { cityId: b.cityId } });
          const isFieldBuilding = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(b.buildingKey);
          const existing = isFieldBuilding ? freshBuildings.find(x => x.key === b.buildingKey && x.slot === b.slot) : freshBuildings.find(x => x.key === b.buildingKey);
          if (existing) { await prisma.cityBuilding.update({ where: { id: existing.id }, data: { level: b.targetLevel } }); }
          else {
            const usedSlots = new Set(freshBuildings.map(x => x.slot));
            let newSlot = b.slot || 1;
            while (usedSlots.has(newSlot)) newSlot++;
            await prisma.cityBuilding.create({ data: { cityId: b.cityId, key: b.buildingKey, slot: newSlot, level: b.targetLevel } });
          }
          await prisma.buildQueueItem.delete({ where: { id: b.id } });
          console.log(`[BUILD] ${b.buildingKey} niveau ${b.targetLevel} terminé`);
        } catch (buildErr) {
          console.error(`[BUILD ERROR] ${b.buildingKey}:`, buildErr.message);
          try { await prisma.buildQueueItem.delete({ where: { id: b.id } }); } catch (e) {}
        }
      }
      const remainingRunning = await prisma.buildQueueItem.count({ where: { cityId, status: 'RUNNING' } });
      const slotsToStart = config.build.maxRunning - remainingRunning;
      if (slotsToStart > 0) {
        const nextQueued = await prisma.buildQueueItem.findMany({ where: { cityId, status: 'QUEUED' }, orderBy: { slot: 'asc' }, take: slotsToStart });
        for (const next of nextQueued) {
          const buildingDef = buildingsData.find(bd => bd.key === next.buildingKey);
          const baseTime = buildingDef?.timeL1Sec || 60;
          const durationSec = Math.floor(baseTime * Math.pow(config.build.timeMultiplierBase, next.targetLevel - 1));
          const endsAt = new Date(now.getTime() + durationSec * 1000);
          await prisma.buildQueueItem.update({ where: { id: next.id }, data: { status: 'RUNNING', startedAt: now, endsAt } });
          console.log(`[BUILD] Demarrage ${next.buildingKey} niveau ${next.targetLevel}`);
        }
      }
    }

    // ========== RECRUITMENT DONE ==========
    const recruits = await prisma.recruitQueueItem.findMany({
      where: { status: 'RUNNING', endsAt: { lte: now } },
      include: { city: { include: { armies: { include: { units: true } } } } }
    });
    for (const r of recruits) {
      const garrison = r.city.armies.find(a => a.isGarrison);
      if (garrison) {
        const unit = unitsData.find(u => u.key === r.unitKey);
        const existing = garrison.units.find(u => u.unitKey === r.unitKey);
        if (existing) { await prisma.armyUnit.update({ where: { id: existing.id }, data: { count: existing.count + r.count } }); }
        else { await prisma.armyUnit.create({ data: { armyId: garrison.id, unitKey: r.unitKey, tier: unit?.tier || 'base', count: r.count } }); }
      }
      await prisma.recruitQueueItem.delete({ where: { id: r.id } });
      console.log(`[RECRUIT] ${r.count}x ${r.unitKey}`);
    }

    // ========== EXPEDITIONS DONE ==========
    const expeditions = await prisma.expedition.findMany({
      where: { status: 'IN_PROGRESS', endsAt: { lte: now } },
      include: { player: { include: { hero: true } } }
    });
    for (const exp of expeditions) {
      const army = await prisma.army.findUnique({ where: { id: exp.armyId }, include: { units: true } });
      const playerPower = army ? army.units.reduce((sum, u) => sum + u.count * 10, 0) : 0;
      const won = playerPower > exp.enemyPower * 0.7;
      let xpGained = 0, lootGained = null;
      if (won) {
        xpGained = Math.floor(exp.enemyPower * 0.25 / 100);
        if (exp.player.hero) {
          const hero = exp.player.hero;
          let remainingXp = hero.xp + xpGained;
          let newLevel = hero.level, newXpToNext = hero.xpToNextLevel, newStatPoints = hero.statPoints;
          while (remainingXp >= newXpToNext) {
            remainingXp -= newXpToNext;
            newLevel++;
            newXpToNext = Math.floor(newXpToNext * 1.5);
            newStatPoints += 4;
          }
          await prisma.hero.update({ where: { id: hero.id }, data: { xp: remainingXp, level: newLevel, xpToNextLevel: newXpToNext, statPoints: newStatPoints } });
        }
        const lootChance = { COMMON: 0.5, RARE: 0.3, EPIC: 0.15, LEGENDARY: 0.05 }[exp.lootTier] || 0.5;
        if (Math.random() < lootChance) {
          lootGained = { gold: Math.floor(50 + Math.random() * 100 * exp.difficulty) };
          await prisma.player.update({ where: { id: exp.playerId }, data: { gold: { increment: lootGained.gold } } });
        }
      }
      await prisma.expedition.update({ where: { id: exp.id }, data: { status: 'COMPLETED', won, xpGained, lootGained } });
      if (army) { await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE' } }); }
      console.log(`[EXPEDITION] ${won ? 'Victoire' : 'Defaite'} +${xpGained}XP`);
    }

    // Generate new expeditions
    if (Math.random() < (30 / 3600)) {
      const players = await prisma.player.findMany({ select: { id: true } });
      for (const p of players) {
        const count = await prisma.expedition.count({ where: { playerId: p.id, status: 'AVAILABLE' } });
        if (count < 15) await createExpedition(p.id);
      }
    }

    // ========== ARMY MOVEMENT & COMBAT ==========
    const movingArmies = await prisma.army.findMany({
      where: { status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'COLLECTING'] }, arrivalAt: { lte: now } },
      include: { units: true, owner: true, city: true, hero: true }
    });

    for (const army of movingArmies) {
      try {
        await prisma.army.update({ where: { id: army.id }, data: { x: army.targetX, y: army.targetY } });

        if (army.missionType === 'MOVE_TO_HARVEST') {
          const harvestNode = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
          if (harvestNode && !harvestNode.hasDefenders) {
            await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: harvestNode.resourceType } });
            await prisma.resourceNode.update({ where: { id: harvestNode.id }, data: { hasPlayerArmy: true } }).catch(e => console.error(`[HARVEST ARRIVE] Failed:`, e.message));
          } else {
            await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, targetX: null, targetY: null, arrivalAt: null, targetResourceId: null, harvestStartedAt: null, harvestResourceType: null } });
          }
        } else if (army.missionType === 'RAID_RESOURCE') {
          const armiesRouter = require('../routes/armies');
          const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
          if (node) {
            const result = await armiesRouter.resolveTribteCombat(army, node, army.ownerId);
            if (result.success) {
              await armiesRouter.collectResourceLoot(army, node, army.ownerId);
            }
            await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', missionType: 'RETURNING', targetX: army.x, targetY: army.y, arrivalAt: new Date(Date.now() + 60000) } });
          } else {
            await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, mission: null, targetX: null, targetY: null, targetResourceId: null, arrivalAt: null } });
          }
        } else if (army.missionType === 'MOVE' || army.status === 'MOVING') {
          await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null } });
        } else if (army.missionType === 'RETURN' || army.status === 'RETURNING') {
          if (army.cityId) {
            const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
            if (homeCity) {
              await prisma.city.update({ where: { id: homeCity.id }, data: { wood: Math.min(homeCity.wood + army.carryWood, homeCity.maxStorage), stone: Math.min(homeCity.stone + army.carryStone, homeCity.maxStorage), iron: Math.min(homeCity.iron + army.carryIron, homeCity.maxStorage), food: Math.min(homeCity.food + army.carryFood, homeCity.maxFoodStorage) } });
            }
          }
          await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null, carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 } });
        } else if (army.missionType === 'ATTACK' || army.status === 'ATTACKING') {
          await processAttack(army, now);
        } else if (army.missionType === 'RAID' || army.status === 'RAIDING') {
          await processRaid(army, now);
        } else if (army.missionType === 'SPY' || army.status === 'SPYING') {
          await processSpy(army, now);
        } else if (army.missionType === 'TRANSPORT' || army.status === 'TRANSPORTING') {
          await processTransport(army, now);
        } else if (army.missionType === 'COLLECT_RESOURCE') {
          const node = await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } });
          if (node && !node.hasDefenders) {
            await prisma.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, missionType: 'HARVEST', harvestStartedAt: new Date(), harvestResourceType: node.resourceType, arrivalAt: null } });
            await prisma.resourceNode.update({ where: { id: node.id }, data: { hasPlayerArmy: true } });
          } else {
            await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null, targetResourceId: null } });
          }
        }
      } catch (armyError) {
        console.error(`[ARMY ERROR] ${army.id}:`, armyError.message);
      }
    }

    // ========== HARVESTING ==========
    await processHarvesting(now);

    // ========== CLEANUP orphaned flags ==========
    const orphanedNodes = await prisma.$executeRaw`
      UPDATE "ResourceNode" SET "hasPlayerArmy" = false, "lastArmyDeparture" = NOW()
      WHERE "hasPlayerArmy" = true AND id NOT IN (
        SELECT "targetResourceId" FROM "Army" WHERE "targetResourceId" IS NOT NULL AND status = 'HARVESTING'
      )
    `;
    if (orphanedNodes > 0) console.log(`[CLEANUP] ${orphanedNodes} orphaned hasPlayerArmy flags reset`);

    // ========== UPDATE POPULATION ==========
    // Batch update all players at once instead of N+1 individual queries
    await prisma.$executeRaw`
      UPDATE "Player" p SET population = COALESCE(sub.pop, 0)
      FROM (
        SELECT c."playerId", SUM(cb.level * 5) as pop
        FROM "City" c
        JOIN "CityBuilding" cb ON cb."cityId" = c.id
        GROUP BY c."playerId"
      ) sub
      WHERE p.id = sub."playerId"
    `;

    // ========== TRIBE RESPAWN ==========
    await processTribeRespawn(now);

    // ========== RESOURCE NODE REGEN ==========
    const regenCutoff = new Date(now.getTime() - config.tick.regenDelayMinutes * 60000);
    const regenResult = await prisma.$executeRaw`
      UPDATE "ResourceNode" SET amount = LEAST(amount + FLOOR("regenRate" / 2.0 * ${TICK_HOURS}), "maxAmount")
      WHERE amount < "maxAmount" AND "hasPlayerArmy" = false
        AND ("lastArmyDeparture" IS NULL OR "lastArmyDeparture" <= ${regenCutoff})
    `;
    if (regenResult > 0) console.log(`[REGEN] ${regenResult} resource nodes regenerated`);

  } catch (e) {
    console.error('Tick error:', e);
  } finally {
    tickRunning = false;
  }
}

// ========== SUB-PROCESSORS ==========

async function processAttack(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId }, include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true } });
  if (!targetCity) return;
  const defenderUnits = targetCity.armies.flatMap(a => a.units);
  const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
  const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;
  const garrisonArmy = targetCity.armies.find(a => a.isGarrison);
  const result = resolveCombatDetailed(army.units, defenderUnits, wallLevel, moatLevel, army.owner.name, targetCity.player.name, army.hero, garrisonArmy?.hero);

  // Apply losses
  for (const unit of army.units) {
    const unitResult = result.attackerFinalUnits.find(u => u.key === unit.unitKey);
    const newCount = unitResult ? unitResult.remaining : 0;
    if (newCount <= 0) { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
    else { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
  }
  for (const defArmy of targetCity.armies) {
    for (const unit of defArmy.units) {
      const unitResult = result.defenderFinalUnits.find(u => u.key === unit.unitKey);
      const newCount = unitResult ? unitResult.remaining : 0;
      if (newCount <= 0) { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
      else { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
    }
  }

  // Wounded
  const defenderWounded = await calculateWoundedUnits(targetCity.id, result.defenderFinalUnits, targetCity.player.faction);
  if (defenderWounded.length > 0) await addWoundedUnits(targetCity.id, defenderWounded);
  if (army.cityId) {
    const attackerWounded = await calculateWoundedUnits(army.cityId, result.attackerFinalUnits, army.owner.faction);
    if (attackerWounded.length > 0) await addWoundedUnits(army.cityId, attackerWounded);
  }

  // Wall damage
  if (result.attackerWon) {
    const wallDamage = Math.floor(targetCity.wallMaxHp * 0.1 * (1 + result.rounds.length * 0.05));
    await prisma.city.update({ where: { id: targetCity.id }, data: { wallHp: Math.max(0, targetCity.wallHp - wallDamage) } });
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
  await prisma.battleReport.create({ data: { ...reportData, playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
  await prisma.battleReport.create({ data: { ...reportData, playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });

  // Stats (upsert to handle missing PlayerStats) - track both sides
  if (result.attackerWon) {
    await prisma.playerStats.upsert({ where: { playerId: army.ownerId }, update: { attacksWon: { increment: 1 }, unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, attacksWon: 1, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
    await prisma.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
  } else {
    await prisma.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { defensesWon: { increment: 1 }, unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, defensesWon: 1, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
    await prisma.playerStats.upsert({ where: { playerId: army.ownerId }, update: { unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
  }

  console.log(`[ATTACK] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'}`);

  // Return home
  if (army.cityId) {
    const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
    if (homeCity) {
      const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 50);
      await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000) } });
    }
  } else {
    await prisma.army.update({ where: { id: army.id }, data: { status: 'IDLE', targetX: null, targetY: null, arrivalAt: null, missionType: null } });
  }
}

async function processRaid(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId }, include: { armies: { include: { units: true, hero: true } }, buildings: true, player: true } });
  if (!targetCity) return;
  const defenderUnits = targetCity.armies.flatMap(a => a.units);
  const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
  const garrisonArmy = targetCity.armies.find(a => a.isGarrison);
  const result = resolveCombat(army.units, defenderUnits, wallLevel, army.hero, garrisonArmy?.hero);

  // Apply attacker losses
  for (const unit of army.units) {
    const newCount = Math.floor(unit.count * (1 - result.attackerLossRate * 0.5));
    if (newCount <= 0) { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
    else { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
  }

  // Apply defender losses (raids also cause casualties)
  for (const defArmy of targetCity.armies) {
    for (const unit of defArmy.units) {
      const newCount = Math.floor(unit.count * (1 - result.defenderLossRate * 0.3));
      if (newCount <= 0) { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
      else if (newCount < unit.count) { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
    }
  }

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
    // Ensure resources don't go negative
    await prisma.city.update({ where: { id: targetCity.id }, data: {
      wood: Math.max(0, targetCity.wood - carryWood),
      stone: Math.max(0, targetCity.stone - carryStone),
      iron: Math.max(0, targetCity.iron - carryIron),
      food: Math.max(0, targetCity.food - carryFood)
    } });
  }

  const raidReportData = { x: targetCity.x, y: targetCity.y, attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })), attackerLosses: { rate: result.attackerLossRate }, defenderLosses: { rate: result.defenderLossRate }, winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER', loot: result.attackerWon ? { wood: carryWood, stone: carryStone, iron: carryIron, food: carryFood } : null };
  await prisma.battleReport.create({ data: { ...raidReportData, playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
  await prisma.battleReport.create({ data: { ...raidReportData, playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });

  // Stats for raids
  if (result.attackerWon) {
    await prisma.playerStats.upsert({ where: { playerId: army.ownerId }, update: { raidsWon: { increment: 1 } }, create: { playerId: army.ownerId, raidsWon: 1 } });
  }

  console.log(`[RAID] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Raider won' : 'Defender won'}`);

  if (army.cityId) {
    const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
    if (homeCity) {
      const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 50);
      await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), carryWood, carryStone, carryIron, carryFood } });
    }
  }
}

async function processSpy(army, now) {
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
  if (army.cityId) {
    const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
    if (homeCity) {
      const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 80);
      await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000) } });
    }
  }
}

async function processTransport(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId } });
  if (targetCity) {
    await prisma.city.update({ where: { id: targetCity.id }, data: { wood: Math.min(targetCity.wood + army.carryWood, targetCity.maxStorage), stone: Math.min(targetCity.stone + army.carryStone, targetCity.maxStorage), iron: Math.min(targetCity.iron + army.carryIron, targetCity.maxStorage), food: Math.min(targetCity.food + army.carryFood, targetCity.maxFoodStorage) } });
  }
  if (army.cityId) {
    const homeCity = await prisma.city.findUnique({ where: { id: army.cityId } });
    if (homeCity) {
      const travelTime = calculateTravelTime(army.targetX, army.targetY, homeCity.x, homeCity.y, 50);
      await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 } });
    }
  }
}

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

function startGameLoop() {
  console.log(`[TICK] Game loop started (interval: ${config.tick.intervalMs}ms)`);
  return setInterval(gameTick, config.tick.intervalMs);
}

module.exports = { gameTick, startGameLoop };
