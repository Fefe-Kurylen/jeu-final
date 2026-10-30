require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCombat, resolveCombatDetailed, heroBonus } = require('../../src/services/combatService');
const { unitsData, factionsData } = require('../../src/config/gamedata');
const config = require('../../src/config');

const unit = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);
const group = (u, count) => ({ unitKey: u.key, tier: u.tier, count });
const romeInf = unit('ROME', 'INFANTRY', 'base'), romeCav = unit('ROME', 'CAVALRY', 'base'), hunInf = unit('HUN', 'INFANTRY', 'base'), romeSiege = unit('ROME', 'SIEGE', 'siege');

test('units exist for every faction, class and tier used by the engine', () => {
  for (const f of config.validFactions) for (const c of ['INFANTRY', 'ARCHER', 'CAVALRY']) for (const t of ['base', 'intermediate', 'elite']) assert.ok(unit(f, c, t), `${f} ${c} ${t}`);
  assert.ok(romeSiege);
});

test('detailed combat never produces negative or inflated unit counts', () => {
  const r = resolveCombatDetailed([group(romeInf, 120), group(romeCav, 30), group(romeSiege, 4)], [group(hunInf, 90)], 5, 2, 'A', 'B');
  for (const side of [r.attackerFinalUnits, r.defenderFinalUnits]) {
    for (const u of side) {
      assert.ok(u.remaining >= 0, 'remaining >= 0');
      assert.ok(u.remaining <= u.initial, 'remaining <= initial');
      assert.equal(u.killed, u.initial - u.remaining);
    }
  }
  assert.ok(r.rounds.length >= 1 && r.rounds.length <= config.combat.maxRounds);
  assert.ok(r.attackerLossRate >= 0 && r.attackerLossRate <= 1);
  assert.ok(r.defenderLossRate >= 0 && r.defenderLossRate <= 1);
});

test('an overwhelming force wins and a lone defender is wiped out', () => {
  const r = resolveCombatDetailed([group(romeInf, 2000)], [group(hunInf, 10)], 0, 0, 'A', 'B');
  assert.equal(r.attackerWon, true);
  assert.equal(r.defenderFinalUnits[0].remaining, 0);
  assert.ok(r.attackerLossRate < 0.05, 'the winner barely loses anything');
});

test('a wall makes the defenders survive better', () => {
  const noWall = resolveCombatDetailed([group(romeInf, 300)], [group(hunInf, 300)], 0, 0, 'A', 'B');
  const wall = resolveCombatDetailed([group(romeInf, 300)], [group(hunInf, 300)], 20, 0, 'A', 'B');
  assert.ok(wall.defenderTotalKilled <= noWall.defenderTotalKilled);
  assert.ok(wall.attackerTotalKilled >= noWall.attackerTotalKilled);
});

test('empty sides are handled without exceptions', () => {
  const r = resolveCombatDetailed([group(romeInf, 50)], [], 0, 0, 'A', 'B');
  assert.equal(r.attackerWon, true);
  assert.equal(r.defenderLossRate, 0);
  const r2 = resolveCombat([], [group(hunInf, 50)]);
  assert.equal(r2.attackerWon, false);
});

test('raid resolution: the loser never loses more than the GDD rate, the winner less than the loser', () => {
  const r = resolveCombat([group(romeInf, 100)], [group(hunInf, 40)], 0);
  assert.equal(r.attackerWon, true);
  assert.equal(r.defenderLossRate, config.combat.loserLossRate);
  assert.ok(r.attackerLossRate < r.defenderLossRate);
  assert.ok(r.attackerLossRate >= 0);
});

test('raid resolution: Rome\'s +10 % unit defence counts on the defence share only, when attacking as when defending', () => {
  const atk = [group(romeInf, 100)], dfd = [group(hunInf, 100)];
  const share = (1 + 0.1 * romeInf.stats.defense / (romeInf.stats.attack + romeInf.stats.defense));
  const plain = resolveCombat(atk, dfd, 0, null, null, {});
  const rome = resolveCombat(atk, dfd, 0, null, null, { attackerFaction: 'ROME' });
  assert.ok(Math.abs(rome.attackerPower / plain.attackerPower - share) < 1e-9);
  const romeDef = resolveCombat(dfd, atk, 0, null, null, { defenderFaction: 'ROME', fieldBattle: true });
  const plainDef = resolveCombat(dfd, atk, 0, null, null, { fieldBattle: true });
  assert.ok(Math.abs(romeDef.defenderPower / plainDef.defenderPower - share) < 1e-9);
});

test('battle engine (GDD, option B): a hit deals ATK × coef × triangle, the defence is part of the target\'s solidity', () => {
  const C = config.combat.battleTierCoefficients;
  assert.deepEqual(C, { base: 1, intermediate: 1.35, elite: 1.9, siege: 0.75 });
  assert.deepEqual(config.combat.tierCoefficients, { base: 1, intermediate: 1.25, elite: 1.55, siege: 0.75 });   // puissance : inchangés
  assert.equal(config.combat.minDamageRatio, undefined);
  const legion = unit('ROME', 'INFANTRY', 'elite'), romeArc = unit('ROME', 'ARCHER', 'base');
  // morts du 1er round sur une cible très nombreuse : n × 0,18 × ATK × coef × triangle / (END + 0,55 × DEF × coef)
  const firstKills = (a, n, t) => resolveCombatDetailed([group(a, n)], [group(t, 100000)], 0, 0, 'A', 'B').rounds[0].attackerKills[0]?.killed || 0;
  const solid = (u) => u.stats.endurance + config.combat.defenseDamageMult * u.stats.defense * C[u.tier];
  const expected = (a, n, t, tri = 1) => Math.floor(n * config.combat.roundDamageFactor * a.stats.attack * C[a.tier] * tri / solid(t));
  // un milicien blesse un légionnaire à proportion de son attaque (ni soustraction de la défense, ni plancher)
  assert.equal(firstKills(romeInf, 1000, legion), expected(romeInf, 1000, legion));
  assert.ok(firstKills(romeInf, 1000, legion) > 0);
  assert.equal(firstKills(legion, 1000, romeInf), expected(legion, 1000, romeInf));
  // triangle +50 % : la cavalerie sur les archers ; pas de bonus de la cavalerie sur l'infanterie
  for (const k of ['INFANTRY_vs_CAVALRY', 'CAVALRY_vs_ARCHER', 'ARCHER_vs_INFANTRY']) assert.equal(config.combat.triangle[k], 1.5);
  assert.equal(firstKills(romeCav, 1000, romeArc), expected(romeCav, 1000, romeArc, 1.5));
  assert.equal(firstKills(romeCav, 1000, romeInf), expected(romeCav, 1000, romeInf, 1));
});

test('battle engine: wall and moat raise the defenders\' solidity, not the blows they take', () => {
  const legion = unit('ROME', 'INFANTRY', 'elite'), C = config.combat.battleTierCoefficients;
  const kills = (wall, moat) => resolveCombatDetailed([group(romeInf, 1000)], [group(legion, 100000)], wall, moat, 'A', 'B').rounds[0].attackerKills[0].killed;
  const m = (1 + 20 * config.combat.wallBonusPerLevel) + (1 + 10 * config.combat.moatBonusPerLevel) - 1;   // mur + douves, chacun une fois
  const solid = legion.stats.endurance + config.combat.defenseDamageMult * legion.stats.defense * C.elite * m;
  assert.equal(kills(20, 10), Math.floor(1000 * config.combat.roundDamageFactor * romeInf.stats.attack / solid));
  assert.ok(kills(20, 10) < kills(0, 0));
});

test('battle engine: Rome\'s loss reduction multiplies the whole solidity (endurance and defence)', () => {
  const legion = unit('ROME', 'INFANTRY', 'elite'), C = config.combat.battleTierCoefficients;
  const bonus = (type) => 1 + (factionsData.ROME.bonuses.find(b => b.type === type)?.value || 0) / 100;
  const kills = resolveCombatDetailed([group(hunInf, 1000)], [group(legion, 100000)], 0, 0, 'A', 'B', null, null, null, 'ROME').rounds[0].attackerKills[0].killed;
  // solidité = (END + 0,55 × DEF × coef × « +10 % défense ») × « réduction des pertes »
  const solid = (legion.stats.endurance + config.combat.defenseDamageMult * legion.stats.defense * C.elite * bonus('unitDefense')) * bonus('siegeLossReduction');
  assert.ok(bonus('siegeLossReduction') > 1);
  assert.equal(kills, Math.floor(1000 * config.combat.roundDamageFactor * hunInf.stats.attack / solid));
});

test('battle engine: at equal cost each tier is worth about its price (no tier crushes the one below)', () => {
  const cost = (u) => Object.values(u.recruitCost).reduce((a, b) => a + b, 0);
  const mixed = (f, t) => ['INFANTRY', 'ARCHER', 'CAVALRY'].map(c => { const u = unit(f, c, t); return group(u, Math.round(80000 / cost(u))); });
  const lostValue = (fin) => fin.reduce((s, u) => s + u.killed * cost(unitsData.find(x => x.key === u.key)), 0);
  // indice d'échange (ressources détruites / perdues), moyenne géométrique des deux rôles
  const exchange = (A, B) => {
    const r1 = resolveCombatDetailed(A, B, 0, 0, 'A', 'B'), r2 = resolveCombatDetailed(B, A, 0, 0, 'B', 'A');
    return Math.sqrt(((lostValue(r1.defenderFinalUnits) + 1) / (lostValue(r1.attackerFinalUnits) + 1)) * ((lostValue(r2.attackerFinalUnits) + 1) / (lostValue(r2.defenderFinalUnits) + 1)));
  };
  for (const f of ['ROME', 'GAUL', 'GREEK']) {
    for (const [hi, lo] of [['intermediate', 'base'], ['elite', 'intermediate'], ['elite', 'base']]) {
      const x = exchange(mixed(f, hi), mixed(f, lo));
      assert.ok(x > 0.6 && x < 1.6, `${f} ${hi}/${lo}: ${x.toFixed(2)}`);
    }
  }
});

test('hero combat bonus is capped at +5%', () => {
  assert.equal(heroBonus(null, 'attack'), 1);
  assert.equal(heroBonus({ attack: 4 }, 'attack'), 1 + 4 * config.combat.heroBonusPerPoint);
  assert.equal(heroBonus({ attack: 999 }, 'attack'), 1 + config.combat.heroBonusMax);
});
