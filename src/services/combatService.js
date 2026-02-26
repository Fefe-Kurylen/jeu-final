const config = require('../config');
const { unitsData } = require('../config/gamedata');
const { calculateArmyPower } = require('../utils/calculations');

// Simple combat resolution (for raids)
function resolveCombat(attackerUnits, defenderUnits, defenderWallLevel = 0, attackerHero = null, defenderHero = null) {
  const attackerHeroBonus = attackerHero ? 1 + ((attackerHero.attack || 0) + (attackerHero.defense || 0)) * config.combat.heroBonusPerPoint : 1;
  const defenderHeroBonus = defenderHero ? 1 + ((defenderHero.attack || 0) + (defenderHero.defense || 0)) * config.combat.heroBonusPerPoint : 1;

  const attackerPower = calculateArmyPower(attackerUnits, unitsData) * attackerHeroBonus;
  const wallBonus = 1 + (defenderWallLevel * config.combat.wallBonusPerLevel);
  const defenderPower = calculateArmyPower(defenderUnits, unitsData) * wallBonus * defenderHeroBonus;

  const attackerWon = attackerPower > defenderPower;
  const ratio = attackerWon ? defenderPower / attackerPower : attackerPower / defenderPower;

  const winnerLossRate = ratio * config.combat.winnerLossMultiplier;
  const loserLossRate = config.combat.loserLossBase + Math.random() * config.combat.loserLossRandom;

  return {
    attackerWon,
    attackerLossRate: attackerWon ? winnerLossRate : loserLossRate,
    defenderLossRate: attackerWon ? loserLossRate : winnerLossRate,
    attackerPower,
    defenderPower
  };
}

// Detailed combat with rounds for replay
function resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel = 0, moatLevel = 0, attackerName, defenderName, attackerHero = null, defenderHero = null) {
  const TIER_COEFF = config.combat.tierCoefficients;
  const hbp = config.combat.heroBonusPerPoint;

  const attackerHeroAttackBonus = attackerHero ? 1 + (attackerHero.attack || 0) * hbp : 1;
  const attackerHeroDefenseBonus = attackerHero ? 1 + (attackerHero.defense || 0) * hbp : 1;
  const defenderHeroAttackBonus = defenderHero ? 1 + (defenderHero.attack || 0) * hbp : 1;
  const defenderHeroDefenseBonus = defenderHero ? 1 + (defenderHero.defense || 0) * hbp : 1;

  const attackers = attackerUnits.map(u => {
    const def = unitsData.find(x => x.key === u.unitKey);
    const tier = u.tier || def?.tier || 'base';
    return {
      key: u.unitKey, initial: u.count, count: u.count, tier,
      attack: (def?.stats?.attack || 30) * TIER_COEFF[tier] * attackerHeroAttackBonus,
      defense: (def?.stats?.defense || 30) * TIER_COEFF[tier] * attackerHeroDefenseBonus,
      hp: def?.stats?.endurance || 50,
      name: def?.name || u.unitKey
    };
  });

  const defenders = defenderUnits.map(u => {
    const def = unitsData.find(x => x.key === u.unitKey);
    const tier = u.tier || def?.tier || 'base';
    return {
      key: u.unitKey, initial: u.count, count: u.count, tier,
      attack: (def?.stats?.attack || 30) * TIER_COEFF[tier] * defenderHeroAttackBonus,
      defense: (def?.stats?.defense || 30) * TIER_COEFF[tier] * defenderHeroDefenseBonus,
      hp: def?.stats?.endurance || 50,
      name: def?.name || u.unitKey
    };
  });

  const wallBonus = 1 + (wallLevel * config.combat.wallBonusPerLevel);
  const moatBonus = 1 + (moatLevel * config.combat.moatBonusPerLevel);
  const defenseMultiplier = wallBonus * moatBonus;

  const attackerInitialUnits = attackers.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const defenderInitialUnits = defenders.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));

  const rounds = [];

  for (let round = 1; round <= config.combat.maxRounds; round++) {
    const attackerTotal = attackers.reduce((sum, u) => sum + u.count, 0);
    const defenderTotal = defenders.reduce((sum, u) => sum + u.count, 0);

    if (attackerTotal <= 0 || defenderTotal <= 0) break;

    const attackerDamage = attackers.reduce((sum, u) => sum + u.count * u.attack, 0);
    const defenderDamage = defenders.reduce((sum, u) => sum + u.count * u.attack * defenseMultiplier, 0);

    const defenderKills = [];
    for (const unit of defenders) {
      if (unit.count <= 0) continue;
      const unitTotalHp = unit.count * unit.hp * defenseMultiplier;
      const damageToUnit = Math.min(attackerDamage * (unitTotalHp / defenders.reduce((s, u) => s + u.count * u.hp * defenseMultiplier, 1)), unitTotalHp);
      const killed = Math.floor(damageToUnit / (unit.hp * defenseMultiplier));
      const actualKilled = Math.min(killed, unit.count);
      unit.count -= actualKilled;
      if (actualKilled > 0) {
        defenderKills.push({ key: unit.key, name: unit.name, killed: actualKilled });
      }
    }

    const attackerKills = [];
    for (const unit of attackers) {
      if (unit.count <= 0) continue;
      const unitTotalHp = unit.count * unit.hp;
      const damageToUnit = Math.min(defenderDamage * (unitTotalHp / attackers.reduce((s, u) => s + u.count * u.hp, 1)), unitTotalHp);
      const killed = Math.floor(damageToUnit / unit.hp);
      const actualKilled = Math.min(killed, unit.count);
      unit.count -= actualKilled;
      if (actualKilled > 0) {
        attackerKills.push({ key: unit.key, name: unit.name, killed: actualKilled });
      }
    }

    rounds.push({
      round,
      attackerDamage: Math.floor(attackerDamage),
      defenderDamage: Math.floor(defenderDamage),
      attackerKills, defenderKills,
      attackerRemaining: attackers.reduce((sum, u) => sum + u.count, 0),
      defenderRemaining: defenders.reduce((sum, u) => sum + u.count, 0)
    });

    if (attackers.every(u => u.count <= 0) || defenders.every(u => u.count <= 0)) break;
  }

  const attackerFinalUnits = attackers.map(u => ({
    key: u.key, name: u.name, initial: u.initial,
    remaining: Math.max(0, u.count), killed: u.initial - Math.max(0, u.count)
  }));

  const defenderFinalUnits = defenders.map(u => ({
    key: u.key, name: u.name, initial: u.initial,
    remaining: Math.max(0, u.count), killed: u.initial - Math.max(0, u.count)
  }));

  const attackerTotalRemaining = attackers.reduce((sum, u) => sum + Math.max(0, u.count), 0);
  const defenderTotalRemaining = defenders.reduce((sum, u) => sum + Math.max(0, u.count), 0);
  const attackerTotalInitial = attackers.reduce((sum, u) => sum + u.initial, 0);
  const defenderTotalInitial = defenders.reduce((sum, u) => sum + u.initial, 0);

  const attackerTotalKilled = attackerTotalInitial - attackerTotalRemaining;
  const defenderTotalKilled = defenderTotalInitial - defenderTotalRemaining;

  // Compare remaining POWER (not unit count) to determine winner
  const attackerRemainingPower = attackers.reduce((sum, u) => sum + Math.max(0, u.count) * u.attack, 0);
  const defenderRemainingPower = defenders.reduce((sum, u) => sum + Math.max(0, u.count) * u.attack * defenseMultiplier, 0);

  return {
    attackerWon: attackerRemainingPower > defenderRemainingPower,
    attackerLossRate: attackerTotalInitial > 0 ? attackerTotalKilled / attackerTotalInitial : 0,
    defenderLossRate: defenderTotalInitial > 0 ? defenderTotalKilled / defenderTotalInitial : 0,
    attackerTotalKilled, defenderTotalKilled,
    attackerInitialUnits, defenderInitialUnits,
    attackerFinalUnits, defenderFinalUnits,
    rounds, wallBonus, moatBonus
  };
}

module.exports = { resolveCombat, resolveCombatDetailed };
