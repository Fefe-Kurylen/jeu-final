const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { calculateArmyPower, getFactionBonus } = require('../utils/calculations');

// Multiplicateur depuis un bonus de faction en % (1 si absent)
function fb(faction, type) { return faction ? 1 + (getFactionBonus(faction, type, factionsData) || 0) / 100 : 1; }

// Hero as it fights: base stats plus the points the player assigned
function heroCombatStats(hero) {
  if (!hero) return null;
  return { ...hero, attack: (hero.attack || 0) + (hero.atkPoints || 0), defense: (hero.defense || 0) + (hero.defPoints || 0) };
}

// GDD: +0.5% per hero point, capped at +5%
function heroBonus(hero, stat) {
  if (!hero) return 1;
  return 1 + Math.min(config.combat.heroBonusMax, (hero[stat] || 0) * config.combat.heroBonusPerPoint);
}

// Combat triangle, per attacking unit class vs the class it hits (GDD combat_config.json)
const BEATS = { INFANTRY: 'CAVALRY', CAVALRY: 'ARCHER', ARCHER: 'INFANTRY' };
function triangleBonus(attackerClass, defenderClass) {
  if (BEATS[attackerClass] !== defenderClass) return 1;
  return config.combat.triangle[`${attackerClass}_vs_${defenderClass}`] || 1;
}

const unitDef = (u) => unitsData.find(x => x.key === (u.unitKey || u.key));

// mods: { atk, def, hp } multipliers applied to every unit of the side
function makeSide(units, mods) {
  const TIER = config.combat.tierCoefficients;
  return units.map(u => {
    const def = unitDef(u);
    const tier = u.tier || def?.tier || 'base';
    const coeff = TIER[tier] || 1;
    return {
      key: u.unitKey || u.key, name: def?.name || u.unitKey || u.key, initial: u.count, count: u.count, tier,
      unitClass: def?.class || 'INFANTRY',
      atk: (def?.stats?.attack || 30) * coeff * mods.atk,
      def: (def?.stats?.defense || 30) * coeff * mods.def,
      hp: (def?.stats?.endurance || 50) * mods.hp,
      carry: 0
    };
  });
}

// Damage one unit of `a` deals to one unit of `t`: ATK × triangle − 0.55 × DEF, never below 20% of ATK (GDD)
function hitDamage(a, t) {
  const raw = a.atk * triangleBonus(a.unitClass, t.unitClass);
  return Math.max(raw - config.combat.defenseDamageMult * t.def, raw * config.combat.minDamageRatio);
}

// One side strikes: each group spends its attackers on the enemy by targeting priority
// (elite > intermediate > base > siege, GDD); the surplus of a wiped tier spills onto the next one.
// `attackers` is a pre-round snapshot so both sides strike simultaneously.
function strike(attackers, defenders) {
  const kills = {};
  for (const a of attackers) {
    if (a.count <= 0) continue;
    let budget = a.count * config.combat.roundDamageFactor;
    for (const tier of config.combat.targetingPriority) {
      if (budget <= 1e-9) break;
      const targets = defenders.filter(d => d.tier === tier && d.count > 0);
      if (!targets.length) continue;
      const pool = targets.reduce((s, d) => s + d.count * d.hp, 0);
      const allocated = budget;
      for (const t of targets) {
        if (t.count <= 0) continue;
        const units = allocated * (t.count * t.hp) / pool;
        const perUnit = hitDamage(a, t);
        const hpLeft = t.count * t.hp;
        const dmg = units * perUnit + t.carry;
        if (dmg >= hpLeft) {
          kills[t.key] = (kills[t.key] || 0) + t.count;
          budget -= Math.max(0, (hpLeft - t.carry) / perUnit);
          t.count = 0; t.carry = 0;
        } else {
          const killed = Math.floor(dmg / t.hp);
          kills[t.key] = (kills[t.key] || 0) + killed;
          budget -= units;
          t.count -= killed; t.carry = dmg - killed * t.hp;
        }
      }
    }
  }
  return kills;
}

const totalDamage = (side, enemies) => side.reduce((s, a) => s + a.count * config.combat.roundDamageFactor * (enemies.find(e => e.count > 0) ? hitDamage(a, enemies.find(e => e.count > 0)) : a.atk), 0);
const remainingPower = (side) => side.reduce((s, u) => s + Math.max(0, u.count) * u.atk, 0);

// Simple power-based resolution (raids, tribe fights). GDD raid rule: a fight stops once a side drops
// below 70%, so the loser never loses more than 30%.
function resolveCombat(attackerUnits, defenderUnits, defenderWallLevel = 0, attackerHero = null, defenderHero = null) {
  const attackerHeroBonus = heroBonus(attackerHero, 'attack');
  const defenderHeroBonus = heroBonus(defenderHero, 'defense');

  const attackerPower = calculateArmyPower(attackerUnits, unitsData) * attackerHeroBonus;
  const wallBonus = 1 + (defenderWallLevel * config.combat.wallBonusPerLevel);
  const defenderPower = calculateArmyPower(defenderUnits, unitsData) * wallBonus * defenderHeroBonus;

  const attackerWon = attackerPower > defenderPower;
  const ratio = attackerWon ? defenderPower / Math.max(1, attackerPower) : attackerPower / Math.max(1, defenderPower);

  const winnerLossRate = ratio * config.combat.winnerLossMultiplier;
  const loserLossRate = config.combat.loserLossRate;

  return {
    attackerWon,
    attackerLossRate: attackerWon ? winnerLossRate : loserLossRate,
    defenderLossRate: attackerWon ? loserLossRate : winnerLossRate,
    attackerPower,
    defenderPower
  };
}

// Detailed round-by-round combat used for city attacks (replayable)
function resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel = 0, moatLevel = 0, attackerName, defenderName, attackerHero = null, defenderHero = null, attackerFaction = null, defenderFaction = null) {
  // Wall: +1%/level to the defenders' defense (EGYPT wallHealth makes it more effective);
  // moat: +0.5%/level to the defenders' attack and defense. Each applied once.
  const wallBonus = 1 + wallLevel * config.combat.wallBonusPerLevel * fb(defenderFaction, 'wallHealth');
  const moatBonus = 1 + moatLevel * config.combat.moatBonusPerLevel;

  const attackers = makeSide(attackerUnits, {
    atk: fb(attackerFaction, 'siegeAttack') * heroBonus(attackerHero, 'attack'),
    def: fb(attackerFaction, 'unitDefense') * heroBonus(attackerHero, 'defense'),
    hp: fb(attackerFaction, 'siegeLossReduction')
  });
  const defenders = makeSide(defenderUnits, {
    atk: moatBonus * fb(defenderFaction, 'defendingCityAttack') * heroBonus(defenderHero, 'attack'),
    def: (wallBonus + moatBonus - 1) * fb(defenderFaction, 'cityDefense') * fb(defenderFaction, 'unitDefense') * heroBonus(defenderHero, 'defense'),
    hp: fb(defenderFaction, 'siegeLossReduction')
  });

  const attackerInitialUnits = attackers.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const defenderInitialUnits = defenders.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const byKey = (side) => Object.fromEntries(side.map(u => [u.key, u]));
  const aByKey = byKey(attackers), dByKey = byKey(defenders);
  const rounds = [];

  for (let round = 1; round <= config.combat.maxRounds; round++) {
    if (attackers.every(u => u.count <= 0) || defenders.every(u => u.count <= 0)) break;
    const snapA = attackers.map(u => ({ ...u }));
    const snapD = defenders.map(u => ({ ...u }));
    const attackerDamage = totalDamage(snapA, snapD);
    const defenderDamage = totalDamage(snapD, snapA);
    const killsOnDefenders = strike(snapA, defenders);
    const killsOnAttackers = strike(snapD, attackers);
    rounds.push({
      round,
      attackerDamage: Math.floor(attackerDamage),
      defenderDamage: Math.floor(defenderDamage),
      attackerKills: Object.entries(killsOnDefenders).filter(([, n]) => n > 0).map(([key, killed]) => ({ key, name: dByKey[key].name, killed })),
      defenderKills: Object.entries(killsOnAttackers).filter(([, n]) => n > 0).map(([key, killed]) => ({ key, name: aByKey[key].name, killed })),
      attackerRemaining: attackers.reduce((sum, u) => sum + Math.max(0, u.count), 0),
      defenderRemaining: defenders.reduce((sum, u) => sum + Math.max(0, u.count), 0)
    });
  }

  const finalUnits = (side) => side.map(u => ({ key: u.key, name: u.name, initial: u.initial, remaining: Math.max(0, u.count), killed: u.initial - Math.max(0, u.count) }));
  const attackerFinalUnits = finalUnits(attackers);
  const defenderFinalUnits = finalUnits(defenders);
  const attackerTotalInitial = attackers.reduce((sum, u) => sum + u.initial, 0);
  const defenderTotalInitial = defenders.reduce((sum, u) => sum + u.initial, 0);
  const attackerTotalKilled = attackerFinalUnits.reduce((sum, u) => sum + u.killed, 0);
  const defenderTotalKilled = defenderFinalUnits.reduce((sum, u) => sum + u.killed, 0);

  return {
    attackerWon: remainingPower(attackers) > remainingPower(defenders),
    attackerLossRate: attackerTotalInitial > 0 ? attackerTotalKilled / attackerTotalInitial : 0,
    defenderLossRate: defenderTotalInitial > 0 ? defenderTotalKilled / defenderTotalInitial : 0,
    attackerTotalKilled, defenderTotalKilled,
    attackerInitialUnits, defenderInitialUnits,
    attackerFinalUnits, defenderFinalUnits,
    rounds, wallBonus, moatBonus
  };
}

module.exports = { resolveCombat, resolveCombatDetailed, heroCombatStats, heroBonus };
