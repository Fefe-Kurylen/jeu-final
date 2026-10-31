// Décisions du 31 octobre 2026 (rapport de vérification) : or des expéditions seulement avec le héros (D4), prix de
// l'élite (D5), défi d'alliance par membre (D11), colonie neuve protégée 72 h (D12)
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const prisma = require('../../src/config/database');
const { rollGold } = require('../../src/game/processors/expeditionProcessor');
const { protectedUntil, protectionRefusal, remainingText } = require('../../src/utils/colonyProtection');
const { checkHostileTarget } = require('../../src/routes/armies');
const { processArmyMovements } = require('../../src/game/processors/armyProcessor');
const C = require('../../src/services/challengeService');

const HOUR = 3600000;
// tirages fixés à l'avance (0 à 1), dans l'ordre
const draws = (...values) => () => values.shift();

// ---- D4 : or des expéditions ----
test('expédition : de l\'or seulement quand le héros la mène (config.expedition.gold)', () => {
  const G = config.expedition.gold;
  assert.deepEqual({ ...G }, { chance: 0.5, base: 10, perDifficulty: 10, spread: 0.5 });
  const hero = { talents: {} };
  for (let d = 1; d <= 4; d++) assert.equal(rollGold(null, d, () => 0), 0, 'sans héros : jamais d\'or');
  assert.equal(rollGold(hero, 2, draws(0.5)), 0, 'une chance sur deux : 0,5 ne passe pas');
  // montant tiré entre la moitié et une fois et demie de 10 + 10 × difficulté
  assert.equal(rollGold(hero, 1, draws(0, 0)), 10);
  assert.equal(rollGold(hero, 1, draws(0, 0.5)), 20);
  assert.equal(rollGold(hero, 4, draws(0.49, 0.9999)), 75);
  // talent Chasseur de trésors : +5 % par rang
  assert.equal(rollGold({ talents: { i_treasure: 3 } }, 4, draws(0, 0.5)), Math.round(50 * 1.15));
});

test('expédition : 10 / 15 / 20 / 25 or espérés pour les difficultés 1 à 4 (contre 50 / 75 / 60 / 37,5 avant)', () => {
  const hero = { talents: {} };
  const N = 4000;
  for (let d = 1; d <= 4; d++) {
    // grille régulière de tirages : moyenne exacte de la règle, sans hasard
    let sum = 0;
    for (let i = 0; i < N; i++) sum += rollGold(hero, d, draws((i % 2) * 0.5 + 0.25, ((i >> 1) + 0.5) / (N / 2)));
    assert.ok(Math.abs(sum / N - (5 + 5 * d)) < 0.05, `difficulté ${d} : ${sum / N}`);
  }
});

// ---- D5 : prix de l'élite ----
test('élite : 2 or par unité et ressources × 0,85 ; soin immédiat 1 / 2 / 3 / 3 or', () => {
  assert.equal(config.recruit.goldPerUnit.elite, 2);
  assert.equal(config.recruit.eliteResourceCostMult, 0.85);
  assert.deepEqual({ ...config.wounded.instantHealGoldPerTier }, { base: 1, intermediate: 2, elite: 3, siege: 3 });
});

// ---- D11 : défi d'alliance par membre ----
test('défi d\'alliance : score = total ÷ max(membres comptés, 20), à 0,1 près ; récompenses inchangées', async () => {
  assert.equal(config.alliance.challengeMinMembers, 20);
  assert.deepEqual(C.REWARD_POINTS, [750, 500, 250]);
  const calls = [];
  const saved = prisma.$queryRawUnsafe;
  prisma.$queryRawUnsafe = async (sql, ...args) => { calls.push({ sql, args }); return []; };
  try {
    for (const theme of ['ATTACK', 'CLIMB', 'HELP']) await C.scores('2026-10-26', theme, 5);
    assert.deepEqual(await C.scores('2026-10-26', 'NOPE'), []);
  } finally { prisma.$queryRawUnsafe = saved; }
  assert.equal(calls.length, 3);
  const deadline = C.joinDeadline('2026-10-26');
  for (const [i, d] of [[0, '$2'], [1, '$2'], [2, '$9']].entries()) {
    const { sql, args } = calls[i];
    // membres comptés : ceux arrivés avant la limite, même sans points cette semaine
    assert.ok(sql.includes(`JOIN (SELECT "allianceId", COUNT(*)::int AS members FROM "AllianceMember" WHERE "joinedAt" < ${d[1]} GROUP BY "allianceId") mc`), `thème ${i}`);
    assert.match(sql, /::numeric \/ GREATEST\(mc\.members, 20\), 1\)::float AS value/);
    assert.match(sql, /ORDER BY value DESC, total DESC, a\.tag LIMIT 5/);
    assert.equal(args[args.length - 1].getTime(), deadline.getTime());
  }
});

test('défi d\'alliance : à la clôture, médaille au score arrondi et texte « par membre »', async () => {
  const medals = [], notes = [];
  const saved = { q: prisma.$queryRawUnsafe, am: prisma.allianceMember, p: prisma.player, m: prisma.medal, n: prisma.notification, t: prisma.$transaction };
  Object.assign(prisma, {
    $queryRawUnsafe: async () => [{ allianceId: 'A1', tag: 'ABC', name: 'Alpha', total: 251, members: 20, value: 12.6 }],
    allianceMember: { findMany: async () => [{ playerId: 'p1' }] },
    player: { updateMany: (q) => q },
    medal: { create: (q) => { medals.push(q.data); return q; } },
    notification: { create: async ({ data }) => { notes.push(data); return { id: 'n' }; } },
    $transaction: async (ops) => ops
  });
  try { await C.close('2026-10-26'); await new Promise(r => setImmediate(r)); } finally {
    Object.assign(prisma, { $queryRawUnsafe: saved.q, allianceMember: saved.am, player: saved.p, medal: saved.m, notification: saved.n, $transaction: saved.t });
  }
  assert.equal(medals[0].value, 13);
  assert.match(notes[0].body, /12,6 \S+ par membre/);
});

// ---- D12 : colonie neuve protégée 72 h ----
test('colonie neuve : protégée 72 h après sa fondation ; ni la capitale ni la Ville Merveille', () => {
  assert.equal(config.city.newColonyProtectionHours, 72);
  const now = new Date('2026-10-31T12:00:00Z');
  const founded = (hoursAgo, extra = {}) => ({ isCapital: false, isWonder: false, createdAt: new Date(now - hoursAgo * HOUR), ...extra });
  assert.equal(protectedUntil(founded(1), now).toISOString(), '2026-11-03T11:00:00.000Z');
  assert.equal(protectedUntil(founded(72), now), null, 'fin pile à 72 h');
  assert.equal(protectedUntil(founded(100), now), null);
  assert.equal(protectedUntil(founded(1, { isCapital: true }), now), null);
  assert.equal(protectedUntil(founded(1, { isWonder: true }), now), null);
  assert.equal(protectedUntil(null, now), null);
  assert.equal(remainingText(new Date(now.getTime() + 53 * HOUR), now), '2 j 5 h');
  assert.equal(remainingText(new Date(now.getTime() + 48 * HOUR), now), '2 j');
  assert.equal(remainingText(new Date(now.getTime() + 5.2 * HOUR), now), '5 h 12 min');
  assert.equal(remainingText(new Date(now.getTime() + 30 * 1000), now), '1 min');
  assert.match(protectionRefusal(founded(1), now), /^Colonie protégée encore 2 j 23 h : une colonie neuve ne peut être ni attaquée, ni pillée, ni assiégée pendant 72 h/);
  assert.equal(protectionRefusal(founded(80), now), null);
});

// base factice d'un envoi : pas d'alliance, aucun raid récent
const sendDb = { allianceMember: { findUnique: async () => null }, battleReport: { findFirst: async () => null }, army: { count: async () => 0 } };
const attacker = { id: 'a1', ownerId: 'p1', units: [{ unitKey: 'ROM_INF_LEGIONNAIRE', count: 50 }] };

test('envoi : attaque, raid et siège refusés vers une colonie protégée (« Colonie protégée encore … »)', async () => {
  const colony = { id: 'c2', playerId: 'p2', isCapital: false, isWonder: false, createdAt: new Date(Date.now() - 2 * HOUR) };
  for (const mission of ['ATTACK', 'RAID']) assert.match(await checkHostileTarget(attacker, colony, mission, sendDb), /^Colonie protégée encore 2 j 2[12] h/, mission);
  // protection finie : le raid part, l'attaque demande toujours un engin
  const old = { ...colony, createdAt: new Date(Date.now() - 73 * HOUR) };
  assert.equal(await checkHostileTarget(attacker, old, 'RAID', sendDb), null);
  assert.match(await checkHostileTarget(attacker, old, 'ATTACK', sendDb), /Pas de siège sans engin/);
  // une capitale neuve n'est pas protégée
  assert.equal(await checkHostileTarget(attacker, { ...colony, isCapital: true }, 'RAID', sendDb), null);
  // ses propres villes : le refus habituel passe avant
  assert.equal(await checkHostileTarget(attacker, { ...colony, playerId: 'p1' }, 'RAID', sendDb), 'Vous ne pouvez pas cibler vos propres villes');
});

// arrivée : une armée en route vers une colonie encore protégée fait demi-tour (sans combat, sans camp), les deux joueurs
// sont prévenus. Base factice : l'armée n'a pas de ville (elle se pose), la colonie est fondée depuis 2 h
async function arrive(status, missionType) {
  const now = new Date();
  const colony = { id: 'c2', name: 'Ostia', x: 10, y: 10, playerId: 'p2', isCapital: false, isWonder: false, createdAt: new Date(now - 2 * HOUR), armies: [], buildings: [], player: { id: 'p2', name: 'Brutus', faction: 'ROME' } };
  const army = { id: 'a1', name: 'Légion I', ownerId: 'p1', cityId: null, status, missionType, targetCityId: 'c2', x: 0, y: 0, targetX: 10, targetY: 10, arrivalAt: now, claimedAt: null, units: [{ unitKey: 'ROM_INF_LEGIONNAIRE', count: 50 }], owner: { name: 'César', faction: 'ROME' } };
  const updates = [], notes = [], writes = [];
  const tx = {
    $queryRaw: async () => [],
    city: { findUnique: async () => colony, update: async (q) => { writes.push(q); } },
    army: { findMany: async () => [], updateMany: async (q) => { writes.push(q); return { count: 1 }; } },
    allianceMember: { findUnique: async () => null },
    battleReport: { findFirst: async () => null, create: async (q) => { writes.push(q); return { id: 'r' }; } },
    armyUnit: { findMany: async () => army.units }
  };
  const saved = { army: prisma.army, city: prisma.city, notification: prisma.notification, $transaction: prisma.$transaction };
  Object.assign(prisma, {
    army: { findMany: async ({ where }) => (where.claimedAt === null ? [army] : []), updateMany: async () => ({ count: 1 }), update: async (q) => { updates.push(q.data); return q.data; } },
    city: { findUnique: async () => null },
    notification: { create: async ({ data }) => { notes.push(data); return { id: 'n' }; } },
    $transaction: async (fn) => fn(tx)
  });
  try { await processArmyMovements(now); await new Promise(r => setImmediate(r)); } finally { Object.assign(prisma, saved); }
  return { updates, notes, writes };
}

test('arrivée : une attaque en route vers une colonie protégée ne campe pas, elle fait demi-tour', async () => {
  const { updates, notes, writes } = await arrive('ATTACKING', 'ATTACK');
  assert.equal(writes.length, 0, 'ni camp, ni ville assiégée');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'IDLE', 'l\'armée sans ville se pose (avec une ville, elle rentre)');
  const toAttacker = notes.find(n => n.playerId === 'p1'), toColony = notes.find(n => n.playerId === 'p2');
  assert.match(toAttacker.body, /Légion I fait demi-tour devant Ostia : la colonie est protégée encore 2 j 2[12] h/);
  assert.match(toColony.body, /a fait demi-tour : votre colonie neuve est encore protégée/);
});

test('arrivée : un raid en route vers une colonie protégée ne pille pas, il fait demi-tour', async () => {
  const { updates, notes, writes } = await arrive('RAIDING', 'RAID');
  assert.equal(writes.length, 0, 'ni combat, ni rapport, ni pillage');
  assert.equal(updates[0].status, 'IDLE');
  assert.match(notes.find(n => n.playerId === 'p1').body, /fait demi-tour devant Ostia : la colonie est protégée encore/);
  assert.match(notes.find(n => n.playerId === 'p2').body, /renonce au raid sur Ostia : votre colonie neuve est encore protégée/);
});

test('arrivée : une attaque sur un point où une colonie vient d\'être fondée ne combat pas, l\'armée fait demi-tour', async () => {
  const now = new Date();
  const node = { id: 'n1', x: 10, y: 10, resourceType: 'IRON', cityId: 'c2', hasDefenders: false, hasPlayerArmy: false };
  const army = { id: 'a1', name: 'Légion I', ownerId: 'p1', cityId: null, status: 'RAIDING', missionType: 'RAID_RESOURCE', targetResourceId: 'n1', x: 0, y: 0, targetX: 10, targetY: 10, arrivalAt: now, claimedAt: null, units: [], owner: { name: 'César', faction: 'ROME' } };
  const updates = [], notes = [];
  const saved = { army: prisma.army, city: prisma.city, resourceNode: prisma.resourceNode, notification: prisma.notification, $transaction: prisma.$transaction };
  Object.assign(prisma, {
    army: { findMany: async ({ where }) => (where.claimedAt === null ? [army] : []), updateMany: async () => ({ count: 1 }), update: async (q) => { updates.push(q.data); return q.data; } },
    city: { findUnique: async () => null },
    resourceNode: { findUnique: async () => node },
    notification: { create: async ({ data }) => { notes.push(data); return { id: 'n' }; } },
    $transaction: async (fn) => fn({ resourceNode: { findUnique: async () => node } })
  });
  try { await processArmyMovements(now); await new Promise(r => setImmediate(r)); } finally { Object.assign(prisma, saved); }
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'IDLE');
  assert.match(notes[0].body, /Légion I fait demi-tour : une colonie a été fondée en \(10, 10\) pendant sa marche/);
});

// carte : chaque ville du rayon dit jusqu'à quand elle est protégée (protectedUntil, null sinon) ; vue d'ensemble (rayon > 60)
test('carte : les villes du rayon donnent protectedUntil (date de fin pour une colonie neuve, null sinon)', async () => {
  const mapRouter = require('../../src/routes/map');
  const handler = mapRouter.stack.find(l => l.route && l.route.path === '/map/viewport' && l.route.methods.get).route.stack.at(-1).handle;
  const now = Date.now();
  const row = (id, extra) => ({ id, name: id, x: 1, y: 1, isCapital: false, isSieged: false, wallStructure: 1, isWonder: false, wonderLevel: 0, playerId: 'p2', buildings: [], player: { id: 'p2', name: 'Brutus', faction: 'ROME', population: 10 }, createdAt: new Date(now - 10 * HOUR), ...extra });
  let asked = null;
  const saved = prisma.city;
  prisma.city = { findMany: async (q) => { asked = q; return [row('neuve'), row('vieille', { createdAt: new Date(now - 100 * HOUR) }), row('capitale', { isCapital: true }), row('merveille', { isWonder: true })]; } };
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  try { await handler({ query: { x: '1', y: '1', radius: '80' }, user: { playerId: 'me' } }, res); } finally { prisma.city = saved; }
  assert.equal(res.statusCode, 200);
  assert.equal(asked.select.createdAt, true);
  const by = Object.fromEntries(res.body.cities.map(c => [c.id, c.protectedUntil]));
  assert.equal(new Date(by.neuve).getTime(), now - 10 * HOUR + 72 * HOUR);
  assert.deepEqual([by.vieille, by.capitale, by.merveille], [null, null, null]);
});

// « Mes villes » et vue de la ville : GET /api/cities donne aussi la fin de la protection de chaque ville (null sinon)
test('GET /api/cities : protectedUntil pour une colonie neuve, null pour une vieille colonie, la capitale et la Ville Merveille', async () => {
  const citiesRouter = require('../../src/routes/cities');
  const handler = citiesRouter.stack.find(l => l.route && l.route.path === '/' && l.route.methods.get).route.stack.at(-1).handle;
  const now = Date.now();
  const city = (id, hoursAgo, extra = {}) => ({ id, name: id, playerId: 'p1', isCapital: false, isWonder: false, createdAt: new Date(now - hoursAgo * HOUR), wood: 0, stone: 0, iron: 0, food: 0, maxStorage: 1000, maxFoodStorage: 1000, wallStructure: 1, buildings: [], buildQueue: [], recruitQueue: [], armies: [], ...extra });
  const tables = {
    buildQueueItem: { count: async () => 0 }, recruitQueueItem: { count: async () => 0 },
    city: { findMany: async () => [city('cap', 1, { isCapital: true }), city('neuve', 10), city('vieille', 100), city('merveille', 1, { isWonder: true })] },
    $queryRaw: async () => [], army: { findMany: async () => [] }, resourceNode: { findMany: async () => [] }, player: { findUnique: async () => ({ faction: 'ROME' }) }
  };
  const saved = Object.fromEntries(Object.keys(tables).map(k => [k, prisma[k]]));
  Object.assign(prisma, tables);
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  try { await handler({ user: { playerId: 'p1' } }, res); } finally { Object.assign(prisma, saved); }
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const by = Object.fromEntries(res.body.map(c => [c.id, c.protectedUntil]));
  assert.equal(new Date(by.neuve).getTime(), now - 10 * HOUR + 72 * HOUR);
  assert.deepEqual([by.cap, by.vieille, by.merveille], [null, null, null]);
  // envoyé en JSON : une date ISO
  assert.match(JSON.parse(JSON.stringify(res.body)).find(c => c.id === 'neuve').protectedUntil, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

// ---- client : défi par membre, armée du héros pour les expéditions ----
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* acorn vient avec eslint (dépendance de dev) */ }
const skipClient = acorn ? false : 'acorn absent';
const APP = path.join(__dirname, '..', '..', 'frontend', 'js', 'app');
// les déclarations de premier niveau d'un fichier du client qui portent ces noms
function pickClient(file, names) {
  const code = fs.readFileSync(path.join(APP, file), 'utf8');
  const found = new Map();
  for (const node of acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' }).body) {
    const name = node.type === 'FunctionDeclaration' ? node.id.name : node.type === 'VariableDeclaration' ? node.declarations[0].id.name : null;
    if (names.includes(name)) found.set(name, code.slice(node.start, node.end));
  }
  assert.deepEqual([...found.keys()].sort(), [...names].sort());
  return [...found.values()].join('\n');
}

test('client : le défi affiche le score par membre (à 0,1 près) et la règle des 20 membres', { skip: skipClient }, () => {
  const ctx = vm.createContext({ resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatTime: () => 'bientôt', chatSafeId: s => String(s) });
  vm.runInContext(pickClient('06b-research.js', ['fmtTechPct']), ctx);
  vm.runInContext(pickClient('10-modals-misc.js', ['formatNum']), ctx);
  vm.runInContext(pickClient('09h-ranking.js', ['challengeScore', 'challengeCardHtml', 'rowHtml', 'medalIcon']), ctx);
  const html = ctx.challengeCardHtml({ label: 'Assaut', what: 'points d\'attaque gagnés par les membres', unit: 'pts', endsAt: '2026-11-02T00:00:00Z', rewards: [750, 500, 250], minMembers: 20,
    rows: [{ rank: 1, allianceId: 'A1', tag: 'ABC', name: 'Alpha', value: 12.6, mine: true }, { rank: 2, allianceId: 'A2', tag: 'BIG', name: 'Géants', value: 1250.5 }], me: { inAlliance: true, rank: 1, value: 12.6, eligible: true } });
  assert.match(html, /divisés par le nombre de membres \(20 au moins : une alliance plus petite compte comme si elle en avait 20\)/);
  assert.match(html, /<strong>1re<\/strong> · 12,6 pts par membre/);
  assert.match(html, /ranking-value">12,6 pts par membre</);
  assert.match(html, /ranking-value">1\.3K pts par membre</);   // grands scores : format court habituel
});

test('client : la vue de la ville montre la protection d\'une colonie neuve (décompte), et la cache ensuite', { skip: skipClient }, () => {
  const now = Date.parse('2026-10-31T12:00:00Z');
  const el = { style: { display: 'none' }, dataset: {}, innerHTML: '' };
  let toast = null;
  const ctx = vm.createContext({
    serverNow: () => now, resIconHtml: n => `[${n}]`, escapeHtml: s => String(s), formatTime: () => '2j 23h', showToast: (msg) => { toast = msg; },
    document: { getElementById: (id) => (id === 'city-protection-badge' ? el : null) },
    currentCity: { id: 'col', isCapital: false, protectedUntil: '2026-11-03T11:00:00.000Z' }
  });
  vm.runInContext(pickClient('06c-colonies.js', ['PROTECTION_TEXT', 'protectionEndMs', 'protectionHtml', 'updateCityProtectionBadge', 'showCityProtectionInfo', 'countdownHtml']), ctx);
  ctx.updateCityProtectionBadge();
  assert.equal(el.style.display, '');
  assert.match(el.innerHTML, /^<span class="protect-badge" title="Colonie neuve : [^"]+">\[defense\] Protégée encore <span class="qd-timer" data-ends-at="2026-11-03T11:00:00.000Z">2j 23h<\/span><\/span>$/);
  ctx.showCityProtectionInfo();
  assert.match(toast, /ni attaque, ni raid, ni siège.*les espions passent.*Ses armées sortent librement/);
  // protection finie, ou capitale (le serveur donne null) : pas de pastille
  ctx.currentCity = { id: 'col', protectedUntil: '2026-10-31T11:59:00.000Z' };
  ctx.updateCityProtectionBadge();
  assert.equal(el.style.display, 'none');
  ctx.currentCity = { id: 'cap', isCapital: true, protectedUntil: null };
  ctx.updateCityProtectionBadge();
  assert.equal(el.style.display, 'none');
});

test('client : une expédition part avec l\'armée du héros quand elle est prête (seul le héros rapporte de l\'or)', { skip: skipClient }, async () => {
  let body = null, toast = null;
  const cap = { x: 0, y: 0 }, col = { x: 10, y: 10 };
  const ctx = vm.createContext({
    API: '', token: 't', console, JSON, showToast(msg) { toast = msg; }, loadArmies: async () => {}, loadExpeditions() {},
    fetch: async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({}) }; },
    currentCity: { id: 'cap' },
    armies: [
      { id: 'here', status: 'IDLE', isGarrison: false, cityId: 'cap', city: cap, x: 0, y: 0, units: [{ count: 10 }] },
      { id: 'garrison', status: 'IDLE', isGarrison: true, cityId: 'cap', city: cap, x: 0, y: 0, heroId: 'h0', units: [{ count: 99 }] },
      { id: 'hero', status: 'IDLE', isGarrison: false, cityId: 'col', city: col, x: 10, y: 10, heroId: 'h1', units: [{ count: 5 }] }
    ]
  });
  vm.runInContext(pickClient('08-hero.js', ['expeditionArmies', 'startExpedition']), ctx);
  await ctx.startExpedition('e1');
  assert.deepEqual(body, { armyId: 'hero' });
  // l'armée du héros posée hors de sa ville : le serveur la refuserait, celle de la ville affichée part
  Object.assign(ctx.armies[2], { x: 12, y: 10 });
  await ctx.startExpedition('e2');
  assert.deepEqual(body, { armyId: 'here' });
  // sans armée du héros prête : celle de la ville affichée
  Object.assign(ctx.armies[2], { x: 10, y: 10, status: 'EXPEDITION' });
  await ctx.startExpedition('e3');
  assert.deepEqual(body, { armyId: 'here' });
  // aucune armée dans sa ville : rien ne part
  body = null;
  Object.assign(ctx.armies[0], { x: 5, y: 5 });
  await ctx.startExpedition('e4');
  assert.equal(body, null);
  assert.equal(toast, 'Aucune armée disponible');
});
