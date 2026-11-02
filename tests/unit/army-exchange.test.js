// Échanger des soldats entre deux armées au même endroit (décision du 2 novembre 2026, deuxième simulation de 200 jours,
// G9) : POST /api/army/:id/exchange { toArmyId, units, back }. Deux armées du même joueur à l'arrêt sur la même case (ou
// toutes deux en garnison dans le même Bastion), dans les deux sens, effectifs vérifiés, verrous (villes dans l'ordre des
// id, Bastion, puis les deux armées dans l'ordre des id), le héros reste dans son armée, la garde rattachée à une colonie
// (E2) reçoit et donne, une armée vidée chez elle y reste, vidée ailleurs elle rentre aussitôt.
// Aucune requête réelle : le client Prisma est remplacé le temps de chaque test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../../src/config/database');
const config = require('../../src/config');
const armiesRouter = require('../../src/routes/armies');
const { MARKET_BUSY } = require('../../src/services/marketService');
const { parseExchange, exchangeRefusal } = armiesRouter;

const fakeRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const exchange = armiesRouter.stack.find(l => l.route && l.route.path === '/:id/exchange' && l.route.methods.post).route.stack.at(-1).handle;
const MIL = 'ROM_INF_MILICIEN', LEG = 'ROM_INF_LEGIONNAIRE', EQU = 'ROM_CAV_EQUITES';

// ---- règles pures ----
test('échange : le corps de la requête (armée qui reçoit, lignes d\'unités connues, nombres entiers positifs, un seul sens par unité)', () => {
  assert.deepEqual(parseExchange({ toArmyId: 'b', units: [{ unitKey: MIL, count: 5 }, { unitKey: MIL, count: 3, tier: 'base' }], back: [{ unitKey: LEG, count: 2 }] }, 'a'),
    { toArmyId: 'b', give: [{ unitKey: MIL, tier: 'base', count: 8 }], take: [{ unitKey: LEG, tier: 'elite', count: 2 }] }, 'deux lignes de la même unité s\'additionnent, le palier vient des données');
  assert.equal(parseExchange({ toArmyId: 'b', units: [{ unitKey: MIL, count: 1 }] }, 'a').take.length, 0, 'back est facultatif');
  for (const [body, pattern] of [
    [{ units: [{ unitKey: MIL, count: 1 }] }, /l'armée qui reçoit/],
    [{ toArmyId: 'a', units: [{ unitKey: MIL, count: 1 }] }, /deux armées différentes/],
    [{ toArmyId: 'b' }, /au moins un soldat/],
    [{ toArmyId: 'b', units: 'tout' }, /des listes/],
    [{ toArmyId: 'b', units: [{ unitKey: 'INCONNUE', count: 1 }] }, /Unité inconnue/],
    [{ toArmyId: 'b', units: [{ unitKey: MIL, count: 0 }] }, /entier positif/],
    [{ toArmyId: 'b', units: [{ unitKey: MIL, count: 2.5 }] }, /entier positif/],
    [{ toArmyId: 'b', units: [{ unitKey: MIL, count: -3 }] }, /entier positif/],
    [{ toArmyId: 'b', units: [{ unitKey: MIL, count: 1, tier: 'elite' }] }, /palier base, pas elite/],
    [{ toArmyId: 'b', units: [{ unitKey: MIL, count: config.limits.maxAmount }, { unitKey: MIL, count: 1 }] }, /trop grand/],
    [{ toArmyId: 'b', units: [{ unitKey: MIL, count: 1 }], back: [{ unitKey: MIL, count: 1 }] }, /un sens à la fois/],
    [{ toArmyId: 'b', units: Array.from({ length: 41 }, () => ({ unitKey: MIL, count: 1 })) }, /40 lignes au plus/]
  ]) assert.match(parseExchange(body, 'a').error || '', pattern, JSON.stringify(body));
});

test('échange : deux armées du même joueur à l\'arrêt au même endroit, ou en garnison dans le même Bastion ; jamais la réserve, le marché ni un combat en cours', () => {
  const a = { id: 'a', ownerId: 'p1', name: 'Armée 1', isGarrison: false, status: 'IDLE', claimedAt: null, x: 3, y: 4, targetBastionId: null };
  const b = { ...a, id: 'b', name: 'Garde' };
  assert.equal(exchangeRefusal(a, b), null);
  assert.equal(exchangeRefusal(a, null), 'Armée non trouvée');
  assert.equal(exchangeRefusal(a, { ...b, ownerId: 'p2' }), 'Armée non trouvée', 'l\'armée d\'un autre joueur');
  assert.match(exchangeRefusal(a, { ...a }), /deux armées différentes/);
  assert.match(exchangeRefusal(a, { ...b, isGarrison: true }), /réserve ne sont pas une armée/);
  assert.equal(exchangeRefusal({ ...a, status: 'MARKET' }, b), MARKET_BUSY);
  assert.match(exchangeRefusal(a, { ...b, claimedAt: new Date() }), /Garde est prise dans un combat/);
  assert.match(exchangeRefusal(a, { ...b, status: 'MOVING' }), /à l'arrêt/);
  assert.match(exchangeRefusal(a, { ...b, x: 4 }), /au même endroit/);
  const inside = { ...a, status: 'STATIONED', targetBastionId: 'b1' };
  assert.equal(exchangeRefusal(inside, { ...inside, id: 'b' }), null, 'deux armées de la garnison du même Bastion');
  assert.match(exchangeRefusal(inside, { ...inside, id: 'b', targetBastionId: 'b2' }), /même Bastion/);
  assert.match(exchangeRefusal(inside, b), /même Bastion/, 'une armée à l\'arrêt devant le Bastion et une armée dedans');
  assert.match(exchangeRefusal({ ...a, status: 'STATIONED', targetCityId: 'c9' }, { ...b, status: 'STATIONED', targetCityId: 'c9' }), /à l'arrêt/, 'deux renforts dans la ville d\'un allié');
});

// ---- POST /api/army/:id/exchange : transaction factice (requêtes SQL brutes notées dans l'ordre, armées et lignes d'unités en mémoire) ----
const CITIES = () => ({
  cap: { id: 'cap', name: 'Roma', playerId: 'p1', isCapital: true, x: 0, y: 0 },
  col: { id: 'col', name: 'Ostia', playerId: 'p1', isCapital: false, x: 20, y: 20 }
});
function exchangeDb({ armies, units, cities = CITIES() }) {
  const sql = [], updates = [];
  const rowsOf = (armyId) => units.filter(u => u.armyId === armyId);
  const tx = {
    $queryRaw: async (strings, ...values) => {
      const text = strings.join('?').replace(/\s+/g, ' ').trim();
      sql.push({ text, values });
      if (text.includes('FROM "City" WHERE "playerId"')) return Object.values(cities).filter(c => c.playerId === values[0]).map(c => ({ ...c, wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 10000, maxFoodStorage: 10000 }));
      return [];
    },
    $executeRaw: async () => 1,
    army: {
      findMany: async ({ where }) => armies.filter(a => where.id.in.includes(a.id) && a.ownerId === where.ownerId).map(a => ({ id: a.id, status: a.status, targetBastionId: a.targetBastionId ?? null })),
      findFirst: async ({ where }) => {
        const a = armies.find(x => x.id === where.id && x.ownerId === where.ownerId);
        return a ? { ...a, units: rowsOf(a.id).map(u => ({ ...u })), city: cities[a.cityId] || null } : null;
      },
      findUnique: async ({ where }) => ({ id: where.id, ownerId: 'p1', carryWood: 0, carryStone: 0, carryIron: 0, carryFood: 0, carryGold: 0, settlers: 0, woundedCarry: [] }),
      update: async ({ where, data }) => { updates.push({ id: where.id, data }); Object.assign(armies.find(x => x.id === where.id), data); return {}; }
    },
    armyUnit: {
      updateMany: async ({ where, data }) => {
        const u = units.find(x => x.armyId === where.armyId && x.unitKey === where.unitKey && x.count >= where.count.gte);
        if (!u) return { count: 0 };
        u.count -= data.count.decrement;
        return { count: 1 };
      },
      upsert: async ({ where, update, create }) => {
        const k = where.armyId_unitKey;
        const u = units.find(x => x.armyId === k.armyId && x.unitKey === k.unitKey);
        if (u) u.count += update.count.increment; else units.push({ id: `${k.armyId}-${k.unitKey}`, ...create });
      },
      deleteMany: async ({ where }) => {
        for (let i = units.length - 1; i >= 0; i--) if (units[i].armyId === where.armyId && units[i].unitKey === where.unitKey && units[i].count <= where.count.lte) units.splice(i, 1);
        return { count: 0 };
      },
      findMany: async ({ where }) => units.filter(u => where.armyId.in.includes(u.armyId) && u.count > where.count.gt).map(u => ({ ...u }))
    }
  };
  const saved = { $transaction: prisma.$transaction };
  prisma.$transaction = async (fn) => fn(tx);
  const count = (armyId, key) => rowsOf(armyId).filter(u => !key || u.unitKey === key).reduce((t, u) => t + u.count, 0);
  return { sql, updates, count, army: (id) => armies.find(a => a.id === id), restore: () => Object.assign(prisma, saved) };
}
const call = async (id, body, playerId = 'p1') => {
  const res = fakeRes();
  await exchange({ params: { id }, body, user: { playerId } }, res);
  return res;
};
// l'armée de la capitale posée dans la colonie, et la garde rattachée à la colonie (E2)
const relief = (extra = {}) => ({ id: 'a-relief', ownerId: 'p1', name: 'Relève', cityId: 'cap', isGarrison: false, status: 'IDLE', claimedAt: null, x: 20, y: 20, heroId: null, targetBastionId: null, ...extra });
const guard = (extra = {}) => ({ id: 'a-guard', ownerId: 'p1', name: 'Garde', cityId: 'col', isGarrison: false, status: 'IDLE', claimedAt: null, x: 20, y: 20, heroId: null, targetBastionId: null, ...extra });
const row = (armyId, unitKey, count, tier = 'base') => ({ id: `${armyId}-${unitKey}`, armyId, unitKey, tier, count });

test('échanger (E2) : l\'armée de la capitale posée dans la colonie remplit la garde rattachée, sans emplacement de la capitale ; verrous villes, puis armées dans l\'ordre des id', async () => {
  const db = exchangeDb({ armies: [relief(), guard()], units: [row('a-relief', MIL, 300), row('a-relief', LEG, 50, 'elite'), row('a-guard', MIL, 20)] });
  try {
    const res = await call('a-relief', { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 280 }, { unitKey: LEG, count: 50 }] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual([db.count('a-relief', MIL), db.count('a-relief', LEG), db.count('a-guard', MIL), db.count('a-guard', LEG)], [20, 0, 300, 50]);
    assert.equal(db.updates.length, 0, 'aucune armée ne change de ville ni d\'emplacement');
    assert.match(res.body.message, /^Échange fait : 330 soldats de Relève vers Garde\.$/);
    assert.deepEqual(res.body.to, { id: 'a-guard', name: 'Garde', units: [{ unitKey: MIL, tier: 'base', count: 300 }, { unitKey: LEG, tier: 'elite', count: 50 }] });
    assert.deepEqual(res.body.from.units, [{ unitKey: MIL, tier: 'base', count: 20 }], 'la ligne vidée disparaît');
    // toutes les villes du joueur dans l'ordre des id, puis les deux armées dans l'ordre des id (pas de Bastion ici)
    assert.match(db.sql[0].text, /FROM "City" WHERE "playerId" = \? ORDER BY id FOR UPDATE/);
    assert.deepEqual(db.sql[0].values, ['p1']);
    assert.match(db.sql[1].text, /FROM "Army" WHERE id = ANY\(\?\) ORDER BY id FOR UPDATE/);
    assert.deepEqual(db.sql[1].values[0], ['a-guard', 'a-relief']);
    assert.equal(db.sql.length, 2);
  } finally { db.restore(); }
});

test('échanger : dans les deux sens en une fois ; la garde rattachée donne aussi', async () => {
  const db = exchangeDb({ armies: [relief(), guard()], units: [row('a-relief', MIL, 100), row('a-guard', MIL, 10), row('a-guard', EQU, 40, 'intermediate')] });
  try {
    const res = await call('a-guard', { toArmyId: 'a-relief', units: [{ unitKey: EQU, count: 40 }], back: [{ unitKey: MIL, count: 90 }] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual([db.count('a-guard', MIL), db.count('a-guard', EQU), db.count('a-relief', MIL), db.count('a-relief', EQU)], [100, 0, 10, 40]);
    assert.match(res.body.message, /40 soldats de Garde vers Relève, 90 soldats de Relève vers Garde/);
    assert.deepEqual(res.body.moved, { units: [{ unitKey: EQU, tier: 'intermediate', count: 40 }], back: [{ unitKey: MIL, tier: 'base', count: 90 }] });
  } finally { db.restore(); }
});

test('échanger : effectifs vérifiés (rien ne bouge s\'il en manque), ni armée du marché, ni deux endroits, ni l\'armée d\'un autre joueur', async () => {
  for (const [armies, body, status, pattern] of [
    [[relief(), guard()], { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 301 }] }, 400, /^Relève n'a que 300 Milicien romain \(301 demandés\)$/],
    [[relief(), guard()], { toArmyId: 'a-guard', units: [{ unitKey: LEG, count: 1 }] }, 400, /n'a que 0 Légionnaire romain/],
    [[relief(), guard()], { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 5 }], back: [{ unitKey: LEG, count: 1 }] }, 400, /^Garde n'a que 0/],
    [[relief({ status: 'MARKET' }), guard()], { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 5 }] }, 400, new RegExp(MARKET_BUSY.slice(0, 30))],
    [[relief({ x: 21 }), guard()], { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 5 }] }, 400, /au même endroit/],
    [[relief({ status: 'RETURNING' }), guard()], { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 5 }] }, 400, /à l'arrêt/],
    [[relief(), guard({ ownerId: 'p2' })], { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 5 }] }, 404, /Armée non trouvée/]
  ]) {
    const db = exchangeDb({ armies, units: [row('a-relief', MIL, 300), row('a-guard', MIL, 20)] });
    try {
      const res = await call('a-relief', body);
      assert.equal(res.statusCode, status, JSON.stringify(res.body));
      assert.match(res.body.error, pattern);
      assert.deepEqual([db.count('a-relief'), db.count('a-guard')], [300, 20], 'rien n\'a bougé');
    } finally { db.restore(); }
  }
  // corps invalide : refusé avant toute transaction
  const res = await call('a-relief', { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 0 }] });
  assert.equal(res.statusCode, 400);
});

test('échanger : une armée vidée hors de sa ville rentre aussitôt chez elle ; vidée chez elle, elle y reste et peut s\'y dissoudre', async () => {
  // la relève (armée de la capitale) donne tout à la garde dans la colonie : posée aussitôt à Roma
  let db = exchangeDb({ armies: [relief(), guard()], units: [row('a-relief', MIL, 300), row('a-guard', MIL, 20)] });
  try {
    const res = await call('a-relief', { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 300 }] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const a = db.army('a-relief');
    assert.deepEqual([a.status, a.x, a.y, a.cityId, a.missionType, a.targetBastionId], ['IDLE', 0, 0, 'cap', null, null], 'posée dans la capitale, son emplacement y était déjà');
    assert.match(res.body.message, /Relève n'a plus de soldats : elle est rentrée aussitôt à Roma\./);
    assert.equal(db.count('a-guard'), 320);
  } finally { db.restore(); }
  // la garde donne tout à la relève dans sa propre colonie : elle reste à Ostia (vide, on peut l'y dissoudre)
  db = exchangeDb({ armies: [relief(), guard()], units: [row('a-relief', MIL, 300), row('a-guard', MIL, 20)] });
  try {
    const res = await call('a-guard', { toArmyId: 'a-relief', units: [{ unitKey: MIL, count: 20 }] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual([db.army('a-guard').x, db.army('a-guard').y, db.updates.length], [20, 20, 0]);
    assert.match(res.body.message, /Garde n'a plus de soldats : elle reste à Ostia, où vous pouvez la dissoudre\./);
  } finally { db.restore(); }
});

test('échanger : le héros reste dans son armée, qui n\'est jamais vidée hors de sa ville (elle ne pourrait plus rentrer)', async () => {
  let db = exchangeDb({ armies: [relief({ heroId: 'h1' }), guard()], units: [row('a-relief', MIL, 300), row('a-guard', MIL, 20)] });
  try {
    const res = await call('a-relief', { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 300 }] });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /^Le héros reste avec son armée : laissez au moins un soldat à Relève pour qu'elle puisse rentrer$/);
    assert.deepEqual([db.count('a-relief'), db.count('a-guard'), db.updates.length], [300, 20, 0]);
    // un soldat laissé : permis, le héros ne bouge pas
    const ok = await call('a-relief', { toArmyId: 'a-guard', units: [{ unitKey: MIL, count: 299 }] });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.deepEqual([db.army('a-relief').heroId, db.army('a-guard').heroId, db.count('a-relief')], ['h1', null, 1]);
  } finally { db.restore(); }
  // la garde porte le héros dans sa propre colonie : vidée chez elle, elle garde le héros
  db = exchangeDb({ armies: [relief(), guard({ heroId: 'h1' })], units: [row('a-relief', MIL, 300), row('a-guard', MIL, 20)] });
  try {
    const res = await call('a-guard', { toArmyId: 'a-relief', units: [{ unitKey: MIL, count: 20 }] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(db.army('a-guard').heroId, 'h1');
  } finally { db.restore(); }
});

test('échanger dans la garnison d\'un Bastion : verrou du Bastion entre les villes et les armées ; une armée vidée rentre et libère sa place', async () => {
  const inside = (id, name) => ({ id, ownerId: 'p1', name, cityId: 'cap', isGarrison: false, status: 'STATIONED', missionType: 'BASTION_GARRISON', claimedAt: null, x: 50, y: 50, heroId: null, targetBastionId: 'b1' });
  const db = exchangeDb({ armies: [inside('g1', 'Cohorte'), inside('g2', 'Ost')], units: [row('g1', MIL, 40), row('g2', MIL, 500)] });
  try {
    const res = await call('g1', { toArmyId: 'g2', units: [{ unitKey: MIL, count: 40 }] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepEqual(db.sql.map(q => (q.text.match(/FROM "(\w+)"/) || [])[1]), ['City', 'Bastion', 'Army'], 'villes, Bastion, armées');
    assert.deepEqual(db.sql[1].values, ['b1']);
    const g1 = db.army('g1');
    assert.deepEqual([g1.status, g1.targetBastionId, g1.x, g1.y], ['IDLE', null, 0, 0], 'posée dans sa ville : elle ne compte plus dans la garnison');
    assert.match(res.body.message, /Cohorte n'a plus de soldats : elle est rentrée aussitôt à Roma et sa place au Bastion est libérée\./);
    assert.equal(db.count('g2'), 540);
  } finally { db.restore(); }
});
