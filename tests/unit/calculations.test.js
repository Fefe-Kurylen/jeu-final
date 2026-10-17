require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../../src/utils/calculations');
const { unitsData, buildingsData } = require('../../src/config/gamedata');
const config = require('../../src/config');

test('field production grows with the level and matches the data endpoints', () => {
  for (const key of ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM']) {
    let prev = 0;
    for (let lvl = 1; lvl <= 20; lvl++) {
      const p = calc.getProductionAtLevel(key, lvl, buildingsData);
      assert.ok(p >= prev, `${key} L${lvl} ${p} >= ${prev}`);
      prev = p;
    }
    const def = buildingsData.find(b => b.key === key);
    const prodKey = { FARM: 'foodProd', LUMBER: 'woodProd', QUARRY: 'stoneProd', IRON_MINE: 'ironProd' }[key];
    assert.equal(calc.getProductionAtLevel(key, 1, buildingsData), def.effects[prodKey + 'L1']);
    assert.equal(calc.getProductionAtLevel(key, 20, buildingsData), def.effects[prodKey + 'L20']);
  }
  assert.equal(calc.getProductionAtLevel('LUMBER', 0, buildingsData), 0);
});

test('storage curve: level 0 gives nothing, level 20 gives the data cap, in between is monotonic', () => {
  assert.equal(calc.getStorageAtLevel('WAREHOUSE', 0, buildingsData), 0);
  const def = buildingsData.find(b => b.key === 'WAREHOUSE');
  assert.equal(calc.getStorageAtLevel('WAREHOUSE', 20, buildingsData), def.effects.storageL20);
  let prev = 0;
  for (let l = 1; l <= 20; l++) { const s = calc.getStorageAtLevel('WAREHOUSE', l, buildingsData); assert.ok(s > prev); prev = s; }
});

test('travel time: never below one second, slower units take longer, hero speed helps up to 5%', () => {
  const inf = unitsData.find(u => u.class === 'INFANTRY' && u.tier === 'base');
  const cav = unitsData.find(u => u.class === 'CAVALRY' && u.tier === 'base');
  assert.equal(calc.calculateTravelTime(0, 0, 0, 0, 50), 1);
  const tInf = calc.getArmyTravelTime([{ unitKey: inf.key, count: 10 }], 0, 0, 30, 0, null);
  const tMixed = calc.getArmyTravelTime([{ unitKey: inf.key, count: 10 }, { unitKey: cav.key, count: 10 }], 0, 0, 30, 0, null);
  assert.equal(tMixed, tInf, 'the slowest unit sets the pace');
  const tHero = calc.getArmyTravelTime([{ unitKey: inf.key, count: 10 }], 0, 0, 30, 0, null, { speed: 5, spdPoints: 100 });
  assert.ok(tHero < tInf);
  assert.ok(tHero >= Math.ceil(tInf / (1 + config.combat.heroBonusMax)) - 1);
});

test('carry capacity sums units and the hero logistics bonus is capped', () => {
  const inf = unitsData.find(u => u.class === 'INFANTRY' && u.tier === 'base');
  const per = inf.stats.carry || inf.stats.transport || 50;
  assert.equal(calc.getArmyCarryCapacity([{ unitKey: inf.key, count: 10 }], unitsData), per * 10);
  assert.equal(calc.getArmyCarryCapacity([{ unitKey: inf.key, count: 10 }], unitsData, { logistics: 5, logPoints: 500 }), Math.floor(per * 10 * (1 + config.combat.heroBonusMax)));
  assert.equal(calc.getArmyCarryCapacity([], unitsData), 0);
});

test('army power is linear in the unit count and higher for elite tiers', () => {
  const base = unitsData.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'base');
  const elite = unitsData.find(u => u.faction === 'ROME' && u.class === 'INFANTRY' && u.tier === 'elite');
  const p1 = calc.calculateArmyPower([{ unitKey: base.key, tier: 'base', count: 1 }], unitsData);
  const p10 = calc.calculateArmyPower([{ unitKey: base.key, tier: 'base', count: 10 }], unitsData);
  assert.ok(Math.abs(p10 - 10 * p1) < 1e-6);
  assert.ok(calc.calculateArmyPower([{ unitKey: elite.key, tier: 'elite', count: 1 }], unitsData) > p1);
  assert.equal(calc.calculateArmyPower([{ unitKey: 'UNKNOWN', count: 5 }], unitsData), 0);
});

test('city tiers follow the wall level', () => {
  assert.equal(calc.getCityTier(0), 1);
  assert.equal(calc.getCityTier(10), 2);
  assert.equal(calc.getCityTier(15), 3);
  assert.equal(calc.getMinSiegeEngines(3), 20);
});
