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

// modsOf(ligne) : { atk, def, hp }, les multiplicateurs de la ligne (ceux du camp, ou ceux de la civilisation que porte la
// ligne dans un rassemblement à civilisations mêlées)
// Coefficients de BATAILLE (1 / 1,35 / 1,9, GDD) sur l'attaque et la défense ; l'endurance n'en a pas
function makeSide(units, modsOf) {
  const TIER = config.combat.battleTierCoefficients;
  return units.map(u => {
    const def = unitDef(u);
    const tier = u.tier || def?.tier || 'base';
    const coeff = TIER[tier] || 1;
    const mods = modsOf(u);
    const side = {
      key: u.unitKey || u.key, name: def?.name || u.unitKey || u.key, initial: u.count, count: u.count, tier,
      unitClass: def?.class || 'INFANTRY', faction: def?.faction || null,
      atk: (def?.stats?.attack || 30) * coeff * mods.atk,
      def: (def?.stats?.defense || 30) * coeff * mods.def,
      end: (def?.stats?.endurance || 50), hpMult: mods.hp,
      carry: 0
    };
    side.hp = solidity(side);
    return side;
  });
}

// Solidité d'une unité (moteur du GDD) : END + 0,55 × DEF, DEF portant déjà coefficient, bonus et mur ;
// « réduction des pertes » (Rome) la multiplie
function solidity(u) {
  return (u.end + config.combat.defenseDamageMult * u.def) * u.hpMult;
}

// Dégâts d'un coup d'une unité de `a` sur `t` : ATK × triangle, sans soustraction de la défense (GDD) ; la défense de
// la cible est dans sa solidité
function hitDamage(a, t) {
  return a.atk * triangleBonus(a.unitClass, t.unitClass);
}

// Un camp frappe ; `attackers` est l'état d'avant le round (les deux camps frappent en même temps). Chaque ligne répartit
// ses coups sur tous les soldats ennemis à la fois, au prorata de la solidité totale de chaque ligne (décision du
// 30 octobre 2026, rapport économie, recommandation 10 : plus d'élites visées d'abord) ; le surplus d'une ligne anéantie
// passe aux lignes encore debout. Les engins de siège, derrière les soldats, ne sont touchés qu'une fois les soldats tombés.
// `share` : la part du round jouée (1 ; moins quand un raid s'arrête en cours de round)
const TARGET_GROUPS = [(d) => d.tier !== 'siege', (d) => d.tier === 'siege'];
function strike(attackers, defenders, share = 1) {
  const kills = {};
  for (const a of attackers) {
    if (a.count <= 0) continue;
    let budget = a.count * config.combat.roundDamageFactor * share;
    for (const inGroup of TARGET_GROUPS) {
      let targets;
      while (budget > 1e-9 && (targets = defenders.filter(d => d.count > 0 && inGroup(d))).length) {
        const pool = targets.reduce((s, d) => s + d.count * d.hp, 0);
        const allocated = budget;
        let wiped = false;
        for (const t of targets) {
          const units = allocated * (t.count * t.hp) / pool;
          const perUnit = hitDamage(a, t);
          const hpLeft = t.count * t.hp;
          const dmg = units * perUnit + t.carry;
          if (dmg >= hpLeft) {
            kills[t.key] = (kills[t.key] || 0) + t.count;
            budget -= Math.max(0, (hpLeft - t.carry) / perUnit);
            t.count = 0; t.carry = 0; wiped = true;
          } else {
            const killed = Math.floor(dmg / t.hp);
            kills[t.key] = (kills[t.key] || 0) + killed;
            budget -= units;
            t.count -= killed; t.carry = dmg - killed * t.hp;
          }
        }
        if (!wiped) break;   // tout le budget a porté : rien à reporter
      }
    }
  }
  return kills;
}

const totalDamage = (side, enemies) => side.reduce((s, a) => s + a.count * config.combat.roundDamageFactor * (enemies.find(e => e.count > 0) ? hitDamage(a, enemies.find(e => e.count > 0)) : a.atk), 0);
const remainingPower = (side) => side.reduce((s, u) => s + Math.max(0, u.count) * u.atk, 0);
// part des soldats d'un camp tombés depuis le début du combat
const lostShare = (side) => { const n = side.reduce((t, u) => t + u.initial, 0); return n > 0 ? side.reduce((t, u) => t + u.initial - Math.max(0, u.count), 0) / n : 0; };

// Puissance d'un côté : « +10 % défense des unités » (Rome) ne porte que sur la part défense, en attaque comme en défense ;
// faction de chaque ligne si elle est donnée (rassemblement d'alliance à civilisations mêlées), sinon celle du côté
function sidePower(units, faction) {
  return units.reduce((t, u) => t + calculateArmyPower([u], unitsData, fb(u.faction || faction, 'unitDefense')), 0);
}

// Lignes d'un camp pour le moteur : une par type d'unité (plusieurs armées peuvent amener le même type), sans les lignes
// vides ; la ligne garde la civilisation de la première armée qui l'amène
function battleLines(units) {
  const m = new Map();
  for (const u of units || []) {
    const key = u.unitKey || u.key;
    if (!key || !(u.count > 0)) continue;
    if (m.has(key)) m.get(key).count += u.count;
    else m.set(key, { unitKey: key, tier: u.tier, count: u.count, ...(u.faction ? { faction: u.faction } : {}) });
  }
  return [...m.values()];
}

// Tous les combats hors siège de ville, assaut de Bastion et vague d'Immortels passent par le moteur de bataille
// (décision du 2 novembre 2026 (deuxième simulation de 200 jours), G3 : raids, camps de tribus, donjons, sites et plans des
// Immortels, combats en terrain ouvert : points tenus, camps de siège, rencontres, sièges du Bastion brisés). Plus de
// comparaison de puissance : attaque, défense, endurance, paliers, triangle et rounds décident, et les pertes de chaque
// type d'unité viennent des rounds. Mêmes bonus qu'avant :
// opts: attackerFaction / defenderFaction — civilisations ; une ligne qui porte `faction` garde la sienne (rassemblement)
//   defenseBonusPct — défense du défenseur en % (Brasserie de la capitale, camp d'or)
//   attackerPct / defenderPct — { atk, def } en points de % : technologies et Forge (armyService.combatPct)
//   attackerBonusPct / defenderBonusPct — forme courte : attaque de l'attaquant, défense du défenseur
//   fieldBattle — terrain ouvert : ni « défense chez soi » (Gaule) ni « attaque en défendant sa ville » (Sultanat)
//   raid — règle du raid du GDD : le combat s'arrête dès qu'un camp a perdu config.combat.loserLossRate de ses soldats
// Le mur (defenderWallLevel) n'y est qu'un bonus de défense (+1 % par niveau), jamais un bouclier. Rend le résultat du
// moteur (attackerFinalUnits / defenderFinalUnits par type d'unité, rounds) avec attackerLossRate / defenderLossRate (part
// des soldats tombés) et les puissances montrées dans les rapports (attackerPower / defenderPower).
function resolveCombat(attackerUnits, defenderUnits, defenderWallLevel = 0, attackerHero = null, defenderHero = null, opts = {}) {
  const mult = (pct, atkPct, defPct) => ({ atk: 1 + ((pct?.atk ?? atkPct) || 0) / 100, def: 1 + ((pct?.def ?? defPct) || 0) / 100 });
  const techMods = { attacker: mult(opts.attackerPct, opts.attackerBonusPct, 0), defender: mult(opts.defenderPct, 0, opts.defenderBonusPct) };
  const atHome = !opts.fieldBattle;
  const result = resolveCombatDetailed(battleLines(attackerUnits), battleLines(defenderUnits), defenderWallLevel, null, null, attackerHero, defenderHero,
    opts.attackerFaction || null, opts.defenderFaction || null, opts.defenseBonusPct || 0, techMods, null,
    { siege: false, atHome, stopAtLossPct: opts.raid ? config.combat.loserLossRate : null });
  // puissances des rapports et de la carte : (ATK + DEF) × palier, avec les mêmes bonus
  const attackerPower = sidePower(attackerUnits, opts.attackerFaction) * heroBonus(attackerHero, 'attack') * techMods.attacker.atk;
  const defenderPower = sidePower(defenderUnits, opts.defenderFaction) * (1 + defenderWallLevel * config.combat.wallBonusPerLevel) * (1 + (opts.defenseBonusPct || 0) / 100)
    * (atHome ? fb(opts.defenderFaction, 'cityDefense') : 1) * techMods.defender.def * heroBonus(defenderHero, 'defense');
  return { ...result, attackerPower, defenderPower };
}

// Detailed round-by-round combat (replayable)
// techMods: { attacker: { atk, def }, defender: { atk, def } } multipliers from the players' technologies (1 when absent)
// wall: { hp, maxHp } — the wall as a shield (sieges, décision d'octobre 2026): while it stands, every blow of the
// attacker falls on it (seuls les engins l'abîment, config.combat.siege.wallShield) and the defenders take nothing; its
// defence bonus fades with the hit points it has left; once it is down, the blows reach the soldiers and the battle goes
// on for roundsAfterBreach more rounds at least. The attacker wins only if the wall is down and he beats the defenders.
// Without `wall`, the wall is a plain defence bonus (raids, simulations). Sans défenseur (ville où aucune armée ne se
// tient), l'attaquant gagne dès que le mur, s'il fait bouclier, est tombé.
// opts: siege (vrai par défaut) — bonus de siège des civilisations : Huns +10 % d'attaque, Rome +15 % de solidité ;
//   atHome (vrai par défaut) — le défenseur est dans sa ville : Gaule +20 % de défense, Sultanat +15 % d'attaque ;
//   stopAtLossPct — règle du raid : le combat s'arrête dès qu'un camp a perdu cette part de ses soldats (le round en cours
//   est coupé à ce moment-là) ; ce camp a perdu.
// Une ligne d'unités qui porte `faction` (rassemblement à civilisations mêlées) prend les bonus de sa civilisation.
function resolveCombatDetailed(attackerUnits, defenderUnits, wallLevel = 0, attackerName, defenderName, attackerHero = null, defenderHero = null, attackerFaction = null, defenderFaction = null, defenseBonusPct = 0, techMods = null, wall = null, opts = {}) {
  const siege = opts.siege !== false, atHome = opts.atHome !== false;
  const stopAt = opts.stopAtLossPct > 0 ? opts.stopAtLossPct : null;
  // Wall: +1%/level to the defenders' defense (the Egyptian wallHealth bonus raises the wall's hit points instead)
  const shield = wall && wallLevel > 0 && wall.maxHp > 0 ? { hp: Math.max(0, Math.min(wall.maxHp, wall.hp)), maxHp: wall.maxHp } : null;
  const wallHpStart = shield ? shield.hp : null;
  const wallBonusNow = () => 1 + wallLevel * config.combat.wallBonusPerLevel * (shield ? shield.hp / shield.maxHp : 1);
  const wallBonus = wallBonusNow();

  const attackers = makeSide(attackerUnits, (u) => {
    const f = u.faction || attackerFaction;
    return {
      atk: (siege ? fb(f, 'siegeAttack') : 1) * heroBonus(attackerHero, 'attack') * (techMods?.attacker?.atk || 1),
      def: fb(f, 'unitDefense') * heroBonus(attackerHero, 'defense') * (techMods?.attacker?.def || 1),
      hp: siege ? fb(f, 'siegeLossReduction') : 1
    };
  });
  const defenders = makeSide(defenderUnits, (u) => {
    const f = u.faction || defenderFaction;
    return {
      atk: (atHome ? fb(f, 'defendingCityAttack') : 1) * heroBonus(defenderHero, 'attack') * (techMods?.defender?.atk || 1),
      def: (1 + defenseBonusPct / 100) * (atHome ? fb(f, 'cityDefense') : 1) * fb(f, 'unitDefense') * heroBonus(defenderHero, 'defense') * (techMods?.defender?.def || 1),
      hp: siege ? fb(f, 'siegeLossReduction') : 1
    };
  });
  // the wall part of the defence, recomputed each round (the wall's bonus fades as it is battered) : il entre dans la
  // solidité des défenseurs
  for (const d of defenders) d.def0 = d.def;
  const applyWallDefense = () => { const m = wallBonusNow(); for (const d of defenders) { d.def = d.def0 * m; d.hp = solidity(d); } };
  applyWallDefense();
  const W = config.combat.siege.wallShield;
  // brèche : le mur tombé, le combat dure encore roundsAfterBreach rounds au moins (l'attaquant doit battre les défenseurs)
  let lastRound = config.combat.maxRounds;

  const attackerInitialUnits = attackers.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const defenderInitialUnits = defenders.map(u => ({ key: u.key, name: u.name, count: u.initial, tier: u.tier }));
  const byKey = (side) => Object.fromEntries(side.map(u => [u.key, u]));
  const aByKey = byKey(attackers), dByKey = byKey(defenders);
  const rounds = [];
  let stopped = false;

  for (let round = 1; round <= lastRound; round++) {
    const wallUp = shield && shield.hp > 0;
    if (attackers.every(u => u.count <= 0) || (defenders.every(u => u.count <= 0) && !wallUp)) break;
    applyWallDefense();
    const snapA = attackers.map(u => ({ ...u }));
    const snapD = defenders.map(u => ({ ...u }));
    const wallHpBefore = shield ? shield.hp : 0;
    // le round, ou sa part `share` : les deux camps frappent en même temps, depuis l'état d'avant le round
    const play = (share) => {
      attackers.forEach((u, i) => { u.count = snapA[i].count; u.carry = snapA[i].carry; });
      defenders.forEach((u, i) => { u.count = snapD[i].count; u.carry = snapD[i].carry; });
      let wallDamage = 0, strikers = snapA;
      if (wallUp) {
        shield.hp = wallHpBefore;
        // the blows fall on the wall first; what is left of the round once it is down reaches the soldiers
        // talents : Ingénieur de siège (attaquant), Gardien des murs (héros qui défend la ville) ; engins du Sultanat +25 %
        // (faction de l'engin) ; « défense chez soi » (Gaule) : le mur encaisse 1/1,2 des coups
        const wallTalent = Math.max(0, 1 + HE.talent(attackerHero, 'wallDamagePct') / 100 - HE.talent(defenderHero, 'wallGuardPct') / 100) / fb(defenderFaction, 'cityDefense');
        const dmg = share * wallTalent * snapA.reduce((t, a) => t + Math.max(0, a.count) * config.combat.roundDamageFactor * a.atk * (a.unitClass === 'SIEGE' ? W.engineMult * fb(a.faction, 'siegeEngineAttack') : W.soldierMult), 0);
        wallDamage = Math.min(dmg, shield.hp);
        const rest = dmg > shield.hp && dmg > 0 ? 1 - shield.hp / dmg : 0;
        shield.hp = Math.max(0, shield.hp - dmg);
        strikers = snapA.map(a => ({ ...a, count: a.count * rest }));
      }
      return { wallDamage, strikers, killsOnDefenders: strike(strikers, defenders, share), killsOnAttackers: strike(snapD, attackers, share) };
    };
    let share = 1;
    let played = play(share);
    const overStop = () => lostShare(attackers) >= stopAt || lostShare(defenders) >= stopAt;
    if (stopAt && overStop()) {
      // raid : le combat s'arrête au moment du round où un camp atteint stopAt de pertes (dichotomie sur la part du round)
      let lo = 0, hi = 1;
      for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; play(mid); if (overStop()) hi = mid; else lo = mid; }
      share = hi; played = play(share); stopped = true;
    }
    const { wallDamage, strikers, killsOnDefenders, killsOnAttackers } = played;
    if (wallUp && shield.hp <= 0) lastRound = Math.max(lastRound, round + (config.combat.siege.roundsAfterBreach || 0));
    rounds.push({
      ...(shield ? { wallHp: Math.round(shield.hp), wallDamage: Math.round(wallDamage) } : {}),
      round,
      attackerDamage: Math.floor(totalDamage(strikers, snapD) * share + wallDamage),
      defenderDamage: Math.floor(totalDamage(snapD, snapA) * share),
      attackerKills: Object.entries(killsOnDefenders).filter(([, n]) => n > 0).map(([key, killed]) => ({ key, name: dByKey[key].name, killed })),
      defenderKills: Object.entries(killsOnAttackers).filter(([, n]) => n > 0).map(([key, killed]) => ({ key, name: aByKey[key].name, killed })),
      attackerRemaining: attackers.reduce((sum, u) => sum + Math.max(0, u.count), 0),
      defenderRemaining: defenders.reduce((sum, u) => sum + Math.max(0, u.count), 0)
    });
    if (stopped) break;
  }

  const finalUnits = (side) => side.map(u => ({ key: u.key, name: u.name, initial: u.initial, remaining: Math.max(0, u.count), killed: u.initial - Math.max(0, u.count) }));
  const attackerFinalUnits = finalUnits(attackers);
  const defenderFinalUnits = finalUnits(defenders);
  const attackerTotalInitial = attackers.reduce((sum, u) => sum + u.initial, 0);
  const defenderTotalInitial = defenders.reduce((sum, u) => sum + u.initial, 0);
  const attackerTotalKilled = attackerFinalUnits.reduce((sum, u) => sum + u.killed, 0);
  const defenderTotalKilled = defenderFinalUnits.reduce((sum, u) => sum + u.killed, 0);
  const attackerLossRate = attackerTotalInitial > 0 ? attackerTotalKilled / attackerTotalInitial : 0;
  const defenderLossRate = defenderTotalInitial > 0 ? defenderTotalKilled / defenderTotalInitial : 0;

  return {
    // behind a standing wall the city holds, whatever the strength of the attacker ; raid arrêté : le camp qui a perdu la
    // plus grande part de ses soldats a perdu
    attackerWon: !(shield && shield.hp > 0) && (stopped ? defenderLossRate > attackerLossRate : remainingPower(attackers) > remainingPower(defenders)),
    stopped,
    wallHpStart, wallHpEnd: shield ? Math.round(shield.hp) : null, wallMaxHp: shield ? shield.maxHp : null,
    attackerLossRate, defenderLossRate,
    attackerTotalKilled, defenderTotalKilled,
    attackerInitialUnits, defenderInitialUnits,
    attackerFinalUnits, defenderFinalUnits,
    rounds, wallBonus
  };
}

module.exports = { resolveCombat, resolveCombatDetailed, battleLines, heroCombatStats, heroBonus };
