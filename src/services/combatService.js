const HE = require('../utils/heroEffects');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { calculateArmyPower, getFactionBonus } = require('../utils/calculations');

// Multiplicateur depuis un bonus de faction en % (1 si absent)
function fb(faction, type) { return faction ? 1 + (getFactionBonus(faction, type, factionsData) || 0) / 100 : 1; }

// The hero as he fights: his row with items and talents (the bonus is read by heroBonus)
function heroCombatStats(hero) {
  return hero ? { ...hero } : null;
}

// Points (+0,1 % each, cap +5 %), equipment (+0,5 % per point, cap +5 % apart) and talents (utils/heroEffects.js)
function heroBonus(hero, stat) {
  return HE.statMult(hero, stat);
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
      unitClass: def?.class || 'INFANTRY', faction: def?.faction || null,
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

// Puissance d'un côté : « +10 % défense des unités » (Rome) ne porte que sur la part défense, en attaque comme en défense ;
// faction de chaque ligne si elle est donnée (rassemblement d'alliance à civilisations mêlées), sinon celle du côté
function sidePower(units, faction) {
  return units.reduce((t, u) => t + calculateArmyPower([u], unitsData, fb(u.faction || faction, 'unitDefense')), 0);
}

// Simple power-based resolution (raids, tribe fights). GDD raid rule: a fight stops once a side drops
// below 70%, so the loser never loses more than 30%.
// opts: { moatLevel, defenderFaction, defenseBonusPct } — the city's defensive modifiers, applied once each;
// attackerFaction — the attacking player's civilisation (Rome's unit defence)
// attackerBonusPct / defenderBonusPct — the players' technologies (Art de la guerre, Discipline), in percent
// winnerLossMultiplier — overrides config.combat.winnerLossMultiplier (tribe fights)
// fieldBattle — open-field fight on a resource node: the defender's « défense chez soi » does not apply
function resolveCombat(attackerUnits, defenderUnits, defenderWallLevel = 0, attackerHero = null, defenderHero = null, opts = {}) {
  const attackerHeroBonus = heroBonus(attackerHero, 'attack');
  const defenderHeroBonus = heroBonus(defenderHero, 'defense');

  const attackerPower = sidePower(attackerUnits, opts.attackerFaction) * attackerHeroBonus * (1 + (opts.attackerBonusPct || 0) / 100);
  const wallBonus = 1 + defenderWallLevel * config.combat.wallBonusPerLevel;   // « wallHealth » (Égypte) porte sur les points de vie du mur, pas sur ce bonus
  const moatBonus = 1 + (opts.moatLevel || 0) * config.combat.moatBonusPerLevel;
  // fieldBattle: an army fighting on a resource node, not in its city — no « défense chez soi »
  const cityBonus = (1 + (opts.defenseBonusPct || 0) / 100) * (opts.fieldBattle ? 1 : fb(opts.defenderFaction, 'cityDefense')) * (1 + (opts.defenderBonusPct || 0) / 100);
  const defenderPower = sidePower(defenderUnits, opts.defenderFaction) * wallBonus * moatBonus * cityBonus * defenderHeroBonus;

  const attackerWon = attackerPower > defenderPower;
  const ratio = attackerWon ? defenderPower / Math.max(1, attackerPower) : attackerPower / Math.max(1, defenderPower);

  const winnerLossRate = ratio * (opts.winnerLossMultiplier || config.combat.winnerLossMultiplier);   // tribes use config.combat.tribeLossMultiplier
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
// techMods: { attacker: { atk, def }, defender: { atk, def } } multipliers from the players' technologies (1 when absent)
// wall: { hp, maxHp } — the wall as a shield (sieges, décision d'octobre 2026): while it stands, every blow of the
// attacker falls on it (siege engines strike it far harder than soldiers) and the defenders take nothing; its defence
// bonus fades with the hit points it has left; once it is down, the blows reach the soldiers. The attacker wins only
// if the wall is down. Without `wall`, the wall is a plain defence bonus (raids, simulations).
function resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel = 0, moatLevel = 0, attackerName, defenderName, attackerHero = null, defenderHero = null, attackerFaction = null, defenderFaction = null, defenseBonusPct = 0, techMods = null, wall = null) {
  // Wall: +1%/level to the defenders' defense (the Egyptian wallHealth bonus raises the wall's hit points instead);
  // moat: +0.5%/level to the defenders' attack and defense. Each applied once.
  const shield = wall && wallLevel > 0 && wall.maxHp > 0 ? { hp: Math.max(0, Math.min(wall.maxHp, wall.hp)), maxHp: wall.maxHp } : null;
  const wallHpStart = shield ? shield.hp : null;
  const wallBonusNow = () => 1 + wallLevel * config.combat.wallBonusPerLevel * (shield ? shield.hp / shield.maxHp : 1);
  const wallBonus = wallBonusNow();
  const moatBonus = 1 + moatLevel * config.combat.moatBonusPerLevel;

  const attackers = makeSide(attackerUnits, {
    atk: fb(attackerFaction, 'siegeAttack') * heroBonus(attackerHero, 'attack') * (techMods?.attacker?.atk || 1),
    def: fb(attackerFaction, 'unitDefense') * heroBonus(attackerHero, 'defense') * (techMods?.attacker?.def || 1),
    hp: fb(attackerFaction, 'siegeLossReduction')
  });
  const defenders = makeSide(defenderUnits, {
    atk: moatBonus * fb(defenderFaction, 'defendingCityAttack') * heroBonus(defenderHero, 'attack') * (techMods?.defender?.atk || 1),
    def: (1 + defenseBonusPct / 100) * fb(defenderFaction, 'cityDefense') * fb(defenderFaction, 'unitDefense') * heroBonus(defenderHero, 'defense') * (techMods?.defender?.def || 1),
    hp: fb(defenderFaction, 'siegeLossReduction')
  });
  // the wall and moat part of the defence, recomputed each round (the wall's bonus fades as it is battered)
  for (const d of defenders) d.def0 = d.def;
  const applyWallDefense = () => { const m = wallBonusNow() + moatBonus - 1; for (const d of defenders) d.def = d.def0 * m; };
  applyWallDefense();
  const W = config.combat.siege.wallShield;

  const attackerInitialUnits = attackers.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const defenderInitialUnits = defenders.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const byKey = (side) => Object.fromEntries(side.map(u => [u.key, u]));
  const aByKey = byKey(attackers), dByKey = byKey(defenders);
  const rounds = [];

  for (let round = 1; round <= config.combat.maxRounds; round++) {
    const wallUp = shield && shield.hp > 0;
    if (attackers.every(u => u.count <= 0) || (defenders.every(u => u.count <= 0) && !wallUp)) break;
    applyWallDefense();
    const snapA = attackers.map(u => ({ ...u }));
    const snapD = defenders.map(u => ({ ...u }));
    let wallDamage = 0, strikers = snapA;
    if (wallUp) {
      // the blows fall on the wall first; what is left of the round once it is down reaches the soldiers
      // talents : Ingénieur de siège (attaquant), Gardien des murs (héros qui défend la ville) ; engins du Sultanat +25 %
      // (faction de l'engin) ; « défense chez soi » (Gaule) : le mur encaisse 1/1,2 des coups
      const wallTalent = Math.max(0, 1 + HE.talent(attackerHero, 'wallDamagePct') / 100 - HE.talent(defenderHero, 'wallGuardPct') / 100) / fb(defenderFaction, 'cityDefense');
      const dmg = wallTalent * snapA.reduce((t, a) => t + Math.max(0, a.count) * config.combat.roundDamageFactor * a.atk * (a.unitClass === 'SIEGE' ? W.engineMult * fb(a.faction, 'siegeEngineAttack') : W.soldierMult), 0);
      wallDamage = Math.min(dmg, shield.hp);
      const rest = dmg > shield.hp && dmg > 0 ? 1 - shield.hp / dmg : 0;
      shield.hp = Math.max(0, shield.hp - dmg);
      strikers = snapA.map(a => ({ ...a, count: a.count * rest }));
    }
    const attackerDamage = totalDamage(strikers, snapD) + wallDamage;
    const defenderDamage = totalDamage(snapD, snapA);
    const killsOnDefenders = strike(strikers, defenders);
    const killsOnAttackers = strike(snapD, attackers);
    rounds.push({
      ...(shield ? { wallHp: Math.round(shield.hp), wallDamage: Math.round(wallDamage) } : {}),
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
    // behind a standing wall the city holds, whatever the strength of the attacker
    attackerWon: !(shield && shield.hp > 0) && remainingPower(attackers) > remainingPower(defenders),
    wallHpStart, wallHpEnd: shield ? Math.round(shield.hp) : null, wallMaxHp: shield ? shield.maxHp : null,
    attackerLossRate: attackerTotalInitial > 0 ? attackerTotalKilled / attackerTotalInitial : 0,
    defenderLossRate: defenderTotalInitial > 0 ? defenderTotalKilled / defenderTotalInitial : 0,
    attackerTotalKilled, defenderTotalKilled,
    attackerInitialUnits, defenderInitialUnits,
    attackerFinalUnits, defenderFinalUnits,
    rounds, wallBonus, moatBonus
  };
}

module.exports = { resolveCombat, resolveCombatDetailed, heroCombatStats, heroBonus };
