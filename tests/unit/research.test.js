require('./_env');
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../src/utils/techEffects');
const { resolveCombat, resolveCombatDetailed } = require('../../src/services/combatService');
const { calculateTravelTime } = require('../../src/utils/calculations');
const { unitsData } = require('../../src/config/gamedata');

const unit = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);
const KNOWN = ['productionBonusPct', 'buildCostReductionPct', 'trainTimeReductionPct', 'attackBonusPct', 'defenseBonusPct', 'woundedBonusPct', 'armySpeedBonusPct', 'upkeepReductionPct'];

test('technology data: four branches, unique keys, known effects, existing prerequisites, small bonuses', () => {
  assert.equal(T.BRANCHES.length, 4);
  assert.ok(T.TECHS.length >= 8);
  const keys = new Set();
  for (const t of T.TECHS) {
    assert.ok(!keys.has(t.key), `duplicate ${t.key}`); keys.add(t.key);
    assert.ok(T.BRANCHES.some(b => b.key === t.branch), `${t.key} branch`);
    assert.ok(Object.keys(t.effects).length >= 1, `${t.key} has an effect`);
    for (const [k, v] of Object.entries(t.effects)) {
      assert.ok(KNOWN.includes(k), `${t.key} effect ${k} is applied somewhere`);
      assert.ok(v > 0 && v * T.maxLevelOf(t) <= 10, `${t.key} ${k} stays a small bonus at max level`);
    }
    for (const p of t.prereq || []) assert.ok(T.techOf(p.key) && p.level >= 1, `${t.key} prerequisite ${p.key}`);
    assert.ok(T.RESOURCES.every(r => (t.costL1[r] || 0) >= 0) && T.RESOURCES.some(r => t.costL1[r] > 0), `${t.key} cost`);
    assert.ok(t.timeL1Sec >= 60, `${t.key} time`);
  }
});

test('research cost and time grow with the level; Academy and Greek Temple shorten the time up to the cap', () => {
  const t = T.techOf('AGRONOMY');
  const config = require('../../src/config');
  // la recherche suit la courbe de base des bâtiments (×1,28 en coût, ×1,2 en temps), pas celle des champs et du Bâtiment
  // principal (×1,45 en coût, ×1,30 en temps : décision du 30 octobre 2026, recommandations 3 et 4 du rapport économie)
  assert.equal(T.RULES.costGrowth, config.build.costMultiplierBase, 'research costs follow the base construction curve');
  assert.equal(T.RULES.timeGrowth, config.build.timeMultiplierBase, 'research times follow the base construction curve');
  assert.ok(config.build.fieldCostMultiplier > T.RULES.costGrowth && config.build.slowTimeMultiplier > T.RULES.timeGrowth, 'the slow field curves do not apply to research');
  const { buildCostFor, buildSecondsFor } = require('../../src/utils/calculations');
  const academy = require('../../src/config/gamedata').buildingsData.find(b => b.key === 'ACADEMY');
  assert.equal(buildSecondsFor(academy, 10), Math.floor(academy.timeL1Sec * Math.pow(T.RULES.timeGrowth, 9)), 'the Academy itself keeps the base curve');
  assert.equal(buildCostFor(academy, 10).wood, Math.floor(academy.costL1.wood * Math.pow(T.RULES.costGrowth, 9)));
  let prevCost = 0, prevTime = 0;
  for (let L = 1; L <= T.maxLevelOf(t); L++) {
    const c = T.researchCost(t, L), total = T.RESOURCES.reduce((s, r) => s + c[r], 0);
    assert.ok(total > prevCost, `cost L${L}`); prevCost = total;
    const time = T.researchTimeSec(t, L, []);
    assert.ok(time > prevTime, `time L${L}`); prevTime = time;
  }
  assert.deepEqual(T.researchCost(t, 1), t.costL1);
  assert.equal(T.researchTimeSec(t, 1, []), t.timeL1Sec);
  const reduced = T.researchTimeSec(t, 5, [{ key: 'ACADEMY', level: 10 }]);
  assert.equal(reduced, Math.floor(T.researchTimeSec(t, 5, []) * 0.9));
  assert.equal(T.researchTimeReductionPct([{ key: 'ACADEMY', level: 20 }, { key: 'GREEK_TEMPLE', level: 20 }, { key: 'MAIN_HALL', level: 20 }]), 40);
  assert.equal(T.researchTimeReductionPct([{ key: 'ACADEMY', level: 99 }]), T.RULES.timeReductionMaxPct);
});

test('techPct sums level × effect over rows or a map, caps at the max level and ignores unknown keys', () => {
  assert.equal(T.techPct([], 'attackBonusPct'), 0);
  assert.equal(T.techPct([{ techKey: 'TACTICS', level: 4 }], 'attackBonusPct'), 1);
  assert.equal(T.techPct({ TACTICS: 99 }, 'attackBonusPct'), 5);
  assert.equal(T.techPct({ AGRONOMY: 3, NOPE: 7 }, 'productionBonusPct'), 1.5);
  assert.equal(T.techBonusMult({ DISCIPLINE: 20 }, 'defenseBonusPct'), 1.05);
  assert.equal(T.techReductionMult({ ENGINEERING: 20 }, 'buildCostReductionPct'), 0.9);
  assert.deepEqual(T.sqlKeys('upkeepReductionPct'), [['SUPPLY', 0.5]]);
});

test('researchBlocker: Academy required, technology never above the Academy, prerequisites, queue, max level', () => {
  const agro = T.techOf('AGRONOMY'), eng = T.techOf('ENGINEERING');
  assert.match(T.researchBlocker(agro, {}, [], []), /Académie requise/);
  assert.equal(T.researchBlocker(agro, {}, [{ key: 'ACADEMY', level: 1 }], []), null);
  assert.match(T.researchBlocker(agro, { AGRONOMY: 1 }, [{ key: 'ACADEMY', level: 1 }], []), /niveau 2 requise/);
  assert.match(T.researchBlocker(agro, {}, [{ key: 'ACADEMY', level: 1 }], [{ techKey: 'AGRONOMY', status: 'RUNNING' }]), /niveau 2 requise/);
  assert.match(T.researchBlocker(eng, { AGRONOMY: 4 }, [{ key: 'ACADEMY', level: 5 }], []), /Agronomie niveau 5/);
  assert.equal(T.researchBlocker(eng, { AGRONOMY: 5 }, [{ key: 'ACADEMY', level: 5 }], []), null);
  assert.match(T.researchBlocker(agro, {}, [{ key: 'ACADEMY', level: 5 }], [{ techKey: 'TRAINING', status: 'RUNNING' }, { techKey: 'DISCIPLINE', status: 'QUEUED' }]), /pleine/);
  assert.match(T.researchBlocker(agro, { AGRONOMY: 20 }, [{ key: 'ACADEMY', level: 20 }], []), /maximum/);
  assert.equal(T.nextLevelFor(agro, { AGRONOMY: 2 }, [{ techKey: 'AGRONOMY', status: 'RUNNING' }, { techKey: 'TRAINING', status: 'QUEUED' }]), 4);
});

test('technologies nudge the combat a little in the right direction, never by much', () => {
  const inf = unit('ROME', 'INFANTRY', 'base'), arc = unit('ROME', 'ARCHER', 'base');
  const side = () => [{ unitKey: inf.key, tier: 'base', count: 200 }, { unitKey: arc.key, tier: 'base', count: 200 }];
  const plain = resolveCombatDetailed(side(), side(), 10, 0, 'A', 'D', null, null, null, null, 0);
  const atkTech = resolveCombatDetailed(side(), side(), 10, 0, 'A', 'D', null, null, null, null, 0, { attacker: { atk: 1.05, def: 1.05 } });
  const defTech = resolveCombatDetailed(side(), side(), 10, 0, 'A', 'D', null, null, null, null, 0, { defender: { def: 1.05 } });
  assert.ok(atkTech.attackerLossRate < plain.attackerLossRate && atkTech.defenderLossRate > plain.defenderLossRate, 'maxed attack/defence research helps the attacker');
  assert.ok(defTech.attackerLossRate > plain.attackerLossRate, 'maxed Discipline helps the defender');
  assert.ok(Math.abs(atkTech.attackerLossRate - plain.attackerLossRate) < 0.15, 'a +5 % research does not turn a battle around');
  const raid = resolveCombat(side(), side(), 0, null, null, {});
  const raidTech = resolveCombat(side(), side(), 0, null, null, { attackerBonusPct: 5, defenderBonusPct: 5 });
  assert.equal(Math.round(raidTech.attackerPower / raid.attackerPower * 1000), 1050);
  assert.equal(Math.round(raidTech.defenderPower / raid.defenderPower * 1000), 1050);
});

test('Cartography: an extra speed bonus shortens a march', () => {
  const base = calculateTravelTime(0, 0, 100, 0, 50, null, null, 100);
  const quick = calculateTravelTime(0, 0, 100, 0, 50, null, null, 100, 10);
  assert.equal(base, 3000);
  assert.equal(quick, Math.ceil(3000 / 1.1));
});
