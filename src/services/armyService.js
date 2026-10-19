// ========== ARMY SERVICE ==========
// Business logic for army operations, extracted from routes/armies.js
// Fixes circular dependency: tick.js -> routes/armies.js -> tick.js

const prisma = require('../config/database');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyCarryCapacity, calculateArmyPower, getFactionBonus, getArmyTravelTime } = require('../utils/calculations');
const { findRoute } = require('../utils/pathfinding');
const { notify } = require('./pushService');
const fx = require('../utils/buildingEffects');
const { calculateWoundedUnits, carryWounded } = require('./woundedService');
const { resolveCombat, heroCombatStats } = require('./combatService');
const { awardHeroXp } = require('./heroXpService');
const config = require('../config');
const { takeFromNode } = require('../utils/db');
const { techPct } = require('../utils/techEffects');

// Fight against the tribe guarding a resource node. Runs inside `tx` so that two concurrent
// raids on the same node from the same army cannot both be resolved.
async function resolveTribeCombat(army, node, playerId, tx = prisma) {
  const defenderUnits = [];
  if (node.defenderUnits && node.hasDefenders) {
    const legacyMapping = { warrior: 'GRE_INF_HOPLITE', archer: 'GRE_ARC_TOXOTE', cavalry: 'GRE_CAV_GREC', elite: 'GRE_INF_SPARTIATE' };
    for (const [unitKey, count] of Object.entries(node.defenderUnits)) {
      if (count > 0) {
        const isLegacyKey = ['warrior', 'archer', 'cavalry', 'elite'].includes(unitKey);
        defenderUnits.push({ unitKey: isLegacyKey ? legacyMapping[unitKey] : unitKey, count });
      }
    }
  }

  if (defenderUnits.length === 0 || !node.hasDefenders) {
    return { success: true, combatResult: { winner: 'attacker', attackerLosses: 0, defenderLosses: 0 }, loot: null, message: 'Tribu absente - démarrage de la récolte' };
  }

  // Art de la guerre (technologie) : bonus d'attaque du joueur
  const techRows = await tx.playerTechnology.findMany({ where: { playerId } });
  // A camp is a static target: the winner loses less than in a raid on a city (config.combat.tribeLossMultiplier)
  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenderUnits, 0, heroCombatStats(army.hero), null, { attackerBonusPct: techPct(techRows, 'attackBonusPct'), winnerLossMultiplier: config.combat.tribeLossMultiplier });

  let totalAttackerLosses = 0;
  const killed = [];
  for (const unit of army.units) {
    const losses = Math.floor(unit.count * combat.attackerLossRate);
    totalAttackerLosses += losses;
    if (losses <= 0) continue;
    killed.push({ key: unit.unitKey, killed: losses });
    if (losses >= unit.count) { await tx.armyUnit.delete({ where: { id: unit.id } }); }
    else { await tx.armyUnit.update({ where: { id: unit.id }, data: { count: { decrement: losses } } }); }
  }

  let totalDefenderLosses = 0;
  const newDefenderUnits = {};
  for (const [unitType, count] of Object.entries(node.defenderUnits)) {
    const losses = Math.floor(count * combat.defenderLossRate);
    totalDefenderLosses += losses;
    newDefenderUnits[unitType] = Math.max(0, count - losses);
  }

  if (combat.attackerWon) {
    await tx.resourceNode.update({ where: { id: node.id }, data: { hasDefenders: false, defenderUnits: newDefenderUnits, defenderPower: 0, lastDefeat: new Date() } });
    if (army.heroId) await awardHeroXp(army.heroId, Math.floor(totalDefenderLosses * config.combat.heroXpPerTribeKill), tx);
  } else {
    // The camp keeps its survivors; its power is the real power of what is left (same scale as the map shows)
    const remaining = Object.entries(newDefenderUnits).filter(([, c]) => c > 0).map(([unitKey, count]) => ({ unitKey, count, tier: unitsData.find(u => u.key === unitKey)?.tier || 'base' }));
    const remainingPower = Math.round(calculateArmyPower(remaining, unitsData) * (node.resourceType === 'GOLD' ? 1.4 : 1));
    await tx.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: newDefenderUnits, defenderPower: remainingPower } });
  }

  // Wounded, as after a city battle: part of the losses comes back to the home city's Healing Tent (Greek bonus, Medicine)
  let woundedBack = 0;
  if (totalAttackerLosses > 0 && army.cityId) {
    try {
      const wounded = await calculateWoundedUnits(army.cityId, killed, army.owner?.faction, techPct(techRows, 'woundedBonusPct'));
      if (wounded.length) woundedBack = await carryWounded(tx, army.id, wounded);   // ils rentrent avec l'armée
    } catch (e) { console.error('[WOUNDED]', e.message); }
  }

  const report = await tx.battleReport.create({
    data: { playerId, attackerId: playerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER', attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits, attackerLosses: { totalAttackerLosses, totalKilled: totalAttackerLosses, rate: combat.attackerLossRate }, defenderLosses: { totalDefenderLosses, totalKilled: totalDefenderLosses, rate: combat.defenderLossRate }, loot: { attackerName: army.owner?.name, defenderName: 'Tribu locale', cityName: `${node.resourceType} (${node.x}, ${node.y})`, type: 'TRIBE' }, rounds: { type: 'TRIBE_RAID', resourceType: node.resourceType } }
  });

  return { success: combat.attackerWon, reportId: report.id, combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses: totalAttackerLosses, woundedBack, defenderLosses: totalDefenderLosses, attackerPower: combat.attackerPower, defenderPower: combat.defenderPower }, loot: null, message: combat.attackerWon ? 'Tribu vaincue! Démarrage de la récolte.' : 'Votre armée a été repoussée' };
}

// Loot after a tribe is beaten: the army loads what it can carry and brings it home (deposited on return,
// never teleported into the city); the node is debited atomically and never goes below zero.
const CARRY_FIELD = { WOOD: 'carryWood', STONE: 'carryStone', IRON: 'carryIron', FOOD: 'carryFood', GOLD: 'carryGold' };
async function collectResourceLoot(army, node, playerId, tx = prisma, reportId = null) {
  const fresh = await tx.army.findUnique({ where: { id: army.id }, include: { units: true, hero: true, owner: true } });
  if (!fresh) return {};
  const carrying = fresh.carryWood + fresh.carryStone + fresh.carryIron + fresh.carryFood + fresh.carryGold;
  // Same transport bonuses as raids and convoys: civilization (Egypt, Sultanate) and Market / Trade Office of the home city
  const cityBuildings = fresh.cityId ? await tx.cityBuilding.findMany({ where: { cityId: fresh.cityId }, select: { key: true, level: true } }) : [];
  const transportMult = (1 + (getFactionBonus(fresh.owner?.faction, 'transportCapacity', factionsData) || 0) / 100) * (1 + fx.transportBonusPct(cityBuildings) / 100);
  const room = Math.floor(getArmyCarryCapacity(fresh.units, unitsData, fresh.hero) * transportMult) - carrying;
  const field = CARRY_FIELD[node.resourceType];
  if (!field || room <= 0) return {};
  const taken = await takeFromNode(tx, node.id, room);
  if (taken <= 0) return {};
  await tx.army.update({ where: { id: army.id }, data: { [field]: { increment: taken } } });
  if (reportId) await tx.$executeRaw`UPDATE "BattleReport" SET loot = COALESCE(loot, '{}'::jsonb) || jsonb_build_object('resources', jsonb_build_object(${node.resourceType.toLowerCase()}::text, ${taken}::int)) WHERE id = ${reportId}`;
  return { [node.resourceType]: taken };
}

// Loses `rate` of every unit group of an army (rows deleted at zero); returns what was killed
async function applyLossRate(tx, units, rate) {
  let total = 0; const killed = [];
  for (const u of units) {
    const l = Math.floor(u.count * rate);
    if (l <= 0) continue;
    total += l; killed.push({ key: u.unitKey, killed: l });
    if (l >= u.count) await tx.armyUnit.deleteMany({ where: { id: u.id } }); else await tx.armyUnit.update({ where: { id: u.id }, data: { count: { decrement: l } } });
    u.count -= l;
  }
  return { total, killed };
}

// An army beaten on a node goes home (idle on the spot when it has no city or no unit left)
async function sendArmyHomeTx(tx, army) {
  const city = army.city || (army.cityId ? await tx.city.findUnique({ where: { id: army.cityId } }) : null);
  const units = (army.units || []).filter(u => u.count > 0);
  const reset = { harvestResourceType: null, targetResourceId: null, claimedAt: null };
  if (!city || !units.length) { await tx.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, arrivalAt: null, ...reset } }); return; }
  const route = await findRoute(army.x, army.y, city.x, city.y).catch(() => null);
  const travelTime = getArmyTravelTime(units, army.x, army.y, city.x, city.y, army.owner?.faction, army.hero, route ? route.length : null, techPct(army.owner?.technologies, 'armySpeedBonusPct'));
  await tx.army.update({ where: { id: army.id }, data: { status: 'RETURNING', targetX: city.x, targetY: city.y, missionType: 'RETURN', arrivalAt: new Date(Date.now() + travelTime * 1000), departedAt: new Date(), ...reset } });
}

// Fight against the army (or allied armies) holding a resource node, as on a Travian oasis: an open-field battle resolved
// by power (no wall, no « défense chez soi »), the loser's losses follow the raid rule, the holders go home when beaten and
// the node is released for the attacker. Runs inside `tx`. Returns the same shape as resolveTribeCombat.
async function resolveNodeHolderCombat(army, node, playerId, tx = prisma) {
  const holders = await tx.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id, NOT: { ownerId: playerId } }, include: { units: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } }, city: true } });
  const myAlliance = army.owner?.alliance?.allianceId || null;
  if (!holders.length) return { success: true, free: true, combatResult: null, loot: null, message: 'Point libre' };
  if (holders.every(h => myAlliance && h.owner?.alliance?.allianceId === myAlliance)) return { success: true, shared: true, combatResult: null, loot: null, message: 'Point partagé avec votre alliance' };
  const defenderUnits = holders.flatMap(h => h.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })));
  if (!defenderUnits.length) {
    await tx.resourceNode.updateMany({ where: { id: node.id }, data: { hasPlayerArmy: false } });
    for (const h of holders) await sendArmyHomeTx(tx, h);
    return { success: true, free: true, combatResult: null, loot: null, message: 'Point libre' };
  }
  const lead = holders[0];
  const atkTech = await tx.playerTechnology.findMany({ where: { playerId } });
  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenderUnits, 0, heroCombatStats(army.hero), heroCombatStats(lead.hero), {
    fieldBattle: true, defenderFaction: lead.owner?.faction, attackerBonusPct: techPct(atkTech, 'attackBonusPct'), defenderBonusPct: techPct(lead.owner?.technologies, 'defenseBonusPct')
  });
  const atk = await applyLossRate(tx, army.units, combat.attackerLossRate);
  let defTotal = 0; const defKilled = [];
  for (const h of holders) { const r = await applyLossRate(tx, h.units, combat.defenderLossRate); defTotal += r.total; defKilled.push([h, r.killed]); }

  // Wounded on both sides, hero XP as in a city battle
  try {
    if (atk.total > 0 && army.cityId) { const w = await calculateWoundedUnits(army.cityId, atk.killed, army.owner?.faction, techPct(atkTech, 'woundedBonusPct')); if (w.length) await carryWounded(tx, army.id, w); }
    for (const [h, killed] of defKilled) if (killed.length && h.cityId) { const w = await calculateWoundedUnits(h.cityId, killed, h.owner?.faction, techPct(h.owner?.technologies, 'woundedBonusPct')); if (w.length) await carryWounded(tx, h.id, w); }
  } catch (e) { console.error('[WOUNDED]', e.message); }
  if (army.heroId) await awardHeroXp(army.heroId, Math.floor(defTotal * config.combat.heroXpPerKill * (combat.attackerWon ? 1 : 0.3)), tx);
  for (const h of holders) if (h.heroId) await awardHeroXp(h.heroId, Math.floor(atk.total * config.combat.heroXpPerKill * (combat.attackerWon ? 0.3 : 1)), tx);

  // One report for the attacker, one for each holder
  const defenderName = [...new Set(holders.map(h => h.owner?.name).filter(Boolean))].join(', ') || 'Armée adverse';
  const where = `${node.resourceType} (${node.x}, ${node.y})`;
  const base = {
    x: node.x, y: node.y, winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER',
    attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count + (atk.killed.find(k => k.key === u.unitKey)?.killed || 0) })),
    defenderUnits: defenderUnits.map(u => ({ key: u.unitKey, count: u.count })),
    attackerLosses: { totalKilled: atk.total, rate: combat.attackerLossRate, units: atk.killed },
    defenderLosses: { totalKilled: defTotal, rate: combat.defenderLossRate, units: defKilled.flatMap(([, k]) => k) },
    loot: { attackerName: army.owner?.name, defenderName, cityName: where, type: 'NODE_FIGHT', attackerPower: Math.round(combat.attackerPower), defenderPower: Math.round(combat.defenderPower) },
    rounds: { type: 'NODE_FIGHT', resourceType: node.resourceType }
  };
  const report = await tx.battleReport.create({ data: { ...base, playerId, attackerId: playerId, defenderId: lead.ownerId, result: combat.attackerWon ? 'WIN' : 'LOSE' } });
  for (const ownerId of new Set(holders.map(h => h.ownerId))) await tx.battleReport.create({ data: { ...base, playerId: ownerId, attackerId: playerId, defenderId: ownerId, result: combat.attackerWon ? 'LOSE' : 'WIN' } });
  await tx.playerStats.upsert({ where: { playerId }, update: { unitsKilled: { increment: defTotal }, unitsLost: { increment: atk.total }, ...(combat.attackerWon ? { attacksWon: { increment: 1 } } : {}) }, create: { playerId, unitsKilled: defTotal, unitsLost: atk.total, attacksWon: combat.attackerWon ? 1 : 0 } });

  if (combat.attackerWon) {
    await tx.resourceNode.updateMany({ where: { id: node.id }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
    // GDD: settlers are vulnerable — a founding party that is beaten loses its settler
    for (const h of holders) { if (h.status === 'FOUNDING' && (h.settlers || 0) > 0) { await tx.army.update({ where: { id: h.id }, data: { settlers: 0 } }); h.settlers = 0; } await sendArmyHomeTx(tx, h); }
    for (const ownerId of new Set(holders.map(h => h.ownerId))) notify(ownerId, 'battle', '⚔️ Armée chassée', `${army.owner?.name || 'Un joueur'} a chassé votre armée du point ${where}. Rapport disponible.`, { tab: 'reports' });
  } else {
    for (const ownerId of new Set(holders.map(h => h.ownerId))) notify(ownerId, 'battle', '🛡️ Point défendu', `Votre armée a repoussé ${army.owner?.name || 'un joueur'} sur le point ${where}. Rapport disponible.`, { tab: 'reports' });
  }
  return {
    success: combat.attackerWon, reportId: report.id,
    combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses: atk.total, defenderLosses: defTotal, attackerPower: Math.round(combat.attackerPower), defenderPower: Math.round(combat.defenderPower) },
    loot: null, message: combat.attackerWon ? `Armée de ${defenderName} chassée du point` : 'Votre armée a été repoussée'
  };
}

module.exports = { resolveTribeCombat, resolveNodeHolderCombat, collectResourceLoot, sendArmyHomeTx };
