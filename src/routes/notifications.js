// Fil de notifications dans le jeu (décision du 25 octobre 2026) : chaque alerte est d'abord un message du jeu, avec un
// lien vers ce qu'elle concerne (services/pushService.normalizeLink) ; le push mobile en découle.
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { sendError } = require('../utils/httpError');
const { isId } = require('../utils/db');

// GET /api/notifications?limit=50&before=<id> — latest first, with the unread count
router.get('/', auth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 50));
    // cursor = the last notification of the previous page (same order: createdAt then id, both descending)
    let after = {};
    if (req.query.before !== undefined) {
      if (typeof req.query.before !== 'string' || !isId(req.query.before)) return res.status(400).json({ error: 'Curseur invalide' });
      const ref = await prisma.notification.findFirst({ where: { id: req.query.before, playerId: req.user.playerId }, select: { id: true, createdAt: true } });
      if (!ref) return res.json({ items: [], unread: await prisma.notification.count({ where: { playerId: req.user.playerId, readAt: null } }) });
      after = { OR: [{ createdAt: { lt: ref.createdAt } }, { createdAt: ref.createdAt, id: { lt: ref.id } }] };
    }
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { playerId: req.user.playerId, ...after }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit }),
      prisma.notification.count({ where: { playerId: req.user.playerId, readAt: null } })
    ]);
    res.json({ items, unread });
  } catch (e) { sendError(res, e); }
});

// GET /api/notifications/unread — just the count (polled with the game refresh)
router.get('/unread', auth, async (req, res) => {
  try {
    const [unread, latest] = await Promise.all([
      prisma.notification.count({ where: { playerId: req.user.playerId, readAt: null } }),
      prisma.notification.findFirst({ where: { playerId: req.user.playerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true } })
    ]);
    res.json({ unread, latest });
  } catch (e) { sendError(res, e); }
});

// POST /api/notifications/read { ids: [...] } or { all: true }
router.post('/read', auth, async (req, res) => {
  try {
    const { ids, all } = req.body || {};
    const where = { playerId: req.user.playerId, readAt: null };
    if (all !== true) {
      if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every(id => typeof id === 'string' && isId(id))) return res.status(400).json({ error: 'Notifications invalides' });
      where.id = { in: ids };
    }
    const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    const unread = await prisma.notification.count({ where: { playerId: req.user.playerId, readAt: null } });
    res.json({ marked: r.count, unread });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
