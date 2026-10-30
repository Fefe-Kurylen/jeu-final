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

// ---- base factice : le client Prisma est remplacé le temps d'un test (aucune requête réelle) ----
const prisma = require('../../src/config/database');
function stub(models) {
  const saved = Object.fromEntries(Object.keys(models).map(k => [k, prisma[k]]));
  Object.assign(prisma, models);
  return () => Object.assign(prisma, saved);
}

test('destruction : un contributeur dont le compte est supprimé n\'empêche pas le partage du trésor', async () => {
  const players = new Set(['a', 'b', 'c']);   // « x » a supprimé son compte, « c » le supprime pendant le partage
  const paid = [], credited = [];
  const tx = {
    horde: { update: async () => ({}) },
    resourceNode: { delete: async () => ({}) },
    invasion: { update: async () => ({}) },
    hordeDamage: { findMany: async () => [{ playerId: 'a', points: 300 }, { playerId: 'x', points: 600 }, { playerId: 'b', points: 100 }, { playerId: 'c', points: 100 }] },
    player: {
      findMany: async ({ where }) => where.id.in.filter(id => players.has(id)).map(id => ({ id })),
      updateMany: async ({ where, data }) => { if (where.id === 'c') return { count: 0 }; paid.push({ id: where.id, gold: data.gold.increment }); return { count: 1 }; }
    },
    city: { findFirst: async ({ where }) => ({ id: `cap-${where.playerId}` }) },
    $executeRaw: async (sql, ...v) => { credited.push(v[v.length - 1]); return 1; },
    hero: { findUnique: async () => null },
    heroItem: { create: async () => ({}) }
  };
  const t = await H.destroyHorde(tx, { id: 'h1', invasionId: 'i1', level: 2 }, { id: 'n1', x: 3, y: 4 }, 'a', null);
  // le trésor se partage entre les joueurs encore là, selon leurs dégâts
  assert.deepEqual(paid.map(p => p.id), ['a', 'b']);
  assert.deepEqual(t.shares.map(s => s.playerId), ['a', 'b']);
  assert.ok(Math.abs(t.shares[0].share - 0.6) < 1e-9 && Math.abs(t.shares[1].share - 0.2) < 1e-9);   // 300 et 100 sur 500
  assert.equal(paid[0].gold, Math.floor(H.treasureFor(2).gold * t.shares[0].share));
  assert.deepEqual(credited, ['cap-a', 'cap-b']);   // ressources dans la capitale des seuls joueurs payés
});

test('fiche d\'un donjon : reparti = introuvable, détruit = résultats gardés', async () => {
  const horde = (o) => ({ nodeId: 'n1', invasionId: 'i1', x: 1, y: 2, level: 1, floor: 2, destroyedAt: null, floors: H.floorsFor(1), damage: [{ playerId: 'a', allianceId: 'al', points: 50, attacks: 1 }], ...o });
  const view = async (h, node, inv) => {
    const restore = stub({
      horde: { findUnique: async () => h },
      resourceNode: { findUnique: async () => node },
      invasion: { findUnique: async () => inv },
      allianceMember: { findUnique: async () => null },
      player: { findMany: async () => [{ id: 'a', name: 'Aulus', alliance: null }] }
    });
    try { return await H.hordeView('n1', 'a'); } finally { restore(); }
  };
  const node = { id: 'n1', defenderPower: 1234, defenderUnits: { HUN_INF_GARDE: 3 } };
  const live = await view(horde(), node, { endsAt: new Date(), endedAt: null });
  assert.equal(live.destroyed, false);
  assert.equal(live.floors[1].left, 1234);
  // l'invasion est finie : le point a été retiré, ou pas encore (fin en cours)
  assert.equal(await view(horde(), null, { endsAt: new Date(), endedAt: new Date() }), null);
  assert.equal(await view(horde(), node, { endsAt: new Date(), endedAt: new Date() }), null);
  // détruit : le point n'existe plus, la fiche reste lisible
  const dead = await view(horde({ destroyedAt: new Date(), floor: 3 }), null, { endsAt: new Date(), endedAt: new Date() });
  assert.equal(dead.destroyed, true);
  assert.ok(dead.floors.every(f => f.done));
  assert.equal(dead.contributors[0].share, 1);
});
