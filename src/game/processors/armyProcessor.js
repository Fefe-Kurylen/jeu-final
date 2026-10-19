// ========== ARMY MOVEMENT & COMBAT PROCESSOR ==========
// Every arrival is claimed once (Army.claimedAt) before it is resolved; a resolution that never finished
// (crash, pool timeout) is detected by the sweeper and the army is simply sent home — never replayed.

const prisma = require('../../config/database');
const { notify } = require('../../services/pushService');
const config = require('../../config');
const { unitsData, factionsData } = require('../../config/gamedata');
const { calculateTravelTime, getArmyTravelTime, getFactionBonus, getArmyCarryCapacity } = require('../../utils/calculations');
const T = require('../../utils/techEffects');   // technologies des joueurs (attaque, défense, blessés, vitesse)
const { resolveCombat, resolveCombatDetailed, heroCombatStats } = require('../../services/combatService');
const { calculateWoundedUnits, addWoundedUnits, carryWounded, depositCarriedWounded } = require('../../services/woundedService');
const { awardHeroXp } = require('../../services/heroXpService');
const { resolveTribeCombat, resolveNodeHolderCombat, collectResourceLoot, fieldBattle, sendArmyHomeTx } = require('../../services/armyService');
const { getRelation } = require('../../services/diplomacyService');
const { refreshSiegeFlag, wallDamagePerHour, wallHpToBreak, wallLevelOf, assaultTime, engineCount } = require('./siegeProcessor');
const { calculateArmyPower } = require('../../utils/calculations');
const { pillage, wearWallStructure, applyFall } = require('../../services/conquestService');
const { creditCity, plunderCity, lockCity, claimNode } = require('../../utils/db');
const fx = require('../../utils/buildingEffects');
const { updatePlayerPopulation } = require('./worldProcessor');
const { findRoute, noteObjectCell } = require('../../utils/pathfinding');

const MOVING_STATUSES = ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'FOUNDING', 'BESIEGING'];   // FOUNDING: arrivalAt = end of the foundation ; BESIEGING: arrivalAt = assault time
const TX = { timeout: 15000 };

async function processArmyMovements(now) {
  // Arrivals whose resolution started long ago and never ended: send them home instead of replaying them
  const stale = await prisma.army.findMany({
    where: { status: { in: MOVING_STATUSES }, claimedAt: { lt: new Date(now.getTime() - config.tick.claimTimeoutMinutes * 60000) } },
    include: { units: true, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true, hero: { include: { items: true } } }
  });
  for (const army of stale) {
    console.error(`[ARMY] resolution of ${army.id} (${army.status}) never completed: sending it home`);
    try { await sendArmyHome(army, army.targetX ?? army.x, army.targetY ?? army.y); } catch (e) { console.error(`[ARMY ERROR] ${army.id}:`, e.message); }
  }

  const movingArmies = await prisma.army.findMany({
    where: { status: { in: MOVING_STATUSES }, arrivalAt: { lte: now }, claimedAt: null },
    include: { units: true, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true, hero: { include: { items: true } } },
    orderBy: { arrivalAt: 'asc' },
    take: 500
  });

  for (const army of movingArmies) {
    try {
      // Claim the arrival: a second executor (or a recall landing at the same time) must not process it twice
      const claimed = await prisma.army.updateMany({ where: { id: army.id, status: army.status, arrivalAt: army.arrivalAt, claimedAt: null }, data: { x: army.targetX, y: army.targetY, claimedAt: now } });
      if (claimed.count !== 1) continue;

      if (army.status === 'BESIEGING') {
        await handleAttack(army, now);   // the siege is over: assault
      } else if (army.status === 'FOUNDING') {
        await handleFoundComplete(army, now);
      } else if (army.missionType === 'FOUND') {
        await handleFoundArrival(army, now);
      } else if (army.missionType === 'MOVE_TO_HARVEST') {
        await handleMoveToHarvest(army);
      } else if (army.missionType === 'RAID_RESOURCE') {
        await handleRaidResource(army);
      } else if (army.missionType === 'MOVE' || army.status === 'MOVING') {
        await setArmyIdle(army.id);
      } else if (army.missionType === 'RETURN' || army.status === 'RETURNING') {
        await handleReturn(army);
      } else if (army.missionType === 'BREAK_SIEGE') {
        await handleBreakSiege(army, now);
      } else if (army.missionType === 'ATTACK' || army.status === 'ATTACKING') {
        await startSiege(army, now);
      } else if (army.missionType === 'RAID' || army.status === 'RAIDING') {
        await handleRaid(army, now);
      } else if (army.missionType === 'SPY' || army.status === 'SPYING') {
        await handleSpy(army, now);
      } else if (army.missionType === 'TRANSPORT' || army.status === 'TRANSPORTING') {
        await handleTransport(army, now);
      } else {
        await setArmyIdle(army.id, { targetResourceId: null });
      }
    } catch (armyError) {
      console.error(`[ARMY ERROR] ${army.id}:`, armyError.message);
    }
  }
}

async function setArmyIdle(armyId, extraData = {}) {
  await prisma.army.update({ where: { id: armyId }, data: { status: 'IDLE', targetX: null, targetY: null, targetCityId: null, arrivalAt: null, claimedAt: null, missionType: null, ...extraData } });
}

// Sends the army back to its city at the speed of its surviving units (owner faction and hero bonuses applied).
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
  const route = await findRoute(fromX, fromY, homeCity.x, homeCity.y).catch(() => null);
  const distance = route ? route.length : null;
  const travelTime = fixedSpeed
    ? calculateTravelTime(fromX, fromY, homeCity.x, homeCity.y, fixedSpeed, faction, factionsData, distance, T.techPct(army.owner?.technologies, 'armySpeedBonusPct'))
    : getArmyTravelTime(units, fromX, fromY, homeCity.x, homeCity.y, faction, army.hero, distance, T.techPct(army.owner?.technologies, 'armySpeedBonusPct'));
  await prisma.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: homeCity.x, targetY: homeCity.y, targetCityId: null, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), departedAt: new Date(), claimedAt: null, ...extraData } });
}

// Armies physically standing in the city defend it; armies away on missions do not
function defendingArmies(city) {
  return city.armies.filter(a => a.status === 'IDLE' && a.x === city.x && a.y === city.y);
}

async function depositCarry(army, homeCity) {
  await depositCarriedWounded(army.id, homeCity.id);   // les blessés rapportés entrent à la Tente de soins
  await creditCity(prisma, homeCity.id, { wood: army.carryWood, stone: army.carryStone, iron: army.carryIron, food: army.carryFood });
  if ((army.carryGold || 0) > 0) await prisma.player.update({ where: { id: army.ownerId }, data: { gold: { increment: army.carryGold } } });
  // Settlers that did not found a city go back to the pool of their city (the capital)
  if ((army.settlers || 0) > 0) await prisma.city.update({ where: { id: homeCity.id }, data: { settlers: { increment: army.settlers } } });
  await prisma.army.update({ where: { id: army.id }, data: { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, carryGold: 0, settlers: 0 } });
}

// The node is taken conditionally: one harvesting army per node, never on a defended node
async function startHarvesting(army, nodeId) {
  return prisma.$transaction(async (tx) => {
    const node = await tx.resourceNode.findUnique({ where: { id: nodeId } });
    if (!node || !(await claimNode(tx, node.id, { playerId: army.ownerId, allianceId: army.owner?.alliance?.allianceId || null }))) return false;
    await tx.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', missionType: 'HARVEST', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt: null, claimedAt: null, harvestResourceType: node.resourceType } });
    return true;
  }, TX);
}

async function handleMoveToHarvest(army) {
  if (!army.targetResourceId || !(await startHarvesting(army, army.targetResourceId))) {
    await setArmyIdle(army.id, { targetResourceId: null, harvestResourceType: null });
  }
}

async function handleRaidResource(army) {
  const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  if (!node) {
    await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null });
    return;
  }
  const outcome = await prisma.$transaction(async (tx) => {
    // Tribe first; otherwise the army of another player holding the node; a free node is simply taken
    const fresh = await tx.resourceNode.findUnique({ where: { id: node.id } });
    if (!fresh) return { won: false, gone: true, losses: 0, loot: {} };
    const result = fresh.hasDefenders ? await resolveTribeCombat(army, fresh, army.ownerId, tx) : fresh.hasPlayerArmy ? await resolveNodeHolderCombat(army, fresh, army.ownerId, tx) : { success: true, free: true };
    const loot = result.success && !result.shared ? await collectResourceLoot(army, fresh, army.ownerId, tx, result.reportId || null) : {};
    return { won: result.success, fight: !result.free && !result.shared, holder: !fresh.hasDefenders && fresh.hasPlayerArmy, losses: result.combatResult?.attackerLosses || 0, loot };
  }, TX);
  const won = outcome.won;
  const lootText = Object.entries(outcome.loot || {}).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ');
  if (outcome.fight) {
    const who = outcome.holder ? 'l\'armée adverse' : 'la tribu';
    notify(army.ownerId, 'battle', won ? '⚔️ Point conquis' : '⚔️ Attaque repoussée', won ? `${army.name} a chassé ${who} en (${node.x}, ${node.y})${lootText ? ' : ' + lootText : ''}.` : `${army.name} a été repoussée par ${who} en (${node.x}, ${node.y}) (${outcome.losses} pertes). Rapport disponible.`, { tab: 'reports' });
  }
  // A victorious army stays and harvests what is left when nobody else holds the node; otherwise it brings its loot home
  if (!won || !(await startHarvesting(army, node.id))) await sendArmyHome(army, node.x, node.y, { targetResourceId: null });
}

async function handleReturn(army) {
  const homeCity = army.cityId ? await prisma.city.findUnique({ where: { id: army.cityId } }) : null;
  if (homeCity) await depositCarry(army, homeCity);
  await setArmyIdle(army.id, { harvestResourceType: null });
}

// ---------- Secondary cities (GDD): a settler army reaches a free node, then the foundation takes 24 h ----------
async function handleFoundArrival(army, now) {
  const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  const free = node && !node.cityId && !node.hasDefenders && !node.hasPlayerArmy && (army.settlers || 0) > 0;
  if (!free) {
    await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null, harvestResourceType: null });
    notify(army.ownerId, 'battle', '🏗️ Fondation impossible', `Le point (${army.targetX}, ${army.targetY}) n'est plus libre : ${army.name} rentre avec le colon.`, { tab: 'map' });
    return;
  }
  const taken = await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: false, hasDefenders: false, cityId: null }, data: { hasPlayerArmy: true } });
  if (taken.count !== 1) { await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null, harvestResourceType: null }); return; }
  const endsAt = new Date(now.getTime() + fx.cityFoundationTimeSec() * 1000);
  await prisma.army.update({ where: { id: army.id }, data: { status: 'FOUNDING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, arrivalAt: endsAt, departedAt: now, claimedAt: null } });
  notify(army.ownerId, 'build_done', '🏗️ Fondation commencée', `${army.name} fonde une ville en (${node.x}, ${node.y}) : elle sera prête dans ${Math.round(fx.cityFoundationTimeSec() / 3600)} h.`, { tab: 'map' });
}

async function handleFoundComplete(army, now) {
  const created = await prisma.$transaction(async (tx) => {
    const node = army.targetResourceId ? await tx.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
    const fresh = await tx.army.findUnique({ where: { id: army.id }, include: { owner: true } });
    if (!node || node.cityId || !fresh || (fresh.settlers || 0) < 1) return null;
    const colonies = await tx.city.count({ where: { playerId: army.ownerId, isCapital: false } });
    const name = (fresh.harvestResourceType || '').trim() || `Colonie de ${fresh.owner?.name || 'joueur'} ${colonies + 1}`;
    const city = await tx.city.create({ data: {
      playerId: army.ownerId, name, x: node.x, y: node.y, isCapital: false,
      wood: fresh.carryWood, stone: fresh.carryStone, iron: fresh.carryIron, food: fresh.carryFood
    } });
    await tx.cityBuilding.create({ data: { cityId: city.id, key: 'MAIN_HALL', slot: 0, level: 1 } });
    await tx.army.create({ data: { ownerId: army.ownerId, cityId: city.id, name: 'Garnison', x: node.x, y: node.y, status: 'IDLE', isGarrison: true } });
    // The node is the city's ground now: no tribe, no harvest, respawns if the city disappears
    await tx.resourceNode.update({ where: { id: node.id }, data: { cityId: city.id, hasPlayerArmy: false, hasDefenders: false, defenderPower: 0, amount: 0, lastDefeat: null, lastArmyDeparture: null } });
    await tx.army.update({ where: { id: army.id }, data: { settlers: 0, carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, harvestResourceType: null } });
    return city;
  }, TX);
  if (!created) {
    await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null, harvestResourceType: null });
    return;
  }
  noteObjectCell(created.x, created.y, 'CITY');
  try { await updatePlayerPopulation(prisma, army.ownerId); } catch (e) { /* population is recomputed by the tick */ }
  notify(army.ownerId, 'build_done', '🏛️ Ville fondée', `${created.name} est fondée en (${created.x}, ${created.y}). ${army.name} rentre à la capitale.`, { tab: 'city', cityId: created.id });
  console.log(`[FOUND] ${created.name} (${created.x}, ${created.y})`);
  await sendArmyHome({ ...army, carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, settlers: 0 }, created.x, created.y, { targetResourceId: null, harvestResourceType: null });
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
    if (newCount <= 0) await tx.armyUnit.deleteMany({ where: { id: unit.id } });
    else if (newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
  }
}

// The target city as it stands at the moment of the fight, read under its row lock so that no
// unit transfer, recruit or other battle changes it between the read and the write of the losses.
const CITY_FOR_BATTLE = { armies: { include: { units: true, hero: { include: { items: true } } } }, buildings: true, player: true };
async function lockTargetCity(tx, cityId) {
  if (!cityId) return null;
  await lockCity(tx, cityId);
  return tx.city.findUnique({ where: { id: cityId }, include: CITY_FOR_BATTLE });
}

async function handleAttack(army, now) {
  const battle = await prisma.$transaction(async (tx) => {
    const targetCity = await lockTargetCity(tx, army.targetCityId);
    if (!targetCity) return null;
    const attackerUnits = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    const defenders = defendingArmies(targetCity);
    const defenderUnits = defenders.flatMap(a => a.units);
    // The siege has worn the wall down: it protects in proportion to the hit points it has left (GDD wallHpPercent)
    const wallBuildingLevel = wallLevelOf(targetCity.buildings);
    const wallHpPct = wallBuildingLevel > 0 && targetCity.wallMaxHp > 0 ? Math.max(0, Math.min(1, targetCity.wallHp / targetCity.wallMaxHp)) : 0;
    const wallLevel = wallBuildingLevel * wallHpPct;
    const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;
    const defenderHero = defenders.find(a => a.hero)?.hero || null;
    // Technologies of both players: Art de la guerre (attack), Discipline (defence); Médecine is applied to the wounded below
    const [atkTech, defTech] = await Promise.all([tx.playerTechnology.findMany({ where: { playerId: army.ownerId } }), tx.playerTechnology.findMany({ where: { playerId: targetCity.playerId } })]);
    const techMods = { attacker: { atk: T.techBonusMult(atkTech, 'attackBonusPct'), def: T.techBonusMult(atkTech, 'defenseBonusPct') }, defender: { atk: T.techBonusMult(defTech, 'attackBonusPct'), def: T.techBonusMult(defTech, 'defenseBonusPct') } };
    const result = resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel, moatLevel, army.owner.name, targetCity.player.name, heroCombatStats(army.hero), heroCombatStats(defenderHero), army.owner.faction, targetCity.player.faction, fx.defenseBonusPct(targetCity.buildings), techMods);

    await applyLosses(tx, attackerUnits, result.attackerFinalUnits);
    for (const defArmy of defenders) await applyLosses(tx, defArmy.units, result.defenderFinalUnits);
    // GDD: only siege engines damage the wall, during the siege (siegeProcessor); a breached wall regenerates in 24 h
    const wallDamageDone = wallBuildingLevel > 0 ? Math.max(0, Math.round(targetCity.wallMaxHp - targetCity.wallHp)) : 0;
    const siegeMinutes = army.status === 'BESIEGING' && army.departedAt ? Math.round((now - new Date(army.departedAt)) / 60000) : 0;
    // Won assault: the stock is pillaged and the wall's health drops; at 0 the city falls (after this transaction)
    let pillaged = null, structure = null;
    if (result.attackerWon) {
      pillaged = await pillage(tx, targetCity, army, result.attackerFinalUnits.map(u => ({ unitKey: u.key, count: u.remaining })));
      structure = await wearWallStructure(tx, targetCity);
    }
    const reportData = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: result.attackerInitialUnits, defenderUnits: result.defenderInitialUnits,
      attackerLosses: { rate: result.attackerLossRate, units: result.attackerFinalUnits, totalKilled: result.attackerTotalKilled },
      defenderLosses: { rate: result.defenderLossRate, units: result.defenderFinalUnits, totalKilled: result.defenderTotalKilled },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { rounds: result.rounds, wallDamage: wallDamageDone, wallHpPct: Math.round(wallHpPct * 100), siegeMinutes, ...(pillaged ? pillaged.carried : {}), pillaged: pillaged ? pillaged.taken : null, wallStructure: structure ? { before: Math.round(structure.before * 100), after: Math.round(structure.after * 100), assaultsLeft: Math.round(structure.after * structure.needed), fallen: structure.fallen, fate: structure.fallen ? (targetCity.isCapital ? 'RELOCATED' : 'RAZED') : null } : null, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, duration: result.rounds.length, type: 'ATTACK' }
    };
    await tx.battleReport.create({ data: { ...reportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...reportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    const winnerId = result.attackerWon ? army.ownerId : targetCity.playerId;
    const winField = result.attackerWon ? 'attacksWon' : 'defensesWon';
    await tx.playerStats.upsert({ where: { playerId: winnerId }, update: { [winField]: { increment: 1 } }, create: { playerId: winnerId, [winField]: 1 } });
    await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
    await tx.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
    return { targetCity, result, defenderHero, atkTech, defTech, structure };
  }, TX);
  if (!battle) {
    await sendArmyHome(army, army.targetX, army.targetY);
    if (army.targetCityId) await refreshSiegeFlag(prisma, army.targetCityId);
    return;
  }
  const { targetCity, result, defenderHero, atkTech, defTech, structure } = battle;
  notify(targetCity.playerId, 'battle', result.attackerWon ? '🛡️ Ville attaquée' : '🛡️ Défense victorieuse', `${targetCity.name} a été attaquée par ${army.owner.name} : ${result.attackerWon ? 'défaite' : 'victoire'}. Rapport disponible.`, { tab: 'reports' });
  notify(army.ownerId, 'battle', result.attackerWon ? '⚔️ Victoire' : '⚔️ Défaite', `Votre attaque sur ${targetCity.name} est terminée : ${result.attackerWon ? 'victoire' : 'défaite'}. Rapport disponible.`, { tab: 'reports' });

  // Hero XP: GDD 0.25 per enemy unit destroyed (winner x1, loser x0.3)
  try {
    const atkXp = Math.floor(result.defenderTotalKilled * config.combat.heroXpPerKill * (result.attackerWon ? 1 : 0.3));
    const defXp = Math.floor(result.attackerTotalKilled * config.combat.heroXpPerKill * (result.attackerWon ? 0.3 : 1));
    if (army.heroId) await awardHeroXp(army.heroId, atkXp);
    if (defenderHero) await awardHeroXp(defenderHero.id, defXp);
  } catch (xpErr) { console.error('[HERO XP]', xpErr.message); }

  try {
    const defenderWounded = await calculateWoundedUnits(targetCity.id, result.defenderFinalUnits, targetCity.player.faction, T.techPct(defTech, 'woundedBonusPct'));
    if (defenderWounded.length > 0) await addWoundedUnits(targetCity.id, defenderWounded);
    if (army.cityId) {
      const attackerWounded = await calculateWoundedUnits(army.cityId, result.attackerFinalUnits, army.owner.faction, T.techPct(atkTech, 'woundedBonusPct'));
      if (attackerWounded.length > 0) await carryWounded(prisma, army.id, attackerWounded);   // ils rentrent avec l'armée
    }
  } catch (woundErr) { console.error('[WOUNDED]', woundErr.message); }

  console.log(`[ATTACK] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'}`);
  if (structure?.fallen) {
    try {
      const fall = await applyFall(targetCity.id, army.id);
      if (fall?.kind === 'RAZED') {
        notify(targetCity.playerId, 'battle', '🔥 Ville rasée', `${targetCity.name} est tombée sous les assauts de ${army.owner.name} et a été rasée.`, { tab: 'reports' });
        notify(army.ownerId, 'battle', '🔥 Ville rasée', `${targetCity.name} est tombée : la ville est rasée.`, { tab: 'reports' });
        try { await updatePlayerPopulation(prisma, targetCity.playerId); } catch (e) { /* recomputed by the tick */ }
      } else if (fall?.kind === 'RELOCATED') {
        notify(targetCity.playerId, 'battle', '🏃 Capitale déplacée', `${targetCity.name} est tombée sous les assauts de ${army.owner.name} : la cour s'enfuit et rebâtit la capitale en (${fall.to.x}, ${fall.to.y}).`, { tab: 'city', cityId: targetCity.id });
        notify(army.ownerId, 'battle', '🏃 Capitale en fuite', `${targetCity.name} est tombée : sa cour a fui vers un lieu inconnu.`, { tab: 'reports' });
      }
      if (fall) console.log(`[FALL] ${targetCity.name} ${fall.kind}`);
    } catch (fallErr) { console.error('[FALL]', fallErr.message); }
  }
  await sendArmyHome(army, army.targetX, army.targetY);
  await refreshSiegeFlag(prisma, targetCity.id);   // the siege is lifted when no other army camps before the city
}

// An attack that arrives camps before the city: the siege starts (GDD combat_config.siege.isState). The city's owner
// and their alliance are warned; the assault time follows the wall (siegeProcessor).
async function startSiege(army, now) {
  const started = await prisma.$transaction(async (tx) => {
    if (!army.targetCityId) return null;
    await lockCity(tx, army.targetCityId);
    const city = await tx.city.findUnique({ where: { id: army.targetCityId }, include: { buildings: { where: { key: 'WALL' } }, player: { select: { id: true, name: true, faction: true, alliance: { select: { allianceId: true } } } } } });
    if (!city) return null;
    if (!(await getRelation(army.ownerId, city.playerId, tx)).canAttack) return null;   // alliance or peace signed on the way
    const units = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    if (!units.length || engineCount(units) === 0) return null;   // no siege without siege engines
    const assaultAt = assaultTime(now, wallHpToBreak(city), wallDamagePerHour({ units, owner: army.owner }), now, city.player?.faction);
    const ok = await tx.army.updateMany({ where: { id: army.id, claimedAt: now }, data: { status: 'BESIEGING', x: city.x, y: city.y, departedAt: now, arrivalAt: assaultAt, claimedAt: null } });
    if (ok.count !== 1) return null;
    await tx.city.update({ where: { id: city.id }, data: { isSieged: true } });
    return { city, assaultAt };
  }, TX);
  if (!started) { await sendArmyHome(army, army.targetX, army.targetY); return; }
  const { city, assaultAt } = started;
  // the city's troops are at least 3 times stronger than the army that arrives: they sally out at once
  const riposte = await cityRiposte(army.id, city.id).catch(e => { console.error('[RIPOSTE]', e.message); return null; });
  if (riposte) {
    const { won, cityName } = riposte;
    notify(city.playerId, 'battle', won ? '🛡️ Riposte victorieuse' : '🛡️ Riposte repoussée', won ? `Les troupes de ${cityName} ont chassé l'armée de ${army.owner?.name || 'l\'ennemi'} dès son arrivée.` : `Les troupes de ${cityName} ont riposté contre ${army.owner?.name || 'l\'ennemi'} mais ont été repoussées : le siège commence.`, { tab: 'reports' });
    notify(army.ownerId, 'battle', won ? '⚔️ Repoussée devant la ville' : '⚔️ Riposte repoussée', won ? `${army.name} a été chassée par la riposte de ${cityName}.` : `${army.name} a repoussé la riposte de ${cityName} : le siège commence.`, { tab: 'reports' });
    if (won) return;
  }
  const minutes = Math.max(1, Math.round((assaultAt - now) / 60000));
  notify(city.playerId, 'battle', '🏰 Ville assiégée', `${army.owner?.name || 'Un joueur'} assiège ${city.name} : assaut dans ${minutes} min environ. Attaquez l'armée qui assiège ou appelez vos alliés.`, { tab: 'city', cityId: city.id });
  const allianceId = city.player?.alliance?.allianceId;
  if (allianceId) {
    const members = await prisma.allianceMember.findMany({ where: { allianceId, playerId: { not: city.playerId } }, select: { playerId: true } });
    for (const m of members) notify(m.playerId, 'battle', '🏰 Alliée assiégée', `${city.name} (${city.player.name}) est assiégée par ${army.owner?.name || 'un joueur'} : assaut dans ${minutes} min environ.`, { tab: 'map' });
  }
  notify(army.ownerId, 'battle', '🏰 Siège commencé', `${army.name} assiège ${city.name} : assaut dans ${minutes} min environ.`, { tab: 'armies' });
  console.log(`[SIEGE] ${army.owner?.name} assiège ${city.name}, assaut à ${assaultAt.toISOString()}`);
}

// Automatic riposte: when the troops standing in the city (garrison and armies at home) are at least riposteRatio times
// stronger than the army that has just arrived, they sally out against it at once (open-field battle, no wall). Won: the
// besieger goes home and the siege is lifted; lost: the siege goes on. Returns null when there is no riposte.
async function cityRiposte(besiegerId, cityId) {
  return prisma.$transaction(async (tx) => {
    await lockCity(tx, cityId);
    const city = await tx.city.findUnique({ where: { id: cityId }, include: { armies: { include: { units: true, hero: { include: { items: true } } } }, player: { include: { technologies: true } } } });
    const besieger = await tx.army.findFirst({ where: { id: besiegerId, status: 'BESIEGING', claimedAt: null }, include: SIEGE_CAMP });
    if (!city || !besieger) return null;
    const home = defendingArmies(city).filter(a => a.units.some(u => u.count > 0));
    const units = home.flatMap(a => a.units.filter(u => u.count > 0));
    if (!units.length) return null;
    const defPower = calculateArmyPower(units, unitsData), atkPower = calculateArmyPower(besieger.units, unitsData);
    if (defPower < atkPower * config.combat.siege.riposteRatio) return null;
    const lead = home.find(a => a.isGarrison) || home[0];
    const withHero = home.find(a => a.hero);
    const sally = { id: lead.id, ownerId: city.playerId, cityId: city.id, name: `Garnison de ${city.name}`, owner: city.player, hero: withHero?.hero || null, heroId: withHero?.heroId || null, units };
    const { combat } = await fieldBattle(tx, sally, [besieger], city.playerId, { x: city.x, y: city.y, where: `Riposte de ${city.name}`, type: 'RIPOSTE', rounds: { type: 'RIPOSTE', cityId: city.id }, attackerAtHome: true });
    if (combat.attackerWon) await sendArmyHomeTx(tx, besieger);
    await refreshSiegeFlag(tx, city.id);
    return { won: combat.attackerWon, cityName: city.name };
  }, TX);
}

// The city's owner, its alliance or an allied alliance attacks the armies besieging it: open-field battle (no wall),
// the beaten besiegers go home and the siege is lifted; the breaking army goes home either way.
const SIEGE_CAMP = { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true };
async function handleBreakSiege(army, now) {
  const outcome = await prisma.$transaction(async (tx) => {
    if (!army.targetCityId) return null;
    await lockCity(tx, army.targetCityId);
    const city = await tx.city.findUnique({ where: { id: army.targetCityId }, select: { id: true, name: true, x: true, y: true, playerId: true } });
    if (!city) return null;
    const camp = await tx.army.findMany({ where: { status: 'BESIEGING', targetCityId: city.id, claimedAt: null, NOT: { ownerId: army.ownerId } }, include: SIEGE_CAMP });
    const hostile = [];
    for (const b of camp) if (b.units.some(u => u.count > 0) && (await getRelation(army.ownerId, b.ownerId, tx)).canAttack) hostile.push(b);
    const units = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    if (!hostile.length || !units.length) return { city, fought: false };
    const { combat, defenderName } = await fieldBattle(tx, { ...army, units }, hostile, army.ownerId, { x: city.x, y: city.y, where: `Siège de ${city.name}`, type: 'SIEGE_BREAK', rounds: { type: 'SIEGE_BREAK', cityId: city.id } });
    if (combat.attackerWon) for (const b of hostile) await sendArmyHomeTx(tx, b);
    await refreshSiegeFlag(tx, city.id);
    return { city, fought: true, won: combat.attackerWon, owners: [...new Set(hostile.map(b => b.ownerId))], defenderName };
  }, TX);
  if (outcome?.fought) {
    const { city, won, owners, defenderName } = outcome;
    notify(army.ownerId, 'battle', won ? '⚔️ Siège brisé' : '⚔️ Siège maintenu', won ? `${army.name} a chassé ${defenderName} de devant ${city.name}.` : `${army.name} a été repoussée par l'armée qui assiège ${city.name}.`, { tab: 'reports' });
    for (const id of owners) notify(id, 'battle', won ? '🏰 Siège levé' : '🏰 Sortie repoussée', won ? `Votre siège de ${city.name} a été brisé par ${army.owner?.name || 'un joueur'}.` : `Votre armée devant ${city.name} a repoussé ${army.owner?.name || 'une armée'}.`, { tab: 'reports' });
    if (won && city.playerId !== army.ownerId) notify(city.playerId, 'battle', '🏰 Siège levé', `${army.owner?.name || 'Un allié'} a brisé le siège de ${city.name}.`, { tab: 'city', cityId: city.id });
  }
  // Home: an army of the besieged city itself is back inside at once
  const home = army.cityId ? await prisma.city.findUnique({ where: { id: army.cityId } }) : null;
  if (home && outcome?.city && home.id === outcome.city.id) {
    await setArmyIdle(army.id, { x: home.x, y: home.y });
    await depositCarry(army, home);
  } else {
    await sendArmyHome(army, army.targetX, army.targetY);
  }
}


// GDD: one raid per target city per attacker per 24h — checked again when the raid lands, so several
// armies launched together cannot all plunder
async function raidedRecently(tx, attackerId, targetCity, now) {
  const since = new Date(now.getTime() - config.combat.raidCooldownHours * 3600000);
  const recent = await tx.battleReport.findFirst({ where: { attackerId, playerId: attackerId, defenderId: targetCity.playerId, x: targetCity.x, y: targetCity.y, createdAt: { gt: since }, loot: { path: ['type'], equals: 'RAID' } }, select: { id: true } });
  return !!recent;
}

async function handleRaid(army, now) {
  let loot = { wood: 0, stone: 0, iron: 0, food: 0 };
  const raid = await prisma.$transaction(async (tx) => {
    const targetCity = await lockTargetCity(tx, army.targetCityId);
    if (!targetCity) return null;
    if (await raidedRecently(tx, army.ownerId, targetCity, now)) return { skipped: true, targetCity };
    const attackerUnits = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    const defenders = defendingArmies(targetCity);
    const defenderUnits = defenders.flatMap(a => a.units);
    const wallLevel = targetCity.buildings.find(b => b.key === 'WALL')?.level || 0;
    const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;
    const defenderHero = defenders.find(a => a.hero)?.hero || null;
    // Technologies: Art de la guerre (attacker's power), Discipline (defender's power)
    const [raidAtkTech, raidDefTech] = await Promise.all([tx.playerTechnology.findMany({ where: { playerId: army.ownerId } }), tx.playerTechnology.findMany({ where: { playerId: targetCity.playerId } })]);
    const result = resolveCombat(attackerUnits, defenderUnits, wallLevel, heroCombatStats(army.hero), heroCombatStats(defenderHero), { moatLevel, defenderFaction: targetCity.player.faction, defenseBonusPct: fx.defenseBonusPct(targetCity.buildings), attackerBonusPct: T.techPct(raidAtkTech, 'attackBonusPct'), defenderBonusPct: T.techPct(raidDefTech, 'defenseBonusPct') });

    const survivors = attackerUnits.map(u => ({ ...u, newCount: Math.floor(u.count * (1 - result.attackerLossRate)) }));

    // GDD: the loot is at most 30% of what the SURVIVING raiders can carry, split by what the city
    // still has after the hideout; the stock is taken atomically at resolution time
    if (result.attackerWon) {
      const transportMultiplier = 1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100;
      const carry = getArmyCarryCapacity(survivors.map(u => ({ unitKey: u.unitKey, count: u.newCount })), unitsData, army.hero) * transportMultiplier;
      const budget = carry * config.combat.raidLootPctOfCarry;
      const hideout = targetCity.buildings.find(b => b.key === 'HIDEOUT');
      let hideoutProtection = (hideout?.level || 0) * config.hideout.protectionPerLevel;
      hideoutProtection *= (1 + getFactionBonus(targetCity.player.faction, 'hideoutCapacity', factionsData) / 100);
      hideoutProtection = Math.min(hideoutProtection, config.hideout.maxProtection);
      // Great Warehouse / Great Silo: an absolute amount no raid can touch, on top of the hideout share
      const protectedStock = fx.protectedStorage(targetCity.buildings);
      const available = {};
      for (const r of ['wood', 'stone', 'iron', 'food']) available[r] = Math.max(0, (targetCity[r] - protectedStock[r]) * (1 - hideoutProtection) * config.hideout.raidStealRate);
      const totalAvailable = Object.values(available).reduce((s, v) => s + v, 0);
      const want = {};
      for (const r of Object.keys(available)) want[r] = totalAvailable > 0 ? Math.floor(Math.min(available[r], budget * available[r] / totalAvailable)) : 0;
      loot = want;
    }

    for (const unit of survivors) {
      if (unit.newCount <= 0) await tx.armyUnit.deleteMany({ where: { id: unit.id } });
      else if (unit.newCount !== unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: unit.newCount } });
    }
    for (const defArmy of defenders) {
      for (const unit of defArmy.units) {
        const newCount = Math.floor(unit.count * (1 - result.defenderLossRate));
        if (newCount <= 0) await tx.armyUnit.deleteMany({ where: { id: unit.id } });
        else if (newCount < unit.count) await tx.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } });
      }
    }
    if (result.attackerWon) loot = await plunderCity(tx, targetCity.id, loot);
    const raidReportData = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: attackerUnits.map(u => ({ key: u.unitKey, count: u.count })),
      defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })),
      attackerLosses: { rate: result.attackerLossRate, totalKilled: attackerUnits.reduce((s, u) => s + Math.floor(u.count * result.attackerLossRate), 0) },
      defenderLosses: { rate: result.defenderLossRate, totalKilled: defenderUnits.reduce((s, u) => s + Math.floor(u.count * result.defenderLossRate), 0) },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { ...loot, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, type: 'RAID' }
    };
    await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    if (result.attackerWon) {
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { raidsWon: { increment: 1 } }, create: { playerId: army.ownerId, raidsWon: 1 } });
    }
    return { targetCity, result };
  }, TX);
  if (!raid) {
    await sendArmyHome(army, army.targetX, army.targetY);
    return;
  }
  if (raid.skipped) {
    console.log(`[RAID] ${army.owner.name} vs ${raid.targetCity.player.name}: already raided in the last ${config.combat.raidCooldownHours}h, army turns back`);
    notify(army.ownerId, 'battle', '↩️ Raid annulé', `${raid.targetCity.name} a déjà été pillée récemment : votre armée rentre sans combattre.`, { tab: 'army' });
    await sendArmyHome(army, army.targetX, army.targetY);
    return;
  }
  const { targetCity, result } = raid;

  console.log(`[RAID] ${army.owner.name} vs ${targetCity.player.name}: ${result.attackerWon ? 'Raider won' : 'Defender won'}`);
  await sendArmyHome(army, army.targetX, army.targetY, { carryWood: loot.wood, carryStone: loot.stone, carryIron: loot.iron, carryFood: loot.food });
}

async function handleSpy(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId || '' }, include: { armies: { include: { units: true } }, buildings: true, player: true } });
  if (targetCity) {
    const present = defendingArmies(targetCity);
    const spyPower = army.units.reduce((sum, u) => sum + u.count, 0);
    const defenderPower = present.flatMap(a => a.units).reduce((sum, u) => sum + u.count, 0);
    // Watchtower: the spies may be caught; the defender then gets a report (who, from level 15)
    const watchtower = fx.watchtowerLevel(targetCity.buildings);
    const caught = Math.random() < fx.counterSpyChance(watchtower);
    const successChance = Math.min(0.9, 0.5 + (spyPower / Math.max(1, defenderPower)) * 0.3);
    const success = !caught && Math.random() < successChance;
    if (caught) {
      const named = watchtower >= fx.watchtowerNamesSpyAt();
      await prisma.spyReport.create({ data: { playerId: targetCity.playerId, targetPlayerId: named ? army.ownerId : null, targetCityId: targetCity.id, targetX: targetCity.x, targetY: targetCity.y, targetType: 'COUNTER_SPY', targetName: named ? army.owner.name : null, cityName: targetCity.name, success: true, buildings: [], armies: [], resources: {}, data: { type: 'COUNTER_SPY', spies: spyPower, watchtower } } });
      notify(targetCity.playerId, 'battle', '🔭 Espion intercepté', `La Tour de guet de ${targetCity.name} a repéré ${named ? 'les espions de ' + army.owner.name : 'des espions ennemis'}.`, { tab: 'reports' });
    }
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
  const blockaded = targetCity && (await prisma.army.count({ where: { status: 'BESIEGING', targetCityId: targetCity.id } })) > 0;
  if (blockaded) {
    // Besieged city: the convoy cannot get through and brings its cargo back
    notify(army.ownerId, 'trade', '📦 Convoi refoulé', `${targetCity.name} est assiégée : le convoi rentre avec sa cargaison.`, { tab: 'armies' });
    await sendArmyHome(army, army.targetX, army.targetY);
  } else if (targetCity) {
    await creditCity(prisma, targetCity.id, { wood: army.carryWood, stone: army.carryStone, iron: army.carryIron, food: army.carryFood });
    await sendArmyHome(army, army.targetX, army.targetY, { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 });
  } else {
    // Destination vanished: the convoy brings its cargo back
    await sendArmyHome(army, army.targetX, army.targetY);
  }
}

module.exports = { processArmyMovements };
