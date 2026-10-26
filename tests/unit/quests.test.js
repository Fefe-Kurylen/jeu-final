// Quêtes (décision du 26 octobre 2026) : catalogue cohérent, jours et semaines à l'heure de Paris, tirage stable,
// récompenses à l'échelle (ressources seules)
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../../src/services/questService');
const { buildingsData } = require('../../src/config/gamedata');

const RES = ['wood', 'stone', 'iron', 'food'];
const GOALS = new Set(['field', 'anyField', 'building', 'counterTotal', 'army', 'reportWin', 'population', 'techLevels', 'heroLevel', 'cities', 'alliance']);
const COUNTERS = new Set(['build_done', 'units_recruited', 'research_done', 'expedition_done', 'expedition_sent', 'harvested', 'trade_sent', 'help_given']);

test('catalogue : clés uniques, objectifs connus, bâtiments existants, récompenses en ressources seules', () => {
  const c = q.catalog;
  const keys = [...c.tutorial.map(s => s.key), ...c.tasks.map(t => t.key), ...c.daily.pool.map(x => x.key), ...c.weekly.pool.map(x => x.key), ...c.achievements.list.map(a => a.key)];
  assert.equal(new Set(keys).size, keys.length, 'clés uniques');
  for (const s of [...c.tutorial, ...c.tasks]) {
    assert.ok(GOALS.has(s.goal.type), `${s.key} : objectif ${s.goal.type}`);
    if (s.goal.building) assert.ok(buildingsData.some(b => b.key === s.goal.building), `${s.key} : bâtiment ${s.goal.building}`);
    if (s.goal.counter) assert.ok(COUNTERS.has(s.goal.counter), `${s.key} : compteur ${s.goal.counter}`);
    assert.ok(s.go && (s.go.field || s.go.building || s.go.tab), `${s.key} : « Aller »`);
  }
  for (const s of c.tutorial) assert.deepEqual(Object.keys(s.reward).sort(), [...RES].sort(), `${s.key} : ressources seules`);
  for (const t of c.tasks) assert.deepEqual([...t.levels].sort((a, b) => a - b), t.levels, `${t.key} : paliers croissants`);
  for (const x of [...c.daily.pool, ...c.weekly.pool]) assert.ok(x.counter ? COUNTERS.has(x.counter) : ['WIN', 'TRIBE'].includes(x.reports), x.key);
});

test('tutoriel : chaque récompense tient dans l\'entrepôt de départ (1 000)', () => {
  for (const s of q.catalog.tutorial) for (const r of RES) assert.ok(s.reward[r] <= 500, `${s.key} ${r}`);
});

test('tâches : la récompense d\'un palier de bâtiment suit son coût (moitié, ou un champ entier)', () => {
  const main = q.catalog.tasks.find(t => t.key === 'b_MAIN_HALL');
  const r5 = q.taskReward(main, 5), c5 = q.buildCost('MAIN_HALL', 5);
  for (const k of RES) assert.ok(Math.abs(r5[k] - Math.max(50, c5[k] * 0.5)) <= 10, k);
  const wood = q.catalog.tasks.find(t => t.key === 'fields_LUMBER');
  assert.ok(q.taskReward(wood, 10).wood > q.taskReward(wood, 2).wood, 'plus haut palier, plus grosse récompense');
});

test('quêtes du jour : à l\'échelle de la production, avec un plancher', () => {
  assert.deepEqual(q.scaled({ wood: 0, stone: 0, iron: 0, food: 0 }, 0.5, 150), { wood: 150, stone: 150, iron: 150, food: 150 });
  assert.deepEqual(q.scaled({ wood: 2000, stone: 1000, iron: 800, food: 600 }, 0.5, 150), { wood: 1000, stone: 500, iron: 400, food: 300 });
});

test('tirage du jour : le même pour un joueur et un jour, différent d\'un jour à l\'autre', () => {
  const pool = q.catalog.daily.pool;
  const a = q.pickFor(pool, 4, 'p1:2026-10-26').map(x => x.key), b = q.pickFor(pool, 4, 'p1:2026-10-26').map(x => x.key);
  assert.deepEqual(a, b);
  const days = new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'].map(d => q.pickFor(pool, 4, `p1:${d}`).map(x => x.key).join()));
  assert.ok(days.size > 1, 'le tirage change selon le jour');
  assert.equal(new Set(a).size, 4);
});

test('jour et semaine à l\'heure de Paris', () => {
  assert.equal(q.dayKey(new Date('2026-10-26T22:30:00Z')), '2026-10-26');   // 23 h 30 à Paris (UTC+1)
  assert.equal(q.dayKey(new Date('2026-10-26T23:30:00Z')), '2026-10-27');   // 0 h 30 à Paris
  assert.equal(q.dayStart(new Date('2026-10-27T10:00:00Z')).toISOString(), '2026-10-26T23:00:00.000Z');
  const w = q.weekInfo(new Date('2026-10-29T12:00:00Z'));   // jeudi
  assert.equal(w.key, '2026-10-26');
  assert.deepEqual(w.days, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']);
  assert.equal(q.dayKey(new Date('2026-07-01T22:30:00Z')), '2026-07-02');   // été (UTC+2) : 0 h 30 à Paris
});
