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
