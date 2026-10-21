require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // the processor module loads Prisma, never queried here
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const { assaultTime, wallDamagePerHour } = require('../../src/game/processors/siegeProcessor');
const { unitsData } = require('../../src/config/gamedata');

const H = 3600000, start = new Date('2026-10-01T12:00:00Z');
const engines = (faction, n) => ({ units: [{ unitKey: unitsData.find(u => u.class === 'SIEGE' && u.faction === faction).key, count: n }], owner: { faction } });

test('100 engines breach a level-20 wall in 30 min, the minimum of engines a wall of its tier in 2 h 30', () => {
  const wall20 = 20 * config.combat.wallHpPerLevel;
  assert.equal(assaultTime(start, wall20, wallDamagePerHour(engines('ROME', 100)), start) - start, 0.5 * H);
  assert.equal(assaultTime(start, wall20, wallDamagePerHour(engines('ROME', 20)), start) - start, 2.5 * H);
  assert.equal(assaultTime(start, 10 * config.combat.wallHpPerLevel, wallDamagePerHour(engines('ROME', 10)), start) - start, 2.5 * H);
});

test('the assault is never given before 30 min nor after 3 h (3 h 45 against an Egyptian wall)', () => {
  assert.equal(assaultTime(start, 1000, wallDamagePerHour(engines('ROME', 200)), start) - start, 0.5 * H);
  assert.equal(assaultTime(start, 20000, wallDamagePerHour(engines('ROME', 5)), start, 'HUN') - start, 3 * H);
  assert.equal(assaultTime(start, 25000, wallDamagePerHour(engines('ROME', 5)), start, 'EGYPT') - start, 3.75 * H);
  assert.equal(assaultTime(start, 0, 0, start) - start, 0.5 * H);   // no wall: after the minimum siege time
});
