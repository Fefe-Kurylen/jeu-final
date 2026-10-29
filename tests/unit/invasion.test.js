// Invasions barbares (décision du 29 octobre 2026) : week-end de Paris (changement d'heure compris), étages, trésor
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../../src/services/hordeService');
const { invasion } = require('../../src/config');

test('week-end d\'invasion : vendredi 18 h → dimanche 23 h, heure de Paris', () => {
  assert.equal(H.weekendWindow(new Date('2026-10-30T16:59:00Z')), null);   // vendredi 17 h 59 (heure d'hiver : UTC+1)
  const w = H.weekendWindow(new Date('2026-10-30T17:00:00Z'));
  assert.equal(w.key, '2026-10-30');
  assert.equal(w.end.toISOString(), '2026-11-01T22:00:00.000Z');   // dimanche 23 h
  assert.equal(H.weekendWindow(new Date('2026-11-01T22:00:00Z')), null);
  assert.equal(H.weekendWindow(new Date('2026-11-04T12:00:00Z')), null);   // mercredi
  // passage à l'heure d'été (dimanche 28 mars 2027) : début à 17 h UTC, fin à 21 h UTC
  const s = H.weekendWindow(new Date('2027-03-28T20:00:00Z'));
  assert.equal(s.start.toISOString(), '2027-03-26T17:00:00.000Z');
  assert.equal(s.end.toISOString(), '2027-03-28T21:00:00.000Z');
  assert.equal(H.nextWindowStart(new Date('2026-10-29T12:00:00Z')).toISOString(), '2026-10-30T17:00:00.000Z');
});

test('donjon : 3 étages de plus en plus forts, niveaux × 2,5', () => {
  const f1 = H.floorsFor(1), f5 = H.floorsFor(5);
  assert.deepEqual(f1.map(f => f.name), invasion.floors);
  assert.ok(f1[0].power < f1[1].power && f1[1].power < f1[2].power);
  assert.ok(Math.abs(f1[0].power - invasion.basePower) / invasion.basePower < 0.05);
  assert.ok(f5[0].power > f1[0].power * 30);
  // chef de la horde : unités d'élite
  assert.ok(Object.keys(f1[2].units).every(k => /VETERAN|ELITE/.test(k)));
});

test('trésor : croît avec le niveau, objet plus probable au centre', () => {
  const t1 = H.treasureFor(1), t5 = H.treasureFor(5);
  assert.equal(t1.wood, invasion.treasure.resources);
  assert.ok(t5.wood > t1.wood * 30 && t5.gold > t1.gold && t5.alliancePoints > t1.alliancePoints);
  assert.ok(t5.itemChance > t1.itemChance);
});
