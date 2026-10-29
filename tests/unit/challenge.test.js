// Défi d'alliance de la semaine (décision du 29 octobre 2026) : thème tiré de la semaine, jamais deux fois de suite
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/services/challengeService');

test('thème : le même pour tous (tiré de la date du lundi), jamais celui de la semaine d\'avant', () => {
  let d = new Date('2026-10-26T12:00:00Z');
  let prev = null;
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const key = d.toISOString().slice(0, 10);
    const t = C.themeFor(key);
    assert.ok(C.ORDER.includes(t));
    assert.equal(C.themeFor(key), t);
    if (prev) assert.notEqual(t, prev, key);
    seen.add(t); prev = t;
    d = new Date(d.getTime() + 7 * 86400000);
  }
  assert.ok(seen.size >= 5, [...seen].join(' '));   // les thèmes tournent
});
test('bornes d\'une semaine de Paris, récompenses des 3 premières', () => {
  const b = C.boundsOf('2026-10-26');
  assert.equal(b.start.toISOString(), '2026-10-25T23:00:00.000Z');   // lundi 0 h à Paris (heure d'hiver)
  assert.equal(b.end - b.start, 7 * 86400000);
  assert.deepEqual(C.REWARD_POINTS, [300, 200, 100]);
});
