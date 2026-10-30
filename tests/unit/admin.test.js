// Administration (décision du 29 octobre 2026) : droits des rôles, sanctions en cours, motif, réglages du calendrier
require('./_env');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://unit:unit@localhost:5432/unit';   // le client Prisma est créé, jamais interrogé
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../src/services/adminService');
const W = require('../../src/services/wonderService');
const { world } = require('../../src/config');

test('droits : le modérateur modère, l\'administrateur fait tout, le joueur rien', () => {
  for (const p of ['reports', 'players', 'mute', 'suspend', 'log']) { assert.equal(A.can('MODERATOR', p), true, p); assert.equal(A.can('PLAYER', p), false, p); }
  for (const p of ['ban', 'world', 'team', 'email']) { assert.equal(A.can('MODERATOR', p), false, p); assert.equal(A.can('ADMIN', p), true, p); }
  assert.equal(A.isStaff('PLAYER'), false);
  assert.equal(A.isStaff('MODERATOR'), true);
  assert.equal(A.can('ADMIN', 'inconnu'), false);
  assert.equal(A.LIMITS.moderatorSuspendDays, 7);
  assert.equal(A.LIMITS.suspendDays, 30);
});

test('sanction en cours : bannissement d\'abord, suspension tant qu\'elle court', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  assert.equal(A.activeSanction(null, now), null);
  assert.equal(A.activeSanction({}, now), null);
  assert.equal(A.activeSanction({ suspendedUntil: new Date('2026-10-28T12:00:00Z') }, now), null);
  const s = A.activeSanction({ suspendedUntil: new Date('2026-11-01T12:00:00Z'), suspendReason: 'insultes' }, now);
  assert.equal(s.kind, 'SUSPEND');
  assert.match(A.sanctionMessage(s), /suspendu jusqu'au .* : insultes\./);
  const b = A.activeSanction({ bannedAt: now, banReason: 'triche', suspendedUntil: new Date('2026-11-01T12:00:00Z') }, now);
  assert.equal(b.kind, 'BAN');
  assert.equal(A.sanctionMessage(b), 'Ce compte est banni : triche.');
});

test('motif : 3 caractères au moins, 300 au plus, espaces resserrés', () => {
  assert.throws(() => A.cleanReason('  a '), /motif/);
  assert.equal(A.cleanReason('  trop   de  spam '), 'trop de spam');
  assert.equal(A.cleanReason('x'.repeat(400)).length, 300);
});

test('calendrier : réglages de l\'équipe, sinon ceux du serveur ; inscriptions fermées à la main', () => {
  const opened = new Date('2026-01-01T00:00:00Z');
  const def = W.phaseOf({ readyAt: opened }, opened, 1);
  assert.equal(def.settings.wonderSitesDay, world.wonderSitesDay);
  const custom = W.phaseOf({ readyAt: opened, wonderSitesDay: 90, registrationDays: 30 }, new Date(opened.getTime() + 40 * 86400000), 1);
  assert.equal(custom.settings.wonderSitesDay, 90);
  assert.equal(custom.wonderSitesAt.getTime(), opened.getTime() + 89 * 86400000);
  assert.equal(custom.registration.open, false);   // jour 41 > 30 jours
  const closed = W.phaseOf({ readyAt: opened, registrationClosed: true }, opened, 1);
  assert.equal(closed.registration.open, false);
  assert.equal(closed.registration.closedByStaff, true);
});

// ---- base factice : le client Prisma est remplacé le temps d'un test (aucune requête réelle) ----
const prisma = require('../../src/config/database');
const pushService = require('../../src/services/pushService');
function fakeDb(accounts) {
  const saved = { player: prisma.player, account: prisma.account, $transaction: prisma.$transaction };
  const savedNotify = pushService.notify;
  pushService.notify = async () => {};   // pas de notification écrite en base
  const logs = [];
  let lock = Promise.resolve();   // pg_advisory_xact_lock : tenu jusqu'à la fin de la transaction
  const accountRow = (id) => accounts[id] && { role: accounts[id].role, bannedAt: accounts[id].bannedAt || null };
  const account = {
    findUnique: async ({ where }) => accountRow(where.id),
    count: async ({ where }) => Object.values(accounts).filter(a => a.role === where.role).length,
    update: async ({ where, data }) => Object.assign(accounts[where.id], data)
  };
  prisma.player = {
    findUnique: async ({ where }) => {
      const [id, a] = Object.entries(accounts).find(([, a]) => a.playerId === where.id) || [];
      return a && { id: a.playerId, name: a.name, chatMutedUntil: a.chatMutedUntil || null, account: { id, role: a.role, bannedAt: a.bannedAt || null, suspendedUntil: a.suspendedUntil || null } };
    }
  };
  prisma.account = account;
  prisma.$transaction = async (fn) => {
    let release = () => {};
    const tx = {
      $executeRaw: async () => { const prev = lock; lock = new Promise(r => { release = r; }); await prev; },
      account,
      player: { update: async ({ where, data }) => Object.assign(Object.values(accounts).find(a => a.playerId === where.id), data) },
      adminLog: { create: async ({ data }) => logs.push(data) }
    };
    try { return await fn(tx); } finally { release(); }
  };
  return { logs, restore: () => { Object.assign(prisma, saved); pushService.notify = savedNotify; } };
}

test('lever une sanction : ni soi-même, ni un membre de l\'équipe de rôle égal ou supérieur', async () => {
  const accounts = {
    a1: { role: 'ADMIN', playerId: 'p-a1', name: 'Auguste' },
    m1: { role: 'MODERATOR', playerId: 'p-m1', name: 'Marcus', chatMutedUntil: new Date(Date.now() + 86400000) },
    m2: { role: 'MODERATOR', playerId: 'p-m2', name: 'Livia', suspendedUntil: new Date(Date.now() + 86400000) },
    j1: { role: 'PLAYER', playerId: 'p-j1', name: 'Titus', chatMutedUntil: new Date(Date.now() + 86400000) }
  };
  const db = fakeDb(accounts);
  try {
    const M1 = { accountId: 'm1', role: 'MODERATOR', name: 'Marcus' }, A1 = { accountId: 'a1', role: 'ADMIN', name: 'Auguste' };
    await assert.rejects(A.lift(M1, 'p-m1', 'MUTE'), (e) => e.status === 400 && /vos propres sanctions/.test(e.message));   // le silence mis par un administrateur reste
    await assert.rejects(A.lift(M1, 'p-m2', 'SUSPEND'), (e) => e.status === 403);   // un modérateur ne lève rien sur un autre modérateur
    assert.ok(accounts.m1.chatMutedUntil && accounts.m2.suspendedUntil);
    assert.equal(db.logs.length, 0);
    await A.lift(M1, 'p-j1', 'MUTE');   // un joueur : oui
    assert.equal(accounts.j1.chatMutedUntil, null);
    await A.lift(A1, 'p-m1', 'MUTE');   // l'administrateur sur un modérateur : oui
    assert.equal(accounts.m1.chatMutedUntil, null);
    assert.deepEqual(db.logs.map(l => l.action), ['LIFT_MUTE', 'LIFT_MUTE']);
  } finally { db.restore(); }
});

test('rôles : deux administrateurs qui se retirent en même temps en laissent un', async () => {
  const accounts = { a1: { role: 'ADMIN', playerId: 'p-a1', name: 'Auguste' }, a2: { role: 'ADMIN', playerId: 'p-a2', name: 'Hadrien' } };
  const db = fakeDb(accounts);
  try {
    const A1 = { accountId: 'a1', role: 'ADMIN', name: 'Auguste' }, A2 = { accountId: 'a2', role: 'ADMIN', name: 'Hadrien' };
    const r = await Promise.allSettled([A.setRole(A1, 'p-a2', 'PLAYER'), A.setRole(A2, 'p-a1', 'PLAYER')]);
    assert.deepEqual(r.map(x => x.status).sort(), ['fulfilled', 'rejected']);
    assert.equal(Object.values(accounts).filter(a => a.role === 'ADMIN').length, 1);
    // chacun se retire lui-même en même temps : le second est refusé
    accounts.a1.role = 'ADMIN'; accounts.a2.role = 'ADMIN';
    const r2 = await Promise.allSettled([A.setRole(A1, 'p-a1', 'MODERATOR'), A.setRole(A2, 'p-a2', 'MODERATOR')]);
    assert.deepEqual(r2.map(x => x.status).sort(), ['fulfilled', 'rejected']);
    assert.match(r2.find(x => x.status === 'rejected').reason.message, /au moins un administrateur/);
    assert.equal(Object.values(accounts).filter(a => a.role === 'ADMIN').length, 1);
    // le rôle de la cible est relu dans la transaction : déjà joueur, rien n'est écrit
    const before = db.logs.length;
    const admin = Object.keys(accounts).find(k => accounts[k].role === 'ADMIN');
    const other = admin === 'a1' ? 'a2' : 'a1';
    const res = await A.setRole({ accountId: admin, role: 'ADMIN', name: '?' }, accounts[other].playerId, 'MODERATOR');
    assert.match(res.message, /déjà ce rôle/);
    assert.equal(db.logs.length, before);
  } finally { db.restore(); }
});

test('statistiques : 30 jours de Paris consécutifs, même autour des changements d\'heure', () => {
  const S = require('../../src/services/statsService');
  const check = (now, last, mustHave) => {
    const k = S.dayKeys(new Date(now));
    assert.equal(k.length, S.DAYS, now);
    assert.equal(new Set(k).size, S.DAYS, now);
    assert.equal(k[k.length - 1], last, now);
    for (let i = 1; i < k.length; i++) assert.equal(Date.parse(k[i]) - Date.parse(k[i - 1]), 86400000, `${now} ${k[i - 1]} -> ${k[i]}`);
    assert.ok(k.includes(mustHave), `${now} ${mustHave}`);
  };
  check('2027-04-01T22:30:00Z', '2027-04-02', '2027-03-28');   // 00 h 30 à Paris, heure d'été : le jour du passage reste
  check('2026-11-15T22:30:00Z', '2026-11-15', '2026-10-25');   // 23 h 30 à Paris, heure d'hiver : 30 jours, pas 29
  check('2026-07-01T10:00:00Z', '2026-07-01', '2026-06-02');
});

test('monde suivant en préparation : ni inscription ni arrivée ; la carte du processus suit la graine en base', async () => {
  const Terrain = require('../../frontend/js/shared/terrain.js');
  const open = { id: 1, seed: Terrain.worldSeed, generator: Terrain.generator, readyAt: new Date(Date.now() - 86400000), number: 2 };
  const db = (row) => ({ worldConfig: { findUnique: async () => row }, player: { count: async () => 10 } });
  assert.equal(await W.registrationBlocked(db(null)), W.PREPARING);   // remise à zéro en cours (plus de ligne)
  assert.equal(await W.registrationBlocked(db({ ...open, readyAt: null })), W.PREPARING);   // nouvelle carte pas encore ouverte
  assert.equal(await W.registrationBlocked(db({ ...open, resetRequestedAt: new Date() })), W.PREPARING);   // demandé, pas encore fait
  assert.equal(await W.registrationBlocked(db(open)), null);
  assert.match(await W.registrationBlocked(db({ ...open, endedAt: new Date() })), /terminé/);
  // worker HTTP pas encore à jour : la carte est relue avant de placer une capitale
  const before = Terrain.worldSeed;
  try {
    const seed = before === 4242 ? 4243 : 4242;
    assert.equal(await W.registrationBlocked(db({ ...open, seed, generator: Terrain.generatorFor(seed) })), null);
    assert.equal(Terrain.worldSeed, seed);
    // une carte que ce code ne sait pas dessiner : refusée, la carte du processus ne bouge pas
    assert.equal(await W.registrationBlocked(db({ ...open, seed: 777, generator: 99 })), W.PREPARING);
    assert.equal(Terrain.worldSeed, seed);
  } finally { Terrain.setWorldSeed(before); }
});
