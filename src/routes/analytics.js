// Analytics internes : entonnoir d'activation (ouverture, inscription, première construction…).
// Rien ne quitte le serveur ; les événements sont anonymisés à la suppression du compte.
const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const optionalAuth = require('../middleware/optionalAuth');
const rateLimit = require('../middleware/rateLimit');
const { safeEqual } = require('../utils/validation');

const EVENT_RE = /^[a-z0-9_.]{1,40}$/;
function cleanProps(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const out = {};
  for (const [k, v] of Object.entries(p).slice(0, 12)) {
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 80);
  }
  return Object.keys(out).length ? out : null;
}

// POST /api/analytics/events { events: [{ event, props, platform }] }
router.post('/events', optionalAuth, rateLimit(60, 'analytics'), async (req, res) => {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : [];
    const rows = events
      .filter(e => e && typeof e.event === 'string' && EVENT_RE.test(e.event))
      .map(e => ({ playerId: req.user?.playerId || null, event: e.event, props: cleanProps(e.props), platform: typeof e.platform === 'string' ? e.platform.slice(0, 16) : null }));
    if (rows.length) await prisma.analyticsEvent.createMany({ data: rows });
    res.json({ ok: true, stored: rows.length });
  } catch (e) { sendError(res, e); }
});

// GET /api/analytics/funnel?days=7 — comptes d'événements par type (clé d'administration requise)
router.get('/funnel', rateLimit(5, 'admin'), async (req, res) => {
  try {
    const key = process.env.ADMIN_KEY;
    if (!key || !safeEqual(req.headers['x-admin-key'], key)) return res.status(401).json({ error: 'Unauthorized' });
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const rows = await prisma.analyticsEvent.groupBy({ by: ['event'], where: { createdAt: { gte: since } }, _count: { _all: true } });
    const players = await prisma.analyticsEvent.groupBy({ by: ['event', 'playerId'], where: { createdAt: { gte: since }, playerId: { not: null } } });
    const uniques = {};
    for (const r of players) uniques[r.event] = (uniques[r.event] || 0) + 1;
    res.json({ days, events: rows.map(r => ({ event: r.event, count: r._count._all, players: uniques[r.event] || 0 })).sort((a, b) => b.count - a.count) });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
