// ============================================================
// Messagerie (décision du 26 octobre 2026) : /api/chat (messages, traduction, signalement, blocage, réglages, modération)
// et /api/friends (amis : demande à accepter). Logique dans src/services/chatService.js.
// ============================================================
const express = require('express');
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const { safeEqual } = require('../utils/validation');
const chat = require('../services/chatService');
const translate = require('../services/translateService');
const { notify } = require('../services/pushService');

const router = express.Router();
const friends = express.Router();
const fail = (res, e) => (e.status && e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));
const me = (req) => prisma.player.findUnique({ where: { id: req.user.playerId }, select: { id: true, name: true, chatLang: true, chatAutoTranslate: true, chatMutedUntil: true } });

// GET /api/chat/overview — canaux, conversations, non lus, demandes d'amis, réglages de traduction
router.get('/overview', auth, async (req, res) => {
  try {
    const [o, p] = await Promise.all([chat.overview(req.user.playerId), me(req)]);
    res.json({ ...o, settings: { lang: p?.chatLang || null, autoTranslate: p?.chatAutoTranslate !== false, translation: translate.enabled() }, languages: translate.LANG_NAMES, maxLength: chat.MAX_LENGTH });
  } catch (e) { fail(res, e); }
});

// GET /api/chat/messages?channel=global|alliance|friends|private:<id>&after=<date>|before=<date>
router.get('/messages', auth, async (req, res) => {
  try {
    res.json({ messages: await chat.listMessages(req.user.playerId, String(req.query.channel || ''), { after: req.query.after, before: req.query.before, limit: req.query.limit }) });
  } catch (e) { fail(res, e); }
});

// POST /api/chat/messages { channel, text, share?: { type: battle|spy, reportId } | { type: position, x, y } }
router.post('/messages', auth, async (req, res) => {
  try {
    const player = await me(req);
    if (!player) return res.status(404).json({ error: 'Joueur introuvable' });
    const share = req.body?.share ? await chat.buildShare(player.id, req.body.share) : null;
    const { msg, ch } = await chat.sendMessage(player, String(req.body?.channel || ''), req.body?.text ?? '', share);
    // un message privé prévient son destinataire sur son téléphone (pas dans le fil du jeu : l'onglet Messages a son badge)
    if (ch.channel === 'PRIVATE') notify(ch.otherId, 'message', `Message de ${player.name}`, msg.text ? msg.text.slice(0, 140) : 'Partage', { to: 'chat', channel: `private:${player.id}` }, { feed: false });
    res.status(201).json({ message: chat.toClient(msg, player.id) });
  } catch (e) { fail(res, e); }
});

// GET /api/chat/players?q=<début du pseudo> — pour écrire à quelqu'un (8 joueurs au plus)
router.get('/players', auth, rateLimit(60, 'chatsearch'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2 || q.length > 20) return res.json({ players: [] });
    const rows = await prisma.player.findMany({ where: { name: { startsWith: q, mode: 'insensitive' }, NOT: { id: req.user.playerId } }, select: chat.senderSelect, orderBy: { name: 'asc' }, take: 8 });
    res.json({ players: rows.map(p => ({ id: p.id, name: p.name, faction: p.faction, tag: p.alliance?.alliance?.tag || null })) });
  } catch (e) { fail(res, e); }
});

// GET /api/chat/messages/:id/share — la copie complète du rapport partagé (lisible par qui voit le message)
router.get('/messages/:id/share', auth, async (req, res) => {
  try {
    const msg = await prisma.chatMessage.findUnique({ where: { id: String(req.params.id) } });
    if (!msg || !msg.share || !(await chat.canSee(req.user.playerId, msg))) return res.status(404).json({ error: 'Partage introuvable' });
    res.json({ type: msg.share.type, summary: msg.share.summary || {}, data: msg.share.data || null });
  } catch (e) { fail(res, e); }
});

// POST /api/chat/read { channel } — le canal est lu jusqu'à maintenant
router.post('/read', auth, async (req, res) => {
  try { await chat.markRead(req.user.playerId, String(req.body?.channel || '')); res.json({ ok: true }); } catch (e) { fail(res, e); }
});

// POST /api/chat/translate { ids: [...], lang? } — traductions des messages (gardées : un message n'est traduit qu'une fois
// par langue) ; { translations: { id: { text, from } } }, vide si la traduction n'est pas en service
router.post('/translate', auth, rateLimit(60, 'translate'), async (req, res) => {
  try {
    const player = await me(req);
    const lang = translate.normalizeLang(req.body?.lang || player?.chatLang);
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(String))].slice(0, 50) : [];
    if (!lang || !ids.length || !translate.enabled()) return res.json({ translations: {}, enabled: translate.enabled() });
    const msgs = await prisma.chatMessage.findMany({ where: { id: { in: ids } }, include: { translations: { where: { lang } } } });
    const visible = [];
    for (const m of msgs) if (await chat.canSee(player.id, m)) visible.push(m);
    const out = {};
    const todo = [];
    for (const m of visible) {
      if (m.translations[0]) out[m.id] = { text: m.translations[0].text, from: m.translations[0].fromLang };
      else if (m.text && m.lang !== lang) todo.push(m);
    }
    if (todo.length) {
      let results = null;
      try { results = await translate.translateTexts(todo.map(m => m.text), lang); } catch (err) { console.warn('[TRADUCTION]', err.message); }
      if (results) {
        await Promise.all(todo.map((m, i) => {
          const r = results[i];
          if (!r) return null;
          out[m.id] = { text: r.text, from: r.from };
          return prisma.chatTranslation.upsert({ where: { messageId_lang: { messageId: m.id, lang } }, update: {}, create: { messageId: m.id, lang, text: r.text, fromLang: r.from || null } }).catch(() => null);
        }));
      }
    }
    res.json({ translations: out, enabled: true });
  } catch (e) { fail(res, e); }
});

// PUT /api/chat/settings { lang, autoTranslate }
router.put('/settings', auth, async (req, res) => {
  try {
    const data = {};
    if (req.body?.lang !== undefined) {
      const lang = translate.normalizeLang(req.body.lang);
      if (!lang) return res.status(400).json({ error: 'Langue non proposée' });
      data.chatLang = lang;
    }
    if (req.body?.autoTranslate !== undefined) data.chatAutoTranslate = !!req.body.autoTranslate;
    await prisma.player.update({ where: { id: req.user.playerId }, data });
    res.json({ ok: true, ...data });
  } catch (e) { fail(res, e); }
});

// POST /api/chat/messages/:id/report { reason } — signalement à la modération
router.post('/messages/:id/report', auth, rateLimit(20, 'chatreport'), async (req, res) => {
  try {
    const msg = await prisma.chatMessage.findUnique({ where: { id: String(req.params.id) } });
    if (!msg || !(await chat.canSee(req.user.playerId, msg))) return res.status(404).json({ error: 'Message introuvable' });
    if (msg.senderId === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas signaler votre propre message' });
    const reason = String(req.body?.reason || 'autre').slice(0, 200);
    await prisma.chatReport.upsert({ where: { messageId_reporterId: { messageId: msg.id, reporterId: req.user.playerId } }, update: { reason }, create: { messageId: msg.id, reporterId: req.user.playerId, reason } });
    res.json({ message: 'Merci, le message a été signalé à la modération' });
  } catch (e) { fail(res, e); }
});

// Blocage
router.get('/blocks', auth, async (req, res) => {
  try {
    const rows = await prisma.playerBlock.findMany({ where: { blockerId: req.user.playerId }, include: { blocked: { select: { id: true, name: true, faction: true } } }, orderBy: { createdAt: 'desc' } });
    res.json({ blocks: rows.map(r => r.blocked) });
  } catch (e) { fail(res, e); }
});
router.post('/blocks/:playerId', auth, async (req, res) => {
  try {
    const target = String(req.params.playerId);
    if (target === req.user.playerId) return res.status(400).json({ error: 'Vous ne pouvez pas vous bloquer vous-même' });
    if (!(await prisma.player.findUnique({ where: { id: target }, select: { id: true } }))) return res.status(404).json({ error: 'Joueur introuvable' });
    await prisma.playerBlock.upsert({ where: { blockerId_blockedId: { blockerId: req.user.playerId, blockedId: target } }, update: {}, create: { blockerId: req.user.playerId, blockedId: target } });
    // bloquer, c'est aussi ne plus être amis
    await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: req.user.playerId, addresseeId: target }, { requesterId: target, addresseeId: req.user.playerId }] } });
    res.json({ message: 'Joueur bloqué : ses messages sont cachés et il ne peut plus vous écrire' });
  } catch (e) { fail(res, e); }
});
router.delete('/blocks/:playerId', auth, async (req, res) => {
  try {
    await prisma.playerBlock.deleteMany({ where: { blockerId: req.user.playerId, blockedId: String(req.params.playerId) } });
    res.json({ message: 'Joueur débloqué' });
  } catch (e) { fail(res, e); }
});

// ---- modération (clé d'administration, en-tête x-admin-key) ----
const admin = [rateLimit(30, 'admin'), (req, res, next) => {
  const key = process.env.ADMIN_KEY;
  if (!key || !safeEqual(req.headers['x-admin-key'], key)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}];
// GET /api/chat/admin/reports — signalements en attente, avec le message et son auteur
router.get('/admin/reports', ...admin, async (req, res) => {
  try {
    const rows = await prisma.chatReport.findMany({ where: { handledAt: null }, orderBy: { createdAt: 'asc' }, take: 100, include: { message: { include: { sender: { select: { id: true, name: true, chatMutedUntil: true } } } }, reporter: { select: { id: true, name: true } } } });
    res.json({ reports: rows.map(r => ({ id: r.id, reason: r.reason, createdAt: r.createdAt, reporter: r.reporter, message: { id: r.message.id, channel: r.message.channel, text: r.message.text, createdAt: r.message.createdAt, sender: r.message.sender } })) });
  } catch (e) { fail(res, e); }
});
// POST /api/chat/admin/reports/:id { action: dismiss | delete | mute, hours? } — mute supprime aussi le message
router.post('/admin/reports/:id', ...admin, async (req, res) => {
  try {
    const report = await prisma.chatReport.findUnique({ where: { id: String(req.params.id) }, include: { message: true } });
    if (!report) return res.status(404).json({ error: 'Signalement introuvable' });
    const action = String(req.body?.action || '');
    if (!['dismiss', 'delete', 'mute'].includes(action)) return res.status(400).json({ error: 'Action : dismiss, delete ou mute' });
    if (action === 'mute') {
      const hours = Math.max(1, Math.min(24 * 365, Number(req.body?.hours) || 24));
      await prisma.player.update({ where: { id: report.message.senderId }, data: { chatMutedUntil: new Date(Date.now() + hours * 3600000) } });
    }
    if (action === 'delete' || action === 'mute') {
      await prisma.chatMessage.delete({ where: { id: report.messageId } }).catch(() => null);   // ses signalements partent avec lui
      return res.json({ message: action === 'mute' ? 'Message supprimé, auteur réduit au silence' : 'Message supprimé' });
    }
    await prisma.chatReport.updateMany({ where: { messageId: report.messageId }, data: { handledAt: new Date(), action } });
    res.json({ message: 'Signalement classé' });
  } catch (e) { fail(res, e); }
});

// ---- amis (/api/friends) : une demande que l'autre accepte ----
const playerCard = { id: true, name: true, faction: true, lastSeenAt: true, alliance: { select: { alliance: { select: { tag: true } } } } };
const card = (p) => ({ id: p.id, name: p.name, faction: p.faction, tag: p.alliance?.alliance?.tag || null, lastSeenAt: p.lastSeenAt });
friends.get('/', auth, async (req, res) => {
  try {
    const id = req.user.playerId;
    const rows = await prisma.friendship.findMany({ where: { OR: [{ requesterId: id }, { addresseeId: id }] }, include: { requester: { select: playerCard }, addressee: { select: playerCard } }, orderBy: { createdAt: 'desc' } });
    res.json({
      friends: rows.filter(r => r.status === 'ACCEPTED').map(r => card(r.requesterId === id ? r.addressee : r.requester)),
      incoming: rows.filter(r => r.status === 'PENDING' && r.addresseeId === id).map(r => ({ id: r.id, player: card(r.requester), createdAt: r.createdAt })),
      outgoing: rows.filter(r => r.status === 'PENDING' && r.requesterId === id).map(r => ({ id: r.id, player: card(r.addressee), createdAt: r.createdAt }))
    });
  } catch (e) { fail(res, e); }
});
// POST /api/friends/requests { playerId } ou { name }
friends.post('/requests', auth, rateLimit(30, 'friendreq'), async (req, res) => {
  try {
    const id = req.user.playerId;
    const target = req.body?.playerId
      ? await prisma.player.findUnique({ where: { id: String(req.body.playerId) }, select: { id: true, name: true } })
      : await prisma.player.findFirst({ where: { name: { equals: String(req.body?.name || '').trim(), mode: 'insensitive' } }, select: { id: true, name: true } });
    if (!target) return res.status(404).json({ error: 'Aucun joueur de ce nom' });
    if (target.id === id) return res.status(400).json({ error: 'Vous ne pouvez pas vous ajouter vous-même' });
    const blocked = await prisma.playerBlock.findFirst({ where: { OR: [{ blockerId: id, blockedId: target.id }, { blockerId: target.id, blockedId: id }] } });
    if (blocked) return res.status(403).json({ error: blocked.blockerId === id ? 'Vous avez bloqué ce joueur' : 'Ce joueur ne reçoit pas vos demandes' });
    const existing = await prisma.friendship.findFirst({ where: { OR: [{ requesterId: id, addresseeId: target.id }, { requesterId: target.id, addresseeId: id }] } });
    if (existing?.status === 'ACCEPTED') return res.status(400).json({ error: 'Vous êtes déjà amis' });
    if (existing && existing.requesterId === target.id) {
      // il vous avait déjà demandé : la demande croisée vaut acceptation
      await prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      notify(target.id, 'friend', 'Nouvel ami', `${(await me(req))?.name} a accepté votre demande d'ami`, { to: 'chat', channel: 'friends' });
      return res.json({ message: `${target.name} et vous êtes maintenant amis`, status: 'ACCEPTED' });
    }
    if (existing) return res.status(400).json({ error: 'Demande déjà envoyée' });
    await prisma.friendship.create({ data: { requesterId: id, addresseeId: target.id } });
    notify(target.id, 'friend', 'Demande d\'ami', `${(await me(req))?.name} vous propose d'être amis`, { to: 'chat', channel: 'friends' });
    res.status(201).json({ message: `Demande envoyée à ${target.name}`, status: 'PENDING' });
  } catch (e) { fail(res, e); }
});
friends.post('/requests/:id/accept', auth, async (req, res) => {
  try {
    const r = await prisma.friendship.findUnique({ where: { id: String(req.params.id) } });
    if (!r || r.addresseeId !== req.user.playerId || r.status !== 'PENDING') return res.status(404).json({ error: 'Demande introuvable' });
    await prisma.friendship.update({ where: { id: r.id }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
    notify(r.requesterId, 'friend', 'Nouvel ami', `${(await me(req))?.name} a accepté votre demande d'ami`, { to: 'chat', channel: 'friends' });
    res.json({ message: 'Demande acceptée' });
  } catch (e) { fail(res, e); }
});
// DELETE /api/friends/requests/:id — refuser (destinataire) ou retirer (auteur) une demande
friends.delete('/requests/:id', auth, async (req, res) => {
  try {
    const n = await prisma.friendship.deleteMany({ where: { id: String(req.params.id), status: 'PENDING', OR: [{ requesterId: req.user.playerId }, { addresseeId: req.user.playerId }] } });
    if (!n.count) return res.status(404).json({ error: 'Demande introuvable' });
    res.json({ message: 'Demande retirée' });
  } catch (e) { fail(res, e); }
});
// DELETE /api/friends/:playerId — ne plus être amis
friends.delete('/:playerId', auth, async (req, res) => {
  try {
    const id = req.user.playerId, other = String(req.params.playerId);
    await prisma.friendship.deleteMany({ where: { OR: [{ requesterId: id, addresseeId: other }, { requesterId: other, addresseeId: id }] } });
    res.json({ message: 'Retiré de vos amis' });
  } catch (e) { fail(res, e); }
});

module.exports = router;
module.exports.friends = friends;
