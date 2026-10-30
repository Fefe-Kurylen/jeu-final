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
    $queryRaw: async (sql, playerId) => [{ id: `cap-${playerId}`, isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e9, maxFoodStorage: 1e9 }],
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

// ---- âge du monde (décision du 30 octobre 2026) ----
test('âge du monde : × 1 jusqu\'à la semaine 3, +0,35 par semaine ensuite, plafond × 6', () => {
  assert.equal(H.ageMultFor(1), 1);
  assert.equal(H.ageMultFor(21), 1);   // semaine 3
  assert.ok(Math.abs(H.ageMultFor(22) - 1.35) < 1e-9);   // semaine 4
  assert.ok(Math.abs(H.ageMultFor(28) - 1.35) < 1e-9);
  assert.ok(Math.abs(H.ageMultFor(29) - 1.7) < 1e-9);   // semaine 5
  assert.equal(H.ageMultFor(7 * 17 + 1), invasion.ageMax);   // semaine 18 : 6,25 plafonné
  assert.equal(H.ageMultFor(400), invasion.ageMax);
  assert.equal(H.ageMultFor(undefined), 1);
  // par niveau : rien au niveau 1, tout au niveau 5
  assert.equal(H.levelAgeMult(1, 6), 1);
  assert.ok(Math.abs(H.levelAgeMult(5, 6) - 6) < 1e-9);
  assert.ok(Math.abs(H.levelAgeMult(3, 4) - 2) < 1e-9);
  assert.equal(H.levelAgeMult(4, undefined), 1);
});

test('âge du monde : étages plus forts et trésor plus riche en ressources, ni or ni points d\'alliance', () => {
  const sum = (fs) => fs.reduce((t, f) => t + f.power, 0);
  assert.equal(sum(H.floorsFor(1, 6)), sum(H.floorsFor(1)));   // niveau 1 inchangé
  const ratio = sum(H.floorsFor(5, 2)) / sum(H.floorsFor(5));
  assert.ok(Math.abs(ratio - 2) < 0.02, String(ratio));
  assert.ok(Math.abs(H.floorPower(5, 1, 2) - H.floorPower(5, 1) * 2) <= 1);
  const t = H.treasureFor(5), old = H.treasureFor(5, 2);
  assert.equal(old.wood, Math.round(invasion.treasure.resources * Math.pow(invasion.treasure.resourceFactor, 4) * 2));
  assert.equal(old.food, old.wood);
  assert.equal(old.gold, t.gold);
  assert.equal(old.alliancePoints, t.alliancePoints);
  assert.deepEqual(H.treasureFor(1, 6), H.treasureFor(1));
});

test('âge du monde : fixé au lancement de l\'invasion et noté sur sa ligne ; le trésor le relit', async () => {
  const cfg = require('../../src/config');
  const savedCounts = cfg.invasion.counts;
  cfg.invasion.counts = {};   // aucun donjon posé : seul le lancement est vérifié
  const created = [];
  const day = 7 * 4 + 3;   // semaine 5 du monde
  const restore = stub({
    invasion: { findFirst: async () => null, create: async ({ data }) => { created.push(data); return { id: 'i1', ...data }; }, update: async ({ data }) => ({ id: 'i1', ...data }) },
    worldConfig: { findUnique: async () => ({ id: 1, readyAt: new Date(Date.now() - (day - 1) * 86400000 - 3600000) }) },
    player: { count: async () => 10 },
    $queryRaw: async () => [],   // aucun joueur mesuré : formule de l'âge du monde
    $executeRaw: async () => 0
  });
  const savedLog = console.log; console.log = () => {};
  try {
    const inv = await H.startInvasion({ key: 'test-age', endsAt: new Date(Date.now() + 3600000) });
    assert.ok(inv);
  } finally { restore(); console.log = savedLog; cfg.invasion.counts = savedCounts; }
  assert.equal(created.length, 1);
  assert.ok(Math.abs(created[0].ageMult - H.ageMultFor(day)) < 1e-9);
  assert.ok(Math.abs(created[0].ageMult - 1.7) < 1e-9);
  assert.equal(created[0].basePower, null);
  // destruction d'un donjon de niveau 5 de cette invasion : ressources × 1,7, or inchangé
  const paid = [];
  const tx = {
    horde: { update: async () => ({}) }, resourceNode: { delete: async () => ({}) },
    invasion: { update: async () => ({ id: 'i1', ageMult: 1.7 }) },
    hordeDamage: { findMany: async () => [{ playerId: 'a', points: 100 }] },
    player: { findMany: async () => [{ id: 'a' }], updateMany: async ({ data }) => { paid.push(data.gold.increment); return { count: 1 }; } },
    $queryRaw: async () => [{ id: 'cap-a', isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e9, maxFoodStorage: 1e9 }], $executeRaw: async () => 1,
    hero: { findUnique: async () => null }, heroItem: { create: async () => ({}) }
  };
  const t = await H.destroyHorde(tx, { id: 'h1', invasionId: 'i1', level: 5 }, { id: 'n1', x: 0, y: 0 }, 'a', null);
  assert.equal(t.shares[0].gain.wood, H.treasureFor(5, 1.7).wood);
  assert.ok(t.shares[0].gain.wood > H.treasureFor(5).wood);
  assert.deepEqual(paid, [H.treasureFor(5).gold]);
});

// ---- force réglée sur les joueurs (décision du 30 octobre 2026, rapport économie, recommandation 9) ----
const { calculateArmyPower } = require('../../src/utils/calculations');
const { unitsData } = require('../../src/config/gamedata');
const P = invasion.powerRef;

test('donjons : avant-poste du niveau 1 = max(minimum, médiane × part), seulement avec assez de joueurs mesurés', () => {
  assert.equal(H.outpostPower([]), null);
  assert.equal(H.outpostPower(Array(P.minPlayers - 1).fill(100000)), null);
  assert.equal(H.outpostPower([0, 0, 0, 0, 0, 100000]), null, 'les joueurs sans puissance ne comptent pas');
  const five = [10000, 50000, 80000, 120000, 900000];   // médiane 80 000
  assert.equal(H.outpostPower(five), Math.round(80000 * P.outpostPctOfMedian / 100));
  assert.equal(H.outpostPower([...five, 100000]), Math.round(90000 * P.outpostPctOfMedian / 100), 'nombre pair : moyenne des deux du milieu');
  assert.equal(H.outpostPower(Array(P.minPlayers).fill(100)), P.minOutpost);
});

test('donjons : étages × 1 / 2 / 4 et × levelFactor par niveau sur la puissance mesurée, sans l\'âge du monde', () => {
  const bp = 40000;
  assert.equal(H.floorPower(1, 1, 6, bp), bp);
  assert.equal(H.floorPower(1, 3, 1, bp), 4 * bp);   // chef du niveau 1 : 2 joueurs médians avec 50 %
  assert.equal(H.floorPower(5, 3, 6, bp), Math.round(4 * bp * Math.pow(P.levelFactor, 4)));
  assert.ok(Math.abs(H.floorPower(5, 3, 1, bp) / (bp * 100 / P.outpostPctOfMedian) - 21) < 0.1, 'chef du niveau 5 ≈ 21 joueurs médians');
  // sans mesure (invasions d'avant, trop peu de joueurs) : la formule de l'âge du monde
  assert.equal(H.floorPower(5, 1, 2), H.floorPower(5, 1, 2, null));
  const f = H.floorsFor(2, 1, bp);
  assert.ok(Math.abs(f[0].power - bp * P.levelFactor) / (bp * P.levelFactor) < 0.05);
});

test('donjons : puissance des joueurs actifs lue en une requête (toutes leurs unités), notée sur l\'invasion', async () => {
  const rows = [];
  for (let i = 1; i <= 6; i++) rows.push({ playerId: `p${i}`, unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 100 * i }, { playerId: `p${i}`, unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 10 });
  let since = null;
  const db = { $queryRaw: async (sql, s) => { since = s; return rows; } };
  const now = new Date('2026-11-06T18:00:00Z');
  const bp = await H.measuredBasePower(now, db);
  assert.equal(since.getTime(), now.getTime() - P.activeDays * 86400000);
  const power = (i) => calculateArmyPower([{ unitKey: 'ROM_INF_MILICIEN', tier: 'base', count: 100 * i }, { unitKey: 'ROM_INF_LEGIONNAIRE', tier: 'elite', count: 10 }], unitsData);
  assert.equal(bp, H.outpostPower([1, 2, 3, 4, 5, 6].map(power)));
  // au lancement : notée sur la ligne Invasion
  const cfg = require('../../src/config');
  const savedCounts = cfg.invasion.counts;
  cfg.invasion.counts = {};
  const created = [];
  const restore = stub({
    invasion: { findFirst: async () => null, create: async ({ data }) => { created.push(data); return { id: 'i2', ...data }; }, update: async ({ data }) => ({ id: 'i2', ...data }) },
    worldConfig: { findUnique: async () => ({ id: 1, readyAt: new Date(Date.now() - 3600000) }) },
    $queryRaw: async () => rows,
    $executeRaw: async () => 0
  });
  const savedLog = console.log; console.log = () => {};
  try { await H.startInvasion({ key: 'test-power', endsAt: new Date(Date.now() + 3600000) }); } finally { restore(); console.log = savedLog; cfg.invasion.counts = savedCounts; }
  assert.equal(created[0].basePower, bp);
});

test('trésor (recommandation 2) : la capitale d\'abord, le surplus dans les autres villes, la notification dit ce qui est perdu', async () => {
  // capitale presque pleine, une colonie avec 1 000 de place en bois ; le niveau 1 donne 8 000 de chaque ressource
  const cities = [
    { id: 'cap', isCapital: true, wood: 9500, stone: 0, iron: 0, food: 0, maxStorage: 10000, maxFoodStorage: 1e9 },
    { id: 'col', isCapital: false, wood: 1000, stone: 0, iron: 0, food: 0, maxStorage: 2000, maxFoodStorage: 1e9 }
  ];
  const credited = {};
  const tx = {
    horde: { update: async () => ({}) }, resourceNode: { delete: async () => ({}) },
    invasion: { update: async () => ({ id: 'i1', ageMult: 1 }) },
    hordeDamage: { findMany: async () => [{ playerId: 'a', points: 100 }] },
    player: { findMany: async () => [{ id: 'a' }], updateMany: async () => ({ count: 1 }) },
    $queryRaw: async () => cities.map(c => ({ ...c })),
    $executeRaw: async (sql, ...v) => { credited[v[v.length - 1]] = v[0]; return 1; },
    hero: { findUnique: async () => null }, heroItem: { create: async () => ({}) }
  };
  const t = await H.destroyHorde(tx, { id: 'h1', invasionId: 'i1', level: 1 }, { id: 'n1', x: 3, y: 4 }, 'a', null);
  const T = H.treasureFor(1);
  assert.deepEqual(credited, { cap: 500, col: 1000 });   // bois : 500 dans la capitale, 1 000 dans la colonie
  assert.equal(t.shares[0].lost.wood, T.wood - 1500);
  assert.equal(t.shares[0].lost.stone, 0);
  const notes = [];
  const restore = stub({ notification: { create: async ({ data }) => { notes.push(data); return { id: 'n' }; } } });
  try { H.announceOutcome(null, { destroyed: true, treasure: t, level: 1, x: 3, y: 4 }); await new Promise(r => setTimeout(r, 10)); } finally { restore(); }
  assert.equal(notes.length, 1);
  assert.match(notes[0].body, new RegExp(`${T.wood.toLocaleString('fr-FR')} de chaque ressource, rangées dans votre capitale puis dans vos autres villes`));
  assert.match(notes[0].body, new RegExp(`plus de place dans vos villes : ${(T.wood - 1500).toLocaleString('fr-FR')} de bois perdus\\.`));
});

test('trésor : les villes d\'un joueur sont verrouillées avant sa ligne (même ordre que les dépenses), joueurs pris par id', async () => {
  const calls = [];
  const tx = {
    horde: { update: async () => ({}) }, resourceNode: { delete: async () => ({}) },
    invasion: { update: async () => ({ id: 'i1', ageMult: 1 }) },
    hordeDamage: { findMany: async () => [{ playerId: 'b', points: 100 }, { playerId: 'a', points: 100 }] },
    player: { findMany: async () => [{ id: 'a' }, { id: 'b' }], updateMany: async ({ where }) => { calls.push(`pay ${where.id}`); return { count: 1 }; } },
    $queryRaw: async (sql, playerId) => { calls.push(`lock ${playerId}`); return [{ id: `cap-${playerId}`, isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e9, maxFoodStorage: 1e9 }]; },
    $executeRaw: async () => 1,
    hero: { findUnique: async () => null }, heroItem: { create: async () => ({}) }
  };
  await H.destroyHorde(tx, { id: 'h1', invasionId: 'i1', level: 1 }, { id: 'n1', x: 0, y: 0 }, 'a', null);
  assert.deepEqual(calls, ['lock a', 'pay a', 'lock b', 'pay b']);
});
