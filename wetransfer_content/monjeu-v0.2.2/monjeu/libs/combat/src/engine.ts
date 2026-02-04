import { TIER_COEFF, DAMAGE_DEF_MULT, MAX_ROUNDS, WOUNDED_RATE, tierPriority } from './config';
import { UnitRegistry, ArmySnapshot, BattleContext, BattleResult, Tier } from './types';

/**
 * Triangle tactique: INF > ARCH > CAV > INF
 */
function getTypeBonus(attackerType: string, defenderType: string): number {
  if (attackerType === 'INF' && defenderType === 'ARCH') return 1.2;
  if (attackerType === 'ARCH' && defenderType === 'CAV') return 1.2;
  if (attackerType === 'CAV' && defenderType === 'INF') return 1.2;
  return 1.0;
}

/**
 * Calcule les dégâts d'une stack
 */
function computeStackDamage(
  registry: UnitRegistry,
  stack: { unitKey: string; tier: Tier; count: number },
  targetTier: Tier,
  heroAtkBonus: number,
  factionBonus: number,
  typeBonus: number
): number {
  const unit = registry.getUnit(stack.unitKey);
  const baseAtk = unit.stats.attack * stack.count;
  const tierMult = TIER_COEFF[stack.tier] / TIER_COEFF[targetTier];
  
  return baseAtk * tierMult * (1 + heroAtkBonus) * (1 + factionBonus) * typeBonus;
}

/**
 * Applique les dégâts à une armée
 */
function applyDamage(
  registry: UnitRegistry,
  stacks: { unitKey: string; tier: Tier; count: number }[],
  damage: number,
  heroDefBonus: number,
  killed: Record<string, number>,
  wounded: Record<string, number>
): number {
  // Trier par priorité (elite/inter d'abord, puis base, puis siege)
  const sorted = [...stacks].sort((a, b) => tierPriority(a.tier) - tierPriority(b.tier));
  
  let remainingDamage = damage * (1 - heroDefBonus * 0.01);
  
  for (const stack of sorted) {
    if (stack.count <= 0 || remainingDamage <= 0) continue;
    
    const unit = registry.getUnit(stack.unitKey);
    const effectiveHp = unit.stats.endurance * TIER_COEFF[stack.tier];
    const hpPerUnit = effectiveHp * DAMAGE_DEF_MULT + unit.stats.defense * 0.5;
    
    const unitsKillable = Math.floor(remainingDamage / hpPerUnit);
    const actualKilled = Math.min(unitsKillable, stack.count);
    
    // Wounded calculation (35% of killed become wounded)
    const actualWounded = Math.floor(actualKilled * WOUNDED_RATE);
    const permanentlyKilled = actualKilled - actualWounded;
    
    killed[stack.unitKey] = (killed[stack.unitKey] || 0) + permanentlyKilled;
    wounded[stack.unitKey] = (wounded[stack.unitKey] || 0) + actualWounded;
    stack.count -= actualKilled;
    
    remainingDamage -= actualKilled * hpPerUnit;
  }
  
  return remainingDamage;
}

/**
 * Simule une bataille complète
 */
export function simulateBattle(
  registry: UnitRegistry,
  attacker: ArmySnapshot,
  defender: ArmySnapshot,
  ctx: BattleContext
): BattleResult {
  // Clone stacks pour mutation
  const atkStacks = attacker.stacks.map(s => ({ ...s }));
  const defStacks = defender.stacks.map(s => ({ ...s }));
  
  const result: BattleResult = {
    winner: 'DRAW',
    rounds: 0,
    attacker: { killed: {}, wounded: {}, remaining: {} },
    defender: { killed: {}, wounded: {}, remaining: {} },
  };
  
  // Hero bonuses
  const atkHeroAtk = attacker.hero ? attacker.hero.atkPoints * 0.5 : 0;
  const atkHeroDef = attacker.hero ? attacker.hero.defPoints * 0.5 : 0;
  const defHeroAtk = defender.hero ? defender.hero.atkPoints * 0.5 : 0;
  const defHeroDef = defender.hero ? defender.hero.defPoints * 0.5 : 0;
  
  // Faction bonuses (simplified)
  const atkFactionBonus = ctx.attackerFactionBonus?.attackBonus || 0;
  const defFactionBonus = ctx.defenderFactionBonus?.defenseBonus || 0;
  
  // City defense bonus
  const cityDefBonus = ctx.defenderInCity ? 0.15 : 0;
  
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    result.rounds = round;
    
    const atkAlive = atkStacks.filter(s => s.count > 0);
    const defAlive = defStacks.filter(s => s.count > 0);
    
    if (atkAlive.length === 0 || defAlive.length === 0) break;
    
    // Compute attacker damage
    let atkDamage = 0;
    for (const stack of atkAlive) {
      const unit = registry.getUnit(stack.unitKey);
      const targetStack = defAlive[0]; // Simplified: attack first available
      const targetUnit = registry.getUnit(targetStack.unitKey);
      const typeBonus = getTypeBonus(unit.type || 'INF', targetUnit.type || 'INF');
      
      atkDamage += computeStackDamage(
        registry, stack, targetStack.tier, atkHeroAtk / 100, atkFactionBonus / 100, typeBonus
      );
    }
    
    // Compute defender damage
    let defDamage = 0;
    for (const stack of defAlive) {
      const unit = registry.getUnit(stack.unitKey);
      const targetStack = atkAlive[0];
      const targetUnit = registry.getUnit(targetStack.unitKey);
      const typeBonus = getTypeBonus(unit.type || 'INF', targetUnit.type || 'INF');
      
      defDamage += computeStackDamage(
        registry, stack, targetStack.tier, defHeroAtk / 100, (defFactionBonus + cityDefBonus * 100) / 100, typeBonus
      );
    }
    
    // Apply damage simultaneously
    applyDamage(registry, defStacks, atkDamage, defHeroDef, result.defender.killed, result.defender.wounded);
    applyDamage(registry, atkStacks, defDamage, atkHeroDef, result.attacker.killed, result.attacker.wounded);
  }
  
  // Determine winner
  const atkRemaining = atkStacks.reduce((sum, s) => sum + s.count, 0);
  const defRemaining = defStacks.reduce((sum, s) => sum + s.count, 0);
  
  if (atkRemaining > 0 && defRemaining <= 0) {
    result.winner = 'ATTACKER';
  } else if (defRemaining > 0 && atkRemaining <= 0) {
    result.winner = 'DEFENDER';
  } else if (atkRemaining > defRemaining) {
    result.winner = 'ATTACKER';
  } else if (defRemaining > atkRemaining) {
    result.winner = 'DEFENDER';
  }
  
  // Store remaining counts
  for (const stack of atkStacks) {
    if (stack.count > 0) {
      result.attacker.remaining[stack.unitKey] = stack.count;
    }
  }
  for (const stack of defStacks) {
    if (stack.count > 0) {
      result.defender.remaining[stack.unitKey] = stack.count;
    }
  }
  
  return result;
}
