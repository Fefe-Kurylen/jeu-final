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
  const r = resolveCombatDetailed([group(romeInf, 120), group(romeCav, 30), group(romeSiege, 4)], [group(hunInf, 90)], 5, 'A', 'B');
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
  const r = resolveCombatDetailed([group(romeInf, 2000)], [group(hunInf, 10)], 0, 'A', 'B');
  assert.equal(r.attackerWon, true);
  assert.equal(r.defenderFinalUnits[0].remaining, 0);
  assert.ok(r.attackerLossRate < 0.05, 'the winner barely loses anything');
});

test('a wall makes the defenders survive better', () => {
  const noWall = resolveCombatDetailed([group(romeInf, 300)], [group(hunInf, 300)], 0, 'A', 'B');
  const wall = resolveCombatDetailed([group(romeInf, 300)], [group(hunInf, 300)], 20, 'A', 'B');
  assert.ok(wall.defenderTotalKilled <= noWall.defenderTotalKilled);
  assert.ok(wall.attackerTotalKilled >= noWall.attackerTotalKilled);
});

test('empty sides are handled without exceptions', () => {
  const r = resolveCombatDetailed([group(romeInf, 50)], [], 0, 'A', 'B');
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
  const firstKills = (a, n, t) => resolveCombatDetailed([group(a, n)], [group(t, 100000)], 0, 'A', 'B').rounds[0].attackerKills[0]?.killed || 0;
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

test('battle engine: the wall raises the defenders\' solidity, not the blows they take (no more moat)', () => {
  const legion = unit('ROME', 'INFANTRY', 'elite'), C = config.combat.battleTierCoefficients;
  const kills = (wall) => resolveCombatDetailed([group(romeInf, 1000)], [group(legion, 100000)], wall, 'A', 'B').rounds[0].attackerKills[0].killed;
  const solid = legion.stats.endurance + config.combat.defenseDamageMult * legion.stats.defense * C.elite * (1 + 20 * config.combat.wallBonusPerLevel);
  assert.equal(kills(20), Math.floor(1000 * config.combat.roundDamageFactor * romeInf.stats.attack / solid));
  assert.ok(kills(20) < kills(0));
});

// ---- ciblage (décision du 30 octobre 2026, rapport économie, recommandation 10 : coups répartis) ----
test('battle engine: each round\'s blows are spread over every tier by total solidity, siege engines last', () => {
  const legion = unit('ROME', 'INFANTRY', 'elite'), C = config.combat.battleTierCoefficients, F = config.combat.roundDamageFactor;
  const solid = (u) => u.stats.endurance + config.combat.defenseDamageMult * u.stats.defense * C[u.tier];
  const r = resolveCombatDetailed([group(hunInf, 1000)], [group(romeInf, 10000), group(legion, 10000), group(romeSiege, 50)], 0, 'A', 'B');
  const kills = Object.fromEntries(r.rounds[0].attackerKills.map(k => [k.key, k.killed]));
  // part de chaque ligne = sa solidité totale : chaque ligne perd la même part de ses soldats (infanterie contre infanterie)
  const pool = 10000 * solid(romeInf) + 10000 * solid(legion);
  const expected = Math.floor(1000 * F * 10000 * hunInf.stats.attack / pool);
  assert.ok(expected > 0);
  assert.equal(kills[romeInf.key], expected);
  assert.equal(kills[legion.key], expected, 'les élites ne sont plus visées en premier');
  assert.equal(kills[romeSiege.key], undefined, 'les engins restent derrière les soldats');
  // plus de soldats : les engins prennent les coups
  const alone = resolveCombatDetailed([group(hunInf, 1000)], [group(romeSiege, 50)], 0, 'A', 'B');
  assert.ok(alone.rounds[0].attackerKills.some(k => k.key === romeSiege.key && k.killed > 0));
  // le triangle reste par classe : la cavalerie frappe plus fort les archers que l'infanterie de même solidité totale
  const romeArc = unit('ROME', 'ARCHER', 'base');
  const mixed = resolveCombatDetailed([group(romeCav, 1000)], [group(romeInf, 10000), group(romeArc, Math.round(10000 * solid(romeInf) / solid(romeArc)))], 0, 'A', 'B');
  const k2 = Object.fromEntries(mixed.rounds[0].attackerKills.map(k => [k.key, k.killed * solid(unitsData.find(u => u.key === k.key))]));
  assert.ok(Math.abs(k2[romeArc.key] / k2[romeInf.key] - config.combat.triangle.CAVALRY_vs_ARCHER) < 0.01);
});

test('battle engine: a line wiped out by its share passes the rest of the blows to the lines still standing', () => {
  // la cavalerie frappe les archers × triangle : une petite ligne d'archers tombe avant la grosse ligne d'infanterie
  const romeArc = unit('ROME', 'ARCHER', 'base'), F = config.combat.roundDamageFactor, tri = config.combat.triangle.CAVALRY_vs_ARCHER;
  const solid = (u) => u.stats.endurance + config.combat.defenseDamageMult * u.stats.defense;   // palier de base : coefficient 1
  const a = 100, b = 10000, atk = romeCav.stats.attack, pool = a * solid(romeArc) + b * solid(romeInf);
  const n = Math.round(1.2 * pool / (F * atk * tri));   // assez pour anéantir sa part d'archers, pas l'infanterie
  const r = resolveCombatDetailed([group(romeCav, n)], [group(romeArc, a), group(romeInf, b)], 0, 'A', 'B');
  const kills = Object.fromEntries(r.rounds[0].attackerKills.map(k => [k.key, k.killed]));
  assert.equal(kills[romeArc.key], a);
  // l'infanterie reçoit sa part et le reste des coups non utilisés sur les archers
  const usedOnArchers = a * solid(romeArc) / (atk * tri);
  assert.equal(kills[romeInf.key], Math.floor((n * F - usedOnArchers) * atk / solid(romeInf)));
  assert.ok(kills[romeInf.key] < b);
});

test('battle engine: at equal food, an army mixing elites into its base beats a pure base army in every civilisation', () => {
  const UP = config.army.upkeepPerTier, budget = 9600;
  const army = (f, shares) => ['INFANTRY', 'ARCHER', 'CAVALRY'].flatMap(c => Object.entries(shares).map(([t, s]) => group(unit(f, c, t), Math.round(budget * s / 3 / UP[t]))));
  const lost = (fin) => fin.reduce((t, u) => t + u.killed * UP[unitsData.find(x => x.key === u.key).tier], 0) + 1;
  for (const f of config.validFactions) {
    const mix = army(f, { base: 0.75, elite: 0.25 }), base = army(f, { base: 1 });
    const r1 = resolveCombatDetailed(mix, base, 0, 'A', 'B'), r2 = resolveCombatDetailed(base, mix, 0, 'B', 'A');
    const x = Math.sqrt(lost(r1.defenderFinalUnits) / lost(r1.attackerFinalUnits) * lost(r2.attackerFinalUnits) / lost(r2.defenderFinalUnits));
    assert.ok(x > 1.1, `${f} : ${x.toFixed(2)}`);
  }
});

test('battle engine: Rome\'s loss reduction multiplies the whole solidity (endurance and defence)', () => {
  const legion = unit('ROME', 'INFANTRY', 'elite'), C = config.combat.battleTierCoefficients;
  const bonus = (type) => 1 + (factionsData.ROME.bonuses.find(b => b.type === type)?.value || 0) / 100;
  const kills = resolveCombatDetailed([group(hunInf, 1000)], [group(legion, 100000)], 0, 'A', 'B', null, null, null, 'ROME').rounds[0].attackerKills[0].killed;
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
    const r1 = resolveCombatDetailed(A, B, 0, 'A', 'B'), r2 = resolveCombatDetailed(B, A, 0, 'B', 'A');
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
