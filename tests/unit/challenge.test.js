// Défi d'alliance de la semaine (décision du 29 octobre 2026) : thème tiré de la semaine, jamais deux fois de suite
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/services/challengeService');
const RK = require('../../src/services/rankingService');
const { weekInfo } = require('../../src/services/questService');

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
test('semaines du changement d\'heure : la fin est le lundi 0 h suivant, sans trou ni chevauchement', () => {
  const recul = C.boundsOf('2027-10-25');   // heure d'hiver le dimanche 31 octobre : 169 h
  assert.equal(recul.start.toISOString(), '2027-10-24T22:00:00.000Z');
  assert.equal(recul.end.toISOString(), '2027-10-31T23:00:00.000Z');
  const avance = C.boundsOf('2027-03-22');   // heure d'été le dimanche 28 mars : 167 h
  assert.equal(avance.end.toISOString(), '2027-03-28T22:00:00.000Z');
  for (const [w, next] of [['2026-10-19', '2026-10-26'], ['2027-03-22', '2027-03-29'], ['2027-10-25', '2027-11-01'], ['2026-12-28', '2027-01-04']]) {
    assert.equal(C.boundsOf(w).end.getTime(), C.boundsOf(next).start.getTime(), w);
  }
});

test('les 7 jours de Paris d\'une semaine (compteurs d\'aides et de dégâts aux donjons)', () => {
  assert.deepEqual(C.daysOf('2026-10-26'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(C.daysOf('2027-12-27').slice(-2), ['2028-01-01', '2028-01-02']);   // changement d'année
  // chaque jour appartient bien à la semaine (même aux changements d'heure)
  for (const w of ['2027-03-22', '2027-10-25']) for (const d of C.daysOf(w)) assert.equal(weekInfo(new Date(`${d}T12:00:00Z`)).key, w, d);
  assert.deepEqual(C.COUNTER, { HELP: 'help_given', DUNGEON: 'horde_points' });
});

// ---- base factice : le client Prisma est remplacé le temps d'un test (aucune requête réelle) ----
const prisma = require('../../src/config/database');
function stub(models) {
  const saved = Object.fromEntries(Object.keys(models).map(k => [k, prisma[k]]));
  Object.assign(prisma, models);
  return () => Object.assign(prisma, saved);
}

test('Entraide et Chasseurs de hordes : compteurs des jours de la semaine, alliance actuelle du joueur', async () => {
  const calls = [];
  const restore = stub({ $queryRawUnsafe: async (sql, ...args) => { calls.push({ sql, args }); return []; } });
  try {
    await C.scores('2027-10-25', 'HELP');
    await C.scores('2027-10-25', 'DUNGEON');
  } finally { restore(); }
  assert.deepEqual(calls[0].args, ['help_given', ...C.daysOf('2027-10-25')]);
  assert.deepEqual(calls[1].args, ['horde_points', ...C.daysOf('2027-10-25')]);
  for (const { sql } of calls) {
    assert.match(sql, /"QuestCounter"/);
    assert.match(sql, /JOIN "AllianceMember" m ON m\."playerId" = c\."playerId"/);   // membres actuels
    assert.doesNotMatch(sql, /AllianceHelp"|HordeDamage|"createdAt"/);   // ni les aides purgées, ni la date du donjon
  }
});

test('carte du défi : fin au lundi 0 h de Paris, même la semaine du changement d\'heure', async () => {
  const restore = stub({ $queryRawUnsafe: async () => [] });
  try {
    const c = await C.current(null, new Date('2027-10-31T21:30:00Z'));   // dimanche 22 h 30 (heure d'hiver)
    assert.equal(c.week, '2027-10-25');
    assert.equal(c.endsAt.toISOString(), '2027-10-31T23:00:00.000Z');
    assert.deepEqual(c.me, { inAlliance: false });
  } finally { restore(); }
});

test('« Bâtisseurs » : population de départ relevée pour tous les joueurs, au tick, même sans combat', async () => {
  const calls = [];
  let restore = stub({
    $executeRawUnsafe: async (sql, ...args) => { calls.push({ sql, args }); return 3; },
    rankingWeek: { findUnique: async () => ({ week: '2026-10-26' }) }   // semaine d'avant déjà close
  });
  try {
    assert.equal(await RK.processRankings(new Date('2026-11-01T23:30:00Z')), null);   // lundi 0 h 30 à Paris
  } finally { restore(); }
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['2026-11-02']);
  assert.match(calls[0].sql, /INSERT INTO "PlayerWeekStats"[^]*FROM "Player" p/);
  assert.match(calls[0].sql, /ON CONFLICT \("playerId", "week"\) DO NOTHING/);   // une ligne déjà là garde sa population de départ
  assert.match(calls[0].sql, /p\.population > 0/);   // nouveau joueur : attendu jusqu'au calcul de sa population
  // un relevé en échec n'empêche pas la clôture de la semaine
  restore = stub({
    $executeRawUnsafe: async () => { throw new Error('base indisponible'); },
    rankingWeek: { findUnique: async () => ({ week: '2026-10-26' }) }
  });
  const savedError = console.error; console.error = () => {};
  try { assert.equal(await RK.processRankings(new Date('2026-11-04T12:00:00Z')), null); } finally { restore(); console.error = savedError; }
});
