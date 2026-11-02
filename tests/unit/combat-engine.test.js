// Tous les combats au moteur de bataille (décision du 2 novembre 2026, deuxième simulation de 200 jours, G3) : combats en
// terrain ouvert (points tenus, camps de siège, rencontres) et camps de tribus, pertes de chaque type données par les rounds
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const { fieldBattle, resolveTribeCombat } = require('../../src/services/armyService');

// transaction factice : toute lecture rend vide, toute écriture est notée
function fakeTx() {
  const writes = [];
  const model = (name) => ({
    findMany: async () => [], findUnique: async () => null, findFirst: async () => null,
    create: async ({ data }) => { writes.push([name, 'create', data]); return { id: `${name}-${writes.length}`, ...data }; },
    update: async (q) => { writes.push([name, 'update', q]); return {}; },
    updateMany: async (q) => { writes.push([name, 'updateMany', q]); return { count: 1 }; },
    deleteMany: async (q) => { writes.push([name, 'deleteMany', q]); return { count: 1 }; },
    upsert: async (q) => { writes.push([name, 'upsert', q]); return {}; }
  });
  return new Proxy({ writes }, { get: (t, k) => (k in t ? t[k] : k.startsWith('$') ? async () => 0 : (t[k] = model(k))) });
}
const army = (id, ownerId, units, faction = 'ROME') => ({ id, ownerId, name: id, cityId: null, heroId: null, hero: null, owner: { id: ownerId, name: ownerId, faction, technologies: [] }, units: units.map(([unitKey, tier, count], i) => ({ id: `${id}-${i}`, unitKey, tier, count })) });

test('terrain ouvert (G3) : le moteur joue ses rounds, les morts de chaque type se partagent entre les armées qui tiennent le point', async () => {
  const tx = fakeTx();
  const attacker = army('att', 'p1', [['GAU_CAV_GAULOIS', 'intermediate', 400]], 'GAUL');
  const holders = [army('h1', 'p2', [['ROM_INF_MILICIEN', 'base', 90]]), army('h2', 'p3', [['ROM_INF_MILICIEN', 'base', 30]])];
  const { combat, reportIds, defenderLosses } = await fieldBattle(tx, attacker, holders, 'p1', { x: 1, y: 2, where: 'Point (1, 2)', type: 'NODE_FIGHT', rounds: { type: 'NODE_FIGHT' } });
  assert.equal(combat.attackerWon, true);
  assert.equal(combat.stopped, false, 'pas d\'arrêt à 30 % hors raid');
  assert.equal(defenderLosses, combat.defenderTotalKilled, 'les pertes écrites sont celles du moteur');
  // 90 et 30 miliciens : les morts se partagent 3 pour 1, au total exact
  const lost = (id) => tx.writes.filter(([m, op, q]) => m === 'armyUnit' && q.where.id.startsWith(id)).reduce((t, [, op, q]) => t + (op === 'deleteMany' ? (id === 'h1' ? 90 : 30) : q.data.count.decrement), 0);
  assert.equal(lost('h1') + lost('h2'), combat.defenderTotalKilled);
  assert.ok(Math.abs(lost('h1') - 3 * lost('h2')) <= 3);
  // un rapport par joueur, pertes par type, rounds pour le replay
  const reports = tx.writes.filter(([m, op]) => m === 'battleReport' && op === 'create').map(w => w[2]);
  assert.equal(reports.length, 3);
  assert.deepEqual(Object.keys(reportIds).sort(), ['p1', 'p2', 'p3']);
  assert.equal(reports[0].loot.rounds.length, combat.rounds.length);
  assert.equal(reports[0].defenderLosses.units[0].killed, combat.defenderTotalKilled);
});

test('camp de tribu (G3) : repoussé, le camp garde les survivants que le moteur lui laisse ; vaincu, il est battu', async () => {
  const camp = { HUN_INF_NOMADE: 300 };
  const node = (id) => ({ id, x: 0, y: 0, resourceType: 'WOOD', hasDefenders: true, defenderUnits: { ...camp }, defenderPower: 1 });
  const weakTx = fakeTx();
  const weak = await resolveTribeCombat(army('w', 'p1', [['ROM_INF_MILICIEN', 'base', 60]]), node('n1'), 'p1', weakTx);
  assert.equal(weak.success, false);
  const upd = weakTx.writes.find(([m, op]) => m === 'resourceNode' && op === 'update')[2].data;
  assert.ok(upd.defenderUnits.HUN_INF_NOMADE > 0 && upd.defenderUnits.HUN_INF_NOMADE < 300, JSON.stringify(upd));
  assert.equal(weak.combatResult.defenderLosses, 300 - upd.defenderUnits.HUN_INF_NOMADE);
  const report = weakTx.writes.find(([m, op]) => m === 'battleReport' && op === 'create')[2];
  assert.equal(report.attackerUnits[0].count, 60, 'le rapport garde l\'armée d\'avant le combat');
  assert.ok(report.loot.rounds.length > 0);
  // une armée bien plus grosse écrase le camp (rounds complets, pas d'arrêt à 30 %)
  const strongTx = fakeTx();
  const strong = await resolveTribeCombat(army('s', 'p1', [['ROM_INF_LEGIONNAIRE', 'elite', 600]]), node('n2'), 'p1', strongTx);
  assert.equal(strong.success, true);
  assert.equal(strong.combatResult.defenderLosses, 300);
  const beaten = strongTx.writes.find(([m, op]) => m === 'resourceNode' && op === 'update')[2].data;
  assert.equal(beaten.hasDefenders, false);
});

test('camp de tribu (G3) : une armée anéantie au moteur perd son héros, comme dans les autres combats', async () => {
  const tx = fakeTx();
  tx.armyUnit.aggregate = async () => ({ _sum: { count: 0 } });   // plus aucun soldat après le combat
  tx.hero.findUnique = async ({ where }) => ({ id: where.id, name: 'Aulus', playerId: 'p1', diedAt: null });
  const prisma = require('../../src/config/database');
  const saved = prisma.notification;
  prisma.notification = { create: async () => ({ id: 'n' }) };
  try {
    const lone = { ...army('h', 'p1', [['ROM_INF_MILICIEN', 'base', 10]]), heroId: 'hero1', hero: { id: 'hero1', name: 'Aulus' } };
    const r = await resolveTribeCombat(lone, { id: 'n3', x: 0, y: 0, resourceType: 'WOOD', hasDefenders: true, defenderUnits: { HUN_INF_VETERAN: 400 }, defenderPower: 1 }, 'p1', tx);
    assert.equal(r.success, false);
    assert.equal(r.combatResult.attackerLosses, 10, 'anéantie : plus de plafond de 30 %');
    const fell = tx.writes.find(([m, op, q]) => m === 'hero' && op === 'update' && q.data.diedAt);
    assert.ok(fell, 'le héros tombe');
  } finally { prisma.notification = saved; }
});
