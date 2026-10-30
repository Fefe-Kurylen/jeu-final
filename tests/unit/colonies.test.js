// Rôle des colonies (décisions du 30 octobre 2026, lot serveur) : bonus de gisement, prélèvement dans la ville la plus
// pleine, meilleur Comptoir pour toutes les villes, Mur sur l'enceinte (emplacement fixe), alertes d'aide au suivi, pas de
// garnison dans une nouvelle colonie, migration 0031, relance d'une transaction après un interblocage.
// Aucune requête réelle : le client Prisma est remplacé le temps d'un test.
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Prisma } = require('@prisma/client');
const config = require('../../src/config');
const { buildingsData } = require('../../src/config/gamedata');
const prisma = require('../../src/config/database');
const pushService = require('../../src/services/pushService');
const fx = require('../../src/utils/buildingEffects');
const db = require('../../src/utils/db');
const RP = require('../../src/game/processors/resourceProcessor');
const BP = require('../../src/game/processors/buildProcessor');
const MS = require('../../src/services/marketService');

const sqlOf = (strings, values = []) => Prisma.sql(strings, ...values);
// remplace des membres du client Prisma et les notifications ; renvoie de quoi tout remettre
function stub(over) {
  const saved = Object.fromEntries(Object.keys(over).map(k => [k, prisma[k]]));
  const savedNotify = pushService.notify;
  const notes = [];
  Object.assign(prisma, over);
  pushService.notify = (...args) => { notes.push(args); };
  return { notes, restore: () => { Object.assign(prisma, saved); pushService.notify = savedNotify; } };
}
const city = (id, stock, { cap = 10000, foodCap = cap } = {}) => ({ id, wood: stock, stone: stock, iron: stock, food: stock, maxStorage: cap, maxFoodStorage: foodCap });

// ---- 1. bonus de gisement ----
test('gisement : +15 % par niveau sur sa seule ressource, dans une colonie seulement (donnée de la Résidence)', () => {
  assert.equal(buildingsData.find(b => b.key === 'RESIDENCE').effects.colonyNodeBonusPctPerNodeLevel, 15);
  const colony = { isCapital: false, isWonder: false };
  for (const type of ['WOOD', 'STONE', 'IRON', 'FOOD']) {
    for (const level of [1, 2, 3]) assert.deepEqual(fx.citySite(colony, { resourceType: type, level }), { type, level, bonusPct: 15 * level }, `${type} ${level}`);
  }
  assert.equal(fx.citySite({ isCapital: true }, { resourceType: 'IRON', level: 3 }), null, 'pas de bonus pour la capitale');
  assert.equal(fx.citySite({ isCapital: false, isWonder: true }, { resourceType: 'WONDER', level: 3 }), null, 'ni pour la Ville Merveille');
  assert.equal(fx.citySite(colony, { resourceType: 'GOLD', level: 2 }), null);
  assert.equal(fx.citySite(colony, null), null);
  assert.equal(fx.colonyNodeBonusPct(undefined), 0);
});

test('gisement dans le tick : une ligne par ville, ajouté aux bâtiments de production, une seule source pour production et bilan', async () => {
  const site = RP.productionSql();
  assert.match(site.sql, /FROM "ResourceNode" rn JOIN "City" ci ON ci\.id = rn\."cityId" AND NOT ci\."isCapital" AND NOT ci\."isWonder"\s+GROUP BY rn\."cityId"/,
    'regroupé par ville : jamais une ville en double dans la jointure');
  for (const [col, r] of [['wb', 'w'], ['sb', 's'], ['ib', 'i'], ['fb', 'f']]) assert.match(site.sql, new RegExp(`COALESCE\\(p\\.${col}, 0\\) \\+ COALESCE\\(site\\.${r}, 0\\) AS ${col}`));
  for (const type of ['WOOD', 'STONE', 'IRON', 'FOOD']) assert.ok(site.values.includes(type), type);
  assert.ok(site.values.includes(fx.colonyNodeBonusPct(1)));
  assert.match(site.sql, /CASE WHEN ct\."isCapital" THEN 1 ELSE \? END/, 'puis le bonus des colonies, gardé');
  // le bilan de nourriture lit la même production : le gisement n'y est joint qu'une fois
  const balance = RP.foodBalanceSql().sql;
  assert.equal(balance.split('FROM "ResourceNode"').length - 1, 1);
  assert.match(balance, /pr\.food::float AS prod/);
  // le tick : une seule écriture pour toutes les villes, depuis cette production
  const writes = [];
  const s = stub({ $executeRaw: async (strings, ...values) => { writes.push(sqlOf(strings, values).sql); return 0; } });
  try { await RP.processResourceProduction(1 / 120); } finally { s.restore(); }
  assert.equal(writes.length, 1);
  assert.match(writes[0], /wood {2}= GREATEST\(c\.wood, {2}LEAST\(c\.wood {2}\+ pr\.wood {2}\* \?, c\."maxStorage"\)\)/);
  assert.equal(writes[0].split('FROM "ResourceNode"').length - 1, 1);
});

// ---- 8. prélèvement : la ville la plus pleine d'abord ----
test('dépense : après la ville de l\'action, la ville la plus pleine par rapport à son plafond (Dépôt, Silo pour les céréales)', () => {
  const cities = [city('act', 0), city('big', 9000, { cap: 100000 }), city('full', 900, { cap: 1000, foodCap: 100000 })];
  const plan = db.planDebit(cities, 'act', { wood: 1000, food: 1000 });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.takenByCity.full, { wood: 900, stone: 0, iron: 0, food: 0 }, 'bois : 90 % plein contre 9 % : la petite ville pleine d\'abord');
  assert.deepEqual(plan.takenByCity.big, { wood: 100, stone: 0, iron: 0, food: 1000 }, 'céréales : la grande ville (9 %) avant le Silo presque vide (0,9 %)');
  // à remplissage égal, la plus riche ; un plafond nul compte comme plein
  const tie = db.planDebit([city('a', 0), city('b', 100, { cap: 1000 }), city('c', 500, { cap: 5000 })], 'a', { stone: 50 });
  assert.deepEqual(Object.keys(tie.takenByCity), ['c']);
  const noCap = db.planDebit([city('a', 0), city('b', 100, { cap: 1000 }), city('z', 10, { cap: 0 })], 'a', { iron: 10 });
  assert.deepEqual(Object.keys(noCap.takenByCity), ['z']);
});

// ---- Comptoir : le meilleur des villes du joueur, pour toutes, sans somme ----
test('Comptoir : le meilleur niveau des villes du joueur vaut partout, capitale comprise, sans somme', async () => {
  assert.ok(fx.sharedKey('TRADE_OFFICE') && !fx.capitalOnly('TRADE_OFFICE'), 'partagé sans être réservé à la capitale');
  const cities = [
    { isCapital: true, buildings: [{ key: 'FORGE', level: 5 }, { key: 'TREASURE_CHAMBER', level: 4 }] },
    { isCapital: false, buildings: [{ key: 'TRADE_OFFICE', level: 3 }] },
    { isCapital: false, buildings: [{ key: 'TRADE_OFFICE', level: 6 }] }
  ];
  const shared = fx.capitalOf({ cities });
  assert.deepEqual(shared, [{ key: 'FORGE', level: 5 }, { key: 'TREASURE_CHAMBER', level: 4 }, { key: 'TRADE_OFFICE', level: 6 }]);
  const colony = [{ key: 'MARKET', level: 2 }, { key: 'TRADE_OFFICE', level: 3 }];
  const pct = (k) => fx.effectOf(k, k === 'MARKET' ? 'playerTransportBonusPctPerLevel' : 'armyTransportCapacityBonusPctPerLevel');
  assert.equal(fx.transportBonusPct(fx.withCapital(colony, shared)), 2 * pct('MARKET') + 6 * pct('TRADE_OFFICE'), 'le 6, pas 3 + 6');
  assert.equal(fx.transportBonusPct(fx.withCapital([], shared)), 6 * pct('TRADE_OFFICE'), 'la capitale aussi');
  // taxe des échanges : meilleur Comptoir des villes et Chambre au Trésor de la capitale
  const tx = {
    city: {
      findUnique: async () => ({ playerId: 'p1', buildings: [{ key: 'TRADE_OFFICE', level: 3 }] }),
      findMany: async ({ where }) => { assert.deepEqual(where, { playerId: 'p1' }); return cities; }
    }
  };
  const expected = config.market.p2pTaxPctBase - 6 * fx.effectOf('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel') - 4 * config.market.treasureTaxReductionPctPerLevel;
  assert.equal(await MS.p2pTaxPct(tx, 'col'), Math.round(expected * 100) / 100);
});

test('Comptoir dans la récolte : le meilleur niveau des villes du joueur (MAX), le Poste du désert de la capitale seulement', async () => {
  const H = require('../../src/game/processors/harvestProcessor');
  const reads = [];
  const s = stub({
    army: { findMany: async () => [] },
    $queryRaw: async (strings, ...values) => { reads.push(sqlOf(strings, values)); return []; }
  });
  try { await H.processHarvesting(new Date()); } finally { s.restore(); }
  const q = reads[0];
  assert.match(q.sql, /SELECT c\."playerId", MAX\(cb\.level\) AS level, MAX\(r\.pct\) AS pct FROM "CityBuilding" cb JOIN "City" c ON c\.id = cb\."cityId"\s+JOIN \(VALUES [^)]*\)[^A]*AS r\(key, pct, capital\) ON r\.key = cb\.key AND \(c\."isCapital" OR NOT r\.capital\)\s+GROUP BY c\."playerId", r\.key/);
  for (const k of ['MARKET', 'TRADE_OFFICE', 'SULTAN_DESERT_OUTPOST']) assert.ok(q.values.includes(k), k);
});

// ---- 6. Mur sur l'enceinte ----
test('Mur : emplacement fixe hors de l\'anneau et des champs ; jamais pris par un autre bâtiment', () => {
  const wall = config.city.wallSlot;
  assert.equal(wall, 20);
  assert.ok(wall > config.city.maxSlot && wall < Math.min(...Object.values(config.city.fieldSlots).flat()));
  const ring = Array.from({ length: config.city.maxSlot }, (_, i) => ({ slot: i + 1 }));
  assert.equal(BP.newBuildingSlot({ buildingKey: 'WALL', slot: 7 }, []), wall, 'le Mur va sur l\'enceinte, quel que soit l\'emplacement du chantier');
  assert.equal(BP.newBuildingSlot({ buildingKey: 'MARKET', slot: 19 }, ring), wall + 1, 'un autre bâtiment passe l\'emplacement du Mur');
  assert.equal(BP.newBuildingSlot({ buildingKey: 'SILO', slot: null }, [{ slot: 1 }, { slot: 2 }]), 3);
  assert.equal(BP.newBuildingSlot({ buildingKey: 'SILO', slot: 5 }, [{ slot: 1 }]), 5);
});

test('migration 0031 : colonnes des alertes, Mur et chantiers de Mur sur l\'emplacement 20, recherches et soins des colonies retirés', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../prisma/migrations/0031_colonies/migration.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE "City" ADD COLUMN IF NOT EXISTS "idleAlertAt" TIMESTAMP\(3\);/);
  assert.match(sql, /ALTER TABLE "City" ADD COLUMN IF NOT EXISTS "storageAlertAt" TIMESTAMP\(3\);/);
  assert.match(sql, new RegExp(`UPDATE "CityBuilding" b SET slot = ${config.city.wallSlot}\\s+WHERE b\\.key = 'WALL' AND b\\.slot <> ${config.city.wallSlot}`));
  assert.match(sql, new RegExp(`UPDATE "BuildQueueItem" SET slot = ${config.city.wallSlot} WHERE "buildingKey" = 'WALL' AND slot <> ${config.city.wallSlot};`));
  assert.match(sql, /generate_series\(1, 19\)/, 'un bâtiment égaré sur l\'emplacement 20 rejoint l\'anneau');
  assert.match(sql, /DELETE FROM "ResearchQueueItem" q USING "City" c WHERE c\.id = q\."cityId" AND NOT c\."isCapital";/);
  assert.match(sql, /UPDATE "WoundedUnit" w SET waiting = w\.waiting \+ w\.count, count = 0, "healsAt" = '9999-01-01 00:00:00'[\s\S]*NOT c\."isCapital" AND w\.count > 0;/);
  assert.equal(new Date('9999-01-01T00:00:00Z').getTime(), require('../../src/services/woundedService').NO_HEAL.getTime(), 'même échéance « personne au lit » que le serveur');
  assert.doesNotMatch(sql, /DROP|TRUNCATE/);
});

// ---- alertes ----
test('alerte « File de construction vide » : quand la file d\'une ville se vide, au plus une fois toutes les 6 h', async () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const asked = [], feed = [];
  let left = 0;
  // buildProcessor garde sa référence à pushService.notify : le fil de notifications (prisma.notification) est lu
  const s = stub({
    notification: { create: async ({ data }) => { feed.push(data); return { id: 'n' }; } },
    buildQueueItem: { findMany: async () => [{ id: 'q1', cityId: 'c1', buildingKey: 'SILO', slot: 4, targetLevel: 2, status: 'RUNNING' }], count: async () => left },
    city: { updateMany: async (q) => { asked.push(q); return { count: 1 }; } },
    $transaction: async (fn) => fn({
      $queryRaw: async () => [], $executeRaw: async () => 0,
      buildQueueItem: { deleteMany: async () => ({ count: 1 }), findMany: async () => [] },
      cityBuilding: { findMany: async () => [{ id: 'b', key: 'SILO', slot: 4, level: 1 }], update: async () => ({}) },
      city: { findUnique: async () => ({ playerId: 'p1', name: 'Colonie 1' }), update: async () => ({}) }
    })
  });
  const quests = require('../../src/services/questService');
  const savedBump = quests.bumpLater;
  quests.bumpLater = () => {};
  try {
    await BP.processBuilds(now);
    const idle = feed.filter(n => n.kind === 'build_idle');
    assert.equal(idle.length, 1);
    assert.deepEqual([idle[0].playerId, idle[0].title], ['p1', '🏗️ File de construction vide']);
    assert.match(idle[0].body, /^File de construction vide à Colonie 1/);
    assert.deepEqual([idle[0].link.to, idle[0].link.cityId], ['city', 'c1']);
    assert.equal(asked[0].where.OR[1].idleAlertAt.lt.getTime(), now.getTime() - config.city.idleAlertHours * 3600000);
    // un autre chantier attend encore : pas d'alerte
    left = 1;
    feed.length = 0;
    await BP.processBuilds(now);
    assert.equal(feed.filter(n => n.kind === 'build_idle').length, 0);
    assert.equal(feed.filter(n => n.kind === 'build_done').length, 1);
  } finally { s.restore(); quests.bumpLater = savedBump; }
});

test('alerte « dépôt plein dans 1 h » : le texte nomme les ressources, la ville est notée (12 h) puis prévenue', async () => {
  assert.equal(RP.storageAlertText({ name: 'Colonie 1', wood: true, stone: false, iron: true, food: true }),
    'Colonie 1 : dépôt plein dans 1 h (bois, fer) ; silo plein dans 1 h. Dépensez ou agrandissez le stockage.');
  assert.equal(RP.storageAlertText({ name: 'Rome', food: true }), 'Rome : silo plein dans 1 h. Dépensez ou agrandissez le stockage.');
  const now = new Date('2026-10-30T12:00:00Z');
  const noted = [];
  const s = stub({
    army: { findMany: async () => [] },
    $executeRaw: async () => 0,
    $queryRaw: async (strings, ...values) => (sqlOf(strings, values).sql.includes('"storageAlertAt"')
      ? [{ cityId: 'c1', playerId: 'p1', name: 'Colonie 1', wood: true, stone: false, iron: false, food: false }, { cityId: 'c2', playerId: 'p1', name: 'Colonie 2', wood: false, stone: true, iron: false, food: false }]
      : []),
    city: { updateMany: async (q) => { noted.push(q); return { count: q.where.id === 'c1' ? 1 : 0 }; } }
  });
  try {
    RP.resetFamineClock();
    await RP.processUpkeep(1 / 120, now);
    assert.deepEqual(noted.map(q => q.where.id), ['c1', 'c2']);
    assert.equal(noted[0].where.OR[1].storageAlertAt.lt.getTime(), now.getTime() - config.city.storageAlertHours * 3600000);
    assert.equal(s.notes.length, 1, 'Colonie 2 déjà prévenue entre-temps');
    assert.deepEqual(s.notes[0].slice(0, 3), ['p1', 'storage_full', '📦 Stock bientôt plein']);
    assert.deepEqual(s.notes[0][4], { to: 'city', cityId: 'c1' });
  } finally { s.restore(); RP.resetFamineClock(); }
});

test('alerte de famine : 12 h à l\'avance sur le total du joueur', async () => {
  assert.equal(config.army.famineAlertHours, 12);
  const run = async (food) => {
    const s = stub({
      army: { findMany: async () => [] },
      $executeRaw: async () => 0,
      $queryRaw: async (strings, ...values) => (sqlOf(strings, values).sql.includes('"storageAlertAt"') ? [] : [{ playerId: 'p1', food, prod: 100, cons: 200, reductionPct: 0 }]),
      city: { findFirst: async () => ({ id: 'cap' }), updateMany: async () => ({ count: 1 }) }
    });
    try { RP.resetFamineClock(); await RP.processUpkeep(1 / 120, new Date()); return s.notes.filter(n => n[1] === 'famine').length; } finally { s.restore(); RP.resetFamineClock(); }
  };
  assert.equal(await run(1100), 1, '11 h de nourriture : prévenu');
  assert.equal(await run(1300), 0, '13 h : pas encore');
});

// ---- pas de garnison dans une nouvelle colonie ----
test('fondation : la nouvelle colonie n\'a pas de garnison (seules les armées qu\'on y envoie la défendent)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/game/processors/armyProcessor.js'), 'utf8');
  const body = src.slice(src.indexOf('async function handleFoundComplete'), src.indexOf('function reportResult'));
  assert.ok(body.includes('tx.city.create'));
  assert.doesNotMatch(body, /isGarrison: true/);
});

// ---- interblocage : la transaction est relancée ----
test('withDeadlockRetry : relance après un interblocage (40P01, P2034), jamais pour une autre erreur', async () => {
  let calls = 0;
  const flaky = (err, failures) => async () => { calls++; if (calls <= failures) throw err; return 'ok'; };
  calls = 0;
  assert.equal(await db.withDeadlockRetry(flaky(Object.assign(new Error('Transaction failed'), { code: 'P2034' }), 2)), 'ok');
  assert.equal(calls, 3);
  calls = 0;
  assert.equal(await db.withDeadlockRetry(flaky(Object.assign(new Error('raw'), { code: 'P2010', meta: { code: '40P01' } }), 1)), 'ok');
  calls = 0;
  await assert.rejects(db.withDeadlockRetry(flaky(new Error('deadlock detected'), 5), 3), /deadlock detected/);
  assert.equal(calls, 3, '3 essais au plus');
  calls = 0;
  await assert.rejects(db.withDeadlockRetry(flaky(new Error('Ressources insuffisantes'), 1)), /Ressources insuffisantes/);
  assert.equal(calls, 1, 'une autre erreur remonte tout de suite');
});
