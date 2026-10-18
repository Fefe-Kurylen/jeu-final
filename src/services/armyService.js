// ========== ARMY SERVICE ==========
// Business logic for army operations, extracted from routes/armies.js
// Fixes circular dependency: tick.js -> routes/armies.js -> tick.js

const prisma = require('../config/database');
const { unitsData } = require('../config/gamedata');
const { getArmyCarryCapacity } = require('../utils/calculations');
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
  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenderUnits, 0, heroCombatStats(army.hero), null, { attackerBonusPct: techPct(techRows, 'attackBonusPct') });

  let totalAttackerLosses = 0;
  for (const unit of army.units) {
    const losses = Math.floor(unit.count * combat.attackerLossRate);
    totalAttackerLosses += losses;
    if (losses <= 0) continue;
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
    await tx.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: newDefenderUnits, defenderPower: Math.floor(node.defenderPower * (1 - combat.defenderLossRate)) } });
  }

  const report = await tx.battleReport.create({
    data: { playerId, attackerId: playerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER', attackerUnits: army.units.map(u => ({ key: u.unitKey, count: u.count })), defenderUnits, attackerLosses: { totalAttackerLosses, totalKilled: totalAttackerLosses, rate: combat.attackerLossRate }, defenderLosses: { totalDefenderLosses, totalKilled: totalDefenderLosses, rate: combat.defenderLossRate }, loot: { attackerName: army.owner?.name, defenderName: 'Tribu locale', cityName: `${node.resourceType} (${node.x}, ${node.y})`, type: 'TRIBE' }, rounds: { type: 'TRIBE_RAID', resourceType: node.resourceType } }
  });

  return { success: combat.attackerWon, reportId: report.id, combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses: totalAttackerLosses, defenderLosses: totalDefenderLosses, attackerPower: combat.attackerPower, defenderPower: combat.defenderPower }, loot: null, message: combat.attackerWon ? 'Tribu vaincue! Démarrage de la récolte.' : 'Votre armée a été repoussée' };
}

// Loot after a tribe is beaten: the army loads what it can carry and brings it home (deposited on return,
// never teleported into the city); the node is debited atomically and never goes below zero.
const CARRY_FIELD = { WOOD: 'carryWood', STONE: 'carryStone', IRON: 'carryIron', FOOD: 'carryFood', GOLD: 'carryGold' };
async function collectResourceLoot(army, node, playerId, tx = prisma, reportId = null) {
  const fresh = await tx.army.findUnique({ where: { id: army.id }, include: { units: true, hero: true } });
  if (!fresh) return {};
  const carrying = fresh.carryWood + fresh.carryStone + fresh.carryIron + fresh.carryFood + fresh.carryGold;
  const room = getArmyCarryCapacity(fresh.units, unitsData, fresh.hero) - carrying;
  const field = CARRY_FIELD[node.resourceType];
  if (!field || room <= 0) return {};
  const taken = await takeFromNode(tx, node.id, room);
  if (taken <= 0) return {};
  await tx.army.update({ where: { id: army.id }, data: { [field]: { increment: taken } } });
  if (reportId) await tx.$executeRaw`UPDATE "BattleReport" SET loot = COALESCE(loot, '{}'::jsonb) || jsonb_build_object('resources', jsonb_build_object(${node.resourceType.toLowerCase()}::text, ${taken}::int)) WHERE id = ${reportId}`;
  return { [node.resourceType]: taken };
}

module.exports = { resolveTribeCombat, collectResourceLoot };
