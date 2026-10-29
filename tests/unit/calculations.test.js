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

test('carry capacity sums units; the hero adds only its transport talents (logistics lowers upkeep, GDD)', () => {
  const inf = unitsData.find(u => u.class === 'INFANTRY' && u.tier === 'base');
  const per = inf.stats.carry || inf.stats.transport || 50;
  assert.equal(calc.getArmyCarryCapacity([{ unitKey: inf.key, count: 10 }], unitsData), per * 10);
  assert.equal(calc.getArmyCarryCapacity([{ unitKey: inf.key, count: 10 }], unitsData, { logistics: 5, logPoints: 500 }), per * 10);
  assert.equal(calc.getArmyCarryCapacity([{ unitKey: inf.key, count: 100 }], unitsData, { talents: { i_quartermaster: 2 } }), Math.floor(per * 100 * 1.06));
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

test('city tiers follow the Main Hall level', () => {
  assert.equal(calc.getCityTier(0), 1);
  assert.equal(calc.getCityTier(10), 2);
  assert.equal(calc.getCityTier(15), 2);
  assert.equal(calc.getCityTier(20), 3);
  assert.equal(calc.getMinSiegeEngines(3), 20);
});

test('secondary cities (GDD): settlers by Residence level, foundation time, colony production bonus, building restrictions', () => {
  const fx = require('../../src/utils/buildingEffects');
  assert.equal(fx.settlerSlots(0), 0);
  assert.equal(fx.settlerSlots(9), 0);
  assert.equal(fx.settlerSlots(10), 1);
  assert.equal(fx.settlerSlots(15), 2);
  assert.equal(fx.settlerSlots(20), 3);
  assert.equal(fx.settlerTrainTimeSec(), 10800);
  assert.equal(fx.cityFoundationTimeSec(), 86400);
  assert.equal(fx.secondaryCityBonusPct(), 20);
  assert.ok(fx.capitalOnly('RESIDENCE') && fx.capitalOnly('EMBASSY') && !fx.capitalOnly('MARKET'));
  assert.ok(fx.notInCapital('GREAT_BARRACKS') && !fx.notInCapital('BARRACKS'));
  assert.deepEqual(config.city.foundationTransport, { wood: 3000, stone: 3000, iron: 3000, food: 3000 });
});

test('city tier follows the Main Hall level (Village 1-9, Ville 10-19, Ville Fortifiée 20+), colony cap and capital-only recruitment buildings', () => {
  const { getCityTier, getCityTierName, getMinSiegeEngines, mainHallLevelOf } = require('../../src/utils/calculations');
  assert.deepEqual([0, 1, 9, 10, 19, 20, 30].map(getCityTier), [1, 1, 1, 2, 2, 3, 3]);
  assert.equal(getCityTierName(getCityTier(10)), 'Ville');
  assert.deepEqual([1, 2, 3].map(getMinSiegeEngines), [1, 10, 20]);
  assert.equal(mainHallLevelOf([{ key: 'WALL', level: 15 }, { key: 'MAIN_HALL', level: 7 }]), 7);
  assert.equal(mainHallLevelOf([]), 1);
  assert.equal(config.city.secondaryMainHallMaxLevel, 20);
  const fx = require('../../src/utils/buildingEffects');
  assert.ok(fx.capitalOnly('BARRACKS') && fx.capitalOnly('STABLE') && fx.capitalOnly('WORKSHOP') && fx.notInCapital('GREAT_BARRACKS'));
});
