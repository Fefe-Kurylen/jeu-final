// Trésor d'invasion et stock commun (décision du 2 novembre 2026, deuxième simulation de 200 jours, G12) : la part de
// ressources va au stock commun du joueur (creditPlayer : la capitale d'abord, puis ses autres villes selon leur place) ; ce
// qui ne tient dans aucune ville devient des points d'alliance, 1 pour 1 000 ressources perdues, au plus 2 fois ceux de la
// part ; la notification le dit. Aucune requête réelle.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../../src/services/hordeService');
const { invasion } = require('../../src/config');

test('trésor sans place (G12) : 1 point d\'alliance par 1 000 ressources perdues, au plus 2 fois ceux de la part', () => {
  assert.deepEqual(invasion.treasureOverflow, { resourcesPerAlliancePoint: 1000, maxShareMult: 2 });
  const lost = { wood: 5000, stone: 5000, iron: 4999, food: 0 };   // 14 999 perdus
  assert.equal(H.overflowAlliancePoints(lost, 12), 14);
  assert.equal(H.overflowAlliancePoints(lost, 5), 10, 'au plus 2 × 5');
  assert.equal(H.overflowAlliancePoints(lost, 0), 0, 'une part sans points d\'alliance n\'en donne pas');
  assert.equal(H.overflowAlliancePoints({ wood: 999 }, 30), 0, 'moins de 1 000 : rien');
  assert.equal(H.overflowAlliancePoints({ wood: 0, stone: 0, iron: 0, food: 0 }, 30), 0);
  assert.equal(H.overflowAlliancePoints(undefined, 30), 0);
});

test('trésor sans place (G12) : la notification dit ce qui n\'a tenu nulle part et ce qu\'il a donné', () => {
  const lost = { wood: 5000, stone: 5000, iron: 4999, food: 0 };
  const nbsp = (n) => n.toLocaleString('fr-FR');
  assert.equal(H.treasureLostNote(lost, 14), ` ; plus de place dans vos villes : ${nbsp(5000)} de bois, ${nbsp(5000)} de pierre, ${nbsp(4999)} de fer changés en 14 points d'alliance`);
  assert.equal(H.treasureLostNote(lost, 10), ` ; plus de place dans vos villes : ${nbsp(5000)} de bois, ${nbsp(5000)} de pierre, ${nbsp(4999)} de fer changés en 10 points d'alliance (au plus 2 fois ceux de votre part : le reste est perdu)`);
  assert.match(H.treasureLostNote({ wood: 400 }, 0), /plus de place dans vos villes : 400 de bois perdus$/, 'trop peu pour un point : perdu, et dit');
  assert.equal(H.treasureLostNote({ wood: 0 }, 0), '', 'tout a tenu : rien à dire');
});

test('donjon détruit (G12) : ressources au stock commun ; le surplus sans place devient des points d\'alliance, notés et annoncés', async () => {
  const lvl = 3, T = H.treasureFor(lvl);
  const paid = [], bonus = [], credited = [], notes = [];
  // « a » : capitale presque pleine, colonie pleine ; « b » : de la place partout
  const cities = {
    a: [{ id: 'a-cap', isCapital: true, wood: 9000, stone: 9000, iron: 9000, food: 0, maxStorage: 10000, maxFoodStorage: 1e9 }, { id: 'a-col', isCapital: false, wood: 5000, stone: 5000, iron: 5000, food: 0, maxStorage: 5000, maxFoodStorage: 1e9 }],
    b: [{ id: 'b-cap', isCapital: true, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1e9, maxFoodStorage: 1e9 }]
  };
  const tx = {
    horde: { update: async () => ({}) },
    resourceNode: { delete: async () => ({}) },
    invasion: { update: async () => ({ ageMult: 1 }) },
    hordeDamage: { findMany: async () => [{ playerId: 'a', points: 750 }, { playerId: 'b', points: 250 }] },
    player: {
      findMany: async ({ where }) => where.id.in.map(id => ({ id })),
      updateMany: async ({ where, data }) => { paid.push({ id: where.id, gold: data.gold.increment, ap: data.alliancePoints.increment }); return { count: 1 }; },
      update: async ({ where, data }) => { bonus.push({ id: where.id, ap: data.alliancePoints.increment }); return {}; }
    },
    $queryRaw: async (sql, playerId) => cities[playerId].map(c => ({ ...c })),
    $executeRaw: async (sql, ...v) => { credited.push(v[v.length - 1]); return 1; },
    hero: { findUnique: async () => null },
    heroItem: { create: async () => ({}) }
  };
  const random = Math.random;
  Math.random = () => 0.999;   // pas d'objet au dernier coup
  const prisma = require('../../src/config/database');
  const savedNotification = prisma.notification;
  prisma.notification = { create: async ({ data }) => { notes.push(data); return { id: String(notes.length) }; } };   // fil de notifications
  let t;
  try {
    t = await H.destroyHorde(tx, { id: 'h1', invasionId: 'i1', level: lvl }, { id: 'n1', x: 3, y: 4 }, 'a', null);
    const [sa, sb] = t.shares;
    // a : 75 % du trésor ; il ne reste que 1 000 de bois, pierre et fer dans la capitale, rien dans la colonie
    const gainA = Math.floor(T.wood * 0.75), apA = Math.floor(T.alliancePoints * 0.75);
    assert.deepEqual(sa.lost, { wood: gainA - 1000, stone: gainA - 1000, iron: gainA - 1000, food: 0 });
    assert.equal(sa.overflowAp, Math.min(Math.floor(3 * (gainA - 1000) / 1000), 2 * apA));
    assert.ok(sa.overflowAp > 0);
    assert.deepEqual(bonus, [{ id: 'a', ap: sa.overflowAp }], 'les points du surplus sont crédités à a seul');
    assert.deepEqual(paid.map(p => [p.id, p.ap]), [['a', apA], ['b', Math.floor(T.alliancePoints * 0.25)]], 'les points de la part, comme avant');
    assert.equal(sb.overflowAp, 0, 'b a tout rangé');
    assert.deepEqual(credited, ['a-cap', 'b-cap'], 'la capitale d\'abord (la colonie de a est pleine)');
    H.announceOutcome(null, { destroyed: true, treasure: t, level: lvl, x: 3, y: 4 });
    await new Promise(r => setImmediate(r));
    const note = (id) => notes.find(n => n.playerId === id)?.body || '';
    assert.match(note('a'), new RegExp(`changés en ${sa.overflowAp} points d'alliance`));
    assert.doesNotMatch(note('b'), /plus de place/);
  } finally { Math.random = random; prisma.notification = savedNotification; }
});
