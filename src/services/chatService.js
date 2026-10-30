// ============================================================
// Messagerie (décision du 26 octobre 2026) : messages privés, chat d'alliance, chat global et canal des amis.
// Canal côté client : "global", "alliance", "friends" ou "private:<idJoueur>". Règles de l'App Store pour les contenus
// écrits par les joueurs : filtre de mots (data/chat-filter.json), signalement, blocage, coupure par la modération.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { hitShared } = require('../middleware/rateLimit');

const MAX_LENGTH = 500;
const PAGE = 50;
const RETENTION_DAYS = { GLOBAL: 7, OTHER: 90 };   // décision du 26 octobre 2026
const LIMITS = { minGapMs: 1500, perMinute: 15, duplicateWindowMs: 30000 };
const CHANNEL = { global: 'GLOBAL', alliance: 'ALLIANCE', friends: 'FRIENDS' };

const httpError = (status, error) => Object.assign(new Error(error), { status, expose: true });

// ---- texte ----
// Retours à la ligne gardés (deux au plus de suite), caractères de contrôle et d'inversion de sens retirés, 500 caractères
// au plus. Le texte est toujours affiché échappé par le client.
function cleanMessage(str) {
  if (typeof str !== 'string' || str.length > MAX_LENGTH * 2) return null;
  const t = str.replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t && t.length <= MAX_LENGTH ? t : null;
}

// Filtre de mots : la comparaison ignore la casse, les accents et les lettres répétées (« conaaard ») ; le mot est
// remplacé par autant d'étoiles que de lettres
let filterCache = null;
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function filterRegex() {
  if (filterCache) return filterCache;
  let words = [];
  try { words = require('../../data/chat-filter.json').words || []; } catch (e) { words = []; }
  const parts = words.map(w => fold(String(w)).trim()).filter(Boolean)
    .map(w => w.split(' ').map(word => [...word].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '+').join('')).join('[\\s._-]+'));
  filterCache = parts.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${parts.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu') : null;
  return filterCache;
}
function filterText(text) {
  const re = filterRegex();
  if (!re) return text;
  // on cherche dans le texte sans accents (même longueur lettre à lettre une fois les accents ôtés) et on masque l'original
  const folded = [...text].map(ch => fold(ch) || ch);
  const plain = folded.map(c => (c.length === 1 ? c : c[0])).join('');
  if (plain.length !== [...text].length) return text;
  const chars = [...text];
  plain.replace(re, (m, pre, word, offset) => {
    const start = offset + pre.length;
    for (let i = start; i < start + word.length; i++) if (/\S/.test(chars[i])) chars[i] = '*';
    return m;
  });
  return chars.join('');
}

// ---- canaux ----
const conversationKey = (a, b) => [a, b].sort().join(':');
// "global" | "alliance" | "friends" | "private:<id>" -> { channel, otherId? } ou null
function parseChannel(key) {
  if (typeof key !== 'string') return null;
  if (CHANNEL[key]) return { key, channel: CHANNEL[key] };
  const m = key.match(/^private:([\w-]{1,64})$/);
  return m ? { key, channel: 'PRIVATE', otherId: m[1] } : null;
}

async function blockedIds(playerId) {
  const rows = await prisma.playerBlock.findMany({ where: { blockerId: playerId }, select: { blockedId: true } });
  return rows.map(r => r.blockedId);
}
async function friendIds(playerId) {
  const rows = await prisma.friendship.findMany({ where: { status: 'ACCEPTED', OR: [{ requesterId: playerId }, { addresseeId: playerId }] }, select: { requesterId: true, addresseeId: true } });
  return rows.map(r => (r.requesterId === playerId ? r.addresseeId : r.requesterId));
}
async function allianceOf(playerId) {
  const m = await prisma.allianceMember.findUnique({ where: { playerId }, select: { allianceId: true, alliance: { select: { name: true, tag: true } } } });
  return m ? { id: m.allianceId, name: m.alliance.name, tag: m.alliance.tag } : null;
}

// Filtre Prisma des messages d'un canal que le joueur peut lire (null : il n'y a pas accès)
async function channelWhere(playerId, ch) {
  if (ch.channel === 'GLOBAL') return { channel: 'GLOBAL' };
  if (ch.channel === 'ALLIANCE') { const a = await allianceOf(playerId); return a ? { channel: 'ALLIANCE', allianceId: a.id } : null; }
  if (ch.channel === 'FRIENDS') return { channel: 'FRIENDS', senderId: { in: [playerId, ...await friendIds(playerId)] } };
  if (ch.otherId === playerId) return null;
  return { channel: 'PRIVATE', conversation: conversationKey(playerId, ch.otherId) };
}

// Le joueur peut-il lire ce message ?
async function canSee(playerId, msg) {
  if (msg.channel === 'GLOBAL') return true;
  if (msg.channel === 'ALLIANCE') return (await allianceOf(playerId))?.id === msg.allianceId;
  if (msg.channel === 'PRIVATE') return msg.senderId === playerId || msg.recipientId === playerId;
  if (msg.channel === 'FRIENDS') return msg.senderId === playerId || (await friendIds(playerId)).includes(msg.senderId);
  return false;
}

const senderSelect = { id: true, name: true, faction: true, alliance: { select: { alliance: { select: { tag: true } } } } };
// Message tel que le client le reçoit : le partage sans sa copie complète (demandée au clic, GET /messages/:id/share)
function toClient(m, playerId) {
  return {
    id: m.id, channel: m.channel, text: m.text, lang: m.lang || null, createdAt: m.createdAt, mine: m.senderId === playerId,
    sender: m.sender ? { id: m.sender.id, name: m.sender.name, faction: m.sender.faction, tag: m.sender.alliance?.alliance?.tag || null } : null,
    share: m.share ? { type: m.share.type, summary: m.share.summary || {} } : null
  };
}

// Messages d'un canal : les plus récents (ou ceux après `after` pour le relevé régulier, avant `before` pour remonter)
async function listMessages(playerId, key, { after, before, limit } = {}) {
  const ch = parseChannel(key);
  if (!ch) throw httpError(400, 'Canal inconnu');
  const where = await channelWhere(playerId, ch);
  if (!where) throw httpError(403, ch.channel === 'ALLIANCE' ? 'Rejoignez une alliance pour lire son chat' : 'Canal inaccessible');
  const blocked = await blockedIds(playerId);
  if (blocked.length) where.NOT = { senderId: { in: blocked } };
  const take = Math.max(1, Math.min(PAGE, Number(limit) || PAGE));
  const afterDate = after ? new Date(after) : null, beforeDate = before ? new Date(before) : null;
  if (afterDate && !isNaN(afterDate)) {
    where.createdAt = { gt: afterDate };
    const rows = await prisma.chatMessage.findMany({ where, orderBy: { createdAt: 'asc' }, take, include: { sender: { select: senderSelect } } });
    return rows.map(m => toClient(m, playerId));
  }
  if (beforeDate && !isNaN(beforeDate)) where.createdAt = { lt: beforeDate };
  const rows = await prisma.chatMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { sender: { select: senderSelect } } });
  return rows.reverse().map(m => toClient(m, playerId));
}

// ---- envoi ----
const lastSendAt = new Map();   // anti-rafale par processus ; la limite par minute est partagée en base
async function sendMessage(player, key, text, share) {
  const ch = parseChannel(key);
  if (!ch) throw httpError(400, 'Canal inconnu');
  const clean = cleanMessage(text);
  if (!clean && !share) throw httpError(400, `Message vide ou trop long (${MAX_LENGTH} caractères au plus)`);
  if (player.chatMutedUntil && new Date(player.chatMutedUntil) > new Date()) {
    throw httpError(403, `Messagerie suspendue par la modération jusqu'au ${new Date(player.chatMutedUntil).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  }
  const data = { channel: ch.channel, senderId: player.id, text: clean ? filterText(clean) : '', lang: player.chatLang || null, share: share || undefined };
  if (ch.channel === 'GLOBAL') {
    if (config.email.enforce) {
      const acc = await prisma.account.findFirst({ where: { player: { id: player.id } }, select: { emailVerifiedAt: true } });
      if (!acc?.emailVerifiedAt) throw httpError(403, 'Confirmez votre adresse e-mail pour écrire dans le chat global');
    }
  } else if (ch.channel === 'ALLIANCE') {
    const a = await allianceOf(player.id);
    if (!a) throw httpError(403, 'Rejoignez une alliance pour écrire dans son chat');
    data.allianceId = a.id;
  } else if (ch.channel === 'PRIVATE') {
    if (ch.otherId === player.id) throw httpError(400, 'Vous ne pouvez pas vous écrire à vous-même');
    const other = await prisma.player.findUnique({ where: { id: ch.otherId }, select: { id: true } });
    if (!other) throw httpError(404, 'Joueur introuvable');
    const block = await prisma.playerBlock.findFirst({ where: { OR: [{ blockerId: ch.otherId, blockedId: player.id }, { blockerId: player.id, blockedId: ch.otherId }] }, select: { blockerId: true } });
    if (block) throw httpError(403, block.blockerId === player.id ? 'Vous avez bloqué ce joueur : débloquez-le pour lui écrire' : 'Ce joueur ne reçoit pas vos messages');
    data.conversation = conversationKey(player.id, ch.otherId);
    data.recipientId = ch.otherId;
  }
  // limites de débit, comptées seulement pour un message valable (un refus ci-dessus ne coûte rien)
  const now = Date.now();
  if (now - (lastSendAt.get(player.id) || 0) < LIMITS.minGapMs) throw httpError(429, 'Doucement : attendez un instant entre deux messages');
  const { count } = await hitShared(`chat:${player.id}`, 60000).catch(() => ({ count: 0 }));
  if (count > LIMITS.perMinute) throw httpError(429, 'Trop de messages en une minute, patientez un peu');
  lastSendAt.set(player.id, now);
  if (lastSendAt.size > 50000) lastSendAt.clear();
  // le même message deux fois de suite dans le même canal : refusé (copier-coller en boucle)
  const last = await prisma.chatMessage.findFirst({ where: { senderId: player.id, channel: data.channel, allianceId: data.allianceId, conversation: data.conversation }, orderBy: { createdAt: 'desc' }, select: { text: true, createdAt: true, share: true } });
  if (last && data.text && last.text === data.text && !share && now - new Date(last.createdAt).getTime() < LIMITS.duplicateWindowMs) throw httpError(429, 'Message déjà envoyé');
  const msg = await prisma.chatMessage.create({ data, include: { sender: { select: senderSelect } } });
  return { msg, ch };
}

// ---- partages : une copie du rapport ou de la position, lisible par tout le canal ----
async function buildShare(playerId, share) {
  if (!share || typeof share !== 'object') return null;
  if (share.type === 'battle') {
    const r = await prisma.battleReport.findFirst({ where: { id: String(share.reportId || ''), playerId } });
    if (!r) throw httpError(404, 'Rapport introuvable (les rapports sont gardés 30 jours)');
    const l = r.loot || {};
    return { type: 'battle', summary: { reportId: r.id, x: r.x, y: r.y, result: r.result, winner: r.winner, attackerName: l.attackerName || null, defenderName: l.defenderName || null, cityName: l.cityName || null, kind: l.type || r.rounds?.type || null, createdAt: r.createdAt }, data: r };
  }
  if (share.type === 'spy') {
    const r = await prisma.spyReport.findFirst({ where: { id: String(share.reportId || ''), playerId } });
    if (!r) throw httpError(404, 'Rapport introuvable (les rapports sont gardés 30 jours)');
    return { type: 'spy', summary: { reportId: r.id, x: r.targetX, y: r.targetY, success: r.success, targetName: r.targetName, cityName: r.cityName, targetType: r.targetType, createdAt: r.createdAt }, data: r };
  }
  if (share.type === 'position') {
    const x = Number(share.x), y = Number(share.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < config.map.minCoord || x > config.map.maxCoord || y < config.map.minCoord || y > config.map.maxCoord) throw httpError(400, 'Position hors de la carte');
    // ce qu'il y a sur la case : une ville (ses 2 × 2 cases), un point de ressource, sinon la case seule
    const city = await prisma.city.findFirst({ where: { x: { in: [x - 1, x] }, y: { in: [y - 1, y] } }, select: { name: true, x: true, y: true, player: { select: { name: true } } } });
    const node = city ? null : await prisma.resourceNode.findFirst({ where: { x, y }, select: { resourceType: true, level: true } });
    const label = city ? `${city.name}${city.player ? ` (${city.player.name})` : ''}` : node ? `Point de ressource ${String(node.resourceType).toLowerCase()} niv. ${node.level}` : null;
    return { type: 'position', summary: { x: city ? city.x : x, y: city ? city.y : y, label: label ? label.slice(0, 80) : null } };
  }
  throw httpError(400, 'Partage inconnu');
}

// ---- non lus ----
async function markRead(playerId, key) {
  if (!parseChannel(key)) throw httpError(400, 'Canal inconnu');
  await prisma.chatRead.upsert({ where: { playerId_channelKey: { playerId, channelKey: key } }, update: { lastReadAt: new Date() }, create: { playerId, channelKey: key, lastReadAt: new Date() } });
}

// Vue d'ensemble : canaux, conversations privées (la dernière d'abord), messages non lus, demandes d'amis
async function overview(playerId) {
  const [reads, blocked, friends, alliance, requests] = await Promise.all([
    prisma.chatRead.findMany({ where: { playerId } }),
    blockedIds(playerId), friendIds(playerId), allianceOf(playerId),
    prisma.friendship.count({ where: { addresseeId: playerId, status: 'PENDING' } })
  ]);
  const readAt = (k) => reads.find(r => r.channelKey === k)?.lastReadAt || new Date(Date.now() - RETENTION_DAYS.GLOBAL * 86400000);
  const notMine = { senderId: { notIn: [playerId, ...blocked] } };
  // compte arrêté à 100 lignes : les badges plafonnent à 99 (sans cela, tout le chat global de 7 jours à chaque relevé)
  const count = (where) => prisma.chatMessage.count({ where: { ...where, AND: [notMine] }, take: 100 });
  const [globalUnread, allianceUnread, friendsUnread] = await Promise.all([
    count({ channel: 'GLOBAL', createdAt: { gt: readAt('global') } }),
    alliance ? count({ channel: 'ALLIANCE', allianceId: alliance.id, createdAt: { gt: readAt('alliance') } }) : 0,
    friends.length ? count({ channel: 'FRIENDS', senderId: { in: friends }, createdAt: { gt: readAt('friends') } }) : 0
  ]);
  // conversations privées : la dernière ligne de chacune, avec l'autre joueur
  const lastRows = await prisma.$queryRaw`
    SELECT DISTINCT ON (conversation) conversation, id, "senderId", "recipientId", text, share IS NOT NULL AS "hasShare", "createdAt"
    FROM "ChatMessage" WHERE channel = 'PRIVATE' AND ("senderId" = ${playerId} OR "recipientId" = ${playerId})
    ORDER BY conversation, "createdAt" DESC`;
  const others = [...new Set(lastRows.map(r => (r.senderId === playerId ? r.recipientId : r.senderId)))].filter(id => id && !blocked.includes(id));
  const people = others.length ? await prisma.player.findMany({ where: { id: { in: others } }, select: senderSelect }) : [];
  const unreadRows = others.length ? await prisma.$queryRaw`
    SELECT m."senderId" AS other, count(*)::int AS unread FROM "ChatMessage" m
    LEFT JOIN "ChatRead" r ON r."playerId" = ${playerId} AND r."channelKey" = 'private:' || m."senderId"
    WHERE m.channel = 'PRIVATE' AND m."recipientId" = ${playerId} AND m."createdAt" > COALESCE(r."lastReadAt", 'epoch'::timestamp)
    GROUP BY m."senderId"` : [];
  const conversations = lastRows
    .map(r => { const other = r.senderId === playerId ? r.recipientId : r.senderId; const p = people.find(q => q.id === other); return p && {
      key: `private:${other}`, player: { id: p.id, name: p.name, faction: p.faction, tag: p.alliance?.alliance?.tag || null },
      last: { text: r.text, share: r.hasShare, createdAt: r.createdAt, mine: r.senderId === playerId },
      unread: unreadRows.find(u => u.other === other)?.unread || 0 }; })
    .filter(Boolean).sort((a, b) => new Date(b.last.createdAt) - new Date(a.last.createdAt)).slice(0, 50);
  const cap = (n) => Math.min(99, n);
  const channels = [
    { key: 'global', unread: cap(globalUnread) },
    ...(alliance ? [{ key: 'alliance', unread: cap(allianceUnread), alliance }] : []),
    { key: 'friends', unread: cap(friendsUnread), friends: friends.length }
  ];
  // le badge de l'onglet : les messages qui s'adressent au joueur (privés, alliance, amis) ; le global ne compte pas
  const total = cap(allianceUnread + friendsUnread + conversations.reduce((s, c) => s + c.unread, 0));
  return { channels, conversations, unread: total, friendRequests: requests };
}

// ---- purge (boucle de jeu, une fois par heure) ----
async function purgeOldMessages(now = new Date()) {
  const days = (n) => new Date(now.getTime() - n * 86400000);
  const [g, o] = await Promise.all([
    prisma.chatMessage.deleteMany({ where: { channel: 'GLOBAL', createdAt: { lt: days(RETENTION_DAYS.GLOBAL) } } }),
    prisma.chatMessage.deleteMany({ where: { channel: { not: 'GLOBAL' }, createdAt: { lt: days(RETENTION_DAYS.OTHER) } } })
  ]);
  return g.count + o.count;
}

module.exports = { MAX_LENGTH, RETENTION_DAYS, LIMITS, cleanMessage, filterText, parseChannel, conversationKey, listMessages, sendMessage, buildShare, markRead, overview, canSee, friendIds, blockedIds, allianceOf, toClient, senderSelect, purgeOldMessages, httpError };
