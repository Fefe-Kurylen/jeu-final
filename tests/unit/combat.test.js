require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCombat, resolveCombatDetailed, heroBonus } = require('../../src/services/combatService');
const { unitsData } = require('../../src/config/gamedata');
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

test('hero combat bonus is capped at +5%', () => {
  assert.equal(heroBonus(null, 'attack'), 1);
  assert.equal(heroBonus({ attack: 4 }, 'attack'), 1 + 4 * config.combat.heroBonusPerPoint);
  assert.equal(heroBonus({ attack: 999 }, 'attack'), 1 + config.combat.heroBonusMax);
});
