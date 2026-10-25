require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // the processor module loads Prisma, never queried here
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const { resolveCombatDetailed } = require('../../src/services/combatService');
const { campEnd, wallHpNow } = require('../../src/game/processors/siegeProcessor');
const { unitsData } = require('../../src/config/gamedata');

const unit = (faction, cls, tier) => unitsData.find(u => u.faction === faction && u.class === cls && u.tier === tier);
const g = (u, n) => ({ unitKey: u.key, tier: u.tier, count: n });
const inf = unit('ROME', 'INFANTRY', 'intermediate'), eng = unit('ROME', 'SIEGE', 'siege');
const def = [g(unit('GAUL', 'INFANTRY', 'intermediate'), 600), g(unit('GAUL', 'ARCHER', 'intermediate'), 300)];
const wall = (level, share = 1) => ({ hp: level * config.combat.wallHpPerLevel * share, maxHp: level * config.combat.wallHpPerLevel });
const fight = (atk, level, share = 1, defenders = def) => resolveCombatDetailed(atk, defenders, level, 0, 'A', 'D', null, null, 'ROME', 'GAUL', 0, null, wall(level, share));
const breachRound = (r) => r.rounds.findIndex(x => x.wallHp === 0) + 1;

test('the camp lasts one hour before the battle', () => {
  const start = new Date('2026-10-25T12:00:00Z');
  assert.equal(campEnd(start) - start, config.combat.siege.campMinutes * 60000);
  assert.equal(config.combat.siege.campMinutes, 60);
});

test('behind a standing wall the defenders take nothing and the city holds', () => {
  const r = fight([g(inf, 1000), g(eng, 1)], 20);
  assert.equal(breachRound(r), 0);
  assert.equal(r.defenderTotalKilled, 0);
  assert.equal(r.attackerWon, false);
  assert.ok(r.wallHpEnd > 0);
});

test('siege engines bring the wall down far faster than soldiers', () => {
  const few = breachRound(fight([g(inf, 1000), g(eng, 1)], 10));
  const many = breachRound(fight([g(inf, 1000), g(eng, 100)], 10));
  assert.ok(many > 0 && (few === 0 || many < few), `${few} -> ${many}`);
  // per unit, an engine strikes the wall about ten times harder than a soldier
  const W = config.combat.siege.wallShield;
  assert.ok(W.engineMult / W.soldierMult >= 10);
});

test('a wall that lost lives has lost the same share of its hit points and falls sooner', () => {
  const full = breachRound(fight([g(inf, 1000), g(eng, 100)], 20, 1));
  const half = breachRound(fight([g(inf, 1000), g(eng, 100)], 20, 0.5));
  assert.ok(half > 0 && (full === 0 || half < full), `${full} -> ${half}`);
  assert.equal(wallHpNow({ buildings: [{ key: 'WALL', level: 20 }], wallMaxHp: 20000, wallStructure: 0.75 }), 15000);
  assert.equal(wallHpNow({ buildings: [], wallMaxHp: 20000, wallStructure: 1 }), 0);   // no Wall building: no shield
});

test('an empty city still has to be breached; a strong army takes it', () => {
  const blocked = fight([g(inf, 50), g(eng, 1)], 20, 1, []);
  assert.equal(blocked.attackerWon, false);
  const strong = fight([g(inf, 3000), g(eng, 50)], 20);
  assert.equal(strong.attackerWon, true);
  assert.equal(strong.wallHpEnd, 0);
});
