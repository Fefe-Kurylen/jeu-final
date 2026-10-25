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
const { resolveTribeCombat, resolveNodeHolderCombat, collectResourceLoot, fieldBattle, sendArmyHomeTx, depositCarryTx } = require('../../services/armyService');
const { getRelation } = require('../../services/diplomacyService');
const { refreshSiegeFlag, wallLevelOf, wallHpNow, campEnd, engineCount } = require('./siegeProcessor');
const { calculateArmyPower } = require('../../utils/calculations');
const { pillage, wearWallStructure, applyFall } = require('../../services/conquestService');
const { raidCooldownWhere } = require('../../services/armyService');
const { creditCity, plunderCity, lockCity, claimNode } = require('../../utils/db');
const fx = require('../../utils/buildingEffects');
const { updatePlayerPopulation } = require('./worldProcessor');
const { findRoute, noteCityCells, isBlockedTile } = require('../../utils/pathfinding');
const { footprintFree, cityAtCellWhere } = require('../../utils/spawn');

const MOVING_STATUSES = ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'FOUNDING', 'BESIEGING'];   // FOUNDING: arrivalAt = end of the foundation ; BESIEGING: arrivalAt = end of the camp hour (battle)
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
        await handleAttack(army, now);   // the camp hour is over: battle
      } else if (army.status === 'FOUNDING') {
        await handleFoundComplete(army, now);
      } else if (army.missionType === 'FOUND') {
        await handleFoundArrival(army, now);
      } else if (army.missionType === 'MOVE_TO_HARVEST') {
        await handleMoveToHarvest(army);
      } else if (army.missionType === 'RAID_RESOURCE') {
        await handleRaidResource(army);
      } else if (army.missionType === 'MOVE' || army.status === 'MOVING') {
        // a move that ends on the army's own city is a homecoming: through a siege camp, carry deposited
        if (army.city && army.targetX === army.city.x && army.targetY === army.city.y && !(army.x === army.city.x && army.y === army.city.y)) await handleReturn(army);
        else await setArmyIdle(army.id);
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
  const route = await findRoute(fromX, fromY, homeCity.x, homeCity.y, army.owner?.faction).catch(() => null);
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
    return { won: result.success, fight: !result.free && !result.shared, holder: !fresh.hasDefenders && fresh.hasPlayerArmy, losses: result.combatResult?.attackerLosses || 0, loot, reportId: result.reportId || null, notices: result.notices || [] };
  }, TX);
  for (const n of outcome.notices || []) notify(...n);
  const won = outcome.won;
  const lootText = Object.entries(outcome.loot || {}).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ');
  if (outcome.fight) {
    const who = outcome.holder ? 'l\'armée adverse' : 'la tribu';
    notify(army.ownerId, 'battle', won ? '⚔️ Point conquis' : '⚔️ Attaque repoussée', won ? `${army.name} a chassé ${who} en (${node.x}, ${node.y})${lootText ? ' : ' + lootText : ''}.` : `${army.name} a été repoussée par ${who} en (${node.x}, ${node.y}) (${outcome.losses} pertes). Rapport disponible.`, outcome.reportId ? { to: 'report', reportId: outcome.reportId, x: node.x, y: node.y } : { to: 'map', x: node.x, y: node.y });
  }
  // A victorious army stays and harvests what is left when nobody else holds the node; otherwise it brings its loot home
  if (!won || !(await startHarvesting(army, node.id))) await sendArmyHome(army, node.x, node.y, { targetResourceId: null });
}

async function handleReturn(army) {
  const homeCity = army.cityId ? await prisma.city.findUnique({ where: { id: army.cityId } }) : null;
  // Home besieged: the army must fight its way through the camp (décision d'octobre 2026)
  if (homeCity && (await prisma.army.count({ where: { status: 'BESIEGING', targetCityId: homeCity.id, NOT: { ownerId: army.ownerId } } })) > 0) {
    const through = await fightThroughSiege(army, homeCity);   // an error keeps the arrival claimed: retried, never let in
    if (!through.passed) return;   // beaten: the army waits beside the city
  }
  if (homeCity) await depositCarry(army, homeCity);
  await setArmyIdle(army.id, { harvestResourceType: null });
}

// An army coming home to a besieged city attacks the camp (open-field battle). Won: the besiegers go home, the siege is
// lifted and the army enters; lost: the survivors halt on a free tile beside the city (they may attack again or wait).
async function fightThroughSiege(army, city) {
  const pos = await haltTile(city);   // worked out first: the defeat and the halt are committed together
  const outcome = await prisma.$transaction(async (tx) => {
    await lockCity(tx, city.id);
    const camp = await tx.army.findMany({ where: { status: 'BESIEGING', targetCityId: city.id, claimedAt: null, NOT: { ownerId: army.ownerId } }, include: SIEGE_CAMP });
    const hostile = forcedCamps(army, camp);
    const units = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    if (!hostile.length || !units.length) return { passed: true };
    const { combat, defenderName, reportIds } = await fieldBattle(tx, { ...army, units }, hostile, army.ownerId, { x: city.x, y: city.y, where: `Retour à ${city.name}`, type: 'SIEGE_BREAK', rounds: { type: 'SIEGE_BREAK', cityId: city.id, homecoming: true } });
    if (combat.attackerWon) { for (const b of hostile) await sendArmyHomeTx(tx, b); await refreshSiegeFlag(tx, city.id); }
    else await tx.army.update({ where: { id: army.id }, data: haltData(pos) });
    return { passed: combat.attackerWon, fought: true, defenderName, reportIds, owners: [...new Set(hostile.map(b => b.ownerId))] };
  }, TX);
  if (!outcome.fought) return outcome;
  if (outcome.passed) {
    notify(army.ownerId, 'battle', '⚔️ Passage forcé', `${army.name} a percé le siège de ${city.name} en rentrant : le siège est levé.`, { to: 'report', reportId: outcome.reportIds?.[army.ownerId], x: city.x, y: city.y });
    for (const id of outcome.owners) notify(id, 'battle', '🏰 Siège levé', `Une armée qui rentrait à ${city.name} a chassé votre camp.`, { to: 'report', reportId: outcome.reportIds?.[id], x: city.x, y: city.y });
  } else {
    notifyHalted(army, city, pos, outcome.reportIds?.[army.ownerId]);
    for (const id of outcome.owners) notify(id, 'battle', '🏰 Retour repoussé', `Votre camp devant ${city.name} a repoussé une armée qui rentrait dans la ville.`, { to: 'report', reportId: outcome.reportIds?.[id], x: city.x, y: city.y });
  }
  return outcome;
}

// Forced homecoming fight: every camp outside the army's own alliance bars the way, whatever the declared diplomacy
// (a one-sided ALLY declaration is no pass)
function forcedCamps(army, camp) {
  const myAlliance = army.owner?.alliance?.allianceId || null;
  return camp.filter(b => b.units.some(u => u.count > 0) && !(myAlliance && b.owner?.alliance?.allianceId === myAlliance));
}

// Free tile next to the city where an army beaten before its besieged walls waits (it keeps its carry)
// (the ring around the city's 2 × 2 block)
async function haltTile(city) {
  const spot = [[2, 0], [0, 2], [-1, 0], [0, -1], [2, 1], [1, 2], [-1, 1], [1, -1], [2, 2], [-1, 2], [2, -1], [-1, -1]].map(([dx, dy]) => ({ x: city.x + dx, y: city.y + dy }));
  try {
    for (const p of spot) if (!(await isBlockedTile(p.x, p.y)) && !(await prisma.city.findFirst({ where: cityAtCellWhere(p.x, p.y), select: { id: true } }))) return p;
  } catch (e) { console.error('[SIEGE] halt tile', e.message); }
  return spot[0];
}
const haltData = (pos) => ({ status: 'IDLE', x: pos.x, y: pos.y, targetX: null, targetY: null, targetCityId: null, arrivalAt: null, claimedAt: null, missionType: null, harvestResourceType: null });
function notifyHalted(army, city, pos, reportId = null) {
  // the link shows where the army waits (its report is one tap away in the reports)
  notify(army.ownerId, 'siege_halt', '⚔️ Retour bloqué', `${army.name} n'a pas pu percer le siège de ${city.name} : elle attend en (${pos.x}, ${pos.y}). Attaquez à nouveau le camp ou attendez la levée du siège.`, { to: 'map', x: pos.x, y: pos.y, armyId: army.id, reportId });
}

// ---------- Secondary cities (GDD): a settler army reaches a free node, then the foundation takes 24 h ----------
async function handleFoundArrival(army, now) {
  const node = army.targetResourceId ? await prisma.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
  // the city will cover the node and the three cells next to it (2 × 2): they must be free
  const free = node && !node.cityId && !node.hasDefenders && !node.hasPlayerArmy && (army.settlers || 0) > 0 && (await footprintFree(node.x, node.y, { ignoreNodeId: node.id }));
  if (!free) {
    await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null, harvestResourceType: null });
    notify(army.ownerId, 'battle', '🏗️ Fondation impossible', `Le point (${army.targetX}, ${army.targetY}) n'est plus libre : ${army.name} rentre avec le colon.`, { to: 'map', x: army.targetX, y: army.targetY });
    return;
  }
  const taken = await prisma.resourceNode.updateMany({ where: { id: node.id, hasPlayerArmy: false, hasDefenders: false, cityId: null }, data: { hasPlayerArmy: true } });
  if (taken.count !== 1) { await sendArmyHome(army, army.targetX, army.targetY, { targetResourceId: null, harvestResourceType: null }); return; }
  const endsAt = new Date(now.getTime() + fx.cityFoundationTimeSec() * 1000);
  await prisma.army.update({ where: { id: army.id }, data: { status: 'FOUNDING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, arrivalAt: endsAt, departedAt: now, claimedAt: null } });
  notify(army.ownerId, 'build_done', '🏗️ Fondation commencée', `${army.name} fonde une ville en (${node.x}, ${node.y}) : elle sera prête dans ${Math.round(fx.cityFoundationTimeSec() / 3600)} h.`, { to: 'map', x: node.x, y: node.y });
}

async function handleFoundComplete(army, now) {
  const created = await prisma.$transaction(async (tx) => {
    const node = army.targetResourceId ? await tx.resourceNode.findUnique({ where: { id: army.targetResourceId } }) : null;
    const fresh = await tx.army.findUnique({ where: { id: army.id }, include: { owner: true } });
    if (!node || node.cityId || !fresh || (fresh.settlers || 0) < 1) return null;
    if (!(await footprintFree(node.x, node.y, { ignoreNodeId: node.id, db: tx }))) return null;   // a city rose next to it meanwhile
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
  noteCityCells(created.x, created.y);
  try { await updatePlayerPopulation(prisma, army.ownerId); } catch (e) { /* population is recomputed by the tick */ }
  notify(army.ownerId, 'build_done', '🏛️ Ville fondée', `${created.name} est fondée en (${created.x}, ${created.y}). ${army.name} rentre à la capitale.`, { to: 'city', cityId: created.id, x: created.x, y: created.y });
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

// Camps devant la même ville dont les propriétaires sont alliés (même joueur, même alliance ou alliance déclarée alliée) :
// ils combattent ensemble, à l'heure du premier arrivé
async function alliedOwners(tx, a, b) {
  return a === b || !(await getRelation(a, b, tx)).canAttack;
}

// Ligne d'unités fusionnées par type (plusieurs camps peuvent amener le même type)
function mergeUnits(rows) {
  const m = {};
  for (const u of rows) if (u.count > 0) (m[u.unitKey] ||= { unitKey: u.unitKey, tier: u.tier, count: 0 }).count += u.count;
  return Object.values(m);
}

// End of the camp hour: the camps of allied owners due now fight the city together (décision du 25 octobre 2026). The
// wall is a shield (combatService), a won battle pillages a quarter of the unprotected stock within what the armies carry
// and takes a life from the city; at the last life the city falls (after this transaction). Every camp goes home after.
async function handleAttack(army, now) {
  const battle = await prisma.$transaction(async (tx) => {
    const targetCity = await lockTargetCity(tx, army.targetCityId);
    if (!targetCity) return null;
    if (!(await getRelation(army.ownerId, targetCity.playerId, tx)).canAttack) return { turned: true, targetCity };   // alliance signed during the hour
    // the allied camps whose hour is over join the battle (claimed here: the loop skips them afterwards)
    const others = await tx.army.findMany({ where: { status: 'BESIEGING', targetCityId: targetCity.id, claimedAt: null, arrivalAt: { lte: now }, id: { not: army.id } }, include: { units: true, owner: { include: { technologies: true } }, city: true, hero: { include: { items: true } } } });
    const group = [army];
    for (const o of others) {
      if (!(await alliedOwners(tx, army.ownerId, o.ownerId))) continue;
      const ok = await tx.army.updateMany({ where: { id: o.id, status: 'BESIEGING', claimedAt: null }, data: { claimedAt: now } });
      if (ok.count === 1) group.push(o);
    }
    const rowsOf = new Map();
    for (const g of group) rowsOf.set(g.id, await tx.armyUnit.findMany({ where: { armyId: g.id } }));
    const attackerUnits = mergeUnits([...rowsOf.values()].flat());
    const defenders = defendingArmies(targetCity);
    const defenderUnits = defenders.flatMap(a => a.units);
    const wallLevel = wallLevelOf(targetCity.buildings);
    const wall = wallLevel > 0 ? { hp: wallHpNow(targetCity), maxHp: targetCity.wallMaxHp } : null;
    const moatLevel = targetCity.buildings.find(b => b.key === 'MOAT')?.level || 0;
    const defenderHero = defenders.find(a => a.hero)?.hero || null;
    // Technologies of both players (the leading camp's for the attackers): Art de la guerre, Discipline; Médecine below
    const [atkTech, defTech] = await Promise.all([tx.playerTechnology.findMany({ where: { playerId: army.ownerId } }), tx.playerTechnology.findMany({ where: { playerId: targetCity.playerId } })]);
    const techMods = { attacker: { atk: T.techBonusMult(atkTech, 'attackBonusPct'), def: T.techBonusMult(atkTech, 'defenseBonusPct') }, defender: { atk: T.techBonusMult(defTech, 'attackBonusPct'), def: T.techBonusMult(defTech, 'defenseBonusPct') } };
    const ownerNames = [...new Set(group.map(g => g.owner?.name).filter(Boolean))].join(', ');
    const result = resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel, moatLevel, ownerNames, targetCity.player.name, heroCombatStats(army.hero), heroCombatStats(defenderHero), army.owner.faction, targetCity.player.faction, fx.defenseBonusPct(targetCity.buildings), techMods, wall);

    for (const g of group) await applyLosses(tx, rowsOf.get(g.id), result.attackerFinalUnits);
    for (const defArmy of defenders) await applyLosses(tx, defArmy.units, result.defenderFinalUnits);
    const campMinutes = army.departedAt ? Math.round((now - new Date(army.departedAt)) / 60000) : 0;
    // Won: a quarter of the unprotected stock within what the armies carry, and a life (with its share of the wall's hit points)
    let pillaged = null, structure = null;
    if (result.attackerWon) {
      const survivors = new Map(group.map(g => [g.id, rowsOf.get(g.id).map(u => ({ unitKey: u.unitKey, count: Math.round(u.count * survivalRatio(result.attackerFinalUnits, u.unitKey)) }))]));
      pillaged = await pillage(tx, targetCity, group, survivors);
      structure = await wearWallStructure(tx, targetCity);
    }
    const wallInfo = wall ? { wallHpStart: Math.round(result.wallHpStart), wallHpEnd: result.wallHpEnd, wallMaxHp: Math.round(wall.maxHp), wallBroken: result.wallHpEnd <= 0 } : {};
    const lives = structure ? { before: Math.round(structure.before * structure.needed), after: Math.round(structure.after * structure.needed), total: structure.needed, fallen: structure.fallen, fate: structure.fallen ? (targetCity.isCapital ? 'RELOCATED' : 'RAZED') : null } : null;
    const reportBase = {
      x: targetCity.x, y: targetCity.y,
      attackerUnits: result.attackerInitialUnits, defenderUnits: result.defenderInitialUnits,
      attackerLosses: { rate: result.attackerLossRate, units: result.attackerFinalUnits, totalKilled: result.attackerTotalKilled },
      defenderLosses: { rate: result.defenderLossRate, units: result.defenderFinalUnits, totalKilled: result.defenderTotalKilled },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER'
    };
    const loot = (carried) => ({ rounds: result.rounds, ...wallInfo, campMinutes, camps: group.length, ...(carried || {}), pillaged: pillaged ? pillaged.taken : null, lives, attackerName: ownerNames, defenderName: targetCity.player.name, cityName: targetCity.name, cityId: targetCity.id, duration: result.rounds.length, type: 'ATTACK' });
    // one report for each attacking player (what his own armies carry away) and one for the defender
    const owners = [...new Set(group.map(g => g.ownerId))];
    const reportIds = {};   // each player's own copy, for the links of the notifications
    for (const ownerId of owners) {
      const carried = pillaged ? Object.fromEntries(['wood', 'stone', 'iron', 'food'].map(r => [r, group.filter(g => g.ownerId === ownerId).reduce((t, g) => t + (pillaged.carried.get(g.id)?.[r] || 0), 0)])) : null;
      reportIds[ownerId] = (await tx.battleReport.create({ data: { ...reportBase, loot: loot(carried), result: reportResult(true, result.attackerWon), playerId: ownerId, attackerId: ownerId, defenderId: targetCity.playerId } })).id;
    }
    reportIds[targetCity.playerId] = (await tx.battleReport.create({ data: { ...reportBase, loot: loot(null), result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } })).id;
    const winnerId = result.attackerWon ? army.ownerId : targetCity.playerId;
    const winField = result.attackerWon ? 'attacksWon' : 'defensesWon';
    await tx.playerStats.upsert({ where: { playerId: winnerId }, update: { [winField]: { increment: 1 } }, create: { playerId: winnerId, [winField]: 1 } });
    await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { unitsKilled: { increment: result.defenderTotalKilled }, unitsLost: { increment: result.attackerTotalKilled } }, create: { playerId: army.ownerId, unitsKilled: result.defenderTotalKilled, unitsLost: result.attackerTotalKilled } });
    await tx.playerStats.upsert({ where: { playerId: targetCity.playerId }, update: { unitsKilled: { increment: result.attackerTotalKilled }, unitsLost: { increment: result.defenderTotalKilled } }, create: { playerId: targetCity.playerId, unitsKilled: result.attackerTotalKilled, unitsLost: result.defenderTotalKilled } });
    return { targetCity, result, defenderHero, atkTech, defTech, structure, group, rowsOf, reportIds };
  }, TX);
  if (!battle || battle.turned) {
    await sendArmyHome(army, army.targetX, army.targetY);
    if (army.targetCityId) await refreshSiegeFlag(prisma, army.targetCityId);
    if (battle?.turned) {
      notify(army.ownerId, 'battle', '🏰 Attaque annulée', `${army.name} ne peut plus attaquer ${battle.targetCity.name} (alliance) : elle rentre.`, { to: 'army', armyId: army.id });
      notify(battle.targetCity.playerId, 'battle', '🏰 Camp levé', `L'armée de ${army.owner?.name || 'l\'ennemi'} quitte ${battle.targetCity.name} sans combattre.`, { to: 'map', x: battle.targetCity.x, y: battle.targetCity.y, cityId: battle.targetCity.id });
    }
    return;
  }
  const { targetCity, result, defenderHero, atkTech, defTech, structure, group, rowsOf, reportIds } = battle;
  const livesTxt = structure ? (structure.fallen ? '' : ` Il lui reste ${Math.round(structure.after * structure.needed)} vie(s).`) : '';
  notify(targetCity.playerId, 'battle', result.attackerWon ? '🛡️ Ville attaquée' : '🛡️ Défense victorieuse', `${targetCity.name} a été attaquée par ${[...new Set(group.map(g => g.owner?.name))].join(', ')} : ${result.attackerWon ? 'défaite.' + livesTxt : 'victoire.'} Rapport disponible.`, { to: 'report', reportId: reportIds[targetCity.playerId], x: targetCity.x, y: targetCity.y });
  for (const ownerId of new Set(group.map(g => g.ownerId))) notify(ownerId, 'battle', result.attackerWon ? '⚔️ Victoire' : '⚔️ Défaite', `Votre attaque sur ${targetCity.name} est terminée : ${result.attackerWon ? 'victoire' : 'défaite'}. Rapport disponible.`, { to: 'report', reportId: reportIds[ownerId], x: targetCity.x, y: targetCity.y });

  // Hero XP: GDD 0.25 per enemy unit destroyed (winner x1, loser x0.3); the leading camp's hero
  try {
    const atkXp = Math.floor(result.defenderTotalKilled * config.combat.heroXpPerKill * (result.attackerWon ? 1 : 0.3));
    const defXp = Math.floor(result.attackerTotalKilled * config.combat.heroXpPerKill * (result.attackerWon ? 0.3 : 1));
    if (army.heroId) await awardHeroXp(army.heroId, atkXp);
    if (defenderHero) await awardHeroXp(defenderHero.id, defXp);
  } catch (xpErr) { console.error('[HERO XP]', xpErr.message); }

  try {
    const defenderWounded = await calculateWoundedUnits(targetCity.id, result.defenderFinalUnits, targetCity.player.faction, T.techPct(defTech, 'woundedBonusPct'));
    if (defenderWounded.length > 0) await addWoundedUnits(targetCity.id, defenderWounded);
    for (const g of group) {
      if (!g.cityId) continue;
      // this camp's own dead, by unit type
      const killed = rowsOf.get(g.id).map(u => ({ key: u.unitKey, killed: u.count - Math.round(u.count * survivalRatio(result.attackerFinalUnits, u.unitKey)) }));
      const attackerWounded = await calculateWoundedUnits(g.cityId, killed, g.owner?.faction, T.techPct(g.ownerId === army.ownerId ? atkTech : g.owner?.technologies, 'woundedBonusPct'));
      if (attackerWounded.length > 0) await carryWounded(prisma, g.id, attackerWounded);   // ils rentrent avec l'armée
    }
  } catch (woundErr) { console.error('[WOUNDED]', woundErr.message); }

  console.log(`[ATTACK] ${army.owner.name}${group.length > 1 ? ` (+${group.length - 1} camp(s))` : ''} vs ${targetCity.player.name}: ${result.attackerWon ? 'Attacker won' : 'Defender won'}`);
  if (structure?.fallen) {
    try {
      const fall = await applyFall(targetCity.id, { id: army.id, ids: group.map(g => g.id), ownerId: army.ownerId, ownerName: army.owner.name, reportIds });   // notifies too
      if (fall) console.log(`[FALL] ${targetCity.name} ${fall.kind}`);
    } catch (fallErr) { console.error('[FALL]', fallErr.message); }
  }
  for (const g of group) await sendArmyHome(g, g.targetX ?? army.targetX, g.targetY ?? army.targetY);
  await refreshSiegeFlag(prisma, targetCity.id);   // the siege is lifted when no other army camps before the city
}

// An attack that arrives camps 1 h before the city (décision du 25 octobre 2026), or joins the battle of an allied camp
// already there. Without a siege engine, or if the two players became allies on the way, it turns back and both are told.
async function startSiege(army, now) {
  const started = await prisma.$transaction(async (tx) => {
    if (!army.targetCityId) return { turned: 'city' };
    await lockCity(tx, army.targetCityId);
    const city = await tx.city.findUnique({ where: { id: army.targetCityId }, include: { player: { select: { id: true, name: true, alliance: { select: { allianceId: true } } } } } });
    if (!city) return { turned: 'city' };
    if (!(await getRelation(army.ownerId, city.playerId, tx)).canAttack) return { turned: 'diplomacy', city };
    const units = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    if (engineCount(units) < config.combat.siege.minEngines) return { turned: 'engines', city };
    let fightAt = campEnd(now), joined = false;
    const camps = await tx.army.findMany({ where: { status: 'BESIEGING', targetCityId: city.id, claimedAt: null, arrivalAt: { gt: now } }, select: { ownerId: true, arrivalAt: true } });
    for (const c of camps) if (c.arrivalAt < fightAt && (await alliedOwners(tx, army.ownerId, c.ownerId))) { fightAt = c.arrivalAt; joined = true; }
    const ok = await tx.army.updateMany({ where: { id: army.id, claimedAt: now }, data: { status: 'BESIEGING', x: city.x, y: city.y, departedAt: now, arrivalAt: fightAt, claimedAt: null } });
    if (ok.count !== 1) return null;
    await tx.city.update({ where: { id: city.id }, data: { isSieged: true } });
    return { city, fightAt, joined };
  }, TX);
  if (!started) return;
  if (started.turned) {
    await sendArmyHome(army, army.targetX, army.targetY);
    const { city } = started;
    const why = started.turned === 'diplomacy' ? 'vos deux camps sont désormais alliés' : started.turned === 'engines' ? 'elle n\'a plus d\'engin de siège' : 'la ville n\'existe plus';
    notify(army.ownerId, 'battle', '🏰 Attaque annulée', `${army.name} fait demi-tour devant ${city?.name || 'la ville'} : ${why}.`, { to: 'army', armyId: army.id });
    if (city && started.turned === 'diplomacy') notify(city.playerId, 'battle', '🏰 Attaque annulée', `L'armée de ${army.owner?.name || 'un joueur'} en route vers ${city.name} a fait demi-tour : vos deux camps sont désormais alliés.`, { to: 'map', x: city.x, y: city.y, cityId: city.id });
    return;
  }
  const { city, fightAt, joined } = started;
  const minutes = Math.max(1, Math.round((fightAt - now) / 60000));
  const also = joined ? ' (avec un camp allié déjà sur place)' : '';
  notify(city.playerId, 'battle', '🏰 Ville assiégée', `${army.owner?.name || 'Un joueur'} campe devant ${city.name}${also} : combat dans ${minutes} min. Attaquez le camp ou appelez vos alliés.`, { to: 'siege', cityId: city.id, x: city.x, y: city.y });
  const allianceId = city.player?.alliance?.allianceId;
  if (allianceId) {
    const members = await prisma.allianceMember.findMany({ where: { allianceId, playerId: { not: city.playerId } }, select: { playerId: true } });
    for (const m of members) notify(m.playerId, 'battle', '🏰 Alliée assiégée', `${city.name} (${city.player.name}) est assiégée par ${army.owner?.name || 'un joueur'} : combat dans ${minutes} min.`, { to: 'siege', cityId: city.id, x: city.x, y: city.y });
  }
  notify(army.ownerId, 'battle', '🏰 Siège commencé', `${army.name} campe devant ${city.name}${also} : combat dans ${minutes} min.`, { to: 'siege', cityId: city.id, x: city.x, y: city.y, armyId: army.id });
  console.log(`[SIEGE] ${army.owner?.name} campe devant ${city.name}, combat à ${fightAt.toISOString()}`);
}

// Any player attacks the armies camping before a city: open-field battle (no wall) against all the camps together; the
// beaten camps go home and the siege is lifted. The winner from elsewhere stays before the city to guard it; a loser
// goes home; an army of the city itself goes back inside (sortie) or must win to enter (homecoming).
const SIEGE_CAMP = { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true };
async function handleBreakSiege(army, now) {
  // An army of the besieged city: a sortie from the walls goes back inside; coming from outside, it must win to enter
  // and its fight is the forced homecoming one. Its final state is committed with the battle.
  const homeId = army.cityId || null;
  const ownCity = !!homeId && homeId === army.targetCityId;
  const sortieFromInside = ownCity && army.x === army.targetX && army.y === army.targetY;   // position before the march
  const pos = ownCity && !sortieFromInside && army.targetX !== null ? await haltTile({ x: army.targetX, y: army.targetY }) : null;
  const outcome = await prisma.$transaction(async (tx) => {
    if (!army.targetCityId) return null;
    await lockCity(tx, army.targetCityId);
    const city = await tx.city.findUnique({ where: { id: army.targetCityId }, select: { id: true, name: true, x: true, y: true, playerId: true } });
    if (!city) return null;
    // its own capital fled to a new place during the march: the army walks on to it (sendArmyHome after the commit)
    if (ownCity && (city.x !== army.targetX || city.y !== army.targetY)) return { city, fought: false, fate: 'home', owners: [] };
    const camp = await tx.army.findMany({ where: { status: 'BESIEGING', targetCityId: city.id, claimedAt: null, NOT: { ownerId: army.ownerId } }, include: SIEGE_CAMP });
    let hostile = [];
    if (ownCity && !sortieFromInside) hostile = forcedCamps(army, camp);   // homecoming from outside: every camp outside its alliance
    else for (const b of camp) if (b.units.some(u => u.count > 0) && (await getRelation(army.ownerId, b.ownerId, tx)).canAttack) hostile.push(b);
    const units = await tx.armyUnit.findMany({ where: { armyId: army.id } });
    let fought = false, won = false, defenderName = null, reportIds = {};
    if (hostile.length && units.length) {
      const res = await fieldBattle(tx, { ...army, units }, hostile, army.ownerId, { x: city.x, y: city.y, where: `Siège de ${city.name}`, type: 'SIEGE_BREAK', rounds: { type: 'SIEGE_BREAK', cityId: city.id } });
      fought = true; won = res.combat.attackerWon; defenderName = res.defenderName; reportIds = res.reportIds;
      if (won) for (const b of hostile) await sendArmyHomeTx(tx, b);
      await refreshSiegeFlag(tx, city.id);
    }
    let fate = 'home';   // the army of another city marches home after the commit...
    // ...unless it won: it stays before the city to guard it until it is recalled (décision du 25 octobre 2026)
    if (!ownCity && fought && won) { await tx.army.update({ where: { id: army.id }, data: haltData({ x: city.x, y: city.y }) }); fate = 'guard'; }
    if (ownCity) {
      if (fought && !won && !sortieFromInside) { await tx.army.update({ where: { id: army.id }, data: haltData(pos) }); fate = 'halted'; }
      else { await depositCarryTx(tx, army.id, city.id); await tx.army.update({ where: { id: army.id }, data: { ...haltData({ x: city.x, y: city.y }) } }); fate = 'inside'; }
    }
    return { city, fought, won, fate, owners: [...new Set(hostile.map(b => b.ownerId))], defenderName, reportIds };
  }, TX);
  if (outcome?.fought) {
    const { city, won, owners, defenderName, reportIds } = outcome;
    const at = { x: city.x, y: city.y };
    notify(army.ownerId, 'battle', won ? '⚔️ Siège brisé' : '⚔️ Siège maintenu', won ? `${army.name} a chassé ${defenderName} de devant ${city.name}.` : `${army.name} a été repoussée par l'armée qui assiège ${city.name}.`, { to: 'report', reportId: reportIds[army.ownerId], ...at });
    for (const id of owners) notify(id, 'battle', won ? '🏰 Siège levé' : '🏰 Sortie repoussée', won ? `Votre siège de ${city.name} a été brisé par ${army.owner?.name || 'un joueur'}.` : `Votre armée devant ${city.name} a repoussé ${army.owner?.name || 'une armée'}.`, { to: 'report', reportId: reportIds[id], ...at });
    if (won && city.playerId !== army.ownerId) notify(city.playerId, 'battle', '🏰 Siège levé', `${army.owner?.name || 'Un joueur'} a brisé le siège de ${city.name}.`, { to: 'map', ...at, cityId: city.id });
  }
  if (outcome?.fate === 'inside') return;   // back inside, its load already deposited with the battle
  if (outcome?.fate === 'guard') { notify(army.ownerId, 'battle', '🛡️ Garde devant la ville', `${army.name} reste devant ${outcome.city.name} pour la protéger. Rappelez-la quand vous voulez.`, { to: 'map', x: outcome.city.x, y: outcome.city.y, armyId: army.id }); return; }
  if (outcome?.fate === 'halted') { notifyHalted(army, outcome.city, pos, outcome.reportIds?.[army.ownerId]); return; }
  await sendArmyHome(army, army.targetX, army.targetY);
}


// GDD: one raid per target city per attacker per 24h — checked again when the raid lands, so several
// armies launched together cannot all plunder
async function raidedRecently(tx, attackerId, targetCity, now) {
  const since = new Date(now.getTime() - config.combat.raidCooldownHours * 3600000);
  const recent = await tx.battleReport.findFirst({ where: raidCooldownWhere(attackerId, targetCity, since), select: { id: true } });
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
      loot: { ...loot, attackerName: army.owner.name, defenderName: targetCity.player.name, cityName: targetCity.name, cityId: targetCity.id, type: 'RAID' }
    };
    const atkReport = await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(true, result.attackerWon), playerId: army.ownerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    const defReport = await tx.battleReport.create({ data: { ...raidReportData, result: reportResult(false, result.attackerWon), playerId: targetCity.playerId, attackerId: army.ownerId, defenderId: targetCity.playerId } });
    if (result.attackerWon) {
      await tx.playerStats.upsert({ where: { playerId: army.ownerId }, update: { raidsWon: { increment: 1 } }, create: { playerId: army.ownerId, raidsWon: 1 } });
    }
    return { targetCity, result, atkReportId: atkReport.id, defReportId: defReport.id };
  }, TX);
  if (!raid) {
    await sendArmyHome(army, army.targetX, army.targetY);
    return;
  }
  if (raid.skipped) {
    console.log(`[RAID] ${army.owner.name} vs ${raid.targetCity.player.name}: already raided in the last ${config.combat.raidCooldownHours}h, army turns back`);
    notify(army.ownerId, 'battle', '↩️ Raid annulé', `${raid.targetCity.name} a déjà été pillée récemment : votre armée rentre sans combattre.`, { to: 'army', armyId: army.id });
    await sendArmyHome(army, army.targetX, army.targetY);
    return;
  }
  const { targetCity, result } = raid;
  const lootTxt = ['wood', 'stone', 'iron', 'food'].filter(k => loot[k] > 0).map(k => `${loot[k]} ${{ wood: 'bois', stone: 'pierre', iron: 'fer', food: 'nourriture' }[k]}`).join(', ');
  notify(army.ownerId, 'battle', result.attackerWon ? '💰 Raid réussi' : '⚔️ Raid repoussé', result.attackerWon ? `${army.name} a pillé ${targetCity.name}${lootTxt ? ' : ' + lootTxt : ''}.` : `${army.name} a été repoussée par ${targetCity.name}.`, { to: 'report', reportId: raid.atkReportId, x: targetCity.x, y: targetCity.y });
  notify(targetCity.playerId, 'battle', result.attackerWon ? '💰 Ville pillée' : '🛡️ Raid repoussé', result.attackerWon ? `${army.owner.name} a pillé ${targetCity.name}${lootTxt ? ' : ' + lootTxt : ''}.` : `${targetCity.name} a repoussé le raid de ${army.owner.name}.`, { to: 'report', reportId: raid.defReportId, x: targetCity.x, y: targetCity.y });

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
      const counter = await prisma.spyReport.create({ data: { playerId: targetCity.playerId, targetPlayerId: named ? army.ownerId : null, targetCityId: targetCity.id, targetX: targetCity.x, targetY: targetCity.y, targetType: 'COUNTER_SPY', targetName: named ? army.owner.name : null, cityName: targetCity.name, success: true, buildings: [], armies: [], resources: {}, data: { type: 'COUNTER_SPY', spies: spyPower, watchtower } } });
      notify(targetCity.playerId, 'battle', '🔭 Espion intercepté', `La Tour de guet de ${targetCity.name} a repéré ${named ? 'les espions de ' + army.owner.name : 'des espions ennemis'}.`, { to: 'spy', reportId: counter.id, x: targetCity.x, y: targetCity.y });
    }
    const base = { playerId: army.ownerId, targetPlayerId: targetCity.playerId, targetCityId: targetCity.id, targetX: targetCity.x, targetY: targetCity.y, targetType: 'CITY', targetName: targetCity.name, cityName: targetCity.name };
    let spyReport;
    if (success) {
      spyReport = await prisma.spyReport.create({ data: { ...base, success: true,
        buildings: targetCity.buildings.map(b => ({ key: b.key, level: b.level })),
        armies: present.map(a => ({ name: a.name, units: a.units.map(u => ({ key: u.unitKey, count: u.count })) })),
        resources: { wood: Math.floor(targetCity.wood), stone: Math.floor(targetCity.stone), iron: Math.floor(targetCity.iron), food: Math.floor(targetCity.food) } } });
    } else {
      spyReport = await prisma.spyReport.create({ data: { ...base, success: false, buildings: [], armies: [], resources: {} } });
    }
    notify(army.ownerId, 'battle', success ? '🔭 Espionnage réussi' : '🔭 Espionnage manqué', success ? `Vos espions ont observé ${targetCity.name}.` : `Vos espions n'ont rien appris sur ${targetCity.name}.`, { to: 'spy', reportId: spyReport.id, x: targetCity.x, y: targetCity.y });
  }
  await sendArmyHome(army, army.targetX, army.targetY, {}, 80);
}

async function handleTransport(army, now) {
  const targetCity = await prisma.city.findUnique({ where: { id: army.targetCityId || '' } });
  // a camp before the city blocks nothing (décision du 25 octobre 2026): the convoy delivers
  if (targetCity) {
    await creditCity(prisma, targetCity.id, { wood: army.carryWood, stone: army.carryStone, iron: army.carryIron, food: army.carryFood });
    await sendArmyHome(army, army.targetX, army.targetY, { carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0 });
  } else {
    // Destination vanished: the convoy brings its cargo back
    await sendArmyHome(army, army.targetX, army.targetY);
  }
}

module.exports = { processArmyMovements };
