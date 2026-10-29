// ============================================================
// Administration (décision du 29 octobre 2026)
// - Rôles sur le compte : PLAYER, MODERATOR, ADMIN. Le premier administrateur est nommé en ligne de commande
//   (node tools/admin.cjs <e-mail ou pseudo> ADMIN), les suivants depuis l'écran d'administration.
// - Modérateur : signalements du chat, silence, suspension jusqu'à 7 jours, fiches des joueurs.
//   Administrateur : en plus, bannissement, suspensions plus longues, le monde (calendrier, fin, monde suivant), l'équipe.
// - Sanctions, gardées d'un monde à l'autre : silence du chat (Player.chatMutedUntil), suspension de 1 à 30 jours
//   (connexion refusée, les villes restent attaquables, comme Travian), bannissement définitif. Chacune a un motif que le
//   joueur voit en se connectant. Toute action de l'équipe est écrite au journal (AdminLog).
// ============================================================
const prisma = require('../config/database');

const ROLES = ['PLAYER', 'MODERATOR', 'ADMIN'];
const RANK = { PLAYER: 0, MODERATOR: 1, ADMIN: 2 };
const LIMITS = { muteHours: 24 * 30, suspendDays: 30, moderatorSuspendDays: 7 };
// droit -> rôle minimal
const PERMS = {
  reports: 'MODERATOR', players: 'MODERATOR', mute: 'MODERATOR', suspend: 'MODERATOR', log: 'MODERATOR',
  ban: 'ADMIN', world: 'ADMIN', team: 'ADMIN', email: 'ADMIN', announce: 'ADMIN', stats: 'ADMIN'
};
const can = (role, perm) => (RANK[role] || 0) >= (RANK[PERMS[perm]] ?? 99);
const isStaff = (role) => (RANK[role] || 0) >= RANK.MODERATOR;

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

// Sanction en cours d'un compte (ce qui empêche de jouer), ou null
function activeSanction(account, now = new Date()) {
  if (!account) return null;
  if (account.bannedAt) return { kind: 'BAN', reason: account.banReason || '', since: account.bannedAt, until: null };
  if (account.suspendedUntil && new Date(account.suspendedUntil) > now) return { kind: 'SUSPEND', reason: account.suspendReason || '', until: account.suspendedUntil };
  return null;
}
function sanctionMessage(s) {
  if (!s) return null;
  if (s.kind === 'BAN') return `Ce compte est banni${s.reason ? ` : ${s.reason}` : ''}.`;
  const until = new Date(s.until).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  return `Ce compte est suspendu jusqu'au ${until}${s.reason ? ` : ${s.reason}` : ''}.`;
}

async function writeLog(db, actor, action, target, details) {
  await db.adminLog.create({ data: { actorId: actor?.accountId || null, actorName: actor?.name || 'système', action, targetId: target?.accountId || null, targetName: target?.name || null, details: details || undefined } });
}

// L'auteur d'une action (compte + pseudo + rôle), relu en base à chaque requête : un rôle retiré prend effet tout de suite
async function staffOf(accountId) {
  const acc = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, role: true, bannedAt: true, player: { select: { id: true, name: true } } } });
  if (!acc || acc.bannedAt) return null;
  return { accountId: acc.id, role: acc.role, name: acc.player?.name || '?', playerId: acc.player?.id || null };
}

// Cible d'une sanction : un joueur (par son id), avec son compte
async function targetOf(playerId) {
  const p = await prisma.player.findUnique({ where: { id: String(playerId) }, select: { id: true, name: true, chatMutedUntil: true, account: { select: { id: true, role: true, bannedAt: true, suspendedUntil: true } } } });
  if (!p) throw httpError(404, 'Joueur introuvable');
  return { playerId: p.id, name: p.name, accountId: p.account.id, role: p.account.role, account: p.account, chatMutedUntil: p.chatMutedUntil };
}
function cleanReason(reason) {
  const r = String(reason || '').trim().replace(/\s+/g, ' ');
  if (r.length < 3) throw httpError(400, 'Indiquez un motif (3 caractères au moins)');
  return r.slice(0, 300);
}

// Sanctionner : kind MUTE (hours), SUSPEND (days), BAN
async function sanction(actor, playerId, { kind, hours, days, reason }) {
  const target = await targetOf(playerId);
  if (target.accountId === actor.accountId) throw httpError(400, 'Vous ne pouvez pas vous sanctionner vous-même');
  if ((RANK[target.role] || 0) >= (RANK[actor.role] || 0)) throw httpError(403, 'Ce membre de l\'équipe a un rôle égal ou supérieur au vôtre');
  const motive = cleanReason(reason);
  const now = new Date();
  let details;
  if (kind === 'MUTE') {
    if (!can(actor.role, 'mute')) throw httpError(403, 'Droit insuffisant');
    const h = Math.round(Number(hours));
    if (!(h >= 1 && h <= LIMITS.muteHours)) throw httpError(400, `Durée du silence : 1 à ${LIMITS.muteHours} heures`);
    const until = new Date(now.getTime() + h * 3600000);
    await prisma.$transaction(async (tx) => {
      await tx.player.update({ where: { id: target.playerId }, data: { chatMutedUntil: until } });
      await writeLog(tx, actor, 'MUTE', target, details = { hours: h, until, reason: motive });
    });
    await require('./pushService').notify(target.playerId, 'moderation', 'Messagerie coupée', `La modération a coupé votre messagerie jusqu'au ${until.toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })} : ${motive}`, { to: 'chat' });
  } else if (kind === 'SUSPEND') {
    if (!can(actor.role, 'suspend')) throw httpError(403, 'Droit insuffisant');
    const max = actor.role === 'ADMIN' ? LIMITS.suspendDays : LIMITS.moderatorSuspendDays;
    const d = Math.round(Number(days));
    if (!(d >= 1 && d <= max)) throw httpError(400, `Durée de la suspension : 1 à ${max} jours${actor.role !== 'ADMIN' ? ' (au-delà, un administrateur)' : ''}`);
    const until = new Date(now.getTime() + d * 86400000);
    await prisma.$transaction(async (tx) => {
      // les jetons en cours ne valent plus : le joueur est déconnecté et voit le motif en se reconnectant
      await tx.account.update({ where: { id: target.accountId }, data: { suspendedUntil: until, suspendReason: motive, tokenVersion: { increment: 1 } } });
      await writeLog(tx, actor, 'SUSPEND', target, details = { days: d, until, reason: motive });
    });
  } else if (kind === 'BAN') {
    if (!can(actor.role, 'ban')) throw httpError(403, 'Seul un administrateur peut bannir');
    await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: target.accountId }, data: { bannedAt: now, banReason: motive, role: 'PLAYER', tokenVersion: { increment: 1 } } });
      await writeLog(tx, actor, 'BAN', target, details = { reason: motive });
    });
  } else throw httpError(400, 'Sanction : MUTE, SUSPEND ou BAN');
  require('../middleware/auth').forgetPlayer(target.playerId);
  return { message: `${target.name} : ${kind === 'MUTE' ? 'messagerie coupée' : kind === 'SUSPEND' ? 'compte suspendu' : 'compte banni'}`, details };
}

// Lever une sanction : MUTE, SUSPEND, BAN
async function lift(actor, playerId, kind) {
  const target = await targetOf(playerId);
  const perm = kind === 'BAN' ? 'ban' : kind === 'SUSPEND' ? 'suspend' : 'mute';
  if (!['MUTE', 'SUSPEND', 'BAN'].includes(kind)) throw httpError(400, 'Sanction : MUTE, SUSPEND ou BAN');
  if (!can(actor.role, perm)) throw httpError(403, kind === 'BAN' ? 'Seul un administrateur peut lever un bannissement' : 'Droit insuffisant');
  await prisma.$transaction(async (tx) => {
    if (kind === 'MUTE') await tx.player.update({ where: { id: target.playerId }, data: { chatMutedUntil: null } });
    if (kind === 'SUSPEND') await tx.account.update({ where: { id: target.accountId }, data: { suspendedUntil: null, suspendReason: null } });
    if (kind === 'BAN') await tx.account.update({ where: { id: target.accountId }, data: { bannedAt: null, banReason: null } });
    await writeLog(tx, actor, `LIFT_${kind}`, target, null);
  });
  require('../middleware/auth').forgetPlayer(target.playerId);
  return { message: `${target.name} : ${kind === 'MUTE' ? 'messagerie rendue' : kind === 'SUSPEND' ? 'suspension levée' : 'bannissement levé'}` };
}

// Équipe : nommer ou retirer (administrateurs seulement) ; le dernier administrateur ne peut pas se retirer
async function setRole(actor, playerId, role) {
  if (!can(actor.role, 'team')) throw httpError(403, 'Seul un administrateur gère l\'équipe');
  if (!ROLES.includes(role)) throw httpError(400, 'Rôle : PLAYER, MODERATOR ou ADMIN');
  const target = await targetOf(playerId);
  if (target.account.bannedAt) throw httpError(400, 'Ce compte est banni');
  if (target.role === role) return { message: `${target.name} a déjà ce rôle` };
  if (target.role === 'ADMIN' && role !== 'ADMIN' && (await prisma.account.count({ where: { role: 'ADMIN' } })) <= 1) throw httpError(400, 'Il faut garder au moins un administrateur');
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: target.accountId }, data: { role } });
    await writeLog(tx, actor, 'ROLE', target, { from: target.role, to: role });
  });
  const label = { PLAYER: 'joueur', MODERATOR: 'modérateur', ADMIN: 'administrateur' }[role];
  if (role !== 'PLAYER') await require('./pushService').notify(target.playerId, 'moderation', 'Équipe du jeu', `Vous êtes maintenant ${label} : l'écran d'administration est dans les paramètres.`, { to: 'admin', tab: 'admin' });
  return { message: `${target.name} est maintenant ${label}` };
}

module.exports = { ROLES, RANK, LIMITS, PERMS, can, isStaff, activeSanction, sanctionMessage, writeLog, staffOf, targetOf, sanction, lift, setRole, httpError, cleanReason };
