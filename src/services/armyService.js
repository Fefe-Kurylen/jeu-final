// ========== ARMY SERVICE ==========
// Business logic for army operations, extracted from routes/armies.js
// Fixes circular dependency: tick.js -> routes/armies.js -> tick.js

const prisma = require('../config/database');
const { unitsData } = require('../config/gamedata');
const { getArmyCarryCapacity } = require('../utils/calculations');
const { resolveCombat, heroCombatStats } = require('./combatService');

async function resolveTribeCombat(army, node, playerId) {
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

  const combat = resolveCombat(army.units.map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })), defenderUnits, 0, heroCombatStats(army.hero), null);

  let totalAttackerLosses = 0;
  for (const unit of army.units) {
    const losses = Math.floor(unit.count * combat.attackerLossRate);
    totalAttackerLosses += losses;
    const newCount = unit.count - losses;
    if (newCount <= 0) { await prisma.armyUnit.delete({ where: { id: unit.id } }); }
    else { await prisma.armyUnit.update({ where: { id: unit.id }, data: { count: newCount } }); }
  }

  let totalDefenderLosses = 0;
  const newDefenderUnits = {};
  for (const [unitType, count] of Object.entries(node.defenderUnits)) {
    const losses = Math.floor(count * combat.defenderLossRate);
    totalDefenderLosses += losses;
    newDefenderUnits[unitType] = Math.max(0, count - losses);
  }

  if (combat.attackerWon) {
    await prisma.resourceNode.update({ where: { id: node.id }, data: { hasDefenders: false, defenderUnits: newDefenderUnits, defenderPower: 0, lastDefeat: new Date() } });
    if (army.heroId) { const { awardHeroXp } = require('./heroXpService'); await awardHeroXp(army.heroId, Math.floor(node.defenderPower * 0.5)); }
  } else {
    await prisma.resourceNode.update({ where: { id: node.id }, data: { defenderUnits: newDefenderUnits, defenderPower: Math.floor(node.defenderPower * (1 - combat.defenderLossRate)) } });
  }

  await prisma.battleReport.create({
    data: { playerId, attackerId: playerId, x: node.x, y: node.y, result: combat.attackerWon ? 'WIN' : 'LOSE', winner: combat.attackerWon ? 'ATTACKER' : 'DEFENDER', attackerLosses: { totalAttackerLosses }, defenderLosses: { totalDefenderLosses }, loot: {}, rounds: { type: 'TRIBE_RAID', resourceType: node.resourceType } }
  });

  return { success: combat.attackerWon, combatResult: { winner: combat.attackerWon ? 'attacker' : 'defender', attackerLosses: totalAttackerLosses, defenderLosses: totalDefenderLosses, attackerPower: combat.attackerPower, defenderPower: combat.defenderPower }, loot: null, message: combat.attackerWon ? 'Tribu vaincue! Démarrage de la récolte.' : 'Votre armée a été repoussée' };
}

async function collectResourceLoot(army, node, playerId) {
  const armyWithUnits = await prisma.army.findUnique({ where: { id: army.id }, include: { units: true } });
  const carryCapacity = getArmyCarryCapacity(armyWithUnits.units, unitsData);
  const lootAmount = Math.min(carryCapacity, node.amount);
  if (lootAmount <= 0) return {};
  await prisma.resourceNode.update({ where: { id: node.id }, data: { amount: { decrement: lootAmount } } });
  if (node.resourceType === 'GOLD') {
    await prisma.player.update({ where: { id: playerId }, data: { gold: { increment: lootAmount } } });
    return { GOLD: lootAmount };
  }
  const city = army.cityId
    ? await prisma.city.findUnique({ where: { id: army.cityId } })
    : await prisma.city.findFirst({ where: { playerId, isCapital: true } });
  if (city) {
    const resourceField = node.resourceType.toLowerCase();
    const maxCap = resourceField === 'food' ? city.maxFoodStorage : city.maxStorage;
    const newAmount = Math.min(city[resourceField] + lootAmount, maxCap);
    await prisma.city.update({ where: { id: city.id }, data: { [resourceField]: newAmount } });
  }
  return { [node.resourceType]: lootAmount };
}

module.exports = { resolveTribeCombat, collectResourceLoot };
